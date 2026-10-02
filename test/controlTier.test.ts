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
  controlTierLabel,
  controlTravelMult,
  ensureControls,
  garrisonHold,
  loseControl,
  nextTierInMs,
  reinforceControl,
  releaseFromControl,
  retakeForce,
  settleReinforcements,
  tierStepMs,
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
  // 3 en garnison : le rythme de référence, un cran par 24 h.
  const held = captureControl(base(), ID, ['a0', 'a1', 'a2'], 0, 7);
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
    const back = captureControl(lost, ID, ['a0', 'a1', 'a2'], 3 * D + 2 * H, 7);
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

// 🏅👥 Le rythme suit la garnison (2026-10-01, demandé par l'utilisateur) : vide, bloqué ;
// plus de monde, plus vite (la courbe `garrisonShare` de la production).
describe('🏅👥 le cran se charge au rythme de la garnison', () => {
  const held = (ids: string[]) => pt(captureControl(base(), ID, ids, 0, 7)).control!;
  it('sans personne, il est bloqué', () => {
    const c = held([]);
    expect(controlTier(c, 30 * D)).toBe(0);
    expect(nextTierInMs(c, 30 * D)).toBeNull();
    expect(tierStepMs(0)).toBeNull();
    expect(controlTierLabel(c, 30 * D)!.detail).toContain('bloqué');
  });
  it('1 : 48 h · 3 : 24 h · 5 : plus vite encore', () => {
    expect(tierStepMs(1)).toBe(2 * D);
    expect(tierStepMs(3)).toBe(D);
    expect(tierStepMs(5)!).toBeLessThan(tierStepMs(4)!);
    expect(tierStepMs(4)!).toBeLessThan(D);
    const one = held(['a0']);
    expect(controlTier(one, 2 * D - 1)).toBe(0);
    expect(controlTier(one, 2 * D)).toBe(1);
    const five = held(['a0', 'a1', 'a2', 'mil:1', 'mil:2']);
    expect(controlTier(five, tierStepMs(5)!)).toBe(1);
    expect(controlTier(five, tierStepMs(5)! - 1)).toBe(0);
  });
  it('vider la garnison fige la charge, la remplir la reprend où elle était', () => {
    let m = captureControl(base(), ID, ['a0', 'a1', 'a2'], 0, 7);
    m = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === ID ? { ...p, control: { ...p.control!, attackAt: 9e15 } } : p,
      ),
    };
    // 12 h à 3 : un demi-cran chargé, puis tout le monde rentre.
    m = releaseFromControl(m, ID, ['a0', 'a1', 'a2'], D / 2, 30);
    const empty = pt(m).control!;
    expect(controlTier(empty, 10 * D)).toBe(0);
    // Un renfort de 3 arrive au jour 10 : il ne reste qu'un demi-cran à charger.
    m = reinforceControl(m, ID, ['b0', 'b1', 'b2'], 10 * D);
    m = settleReinforcements(m, 10 * D, 30);
    const back = pt(m).control!;
    expect(controlTier(back, 10 * D + D / 2 - 1)).toBe(0);
    expect(controlTier(back, 10 * D + D / 2)).toBe(1);
  });
  it('la production d’avant le changement garde les crans qu’elle avait', () => {
    let m = captureControl(base(), ID, ['a0', 'a1', 'a2'], 0, 7);
    m = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === ID ? { ...p, control: { ...p.control!, attackAt: 9e15 } } : p,
      ),
    };
    const perH = controlGoldPerHour(pt(m), 3, 30);
    // 2 jours à 3 (crans 0 puis 1), puis un départ : la réserve ne bouge pas.
    const before = controlStock(pt(m), 2 * D, 30);
    m = releaseFromControl(m, ID, ['a2'], 2 * D, 30);
    expect(Math.abs(controlStock(pt(m), 2 * D, 30) - before)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(before - perH * 24 * (tierYieldMult(0) + tierYieldMult(1))),
    ).toBeLessThanOrEqual(1);
  });
});
