/**
 * 🎰 LA MISE EN SCÈNE D'UN TIRAGE — la roulette de portraits qui précède la révélation.
 *
 * ⚠️ **RÈGLE FONDATRICE, la même que `siegeStage` et `arenaStage` : CE MODULE NE DÉCIDE
 * RIEN.** Le champion est déjà tiré (`pullChampion`, côté store, avec son pity persisté) ;
 * on ne fait que **placer dans le temps** un résultat tranché. Une roulette qui tirerait
 * elle-même ferait diverger ce qu'on voit de ce qu'on possède, et le pity ne voudrait plus
 * rien dire.
 *
 * ## Ce qui fait le frisson, et ce qui le tuerait
 *
 * - ⚠️ **LES LEURRES COUVRENT TOUTE L'ÉCHELLE, même pour un commun.** Si la bande ne
 *   montrait que des portraits de la rareté tirée, on lirait le résultat AVANT l'arrêt et
 *   il n'y aurait plus rien à attendre. C'est la propriété centrale, et elle est testée.
 * - ⚠️ **JAMAIS DEUX FOIS LE MÊME D'AFFILÉE** : un doublon consécutif se lit comme un arrêt
 *   de la roulette — on croit que c'est fini, et la révélation tombe à plat.
 * - ⚠️ **LA BANDE CONTINUE APRÈS LE TIRÉ** (demandé : « sans que le tirage soit en bout
 *   de ligne »). Sans queue, la dernière case arrive dans le champ de vision et **on voit la
 *   fin venir** — la roulette cesse d'en être une. Avec elle, elle s'arrête au milieu de son
 *   élan, comme une vraie.
 * - **PLUS LA RARETÉ EST HAUTE, PLUS ÇA DURE.** C'est le teasing du genre : une roulette
 *   qui s'éternise est un bon présage. Assumé et testé — ça ne « spoile » pas, ça fait
 *   monter la tension, ce qui est précisément la demande.
 * - **L'AURA NE SE COLORE QUE DANS LE DERNIER TIERS** (`glowFrom`) : trop tôt, on saurait
 *   dès la première seconde ; jamais, et l'arrivée n'a pas de crescendo.
 *
 * ## `prefers-reduced-motion`
 *
 * Le plan « réduit » n'est pas un cas particulier de l'écran : c'est une bande d'UN seul
 * portrait et une durée nulle. L'état final est donc le même code, sans animation.
 */

import { CHAMPIONS, type Champion } from '@/data/champions';
import { RARITY_RANK, type Rarity } from './items';

export const REVEAL = {
  /** Crans de roulette pour un commun, et ce que chaque rang de rareté ajoute. */
  crans: 72,
  cransParRang: 10,
  /** Durée pour un commun (ms), et ce que chaque rang ajoute.
   *  ⚠️ Plus longue depuis la v0.988 : le RALENTI final (demandé : « très vite au début
   *  puis ralentisse avant la sélection finale ») a besoin de temps pour se voir. */
  spinMs: 4000,
  spinMsParRang: 350,
  /** Fraction de la roulette à partir de laquelle l'aura prend la couleur de la rareté. */
  glowFrom: 0.66,
  /** ⚠️ Plancher de crans : en dessous, la bande n'a pas la place de défiler et la
   *  « roulette » se lit comme un simple fondu. */
  cransMin: 8,
  /** Combien de portraits continuent APRÈS celui qu'on a tiré. ⚠️ Il en faut plus que la
   *  moitié de ce que l'écran montre, sinon le bord de la bande entre dans le champ et on
   *  voit la fin arriver — exactement ce qu'on veut éviter. */
  tail: 6,
  /** Tirage ×10 : décalage d'arrêt entre deux lignes (ms). Les dix lignes tournent
   *  ENSEMBLE et s'arrêtent en cascade, de haut en bas. */
  lotStagger: 160,
} as const;

/**
 * 🎢 LA COURBE DE LA ROULETTE (v0.988, demandé : « très vite au début puis ralentir avant
 * la sélection finale »). Mesurée au banc sur 48 cases / 2,6 s (puis rallongée à 72 / 4 s, demandé : « plus longtemps avant la sélection », même vitesse de départ) : départ ~120 cases/s (75
 * avant), puis les CINQ dernières cases égrenées sur la dernière seconde et demie.
 * ⚠️ Une courbe plus raide (0.03, 0.85, 0.07, 1) filait plus vite encore mais atteignait la
 * dernière case à mi-course puis rampait 1,2 s sans rien montrer — ça se lisait comme un
 * blocage. Une seule définition pour le ×1 et les dix lignes.
 */
export const REVEAL_EASE = 'cubic-bezier(0.05, 0.75, 0.25, 1)';

export interface RevealPlan {
  /** Les portraits qui défilent — le tiré est à `stopIndex`, **jamais en bout de bande**. */
  strip: Champion[];
  /** L'index sur lequel la roulette s'arrête. */
  stopIndex: number;
  /** Durée de la roulette, en millisecondes (0 = pas d'animation). */
  spinMs: number;
  /** Fraction (0..1) à partir de laquelle l'aura révèle la couleur de la rareté. */
  glowFrom: number;
}

/** Combien de temps la roulette tourne pour cette rareté. */
export function revealSpinMs(rarity: Rarity): number {
  return REVEAL.spinMs + (RARITY_RANK[rarity] ?? 0) * REVEAL.spinMsParRang;
}

/** Combien de portraits défilent avant celui qu'on a tiré. */
export function revealCrans(rarity: Rarity): number {
  return REVEAL.crans + (RARITY_RANK[rarity] ?? 0) * REVEAL.cransParRang;
}

/**
 * 🎰 Le plan d'une révélation.
 *
 * ⚠️ `rng` sert UNIQUEMENT aux leurres : le résultat, lui, est déjà connu. Deux appels avec
 * la même graine donnent la même bande — c'est ce qui rend la mise en scène testable, et
 * ça n'a aucune conséquence sur le jeu.
 */
export function buildReveal(
  champion: Champion,
  rng: () => number,
  opts?: { reduced?: boolean; pool?: readonly Champion[] },
): RevealPlan {
  const pool = opts?.pool ?? CHAMPIONS;
  if (opts?.reduced) return { strip: [champion], stopIndex: 0, spinMs: 0, glowFrom: 0 };

  const n = Math.max(REVEAL.cransMin, revealCrans(champion.rarity));
  const strip: Champion[] = [];
  /** Un leurre : jamais le PRÉCÉDENT — un doublon consécutif se lit comme un arrêt de la
   *  roulette. `veille` = la case JUSTE AVANT le tiré : là seulement il faut l'écarter en
   *  plus, puisqu'il s'y collerait à lui-même.
   *  ⚠️ JUSTE APRÈS LE TIRÉ, RIEN À AJOUTER, et une mutation l'a prouvé : le tiré EST alors
   *  le précédent, donc le premier garde l'écarte déjà. Un second serait DORMANT — il
   *  donnerait la confiance sans la couverture (le motif des v0.751/0.753/0.922).
   *  ⚠️ Repli sur le pool entier : un roster d'un seul champion ne doit pas rendre une
   *  bande vide, même si le jeu n'en produit jamais. */
  const leurre = (veille = false) => {
    const prev = strip[strip.length - 1];
    const cands = pool.filter((c) => c.id !== prev?.id && !(veille && c.id === champion.id));
    const src = cands.length ? cands : pool;
    strip.push(src[Math.floor(rng() * src.length) % src.length]!);
  };

  for (let i = 0; i < n - 1; i++) leurre(i === n - 2);
  const stopIndex = strip.length;
  strip.push(champion);
  // ⚠️ LA QUEUE : c'est elle qui empêche de voir la fin arriver.
  for (let i = 0; i < REVEAL.tail; i++) leurre();

  return {
    strip,
    stopIndex,
    spinMs: revealSpinMs(champion.rarity),
    glowFrom: REVEAL.glowFrom,
  };
}

/**
 * 🎰 CE QU'UN LOT MET EN SCÈNE (v0.968, refait en v0.980 ; demandé : « 10 fois
 * l'animation de la ligne qui défile, sur toute la hauteur de l'écran »).
 *
 * ⚠️ **DIX ROULETTES EN MÊME TEMPS, PAS L'UNE APRÈS L'AUTRE** : dix d'affilée, c'est
 * trente secondes pour un geste. Empilées sur la hauteur de l'écran, elles tournent
 * ensemble et s'arrêtent en CASCADE (`buildLotReveal`) — cinq secondes au plus. Le
 * meilleur du lot (`bestOfLot`) porte ensuite l'écran de révélation, la grille dit le reste.
 *
 * ⚠️ **ELLE NE DÉCIDE RIEN, comme la roulette à l'unité** : les dix champions sont déjà
 * tirés par le store (avec le pity qui s'enchaîne d'un tirage au suivant). On ne fait que
 * choisir LEQUEL porte la mise en scène.
 *
 * ⚠️ **LA DURÉE DE LA ROULETTE TRAHIT DONC LE MEILLEUR**, pas le hasard du lot — et c'est
 * assumé, exactement comme pour un tirage seul : « ça ne spoile pas, ça fait monter la
 * tension » (v0.960).
 */
export interface LotItem {
  champion: Champion;
  duplicate: boolean;
  copies: number;
  manaBack: number;
}

/**
 * 🎰 Les dix lignes d'un tirage ×10, dans l'ORDRE DU TIRAGE (haut → bas).
 *
 * Chaque ligne est une roulette complète (`buildReveal` : leurres sur toute l'échelle,
 * queue après le tiré) ; seule sa durée est décalée de `lotStagger` par rang, pour que
 * les arrêts tombent en cascade au lieu d'un seul coup. ⚠️ La durée garde sa part de
 * rareté : une ligne qui traîne reste un bon présage, comme à l'unité.
 */
export function buildLotReveal(
  lot: readonly LotItem[],
  rng: () => number,
  opts?: { reduced?: boolean; pool?: readonly Champion[] },
): RevealPlan[] {
  return lot.map((it, i) => {
    const plan = buildReveal(it.champion, rng, opts);
    return plan.spinMs ? { ...plan, spinMs: plan.spinMs + i * REVEAL.lotStagger } : plan;
  });
}

/** Le champion du lot qui porte la roulette : le plus rare. ⚠️ À rareté égale on garde
 *  le PREMIER tiré — un départage au hasard ferait varier la mise en scène d'un
 *  rechargement à l'autre pour un même lot. */
export function bestOfLot(lot: readonly LotItem[]): LotItem | null {
  let best: LotItem | null = null;
  for (const it of lot) {
    if (!best || RARITY_RANK[it.champion.rarity] > RARITY_RANK[best.champion.rarity]) best = it;
  }
  return best;
}

/** L'ordre de la grille : du plus rare au plus commun, puis l'ordre du tirage.
 *  ⚠️ On COPIE : le lot vient du store, et le trier en place réordonnerait ce qui a été
 *  persisté — l'ordre du tirage est ce qui a réellement eu lieu. */
export function lotOrder(lot: readonly LotItem[]): LotItem[] {
  return lot
    .map((it, i) => ({ it, i }))
    .sort(
      (a, b) => RARITY_RANK[b.it.champion.rarity] - RARITY_RANK[a.it.champion.rarity] || a.i - b.i,
    )
    .map((x) => x.it);
}
