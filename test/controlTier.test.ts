// 🏅 Les crans d'un point fixe (2026-09-30, décisions de l'utilisateur) : +1 par 24 h tenues
// (plafond 10), −1 à la perte puis −1 par 24 h chez l'ennemi ; chaque cran rapporte plus ET
// attire une troupe de reprise plus grosse.
import { describe, expect, it } from 'vitest';
import {
  TIER,
  captureControl,
  controlGoldPerHour,
  controlIdOf,
  controlStock,
  controlTier,
  controlTravelMult,
  ensureControls,
  garrisonHold,
  loseControl,
  nextTierInMs,
  retakeForce,
  tierThreatMult,
  tierYieldMult,
} from '@/lib/controlPoints';
import { createMap, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { partyAllies, refChampionAdv } from '@/lib/caravan';

const D = TIER.dayMs;
const H = 3600_000;
const ID = controlIdOf('mine');
const base = (): ExpeditionMap => ensureControls(createMap(5, 0, 30, 1), 0, 30);
const pt = (m: ExpeditionMap, id = ID): Poi => m.pois.find((p) => p.id === id)!;

describe('🏅 le cran monte tant qu’on tient', () => {
  const m = captureControl(base(), ID, ['a0', 'a1', 'a2'], 0, 7);
  const c = pt(m).control!;
  it('+1 toutes les 24 h, jamais avant', () => {
    expect(controlTier(c, 0)).toBe(0);
    expect(controlTier(c, D - 1)).toBe(0);
    expect(controlTier(c, D)).toBe(1);
    expect(controlTier(c, 3 * D + 5 * H)).toBe(3);
  });
  it('plafonne à 10', () => {
    expect(controlTier(c, 10 * D)).toBe(TIER.max);
    expect(controlTier(c, 40 * D)).toBe(TIER.max);
    expect(nextTierInMs(c, 40 * D)).toBeNull();
  });
  it('annonce le temps avant le prochain cran', () => {
    expect(nextTierInMs(c, 2 * D + 5 * H)).toBe(D - 5 * H);
  });
  it('un point tenu d’avant la règle compte depuis sa prise', () => {
    const legacy = { ...c, tier: undefined, tierAt: undefined, since: 0 };
    expect(controlTier(legacy, 4 * D)).toBe(4);
  });
});

describe('🏅 le cran baisse quand on perd', () => {
  const held = captureControl(base(), ID, ['a0'], 0, 7);
  const lost = loseControl(held, ID, 30, 3 * D + H);
  const c = pt(lost).control!;
  it('−1 tout de suite, puis −1 toutes les 24 h', () => {
    expect(c.owner).toBe('enemy');
    expect(controlTier(c, 3 * D + H)).toBe(2);
    expect(controlTier(c, 4 * D + H - 1)).toBe(2);
    expect(controlTier(c, 4 * D + H)).toBe(1);
    expect(controlTier(c, 9 * D)).toBe(0);
    expect(nextTierInMs(c, 9 * D)).toBeNull();
  });
  it('reprendre vite coûte un cran, pas tout', () => {
    const back = captureControl(lost, ID, ['a0'], 3 * D + 2 * H, 7);
    const b = pt(back).control!;
    expect(controlTier(b, 3 * D + 2 * H)).toBe(2);
    expect(controlTier(b, 4 * D + 2 * H)).toBe(3);
  });
  it('reprendre tard repart de ce qu’il reste', () => {
    const back = captureControl(lost, ID, ['a0'], 5 * D + 2 * H, 7);
    expect(controlTier(pt(back).control!, 5 * D + 2 * H)).toBe(0);
  });
  it('perdu au cran 0, il reste à 0', () => {
    const early = loseControl(held, ID, 30, H);
    expect(controlTier(pt(early).control!, H)).toBe(0);
  });
});

describe('🏅 un cran rapporte plus', () => {
  const m = captureControl(base(), ID, ['a0', 'a1', 'a2'], 0, 7);
  const p = { ...pt(m), control: { ...pt(m).control!, attackAt: 9e15 } };
  it('chaque heure au cran qu’elle avait', () => {
    const perH = controlGoldPerHour(p, 3, 30);
    const expected = perH * 24 * (tierYieldMult(0) + tierYieldMult(1) + tierYieldMult(2));
    expect(Math.abs(controlStock(p, 72 * H, 30) - expected)).toBeLessThanOrEqual(1);
    // Au plafond, le débit ne monte plus.
    const late = controlStock(p, 21 * D, 30) - controlStock(p, 20 * D, 30);
    expect(Math.abs(late - perH * 24 * tierYieldMult(TIER.max))).toBeLessThanOrEqual(1);
  });
  it('la tour raccourcit davantage les trajets', () => {
    const t = captureControl(base(), controlIdOf('tower'), ['a0', 'a1', 'a2'], 0, 7);
    expect(controlTravelMult(t, 0)).toBeCloseTo(0.8, 5);
    expect(controlTravelMult(t, 10 * D)).toBeCloseTo(1 - 0.2 * tierYieldMult(10), 5);
  });
});

describe('🏅 un point ancien est plus convoité', () => {
  const m = captureControl(base(), ID, ['a0', 'a1', 'a2'], 0, 7);
  const at = (attackAt: number): Poi => ({
    ...pt(m),
    level: 30,
    control: { ...pt(m).control!, attackAt },
  });
  it('la troupe de reprise grossit avec le cran à l’heure de l’attaque', () => {
    const young = retakeForce(at(H), 1);
    const old = retakeForce(at(10 * D + H), 1);
    expect(old.size / young.size).toBeCloseTo(tierThreatMult(10) / tierThreatMult(0), 9);
  });
  it('la tenue annoncée baisse avec le cran, sans jamais dépasser 90 %', () => {
    const allies = partyAllies(
      [0, 1, 2].map((i) => ({ ...refChampionAdv(30, i), id: `a${i}` })),
      { advGear: [] },
      null,
    );
    const y = garrisonHold(at(H), allies);
    const o = garrisonHold(at(10 * D + H), allies);
    expect(y).toBeLessThanOrEqual(0.9);
    expect(o).toBeLessThan(y);
  }, 60_000);
});
