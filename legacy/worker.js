import {createSqlStore} from './sql-store.js';
import { optionsFor } from './public/questions.js';
import { activeDefinition, catalog, cleanDefinition, definitionFor } from './questionnaire-store.js';

const headers = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
  'content-security-policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {...headers, 'content-type': 'application/json; charset=utf-8'},
});
const error = (message, status) => json({error: message}, status);
const now = () => new Date().toISOString();

function clean(payload, definition, complete = false) {
  const questions = definition?.questions;
  if (!questions || typeof payload.name !== 'string' ||
      !Number.isInteger(payload.step) || payload.step < 0 || payload.step > questions.length + 1 ||
      !payload.answers || typeof payload.answers !== 'object' || Array.isArray(payload.answers)) return null;

  const name = payload.name.trim();
  if (name.length > 60 || (complete && !name)) return null;
  const answers = {};
  for (const question of questions) {
    const answer = payload.answers[question.id];
    if (!answer && (!complete || question.optional)) continue;
    if (!answer || !Array.isArray(answer.choices) || typeof answer.comment !== 'string' || answer.comment.length > 2000) return null;
    const choices = [...new Set(answer.choices)];
    const available = optionsFor(question);
    if (choices.some(choice => typeof choice !== 'string' || !Object.hasOwn(available, choice)) ||
        (choices.length > 1 && (choices.includes('none') || choices.includes('unknown'))) ||
        (question.kind === 'matrix' && new Set(choices.map(choice => choice.split('-')[0])).size !== choices.length) ||
        (complete && !question.optional && !choices.length && !answer.comment.trim())) return null;
    answers[question.id] = {choices, comment: answer.comment.trim()};
  }
  return {version: definition.version, name, step: payload.step, answers};
}

async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let raw = '';
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1000000) {
      await reader.cancel();
      return null;
    }
    raw += decoder.decode(value, {stream: true});
  }
  try { return JSON.parse(raw + decoder.decode()); } catch { return null; }
}

const responseEntry = (row, id) => ({
  ...JSON.parse(row.payload), id, updatedAt: row.updated_at || row.submitted_at || null,
  submittedAt: row.submitted_at, excluded: Boolean(row.excluded),
});

async function adminApi(request, store, path, admin) {
  if (!admin) return error('Connecte-toi avec le compte de l’organisateur.', 401);
  if (path === '/api/admin' && request.method === 'GET') {
    const [versions, participants, organizer] = await Promise.all([
      catalog(store),
      store.participants(),
      store.organizer(),
    ]);
    const responses = participants.map(row => responseEntry(row, row.id)).sort((a, b) => (b.submittedAt || b.updatedAt || '').localeCompare(a.submittedAt || a.updatedAt || ''));
    return json({
      versions, responses,
      organizer: organizer ? {...JSON.parse(organizer.payload), updatedAt: organizer.updated_at, id: 'organisateur'} : null,
    });
  }
  if (path === '/api/admin/questions' && request.method === 'PUT') {
    const input = await body(request);
    const latest = (await catalog(store)).at(-1);
    if (input?.version !== latest.version) return error('Le questionnaire a évolué. Recharge la page avant de publier.', 409);
    const definition = cleanDefinition(input.questions, latest.questions);
    if (!definition) return error('Vérifie les questions, leurs choix et la visibilité d’au moins une question.', 400);
    const version = latest.version + 1;
    const saved = await store.publish(version, JSON.stringify(definition), now());
    return saved ? json({version}) : error('Une autre version vient d’être publiée. Recharge la page.', 409);
  }
  if (path === '/api/admin/organizer' && request.method === 'PUT') {
    const input = await body(request);
    const versions = await catalog(store);
    const definition = definitionFor(versions, input?.version);
    const data = input && definition && clean(input, activeDefinition(definition));
    if (!data) return error('Les réponses de l’organisateur sont invalides.', 400);
    await store.saveOrganizer(JSON.stringify(data), now());
    return json({ok: true});
  }
  const match = /^\/api\/admin\/participants\/([a-f0-9]{64})$/.exec(path);
  if (match && ['PATCH', 'DELETE'].includes(request.method)) {
    const id = match[1];
    let saved;
    if (request.method === 'DELETE') {
      saved = await store.remove(id);
    } else {
      const input = await body(request);
      if (typeof input?.excluded !== 'boolean') return error('État de participation invalide.', 400);
      saved = await store.exclude(id, input.excluded);
    }
    return saved ? json({ok: true}) : error('Participation introuvable.', 404);
  }
  return error('Action inconnue.', 404);
}

const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  byte => byte.toString(16).padStart(2, '0')).join('');

async function surveyApi(request, store) {
  const key = request.headers.get('x-evg-attempt');
  if (key && !/^[a-f0-9]{64}$/.test(key)) return error('Session invalide.', 400);
  if (!['GET', 'POST', 'PUT'].includes(request.method) || (!key && request.method !== 'GET')) {
    return error('Action inconnue.', 404);
  }
  const id = key ? await digest(key) : null;
  const read = () => id && store.participant(id);
  const [row, versions] = await Promise.all([read(), catalog(store)]);
  if (row?.deleted) return error('Cette participation a été supprimée. Commence un nouveau questionnaire.', 410);
  const submit = request.method === 'POST';
  const draft = row?.payload ? JSON.parse(row.payload) : null;
  const latest = versions.at(-1);
  const current = activeDefinition(draft ? definitionFor(versions, draft.version) : latest);
  if (request.method === 'GET') return json({
    draft: row?.submitted_at ? null : draft, revision: row?.revision ?? 0,
    submitted: Boolean(row?.submitted_at), definition: current,
  });
  if (row?.submitted_at) return submit ? json({submitted: true}) : error('Cette réponse a déjà été envoyée.', 409);

  const input = await body(request);
  if (!draft && input?.draft?.version !== latest.version) {
    return error('Le questionnaire vient de changer. Recharge la page pour ouvrir la nouvelle version.', 409);
  }
  const definition = draft ? current : definitionFor(versions, input?.draft?.version);
  const data = definition && input?.draft?.version === definition.version && clean(input.draft, activeDefinition(definition), submit);
  if (!data || !Number.isInteger(input?.revision)) return error('Vérifie les réponses et le prénom.', 400);
  const revision = row?.revision ?? 0;
  if (input.revision === revision) {
    if (!row && !data.name && !Object.values(data.answers).some(answer => answer.choices.length || answer.comment)) {
      return json({revision, submitted: false});
    }
    const timestamp = now();
    const record = {payload: JSON.stringify(data), updated_at: timestamp, submitted_at: submit ? timestamp : null};
    const saved = row
      ? await store.updateParticipation(id, revision, record)
      : await store.createParticipation(id, record);
    if (saved) return json({revision: revision + 1, submitted: submit});
  }
  const updated = await read();
  if (submit && updated?.submitted_at) return json({submitted: true});
  return error('Cette participation a été modifiée dans un autre onglet. Recharge la page pour reprendre la dernière version.', 409);
}
export default function makeWorker(assets, localAdmin) {
  return {async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const adminEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
    const admin = localAdmin ? localAdmin(request) : Boolean(
      adminEmail && env.SITE_ORIGIN && request.headers.get('oai-authenticated-user-id') &&
      request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() === adminEmail,
    );

    if (path.startsWith('/api/')) {
      if (request.method !== 'GET' && request.headers.get('origin') !== (env.SITE_ORIGIN || url.origin)) {
        return error('Origine de la requête invalide.', 403);
      }
      try {
        const store = env.STORE || createSqlStore(env.DB);
        if (path.startsWith('/api/admin')) return await adminApi(request, store, path, admin);
        if (path === '/api/survey') return await surveyApi(request, store);
        return error('Page introuvable.', 404);
      } catch (failure) {
        console.error('EVG storage failure', failure?.message);
        return error('Le serveur n’a pas pu enregistrer ou lire les données. Réessaie dans un instant.', 503);
      }
    }
    if ((path === '/admin' || path === '/organisateur') && !admin) {
      if (localAdmin) return new Response('Identifiants nécessaires.', {
        status: 401, headers: {...headers, 'www-authenticate': 'Basic realm="Carnet EVG"'},
      });
      if (request.headers.has('oai-authenticated-user-id')) {
        return new Response('Cet espace est réservé au compte de l’organisateur. Déconnecte-toi puis utilise le compte autorisé.', {
          status: 403, headers: {...headers, 'content-type': 'text/plain; charset=utf-8'},
        });
      }
      return new Response(null, {status: 302, headers: {...headers, location: '/signin-with-chatgpt?return_to=' + encodeURIComponent(path)}});
    }
    const page = ['/', '/admin', '/organisateur'].includes(path);
    const file = page ? 'index.html' : path.slice(1);
    if (!Object.hasOwn(assets, file) || (!page && !/\.(js|css)$/.test(file))) return error('Page introuvable.', 404);
    const type = page ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript';
    return new Response(assets[file], {headers: {...headers, 'content-type': type + '; charset=utf-8'}});
  }};
}
