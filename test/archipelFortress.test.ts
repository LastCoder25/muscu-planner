import { describe, expect, it } from 'vitest';
import { campWinPct } from '@/lib/camp';
import { refEscortUnits } from '@/lib/caravan';
import { ISLANDS } from '@/lib/archipelago';
import { fortressForce } from '@/lib/islandConquest';
import type { Poi } from '@/lib/expedition';

/**
 * 🏰 ÉTAPE 6 — LA FORTERESSE DE CHAQUE ÎLE, à la règle 7 (mesuré le 2026-10-02 avec les
 * champions de référence ; l'étape 0 donnait 8 champions 88-100 %, 5 champions 0-28 %).
 * Affaiblie au plus bas (tous les objectifs abattus) : une ARMÉE de 8 champions au plafond
 * de l'île la prend, 5 ne suffisent pas. Intacte, elle résiste à 8 — d'où le verrou.
 *
 * Durées simulées (joueur régulier, 700 XP/jour, champions du vrai tirage), niveau du joueur
 * où la forteresse affaiblie devient prenable (≥ 70 %) : île 1 → 19 (~26 j) · île 2 → 30
 * (~66 j) · île 3 → 48 (~167 j) · île 4 → 61 (~269 j) · île 5 → 81 (~474 j).
 */
const poiAt = (level: number): Poi =>
  ({ id: 'fort', type: 'control', level, distNorm: 0.5 }) as unknown as Poi;
function win(champLevel: number, level: number, size: number, n: number, isl: number): number {
  const ref = refEscortUnits(champLevel);
  const allies = Array.from({ length: n }, (_, i) => ref[i % ref.length]!);
  const faction = ISLANDS[isl - 1]!.faction;
  return campWinPct(poiAt(level), { faction, size }, allies, 60);
}

describe('🏰 la forteresse, île par île', () => {
  for (const isl of ISLANDS) {
    it(`île ${isl.id} : 8 champions au plafond la prennent affaiblie, 5 non, intacte elle tient`, () => {
      const weak = fortressForce(isl, isl.objectives);
      expect(weak.locked).toBe(false);
      expect(win(isl.maxLevel, weak.level, weak.size, 8, isl.id)).toBeGreaterThanOrEqual(0.7);
      expect(win(isl.maxLevel, weak.level, weak.size, 5, isl.id)).toBeLessThan(0.5);
      const intact = fortressForce(isl, 0);
      expect(intact.locked).toBe(true);
      expect(win(isl.maxLevel, intact.level, intact.size, 8, isl.id)).toBeLessThan(0.5);
    }, 60_000);
  }
});
