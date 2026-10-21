// crash.ts — capte les erreurs qui cassent l'affichage (Vue ET navigateur) pour `CrashPanel`.
// ⚠️ Toujours journalisées en console aussi : poser `errorHandler` fait taire celui de Vue.
import { defineBoot } from '#q-app';
import { reportCrash } from '@/composables/useCrash';

export default defineBoot(({ app }) => {
  app.config.errorHandler = (err, _instance, info) => {
    console.error(err);
    reportCrash(err, `vue · ${info}`);
  };
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => reportCrash(e.error ?? e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => reportCrash(e.reason, 'promesse rejetée'));
});
