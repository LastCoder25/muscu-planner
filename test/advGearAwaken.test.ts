import { describe, expect, it } from 'vitest';
import {
  ADV_GEAR_AWAKEN,
  advGearAwakenPlan,
  advGearEffectTexts,
  advGearEffects,
  ascendAdvGear,
  awakenAdvGear,
  awakenAllAdvGear,
  stripAdvGear,
  wornGear,
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

/** Un champion d'une lignée donnée, avec ce qu'on lui a assigné. */
const champ = (id: string, gear?: Adventurer['gear'], path = ['guerrier']): Adventurer => ({
  id,
  name: id,
  seed: 1,
  path,
  level: 10,
  xp: 0,
  ...(gear ? { gear } : {}),
});

describe('tout fusionner', () => {
  it('épuise un modèle : quatre copies deviennent une pièce éveillée trois fois', () => {
    const stock = [piece('a'), piece('b'), piece('c'), piece('d')];
    const out = awakenAllAdvGear(stock, []);
    expect(out.merged).toBe(3);
    expect(out.stock).toHaveLength(1);
    expect(out.stock[0]!.awaken).toBe(3);
  });

  it('traite CHAQUE modèle, pas seulement le premier', () => {
    const stock = [
      piece('a1'),
      piece('a2'),
      piece('b1', { slot: 'armor' }),
      piece('b2', { slot: 'armor' }),
      piece('c1', { grade: 'A' }),
      piece('c2', { grade: 'A' }),
    ];
    const out = awakenAllAdvGear(stock, []);
    expect(out.merged).toBe(3);
    expect(out.stock).toHaveLength(3);
    expect(out.stock.every((g) => g.awaken === 1)).toBe(true);
  });

  it('s’arrête au plafond et laisse le surplus', () => {
    const stock = Array.from({ length: ADV_GEAR_AWAKEN.max + 3 }, (_, i) => piece(`p${i}`));
    const out = awakenAllAdvGear(stock, []);
    expect(out.merged).toBe(ADV_GEAR_AWAKEN.max);
    expect(out.stock).toHaveLength(3);
    expect(Math.max(...out.stock.map((g) => g.awaken ?? 0))).toBe(ADV_GEAR_AWAKEN.max);
  });

  it('ne fond jamais une pièce PORTÉE ni 🔒, et DIT combien sont bloquées', () => {
    const stock = [
      piece('keep', { level: 9 }),
      piece('porte'),
      piece('verrou', { locked: true }),
      piece('libre'),
    ];
    const out = awakenAllAdvGear(stock, [champ('x', { weapon: 'porte' })]);
    expect(out.merged).toBe(1);
    expect(out.stock.map((g) => g.id).sort()).toEqual(['keep', 'porte', 'verrou']);
    expect(out.worn).toBe(1);
    expect(out.locked).toBe(1);
  });

  it('un doublon porté ET 🔒 n’est compté qu’une fois — sinon le message en annonce deux', () => {
    const stock = [piece('keep', { level: 9 }), piece('deux', { locked: true })];
    const out = awakenAllAdvGear(stock, [champ('x', { weapon: 'deux' })]);
    expect(out.worn + out.locked).toBe(1);
    expect(out.worn).toBe(1);
  });

  it('un doublon dont le gardé est au maximum n’est pas « bloqué »', () => {
    const stock = [
      piece('keep', { level: 9, awaken: ADV_GEAR_AWAKEN.max }),
      piece('porte'),
      piece('verrou', { locked: true }),
    ];
    const out = awakenAllAdvGear(stock, [champ('x', { weapon: 'porte' })]);
    expect(out.merged).toBe(0);
    expect(out.worn).toBe(0);
    expect(out.locked).toBe(0);
  });

  it('dit exactement ce que les boutons ✨ des lignes feraient, un par un', () => {
    const advs = [champ('x', { weapon: 'porte' })];
    const stock = [piece('keep', { level: 9 }), piece('porte'), piece('l1'), piece('l2')];
    // La même chose à la main : on rejoue le plan d'une ligne jusqu'à épuisement.
    let cur = stock;
    let n = 0;
    for (;;) {
      const plan = cur.map((g) => advGearAwakenPlan(g, cur, advs)).find((p) => !!p);
      if (!plan) break;
      cur = awakenAdvGear(cur, plan);
      n++;
    }
    const out = awakenAllAdvGear(stock, advs);
    expect(out.merged).toBe(n);
    expect(out.stock.map((g) => `${g.id}:${g.awaken ?? 0}`).sort()).toEqual(
      cur.map((g) => `${g.id}:${g.awaken ?? 0}`).sort(),
    );
  });

  it('rien à fondre : le stock ne bouge pas', () => {
    const stock = [piece('a'), piece('b', { slot: 'armor' })];
    const out = awakenAllAdvGear(stock, []);
    expect(out.merged).toBe(0);
    expect(out.stock).toEqual(stock);
  });
});

describe('tout retirer', () => {
  it('rend le vivier sans une pièce, et compte juste', () => {
    const advs = [champ('x', { weapon: 'a', armor: 'b' }), champ('y', { relic: 'c' }), champ('z')];
    const out = stripAdvGear(advs);
    expect(out.removed).toBe(3);
    expect(out.advs.every((a) => !Object.values(a.gear ?? {}).some(Boolean))).toBe(true);
  });

  it('retire aussi une pièce que le COMBAT ignore (mauvais métier)', () => {
    const stock = [piece('arc', { lineage: 'archer' })];
    const advs = [champ('x', { weapon: 'arc' })]; // guerrier : il ne peut pas la porter
    expect([...wornGear(advs, stock).values()].flat()).toHaveLength(0);
    expect(stripAdvGear(advs).removed).toBe(1);
  });

  it('le 🔒 ne protège que de la vente : la pièce se retire quand même', () => {
    const advs = [champ('x', { weapon: 'verrou' })];
    expect(stripAdvGear(advs).removed).toBe(1);
    expect(stripAdvGear(advs).advs[0]!.gear).toEqual({});
  });

  it('personne ne porte rien : le MÊME tableau, on n’écrit pas à vide', () => {
    const advs = [champ('x'), champ('y', {})];
    const out = stripAdvGear(advs);
    expect(out.removed).toBe(0);
    expect(out.advs).toBe(advs);
  });
});
