import {optionsFor, themes} from './questions.js';

const hasAnswer = answer => Boolean(answer && (answer.choices.length || answer.comment));

function questionSignature(question) {
  return JSON.stringify([question.id, question.theme, question.title, question.prompt, question.hint,
    question.kind, question.optional || false, optionsFor(question), question.opposite]);
}

function score(group, entries) {
  const {question, versions} = group;
  const labels = optionsFor(question);
  const votes = Object.fromEntries(Object.keys(labels).map(choice => [choice, []]));
  const comments = [];
  const individuals = [];
  const decisive = Object.keys(labels).filter(choice => !['none', 'unknown'].includes(choice) && !choice.endsWith('-3'));
  for (const entry of entries) {
    if (!versions.includes(entry.version)) continue;
    const answer = entry.answers[question.id];
    if (!hasAnswer(answer)) continue;
    const who = {id: entry.id, name: entry.name || 'Sans prénom'};
    individuals.push({...who, ...answer});
    for (const choice of new Set(answer.choices)) votes[choice]?.push(who);
    if (answer.comment) comments.push({...who, text: answer.comment});
  }
  const answered = individuals.length;
  const agreements = decisive.filter(choice => votes[choice].length >= 2 && votes[choice].length / answered >= 0.75);
  const signals = decisive.filter(choice => votes[choice].length > 0)
    .sort((a, b) => votes[b].length - votes[a].length);
  const opposite = [...question.opposite];
  if (question.kind === 'matrix') {
    for (const choice of decisive.filter(key => key.endsWith('-0'))) opposite.push([choice, choice.replace(/-0$/, '-2')]);
  }
  const divergences = opposite.filter(([a, b]) =>
    votes[a].some(who => !votes[b].includes(who)) && votes[b].some(who => !votes[a].includes(who)))
    .map(([a, b]) => labels[a] + ' / ' + labels[b]);
  if (votes.none?.length && decisive.some(choice => votes[choice].length)) {
    divergences.push('« Aucune de ces propositions » et des propositions retenues');
  }
  const uncertain = new Set(votes.unknown || []);
  for (const key of Object.keys(labels)) {
    if (key.endsWith('-1') || key.endsWith('-3')) for (const who of votes[key]) uncertain.add(who);
  }
  return {...group, answered, labels, votes, comments, individuals, agreements, signals, divergences, uncertain: uncertain.size};
}

export function analyze(data, includeOrganizer) {
  const responses = data.responses.filter(entry => entry.submittedAt && !entry.excluded);
  const entries = [...responses];
  if (includeOrganizer && data.organizer) entries.push({...data.organizer, name: (data.organizer.name || 'Organisateur') + ' (organisation)'});
  const occurring = new Set(entries.map(entry => entry.version));
  const groups = new Map();
  for (const version of [...data.versions].reverse()) {
    if (version !== data.versions.at(-1) && !occurring.has(version.version)) continue;
    for (const question of version.questions.filter(q => !q.hidden)) {
      const signature = questionSignature(question);
      const group = groups.get(signature);
      if (group) group.versions.push(version.version);
      else groups.set(signature, {question, versions: [version.version], key: 'question-' + version.version + '-' + question.id});
    }
  }
  const results = [...groups.values()].map(group => score(group, entries));
  const byTheme = Object.entries(themes).map(([id, name]) => {
    const matching = results.filter(result => result.question.theme === id);
    const signal = (result, key) => ({
      target: result.key, label: result.labels[key], count: result.votes[key].length, answered: result.answered,
    });
    return {
      id, name,
      agreements: matching.flatMap(result => result.agreements.map(key => signal(result, key))),
      signals: matching.flatMap(result => result.signals.slice(0, 3).map(key => signal(result, key))),
      divergences: matching.flatMap(result => result.divergences.map(text => ({target: result.key, text}))),
      uncertain: matching.filter(result => result.uncertain || !result.answered).map(result => ({
        target: result.key, title: result.question.title, count: result.uncertain, answered: result.answered,
      })),
    };
  });
  return {organizerIncluded: Boolean(includeOrganizer && data.organizer), respondentCount: responses.length, analyzedCount: entries.length, results, byTheme};
}

export function exportCsv(data, includeOrganizer) {
  const rows = [['source', 'identifiant', 'prénom ou pseudonyme', 'date', 'exclue des statistiques', 'version', 'question', 'thème', 'intitulé', 'choix', 'commentaire']];
  const entries = data.responses.filter(entry => entry.submittedAt).map(entry => ({...entry, source: 'participant'}));
  if (includeOrganizer && data.organizer) entries.push({...data.organizer, source: 'organisateur'});
  const definitions = new Map(data.versions.map(definition => [definition.version, definition.questions]));
  for (const entry of entries) {
    for (const question of definitions.get(entry.version).filter(q => !q.hidden)) {
      const answer = entry.answers[question.id];
      const labels = optionsFor(question);
      rows.push([entry.source, entry.id, entry.name, entry.submittedAt || entry.updatedAt, entry.excluded ? 'oui' : 'non',
        entry.version, question.id, themes[question.theme], question.prompt,
        answer?.choices.map(key => labels[key]).join(' | '), answer?.comment]);
    }
  }
  const cell = value => {
    const str = String(value ?? '');
    // Prevent respondent text from becoming a spreadsheet formula.
    const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(str) ? "'" + str : str;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
