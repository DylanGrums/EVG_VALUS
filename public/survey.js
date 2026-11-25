import {api, el, hero, render, tell} from './common.js';
import {optionsFor, questions, special, themes, version} from './questions.js';

const last = questions.length + 1;
const emptyAnswer = () => ({choices: [], comment: ''});
const answered = answer => Boolean(answer && (answer.choices.length || answer.comment.trim()));
const progressCount = draft => questions.filter(question => answered(draft.answers[question.id])).length;

export async function startSurvey(organizer = false) {
  const token = new URLSearchParams(location.hash.slice(1)).get('invitation');
  if (!organizer && !token) {
    render(hero('EVG de Valentin', 'Ton invitation personnelle', 'Ouvre le lien que l’organisateur t’a envoyé pour commencer ou reprendre le questionnaire.'));
    return;
  }
  const path = organizer ? '/api/admin/organizer' : '/api/survey';
  const state = organizer ? await api('/api/admin') : await api(path, {token});
  const status = el('p', {class: 'status', role: 'status'});
  let revision = state.revision;
  let timer;
  let pending = Promise.resolve();
  let sending = false;
  let done = Boolean(state.submitted);
  const draft = state.draft || state.organizer || {version, name: organizer ? 'Organisateur' : '', step: 0, answers: {}};
  let saved = JSON.stringify(draft);
  const isDirty = () => JSON.stringify(draft) !== saved;

  window.addEventListener('beforeunload', event => {
    if (!done && isDirty()) event.preventDefault();
  });

  function schedule() {
    clearTimeout(timer);
    tell(status, 'Modifications en cours…');
    timer = setTimeout(() => { void save().catch(() => {}); }, 650);
  }

  function save(submit = false) {
    clearTimeout(timer);
    const snapshot = JSON.stringify(draft);
    const job = pending.then(async () => {
      if (done || (!submit && snapshot === saved)) return;
      tell(status, submit ? 'Envoi en cours…' : 'Sauvegarde en cours…');
      const data = JSON.parse(snapshot);
      try {
        const reply = await api(path, {
          method: submit ? 'POST' : 'PUT', token,
          body: organizer ? data : {draft: data, revision},
        });
        revision = reply.revision;
        saved = snapshot;
        done = Boolean(reply.submitted);
        tell(status, done ? 'Réponse envoyée.' : isDirty() ? 'Modifications en cours…' : 'Brouillon enregistré.');
      } catch (failure) {
        tell(status, 'Sauvegarde impossible. ' + failure.message, true);
        throw failure;
      }
    });
    pending = job.catch(() => {});
    return job;
  }

  function go(step) {
    draft.step = step;
    draw(true);
    void save().catch(() => {});
  }

  function button(label, action, secondary = false) {
    return el('button', {type: 'button', class: secondary ? 'secondary' : '', onclick: action}, label);
  }

  const saveButton = () => button('Enregistrer', () => { void save().then(() => tell(status, 'Brouillon enregistré.')).catch(() => {}); }, true);
  const organizerBack = () => organizer && el('a', {href: '/admin'}, 'Retour au tableau de bord');

  function progressDisplay() {
    return el('div', {}, el('div', {class: 'progress-row'}, el('span', {}, 'Progression'), el('span', {id: 'counter'}, progressCount(draft) + ' / ' + questions.length)),
      el('progress', {id: 'progress', max: questions.length, value: progressCount(draft), 'aria-label': 'Questions renseignées'}));
  }

  function refreshProgress() {
    document.getElementById('counter').textContent = progressCount(draft) + ' / ' + questions.length;
    document.getElementById('progress').value = progressCount(draft);
  }

  function identityPage() {
    const name = el('input', {id: 'name', name: 'name', type: 'text', maxlength: 60, value: draft.name,
      autocomplete: 'nickname', required: true, oninput: event => { draft.name = event.target.value; schedule(); }});
    const form = el('form', {class: 'card', onsubmit: event => {
      event.preventDefault();
      if (!draft.name.trim()) { name.focus(); tell(status, 'Indique un prénom ou un pseudonyme.', true); return; }
      go(1);
    }},
    el('h2', {}, organizer ? 'Réponses de l’organisateur' : 'Avant de commencer'),
    el('label', {for: 'name', class: 'field'}, 'Prénom ou pseudonyme'), name,
    el('div', {class: 'controls'}, organizerBack(), el('button', {type: 'submit'}, 'Commencer')), status);
    return [
      organizer ? hero('Espace privé', 'Ajouter ton avis', 'Renseigne seulement les réponses dont tu disposes. Tu pourras les inclure dans les analyses depuis le tableau de bord.')
        : hero('Questionnaire privé', 'Quel EVG pour Valentin ?', 'Ton avis aidera à imaginer un week-end qui lui ressemble. Réponds d’après ce que tu connais de lui et précise les points qui dépendent du contexte.'),
      form,
      !organizer && el('p', {class: 'muted small'}, '20 questions. Tes réponses sont réservées à l’organisateur. Tu peux faire une pause et revenir avec ce même lien.'),
    ];
  }

  function questionPage(question) {
    const current = () => draft.answers[question.id] || emptyAnswer();
    const optionNodes = new Map();
    const fieldset = el('fieldset', {}, el('legend', {}, 'Plusieurs choix possibles.'));
    for (const [key, label] of Object.entries(optionsFor(question))) {
      const isSpecial = Object.hasOwn(special, key);
      const check = el('input', {type: 'checkbox', checked: current().choices.includes(key),
        onchange: () => {
          const answer = current();
          const selected = answer.choices.filter(choice => choice !== key && !Object.hasOwn(special, choice));
          if (!check.checked) answer.choices = selected;
          else if (isSpecial) answer.choices = [key];
          else answer.choices = [...selected, key];
          draft.answers[question.id] = answer;
          for (const [id, input] of optionNodes) input.checked = answer.choices.includes(id);
          refreshProgress();
          schedule();
        }});
      optionNodes.set(key, check);
      fieldset.append(el('label', {class: isSpecial ? 'option option-special' : 'option'}, check, label));
    }
    return el('section', {class: 'card'}, el('p', {class: 'kicker'}, 'Question ' + question.id + ' · ' + themes[question.theme]),
      el('h2', {tabindex: -1}, question.prompt), fieldset,
      el('label', {for: 'comment', class: 'field'}, 'Commentaire ou autre idée (facultatif)'),
      question.hint && el('p', {id: 'hint', class: 'muted small'}, question.hint),
      el('textarea', {id: 'comment', rows: 2, maxlength: 1000, 'aria-describedby': question.hint ? 'hint' : null,
        oninput: event => {
          draft.answers[question.id] = {...current(), comment: event.target.value};
          refreshProgress();
          schedule();
        }}, current().comment),
      el('div', {class: 'controls'}, el('div', {class: 'line'}, button('Retour', () => go(draft.step - 1), true), saveButton()),
        button(question.id === questions.length ? 'Relire' : 'Continuer', () => go(draft.step + 1))),
      status, organizerBack());
  }

  function reviewPage() {
    const missing = questions.find(question => !answered(draft.answers[question.id]));
    const submit = button(organizer ? 'Enregistrer mon avis' : 'Envoyer mes réponses', async () => {
      if (sending) return;
      if (!organizer && missing) { go(missing.id); tell(status, 'Renseigne cette question avant l’envoi.', true); return; }
      if (!organizer && !draft.name.trim()) { go(0); return; }
      sending = true;
      submit.disabled = true;
      try {
        await save(!organizer);
        if (organizer) location.assign('/admin');
        else draw(true);
      } catch {
        submit.disabled = false;
      } finally {
        sending = false;
      }
    });
    return el('section', {class: 'card'}, el('p', {class: 'kicker'}, 'Relecture'), el('h2', {tabindex: -1}, 'Tes réponses'),
      el('p', {}, 'Prénom ou pseudonyme · ' + draft.name + ' ', button('Modifier', () => go(0), true)),
      !organizer && el('p', {class: 'muted'}, missing
        ? 'Tu peux répondre avec un choix, « Je ne sais pas » ou un commentaire seul.'
        : 'Après l’envoi, tes réponses seront transmises à l’organisateur.'),
      el('ul', {class: 'review'}, questions.map(question => {
        const answer = draft.answers[question.id];
        return el('li', {}, button(question.id + '. ' + question.title, () => go(question.id), true),
          el('div', {class: 'small preserve'}, answered(answer) ? [answer.choices.map(key => optionsFor(question)[key]).join(' · '),
            answer.comment && el('div', {}, answer.comment)] : 'À renseigner'));
      })),
      el('div', {class: 'controls'}, button('Retour', () => go(last - 1), true), submit), status, organizerBack());
  }

  function draw(focus = false) {
    if (done) render(hero('EVG de Valentin', 'Merci pour ton avis !', 'Tes réponses ont été envoyées à l’organisateur.'));
    else if (draft.step === 0) render(...identityPage());
    else render(progressDisplay(), draft.step === last ? reviewPage() : questionPage(questions[draft.step - 1]));
    if (focus) {
      document.querySelector('main h1, main h2')?.focus({preventScroll: true});
      window.scrollTo(0, 0);
    }
  }
  draw();
}
