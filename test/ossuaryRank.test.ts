import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, ruinsChampionSeals, RUINS_SEALS, type ExpeditionMap } from '@/lib/expedition';
import { captureControl, collectControl, ensureControls, CONTROL } from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { characterRank } from '@/lib/characterRank';
import { harvestOver } from './helpers/controlHarvest';

/**
 * ⚱️ L'OSSUAIRE PRODUIT SELON LE NIVEAU DU HÉROS (2026-10-08, demandé par l'utilisateur), comme
 * l'arsenal : la part de champion d'une ruine du rang du héros (9 × (1 + rang)) toutes les
 * 144 h, garnison au complet — 1 sceau / 16 h en Bronze (au rythme de l'arsenal depuis le
 * 2026-10-08 : les sceaux de champion étaient 4,5 fois plus rares que ceux d'objet).
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
  it('⚖️ au rythme de l’arsenal, au débit des ruines (v1.218 : 6 sceaux de champion pour 9 d’objet)', () => {
    // L'ossuaire produit les sceaux d'une ruine « champion » au même RYTHME que l'arsenal ;
    // son débit suit donc la ruine (`ruinsChampionSeals`), réduit avec elle en v1.218.
    expect(RUINS_SEALS.championPerRank).toBeLessThan(RUINS_SEALS.gearPerRank);
    expect(CONTROL.ossuaryHoursPerRuin).toBe(CONTROL.arsenalHoursPerRuin);
    expect(ruinsChampionSeals(5) / CONTROL.ossuaryHoursPerRuin).toBeCloseTo(
      RUINS_SEALS.championPerRank / 144,
    );
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
