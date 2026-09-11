import { describe, it, expect } from 'vitest';
import {
  buildSiegeStage,
  placeBodies,
  cutsFor,
  nearestTurret,
  SIEGE_STAGE,
} from '@/lib/siegeStage';
import {
  rollRaid,
  baseCombatant,
  resolveRaid,
  turretCount,
  TURRET_SLOTS,
  type DefenseStructure,
} from '@/lib/raid';
import { refFighter, gearExpect } from '@/lib/proceduralContent';
import type { Combatant } from '@/lib/combat';

function hero(L: number): Combatant {
  const f = refFighter(L);
  const ge = gearExpect(L);
  return { ...f, damage: Math.round(f.damage * ge.off), pv: Math.round(f.pv * ge.pv) };
}
const defs = (w: number, t: number): DefenseStructure[] => [
  { typeId: 'wall', level: w },
  { typeId: 'turret', level: t },
];
/** Un siège complet, prêt à mettre en scène. */
function siege(seed: number, playerLevel = 26, w = 26, t = 26, home = true) {
  const raid = rollRaid(seed, playerLevel, 0, 0);
  const report = resolveRaid(
    { defenses: defs(w, t), playerLevel, hero: home ? hero(playerLevel) : null },
    raid,
    0,
    home,
  );
  return { raid, report, stage: buildSiegeStage(report, turretCount(t)) };
}

describe('placement des assaillants', () => {
  it('un corps par assaillant, rattaché à son groupe', () => {
    const { raid, stage } = siege(101);
    const total = raid.groups.reduce((s, g) => s + g.count, 0);
    expect(stage.bodies).toHaveLength(total);
    raid.groups.forEach((g, gi) => {
      expect(stage.bodies.filter((b) => b.group === gi)).toHaveLength(g.count);
    });
    expect(new Set(stage.bodies.map((b) => b.id)).size).toBe(total);
  });

  it('ils arrivent d’un CÔTÉ, hors des murs — une armée marche, elle ne pleut pas', () => {
    const { stage } = siege(202);
    for (const b of stage.bodies) {
      expect(b.dist).toBeGreaterThanOrEqual(SIEGE_STAGE.spawnMin);
      expect(b.dist).toBeLessThanOrEqual(SIEGE_STAGE.spawnMax);
    }
    // Tous les corps tiennent dans un arc, pas sur le tour complet.
    const angles = stage.bodies.map((b) => b.angle);
    const etendue = Math.max(...angles) - Math.min(...angles);
    expect(etendue).toBeLessThan(SIEGE_STAGE.arc + 0.3);
  });

  it('est déterministe : même rapport → même mise en scène', () => {
    const a = siege(303);
    const b = buildSiegeStage(a.report, turretCount(26));
    expect(b.bodies).toEqual(a.stage.bodies);
    expect(b.beats).toEqual(a.stage.beats);
  });
});

describe('bornes cumulées', () => {
  it('les parts somment EXACTEMENT aux PV du groupe', () => {
    for (const [pv, n] of [
      [1000, 1],
      [1000, 7],
      [12345, 6],
      [7, 5],
    ] as [number, number][]) {
      const cuts = cutsFor(pv, n);
      expect(cuts).toHaveLength(n);
      expect(cuts[n - 1]).toBe(pv); // le dernier corps tombe pile à la fin du groupe
      for (let i = 1; i < n; i++) expect(cuts[i]!).toBeGreaterThanOrEqual(cuts[i - 1]!);
    }
  });

  it('un corps ne tombe qu’UNE fois, et ne se relève jamais', () => {
    for (const s of [11, 22, 33, 44, 55]) {
      const { stage } = siege(s);
      const vus = new Set<number>();
      for (const beat of stage.beats) {
        for (const k of beat.kills) {
          expect(vus.has(k), `corps ${k} tué deux fois`).toBe(false);
          vus.add(k);
        }
      }
    }
  });

  it('les dégâts cumulés sont MONOTONES par groupe', () => {
    const { stage } = siege(66);
    const dernier = new Map<number, number>();
    for (const b of stage.beats) {
      const prev = dernier.get(b.group) ?? 0;
      expect(b.dealt).toBeGreaterThanOrEqual(prev);
      dernier.set(b.group, b.dealt);
    }
  });

  it('le NOMBRE de groupes anéantis à l’écran est celui du rapport', () => {
    // C'est l'invariant qui relie l'image au rapport : ce que l'écran montre anéanti,
    // le rapport doit le compter comme repoussé.
    // ⚠️ Test RÉÉCRIT, pas supprimé : il supposait que les groupes tombent DANS
    // L'ORDRE (`gi < report.defeated`), ce qui était vrai du combat séquentiel de
    // `simulateDungeon` — une base y affrontait un groupe après l'autre. Le moteur en
    // deux phases les affronte TOUS À LA FOIS : le groupe anéanti peut être le
    // troisième. On compare donc les COMPTES, pas les rangs.
    for (const s of [7, 19, 23, 31, 47]) {
      const { raid, report, stage } = siege(s, 26, 26, 26, false);
      const morts = new Set(stage.beats.flatMap((b) => b.kills));
      let offset = 0;
      let aneantis = 0;
      raid.groups.forEach((g) => {
        const tous = Array.from({ length: g.count }, (_, i) => offset + i);
        if (tous.every((idx) => morts.has(idx))) aneantis++;
        offset += g.count;
      });
      expect(aneantis).toBe(report.defeated);
    }
  });
});

describe('cohérence avec le rapport', () => {
  it('⚠️ NON-RÉGRESSION : la mise en scène ne décide RIEN du combat', () => {
    // La règle fondatrice. Le rapport est recopié, jamais recalculé : si un jour ce test
    // échoue, c'est que la scène s'est mise à influencer l'issue — donc les récompenses.
    for (const s of [5, 15, 25, 35]) {
      const { report, stage } = siege(s);
      expect(stage.held).toBe(report.held);
      expect(stage.defeated).toBe(report.defeated);
      expect(stage.total).toBe(report.total);
      expect(stage.maxPv).toBe(report.maxPv);
    }
  });

  it('la barre du rempart suit les PV du log, et finit sur ceux du rapport', () => {
    const { report, stage } = siege(77, 26, 20, 20, false);
    for (const b of stage.beats) {
      expect(b.basePv).toBeGreaterThanOrEqual(0);
      expect(b.basePv).toBeLessThanOrEqual(report.maxPv);
    }
    const fin = stage.beats[stage.beats.length - 1];
    if (fin) expect(fin.basePv).toBe(report.finalPv);
  });

  it('chaque tir part d’une tourelle EXISTANTE ; les assaillants, eux, frappent le mur', () => {
    const { stage } = siege(88);
    const n = turretCount(26);
    for (const b of stage.beats) {
      expect(b.body).toBeGreaterThanOrEqual(0);
      expect(b.body).toBeLessThan(stage.bodies.length);
      if (b.kind === 'turret') {
        expect(b.turret).toBeGreaterThanOrEqual(0);
        expect(b.turret).toBeLessThan(n);
      }
    }
    expect(stage.beats.some((b) => b.kind === 'turret')).toBe(true);
    expect(stage.beats.some((b) => b.kind === 'foe')).toBe(true);
  });

  it('la tourelle qui tire est la plus proche de sa cible', () => {
    expect(nearestTurret(-Math.PI / 2, TURRET_SLOTS)).toBe(0); // plein nord → 1re tour
    for (let k = 0; k < TURRET_SLOTS; k++) {
      const step = (Math.PI * 2) / TURRET_SLOTS;
      const angleTour = -Math.PI / 2 + step / 2 + k * step;
      expect(nearestTurret(angleTour, TURRET_SLOTS)).toBe(k);
    }
  });

  it('une base SANS tourelle ne fait pas planter la scène', () => {
    const { report } = siege(99, 26, 26, 0, true);
    const stage = buildSiegeStage(report, turretCount(0));
    for (const b of stage.beats) expect(Number.isFinite(b.turret)).toBe(true);
  });

  it('un siège sans le héros produit quand même une scène jouable', () => {
    const { stage } = siege(123, 26, 12, 12, false);
    expect(stage.beats.length).toBeGreaterThan(0);
    expect(stage.bodies.length).toBeGreaterThan(0);
  });
});

describe('placement seul', () => {
  it('ne plante pas sur une armée vide', () => {
    expect(placeBodies([], 1)).toEqual([]);
  });
});
