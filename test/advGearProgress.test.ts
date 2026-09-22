import { describe, expect, it } from 'vitest';
import {
  advGearLevelBand,
  advGearRankCap,
  ascendAdvGear,
  grantAdvGearXp,
  makeAdvGear,
  normalizeAdvGearState,
  trainWornGear,
  type AdvGear,
} from '@/lib/advGear';
import { advRarity, advXpToNext, grantAdvXp, type Adventurer } from '@/lib/adventurers';
import {
  addSeals,
  advGearAscensionBlocker,
  advGearAscensionCost,
  ascensionCost,
  lairGearSeals,
  emptySeals,
} from '@/lib/ascension';

const piece = (id: string, over: Partial<AdvGear> = {}): AdvGear => ({
  id,
  ...makeAdvGear({ lineage: 'guerrier', slot: 'weapon', rank: 'commun', grade: 'B' }),
  ...over,
});
const adv = (id: string, level: number, path: string[], gear?: Adventurer['gear']): Adventurer => ({
  id,
  name: id,
  seed: 1,
  path,
  level,
  xp: 0,
  ...(gear ? { gear } : {}),
});

describe('l’XP d’une pièce', () => {
  it('monte en chaîne sur la courbe des champions', () => {
    const g = grantAdvGearXp(piece('p'), advXpToNext(1) + advXpToNext(2), 50);
    expect(g.level).toBe(3);
    expect(g.xp).toBe(0);
  });

  it('bute sur le ★5 de son rang, et garde l’excédent', () => {
    const g = grantAdvGearXp(piece('p'), 1_000_000, 50);
    expect(g.level).toBe(advGearLevelBand('commun').max);
    expect(g.xp).toBeGreaterThan(0);
  });

  it('ne dépasse jamais son porteur', () => {
    expect(grantAdvGearXp(piece('p'), 1_000_000, 4).level).toBe(4);
  });

  it('ne recule jamais', () => {
    const g = piece('p', { level: 8 });
    expect(grantAdvGearXp(g, 0, 3).level).toBe(8);
  });

  it('rend la même pièce quand rien ne change', () => {
    const g = piece('p');
    expect(grantAdvGearXp(g, 0, 5)).toBe(g);
  });

  it('survit à la relecture du stock', () => {
    const g = piece('p', { level: 4, xp: 17 });
    expect(normalizeAdvGearState({ stock: [g] }).stock[0]).toMatchObject({ level: 4, xp: 17 });
  });
});

describe('les pièces portées apprennent avec leur champion', () => {
  const stock = [piece('p1'), piece('p2', { slot: 'armor' }), piece('libre')];
  const before = [adv('a', 1, ['guerrier'], { weapon: 'p1', armor: 'p2' })];

  it('100 % de ce que le champion a gagné, sur chaque pièce portée', () => {
    const gain = advXpToNext(1) + advXpToNext(2) + 5;
    const after = before.map((a) => grantAdvXp(a, gain, 100));
    const out = trainWornGear(before, after, stock);
    for (const id of ['p1', 'p2']) expect(out.find((g) => g.id === id)!.level).toBe(3);
    expect(out.find((g) => g.id === 'libre')).toBe(stock[2]);
  });

  it('rien ne bouge sans gain — même tableau', () => {
    expect(trainWornGear(before, before, stock)).toBe(stock);
  });

  it('un aventurier nouveau dans le vivier ne compte pas un gain fictif', () => {
    const after = [
      adv('a', 1, ['guerrier'], { weapon: 'p1' }),
      adv('b', 30, ['guerrier'], { armor: 'p2' }),
    ];
    expect(trainWornGear(before, after, stock)).toBe(stock);
  });
});

describe('l’ascension d’une pièce', () => {
  it('ouvre le rang suivant à ★1, stats du modèle, XP reversée', () => {
    const g = piece('p', { level: 10, xp: advXpToNext(11) + 3, locked: true });
    const up = ascendAdvGear(g, 50);
    expect(up.rarity).toBe('inhabituel');
    expect(up.level).toBe(12);
    expect(up.xp).toBe(3);
    expect(up.locked).toBe(true);
    expect(up.id).toBe('p');
    expect(up.effect.value).toBe(
      makeAdvGear({ lineage: 'guerrier', slot: 'weapon', rank: 'inhabituel', grade: 'B' }).effect
        .value,
    );
  });

  it('coûte le quart de l’or d’un champion et la moitié de ses sceaux', () => {
    for (const r of [1, 4, 9]) {
      expect(advGearAscensionCost(r).gold).toBe(Math.round(ascensionCost(r).gold / 4));
      expect(advGearAscensionCost(r).seals).toBe(Math.ceil(ascensionCost(r).seals / 2));
    }
  });

  const ready = piece('p', { level: 10 });
  const seals = addSeals(emptySeals(), 'gear', 1, 9);
  const ctx = { rankCap: 'inhabituel' as const, seals, gold: 1e12 };

  it('permise à ★5 quand tout y est', () => {
    expect(advGearAscensionBlocker(ready, ctx)).toBeNull();
  });
  it('pas avant ★5', () => {
    expect(advGearAscensionBlocker(piece('p', { level: 9 }), ctx)).toBe('notReady');
  });
  it('pas au-delà de ce qu’un champion sait porter', () => {
    expect(advGearAscensionBlocker(ready, { ...ctx, rankCap: 'commun' })).toBe('wearer');
    expect(advGearAscensionBlocker(ready, { ...ctx, rankCap: null })).toBe('wearer');
  });
  it('les sceaux d’OBJET du rang visé, pas ceux des champions', () => {
    const champ = addSeals(emptySeals(), 'champion', 1, 9);
    expect(advGearAscensionBlocker(ready, { ...ctx, seals: champ })).toBe('seals');
  });
  it('l’or', () => {
    expect(advGearAscensionBlocker(ready, { ...ctx, gold: 0 })).toBe('gold');
  });
  it('au sommet', () => {
    expect(advGearAscensionBlocker(piece('p', { rarity: 'primordial', level: 100 }), ctx)).toBe(
      'top',
    );
  });

  it('le plafond suit le PORTEUR s’il y en a un, sinon le meilleur de la lignée', () => {
    const g = piece('p');
    const porteur = adv('a', 5, ['guerrier'], { weapon: 'p' });
    const avance = adv('b', 30, ['guerrier', 'epeiste']);
    expect(advGearRankCap(g, [porteur, avance], [g])).toBe(advRarity(porteur));
    expect(advGearRankCap(g, [avance], [g])).toBe(advRarity(avance));
    expect(advGearRankCap(g, [], [g])).toBeNull();
  });
});

describe('les sceaux d’objet des repaires (v0.1047 — plus des boss de palier)', () => {
  it('un par repaire pris', () => {
    expect(lairGearSeals(25, 60).n).toBe(1);
  });
  it('au rang du repaire, plafonné par celui du joueur', () => {
    expect(lairGearSeals(25, 60)).toEqual({ kind: 'gear', rank: 2, n: 1 });
    expect(lairGearSeals(85, 30).rank).toBe(2);
  });
});
