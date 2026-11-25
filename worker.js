import { questions, optionsFor, version } from './public/questions.js';

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
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');

function clean(payload, complete = false) {
  if (!payload || payload.version !== version || typeof payload.name !== 'string' ||
      !Number.isInteger(payload.step) || payload.step < 0 || payload.step > questions.length + 1 ||
      !payload.answers || typeof payload.answers !== 'object' || Array.isArray(payload.answers)) return null;

  const name = payload.name.trim();
  if (name.length > 60 || (complete && !name)) return null;
  const answers = {};
  for (const question of questions) {
    const answer = payload.answers[question.id];
    if (!answer && !complete) continue;
    if (!answer || !Array.isArray(answer.choices) || typeof answer.comment !== 'string' || answer.comment.length > 1000) return null;
    const choices = [...new Set(answer.choices)];
    const available = optionsFor(question);
    if (choices.some(choice => typeof choice !== 'string' || !Object.hasOwn(available, choice)) ||
        (choices.length > 1 && (choices.includes('none') || choices.includes('unknown'))) ||
        (complete && !choices.length && !answer.comment.trim())) return null;
    answers[question.id] = {choices, comment: answer.comment.trim()};
  }
  return {version, name, step: payload.step, answers};
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
    if (size > 100000) {
      await reader.cancel();
      return null;
    }
    raw += decoder.decode(value, {stream: true});
  }
  try { return JSON.parse(raw + decoder.decode()); } catch { return null; }
}

async function adminApi(request, env, path, admin) {
  if (!admin) return error('Connecte-toi avec le compte de l’organisateur.', 401);
  if (path === '/api/admin' && request.method === 'GET') {
    const {results} = await env.DB.prepare('SELECT slot, token, draft, submitted_at FROM invitations ORDER BY slot').all();
    const organizer = await env.DB.prepare('SELECT payload, updated_at FROM organizer WHERE id = 1').first();
    return json({
      invites: results.map(row => ({slot: row.slot, token: row.token, status: row.submitted_at ? 'submitted' : row.draft ? 'draft' : 'new'})),
      responses: results.filter(row => row.submitted_at).map(row => ({
        slot: row.slot, ...JSON.parse(row.draft), submittedAt: row.submitted_at,
      })),
      organizer: organizer ? {...JSON.parse(organizer.payload), updatedAt: organizer.updated_at} : null,
    });
  }
  if (path === '/api/admin/invites' && request.method === 'POST') {
    await env.DB.batch([1, 2, 3, 4].map(slot => env.DB.prepare(
      'INSERT INTO invitations (slot, token) VALUES (?, ?) ON CONFLICT(slot) DO NOTHING',
    ).bind(slot, newToken())));
    return json({ok: true});
  }
  if (path === '/api/admin/organizer' && request.method === 'PUT') {
    const data = clean(await body(request));
    if (!data) return error('Les réponses de l’organisateur sont invalides.', 400);
    await env.DB.prepare('INSERT INTO organizer VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at')
      .bind(JSON.stringify(data), now()).run();
    return json({ok: true});
  }
  return error('Action inconnue.', 404);
}

async function surveyApi(request, env) {
  const token = request.headers.get('x-evg-invite');
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return error('Ce lien d’invitation est incomplet ou invalide.', 404);
  const row = await env.DB.prepare('SELECT draft, revision, submitted_at FROM invitations WHERE token = ?').bind(token).first();
  if (!row) return error('Ce lien d’invitation est invalide.', 404);
  if (request.method === 'GET') return json({
    draft: row.submitted_at || !row.draft ? null : JSON.parse(row.draft),
    revision: row.revision, submitted: Boolean(row.submitted_at),
  });
  if (!['POST', 'PUT'].includes(request.method)) return error('Action inconnue.', 404);
  const submit = request.method === 'POST';
  if (row.submitted_at) return submit ? json({submitted: true}) : error('Cette réponse a déjà été envoyée.', 409);

  const input = await body(request);
  const data = clean(input?.draft, submit);
  if (!data || !Number.isInteger(input.revision)) return error('Vérifie les réponses et le prénom.', 400);
  if (input.revision === row.revision) {
    const result = await env.DB.prepare(
      'UPDATE invitations SET draft = ?, revision = revision + 1, submitted_at = ? WHERE token = ? AND revision = ? AND submitted_at IS NULL',
    ).bind(JSON.stringify(data), submit ? now() : null, token, row.revision).run();
    if (result.meta.changes === 1) return json({revision: row.revision + 1, submitted: submit});
  }
  return error('Cette invitation a été modifiée ailleurs. Rouvre le lien pour reprendre la dernière version.', 409);
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
        if (path.startsWith('/api/admin')) return await adminApi(request, env, path, admin);
        if (path === '/api/survey') return await surveyApi(request, env);
        return error('Page introuvable.', 404);
      } catch (failure) {
        console.error('EVG storage failure', failure?.message);
        return error('Le serveur n’a pas pu enregistrer ou lire les données. Réessaie dans un instant.', 503);
      }
    }
    if ((path === '/admin' || path === '/organisateur') && !admin) {
      if (localAdmin) return new Response('Identifiants nécessaires.', {
        status: 401, headers: {...headers, 'www-authenticate': 'Basic realm="Carnet EVG local"'},
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
