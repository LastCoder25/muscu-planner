import { defineRouter } from '#q-app';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';

import routes from './routes';
import { chunkReloadUrl, isChunkError, mayReloadForChunk } from '@/lib/chunkReload';

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default defineRouter((/* { store, ssrContext } */) => {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE),
  });

  // Redéploiements fréquents (Vercel) : un onglet resté ouvert garde l'ancien index, dont
  // les chunks lazy n'existent plus → l'import à la volée échoue. On recharge alors la page
  // VERS la destination (nouvel index, bons hash). Règles et pièges : src/lib/chunkReload.ts.
  const RELOAD_KEY = 'muscu:chunk-reload';

  // DESTINATION en cours : `vite:preloadError` ne porte pas la cible → on la mémorise ici.
  // Par défaut, la route du fragment (mode hash), jamais le chemin de la page.
  let pendingTarget =
    typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') || '/' : '/';
  Router.beforeEach((to) => {
    pendingTarget = to.fullPath;
    return true;
  });

  /** Recharge vers `target` ; rend false si une tentative vient d'échouer (boucle). */
  const reloadTo = (target: string): boolean => {
    if (!mayReloadForChunk(sessionStorage.getItem(RELOAD_KEY), Date.now())) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    const url = chunkReloadUrl(window.location.href, Router.resolve(target).href);
    // Changer seulement le fragment ne recharge pas : on réécrit l'URL SANS événement
    // (le routeur ne réagit pas), puis on recharge vraiment.
    window.history.replaceState(window.history.state, '', url);
    window.location.reload();
    return true;
  };

  Router.onError((err, to) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (isChunkError(msg)) reloadTo(to?.fullPath ?? pendingTarget);
  });
  // Nettoie le garde après une navigation réussie (chunk chargé).
  Router.afterEach(() => sessionStorage.removeItem(RELOAD_KEY));

  if (typeof window !== 'undefined') {
    window.addEventListener('vite:preloadError', (e) => {
      if (reloadTo(pendingTarget)) e.preventDefault();
    });
  }

  return Router;
});
