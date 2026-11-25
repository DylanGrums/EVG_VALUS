import {createServer} from 'node:http';
import {openDatabase} from './sqlite.mjs';
import {mkdirSync, readFileSync} from 'node:fs';
import {Readable} from 'node:stream';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import makeWorker from './worker.js';

const files = ['index.html', 'app.css', 'questions.js', 'survey.js', 'admin.js', 'common.js', 'analysis.js'];
const assets = Object.fromEntries(files.map(name => [name, readFileSync(new URL('public/' + name, import.meta.url), 'utf8')]));
const dbPath = process.env.EVG_DB_PATH || '.evg-data/carnet.sqlite';
if (!process.env.EVG_DB_PATH) mkdirSync('.evg-data', {recursive: true});
const db = openDatabase(dbPath);

const host = '127.0.0.1';
const port = Number(process.env.EVG_PORT || 4187);
const origin = 'http://' + host + ':' + port;
const publicOrigin = process.env.EVG_PUBLIC_ORIGIN;
const publicUrl = publicOrigin && new URL(publicOrigin);
const configuredPassword = process.env.EVG_LOCAL_PASSWORD;
if (publicUrl && (publicUrl.protocol !== 'https:' || publicUrl.origin !== publicOrigin || (configuredPassword?.length ?? 0) < 20)) {
  throw new Error('Configure une origine publique HTTPS et un mot de passe administrateur d’au moins 20 caractères.');
}
const password = configuredPassword || randomBytes(18).toString('base64url');
const hash = value => createHash('sha256').update(value).digest();
const expected = hash('Basic ' + Buffer.from('organisateur:' + password).toString('base64'));
const worker = makeWorker(assets, request => timingSafeEqual(hash(request.headers.get('authorization') || ''), expected));

createServer(async (incoming, outgoing) => {
  try {
    const validHost = incoming.headers.host === host + ':' + port || incoming.headers.host === publicUrl?.host;
    if (!validHost || !incoming.url?.startsWith('/')) {
      outgoing.writeHead(400).end();
      return;
    }
    const method = incoming.method;
    const request = new Request(origin + incoming.url, {
      method, headers: incoming.headers,
      ...(!['GET', 'HEAD'].includes(method) ? {body: Readable.toWeb(incoming), duplex: 'half'} : {}),
    });
    const response = await worker.fetch(request, {DB: db, SITE_ORIGIN: publicOrigin || origin});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end('Erreur du serveur local.');
  }
}).listen(port, host, () => {
  console.log('Questionnaire · ' + (publicOrigin || origin));
  console.log('Tableau de bord · ' + (publicOrigin || origin) + '/admin');
  if (!configuredPassword) console.log('Identifiant local · organisateur / ' + password);
});
