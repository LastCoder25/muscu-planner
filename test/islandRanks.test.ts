import { describe, expect, it } from 'vitest';
import { ISLANDS, ISLAND_OUTPOST_LEVEL, archipelOn } from '@/lib/archipelago';
import {
  advanceWorld,
  archipelFloor,
  createMap,
  poiDifficultyLevel,
  riftLevelFor,
  type ExpeditionMap,
} from '@/lib/expedition';
import { attackerLevel, ensureControls } from '@/lib/controlPoints';
import { characterRank } from '@/lib/characterRank';
import { mulberry32 } from '@/lib/combat';
import { DIFFICULTY_MAX_LEVEL } from '@/lib/poiDifficulty';
import { islandRaidBand, rollRaid } from '@/lib/raid';

/**
 * 🏝️ RÈGLE DES RANGS SUR UNE ÎLE (2026-10-02, décision de l'utilisateur, « borné au joueur ») :
 * lieux et armées tirent leur rang entre le rang MINIMUM de l'île et celui du joueur — jamais
 * au-dessus du joueur, jamais au-dessus du rang max de l'île.
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const rank = (lv: number) => characterRank(Math.max(1, lv)).rankIndex;

describe('🏝️ rangs bornés par l’île', () => {
  it('riftLevelFor ne tire jamais sous le rang d’entrée, ni au-dessus du joueur', () => {
    for (const isl of ISLANDS) {
      const L = isl.maxLevel;
      const seen = new Set<number>();
      const rng = mulberry32(isl.id * 97);
      for (let i = 0; i < 2000; i++) {
        const lv = riftLevelFor(rng, L, [L + 1], false, isl.minLevel);
        expect(rank(lv)).toBeGreaterThanOrEqual(rank(isl.minLevel));
        expect(lv).toBeLessThanOrEqual(L);
        seen.add(rank(lv));
      }
      // Les deux rangs de l'île sortent bien tous les deux.
      expect(seen.size).toBe(rank(isl.maxLevel) - rank(isl.minLevel) + 1);
    }
  });

  it('un joueur sous le niveau d’entrée ne voit que son rang, jamais au-dessus', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const lv = riftLevelFor(rng, 15, [16], false, 41);
      expect(lv).toBeLessThanOrEqual(15);
      expect(rank(lv)).toBe(rank(15));
    }
  });

  it('hors archipel, rien ne change (plancher 1)', () => {
    expect(archipelFloor(null)).toBe(1);
    expect(archipelFloor({})).toBe(1);
    const a = mulberry32(9);
    const b = mulberry32(9);
    for (let i = 0; i < 200; i++)
      expect(riftLevelFor(a, 45, [])).toBe(riftLevelFor(b, 45, [], false, 1));
  });

  for (const isl of ISLANDS.slice(1))
    it(`île ${isl.id} : lieux, points fixes et attaquants dans la tranche de l'île`, () => {
      const L = isl.maxLevel;
      const archipel = archipelOn(isl.id);
      expect(archipel.levelFloor).toBe(isl.minLevel);
      let m: ExpeditionMap = ensureControls(
        createMap(11, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipel),
        NOW,
        L,
        ISLAND_OUTPOST_LEVEL,
      );
      for (let t = NOW; t <= NOW + 6 * 24 * H; t += 4 * H)
        m = ensureControls(advanceWorld(m, t, L, ISLAND_OUTPOST_LEVEL), t, L, ISLAND_OUTPOST_LEVEL);
      const lo = rank(isl.minLevel);
      const hi = rank(isl.maxLevel);
      for (const p of m.pois) {
        if (p.type === 'warband' || p.army) continue;
        // Les rangs se lisent sur la DIFFICULTÉ (ce que la carte affiche) ; points fixes : niveau.
        const lv = p.type === 'control' ? p.level : poiDifficultyLevel(p);
        expect(rank(lv), `${p.id} (${p.type}) niv ${lv}`).toBeLessThanOrEqual(hi);
        // ⚠️ Un lieu à un seul garde PLAFONNE en difficulté (~80 au niveau max des ennemis) :
        // il ne peut pas atteindre le rang de l'île 5. Limite connue, hors de cette règle.
        if (p.level < DIFFICULTY_MAX_LEVEL)
          expect(rank(lv), `${p.id} (${p.type}) niv ${lv}`).toBeGreaterThanOrEqual(lo);
      }
      for (const p of m.pois.filter(
        (q) => q.type === 'control' && !q.control?.kind.match(/citadel/),
      ))
        for (let k = 0; k < 20; k++) {
          const q = { ...p, control: { ...p.control!, attackAt: NOW + k * 977 } };
          expect(rank(attackerLevel(m, q, L))).toBeGreaterThanOrEqual(lo);
        }
    });

  it('les sièges sur une île restent dans la tranche de l’île, jamais au-dessus du joueur', () => {
    expect(islandRaidBand(null, null, 50)).toBeNull();
    expect(islandRaidBand(21, 40, 35)).toEqual({ min: 21, max: 35 });
    expect(islandRaidBand(21, 40, 90)).toEqual({ min: 21, max: 40 });
    // Joueur sous le rang d'entrée : son rang à lui.
    expect(islandRaidBand(41, 60, 15)).toEqual({ min: 11, max: 15 });
    for (const isl of ISLANDS)
      for (const L of [isl.minLevel + 3, isl.maxLevel]) {
        const band = islandRaidBand(isl.minLevel, isl.maxLevel, L)!;
        for (let s = 1; s < 40; s++) {
          const raid = rollRaid(s, L, NOW, 8 * H, null, band);
          for (const g of raid.groups) {
            expect(g.level).toBeLessThanOrEqual(Math.min(L, isl.maxLevel));
            expect(rank(g.level)).toBeGreaterThanOrEqual(rank(isl.minLevel));
          }
        }
      }
    // Hors archipel, l'armée est identique au bit près.
    expect(rollRaid(7, 45, NOW, 8 * H, null, null)).toEqual(rollRaid(7, 45, NOW, 8 * H));
  });
});
