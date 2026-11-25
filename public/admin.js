import {api, el, hero, render, tell} from './common.js';
import {analyze, exportCsv} from './analysis.js';
import {optionsFor, questions, themes, version} from './questions.js';

const statusNames = {new: 'En attente', draft: 'Brouillon en cours', submitted: 'Réponse reçue'};
const total = 4;
const date = timestamp => new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris',
}).format(new Date(timestamp));

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = el('a', {href: url, download: filename});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function individual(entry, heading) {
  return el('details', {}, el('summary', {}, heading),
    el('p', {class: 'muted small'}, date(entry.submittedAt || entry.updatedAt)),
    el('ul', {class: 'plain'}, questions.map(question => {
      const answer = entry.answers[question.id];
      if (!answer || (!answer.choices.length && !answer.comment)) return null;
      return el('li', {},
        el('strong', {}, question.id + '. ' + question.title),
        el('div', {}, answer.choices.map(key => optionsFor(question)[key]).join(' · ')),
        answer.comment && el('div', {class: 'preserve quote'}, answer.comment));
    })));
}

function score(result) {
  const question = result.question;
  return el('details', {id: 'question-' + question.id},
    el('summary', {}, question.id + '. ' + question.title + ' · ' + result.answered + ' renseignée(s)'),
    el('p', {class: 'muted'}, question.prompt),
    Object.entries(result.labels).map(([key, label]) => {
      const voters = result.votes[key];
      return el('div', {class: 'metric'}, el('span', {}, label), el('strong', {}, voters.length + ' / ' + result.answered),
        result.answered > 0 && el('progress', {value: voters.length, max: result.answered, 'aria-label': label}),
        voters.length > 0 && el('small', {}, voters.join(', ')));
    }),
    result.divergences.length > 0 && el('p', {class: 'stack'}, el('strong', {}, 'À départager · '), result.divergences.join(' · ')),
    result.comments.map(comment => el('div', {class: 'quote'}, el('strong', {}, comment.who), el('div', {class: 'preserve'}, comment.text))));
}

function jump(label, question) {
  return el('a', {href: '#question-' + question, onclick: () => {
    const panel = document.getElementById('question-' + question);
    if (panel) panel.open = true;
  }}, label);
}

function synthesis(theme) {
  return el('details', {}, el('summary', {}, theme.name),
    el('h3', {}, 'Choix partagés'),
    theme.agreements.length ? el('ul', {class: 'plain'}, theme.agreements.map(item =>
      el('li', {}, jump(item.label, item.question), ' · ' + item.count + ' / ' + item.answered))) : el('p', {class: 'muted'}, 'Aucune proposition cochée par au moins deux personnes.'),
    theme.divergences.length > 0 && [
      el('h3', {class: 'stack'}, 'Réponses à départager'),
      el('ul', {class: 'plain'}, theme.divergences.map(item => el('li', {}, jump(item.text, item.question)))),
    ],
    theme.uncertain.length > 0 && [
      el('h3', {class: 'stack'}, 'Points à éclaircir'),
      el('ul', {class: 'plain'}, theme.uncertain.map(item => el('li', {}, jump(item.title, item.question),
        item.answered ? ' · ' + item.unknown + ' « Je ne sais pas »' : ' · aucune réponse'))),
    ]);
}

export async function startAdmin() {
  document.body.classList.add('wide');
  let data = await api('/api/admin');
  let includeOrganizer = false;
  const status = el('p', {class: 'status', role: 'status'});
  const output = el('div');
  const invitations = el('div');
  const counts = el('span', {class: 'count'});

  function drawInvitations() {
    const create = el('button', {type: 'button', onclick: async () => {
      create.disabled = true;
      try {
        await api('/api/admin/invites', {method: 'POST', body: {}});
        await refresh();
        tell(status, 'Les quatre liens sont prêts.');
      } catch (failure) {
        create.disabled = false;
        tell(status, failure.message, true);
      }
    }}, 'Créer les quatre liens');
    const tiles = data.invites.map(invite => {
      const url = new URL('/', location.origin);
      url.hash = new URLSearchParams({invitation: invite.token}).toString();
      return el('div', {class: 'tile'}, el('h3', {}, 'Lien ' + invite.slot), el('p', {class: 'tag'}, statusNames[invite.status]),
        el('div', {class: 'line'}, el('button', {type: 'button', class: 'secondary', onclick: async () => {
          try {
            await navigator.clipboard.writeText(url.href);
            tell(status, 'Lien ' + invite.slot + ' copié.');
          } catch {
            const field = el('input', {type: 'text', readonly: true, value: url.href, 'aria-label': 'Lien ' + invite.slot});
            status.replaceChildren(field);
            field.focus();
            field.select();
          }
        }}, 'Copier'), el('a', {href: url.href, target: '_blank', rel: 'noopener noreferrer'}, 'Ouvrir')));
    });
    invitations.replaceChildren(
      el('h2', {}, 'Invitations'),
      el('p', {class: 'muted'}, 'Envoie un lien différent à chaque proche. Le même lien permet de reprendre le brouillon.'),
      tiles.length ? el('div', {class: 'grid'}, tiles) : create, status);
  }

  function drawResults() {
    counts.textContent = data.responses.length + ' / ' + total + ' réponses reçues';
    const stats = analyze(data.responses, data.organizer, includeOrganizer);
    const csv = el('button', {onclick: () => download('evg-valentin.csv', exportCsv(data, includeOrganizer), 'text/csv;charset=utf-8')}, 'Exporter CSV');
    const json = el('button', {class: 'secondary', onclick: () => download('evg-valentin.json', JSON.stringify({
      version, exportedAt: new Date().toISOString(), questions, themes, responses: data.responses,
      organizer: includeOrganizer ? data.organizer : null, analysis: stats,
    }, null, 2), 'application/json')}, 'Exporter JSON');
    output.replaceChildren(
      el('section', {class: 'card'},
        el('h2', {}, 'Réponses individuelles'),
        data.responses.length ? data.responses.map(entry => individual(entry, entry.name + ' · lien ' + entry.slot)) : el('p', {class: 'muted'}, 'Les réponses apparaîtront ici après envoi.'),
        el('div', {class: 'stack'}, el('a', {href: '/organisateur'}, data.organizer ? 'Modifier ton avis privé' : 'Ajouter ton avis privé')),
        data.organizer && individual(data.organizer, 'Ton avis · organisation'),
        data.organizer && el('label', {class: 'option stack'},
          el('input', {type: 'checkbox', checked: includeOrganizer, onchange: event => {
            includeOrganizer = event.target.checked;
            drawResults();
            document.getElementById('include-organizer').focus();
          }, id: 'include-organizer'}), 'Inclure ton avis dans les analyses et les exports'),
        el('div', {class: 'line stack'}, csv, json)),
      el('section', {class: 'card'},
        el('h2', {}, 'Synthèse par thème'),
        el('p', {class: 'muted'}, 'Les choix partagés sont cités par au moins deux personnes. Les divergences signalent des formats opposés ou un écart entre « aucune » et des choix exprimés. Les hésitations restent visibles.'),
        el('p', {class: 'muted small'}, stats.analyzedCount + ' avis analysé(s).'),
        stats.byTheme.map(synthesis)),
      el('section', {class: 'card'},
        el('h2', {}, 'Question par question'),
        el('p', {class: 'muted'}, 'Chaque choix est rapporté au nombre de personnes ayant renseigné la question. Une personne peut cocher plusieurs options.'),
        stats.results.map(score)));
  }

  async function refresh() {
    data = await api('/api/admin');
    drawInvitations();
    drawResults();
  }

  render(hero('Espace privé', 'Tableau de bord EVG', 'Partage les liens, puis retrouve les avis pour préparer le week-end.'),
    el('section', {class: 'card line'}, counts, el('button', {class: 'secondary', onclick: async () => {
      try { await refresh(); tell(status, 'Tableau de bord actualisé.'); }
      catch (failure) { tell(status, failure.message, true); }
    }}, 'Actualiser')), el('section', {class: 'card'}, invitations), output);
  drawInvitations();
  drawResults();
}
