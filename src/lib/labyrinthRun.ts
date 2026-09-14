// labyrinthRun.ts — LES RÈGLES D'UN RUN DE LABYRINTHE, en un seul endroit (pur/testé).
// Le combat réel (ExpeditionPage), l'estimation du % de réussite affiché et les tests de
// calibration lisent les MÊMES créatures et le MÊME parcours.
//
// ⚠️ POURQUOI (v0.851) : l'estimation affichée simulait « ~2 combats par étage » avec un
// monstre neutre, alors que l'auto visite TOUTES les salles d'un étage (~5-6 combats, pièges,
// repos). Tant que les créatures étaient trop faibles, les deux disaient 100 % ; recalées,
// l'écran aurait annoncé 100 % pour un palier qui se nettoie à 60 %. Une estimation qui ne
// joue pas le même parcours que le jeu finit toujours par mentir.

import { mulberry32, simulateCombat, type Combatant } from './combat';
import { generateFloor, type Floor, type Room } from './dungeonCrawl';
import { RANK_ORDER } from './items';
import { labyrinthFoeBase } from './proceduralContent';
import { pickLabyFoe, type LabyFoe } from '@/data/labyrinthFoes';
import { pickLabyTrap } from '@/data/labyrinthLoot';
import type { Labyrinth } from '@/data/labyrinths';

export const LABY_RUN = {
  /** Vol de vie atténué : le soin ∝ dégâts infligés ferait remonter au max entre deux
   *  combats et l'attrition ne compterait plus. */
  lifesteal: 0.3,
  /** Piège = 5 % des PV max (plancher 8), modulé par le type de piège. */
  trapPct: 0.05,
  trapMin: 8,
  /** Repos des salles sûres, en part des PV max. */
  regen: { chest: 0.09, vault: 0.12, empty: 0.1 },
} as const;

/** Rang de familier du palier → index de roster des créatures. */
export const labyTierIndex = (laby: Labyrinth): number =>
  Math.max(0, RANK_ORDER.indexOf(laby.rank));

/** Profondeur (0 surface → 1 fond) de l'étage `floor` sur `floors`. */
export const labyDepth = (floor: number, floors: number): number =>
  floors > 1 ? floor / (floors - 1) : 0;

/** La créature d'une salle : base absolue du palier modulée par son archétype. */
export function labyrinthFoe(
  level: number,
  isBoss: boolean,
  depth: number,
  foe: LabyFoe,
): Combatant {
  const base = labyrinthFoeBase(level, isBoss, depth);
  const a = foe.arch;
  return {
    name: foe.name,
    pv: Math.max(10, Math.round(base.pv * a.pvMult)),
    damage: Math.max(1, Math.round(base.damage * a.dmgMult)),
    crit: a.crit + 0.03 * depth,
    dodge: a.dodge + 0.02 * depth,
    initiative: isBoss ? 14 : 8,
    strikes: a.strikes ?? 1,
    ...(a.lifesteal ? { lifesteal: a.lifesteal } : {}),
  };
}

/** Le héros tel qu'il entre dans une salle : PV reportés, vol de vie atténué. */
export function labyrinthFighter(player: Combatant, pv: number): Combatant {
  return { ...player, pv, lifesteal: (player.lifesteal ?? 0) * LABY_RUN.lifesteal };
}

/** Dégâts d'un piège à dégâts : part des PV max (plancher), modulée par le type de piège. */
export function labyrinthTrapDamage(maxPv: number, mult: number): number {
  const base = Math.max(LABY_RUN.trapMin, Math.round(maxPv * LABY_RUN.trapPct));
  return Math.max(1, Math.round(base * mult));
}

/** Les salles d'un étage dans l'ordre où l'auto les joue : l'exploration d'abord, le gardien
 *  en dernier (départ et escalier ne déclenchent rien). */
export function labyrinthRoomOrder(floor: Floor): Room[] {
  return floor.rooms
    .filter((r) => r.type !== 'start' && r.type !== 'stairs')
    .sort((a, b) => Number(a.type === 'boss') - Number(b.type === 'boss'));
}

/** Un run COMPLET comme le joue l'auto : toutes les salles de chaque étage, puis le gardien.
 *  Sans retraite (on mesure le nettoyage). `true` = palier nettoyé. */
export function simulateLabyrinthRun(player: Combatant, laby: Labyrinth, seed: number): boolean {
  const maxPv = player.pv;
  let pv = maxPv;
  const tier = labyTierIndex(laby);
  for (let f = 0; f < laby.floors; f++) {
    const floor = generateFloor(seed, f, laby.floors);
    const depth = labyDepth(f, laby.floors);
    for (const r of labyrinthRoomOrder(floor)) {
      const rs = (seed * 131 + f * 7919 + r.id * 17) >>> 0 || 1;
      if (r.type === 'monster' || r.type === 'boss') {
        const isBoss = r.type === 'boss';
        const foe = pickLabyFoe(mulberry32((rs ^ 0x2f6b) >>> 0), tier, isBoss);
        const res = simulateCombat(
          labyrinthFighter(player, pv),
          labyrinthFoe(laby.recoLevel, isBoss, depth, foe),
          { seed: rs, goldOnWin: 0, startPlayerPv: pv },
        );
        if (res.log.length) pv = res.log[res.log.length - 1]!.playerPv;
      } else if (r.type === 'trap') {
        const t = pickLabyTrap(mulberry32((rs ^ 0x7a17) >>> 0));
        if (t.kind === 'dmg') pv -= labyrinthTrapDamage(maxPv, t.mult);
      } else if (r.type === 'chest' || r.type === 'vault' || r.type === 'empty') {
        pv = Math.min(maxPv, pv + Math.round(maxPv * LABY_RUN.regen[r.type]));
      }
      if (pv <= 0) return false;
    }
  }
  return true;
}
