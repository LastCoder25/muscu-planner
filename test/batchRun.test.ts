import { describe, expect, it } from 'vitest';
import {
  BATCH_CAP,
  addToBatch,
  batchChoices,
  batchMax,
  dropsByRarity,
  newBatch,
} from '../src/lib/batchRun';
import type { Item } from '../src/lib/items';

const item = (rarity: Item['rarity'], id = rarity): Item => ({ id, rarity }) as Item;

describe('🔁 batchRun', () => {
  it('batchMax : le stock divisé par le coût, plafonné, jamais négatif', () => {
    expect(batchMax(250, 100)).toBe(2);
    expect(batchMax(99, 100)).toBe(0);
    expect(batchMax(1e6, 10)).toBe(BATCH_CAP);
    expect(batchMax(50, 0)).toBe(0);
  });

  it('batchChoices : rien si un seul lancer est payable', () => {
    expect(batchChoices(100, 100)).toEqual([]);
    expect(batchChoices(10, 100)).toEqual([]);
  });

  it('batchChoices : ×5 et ×10 seulement s’ils sont payables, puis Max', () => {
    expect(batchChoices(300, 100)).toEqual([{ n: 3, max: true }]);
    expect(batchChoices(700, 100)).toEqual([
      { n: 5, max: false },
      { n: 7, max: true },
    ]);
    expect(batchChoices(1500, 100)).toEqual([
      { n: 5, max: false },
      { n: 10, max: false },
      { n: 15, max: true },
    ]);
  });

  it('batchChoices : Max n’est pas dupliqué quand il tombe sur un palier', () => {
    expect(batchChoices(1000, 100)).toEqual([
      { n: 5, max: false },
      { n: 10, max: true },
    ]);
  });

  it('addToBatch : cumule réussites, échecs, or, pierres, talents et butin', () => {
    const b = newBatch('Crypte', 'dungeon', 3);
    addToBatch(b, { cleared: true, gold: 10, drops: [item('rare')], summonStones: 2 });
    addToBatch(b, { cleared: false, gold: 4, drops: [], talentDrops: [{}] });
    addToBatch(b, { cleared: true, gold: 6, drops: [item('commun', 'x')], firstClear: true });
    expect(b).toMatchObject({
      runs: 3,
      cleared: 2,
      failed: 1,
      gold: 20,
      summonStones: 2,
      talents: 1,
      firstClear: true,
    });
    expect(b.drops).toHaveLength(2);
  });

  it('dropsByRarity : du plus rare au plus commun', () => {
    const order = ['commun', 'rare', 'epique'];
    const g = dropsByRarity([item('commun', 'a'), item('epique', 'b'), item('commun', 'c')], order);
    expect(g.map((x) => [x.rarity, x.items.length])).toEqual([
      ['epique', 1],
      ['commun', 2],
    ]);
  });
});
