// nav.ts — retour arrière sans doublon d'historique (cœur PUR + une pincée de plomberie).
//
// ⚠️ LE PIÈGE QU'ON CORRIGE ICI. Quand un écran « se retire de l'historique » en faisant
// `router.replace(liste)` — abandonner un défi, terminer une séance de Défi 360 — l'intention
// est bonne : ne pas revenir sur un écran devenu caduc. Mais si l'on VENAIT de cette liste,
// on obtient deux entrées adjacentes identiques :
//
//     [ /, /challenges, /challenges/42 ]  --replace('/challenges')-->  [ /, /challenges, /challenges ]
//
// Le bouton retour paraît alors MORT : il fonctionne, mais il mène à la même page. Il faut
// appuyer deux fois. C'est le fameux « parfois le retour ne marche pas » — parfois, parce
// que cela ne se produit que si l'on est arrivé depuis la liste.
//
// La bonne opération dans ce cas n'est pas `replace` mais `back` : on atteint exactement la
// même page ET l'entrée caduque disparaît de l'historique. Même résultat, sans le doublon.

import type { Router } from 'vue-router';

/** Chemin d'une URL, query et fragment retirés (l'historique stocke des URL complètes). */
export function pathOf(url: string): string {
  return url.split('?')[0]!.split('#')[0]!;
}

/** Deux URL désignent-elles la même PAGE ? On ignore la query : `/muscu?tab=hist` et
 *  `/muscu` sont le même écran, et revenir de l'un à l'autre ne se voit pas. */
export function samePage(a: string, b: string): boolean {
  return pathOf(a) === pathOf(b);
}

/** Faut-il revenir en arrière plutôt que remplacer l'entrée courante ?
 *  Oui — et seulement — si l'entrée précédente EST déjà la destination visée. */
export function shouldGoBack(prevUrl: string | null | undefined, target: string): boolean {
  return typeof prevUrl === 'string' && samePage(prevUrl, target);
}

/** URL de l'entrée précédente selon Vue Router (`null` si on est entré directement). */
function previousUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const back = (window.history.state as { back?: unknown } | null)?.back;
  return typeof back === 'string' ? back : null;
}

/** Rejoint `target` en retirant l'écran courant de l'historique, SANS jamais y laisser
 *  de doublon. À utiliser partout où l'on écrivait `router.replace(<page d'où l'on vient>)`. */
export function backOrReplace(router: Router, target: string): void {
  if (shouldGoBack(previousUrl(), target)) router.back();
  else void router.replace(target);
}
