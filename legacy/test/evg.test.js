import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {analyze, exportCsv} from '../public/analysis.js';
import {matrixLabels} from '../public/questions.js';

import {openDatabase} from '../sqlite.mjs';
import makeWorker from '../worker.js';

const auth = 'Basic test-credentials';
const key = () => randomBytes(32).toString('hex');
const findQuestion = (analysis, id, version) => analysis.results.find(item =>
  item.question.id === id && item.versions.includes(version));

test('Parcours public, administration, 55 réponses, persistance et historique', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'evg-test-'));
  const origin = 'https://evg.example.test';
  const env = {SITE_ORIGIN: origin};
  const worker = makeWorker({'index.html': '<main>Questionnaire</main>'},
    request => request.headers.get('authorization') === auth);
  const boot = () => { env.DB = openDatabase(join(folder, 'test.sqlite')); };
  const stop = () => { env.DB?.close(); env.DB = null; };
  t.after(async () => { stop(); await rm(folder, {recursive: true, force: true}); });
  boot();

  async function request(path, {method = 'GET', data, admin = false, attempt, requestOrigin = origin, headers = {}} = {}) {
    const response = await worker.fetch(new Request(origin + path, {method, headers: {
      ...(admin && {Authorization: auth}), ...(attempt && {'X-EVG-Attempt': attempt}),
      ...(method !== 'GET' && {Origin: requestOrigin}), ...(data && {'Content-Type': 'application/json'}), ...headers,
    }, body: JSON.stringify(data)}), env);
    return {status: response.status, body: response.headers.get('content-type')?.startsWith('application/json')
      ? await response.json() : await response.text()};
  }
  const survey = options => request('/api/survey', options);
  const admin = async () => {
    const result = await request('/api/admin', {admin: true});
    assert.equal(result.status, 200);
    return result.body;
  };
  const complete = (definition, name, first = {choices: ['c1', 'c2'], comment: ''}) => ({
    version: definition.version, name, step: definition.questions.length + 1, answers: Object.fromEntries(
      definition.questions.filter(q => !q.optional).map((question, index) =>
        [question.id, index === 0 ? first : {choices: ['unknown'], comment: ''}])),
  });
  const send = async (attempt, draft, revision = 0) => {
    const result = await survey({attempt, method: 'POST', data: {draft, revision}});
    assert.deepEqual([result.status, result.body.submitted], [200, true]);
  };
  const first = key();
  const firstState = (await survey({attempt: first})).body;
  const definition = firstState.definition;
  let firstRevision;

  await t.test('Accès anonyme au formulaire et refus des données et opérations privées', async () => {
    assert.equal((await request('/')).status, 200);
    assert.equal((await request('/admin')).status, 401);
    assert.equal((await request('/organisateur')).status, 401);
    for (const path of ['/api/admin', '/api/admin/questions', '/api/admin/organizer', '/api/admin/participants/' + key()]) {
      const method = path.endsWith('questions') || path.endsWith('organizer') ? 'PUT' : path.includes('participants') ? 'DELETE' : 'GET';
      assert.equal((await request(path, {method})).status, 401);
    }
    assert.equal((await request('/api/admin/questions', {method: 'PUT', admin: true, requestOrigin: 'https://other.invalid'})).status, 403);
    assert.equal(firstState.draft, null);
    assert.equal((await admin()).responses.length, 0);
  });

  await t.test('Premier brouillon réel, reprise, envoi et nouvelle tentative concurrente idempotente', async () => {
    const draft = {...complete(definition, 'Élodie', {choices: ['c1', 'c2', 'c2'], comment: 'Un commentaire signé Élodie.'}), step: 2};
    const saved = await survey({attempt: first, method: 'PUT', data: {draft, revision: 0}});
    assert.equal(saved.status, 200);
    firstRevision = saved.body.revision;
    assert.equal((await survey({attempt: first})).body.draft.name, 'Élodie');
    assert.equal((await survey({attempt: key()})).body.draft, null);
    assert.equal((await admin()).responses.filter(entry => !entry.submittedAt).length, 1);
    await Promise.all([send(first, draft, firstRevision), send(first, draft, firstRevision)]);
    const rows = (await admin()).responses;
    assert.equal(rows.length, 1);
    assert.ok(rows[0].submittedAt);
    assert.deepEqual(rows[0].answers[1].choices, ['c1', 'c2']);
    assert.equal((await survey({attempt: first})).body.draft, null);
  });

  await t.test('5, 20, 50 puis 55 réponses indépendantes, même prénom accepté', async () => {
    let count = 1;
    for (const target of [5, 20, 50, 55]) {
      for (; count < target; count++) {
        const answer = count === 1 ? {choices: [], comment: 'Seulement une précision.'}
          : count === 2 ? {choices: ['none'], comment: ''}
          : count === 3 ? {choices: ['unknown'], comment: ''} : undefined;
        await send(key(), complete(definition, count === 4 ? 'Élodie' : 'Personne ' + count, answer));
      }
      const state = await admin();
      assert.equal(state.responses.length, target);
      assert.equal(analyze(state, false).respondentCount, target);
    }
  });

  await t.test('Dénominateur réel, choix multiples, aucune, incertitude et auteurs', async () => {
    const state = await admin();
    const result = findQuestion(analyze(state, false), 1, definition.version);
    assert.equal(result.answered, 55);
    assert.equal(result.votes.c1.length, 52);
    assert.equal(result.votes.c2.length, 52);
    assert.equal(result.votes.none.length, 1);
    assert.equal(result.votes.unknown.length, 1);
    assert.ok(Object.values(result.votes).flat().length / result.answered > 1);
    assert.deepEqual(result.comments.map(({name}) => name).sort(), ['Personne 1', 'Élodie']);
    assert.match(exportCsv(state, false), /"Élodie".*"Un commentaire signé Élodie\."/);
    assert.deepEqual(JSON.parse(JSON.stringify(analyze(state, false))), analyze(state, false));
  });

  await t.test('Exclusion, réintégration, suppression et blocage des renvois tardifs', async () => {
    const id = (await admin()).responses.find(entry => entry.answers[1].comment.includes('Élodie')).id;
    const path = '/api/admin/participants/' + id;
    for (const excluded of [true, false]) {
      assert.equal((await request(path, {method: 'PATCH', admin: true, data: {excluded}})).status, 200);
      const state = await admin();
      assert.equal(state.responses.find(entry => entry.id === id).excluded, excluded);
      assert.equal(findQuestion(analyze(state, false), 1, definition.version).answered, excluded ? 54 : 55);
    }
    const extra = key();
    await send(extra, complete(definition, 'À supprimer'));
    const extraId = (await admin()).responses.find(entry => entry.name === 'À supprimer').id;
    assert.equal((await request('/api/admin/participants/' + extraId, {method: 'DELETE', admin: true})).status, 200);
    assert.equal((await survey({attempt: extra})).status, 410);
    assert.equal((await admin()).responses.length, 55);
  });

  await t.test('Publication sans rebuild, reprise du brouillon et ancienne option conservée après redémarrage', async () => {
    const ongoing = key();
    const draft = complete(definition, 'Brouillon avant publication');
    await survey({attempt: ongoing, method: 'PUT', data: {draft, revision: 0}});
    const {versions} = await admin();
    const questions = versions.at(-1).questions.map(question => ({
      ...question, labels: question.kind === 'matrix' ? matrixLabels(question) : Object.values(question.options),
    }));
    const added = {id: 'q-979736ba-86c4-401d-9d90-5bd645c0608d', theme: 'experiences',
      title: 'Question ajoutée', prompt: 'Autre suggestion ?', hint: '', labels: []};
    questions.push(added);
    questions[0].labels[0] = 'Première option modifiée';
    questions[1].hidden = true;
    [questions[2], questions[3]] = [questions[3], questions[2]];
    const edit = () => request('/api/admin/questions', {method: 'PUT', admin: true, data: {version: definition.version, questions}});
    assert.equal((await edit()).status, 200);
    assert.equal((await edit()).status, 409);
    const latest = (await survey({attempt: key()})).body.definition;
    assert.equal(latest.version, definition.version + 1);
    assert.equal(latest.questions[1].id, 4);
    assert.equal(latest.questions.some(question => question.id === 2), false);
    assert.equal(latest.questions.at(-1).id, added.id);
    const previous = (await survey({attempt: ongoing})).body;
    assert.equal(previous.definition.version, definition.version);
    await send(ongoing, draft, previous.revision);
    await send(key(), complete(latest, 'Nouvelle version'));
    stop();
    boot();
    const persisted = await admin();
    assert.equal(persisted.responses.length, 57);
    const result = analyze(persisted, false);
    assert.equal(findQuestion(result, 1, definition.version).labels.c1, definition.questions[0].options.c1);
    assert.equal(findQuestion(result, 1, latest.version).labels.c1, 'Première option modifiée');
    assert.equal(findQuestion(result, 1, latest.version).answered, 1);
    assert.equal(findQuestion(result, 1, definition.version).answered, 56);
    assert.equal(findQuestion(result, 6, latest.version).answered, 57);
  });
});

test('L’identité de production protège les routes administrateur et l’avis privé', async () => {
  const worker = makeWorker({'index.html': '<main>Questionnaire</main>'});
  const db = openDatabase(':memory:');
  const origin = 'https://evg.example.test';
  const env = {DB: db, SITE_ORIGIN: origin, ADMIN_EMAIL: 'organisateur@example.test'};
  const account = {'oai-authenticated-user-id': 'test-organizer', 'oai-authenticated-user-email': env.ADMIN_EMAIL};
  const send = (path, init) => worker.fetch(new Request(origin + path, init), env);
  try {
    assert.equal((await send('/admin')).status, 302);
    assert.equal((await send('/admin', {headers: {'oai-authenticated-user-id': 'another',
      'oai-authenticated-user-email': 'another@example.test'}})).status, 403);
    assert.equal((await send('/admin', {headers: account})).status, 200);
    const response = await send('/api/admin', {headers: account});
    assert.equal(response.status, 200);
    const current = (await response.json()).versions.at(-1);
    const data = {version: current.version, name: 'Organisateur', step: 0, answers: {1: {choices: ['c1'], comment: 'Privé'}}};
    const saved = await send('/api/admin/organizer', {method: 'PUT',
      headers: {...account, origin, 'content-type': 'application/json'}, body: JSON.stringify(data)});
    assert.equal(saved.status, 200);
    const publicState = await (await send('/api/survey')).json();
    assert.deepEqual(Object.keys(publicState).sort(), ['definition', 'draft', 'revision', 'submitted']);
    assert.equal(publicState.draft, null);
    assert.equal((await send('/api/admin')).status, 401);
    assert.equal((await (await send('/api/admin', {headers: account})).json()).organizer.answers[1].comment, 'Privé');
  } finally {
    db.close();
  }
});
