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
  it('⚖️ au rythme de l’arsenal : même besoin, même offre (2026-10-08)', () => {
    // Monter un champion d'un rang coûte autant de sceaux de champion que ses 4 pièces en
    // sceaux d'objet : l'ossuaire et l'arsenal produisent donc au même débit (1 / 16 h en
    // Bronze au complet), et une ruine « champion » vaut une ruine « objet ».
    expect(RUINS_SEALS.championPerRank).toBe(RUINS_SEALS.gearPerRank);
    expect(CONTROL.ossuaryHoursPerRuin).toBe(CONTROL.arsenalHoursPerRuin);
    expect(ruinsChampionSeals(5) / CONTROL.ossuaryHoursPerRuin).toBeCloseTo(1 / 16);
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
