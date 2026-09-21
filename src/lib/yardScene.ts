/**
 * 🧱⚔️ LA COUR VUE DE CÔTÉ — la mise en scène de la phase 2 d'un siège.
 *
 * Demandé par l'utilisateur : « en brèche, un affichage comme les failles, ce côté
 * dynamique ». Quand la muraille cède, le rejeu quitte la vue de dessus de l'enceinte
 * pour une scène de côté : la brèche à gauche, par où les intrus entrent ; le héros et
 * les champions à droite ; le rempart en fond, d'où les balistes et les archers tirent
 * leurs traits DANS la mêlée (choix de l'utilisateur : le dehors se lit par ces traits
 * et par la barre du mur, pas par une seconde vue).
 *
 * ⚠️ RÈGLE FONDATRICE, celle de `siegeStage.ts` : ce module ne décide RIEN du combat. Il
 * place, dans une autre vue, des temps DÉJÀ tranchés par le moteur et déjà découpés par
 * `buildSiegeStage`. Le déroulé est UN : la vue de côté peint les mêmes temps, au même
 * rythme, que la vue de dessus.
 *
 * Coordonnées en FRACTION de la scène ([0,1]²), comme la scène des failles : le rendu
 * reste responsive sans que le modèle connaisse un pixel.
 */
import type { SiegeBeat } from './siegeStage';

export const YARD_SCENE = {
  /** Le haut du sol : au-dessus, le rempart en fond de scène. */
  groundY: 0.44,
  /** Le chemin de ronde, là où se tiennent balistes et archers. */
  rampartY: 0.2,
  /** Les trois files de la mêlée (profondeur de la cour). */
  lanes: [0.58, 0.72, 0.86] as readonly number[],
  /** La brèche, à gauche : c'est de là que les intrus arrivent. */
  breachX: 0.07,
  /** Le front des intrus, et le pas qui les sépare en remontant vers la brèche. */
  foeFront: 0.44,
  foeStep: 0.09,
  /** Au-delà de ces colonnes, les suivants s'entassent devant la brèche. */
  foeCols: 4,
  /** Le front des défenseurs, et leur pas vers la droite. */
  defFront: 0.58,
  defStep: 0.1,
  /** Le chemin de ronde des défenseurs restés en haut, et celui des balistes. */
  rampartDefFrom: 0.5,
  rampartDefTo: 0.94,
  turretFrom: 0.2,
  turretTo: 0.96,
} as const;

export interface YardPoint {
  x: number;
  y: number;
}

/**
 * Le temps qui OUVRE la brèche, ou −1 si le mur a tenu : c'est lui qui fait basculer le
 * rejeu dans la cour. ⚠️ `opens`, pas `width > 0` : la brèche s'élargit plusieurs fois
 * par siège, la scène ne bascule qu'une fois.
 * ⚠️ Retirer `opens` ne change rien AUJOURD'HUI (mutation équivalente, prouvée) : le
 * premier temps `breach` d'un siège est toujours l'ouverture, une brèche ne s'élargissant
 * qu'après s'être ouverte. Le test garde la forme ; c'est le nom qui porte l'intention.
 */
export function yardOpenIndex(beats: readonly Pick<SiegeBeat, 'kind' | 'opens'>[]): number {
  return beats.findIndex((b) => b.kind === 'breach' && b.opens);
}

/**
 * La place du k-ième intrus (ordre d'ENTRÉE). Trois files, les colonnes remontent vers
 * la brèche : le premier entré tient le front, les suivants poussent derrière.
 * ⚠️ Par ordre d'entrée et non « parmi les vivants » : un corps tombé reste où il est
 * tombé, et la place d'un vivant ne saute pas quand son voisin meurt.
 */
export function yardFoeSpot(k: number): YardPoint {
  const S = YARD_SCENE;
  const n = S.lanes.length;
  const col = Math.floor(Math.max(0, k) / n);
  const lane = Math.max(0, k) % n;
  // Au-delà des colonnes prévues, on s'entasse devant la brèche plutôt que d'en sortir.
  const c = Math.min(col, S.foeCols - 1);
  const spill = col >= S.foeCols ? ((col - S.foeCols + 1) % 3) * 0.018 : 0;
  return { x: Math.max(S.breachX + 0.04, S.foeFront - c * S.foeStep - spill), y: S.lanes[lane]! };
}

/** La place du j-ième défenseur qui tient la COUR. */
export function yardDefSpot(j: number): YardPoint {
  const S = YARD_SCENE;
  const n = S.lanes.length;
  const col = Math.floor(Math.max(0, j) / n);
  return {
    x: Math.min(0.95, S.defFront + col * S.defStep),
    y: S.lanes[Math.max(0, j) % n]!,
  };
}

/** Répartit `i` parmi `n` places régulières sur [from, to] (centré si n = 1). */
function spread(i: number, n: number, from: number, to: number): number {
  if (n <= 1) return (from + to) / 2;
  return from + ((to - from) * i) / (n - 1);
}

/** La place du j-ième défenseur resté sur le CHEMIN DE RONDE (parmi `n`). */
export function yardRampartSpot(j: number, n: number): YardPoint {
  const S = YARD_SCENE;
  return { x: spread(j, n, S.rampartDefFrom, S.rampartDefTo), y: S.rampartY };
}

/** Où se tient une baliste sur le rempart de fond (parmi `count`). */
export function yardTurretSpot(t: number, count: number): YardPoint {
  const S = YARD_SCENE;
  return { x: spread(t, Math.max(1, count), S.turretFrom, S.turretTo), y: S.rampartY - 0.07 };
}

/**
 * Où va un trait tiré sur un corps resté DEHORS : il file par-dessus le rempart vers la
 * gauche, hors du cadre. Le dehors n'est pas dessiné — on voit partir le trait, pas
 * arriver.
 */
export function yardOutsideShot(from: YardPoint): YardPoint {
  return { x: -0.08, y: Math.max(0, from.y - 0.12) };
}

/**
 * Où s'arrête une CHARGE de `a` vers `b` : devant la cible, pas dessus.
 *
 * ⚠️ ON GARDE SA FILE. Trois champions qui frappent le même intrus fonçaient au même point
 * et s'empilaient en masquant leur cible (vu sur le banc). La charge suit donc la cible en
 * x, s'arrête à `reach` d'elle, et ne glisse que d'une part (`drift`) vers sa file : les
 * attaquants restent en éventail autour de leur cible.
 */
export function lungeTo(a: YardPoint, b: YardPoint, reach = 0.12, drift = 0.22): YardPoint {
  const side = a.x >= b.x ? 1 : -1;
  const stop = b.x + side * reach;
  // Jamais au-delà de sa position de départ : une cible toute proche ne fait pas reculer.
  const x = side > 0 ? Math.min(a.x, stop) : Math.max(a.x, stop);
  return { x, y: a.y + (b.y - a.y) * drift };
}
