import { defineRouter } from '#q-app';
import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';

import routes from './routes';

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

  // Redéploiements fréquents (Vercel) : les chunks lazy-loadés changent de hash à
  // chaque build. Un onglet resté ouvert garde l'ancien index → un import à la
  // volée peut 404 (« Failed to fetch dynamically imported module »). On recharge
  // alors la page vers la destination (récupère le nouvel index + les bons hash),
  // avec un garde anti-boucle si le module manque vraiment.
  const RELOAD_KEY = 'muscu:chunk-reload';
  const isChunkError = (msg: string): boolean =>
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg);

  // DESTINATION en cours de navigation : sur un `vite:preloadError` (le chunk de la route
  // ciblée a 404), l'event ne porte PAS la cible → on la mémorise ici pour recharger VERS
  // elle (et non recharger la page COURANTE, qui laissait le joueur sur place — « ça recharge
  // au lieu d'y aller » sur Aventure/Labyrinthe après un redéploiement).
  let pendingTarget = typeof window !== 'undefined' ? window.location.pathname : '/';
  Router.beforeEach((to) => {
    pendingTarget = to.fullPath;
    return true;
  });

  Router.onError((err, to) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isChunkError(msg)) return;
    if (sessionStorage.getItem(RELOAD_KEY)) return; // déjà retenté → évite la boucle
    sessionStorage.setItem(RELOAD_KEY, '1');
    window.location.assign(to?.fullPath ?? pendingTarget);
  });
  // Nettoie le garde après une navigation réussie (chunk chargé) → un futur
  // redéploiement pourra à nouveau déclencher un rechargement.
  Router.afterEach(() => sessionStorage.removeItem(RELOAD_KEY));

  if (typeof window !== 'undefined') {
    window.addEventListener('vite:preloadError', (e) => {
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, '1');
      e.preventDefault();
      // Recharge VERS la destination en cours (pas la page courante) → on arrive bien sur
      // l'écran demandé (Aventure/Labyrinthe) au lieu de rester là où on était.
      window.location.assign(pendingTarget);
    });
  }

  return Router;
});
