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
  crans: 22,
  cransParRang: 6,
  /** Durée pour un commun (ms), et ce que chaque rang ajoute. */
  spinMs: 1500,
  spinMsParRang: 260,
  /** Fraction de la roulette à partir de laquelle l'aura prend la couleur de la rareté. */
  glowFrom: 0.66,
  /** ⚠️ Plancher de crans : en dessous, la bande n'a pas la place de défiler et la
   *  « roulette » se lit comme un simple fondu. */
  cransMin: 8,
} as const;

export interface RevealPlan {
  /** Les portraits qui défilent, **le champion tiré en DERNIER**. */
  strip: Champion[];
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
  if (opts?.reduced) return { strip: [champion], spinMs: 0, glowFrom: 0 };

  const n = Math.max(REVEAL.cransMin, revealCrans(champion.rarity));
  const strip: Champion[] = [];
  for (let i = 0; i < n - 1; i++) {
    // ⚠️ On écarte le PRÉCÉDENT, pas le champion tiré : le voir passer dans la roulette
    // fait partie du jeu (on l'a frôlé) — seul un doublon CONSÉCUTIF casse la lecture.
    // ⚠️ Et on l'écarte de la case JUSTE AVANT la fin, sinon il s'y collerait à lui-même.
    const prev = strip[i - 1];
    const veille = i === n - 2;
    const cands = pool.filter((c) => c.id !== prev?.id && !(veille && c.id === champion.id));
    // Repli sur le pool entier : un roster d'un seul champion ne doit pas rendre une bande
    // vide, même si le jeu n'en produit jamais.
    const src = cands.length ? cands : pool;
    strip.push(src[Math.floor(rng() * src.length) % src.length]!);
  }
  // Le tiré occupe la DERNIÈRE case — jamais une position tirée au sort : c'est elle que
  // le repère de l'écran désigne, et l'animation s'arrête dessus.
  strip.push(champion);

  return {
    strip,
    spinMs: revealSpinMs(champion.rarity),
    glowFrom: REVEAL.glowFrom,
  };
}
