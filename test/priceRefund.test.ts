// 💰 Le remboursement de la baisse des prix (v1.51).
import { describe, expect, it } from 'vitest';
import { BUILD, buildingUpgradeCost } from '@/lib/buildings';
import { OLD_UP_BASE, PRICE_REFUND_SHARE, priceRefund } from '@/lib/priceRefund';

describe('💰 remboursement de la baisse des prix', () => {
  it('les prix ont bien baissé (sinon il n’y aurait rien à rendre)', () => {
    expect(BUILD.upBase).toBeLessThan(OLD_UP_BASE);
  });

  it('rien pour un compte sans crans payés (pose seule ou rien)', () => {
    expect(priceRefund([])).toBe(0);
    expect(priceRefund([0, 1, 1])).toBe(0);
  });

  it('un cran payé : la part de l’écart entre l’ancien et le nouveau prix', () => {
    const old = Math.round(OLD_UP_BASE * Math.pow(10, BUILD.upExp));
    const want = Math.round((old - buildingUpgradeCost(10)) * PRICE_REFUND_SHARE);
    // niveau 11 = crans 1 à 10 payés ; on isole le 10e en soustrayant le niveau 10
    expect(priceRefund([11]) - priceRefund([10])).toBeCloseTo(want, -1);
  });

  it('additif sur les structures, et croissant avec le niveau', () => {
    expect(priceRefund([20, 30])).toBe(priceRefund([20]) + priceRefund([30]));
    expect(priceRefund([31])).toBeGreaterThan(priceRefund([30]));
  });

  it('le compte qui l’a demandé (niveau 37, 10 structures) reçoit ~7 M', () => {
    const r = priceRefund([35, 35, 32, 32, 33, 37, 32, 35, 32, 35]);
    expect(r).toBeGreaterThan(6_000_000);
    expect(r).toBeLessThan(8_000_000);
  });
});
