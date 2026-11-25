import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNetlifyHandler} from '../netlify/handler.mjs';
import {createBlobsStore} from '../netlify/blobs-store.mjs';

const origin = 'https://carnet-evg.netlify.app';
const password = 'local-fixture-only-24-characters';
const auth = 'Basic ' + Buffer.from('organisateur:' + password).toString('base64');

function memoryBlobs() {
  const entries = new Map();
  let version = 0;
  return {
    async get(key) { return structuredClone(entries.get(key)?.data ?? null); },
    async getWithMetadata(key) { return structuredClone(entries.get(key) ?? null); },
    async list({prefix}) {
      return {blobs: [...entries.keys()].filter(key => key.startsWith(prefix)).map(key => ({key}))};
    },
    async setJSON(key, data, {onlyIfNew, onlyIfMatch} = {}) {
      const previous = entries.get(key);
      if ((onlyIfNew && previous) || (onlyIfMatch && onlyIfMatch !== previous?.etag)) return {modified: false};
      const etag = String(++version);
      entries.set(key, {data: structuredClone(data), etag});
      return {modified: true, etag};
    },
  };
}

test('Netlify questionnaire public, brouillon persistant et dashboard privé', async () => {
  const blobs = memoryBlobs();
  const env = {ADMIN_PASSWORD: password};
  const makeHandler = () => createNetlifyHandler('<main>Le carnet</main>', () => blobs, env);
  const serve = makeHandler();
  const request = (path, init) => serve(new Request(origin + path, init));
  const forbidden = await request('/admin');
  assert.equal(forbidden.status, 401);
  assert.match(forbidden.headers.get('www-authenticate'), /^Basic /);
  assert.equal((await request('/organisateur/')).status, 401);
  assert.equal((await request('/api/admin')).status, 401);
  assert.equal((await request('/api/admin', {headers: {authorization: 'Basic invalide'}})).status, 401);

  const page = await request('/admin', {headers: {authorization: auth}});
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');

  const publicState = await (await request('/api/survey')).json();
  assert.equal(publicState.draft, null);
  const draft = {version: publicState.definition.version, name: 'Camille', step: 1, answers: {}};
  const headers = {origin, 'content-type': 'application/json', 'x-evg-attempt': 'a'.repeat(64)};
  const body = JSON.stringify({draft, revision: 0});
  assert.equal((await request('/api/survey', {
    method: 'PUT', headers: {...headers, origin: 'https://example.org'}, body,
  })).status, 403);
  const concurrent = await Promise.all([1, 2].map(() => request('/api/survey', {method: 'PUT', headers, body})));
  assert.deepEqual(concurrent.map(reply => reply.status).sort(), [200, 409]);

  const admin = await makeHandler()(new Request(origin + '/api/admin', {headers: {authorization: auth}}));
  assert.equal(admin.status, 200);
  assert.deepEqual((await admin.json()).responses.map(entry => entry.name), ['Camille']);
});

test('Netlify Blobs conserve exclusions, versions et suppression pendant des écritures concurrentes', async () => {
  const store = createBlobsStore(memoryBlobs());
  const id = 'fixture';
  const record = {payload: 'premier', updated_at: '2026-11-25T00:00:00Z', submitted_at: null};
  assert.equal(await store.createParticipation(id, record), true);
  const next = {...record, payload: 'second'};
  assert.deepEqual(await Promise.all([store.exclude(id, true), store.updateParticipation(id, 1, next)]), [true, true]);
  const [updated] = await store.participants();
  assert.equal(updated.excluded, true);
  assert.equal(updated.payload, next.payload);
  assert.equal(updated.revision, 2);
  const conflicts = await Promise.all(['a', 'b'].map(definition => store.publish(4, definition, record.updated_at)));
  assert.deepEqual(conflicts.sort(), [false, true]);
  assert.equal((await store.versions()).length, 1);
  assert.equal(await store.remove(id), true);
  assert.deepEqual(await store.participant(id), {deleted: true});
  assert.equal(await store.createParticipation(id, record), false);
  assert.equal(await store.updateParticipation(id, 2, next), false);
  assert.deepEqual(await store.participants(), []);
});

test('Netlify protège le dashboard si son secret est absent', async () => {
  for (const ADMIN_PASSWORD of [undefined, 'too-short']) {
    const serve = createNetlifyHandler('', () => assert.fail('Stockage ouvert'), {ADMIN_PASSWORD});
    assert.equal((await serve(new Request(origin + '/admin', {headers: {authorization: auth}}))).status, 503);
    assert.equal((await serve(new Request(origin + '/api/admin', {headers: {authorization: auth}}))).status, 401);
  }
});
