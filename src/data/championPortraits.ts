/**
 * 🖼️ LES PORTRAITS DE CHAMPIONS (v0.971 ; demandé par l'utilisateur : « possible d'avoir un
 * portrait pour chaque champion unique ? », puis — les avatars d'abord livrés ayant été
 * refusés — « les portraits ne vont pas, mets des trucs mieux, des portraits d'aventuriers
 * de manga ou fantasy »).
 *
 * **32 illustrations, une par champion**, en art cel-shadé façon key visual de RPG
 * japonais. Générées par **Pollinations.ai** puis **téléchargées et versionnées**
 * (`scripts/fetch-champion-portraits.mjs`) : jamais chargées depuis un service à
 * l'exécution — une dépendance réseau au rendu ajouterait de la latence et finirait par
 * disparaître.
 *
 * ⚠️ **CE NE SONT PAS DES AVATARS GÉNÉRÉS PAR GRAINE.** La v0.970 livrait du `pixel-art`
 * DiceBear : déterministe, CC0, léger — et refusé, à raison. Un avatar de profil dit « un
 * utilisateur », pas « un aventurier » : il n'a ni âge, ni arme, ni histoire, et les 32 ne
 * se distinguaient que par une coiffure. Or **c'est la collection qui EST le jeu** dans un
 * gacha : chaque champion doit se reconnaître d'un coup d'œil.
 *
 * ⚠️ **CHAQUE PORTRAIT EST ÉCRIT, pas dérivé des champs.** `lineage` + `role` + `rarity` ne
 * font que 24 combinaisons pour 32 champions, et ne disent rien de ce qui les distingue
 * vraiment : leur PERSONNAGE. Balthus et Thessa sont tous deux caravaniers porteurs —
 * l'un est un gros marchand jovial, l'autre une cheffe de caravane du désert, et AUCUN
 * champ ne le dit. ⚠️ Leur nom non plus depuis qu'ils sont des mononymes (2026-09-23) :
 * les descriptions vivent dans le script, à raison d'une par champion, et elles sont
 * désormais la SEULE source de ce qu'un champion est.
 *
 * ⚠️ **LE PROJET A DÉJÀ ABANDONNÉ DEUX VOIES PROCÉDURALES** — un bonhomme SVG (`figure.ts`)
 * et un humanoïde 3D (`Hero3D`) : **l'anatomie est ce que le procédural fait le plus mal**.
 * Ici, rien n'est dessiné par du code ; ce sont des illustrations, simplement rangées.
 *
 * ⚠️ **UNE TABLE EXPLICITE, PAS UNE CONVENTION DE NOM.** On pourrait deviner le chemin
 * depuis l'id et laisser le navigateur échouer en silence — mais alors rien ne pourrait
 * vérifier qu'un fichier existe, et un portrait manquant se verrait en production plutôt
 * qu'au test. C'est le patron de `exerciseImages`, et son test garde-fou.
 *
 * ⚠️ **WebP 256 px : les 32 pèsent ~200 Ko au total**, soit ~6 Ko pièce (un fond en dégradé
 * sombre compresse très bien). Le service worker ne cache **rien**, donc chaque octet est
 * retéléchargé à chaque visite — et le Codex les affiche **tous les 32 d'un coup**.
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
  anselme: '/champions/anselme.webp',
  atlas: '/champions/atlas.webp',
  aurore: '/champions/aurore.webp',
  barthe: '/champions/barthe.webp',
  boulin: '/champions/boulin.webp',
  brume: '/champions/brume.webp',
  corvin: '/champions/corvin.webp',
  ferrand: '/champions/ferrand.webp',
  fila: '/champions/fila.webp',
  fulgur: '/champions/fulgur.webp',
  gorm: '/champions/gorm.webp',
  kaell: '/champions/kaell.webp',
  lysandre: '/champions/lysandre.webp',
  miren: '/champions/miren.webp',
  molosse: '/champions/molosse.webp',
  nive: '/champions/nive.webp',
  nyx: '/champions/nyx.webp',
  oeildumonde: '/champions/oeildumonde.webp',
  ombrelune: '/champions/ombrelune.webp',
  orsene: '/champions/orsene.webp',
  roan: '/champions/roan.webp',
  sauge: '/champions/sauge.webp',
  sylve: '/champions/sylve.webp',
  tarn: '/champions/tarn.webp',
  teck: '/champions/teck.webp',
  tessa: '/champions/tessa.webp',
  ursk: '/champions/ursk.webp',
  ventcourt: '/champions/ventcourt.webp',
  verre: '/champions/verre.webp',
  vig: '/champions/vig.webp',
  ysolde: '/champions/ysolde.webp',
  zephyrine: '/champions/zephyrine.webp',
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

/**
 * 🖼️ LA VERSION GRANDE d'un portrait (560 px, v0.987) — pour la roulette verticale du
 * tirage ×1, où le portrait prend presque la largeur de l'écran.
 * ⚠️ DÉRIVÉE de la table, jamais une seconde table : même illustration (tirée du même
 * rendu, cf. `scripts/fetch-champion-portraits.mjs`), seul le dossier change. Un test
 * vérifie que chaque fichier existe.
 */
export function championPortraitLarge(championId: string | null | undefined): string | null {
  const small = championPortrait(championId);
  return small ? small.replace('/champions/', '/champions/lg/') : null;
}
