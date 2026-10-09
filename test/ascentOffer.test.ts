import { describe, expect, it } from 'vitest';
import {
  ASCENSION_BLOCK_LABEL,
  GEAR_ASCENSION_BLOCK_LABEL,
  addSeals,
  advGearAscensionBlocker,
  advGearAscensionCost,
  ascensionBlocker,
  ascensionCost,
  championAscentOffer,
  emptySeals,
  gearAscensionPossible,
  gearAscentOffer,
  readyAscensionIds,
} from '@/lib/ascension';
import { advGearRankCap, makeAdvGear, type AdvGear } from '@/lib/advGear';
import { advXpToNext, type Adventurer } from '@/lib/adventurers';

// ⬆️ L'offre d'ascension proposée dans l'animation de progression (2026-09-28) : elle doit
// dire EXACTEMENT ce que le store appliquerait — même refus, même coût.

const adv = (level: number, path = ['guerrier'], gear?: Adventurer['gear']): Adventurer => ({
  id: 'a',
  name: 'A',
  seed: 1,
  path,
  level,
  xp: 0,
  ...(gear ? { gear } : {}),
});
/** Au plafond ET ★5 plein. */
const pret = (): Adventurer => ({ ...adv(10), xp: advXpToNext(10) });
const piece = (level: number): AdvGear => ({
  id: 'p',
  ...makeAdvGear({ lineage: 'guerrier', slot: 'weapon', rank: 'commun', grade: 'B' }),
  level,
});

describe('⬆️ l’offre d’ascension d’un champion', () => {
  const seals = addSeals(emptySeals(), 'champion', 1, 5);
  const ctx = { pantheonLevel: 100, seals, gold: 1e12 };

  it('rien avant ★★★★★ : pas de bouton à une échéance lointaine', () => {
    expect(championAscentOffer(adv(9), ctx)).toBeNull();
    expect(championAscentOffer(adv(10), ctx)).toBeNull(); // plafond atteint, ★5 à moitié
  });

  it('à ★★★★★ : le rang visé, le coût du store, les sceaux possédés', () => {
    const o = championAscentOffer(pret(), ctx)!;
    expect(o.next).toBe(1);
    expect(o.cost).toEqual(ascensionCost(1));
    expect(o.have).toBe(5);
    expect(o.block).toBeNull();
    expect(o.why).toBeNull();
  });

  it('le refus est celui du store, avec son libellé', () => {
    for (const c of [
      { ...ctx, gold: 0 },
      { ...ctx, seals: emptySeals() },
      { ...ctx, pantheonLevel: 10 },
    ]) {
      const o = championAscentOffer(pret(), c)!;
      const b = ascensionBlocker(pret(), c)!;
      expect(o.block).toBe(b);
      expect(o.why).toBe(ASCENSION_BLOCK_LABEL[b]);
    }
  });
});

describe('⬆️ l’offre d’ascension d’une pièce', () => {
  const seals = addSeals(emptySeals(), 'gear', 0, 9);
  const base = { seals, gold: 1e12 };

  it('rien avant ★5', () => {
    expect(gearAscentOffer(piece(9), { ...base, advs: [], stock: [piece(9)] })).toBeNull();
  });

  it('portée par un champion qui sait porter le rang suivant : payable', () => {
    const g = piece(10);
    const advs = [adv(20, ['guerrier', 'epeiste'], { weapon: 'p' })];
    const o = gearAscentOffer(g, { ...base, advs, stock: [g] })!;
    expect(o.cost).toEqual(advGearAscensionCost(o.next));
    expect(o.have).toBe(9);
    expect(o.block).toBe(
      advGearAscensionBlocker(g, { ...base, rankCap: advGearRankCap(g, advs, [g]) }),
    );
    expect(o.block).toBeNull();
  });

  it('personne ne peut porter le rang suivant : refusé, et DIT pourquoi', () => {
    const g = piece(10);
    const o = gearAscentOffer(g, { ...base, advs: [adv(10)], stock: [g] })!;
    expect(o.block).toBe('wearer');
    expect(o.why).toBe(GEAR_ASCENSION_BLOCK_LABEL.wearer);
  });
});

describe('⬆️ « peut faire l’ascension » ne regarde pas les ressources (2026-10-09)', () => {
  it('un champion à ★5 s’annonce sans or ni sceaux', () => {
    const r = readyAscensionIds([pret()], [], { pantheonLevel: 100 });
    expect(r.champions.has('a')).toBe(true);
  });
  it('mais pas si le Panthéon ne le laisse pas monter, ni avant ★5', () => {
    expect(readyAscensionIds([pret()], [], { pantheonLevel: 10 }).champions.size).toBe(0);
    expect(readyAscensionIds([adv(9)], [], { pantheonLevel: 100 }).champions.size).toBe(0);
  });
  it('une pièce à ★5 portée par un champion qui sait porter le rang suivant : oui, sans ressources', () => {
    const g = piece(10);
    const advs = [adv(20, ['guerrier', 'epeiste'], { weapon: 'p' })];
    expect(gearAscensionPossible(g, advs, [g])).toBe(true);
    expect(readyAscensionIds(advs, [g], { pantheonLevel: 100 }).gear.has('p')).toBe(true);
  });
  it('une pièce que son porteur ne saurait plus porter : non', () => {
    const g = piece(10);
    const advs = [adv(10, ['guerrier'], { weapon: 'p' })];
    expect(gearAscensionPossible(g, advs, [g])).toBe(false);
    expect(readyAscensionIds(advs, [g], { pantheonLevel: 100 }).gear.size).toBe(0);
  });
  it('une pièce pas encore à ★5 : non', () => {
    const g = piece(9);
    const advs = [adv(20, ['guerrier', 'epeiste'], { weapon: 'p' })];
    expect(gearAscensionPossible(g, advs, [g])).toBe(false);
  });
});
