/*
 * The worker can control only the GitHub Pages origin that serves this file.
 * It cannot control, inspect, or cache the Google Apps Script iframe document
 * because that document belongs to a different origin.
 */
const CACHE_NAME = 'salary-pwa-v2';
const CACHE_PREFIX = 'salary-pwa-';
const APP_SHELL_PATHS = ['./index.html', './manifest.json'];
const STATIC_DESTINATIONS = new Set([
  'style',
  'script',
  'image',
  'font',
  'manifest',
  'worker',
]);

const scopeUrl = () => new URL(self.registration.scope);

const appShellUrl = (path) => new URL(path, scopeUrl()).href;

const isWithinScope = (url) => {
  const scope = scopeUrl();
  return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
};

const isCacheableResponse = (response) =>
  response && (response.ok || response.type === 'opaque');

const putInCache = (request, response) => {
  if (!isCacheableResponse(response)) {
    return Promise.resolve();
  }

  return caches.open(CACHE_NAME)
    .then((cache) => cache.put(request, response.clone()))
    .catch(() => undefined);
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_PATHS.map(appShellUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) =>
            cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME
          )
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);
  const sameOrigin = requestUrl.origin === self.location.origin;

  /*
   * A cross-origin iframe navigation must pass through untouched. This is
   * essential for Google Apps Script and avoids pretending its dynamic
   * server-side functions work offline.
   */
  if (!sameOrigin) {
    if (
      request.mode !== 'navigate' &&
      STATIC_DESTINATIONS.has(request.destination) &&
      request.mode === 'no-cors'
    ) {
      /*
       * Best effort only: when the browser dispatches a static cross-origin
       * subresource through this worker, an opaque response can be cached.
       * The Google iframe's own document/resources normally remain outside
       * this worker's control and therefore are not affected.
       */
      event.respondWith(
        fetch(request)
          .then((response) => {
            event.waitUntil(putInCache(request, response));
            return response;
          })
          .catch(() => caches.match(request))
      );
    }
    return;
  }

  if (!isWithinScope(requestUrl)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          event.waitUntil(putInCache(appShellUrl('./index.html'), response));
          return response;
        })
        .catch(() => caches.match(appShellUrl('./index.html')))
    );
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination)) {
    return;
  }

  /*
   * Cache-first gives the shell a reliable offline path. A successful network
   * response refreshes the entry so the next visit receives the new version.
   */
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        const networkResponse = fetch(request)
          .then((response) => {
            event.waitUntil(putInCache(request, response));
            return response;
          })
          .catch(() => undefined);

        return cachedResponse || networkResponse.then(
          (response) => response || Response.error()
        );
      })
  );
});
