import {api, el, hero, render, tell} from './common.js';
import {analyze, exportCsv} from './analysis.js';
import {matrixLabels, optionsFor, special, themes} from './questions.js';

const date = timestamp => timestamp ? new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris',
}).format(new Date(timestamp)) : '—';
const percent = (count, answered) => answered
  ? new Intl.NumberFormat('fr-FR', {style: 'percent', maximumFractionDigits: 1}).format(count / answered) : '—';
const button = (label, action, className = 'secondary') => el('button', {type: 'button', class: className, onclick: action}, label);
const statusOf = entry => entry.excluded ? 'Exclue' : entry.submittedAt ? 'Terminée' : 'En cours';
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = el('a', {href: url, download: filename});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function individual(entry, versions, actions = []) {
  const definition = versions.find(item => item.version === entry.version);
  const heading = entry.name || 'Sans prénom';
  return el('details', {'data-key': 'participant-' + entry.id}, el('summary', {}, heading, el('span', {class: 'detail-tag'}, statusOf(entry))),
    el('p', {class: 'muted small'}, ['Version ' + entry.version, date(entry.submittedAt || entry.updatedAt)].join(' · ')),
    actions.length > 0 && el('div', {class: 'line'}, actions),
    el('ul', {class: 'plain'}, definition?.questions.filter(q => !q.hidden).map(question => {
      const answer = entry.answers[question.id];
      if (!answer || (!answer.choices.length && !answer.comment)) return null;
      return el('li', {},
        el('strong', {}, question.title),
        el('div', {}, answer.choices.map(key => optionsFor(question)[key]).join(' · ')),
        answer.comment && el('div', {class: 'preserve quote'}, answer.comment));
    })));
}

function score(result) {
  const {question, key, answered, versions, labels, votes, individuals, divergences} = result;
  return el('details', {id: key, 'data-key': key},
    el('summary', {}, question.title, el('span', {class: 'detail-tag'}, answered + ' réponse(s)')),
    el('p', {class: 'muted'}, question.prompt),
    el('p', {class: 'small muted'}, 'Version(s) analysée(s) · ' + versions.join(', ')),
    Object.entries(labels).map(([id, label]) => {
      const count = votes[id].length;
      return el('div', {class: 'metric' + (Object.hasOwn(special, id) ? ' metric-special' : '')},
        el('span', {}, label), el('strong', {}, count + ' · ' + percent(count, answered)),
        answered > 0 && el('progress', {value: count, max: answered, 'aria-label': label}));
    }),
    divergences.length > 0 && el('p', {class: 'stack'}, el('strong', {}, 'Avis divergents · '), divergences.join(' · ')),
    individuals.length > 0 && el('details', {'data-key': key + '-individuals'},
      el('summary', {}, 'Réponses individuelles et commentaires'),
      individuals.map(entry => el('div', {class: 'quote'},
        el('a', {href: '#participant-' + entry.id, onclick: event => {
          const target = [...document.querySelectorAll('[data-key]')].find(node => node.dataset.key === 'participant-' + entry.id);
          if (!target) return;
          event.preventDefault();
          target.open = true;
          target.scrollIntoView();
        }}, entry.name),
        el('div', {}, entry.choices.map(id => labels[id]).join(' · ')),
        entry.comment && el('div', {class: 'preserve'}, entry.comment)))));
}

function jump(label, target) {
  return el('a', {href: '#' + target, onclick: () => {
    const panel = document.getElementById(target);
    if (panel) panel.open = true;
  }}, label);
}

const topic = {
  ambiance: 'Formats et ambiances évoqués',
  experiences: 'Pistes d’activités et d’événements',
  destination: 'Critères de destination et de logistique',
  limites: 'Situations et limites signalées',
  surprises: 'Idées de surprises et d’attentions',
};
function synthesis(theme) {
  const signals = items => el('ul', {class: 'plain'}, items.map(item =>
    el('li', {}, jump(item.label, item.target), ' · ' + item.count + ' ' + (item.count === 1 ? 'sélection' : 'sélections') + ' · ' + percent(item.count, item.answered))));
  return el('details', {'data-key': 'theme-' + theme.id}, el('summary', {}, theme.name),
    theme.agreements.length > 0 && [el('h3', {}, 'Préférences convergentes'), signals(theme.agreements)],
    theme.signals.length > 0 && [el('h3', {class: 'stack'}, topic[theme.id]), signals(theme.signals)],
    theme.divergences.length > 0 && [
      el('h3', {class: 'stack'}, 'Avis divergents'),
      el('ul', {class: 'plain'}, theme.divergences.map(item => el('li', {}, jump(item.text, item.target))))],
    theme.uncertain.length > 0 && [
      el('h3', {class: 'stack'}, 'À vérifier'),
      el('ul', {class: 'plain'}, theme.uncertain.map(item =>
        el('li', {}, jump(item.title, item.target), ' · ' + (item.answered ? item.count + ' réponse(s) incertaine(s)' : 'aucune réponse'))))],
    !theme.signals.length && !theme.uncertain.length && el('p', {class: 'muted'}, 'Aucun choix enregistré dans ce thème.'));
}

function questionEditor(current, publish) {
  const panel = el('details', {class: 'card'});
  const list = el('div', {class: 'editor-list'});
  const message = el('p', {class: 'status', role: 'status'});
  const versionNode = el('p', {class: 'muted'});
  const form = el('form', {onsubmit: save}, versionNode, list);
  let definition;
  let questions;
  const saveButton = el('button', {type: 'submit'}, 'Publier les modifications');
  const add = button('Ajouter une question', () => {
    questions.push({id: 'q-' + crypto.randomUUID(), theme: 'experiences', title: '', prompt: '', hint: '', labels: []});
    draw(questions.length - 1);
    list.lastElementChild.querySelector('input')?.focus();
  });
  form.append(el('div', {class: 'line'}, add, saveButton), message);
  panel.append(el('summary', {}, 'Modifier le questionnaire'), form);

  async function save(event) {
    event.preventDefault();
    saveButton.disabled = true;
    try {
      const next = await publish({version: definition.version, questions});
      tell(message, 'Version ' + next.version + ' publiée.');
      reset(next);
    } catch (failure) {
      tell(message, failure.message, true);
    } finally {
      saveButton.disabled = false;
    }
  }

  function draw(open = -1) {
    list.replaceChildren(...questions.map((question, index) => {
      const heading = el('summary', {}, (index + 1) + '. ' + (question.title || 'Nouvelle question'));
      const field = (label, fieldName, limit, multiline = false) => el('label', {class: 'editor-field'}, label,
        el(multiline ? 'textarea' : 'input', {
          value: multiline ? null : question[fieldName], maxlength: limit, required: fieldName !== 'hint',
          rows: multiline ? 2 : null, oninput: event => {
            question[fieldName] = event.target.value;
            if (fieldName === 'title') heading.textContent = (index + 1) + '. ' + (question.title || 'Nouvelle question');
          },
        }, multiline ? question[fieldName] : null));
      const move = (step, label) => {
        const target = index + step;
        return target >= 0 && target < questions.length && button(label, () => {
          [questions[index], questions[target]] = [questions[target], question];
          draw(target);
          list.children[target].querySelector('summary').focus();
        });
      };
      return el('details', {open: index === open}, heading,
        el('div', {class: 'line'}, move(-1, 'Monter'), move(1, 'Descendre'),
          el('label', {class: 'checkline'}, el('input', {type: 'checkbox', checked: question.hidden,
            onchange: event => { question.hidden = event.target.checked; }}), 'Masquer')),
        field('Titre', 'title', 160), field('Question', 'prompt', 600, true), field('Précision facultative', 'hint', 600),
        el('label', {class: 'editor-field'}, 'Thème', el('select', {onchange: event => { question.theme = event.target.value; }},
          Object.entries(themes).map(([id, label]) => el('option', {value: id, selected: id === question.theme}, label)))),
        el('label', {class: 'editor-field'}, question.kind === 'matrix' ? 'Activités, une par ligne' : 'Choix, un par ligne. Champ vide pour une réponse libre facultative.',
          el('textarea', {rows: 4, oninput: event => { question.labels = event.target.value.split('\n').map(line => line.trim()).filter(Boolean); }},
            question.labels.join('\n'))));
    }));
  }

  function reset(next) {
    definition = next;
    questions = next.questions.map(question => ({
      ...question, labels: question.kind === 'matrix' ? matrixLabels(question) : Object.values(question.options),
    }));
    versionNode.textContent = 'Version ' + next.version + ' en ligne. Les brouillons et les réponses existantes gardent leur version.';
    draw();
  }
  reset(current);
  return panel;
}

export async function startAdmin() {
  document.body.classList.add('wide');
  let data = await api('/api/admin');
  let signature = JSON.stringify(data);
  let includeOrganizer = false;
  let updating = false;
  const current = () => data.versions.at(-1);
  const status = el('p', {class: 'status', role: 'status'});
  const indicators = el('div', {class: 'stats'});
  const summaries = el('div');
  const distributions = el('div');
  const participants = el('div');
  const organizer = el('div');
  const search = el('input', {type: 'search', placeholder: 'Rechercher un prénom', 'aria-label': 'Rechercher un prénom', oninput: drawParticipants});
  const filter = el('select', {'aria-label': 'Filtrer les participations', onchange: drawParticipants},
    ['Toutes', 'Terminées', 'En cours', 'Exclues'].map((name, index) => el('option', {value: index}, name)));
  const publicUrl = location.origin + '/';

  function replace(container, children) {
    const open = new Set([...container.querySelectorAll('details[open][data-key]')].map(node => node.dataset.key));
    container.replaceChildren(...children);
    for (const node of container.querySelectorAll('details[data-key]')) if (open.has(node.dataset.key)) node.open = true;
  }

  async function refresh(force = false) {
    if (updating) return;
    updating = true;
    try {
      const next = await api('/api/admin');
      const nextSignature = JSON.stringify(next);
      if (force || nextSignature !== signature) {
        data = next;
        signature = nextSignature;
        redraw();
      }
      tell(status);
    } catch (failure) {
      tell(status, 'Actualisation indisponible. ' + failure.message, true);
    } finally {
      updating = false;
    }
  }

  async function mutate(entry, remove = false) {
    if (remove && !confirm('Supprimer définitivement la participation de ' + (entry.name || 'cette personne') + ' ?')) return;
    try {
      await api('/api/admin/participants/' + entry.id, remove
        ? {method: 'DELETE'}
        : {method: 'PATCH', body: {excluded: !entry.excluded}});
      await refresh(true);
    } catch (failure) {
      tell(status, failure.message, true);
    }
  }

  function drawParticipants() {
    const name = normalize(search.value.trim());
    const wanted = Number(filter.value);
    const rows = data.responses.filter(entry => (!name || normalize(entry.name || '').includes(name)) &&
      (!wanted || (wanted === 1 && entry.submittedAt && !entry.excluded) ||
        (wanted === 2 && !entry.submittedAt && !entry.excluded) || (wanted === 3 && entry.excluded)));
    replace(participants, rows.length ? rows.map(entry => individual(entry, data.versions, [
      button(entry.excluded ? 'Réintégrer' : 'Exclure des statistiques', () => mutate(entry)),
      button('Supprimer', () => mutate(entry, true), 'secondary danger'),
    ])) : [el('p', {class: 'muted'}, 'Aucune participation pour ce filtre.')]);
  }

  function redraw() {
    const completed = data.responses.filter(entry => entry.submittedAt);
    const last = data.responses.map(entry => entry.submittedAt || entry.updatedAt).filter(Boolean).sort().at(-1);
    const result = analyze(data, includeOrganizer);
    indicators.replaceChildren(...[
      ['Réponses reçues', completed.length], ['Questionnaires terminés inclus', result.respondentCount],
      ['Brouillons en cours', data.responses.filter(entry => !entry.submittedAt && !entry.excluded).length],
      ['Dernière participation', date(last)],
    ].map(([label, value]) => el('div', {}, el('strong', {}, String(value)), el('span', {}, label))));
    replace(summaries, result.byTheme.map(synthesis));
    replace(distributions, result.results.map(score));
    drawParticipants();
    replace(organizer, [
      el('div', {class: 'line'}, el('a', {href: '/organisateur'},
        data.organizer ? 'Modifier ton avis privé' : 'Ajouter ton avis privé'),
      data.organizer && el('label', {class: 'checkline'},
        el('input', {type: 'checkbox', checked: includeOrganizer, onchange: event => {
          includeOrganizer = event.target.checked;
          redraw();
          organizer.querySelector('input')?.focus();
        }}), 'Inclure ton avis dans les analyses et exports')),
      data.organizer && individual(data.organizer, data.versions),
    ].filter(Boolean));
  }

  const copy = el('input', {readonly: true, value: publicUrl, 'aria-label': 'Lien public du questionnaire'});
  render(
    hero('Espace organisateur', 'Tableau de bord EVG', 'Les résultats s’actualisent automatiquement toutes les 15 secondes.'),
    el('section', {class: 'card'}, el('h2', {}, 'Partager le questionnaire'), el('div', {class: 'line'}, copy,
      button('Copier le lien', async () => {
        try {
          await navigator.clipboard.writeText(publicUrl);
          tell(status, 'Lien copié.');
        } catch {
          copy.select();
          tell(status, 'Le lien est sélectionné. Tu peux le copier.');
        }
      }), el('a', {href: publicUrl, target: '_blank', rel: 'noopener'}, 'Ouvrir le questionnaire')), status),
    el('section', {class: 'card'}, el('h2', {}, 'Participations'), indicators,
      el('div', {class: 'line stack'}, search, filter), participants),
    el('section', {class: 'card'}, el('h2', {}, 'Synthèse des avis'),
      el('p', {class: 'muted'}, 'Une préférence apparaît comme convergente à partir de deux sélections et de 75 % des répondants à la question. Ces avis donnent des pistes à confirmer avec Valentin.'), summaries),
    el('section', {class: 'card'}, el('h2', {}, 'Résultats par question'),
      el('p', {class: 'muted'}, 'Chaque pourcentage utilise le nombre de personnes ayant répondu à cette question, y compris par un commentaire seul. Avec plusieurs choix possibles, la somme peut dépasser 100 %. Les questions dont le contenu a changé ont leurs propres résultats.'), distributions),
    questionEditor(current(), async payload => {
      await api('/api/admin/questions', {method: 'PUT', body: payload});
      data = await api('/api/admin');
      signature = JSON.stringify(data);
      redraw();
      return current();
    }),
    el('section', {class: 'card'}, el('h2', {}, 'Avis de l’organisateur'), organizer),
    el('section', {class: 'card'}, el('h2', {}, 'Exporter les résultats'),
      el('p', {class: 'muted'}, 'Les exports contiennent les questionnaires terminés. Les participations exclues sont signalées dans les fichiers.'),
      el('div', {class: 'line'},
        button('Exporter CSV', () => download('evg-valentin.csv', exportCsv(data, includeOrganizer), 'text/csv;charset=utf-8')),
        button('Exporter JSON', () => download('evg-valentin.json', JSON.stringify({
          versions: data.versions, responses: data.responses.filter(entry => entry.submittedAt),
          organizer: includeOrganizer ? data.organizer : undefined, analyses: analyze(data, includeOrganizer),
        }, null, 2), 'application/json')))));
  redraw();
  window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
}
