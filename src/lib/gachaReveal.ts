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

import { CHAMPIONS, type Champion, type PullGrade } from '@/data/champions';

export const REVEAL = {
  /** Crans de roulette pour un B, et ce que chaque lettre au-dessus ajoute.
   *  ⚠️ Même amplitude que la v0.988 (72 → 142 crans, 4 s → 6,45 s du bas au sommet),
   *  répartie sur 3 lettres au lieu de 8 raretés. */
  crans: 72,
  cransParRang: 35,
  /** Durée pour un B (ms), et ce que chaque lettre au-dessus ajoute.
   *  ⚠️ Longue depuis la v0.988 : le RALENTI final a besoin de temps pour se voir. */
  spinMs: 4000,
  spinMsParRang: 1225,
  /** Fraction de la roulette à partir de laquelle l'aura prend la couleur de la lettre. */
  glowFrom: 0.66,
  /** ⚠️ Plancher de crans : en dessous, la bande n'a pas la place de défiler et la
   *  « roulette » se lit comme un simple fondu. */
  cransMin: 8,
  /** Combien de cases continuent APRÈS celle qu'on a tirée. ⚠️ Il en faut plus que la
   *  moitié de ce que l'écran montre, sinon le bord de la bande entre dans le champ et on
   *  voit la fin arriver — exactement ce qu'on veut éviter. */
  tail: 6,
  /** Tirage ×10 : décalage d'arrêt entre deux lignes (ms). Les dix lignes tournent
   *  ENSEMBLE et s'arrêtent en cascade, de haut en bas. */
  lotStagger: 160,
  /** Part des leurres qui sont des B (refonte S/A/B). ⚠️ Sans B dans la bande, une roulette
   *  qui s'arrête sur un B trahirait son issue en montrant une case qu'on n'a jamais vue
   *  défiler — et le fond du tirage n'aurait pas de visage. */
  bDecoyShare: 0.5,
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

/** Rang d'une lettre dans la mise en scène : B 0, A 1, S 2. */
export const GRADE_RANK: Record<PullGrade, number> = { B: 0, A: 1, S: 2 };

/**
 * 🎰 UNE CASE DE LA ROULETTE — un champion (S/A) ou une pièce (B).
 * ⚠️ Le B n'est pas un champion (refonte 2026-09-21) : c'est une pièce d'équipement de
 * lignée. La case le dit par son emoji et son nom, sans portrait.
 */
export interface RevealCell {
  grade: PullGrade;
  emoji: string;
  name: string;
  /** L'identité du champion, `null` pour un B. */
  championId: string | null;
  /** Le modèle de la pièce d'un B (son illustration), absent pour un champion. */
  gearModel?: string | null;
}

export const cellOfChampion = (c: Champion): RevealCell => ({
  grade: c.grade,
  emoji: c.emoji,
  name: c.name,
  championId: c.id,
});

/** Les visages du fond du tirage — un par emplacement d'équipement. */
const B_DECOYS: RevealCell[] = [
  { grade: 'B', emoji: '🗡️', name: 'Arme', championId: null },
  { grade: 'B', emoji: '🛡️', name: 'Armure', championId: null },
  { grade: 'B', emoji: '💍', name: 'Accessoire', championId: null },
  { grade: 'B', emoji: '🔮', name: 'Relique', championId: null },
];

export interface RevealPlan {
  /** Les cases qui défilent — la tirée est à `stopIndex`, **jamais en bout de bande**. */
  strip: RevealCell[];
  /** L'index sur lequel la roulette s'arrête. */
  stopIndex: number;
  /** Durée de la roulette, en millisecondes (0 = pas d'animation). */
  spinMs: number;
  /** Fraction (0..1) à partir de laquelle l'aura révèle la couleur de la lettre. */
  glowFrom: number;
}

/** Combien de temps la roulette tourne pour cette lettre. */
export function revealSpinMs(grade: PullGrade): number {
  return REVEAL.spinMs + GRADE_RANK[grade] * REVEAL.spinMsParRang;
}

/** Combien de cases défilent avant celle qu'on a tirée. */
export function revealCrans(grade: PullGrade): number {
  return REVEAL.crans + GRADE_RANK[grade] * REVEAL.cransParRang;
}

/**
 * 🎰 Le plan d'une révélation.
 *
 * ⚠️ `rng` sert UNIQUEMENT aux leurres : le résultat, lui, est déjà connu. Deux appels avec
 * la même graine donnent la même bande — c'est ce qui rend la mise en scène testable, et
 * ça n'a aucune conséquence sur le jeu.
 */
export function buildReveal(
  target: RevealCell,
  rng: () => number,
  opts?: { reduced?: boolean; pool?: readonly Champion[] },
): RevealPlan {
  const champs = (opts?.pool ?? CHAMPIONS).map(cellOfChampion);
  if (opts?.reduced) return { strip: [target], stopIndex: 0, spinMs: 0, glowFrom: 0 };

  const same = (a: RevealCell | undefined, b: RevealCell) =>
    !!a && a.grade === b.grade && a.championId === b.championId && a.emoji === b.emoji;
  const n = Math.max(REVEAL.cransMin, revealCrans(target.grade));
  const strip: RevealCell[] = [];
  /** Un leurre : jamais le PRÉCÉDENT — un doublon consécutif se lit comme un arrêt de la
   *  roulette. `veille` = la case JUSTE AVANT la tirée : là seulement il faut l'écarter en
   *  plus, puisqu'elle s'y collerait à elle-même.
   *  ⚠️ JUSTE APRÈS LA TIRÉE, RIEN À AJOUTER : la tirée EST alors le précédent, donc le
   *  premier garde l'écarte déjà (mutation v0.962). */
  const leurre = (veille = false) => {
    const prev = strip[strip.length - 1];
    const src0 = rng() < REVEAL.bDecoyShare ? B_DECOYS : champs;
    const cands = src0.filter((c) => !same(prev, c) && !(veille && same(target, c)));
    const src = cands.length ? cands : src0;
    strip.push(src[Math.floor(rng() * src.length) % src.length]!);
  };

  for (let i = 0; i < n - 1; i++) leurre(i === n - 2);
  const stopIndex = strip.length;
  strip.push(target);
  // ⚠️ LA QUEUE : c'est elle qui empêche de voir la fin arriver.
  for (let i = 0; i < REVEAL.tail; i++) leurre();

  return { strip, stopIndex, spinMs: revealSpinMs(target.grade), glowFrom: REVEAL.glowFrom };
}

/**
 * 🎰 CE QU'UN TIRAGE A DONNÉ — la matière de la mise en scène (champion ou pièce).
 * ⚠️ ELLE NE DÉCIDE RIEN : tout est déjà tiré par le store (avec le pity qui s'enchaîne).
 */
export interface LotItem {
  grade: PullGrade;
  /** `null` pour un B. */
  champion: Champion | null;
  /** La pièce d'un B (son nom et son visage), `null` pour un champion. */
  gear: { name: string; emoji: string; model?: string | null } | null;
  duplicate: boolean;
  copies: number;
  manaBack: number;
}

/** La case que porte un résultat. */
export function cellOf(it: LotItem): RevealCell {
  if (it.champion) return cellOfChampion(it.champion);
  return {
    grade: it.grade,
    emoji: it.gear?.emoji ?? '🎁',
    name: it.gear?.name ?? 'Pièce d’équipement',
    championId: null,
    gearModel: it.gear?.model ?? null,
  };
}

/**
 * 🎰 Les dix lignes d'un tirage ×10, dans l'ORDRE DU TIRAGE (haut → bas) : chaque ligne
 * est une roulette complète, sa durée décalée de `lotStagger` par rang pour que les
 * arrêts tombent en cascade. ⚠️ La durée garde sa part de lettre : une ligne qui traîne
 * reste un bon présage, comme à l'unité.
 */
export function buildLotReveal(
  lot: readonly LotItem[],
  rng: () => number,
  opts?: { reduced?: boolean; pool?: readonly Champion[] },
): RevealPlan[] {
  return lot.map((it, i) => {
    const plan = buildReveal(cellOf(it), rng, opts);
    return plan.spinMs ? { ...plan, spinMs: plan.spinMs + i * REVEAL.lotStagger } : plan;
  });
}

/** Le résultat du lot qui porte la révélation : la meilleure lettre. ⚠️ À lettre égale on
 *  garde le PREMIER tiré — un départage au hasard ferait varier la mise en scène d'un
 *  rechargement à l'autre pour un même lot. */
export function bestOfLot(lot: readonly LotItem[]): LotItem | null {
  let best: LotItem | null = null;
  for (const it of lot) {
    if (!best || GRADE_RANK[it.grade] > GRADE_RANK[best.grade]) best = it;
  }
  return best;
}

/** L'ordre de la grille : de la meilleure lettre à la plus basse, puis l'ordre du tirage.
 *  ⚠️ On COPIE : le lot vient du store, et le trier en place réordonnerait ce qui a été
 *  persisté — l'ordre du tirage est ce qui a réellement eu lieu. */
export function lotOrder(lot: readonly LotItem[]): LotItem[] {
  return lot
    .map((it, i) => ({ it, i }))
    .sort((a, b) => GRADE_RANK[b.it.grade] - GRADE_RANK[a.it.grade] || a.i - b.i)
    .map((x) => x.it);
}
