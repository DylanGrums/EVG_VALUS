import {api, el, hero, render, tell} from './common.js';
import {matrixLabels, reactions, optionsFor, special, themes} from './questions.js';

const emptyAnswer = () => ({choices: [], comment: ''});
const answered = answer => Boolean(answer && (answer.choices.length || answer.comment.trim()));

const attemptStorage = 'evg-participation';
const rememberedAttempt = () => {
  try { return localStorage.getItem(attemptStorage); } catch { return null; }
};
const rememberAttempt = attempt => {
  try { localStorage.setItem(attemptStorage, attempt); } catch { /* Private storage may be disabled. */ }
};
const createAttempt = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
  byte.toString(16).padStart(2, '0')).join('');

export async function startSurvey(organizer = false) {
  const path = organizer ? '/api/admin/organizer' : '/api/survey';
  let attempt;
  let state;
  if (organizer) {
    state = await api('/api/admin');
    state.definition = state.versions.find(entry => entry.version === state.organizer?.version) || state.versions.at(-1);
  } else {
    attempt = rememberedAttempt() || createAttempt();
    rememberAttempt(attempt);
    try {
      state = await api(path, {attempt});
    } catch (failure) {
      if (failure.status !== 410) throw failure;
      attempt = createAttempt();
      rememberAttempt(attempt);
      state = await api(path, {attempt});
    }
  }
  const {version} = state.definition;
  const questions = state.definition.questions.filter(question => !question.hidden);
  const last = questions.length + 1;
  const progressCount = draft => questions.filter(question => answered(draft.answers[question.id])).length;
  const startAnother = () => {
    rememberAttempt(createAttempt());
    location.assign('/');
  };
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
          method: submit ? 'POST' : 'PUT', attempt,
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
        : hero('Questionnaire EVG', 'Quel EVG pour Valentin ?', 'Ton avis aidera à imaginer un week-end qui lui ressemble. Réponds d’après ce que tu connais de lui et précise les points qui dépendent du contexte.'),
      form,
      !organizer && el('p', {class: 'muted small'}, questions.length + ' questions. Seul l’organisateur peut consulter tes réponses. Tu peux revenir sur ce navigateur pour reprendre ton brouillon.'),
    ];
  }

  function questionPage(question) {
    const current = () => draft.answers[question.id] || emptyAnswer();
    const optionNodes = new Map();
    const fieldset = el('fieldset', {}, el('legend', {}, 'Plusieurs choix possibles.'));
    const matrixSelects = [];
    if (question.kind === 'matrix') {
      fieldset.replaceChildren(el('legend', {}, 'Choisis une réponse pour chaque activité que tu connais.'));
      matrixLabels(question).forEach((label, i) => {
        const select = el('select', {onchange: event => {
          const answer = current();
          answer.choices = answer.choices.filter(c => !c.startsWith(i + '-') && !Object.hasOwn(special, c));
          if (event.target.value) answer.choices.push(event.target.value);
          for (const input of optionNodes.values()) input.checked = false;
          draft.answers[question.id] = answer;
          refreshProgress();
          schedule();
        }}, el('option', {value: ''}, 'Choisir une réponse'), reactions.map((r, j) => el('option', {value: i + '-' + j, selected: current().choices.includes(i + '-' + j)}, r)));
        matrixSelects.push(select);
        fieldset.append(el('label', {class: 'reaction'}, el('span', {}, label), select));
      });
    }
    for (const [key, label] of Object.entries(optionsFor(question))) {
      const isSpecial = Object.hasOwn(special, key);
      if (question.kind === 'matrix' && !isSpecial) continue;
      const check = el('input', {type: 'checkbox', checked: current().choices.includes(key),
        onchange: () => {
          const answer = current();
          const selected = answer.choices.filter(choice => choice !== key && !Object.hasOwn(special, choice));
          if (!check.checked) answer.choices = selected;
          else if (isSpecial) {
            answer.choices = [key];
            for (const select of matrixSelects) select.value = '';
          }
          else answer.choices = [...selected, key];
          draft.answers[question.id] = answer;
          for (const [id, input] of optionNodes) input.checked = answer.choices.includes(id);
          refreshProgress();
          schedule();
        }});
      optionNodes.set(key, check);
      fieldset.append(el('label', {class: isSpecial ? 'option option-special' : 'option'}, check, label));
    }
    return el('section', {class: 'card'}, el('p', {class: 'kicker'}, 'Question ' + draft.step + ' · ' + themes[question.theme]),
      el('h2', {tabindex: -1}, question.prompt), !question.optional && fieldset,
      el('label', {for: 'comment', class: 'field'}, question.optional ? 'Ta réponse (facultative)' : 'Commentaire ou autre idée (facultatif)'),
      question.hint && el('p', {id: 'hint', class: 'muted small'}, question.hint),
      el('textarea', {id: 'comment', rows: question.optional ? 5 : 2, maxlength: 2000, 'aria-describedby': question.hint ? 'hint' : null,
        oninput: event => {
          draft.answers[question.id] = {...current(), comment: event.target.value};
          refreshProgress();
          schedule();
        }}, current().comment),
      el('div', {class: 'controls'}, el('div', {class: 'line'}, button('Retour', () => go(draft.step - 1), true), saveButton()),
        button(draft.step === questions.length ? 'Relire mes réponses' : 'Continuer', () => go(draft.step + 1))),
      status, organizerBack());
  }

  function reviewPage() {
    const missing = questions.find(question => !question.optional && !answered(draft.answers[question.id]));
    const submit = button(organizer ? 'Enregistrer mon avis' : 'Envoyer mes réponses', async () => {
      if (sending) return;
      if (!organizer && missing) { go(questions.indexOf(missing) + 1); tell(status, 'Renseigne cette question avant l’envoi.', true); return; }
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
      el('ul', {class: 'review'}, questions.map((question, index) => {
        const answer = draft.answers[question.id];
        return el('li', {}, button((index + 1) + '. ' + question.title, () => go(index + 1), true),
          el('div', {class: 'small preserve'}, answered(answer) ? [answer.choices.map(key => optionsFor(question)[key]).join(' · '),
            answer.comment && el('div', {}, answer.comment)] : question.optional ? 'Facultatif' : 'À renseigner'));
      })),
      el('div', {class: 'controls'}, button('Retour', () => go(last - 1), true), submit), status, organizerBack());
  }

  function draw(focus = false) {
    if (done) render(hero('EVG de Valentin', 'Merci pour ton avis !', 'Tes réponses ont été envoyées à l’organisateur.'),
      button('Répondre pour une autre personne', startAnother, true));
    else if (draft.step === 0) render(...identityPage());
    else render(progressDisplay(), draft.step === last ? reviewPage() : questionPage(questions[draft.step - 1]),
      !organizer && button('Répondre pour une autre personne', () => {
        if (confirm('Ouvrir un autre questionnaire ? Le brouillon courant ne sera plus accessible sur cet appareil.')) startAnother();
      }, true));
    if (focus) {
      document.querySelector('main h1, main h2')?.focus({preventScroll: true});
      window.scrollTo(0, 0);
    }
  }
  draw();
}
