// chunkReload.ts — récupérer un écran dont le chunk a disparu (redéploiement), cœur PUR.
//
// On redéploie plusieurs fois par jour : un onglet resté ouvert garde l'ANCIEN index, dont
// les chunks lazy n'existent plus. Vercel renvoie alors index.html à leur place (200, en
// text/html) et l'import à la volée échoue. La seule issue est de recharger la page.
//
// ⚠️ DEUX DÉFAUTS DE L'ANCIENNE RÉCUPÉRATION, reproduits par un banc Playwright :
//   1. elle rechargeait vers `to.fullPath` (« /stats ») alors que l'app est en mode HASH :
//      on atterrissait sur `/stats#/`, donc sur l'ACCUEIL, jamais sur l'écran demandé ;
//   2. son garde anti-boucle était un simple drapeau : s'il restait posé, plus AUCUNE
//      navigation ratée n'était récupérée — le retour arrière « ne faisait rien » jusqu'à
//      ce qu'on rafraîchisse à la main.

/** Messages d'un import dynamique raté, selon le navigateur (Chrome, Firefox, Safari). */
export function isChunkError(msg: string): boolean {
  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg)
  );
}

/** Durée pendant laquelle une seconde tentative est tenue pour une BOUCLE (le module
 *  manque vraiment, même après rechargement). Au-delà, c'est un nouveau redéploiement. */
export const CHUNK_RELOAD_WINDOW_MS = 15_000;

/** Peut-on recharger ? `stamp` = horodatage de la dernière tentative (texte du stockage).
 *  Oui s'il n'y en a pas, s'il est illisible, ou s'il est plus vieux que la fenêtre :
 *  un garde qui ne s'éteint jamais laisserait la navigation morte jusqu'au rafraîchissement. */
export function mayReloadForChunk(stamp: string | null, now: number): boolean {
  if (stamp === null) return true;
  const at = Number(stamp);
  if (!Number.isFinite(at)) return true;
  return now - at >= CHUNK_RELOAD_WINDOW_MS || at > now;
}

/** Destination du rechargement. En mode hash, la route vit dans le FRAGMENT : on garde
 *  l'URL de la page (origine + chemin + query) et on remplace seulement le fragment.
 *  En mode history, `routeHref` est déjà un chemin complet. */
export function chunkReloadUrl(currentHref: string, routeHref: string): string {
  if (routeHref.startsWith('#')) return currentHref.split('#')[0] + routeHref;
  return new URL(routeHref, currentHref).href;
}
