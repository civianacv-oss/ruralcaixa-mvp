// RuralCaixa Service Worker v2
const CACHE_NAME = 'ruralcaixa-v2';
const API = 'https://ruralcaixa-mvp-production.up.railway.app';

const STATIC_ASSETS = ['/', '/ovino'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => 
      cache.addAll(STATIC_ASSETS).catch(() => {
        console.warn('Alguns assets não puderam ser cacheados');
      })
    )
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
  // Ignora requisições não-GET (POST, PATCH, etc.) e requests para a API
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('railway.app')) return;

  const url = new URL(e.request.url);

  // API GET: NetworkFirst com fallback para cache
  if (url.hostname.includes('railway')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
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

  // Demais assets: CacheFirst
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request)).catch(() => caches.match(e.request))
  );
});
