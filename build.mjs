import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const files = ['index.html', 'app.css', 'questions.js', 'survey.js', 'admin.js', 'common.js', 'analysis.js'];
const assets = Object.fromEntries(await Promise.all(files.map(async name => [name, await read('public/' + name)])));
const schema = (await read('public/questions.js')).replace(/^export /gm, '');
const worker = (await read('worker.js'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default function makeWorker', 'function makeWorker');
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
await writeFile('dist/server/index.js', schema + '\n' + worker + '\nexport default makeWorker(' + JSON.stringify(assets) + ');\n');
