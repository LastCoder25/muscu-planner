// Boot PWA — capture l'invite d'installation et enregistre le service worker
// (production uniquement) pour rendre l'app installable sur mobile.
import { defineBoot } from '#q-app';
import { initInstallPrompt } from '@/composables/useInstallPrompt';

export default defineBoot(() => {
  initInstallPrompt();

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}pwa-sw.js`)
        .catch(() => undefined);
    });
  }
});
