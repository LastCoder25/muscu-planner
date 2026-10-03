import { describe, expect, it } from 'vitest';
import { FORTIFY, fortifyMult, type DefenseStructure } from '@/lib/raid';
import { CONTROL, garrisonHold, garrisonHoldChance } from '@/lib/controlPoints';
import { retakeBattle } from '@/lib/fieldArmy';
import { militiaUnits } from '@/lib/militia';
import type { Poi } from '@/lib/expedition';

/**
 * 🧱🏹 L'ENCEINTE RENFORCE LES GARNISONS (décision de l'utilisateur, 2026-10-03, « piste 1 ») :
 * plus aucun siège ne vient sur la base, la muraille et les tourelles servent désormais à
 * TOUS les lieux fixes tenus, sur toutes les îles.
 */
const wall = (level: number): DefenseStructure => ({ typeId: 'wall', level }) as DefenseStructure;
const turret = (level: number): DefenseStructure =>
  ({ typeId: 'turret', level }) as DefenseStructure;

const point = (L: number, attackAt = 123_456_789): Poi =>
  ({
    id: 'ctl_mine',
    type: 'control',
    level: L,
    x: 0,
    y: 0,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 0,
    control: {
      kind: 'mine',
      owner: 'player',
      garrison: [],
      retakes: 0,
      faction: 'bandits',
      size: 1,
      attackAt,
    },
  }) as unknown as Poi;
const mil = (n: number, L: number) =>
  militiaUnits(
    Array.from({ length: n }, (_, i) => `mil:${i}`),
    L,
  );

describe('🧱🏹 ce que vaut l’enceinte', () => {
  it('rien sans enceinte ; ÷1,3 à niveau ; chaque structure vaut sa moitié', () => {
    expect(fortifyMult([], 30)).toBe(1);
    expect(fortifyMult([wall(30), turret(30)], 30)).toBeCloseTo(1 + FORTIFY.max, 10);
    expect(fortifyMult([wall(30)], 30)).toBeCloseTo(1 + FORTIFY.max / 2, 10);
    expect(fortifyMult([wall(15), turret(15)], 30)).toBeCloseTo(1 + FORTIFY.max / 2, 10);
  });
  it('au-delà du niveau du héros, rien de plus (le sport reste le plafond)', () => {
    expect(fortifyMult([wall(80), turret(80)], 30)).toBeCloseTo(1 + FORTIFY.max, 10);
  });
});

describe('🧱🏹 la garnison tient mieux, jamais au-delà du suspense', () => {
  // ⚠️ MESURÉ : la tenue d'une garnison FAIBLE (2 miliciens) monte nettement avec l'enceinte ;
  // celle d'une garnison forte reste plafonnée à `CONTROL.maxHold` (90 %).
  it('une petite garnison de miliciens tient nettement mieux', () => {
    for (const L of [10, 30, 60]) {
      const units = mil(2, L);
      const nu = garrisonHoldChance(point(L), units, 1, 60, 1);
      const fort = garrisonHoldChance(point(L), units, 1, 60, fortifyMult([wall(L), turret(L)], L));
      expect(fort).toBeGreaterThan(nu + 0.05);
    }
  });
  it('le pronostic affiché ne dépasse jamais le plafond de suspense', () => {
    for (const L of [10, 60]) {
      const units = mil(5, L);
      expect(garrisonHold(point(L), units, 1 + FORTIFY.max)).toBeLessThanOrEqual(CONTROL.maxHold);
      expect(garrisonHold(point(L), units, 1 + FORTIFY.max)).toBeGreaterThanOrEqual(
        garrisonHold(point(L), units, 1) - 0.02,
      );
    }
  });
  it('la bataille réelle compte l’enceinte : troupe ennemie divisée d’autant', () => {
    const L = 30;
    const p = point(L);
    const units = mil(1, L); // garnison faible : aucun renfort ennemi (boost 1)
    const nu = retakeBattle({ seed: 42 }, p, units, L, 1).force.size;
    const fort = retakeBattle({ seed: 42 }, p, units, L, 1.3).force.size;
    expect(fort).toBeCloseTo(nu / 1.3, 6);
  });
});
