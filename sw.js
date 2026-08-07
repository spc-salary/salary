const CACHE_NAME = 'salary-pwa-v1';
const APP_SHELL = ['./index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('salary-pwa-') && cacheName !== CACHE_NAME)
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
  const workerScope = new URL(self.registration.scope);

  // Never intercept external resources, APIs, or the Google Apps Script iframe.
  if (requestUrl.origin !== self.location.origin || !requestUrl.href.startsWith(workerScope.href)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', responseCopy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  const staticDestinations = new Set(['style', 'script', 'image', 'font', 'manifest', 'worker']);

  if (!staticDestinations.has(request.destination)) {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => cachedResponse || fetch(request).then((response) => {
        if (response.ok) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        }
        return response;
      }))
  );
});
