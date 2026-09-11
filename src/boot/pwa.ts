// Boot PWA — capture l'invite d'installation et enregistre le service worker
// (production uniquement) pour rendre l'app installable sur mobile.
import { defineBoot } from '#q-app';
import { initInstallPrompt } from '@/composables/useInstallPrompt';
import { useGamePanel } from '@/composables/useGamePanel';

export default defineBoot(({ router }) => {
  initInstallPrompt();

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}pwa-sw.js`)
        .catch(() => undefined);
    });
    // 🔔 Tap sur une notification push : le service worker nous dit OÙ aller (il ne
    // connaît que des URL), et on y va EN PLACE — pas de rechargement, l'écran en
    // cours n'est pas perdu. `openPath` choisit volet droit ou plein écran selon le
    // cockpit. Seules les URL relatives au site sont acceptées.
    const { openPath } = useGamePanel();
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as { type?: unknown; url?: unknown } | null;
      if (d?.type === 'navigate' && typeof d.url === 'string' && d.url.startsWith('/'))
        openPath(router, d.url);
    });
  }
});
