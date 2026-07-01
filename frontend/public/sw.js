// RuralCaixa Service Worker - DISABLED FOR DEBUGGING
// This SW is intentionally disabled to eliminate caching-related errors.
// Security & authentication are NOT affected (JWT in localStorage is independent).
// Only offline support is lost.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Clear all caches
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => {
      self.clients.claim();
      // Notify all clients to unregister this SW
      return self.clients.matchAll();
    }).then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_DISABLED',
          message: 'Service Worker has been disabled'
        });
      });
    })
  );
});

// Disable all fetch interception - let browser handle everything
self.addEventListener('fetch', () => {
  // Do nothing - let fetch go through normally
});
