import { summarisePath } from '../../scripts/progress.js';

/**
 * Warms the service worker cache with each deck page so decks work offline.
 * @param {string[]} hrefs Same-origin deck URLs
 */
function prefetchForOffline(hrefs) {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  const run = () => hrefs.forEach((href) => {
    fetch(href, { credentials: 'same-origin' }).catch(() => {});
  });
  if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 3000);
}

/**
 * Lists flash card decks with the learner's progress.
 * Each row: a link to a deck page, plus an optional description cell.
 * @param {Element} block
 */
export default function decorate(block) {
  const list = document.createElement('ul');
  list.className = 'decks-list';
  const offline = [];

  [...block.children].forEach((row) => {
    const link = row.querySelector('a[href]');
    if (!link) return;
    const url = new URL(link.href, window.location);
    const sameOrigin = url.origin === window.location.origin;
    const title = link.textContent.trim() || url.pathname;
    const description = [...row.children]
      .map((cell) => cell.textContent.replace(/\s+/g, ' ').trim())
      .filter((text) => text && text !== title)
      .join(' ');

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'decks-card';
    a.href = sameOrigin ? `${url.pathname}${url.search}` : url.href;

    const h3 = document.createElement('h3');
    h3.textContent = title;
    a.append(h3);
    if (description) {
      const p = document.createElement('p');
      p.className = 'decks-description';
      p.textContent = description;
      a.append(p);
    }

    const {
      total, learned, strength, started,
    } = sameOrigin
      ? summarisePath(url.pathname)
      : {
        total: 0, learned: 0, strength: 0, started: false,
      };
    const meter = document.createElement('div');
    meter.className = 'decks-progress';
    const bar = document.createElement('span');
    bar.className = 'decks-bar';
    const fill = document.createElement('span');
    const pct = Math.round(strength * 100);
    fill.style.width = `${pct}%`;
    bar.append(fill);
    const label = document.createElement('span');
    label.className = 'decks-label';
    if (!started || !total) label.textContent = 'Not started';
    else if (learned >= total) label.textContent = `All ${total} learned`;
    else label.textContent = `${learned} of ${total} learned`;
    meter.append(bar, label);
    if (total && learned >= total) li.classList.add('is-complete');
    a.append(meter);

    li.append(a);
    list.append(li);
    if (sameOrigin) offline.push(a.href);
  });

  block.replaceChildren(list);
  prefetchForOffline(offline);
}
