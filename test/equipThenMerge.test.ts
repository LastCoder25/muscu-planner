import { describe, expect, it } from 'vitest';
import {
  ADV_GEAR_AWAKEN,
  advGearAwakenPlan,
  gearGaps,
  makeAdvGear,
  rollGachaPiece,
  wornGear,
  type AdvGear,
  type AdvGearSlot,
  type Lineage,
} from '@/lib/advGear';
import { equipThenMerge } from '@/lib/raid';
import { mulberry32 } from '@/lib/combat';
import type { Adventurer } from '@/lib/adventurers';

const champ = (id: string, lineage: string, gear?: Adventurer['gear']): Adventurer => ({
  id,
  name: id,
  seed: 1,
  path: [lineage],
  level: 10,
  xp: 0,
  ...(gear ? { gear } : {}),
});
const piece = (
  id: string,
  lineage: Lineage,
  slot: AdvGearSlot,
  over: Partial<AdvGear> = {},
): AdvGear => ({
  id,
  ...makeAdvGear({ lineage, slot, rank: 'commun', grade: 'B' }),
  ...over,
});

describe('🧩 les trous du vivier', () => {
  it('un emplacement vide qu’aucune pièce libre ne remplit est un trou', () => {
    const gaps = gearGaps([champ('a', 'archer')], []);
    expect(gaps).toHaveLength(4);
    expect(new Set(gaps.map((g) => g.lineage))).toEqual(new Set(['archer']));
  });

  it('une pièce LIBRE de la bonne lignée bouche le trou', () => {
    const gaps = gearGaps([champ('a', 'archer')], [piece('p', 'archer', 'weapon')]);
    expect(gaps.some((g) => g.slot === 'weapon')).toBe(false);
    expect(gaps).toHaveLength(3);
  });

  it('une pièce PORTÉE ne bouche pas le trou d’un autre champion', () => {
    const advs = [champ('a', 'archer', { weapon: 'p' }), champ('b', 'archer')];
    const gaps = gearGaps(advs, [piece('p', 'archer', 'weapon')]);
    expect(gaps.filter((g) => g.slot === 'weapon')).toHaveLength(1);
  });

  it('une pièce d’une AUTRE lignée ne compte pas', () => {
    const gaps = gearGaps([champ('a', 'archer')], [piece('p', 'guerrier', 'weapon')]);
    expect(gaps.some((g) => g.slot === 'weapon')).toBe(true);
  });

  it('les pièces du même lot (pending) bouchent aussi', () => {
    const pend = [makeAdvGear({ lineage: 'archer', slot: 'weapon', rank: 'commun', grade: 'B' })];
    expect(gearGaps([champ('a', 'archer')], [], pend)).toHaveLength(3);
  });
});

describe('🎰 le tirage comble les trous (forcé)', () => {
  it('tant qu’il reste un trou, la pièce y va — jamais vers une lignée déjà servie', () => {
    // Un guerrier équipé de partout, un archer nu : toutes les pièces sont d'archer.
    const stock = (['weapon', 'armor', 'accessory', 'relic'] as const).map((s) =>
      piece(`g-${s}`, 'guerrier', s),
    );
    const advs = [
      champ('g', 'guerrier', {
        weapon: 'g-weapon',
        armor: 'g-armor',
        accessory: 'g-accessory',
        relic: 'g-relic',
      }),
      champ('a', 'archer'),
    ];
    for (let s = 1; s <= 60; s++) {
      const g = rollGachaPiece(mulberry32(s), advs, { grade: 'B', stock });
      expect(g.lineage).toBe('archer');
    }
  });

  it('un lot de 4 remplit les 4 trous, sans en remplir un deux fois', () => {
    const advs = [champ('a', 'archer')];
    const pending: AdvGear[] = [];
    for (let i = 0; i < 4; i++)
      pending.push({
        id: `n${i}`,
        ...rollGachaPiece(mulberry32(i + 1), advs, { grade: 'B', stock: [], pending }),
      });
    expect(new Set(pending.map((p) => p.slot)).size).toBe(4);
  });

  it('plus aucun trou : le tirage redevient libre (des doublons pour l’éveil)', () => {
    const slots = ['weapon', 'armor', 'accessory', 'relic'] as const;
    const stock = slots.map((s) => piece(`a-${s}`, 'archer', s));
    const advs = [
      champ('a', 'archer', {
        weapon: 'a-weapon',
        armor: 'a-armor',
        accessory: 'a-accessory',
        relic: 'a-relic',
      }),
    ];
    expect(gearGaps(advs, stock)).toHaveLength(0);
    const seen = new Set<string>();
    for (let s = 1; s <= 60; s++)
      seen.add(rollGachaPiece(mulberry32(s), advs, { grade: 'B', stock }).slot);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('🧩 réserve : équiper passe avant éveiller', () => {
  it('une copie libre est gardée pour un champion dont l’emplacement est vide', () => {
    const stock = [
      piece('porte', 'archer', 'weapon', { level: 9 }),
      piece('libre', 'archer', 'weapon'),
    ];
    const advs = [champ('a', 'archer', { weapon: 'porte' }), champ('b', 'archer')];
    expect(advGearAwakenPlan(stock[0]!, stock, advs)).toBeNull();
    // Sans le champion nu, elle se fond.
    expect(advGearAwakenPlan(stock[0]!, stock, [advs[0]!])?.consume.id).toBe('libre');
  });

  it('pièce gardée libre : elle sert elle-même la place, le reste peut se fondre', () => {
    const max = ADV_GEAR_AWAKEN.max;
    const stock = [
      piece('top', 'archer', 'weapon', { level: 9, awaken: max }),
      piece('l1', 'archer', 'weapon', { level: 3 }),
      piece('l2', 'archer', 'weapon', { level: 1 }),
    ];
    const advs = [champ('a', 'archer', { weapon: 'top' }), champ('b', 'archer')];
    const plan = advGearAwakenPlan(stock[0]!, stock, advs)!;
    expect(plan.keep.id).toBe('l1');
    expect(plan.consume.id).toBe('l2');
  });
});

describe('✨ tout fusionner = équiper puis fondre', () => {
  it('un champion nu reçoit une pièce AVANT que les doublons fondent', () => {
    const stock = [
      piece('p1', 'archer', 'weapon', { level: 9 }),
      piece('p2', 'archer', 'weapon', { level: 1 }),
      piece('p3', 'archer', 'weapon', { level: 1 }),
    ];
    const advs = [champ('a', 'archer', { weapon: 'p1' }), champ('b', 'archer')];
    const out = equipThenMerge(advs, { advGear: stock });
    const worn = wornGear(out.advs, out.stock);
    expect(worn.get('b')?.some((x) => x.slot === 'weapon')).toBe(true);
    expect(worn.get('a')?.some((x) => x.slot === 'weapon')).toBe(true);
    // Il ne restait qu'UN doublon libre : il a fondu dans une pièce portée.
    expect(out.merged).toBe(1);
    expect(out.stock).toHaveLength(2);
    const ids = new Set(out.stock.map((x) => x.id));
    for (const a of out.advs)
      for (const id of Object.values(a.gear ?? {})) if (id) expect(ids.has(id)).toBe(true);
  });

  it('la pièce éveillée est la PLUS AVANCÉE des portées', () => {
    const stock = [
      piece('fort', 'archer', 'weapon', { level: 9 }),
      piece('faible', 'archer', 'weapon', { level: 4 }),
      piece('d', 'archer', 'weapon', { level: 1 }),
    ];
    const advs = [champ('a', 'archer'), champ('b', 'archer')];
    const out = equipThenMerge(advs, { advGear: stock });
    expect(out.stock.find((x) => x.id === 'fort')?.awaken).toBe(1);
    expect(out.stock.find((x) => x.id === 'faible')?.awaken ?? 0).toBe(0);
  });
});
