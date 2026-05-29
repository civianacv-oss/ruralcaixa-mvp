// RuralCaixa Service Worker
const CACHE_NAME = 'ruralcaixa-v1';
const API = 'https://ruralcaixa-mvp-production.up.railway.app';

const STATIC_ASSETS = ['/', '/ovino'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API: NetworkFirst com fallback para cache
  if (url.origin === API || url.hostname.includes('railway')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Páginas: NetworkFirst
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Demais: CacheFirst
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
