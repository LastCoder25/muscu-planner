import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, ruinsChampionSeals, RUINS_SEALS, type ExpeditionMap } from '@/lib/expedition';
import { captureControl, collectControl, ensureControls } from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { characterRank } from '@/lib/characterRank';
import { harvestOver } from './helpers/controlHarvest';

/**
 * ⚱️ L'OSSUAIRE PRODUIT SELON LE NIVEAU DU HÉROS (2026-10-08, demandé par l'utilisateur), comme
 * l'arsenal : la part de champion d'une ruine du rang du héros (3 × (1 + rang)) toutes les
 * 216 h, garnison au complet — 1 sceau / 72 h en Bronze comme avant, 10 au rang suprême.
 * Le RANG des sceaux est celui du héros.
 */
const NOW = Date.UTC(2026, 9, 8, 12);
const H = 3600_000;

function heldOssuary(): { m: ExpeditionMap; id: string } {
  const L = 40;
  let m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(2));
  m = ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
  const id = m.pois.find((p) => p.control?.kind === 'ossuary')!.id;
  m = captureControl(m, id, ['a', 'b', 'c', 'd', 'e'], NOW, 7);
  return { m, id };
}

describe('⚱️ l’ossuaire suit le niveau du héros', () => {
  const { m, id } = heldOssuary();
  // Sur 45 jours : les crans de tenue jouent pareil à tous les niveaux, seul le rang change.
  const over = (level: number) => harvestOver(m, id, NOW, 45 * 24, level).champSeals;
  const bronze = over(5);
  for (const level of [25, 55, 100]) {
    it(`niveau ${level} : (1 + rang) fois le Bronze`, () => {
      const k = 1 + characterRank(level).rankIndex;
      expect(Math.abs(over(level) - bronze * k)).toBeLessThanOrEqual(k);
      expect(k * RUINS_SEALS.championPerRank).toBe(ruinsChampionSeals(level));
    });
  }
  it('en Bronze, le débit d’avant (1 sceau / 72 h au complet, crans en plus)', () => {
    // Avant : shareOf / 72 ; maintenant 3 × shareOf / 216 — le même débit.
    expect(ruinsChampionSeals(5) / 216).toBeCloseTo(1 / 72);
    expect(bronze).toBeGreaterThan(0);
  });
  it('les sceaux sont au rang du héros', () => {
    const far = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === id ? { ...p, control: { ...p.control!, attackAt: NOW + 1e12 } } : p,
      ),
    };
    const c = collectControl(far, id, NOW + 216 * H, 55);
    expect(c.champSealRank).toBe(characterRank(55).rankIndex);
  });
});
