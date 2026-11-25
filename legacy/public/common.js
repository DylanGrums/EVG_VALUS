export const app = document.getElementById('app');

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

export function render(...children) {
  app.replaceChildren(...children);
  app.removeAttribute('aria-busy');
}

export function hero(kicker, title, description) {
  return el('section', {class: 'hero'},
    el('p', {class: 'kicker'}, kicker), el('h1', {tabindex: -1}, title),
    description && el('p', {}, description));
}

export function tell(node, message = '', failure = false) {
  node.classList.toggle('problem', failure);
  node.textContent = message;
}

export async function api(path, {method = 'GET', body, attempt} = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (attempt) headers['X-EVG-Attempt'] = attempt;
  const response = await fetch(path, {method, headers, body: JSON.stringify(body), cache: 'no-store'});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'La demande a échoué. Réessaie dans un instant.'), {status: response.status});
  return data;
}

async function start() {
  const path = location.pathname.replace(/\/$/, '') || '/';
  try {
    if (path === '/admin') await (await import('./admin.js')).startAdmin();
    else await (await import('./survey.js')).startSurvey(path === '/organisateur');
  } catch (failure) {
    render(hero('EVG de Valentin', 'Impossible de charger cette page', failure.message),
      el('button', {onclick: () => location.reload()}, 'Réessayer'));
  }
}

void start();
