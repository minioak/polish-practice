/* Polish Practice service worker: keeps the app usable offline. */
/* eslint-env serviceworker */
/* eslint-disable no-restricted-globals */

const VERSION = '1';
const CODE_CACHE = `polish-practice-code-v${VERSION}`;
const PAGE_CACHE = `polish-practice-pages-v${VERSION}`;
const KEEP = [CODE_CACHE, PAGE_CACHE];

const CODE = [
  '/scripts/aem.js',
  '/scripts/scripts.js',
  '/scripts/progress.js',
  '/scripts/speech.js',
  '/scripts/consent-check.js',
  '/styles/styles.css',
  '/styles/fonts.css',
  '/styles/lazy-styles.css',
  '/fonts/roboto-regular.woff2',
  '/fonts/roboto-medium.woff2',
  '/fonts/roboto-bold.woff2',
  '/fonts/roboto-condensed-bold.woff2',
  '/blocks/header/header.js',
  '/blocks/header/header.css',
  '/blocks/footer/footer.js',
  '/blocks/footer/footer.css',
  '/blocks/fragment/fragment.js',
  '/blocks/fragment/fragment.css',
  '/blocks/flashcards/flashcards.js',
  '/blocks/flashcards/flashcards.css',
  '/blocks/decks/decks.js',
  '/blocks/decks/decks.css',
  '/blocks/install/install.js',
  '/blocks/install/install.css',
  '/manifest.webmanifest',
  '/icons/app-icon.svg',
  '/icons/icon-192.png',
];

const PAGES = ['/', '/nav.plain.html', '/footer.plain.html'];

const CODE_PATTERN = /\.(js|mjs|css|woff2?|svg|png|jpe?g|webp|gif|ico|webmanifest)$/;
const NETWORK_TIMEOUT = 4000;

async function addAll(cacheName, urls) {
  const cache = await caches.open(cacheName);
  // one missing file must not stop the worker installing
  await Promise.allSettled(urls.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
}

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([addAll(CODE_CACHE, CODE), addAll(PAGE_CACHE, PAGES)])
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key.startsWith('polish-practice-') && !KEEP.includes(key))
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

function cacheable(response) {
  return response && response.ok && response.type === 'basic' && !response.redirected;
}

/** Pages: fresh from the network when possible, cached copy when offline. */
async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT); }),
    ]);
    if (cacheable(response)) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const home = await cache.match('/');
      if (home) return home;
    }
    return new Response('You are offline and this page has not been saved yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Code and media: answer from cache instantly, refresh in the background. */
async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(CODE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((response) => {
    if (cacheable(response)) cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/.') || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.json')
    || !url.pathname.split('/').pop().includes('.')) {
    event.respondWith(networkFirst(request));
  } else if (CODE_PATTERN.test(url.pathname) || url.pathname.includes('/media_')) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
