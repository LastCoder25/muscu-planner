/* Service worker minimal — sert uniquement à rendre l'app installable
   (écran d'accueil, lancement en standalone). PAS de cache : tout passe par
   le réseau, pour ne jamais servir une version périmée (l'app se déploie
   souvent). Aucun offline volontairement. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge d'éventuels caches laissés par une ancienne version.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Passe-plat réseau : présence d'un handler fetch = critère d'installabilité.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
