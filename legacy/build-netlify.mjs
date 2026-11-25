import {mkdir, readFile, writeFile} from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const index = await read('public/index.html');
const output = new URL('dist/netlify-functions/', import.meta.url);
await mkdir(output, {recursive: true});
await writeFile(new URL('carnet.mjs', output), [
  "import {getStore} from '@netlify/blobs';",
  "import {createNetlifyHandler} from '../../netlify/handler.mjs';",
  '',
  'export const config = {path: ["/api/*", "/admin", "/admin/", "/organisateur", "/organisateur/"]};',
  'export default createNetlifyHandler(' + JSON.stringify(index) + ', () => getStore({name: "carnet-evg", consistency: "strong"}));',
  '',
].join('\n'));
