import { describe, expect, it } from 'vitest';
import {
  ADV_GEAR_AWAKEN,
  advGearAwakenPlan,
  advGearEffectTexts,
  advGearEffects,
  ascendAdvGear,
  awakenAdvGear,
  makeAdvGear,
  normalizeAdvGearState,
  type AdvGear,
} from '@/lib/advGear';
import { AWAKEN, type Adventurer } from '@/lib/adventurers';

const piece = (id: string, over: Partial<AdvGear> = {}): AdvGear => ({
  id,
  ...makeAdvGear({ lineage: 'guerrier', slot: 'weapon', rank: 'commun', grade: 'B' }),
  ...over,
});
const adv = (gear?: Adventurer['gear']): Adventurer => ({
  id: 'a',
  name: 'A',
  seed: 1,
  path: ['guerrier'],
  level: 10,
  xp: 0,
  ...(gear ? { gear } : {}),
});

describe('le plan d’éveil', () => {
  it('garde le plus avancé, fond le moins avancé', () => {
    const stock = [piece('b', { level: 3 }), piece('a', { level: 7 }), piece('c', { level: 1 })];
    const plan = advGearAwakenPlan(stock[0]!, stock, [])!;
    expect(plan.keep.id).toBe('a');
    expect(plan.consume.id).toBe('c');
    expect(plan.spare).toBe(2);
  });

  it('seulement le MÊME modèle', () => {
    const stock = [piece('a'), piece('b', { slot: 'armor' }), piece('c', { grade: 'A' })];
    expect(advGearAwakenPlan(stock[0]!, stock, [])).toBeNull();
  });

  it('jamais une pièce PORTÉE, mais la pièce gardée peut l’être', () => {
    const stock = [piece('a', { level: 7 }), piece('b', { level: 1 })];
    expect(advGearAwakenPlan(stock[0]!, stock, [adv({ weapon: 'b' })])).toBeNull();
    const plan = advGearAwakenPlan(stock[0]!, stock, [adv({ weapon: 'a' })])!;
    expect(plan.keep.id).toBe('a');
    expect(plan.consume.id).toBe('b');
  });

  it('jamais une pièce 🔒', () => {
    const stock = [piece('a', { level: 7 }), piece('b', { locked: true })];
    expect(advGearAwakenPlan(stock[0]!, stock, [])).toBeNull();
  });

  it('rien au maximum', () => {
    const stock = [piece('a', { awaken: ADV_GEAR_AWAKEN.max }), piece('b')];
    expect(advGearAwakenPlan(stock[0]!, stock, [])).toBeNull();
  });
});

describe('l’éveil', () => {
  it('fond un doublon et ne perd jamais un cran gagné sur l’autre', () => {
    const stock = [piece('a', { level: 7, awaken: 1 }), piece('b', { awaken: 3 })];
    const out = awakenAdvGear(stock, advGearAwakenPlan(stock[0]!, stock, [])!);
    expect(out.map((g) => g.id)).toEqual(['a']);
    expect(out[0]!.awaken).toBe(4);
  });

  it('plafonne à 5', () => {
    const stock = [piece('a', { level: 7, awaken: 4 }), piece('b', { awaken: 4 })];
    expect(awakenAdvGear(stock, advGearAwakenPlan(stock[0]!, stock, [])!)[0]!.awaken).toBe(5);
  });

  it('+8 % par cran sur les stats, au combat ET à l’écran', () => {
    const base = advGearEffects([piece('a')]);
    const up = advGearEffects([piece('a', { awaken: 2 })]);
    const k = Object.keys(base).find((x) => (base as Record<string, number>)[x] !== 0)!;
    expect((up as Record<string, number>)[k]).toBeCloseTo(
      (base as Record<string, number>)[k]! * (1 + 2 * AWAKEN.perStep),
      6,
    );
    expect(advGearEffectTexts(piece('a', { awaken: 5 }))).not.toEqual(
      advGearEffectTexts(piece('a')),
    );
  });

  it('survit à la relecture du stock et à l’ascension', () => {
    const g = piece('a', { level: 10, awaken: 3 });
    expect(normalizeAdvGearState({ stock: [g] }).stock[0]!.awaken).toBe(3);
    expect(ascendAdvGear(g, 50).awaken).toBe(3);
  });
});
