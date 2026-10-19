import { describe, expect, it } from 'vitest';
import { campWinPct } from '@/lib/camp';
import { heroPartyCombatant, refEscortUnits } from '@/lib/caravan';
import { ISLANDS } from '@/lib/archipelago';
import { fortressForce } from '@/lib/islandConquest';
import type { Poi } from '@/lib/expedition';
import type { SkirmishUnit } from '@/lib/skirmish';

/**
 * 🏰 LA FORTERESSE DE CHAQUE ÎLE, OBJECTIF DE FIN D'ÎLE (v1.241.0, mesuré ; réécrit : l'ancien
 * test mesurait un assaut NON pondéré, 8 champions au plafond). Champions de référence 3
 * niveaux sous le héros, héros compté 2 champions, assaut à rendement décroissant
 * (`fortressAssault.ts`).
 * - Affaiblie, au plafond de l'île : 10 champions la prennent (≥ 60 %).
 * - Affaiblie, 15 niveaux sous le plafond : même 30 champions échouent (≤ 20 %).
 * - Intacte, au plafond : même 30 champions échouent le plus souvent (< 35 %) — d'où le verrou.
 * L'île 1 garde son ancienne règle : on y a peu de champions (8 au plafond ≥ 70 %).
 */
function army(hero: number, n: number): SkirmishUnit[] {
  const ref = refEscortUnits(Math.max(1, hero - 3));
  const out: SkirmishUnit[] = Array.from({ length: n }, (_, i) => ({
    ...ref[i % ref.length]!,
    id: `c${String(i).padStart(2, '0')}`,
  }));
  const strong = { ...ref[0]!.combatant, pv: 1e7, damage: 1e6 };
  out.push({
    id: 'hero',
    name: 'Héros',
    emoji: '🧝',
    level: hero,
    combatant: heroPartyCombatant({ name: 'Héros', level: hero, combatant: strong }),
  });
  return out;
}
const fortAt = (level: number, faction: string): Poi =>
  ({
    id: 'isl_fortress',
    type: 'control',
    level,
    distNorm: 0.5,
    control: { kind: 'fortress', owner: 'enemy', faction, size: 0, garrison: [], retakes: 0 },
  }) as unknown as Poi;

describe('🏰 la forteresse, île par île', () => {
  for (const isl of ISLANDS) {
    it(`île ${isl.id} : prenable au plafond, pas avant, intacte elle tient`, () => {
      const weak = fortressForce(isl, isl.objectives);
      const intact = fortressForce(isl, 0);
      expect(weak.locked).toBe(false);
      expect(intact.locked).toBe(true);
      const p = fortAt(weak.level, isl.faction);
      const win = (size: number, hero: number, n: number) =>
        campWinPct(p, { faction: isl.faction, size }, army(hero, n), 120);
      const M = isl.maxLevel;
      if (isl.id === 1) {
        expect(win(weak.size, M, 6)).toBeGreaterThanOrEqual(0.7);
        expect(win(intact.size, M, 6)).toBeLessThan(0.5);
        return;
      }
      expect(win(weak.size, M, 10)).toBeGreaterThanOrEqual(0.6);
      expect(win(weak.size, M - 15, 30)).toBeLessThanOrEqual(0.2);
      expect(win(intact.size, M, 30)).toBeLessThan(0.35);
    }, 60_000);
  }
});
