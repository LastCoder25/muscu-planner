// warbandStage.ts — ⚔️ LA BATAILLE RANGÉE : transforme une interception RÉSOLUE en une
// chorégraphie spatiale, pure et déterministe.
//
// ⚠️ RÈGLE FONDATRICE, la même qu'`arenaStage`, `siegeStage` et `riftStage` : ce module ne
// décide RIEN du combat. Il place dans l'espace ce que `resolveInterception` a tranché — les
// PV des deux camps temps par temps sont LUS dans le rapport (`WarbandBattle.steps`, résumé
// du vrai log), jamais recalculés. Rien ici ne touche la calibration des interceptions.
//
// ## Ce qu'il montre
//
// 1. **LA COLONNE** — de vrais petits corps, groupe par groupe, le champion au fond. Leur
//    nombre est RÉPARTI entre les groupes au prorata de l'effectif réel (`bodyShares`) : on
//    ne dessine pas 80 corps sur un téléphone, mais une horde de bêtes reste visiblement
//    plus nombreuse qu'une bande de brigands.
// 2. **LA MÊLÉE** — chaque temps du combat fait tomber des corps, du premier rang vers le
//    fond, à mesure que la colonne perd sa vie.
// 3. **L'ISSUE** — « on n'intercepte pas une armée, on rompt sa colonne » (cf. `warbandFoe`) :
//    une victoire en abat une PART (`routShare`) et met le reste en fuite ; une défaite la
//    laisse reprendre sa marche.

import { mulberry32 } from './combat';
import type { PartyResult } from './expedition';
import type { RiftBossStep, WarbandBattle } from './rift';

export const WARBAND_STAGE = {
  /** Au plus autant de corps ennemis à l'écran (champion compris). Au-delà, sur un
   *  téléphone de 344 px, ils se recouvrent et on ne lit plus qu'une tache. */
  maxBodies: 30,
  /** Rangs de la colonne (en hauteur). ⚠️ Six et non quatre : sur un téléphone en portrait
   *  c’est la LARGEUR qui manque, pas la hauteur — plus de rangs, moins de colonnes serrées. */
  rows: 6,
  /** Premier et dernier rang de la colonne, en fraction de la largeur. */
  frontX: 0.52,
  backX: 0.86,
  /** Le champion, au fond, sous sa bannière. */
  champX: 0.93,
  /** Le sol : haut et bas de la formation, en fraction de la hauteur. */
  topY: 0.4,
  bottomY: 0.86,
  /**
   * La part de la troupe qui TOMBE quand la colonne est brisée. ⚠️ Pas 100 % : on rompt
   * une colonne, on ne l'extermine pas — le reste fuit. C'est ce que la fiction dit
   * (`warbandFoe`) et ce qui rend une victoire lisible comme une DÉROUTE.
   */
  routShare: 0.6,
  /** Notre ligne : une place par membre montré, héros au centre du premier rang. */
  allies: [
    { x: 0.27, y: 0.64 },
    { x: 0.25, y: 0.5 },
    { x: 0.25, y: 0.78 },
    { x: 0.17, y: 0.57 },
    { x: 0.17, y: 0.72 },
    { x: 0.14, y: 0.45 },
    { x: 0.14, y: 0.85 },
  ],
} as const;

/** Un corps de la colonne. Coordonnées en fraction ([0,1]²). */
interface WarbandBody {
  species: string;
  emoji: string;
  champion: boolean;
  ranged: boolean;
  /** Index du groupe (dans `WarbandBattle.groups`). */
  group: number;
  x: number;
  y: number;
  /** Le temps (index dans `steps`) où il tombe, ou −1 : il ne tombe pas (il fuit ou il
   *  passe). ⚠️ Le champion ne tombe jamais : il est le dernier debout, puis s'enfuit. */
  fallStep: number;
}

interface WarbandStageStep extends RiftBossStep {
  /** Corps de la troupe tombés À LA FIN de ce temps (cumulé, jamais décroissant). */
  fallen: number;
  /** Le membre de notre ligne qui mène l'assaut sur ce temps. ⚠️ COSMÉTIQUE : le combat est
   *  fondu, le moteur ne sait pas qui a frappé (même note que `RiftStageBeat.striker`). */
  striker: number;
}

export interface WarbandStage {
  bodies: WarbandBody[];
  steps: WarbandStageStep[];
  maxPv: number;
  armyPv: number;
  win: boolean;
  /** Corps de troupe montrés (champion NON compris). */
  troop: number;
  /** Effectif réel de la bande, tous groupes confondus. */
  effectif: number;
  groups: { species: string; emoji: string; count: number; champion: boolean }[];
  /** Membres de notre ligne montrés. */
  partySize: number;
}

/** Ce qu'il faut pour rejouer CE rapport, ou `null` : pas une interception, ou un rapport
 *  d'avant la v0.1185 (rien à rejouer — on n'invente pas une bataille). */
export function warbandStageInputOf(party: PartyResult): WarbandBattle | null {
  const b = party.battle;
  if (!b || !b.groups.length) return null;
  return b;
}

/**
 * Combien de corps montrer pour chaque groupe, au prorata de l'effectif réel.
 *
 * - le champion vaut toujours UN corps ;
 * - chaque groupe de troupe en a au moins un (sinon une espèce entière disparaîtrait) ;
 * - le reste au plus fort reste (largest remainder) → la somme tombe JUSTE.
 */
export function bodyShares(
  groups: readonly { count: number; champion?: boolean }[],
  max: number = WARBAND_STAGE.maxBodies,
): number[] {
  const out: number[] = groups.map((g) => (g.champion ? 1 : 0));
  const troopIdx = groups.map((g, i) => (g.champion ? -1 : i)).filter((i) => i >= 0);
  const real = troopIdx.reduce((s, i) => s + Math.max(0, Math.round(groups[i]!.count)), 0);
  if (!troopIdx.length || real <= 0) return out;
  const champs = out.reduce((s, n) => s + n, 0);
  const budget = Math.max(troopIdx.length, Math.min(real, Math.floor(max) - champs));
  // Un corps d'office par groupe, puis le reste au prorata.
  const rest = budget - troopIdx.length;
  const exact = troopIdx.map(
    (i) => (Math.max(0, groups[i]!.count - 1) / Math.max(1, real - troopIdx.length)) * rest,
  );
  const floors = exact.map((e) => Math.floor(e));
  let left = rest - floors.reduce((s, n) => s + n, 0);
  const order = exact
    .map((e, k) => ({ k, r: e - Math.floor(e) }))
    .sort((a, b) => b.r - a.r || a.k - b.k);
  for (const { k } of order) {
    if (left <= 0) break;
    floors[k]!++;
    left--;
  }
  troopIdx.forEach((i, k) => (out[i] = 1 + floors[k]!));
  return out;
}

/**
 * Corps de troupe tombés à la fin de chaque temps.
 *
 * La part tombée suit la part de vie PERDUE par la colonne, × `routShare`. ⚠️ Cumulée et
 * monotone : un corps tombé ne se relève pas, même si le log (regroupé) ne descend pas.
 */
export function fallenByStep(
  steps: readonly Pick<RiftBossStep, 'bossPv'>[],
  armyPv: number,
  troop: number,
): number[] {
  let prev = 0;
  return steps.map((s) => {
    const lost = armyPv > 0 ? 1 - Math.max(0, s.bossPv) / armyPv : 0;
    const n = Math.floor(Math.max(0, Math.min(1, lost)) * WARBAND_STAGE.routShare * troop);
    prev = Math.max(prev, Math.min(troop, n));
    return prev;
  });
}

/**
 * Construit la bataille.
 *
 * `seed` ne pilote que le COSMÉTIQUE (le léger désordre des rangs) — jamais l'issue.
 */
export function buildWarbandStage(
  battle: WarbandBattle,
  win: boolean,
  partySize: number,
  seed: number,
): WarbandStage {
  const rng = mulberry32((seed ^ 0x3a7b1c55) >>> 0 || 1);
  const { rows, frontX, backX, champX, topY, bottomY } = WARBAND_STAGE;
  const shares = bodyShares(battle.groups);

  // La troupe, groupe après groupe (le plus faible devant), en colonnes de `rows` corps.
  const troopBodies: Omit<WarbandBody, 'x' | 'y' | 'fallStep'>[] = [];
  const champBodies: Omit<WarbandBody, 'x' | 'y' | 'fallStep'>[] = [];
  battle.groups.forEach((g, gi) => {
    for (let k = 0; k < (shares[gi] ?? 0); k++) {
      const body = {
        species: g.species,
        emoji: g.emoji,
        champion: !!g.champion,
        ranged: !!g.ranged,
        group: gi,
      };
      (g.champion ? champBodies : troopBodies).push(body);
    }
  });
  const troop = troopBodies.length;
  const cols = Math.max(1, Math.ceil(troop / rows));
  const fallen = fallenByStep(battle.steps, battle.armyPv, troop);

  const bodies: WarbandBody[] = troopBodies.map((b, k) => {
    const col = Math.floor(k / rows);
    const row = k % rows;
    // Rangs en quinconce : une colonne sur deux décalée d'un demi-rang.
    const rowF = (row + (col % 2 ? 0.5 : 0.15)) / rows;
    const fallStep = fallen.findIndex((n) => n > k);
    return {
      ...b,
      x: frontX + (cols > 1 ? ((backX - frontX) * col) / (cols - 1) : 0) + (rng() - 0.5) * 0.012,
      y: topY + (bottomY - topY) * rowF + (rng() - 0.5) * 0.02,
      fallStep,
    };
  });
  champBodies.forEach((b, k) =>
    bodies.push({
      ...b,
      x: champX,
      y: (topY + bottomY) / 2 + k * 0.1,
      fallStep: -1,
    }),
  );

  const size = Math.max(1, Math.min(WARBAND_STAGE.allies.length, Math.round(partySize)));
  return {
    bodies,
    steps: battle.steps.map((s, i) => ({
      ...s,
      pv: Math.max(0, s.pv),
      bossPv: Math.max(0, s.bossPv),
      fallen: fallen[i] ?? 0,
      striker: i % size,
    })),
    maxPv: battle.maxPv,
    armyPv: battle.armyPv,
    win,
    troop,
    effectif: battle.groups.reduce((s, g) => s + Math.max(0, g.count), 0),
    groups: battle.groups.map((g) => ({
      species: g.species,
      emoji: g.emoji,
      count: g.count,
      champion: !!g.champion,
    })),
    partySize: size,
  };
}
