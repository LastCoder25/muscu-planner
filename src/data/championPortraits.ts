/**
 * 🖼️ LES PORTRAITS DE CHAMPIONS (v0.970 ; demandé par l'utilisateur : « possible d'avoir un
 * portrait pour chaque champion unique ? à la place de l'avatar par exemple », puis
 * « cherche des images sur une api si besoin. je ne veux pas gérer les images »).
 *
 * **SOURCE : DiceBear, style `pixel-art`, licence CC0** — domaine public, aucun crédit dû,
 * comme la base d'exercices du projet. Les fichiers sont **téléchargés et bundlés**
 * (`scripts/fetch-champion-portraits.mjs`), jamais chargés depuis l'API à l'exécution :
 * une dépendance réseau au rendu ajouterait de la latence et disparaîtrait un jour.
 *
 * ⚠️ **LE STYLE A ÉTÉ CHOISI À L'ŒIL**, quatre styles CC0 rendus côte à côte en grand ET
 * en 30 px : `pixel-art` est le seul qui dise « jeu », et le pixel art reste **lisible en
 * petit** — ce qui décide, puisque le Codex affiche les 32 portraits d'un coup.
 * (`notionists` fait employés de bureau, `open-peeps` fait illustration de startup.)
 *
 * ⚠️ **LE PROJET A DÉJÀ ABANDONNÉ DEUX VOIES PROCÉDURALES** — un bonhomme SVG (`figure.ts`)
 * et un humanoïde 3D (`Hero3D`) : **l'anatomie est ce que le procédural fait le plus mal**.
 * Ici, rien n'est dessiné par du code : ce sont des illustrations, simplement assemblées
 * de façon déterministe.
 *
 * ⚠️ **UNE TABLE EXPLICITE, PAS UNE CONVENTION DE NOM.** On pourrait deviner le chemin
 * depuis l'id et laisser le navigateur échouer en silence — mais alors rien ne pourrait
 * vérifier qu'un fichier existe, et un portrait manquant se verrait en production plutôt
 * qu'au test. C'est le patron de `exerciseImages`, et son test garde-fou.
 *
 * ⚠️ **SVG ET NON WebP** : les 32 pèsent **63 Ko au total**, dix fois moins qu'un jeu de
 * WebP 160 px — et ils restent nets à toute taille. Le service worker ne cache **rien**,
 * donc chaque octet est retéléchargé à chaque visite.
 */

/**
 * Champion id → chemin public de son portrait.
 *
 * ⚠️ **EXPORTÉE POUR QUE LE TEST LISE LA DONNÉE**, et non le texte du fichier : une regex
 * sur la source se désarme au premier reformatage (clé citée, indentation, ligne coupée)
 * et les tests passeraient alors **au vert en ne vérifiant plus rien** — exactement le mode
 * de panne que ce garde-fou existe pour éviter. Importer n'est pas recopier.
 */
export const CHAMPION_PORTRAITS: Readonly<Record<string, string>> = {
  anselme: '/champions/anselme.svg',
  atlas: '/champions/atlas.svg',
  aurore: '/champions/aurore.svg',
  barthe: '/champions/barthe.svg',
  boulin: '/champions/boulin.svg',
  brume: '/champions/brume.svg',
  corvin: '/champions/corvin.svg',
  ferrand: '/champions/ferrand.svg',
  fila: '/champions/fila.svg',
  fulgur: '/champions/fulgur.svg',
  gorm: '/champions/gorm.svg',
  kaell: '/champions/kaell.svg',
  lysandre: '/champions/lysandre.svg',
  miren: '/champions/miren.svg',
  molosse: '/champions/molosse.svg',
  nive: '/champions/nive.svg',
  nyx: '/champions/nyx.svg',
  oeildumonde: '/champions/oeildumonde.svg',
  ombrelune: '/champions/ombrelune.svg',
  orsene: '/champions/orsene.svg',
  roan: '/champions/roan.svg',
  sauge: '/champions/sauge.svg',
  sylve: '/champions/sylve.svg',
  tarn: '/champions/tarn.svg',
  teck: '/champions/teck.svg',
  tessa: '/champions/tessa.svg',
  ursk: '/champions/ursk.svg',
  ventcourt: '/champions/ventcourt.svg',
  verre: '/champions/verre.svg',
  vig: '/champions/vig.svg',
  ysolde: '/champions/ysolde.svg',
  zephyrine: '/champions/zephyrine.svg',
};

/**
 * Le portrait d'un champion, ou `null` s'il n'en a pas — l'appelant retombe alors sur
 * l'avatar et l'emoji, qui sont déjà uniques par champion.
 *
 * ⚠️ `Object.hasOwn` et non un accès direct : sur un objet littéral, `x['constructor']`
 * rendrait une FONCTION au lieu de rien. Inatteignable avec les ids réels, mais la porte
 * se ferme gratuitement.
 */
export function championPortrait(championId: string | null | undefined): string | null {
  if (!championId || !Object.hasOwn(CHAMPION_PORTRAITS, championId)) return null;
  return CHAMPION_PORTRAITS[championId] ?? null;
}
