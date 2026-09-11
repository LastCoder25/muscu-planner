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

/* 🔔 PUSH — la seule chose que ce service worker fait en plus du passe-plat.
   ⚠️ Il n'invente RIEN : le titre et le texte viennent du serveur, qui les tient du
   client (`planPushes`). Un repli existe quand même, parce qu'un push sans charge
   utile arrive parfois (certains navigateurs en envoient pour re-négocier
   l'abonnement) et qu'une notification vide serait pire que pas de notification. */
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = {};
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Muscu', {
      body: d.body || 'Il se passe quelque chose dans ton aventure.',
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
      // ⚠️ Le `tag` REMPLACE une notification de même nature au lieu d'en empiler une
      // seconde : après trois jours d'absence, on ne veut pas dérouler trois alertes
      // de convoi. `renotify` fait quand même vibrer pour la plus récente.
      tag: d.tag || d.url || 'muscu',
      renotify: true,
      data: { url: d.url || '/' },
    }),
  );
});

/* Taper la notification ouvre l'app SUR LE BON ÉCRAN — et réutilise l'onglet déjà
   ouvert plutôt que d'en empiler un nouveau à chaque fois.
   ⚠️ On ne fait PAS `client.navigate(url)` : c'est un RECHARGEMENT complet (l'écran en
   cours est perdu), et il est REFUSÉ sur un onglet que ce service worker ne contrôle
   pas encore — la notification ne faisait alors que ramener l'onglet au premier plan,
   sur l'écran où on l'avait laissé. On envoie l'URL à l'app (boot/pwa.ts), qui route
   EN PLACE par le routeur. Sans onglet ouvert, on en ouvre un directement sur l'URL. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const c = all.find((w) => 'focus' in w);
      if (c) {
        await c.focus();
        c.postMessage({ type: 'navigate', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
