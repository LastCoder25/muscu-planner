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

/** Faut-il un vrai retour arrière ? Non si l'on est entré DIRECTEMENT sur l'écran (lien,
 *  notification, rechargement, lancement de la PWA) : `router.back()` sortirait de l'app ou
 *  ne ferait RIEN — le « retour qui ne marche pas ». Vue Router note l'entrée précédente
 *  dans `history.state.back`. */
export function hasPreviousEntry(prevUrl: string | null | undefined): boolean {
  return typeof prevUrl === 'string' && prevUrl.length > 0;
}

/** Retour arrière, avec un REPLI quand il n'y a pas d'entrée précédente. */
export function backOr(router: Router, fallback: string): void {
  if (hasPreviousEntry(previousUrl())) router.back();
  else void router.push(fallback);
}

/** Écrans de PASSAGE : une séance en cours ou sa préparation, un assistant de création.
 *  On les traverse, on n'y revient pas en appuyant sur « retour » depuis une page du menu —
 *  signalé : le retour de l'en-tête ramenait à la génération de séance du Défi 360. */
const FLOW_PAGES: readonly RegExp[] = [
  /^\/combo\/[^/]+\/session$/, // génération + séance du Défi 360
  /^\/session\/[^/]+(\/ready)?$/, // séance en cours, forme du jour
  /^\/free$/, // séance libre
  /^\/court\/[^/]+$/, // séance de tennis en cours, génération (/court/new)
  /^\/(combo|challenges)\/new$/, // assistants de création
  /^\/import$/,
];

/** L'URL désigne-t-elle un écran de passage ? */
export function isFlowPage(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false;
  const path = pathOf(url);
  return FLOW_PAGES.some((re) => re.test(path));
}

/** Le retour de l'EN-TÊTE : comme `backOr`, mais un écran de passage derrière soi ne compte
 *  pas comme une page où revenir — on rejoint le repli (l'accueil) à la place. */
export function headerBack(router: Router, fallback: string): void {
  const prev = previousUrl();
  if (hasPreviousEntry(prev) && !isFlowPage(prev)) router.back();
  else void router.push(fallback);
}

/** Rejoint `target` en retirant l'écran courant de l'historique, SANS jamais y laisser
 *  de doublon. À utiliser partout où l'on écrivait `router.replace(<page d'où l'on vient>)`. */
export function backOrReplace(router: Router, target: string): void {
  if (shouldGoBack(previousUrl(), target)) router.back();
  else void router.replace(target);
}
