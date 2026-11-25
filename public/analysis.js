import {optionsFor, questions, themes, version} from './questions.js';

export function analyze(responses, organizer, includeOrganizer) {
  const entries = [...responses];
  if (includeOrganizer && organizer) entries.push({...organizer, role: 'organizer'});
  const results = questions.map(question => {
    const known = optionsFor(question);
    const votes = Object.fromEntries(Object.keys(known).map(choice => [choice, []]));
    const comments = [];
    let answered = 0;
    for (const entry of entries) {
      const answer = entry.answers[question.id];
      if (!answer || (!answer.choices.length && !answer.comment)) continue;
      answered++;
      const who = entry.role === 'organizer' ? entry.name + ' (organisation)' : entry.name + ' · lien ' + entry.slot;
      for (const choice of answer.choices) votes[choice]?.push(who);
      if (answer.comment) comments.push({who, text: answer.comment});
    }
    const decisive = Object.keys(question.options);
    const agreements = decisive.filter(choice => votes[choice].length >= 2);
    const divergences = question.opposite.filter(([a, b]) => {
      // A person accepting two formats signals flexibility, rather than disagreement.
      return votes[a].some(who => !votes[b].includes(who)) && votes[b].some(who => !votes[a].includes(who));
    }).map(([a, b]) => known[a] + ' / ' + known[b]);
    if (votes.none.length && decisive.some(choice => votes[choice].length)) {
      divergences.push('« Aucune de ces propositions » et au moins une proposition retenue');
    }
    return {question, labels: known, answered, votes, comments, agreements, divergences, unknown: votes.unknown.length};
  });
  const byTheme = Object.entries(themes).map(([id, name]) => {
    const matching = results.filter(result => result.question.theme === id);
    return {
      id, name,
      agreements: matching.flatMap(result => result.agreements.map(key => ({
        question: result.question.id, label: result.labels[key], count: result.votes[key].length, answered: result.answered,
      }))),
      divergences: matching.flatMap(result => result.divergences.map(text => ({question: result.question.id, text}))),
      uncertain: matching.filter(result => result.unknown || !result.answered).map(result => ({
        question: result.question.id, title: result.question.title, unknown: result.unknown, answered: result.answered,
      })),
    };
  });
  return {version, organizerIncluded: Boolean(includeOrganizer && organizer), respondentCount: responses.length, analyzedCount: entries.length, results, byTheme};
}

export function exportCsv(data, includeOrganizer) {
  const rows = [['source', 'invitation', 'prénom ou pseudonyme', 'date', 'question', 'thème', 'intitulé', 'choix', 'commentaire']];
  const entries = data.responses.map(entry => ({...entry, source: 'proche'}));
  if (includeOrganizer && data.organizer) entries.push({...data.organizer, source: 'organisateur'});
  for (const entry of entries) {
    for (const question of questions) {
      const answer = entry.answers[question.id];
      rows.push([entry.source, entry.slot, entry.name, entry.submittedAt || entry.updatedAt, question.id,
        themes[question.theme], question.prompt, answer?.choices.map(key => optionsFor(question)[key]).join(' | '), answer?.comment]);
    }
  }
  const cell = value => {
    const str = String(value ?? '');
    // Prevent text written by a respondent from becoming a spreadsheet formula.
    const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(str) ? "'" + str : str;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
