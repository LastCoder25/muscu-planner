// 🧍 PETITES FORCES ET DEMI-CRANS DE GARDES (2026-09-22) — cf. `SMALL_FORCE_RELIEF`
// (camp.ts) et `HARVEST_GUARD_SIZES` (expedition.ts).
import { describe, it, expect } from 'vitest';
import {
  campFoe,
  campWinPct,
  smallForceMult,
  smallForceWeight,
  SMALL_FORCE_RELIEF,
} from '@/lib/camp';
import { refEscortUnits } from '@/lib/caravan';
import { HARVEST_GUARD_SIZES, harvestGuardOf, type Poi } from '@/lib/expedition';

const poiAt = (level: number): Poi =>
  ({ id: 'sf', type: 'shrine', level, distNorm: 0.5 }) as unknown as Poi;

/** Victoire MOYENNE des champions de référence pris un par un (ou deux par deux) contre une
 *  force de taille `size` — la mesure qui a produit la table. */
function avgWin(level: number, size: number, k: 1 | 2, samples = 60): number {
  const ref = refEscortUnits(level);
  const groups =
    k === 1
      ? [[0], [1], [2]]
      : [
          [0, 1],
          [0, 2],
          [1, 2],
        ];
  const poi = poiAt(level);
  let s = 0;
  for (const g of groups)
    s += campWinPct(
      poi,
      { faction: 'bandits', size },
      g.map((i) => ref[i]!),
      samples,
    );
  return s / groups.length;
}

describe('🧍 la correction des petites forces', () => {
  it('pleine à la taille 1, nulle à partir de 2 : la calibration des camps (≥ 2) est intacte', () => {
    expect(smallForceWeight(0.6)).toBe(1);
    expect(smallForceWeight(1)).toBe(1);
    expect(smallForceWeight(1.5)).toBeCloseTo(0.5);
    expect(smallForceWeight(2)).toBe(0);
    expect(smallForceWeight(3)).toBe(0);
    for (const L of [5, 45, 95]) {
      expect(smallForceMult(L, 2)).toBe(1);
      expect(smallForceMult(L, 3)).toBe(1);
    }
  });

  it('elle ne DURCIT jamais : aucune valeur au-dessus de 1', () => {
    for (const r of SMALL_FORCE_RELIEF) expect(r).toBeLessThanOrEqual(1);
  });

  it('elle passe bien par la force du camp (PV et dégâts)', () => {
    const p = poiAt(95);
    const a = campFoe(p, { faction: 'bandits', size: 1 });
    const b = campFoe(p, { faction: 'bandits', size: 2 });
    // Sans correction, la taille 2 vaudrait exactement le double de la taille 1.
    expect(b.pv / a.pv).toBeGreaterThan(2.2);
  });

  it('un champion contre une force de taille 1 : même difficulté à TOUS les rangs (70-92 %)', () => {
    // Mesuré avant la correction : 83-86 % aux rangs 0-3, puis jusqu'à 46 % au rang 9.
    for (const L of [5, 25, 45, 65, 85, 95]) {
      const w = avgWin(L, 1, 1);
      expect(w, `niveau ${L}`).toBeGreaterThan(0.7);
      expect(w, `niveau ${L}`).toBeLessThan(0.92);
    }
  });
});

describe('🛡️ gardes en demi-crans : un vrai dégradé', () => {
  it('les tailles de gardes comptent des demi-crans', () => {
    expect(HARVEST_GUARD_SIZES).toEqual([1, 1.5, 2, 2.5]);
  });

  it('1,5 garde : perdu seul, sûr à deux', () => {
    for (const L of [8, 45, 85]) {
      expect(avgWin(L, 1.5, 1), `seul, niveau ${L}`).toBeLessThan(0.3);
      expect(avgWin(L, 1.5, 2), `à deux, niveau ${L}`).toBeGreaterThan(0.9);
    }
  });

  it('2,5 gardes : un vrai pari à deux, loin du sûr', () => {
    for (const L of [8, 45, 85]) {
      const w = avgWin(L, 2.5, 2);
      expect(w, `niveau ${L}`).toBeLessThan(0.7);
    }
  });

  it('chaque taille est tirée (générateur de l’id)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const g = harvestGuardOf({ id: `p${i}`, type: 'well', level: 30 });
      seen.add(g!.size);
    }
    expect([...seen].sort()).toEqual([1, 1.5, 2, 2.5]);
  });
});
