import {questions, reactions, special, themes} from './public/questions.js';
import {legacyQuestions} from './public/legacy-questions.js';

const initialVersions = [
  {version: 1, questions: legacyQuestions.map(question => ({...question, options: {...question.options, ...special}}))},
  {version: 2, questions},
  {version: 3, questions: questions.map(question => question.kind === 'matrix' ? {...question, globalSpecial: true} : question)},
];

export async function catalog(store) {
  const results = await store.versions();
  return [...initialVersions, ...results.map(row => ({
    version: row.version, questions: JSON.parse(row.definition), publishedAt: row.published_at,
  }))];
}

export const definitionFor = (versions, version) => versions.find(entry => entry.version === version);
export const activeDefinition = definition => ({...definition, questions: definition.questions.filter(question => !question.hidden)});

export function cleanDefinition(input, previous) {
  if (!Array.isArray(input) || !input.length || input.length > 100 || !input.some(q => q && !q.hidden)) return null;
  const text = (value, length, required = true) => typeof value === 'string' &&
    value.length <= length && (!required || value.trim());
  const ids = new Set();
  const result = [];
  for (const question of input) {
    if (!question || !/^[a-z\d-]{1,60}$/.test(String(question.id)) || ids.has(String(question.id)) ||
        !text(question.title, 160) || !text(question.prompt, 600) || !text(question.hint, 600, false) ||
        !Object.hasOwn(themes, question.theme)) return null;
    const old = previous.find(q => String(q.id) === String(question.id));
    if (!old && !/^q-[a-f0-9-]{36}$/.test(question.id)) return null;
    ids.add(String(question.id));
    const kind = old?.kind === 'matrix' ? 'matrix' : undefined;
    if (kind && question.kind !== kind) return null;
    if (!Array.isArray(question.labels) || question.labels.length > (kind ? 15 : 40) ||
        (kind && !question.labels.length) || !question.labels.every(label => text(label, 300))) return null;
    const labels = question.labels.map(label => label.trim());
    if (new Set(labels).size !== labels.length) return null;
    const optional = !labels.length;
    const options = Object.fromEntries(kind
      ? labels.flatMap((label, i) => reactions.map((reaction, j) => [i + '-' + j, label + ' · ' + reaction]))
      : labels.map((label, i) => ['c' + (i + 1), label]));
    const opposite = (old?.opposite || []).filter(([a, b]) =>
      old.options[a] === options[a] && old.options[b] === options[b]);
    result.push({
      id: old?.id ?? question.id, theme: question.theme, title: question.title.trim(),
      prompt: question.prompt.trim(), options, hint: question.hint.trim(), opposite,
      ...(Boolean(question.hidden) && {hidden: true}),
      ...(kind && {kind, globalSpecial: true}),
      ...(optional && {optional: true}),
    });
  }
  return previous.every(q => ids.has(String(q.id))) ? result : null;
}
