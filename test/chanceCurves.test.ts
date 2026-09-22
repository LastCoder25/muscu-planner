import { describe, expect, it } from 'vitest';
import { COMBAT, playerCombatant, simulateCombat, type Combatant } from '@/lib/combat';
import { CHANCE_CURVES, curveChance, playerWithGear } from '@/lib/items';
import { refBalancedStat } from '@/lib/proceduralContent';

const LEVELS = [5, 10, 20, 30, 50, 70, 90, 100];
const ref = (L: number) => {
  const s = refBalancedStat(L);
  return { puissance: s, endurance: s, agilite: s };
};

describe('courbes de chance à rendement décroissant (refonte équipement, étape 1)', () => {
  it('le joueur de référence NU garde exactement sa chance d’avant — le contenu ne bouge pas', () => {
    for (const L of LEVELS) {
      const before = playerCombatant('r', ref(L), L);
      const now = playerWithGear('r', ref(L), {}, {}, L);
      expect(now.crit).toBeCloseTo(before.crit, 6);
      expect(now.dodge).toBeCloseTo(before.dodge, 6);
      expect(now.dmgReduction ?? 0).toBeCloseTo(before.dmgReduction ?? 0, 6);
    }
  });

  it('au point de référence, un point d’équipement vaut ce qu’il valait (pente 1)', () => {
    for (const L of [30, 60, 90]) {
      for (const ch of Object.values(CHANCE_CURVES)) {
        const raw = refBalancedStat(L) * ch.perStat;
        const e = 1e-4;
        const slope = (curveChance(ch, raw, e, L) - curveChance(ch, raw, 0, L)) / e;
        expect(slope).toBeCloseTo(1, 2);
      }
    }
  });

  it('aucun plafond n’est jamais atteint : chaque point compte, un peu moins que le précédent', () => {
    for (const L of [20, 60, 100]) {
      for (const ch of Object.values(CHANCE_CURVES)) {
        const raw = refBalancedStat(L) * ch.perStat;
        let prev = curveChance(ch, raw, 0, L);
        let prevGain = Infinity;
        for (let g = 0.1; g <= 3; g += 0.1) {
          const c = curveChance(ch, raw, g, L);
          const gain = c - prev;
          expect(c).toBeLessThan(ch.cap);
          expect(gain).toBeGreaterThan(0);
          expect(gain).toBeLessThanOrEqual(prevGain + 1e-12);
          prev = c;
          prevGain = gain;
        }
      }
    }
  });

  it('la réduction et l’esquive d’un objet servent encore au niveau 90 (elles étaient mortes)', () => {
    const L = 90;
    const base = playerWithGear('h', ref(L), {}, {}, L);
    const withGear = playerWithGear(
      'h',
      ref(L),
      {},
      { dodgeAdd: 0.1, dmgReduction: 0.1, critAdd: 0.1 },
      L,
    );
    // Avant : esquive au plafond sec (40 %), réduction bloquée à 50 %.
    expect(base.dodge).toBeCloseTo(COMBAT.dodgeCap, 6);
    expect(withGear.dodge).toBeGreaterThan(base.dodge + 0.02);
    expect(withGear.dmgReduction!).toBeGreaterThan(0.5);
    expect(withGear.crit).toBeGreaterThan(base.crit + 0.02);
  });

  it('les aventuriers gardent les anciens plafonds secs (leur calibration est à part)', () => {
    const L = 90;
    const legacy = playerWithGear(
      'a',
      ref(L),
      {},
      { dodgeAdd: 0.3, dmgReduction: 0.3 },
      L,
      undefined,
      {
        legacyCaps: true,
      },
    );
    expect(legacy.dodge).toBe(0.4);
    expect(legacy.dmgReduction).toBe(0.5);
  });

  it('tout début de partie : la somme simple d’avant (la courbe n’a pas de sens sans référence)', () => {
    const lo = playerWithGear(
      'n',
      { puissance: 0, endurance: 0, agilite: 0 },
      {},
      { critAdd: 0.05 },
      1,
    );
    expect(lo.crit).toBeCloseTo(0.05, 6);
  });
});

describe('élan compté par tour (refonte équipement, étape 1)', () => {
  const hero: Combatant = {
    name: 'h',
    pv: 100000,
    damage: 10,
    crit: 0,
    dodge: 0,
    initiative: 100,
    strikes: 20,
  };
  const dummy: Combatant = {
    name: 'd',
    pv: 10_000_000,
    damage: 1,
    crit: 0,
    dodge: 0,
    initiative: 0,
  };

  it('l’élan ne monte pas pendant le 1er tour, même à 20 coups par tour', () => {
    const r = simulateCombat({ ...hero, momentum: 0.5 }, dummy, { seed: 3, goldOnWin: 0 });
    const t1 = r.log.filter((e) => e.who === 'player' && e.round === r.log[0]!.round);
    expect(t1.length).toBeGreaterThan(10);
    expect(t1.every((e) => !e.skills?.includes('momentum'))).toBe(true);
  });

  it('il monte d’un cran par tour et plafonne à 4 tours', () => {
    const r = simulateCombat({ ...hero, damage: 100, momentum: 0.5, strikes: 1 }, dummy, {
      seed: 3,
      goldOnWin: 0,
    });
    const mine = r.log.filter((e) => e.who === 'player' && e.type === 'hit');
    // Variance ±15 % : on compare les moyennes par palier.
    const avg = (i: number) => mine[i]!.damage;
    expect(avg(1)).toBeGreaterThan(avg(0) * 1.2); // tour 2 : ×1,5
    expect(avg(4)).toBeGreaterThan(avg(1) * 1.5); // tour 5 : ×3
    const late = mine.slice(6, 12).map((e) => e.damage);
    expect(Math.max(...late)).toBeLessThanOrEqual(Math.round(100 * 1.15 * (1 + 4 * 0.5)));
    expect(COMBAT.momentumMaxStacks).toBe(4);
  });
});
