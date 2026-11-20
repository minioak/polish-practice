/**
 * Offers to install the site as an app.
 * Shows an install button where the browser supports it (Chrome, Edge,
 * Android) and keeps the authored instructions for everyone else (iOS).
 * Hides itself once the app is running installed.
 * @param {Element} block
 */
export default function decorate(block) {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const section = block.closest('.section');
  if (standalone) {
    (section && section.querySelectorAll('.block').length === 1 ? section : block).hidden = true;
    return;
  }

  const content = document.createElement('div');
  content.className = 'install-content';
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => content.append(...cell.childNodes));
  });

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  block.classList.toggle('is-ios', ios);

  const actions = document.createElement('p');
  actions.className = 'install-actions';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button primary';
  button.textContent = 'Install the app';
  actions.append(button);
  actions.hidden = true;

  const showButton = () => { actions.hidden = !window.installPrompt; };
  button.addEventListener('click', async () => {
    const promptEvent = window.installPrompt;
    if (!promptEvent) return;
    window.installPrompt = null;
    promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    showButton();
  });
  window.addEventListener('installpromptready', showButton);
  window.addEventListener('appinstalled', () => { block.hidden = true; });

  block.replaceChildren(content, actions);
  showButton();
}
