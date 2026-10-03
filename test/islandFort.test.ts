import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap, type Poi } from '@/lib/expedition';
import {
  CONTROL,
  captureControl,
  controlIdOf,
  controlYieldCard,
  ensureControls,
  fortCutFor,
  garrisonHold,
  retakeForce,
} from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { refEscortUnits } from '@/lib/caravan';

const NOW = Date.UTC(2026, 9, 3, 12);
const DAY = 24 * 3600_000;
const LV = 70;
const FORT = controlIdOf('fort');
// 🎯 Plus de camp d'entraînement sur les îles (2026-10-03) : le lieu épaulé est le cartographe.
const CAMP = controlIdOf('cartographer');

function island4(): ExpeditionMap {
  const m = createMap(4, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(4));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
/** Le camp tenu ; le fortin tenu par `n` sentinelles (0 = à l'ennemi). L'attaque du camp est
 *  posée à une heure fixe : la troupe tirée en dépend. */
function heldWithFort(n: number): ExpeditionMap {
  let m = captureControl(island4(), CAMP, ['a', 'b', 'c'], NOW, 7);
  if (n > 0) m = captureControl(m, FORT, ['s1', 's2', 's3', 's4', 's5'].slice(0, n), NOW, 7);
  const at = NOW + 2 * DAY;
  m = {
    ...m,
    pois: m.pois.map((p) =>
      p.id === CAMP ? { ...p, control: { ...p.control!, attackAt: at } } : p,
    ),
  };
  return ensureIslandConquest(m, NOW + 1000, LV);
}
const poi = (m: ExpeditionMap, id: string): Poi => m.pois.find((p) => p.id === id)!;

describe('🧱 le fortin de l’île 4', () => {
  it('l’île 4 le porte, avec son nom', () => {
    expect(poiLabel(poi(island4(), FORT))).toContain('Fortin');
  });

  it('tenu par 3, la troupe qui reprend le cartographe perd un quart', () => {
    const without = retakeForce(poi(heldWithFort(0), CAMP), 1).size;
    const withFort = retakeForce(poi(heldWithFort(3), CAMP), 1).size;
    expect(withFort / without).toBeCloseTo(1 - CONTROL.fortCut, 6);
  });

  it('plus de sentinelles, plus d’effet ; personne, aucun', () => {
    expect(fortCutFor(0)).toBe(0);
    expect(fortCutFor(1)).toBeLessThan(fortCutFor(3));
    expect(fortCutFor(5)).toBeGreaterThan(fortCutFor(3));
    const one = retakeForce(poi(heldWithFort(1), CAMP), 1).size;
    const five = retakeForce(poi(heldWithFort(5), CAMP), 1).size;
    expect(five).toBeLessThan(one);
  });

  it('le fortin ne se couvre pas lui-même', () => {
    expect(poi(heldWithFort(3), FORT).control!.fortMult).toBeUndefined();
  });

  it('perdu ou vide, son effet disparaît des autres lieux', () => {
    expect(poi(heldWithFort(3), CAMP).control!.fortMult).toBeLessThan(1);
    expect(poi(heldWithFort(0), CAMP).control!.fortMult).toBeUndefined();
  });

  it('le pronostic de tenue suit : un lieu épaulé tient mieux, au-delà du plafond de 90 %', () => {
    const allies = refEscortUnits(LV);
    const a = garrisonHold(poi(heldWithFort(0), CAMP), allies, 1);
    const b = garrisonHold(poi(heldWithFort(5), CAMP), allies, 1);
    expect(b).toBeGreaterThan(a);
  });

  it('la tuile dit l’effet sur les reprises voisines', () => {
    const card = controlYieldCard(poi(heldWithFort(3), FORT), NOW + DAY, LV)!;
    expect(card.value).toBe(`−${Math.round(CONTROL.fortCut * 100)} %`);
    expect(card.what).toContain('autres lieux');
  });
});
