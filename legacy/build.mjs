import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const files = ['index.html', 'app.css', 'questions.js', 'survey.js', 'admin.js', 'common.js', 'analysis.js'];
const assets = Object.fromEntries(await Promise.all(files.map(async name => [name, await read('public/' + name)])));
const modules = ['public/questions.js', 'public/legacy-questions.js', 'questionnaire-store.js', 'sql-store.js', 'worker.js'];
const source = (await Promise.all(modules.map(read))).join('\n')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^export (?:default )?/gm, '');
await mkdir('dist/server', {recursive: true});
await mkdir('dist/.openai', {recursive: true});
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
await writeFile('dist/server/index.js', source + '\nexport default makeWorker(' + JSON.stringify(assets) + ');\n');
