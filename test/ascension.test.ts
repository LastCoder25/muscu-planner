import { describe, expect, it } from 'vitest';
import {
  ASCENSION_BLOCK_LABEL,
  addSeals,
  ascensionBlocker,
  ascensionCost,
  emptySeals,
  normalizeSeals,
  sealCount,
  sealsSummary,
  readyAscensions,
  readyAscensionIds,
} from '@/lib/ascension';
import {
  advAscendedRank,
  advAscensionCap,
  advNextAscension,
  advProgressOf,
  advXpToNext,
  ascendAdventurer,
  grantAdvXp,
  type Adventurer,
} from '@/lib/adventurers';
import { buildingUpgradeCost } from '@/lib/buildings';
import { CHARACTER_RANKS, rankStartLevel } from '@/lib/characterRank';
import { EXPE } from '@/lib/expedition';
import { RIFT, riftSeals } from '@/lib/rift';

const adv = (level: number, ascended?: number, xp = 0): Adventurer => ({
  id: 'a',
  name: 'A',
  seed: 1,
  path: ['guerrier'],
  level,
  xp,
  ...(ascended != null ? { ascended } : {}),
});

describe('le plafond d’ascension', () => {
  it('sans ascension, le rang ouvert est celui du niveau actuel — aucun champion ne régresse', () => {
    for (const L of [1, 10, 11, 20, 35, 99]) {
      const a = adv(L);
      expect(advAscensionCap(a)).toBeGreaterThanOrEqual(L);
    }
  });

  it('le plafond est le ★5 du rang ouvert (niveau 10, 20, …)', () => {
    expect(advAscensionCap(adv(3, 0))).toBe(10);
    expect(advAscensionCap(adv(15, 1))).toBe(20);
    expect(advAscensionCap(adv(15, 1))).toBe(rankStartLevel(2) - 1);
  });

  it('au dernier rang, plus rien à ouvrir : le plafond est celui du jeu', () => {
    const last = CHARACTER_RANKS.length - 1;
    expect(advNextAscension(adv(95, last))).toBeNull();
    expect(advAscensionCap(adv(95, last))).toBe(100);
  });

  it('l’XP BUTE sur le ★5 du rang, même si le Panthéon laisse monter plus haut', () => {
    const a = grantAdvXp(adv(9, 0), 1_000_000, 100);
    expect(a.level).toBe(10);
  });

  it('…et l’XP au-delà est CONSERVÉE, puis reversée à l’ascension', () => {
    const bloque = grantAdvXp(adv(9, 0), 5_000, 100);
    expect(bloque.level).toBe(10);
    expect(bloque.xp).toBe(5_000 - advXpToNext(9));
    const monte = ascendAdventurer(bloque, 100);
    expect(advAscendedRank(monte)).toBe(1);
    expect(monte.level).toBeGreaterThan(10);
  });

  it('le Panthéon reste le plafond le plus bas quand il l’est', () => {
    expect(grantAdvXp(adv(3, 5), 1_000_000, 7).level).toBe(7);
  });

  it('une ascension au sommet ne change rien', () => {
    const last = CHARACTER_RANKS.length - 1;
    const a = adv(95, last);
    expect(ascendAdventurer(a, 100)).toBe(a);
  });
});

describe('les sceaux', () => {
  it('se relisent défensivement', () => {
    const s = normalizeSeals({ champion: { 1: 3, 2: -1, x: 4, 99: 2 }, gear: { 0: 2.7 }, foo: 1 });
    expect(s).toEqual({ champion: { 1: 3 }, gear: { 0: 2 } });
    expect(normalizeSeals(null)).toEqual(emptySeals());
  });

  it('s’ajoutent et se retirent sans jamais passer sous zéro', () => {
    let s = addSeals(emptySeals(), 'champion', 2, 3);
    expect(sealCount(s, 'champion', 2)).toBe(3);
    s = addSeals(s, 'champion', 2, -5);
    expect(sealCount(s, 'champion', 2)).toBe(0);
    expect(s.champion[2]).toBeUndefined();
    expect(sealCount(s, 'gear', 2)).toBe(0);
  });

  it('les deux familles ne se mélangent pas', () => {
    const s = addSeals(emptySeals(), 'gear', 1, 4);
    expect(sealCount(s, 'champion', 1)).toBe(0);
  });
});

describe('le coût', () => {
  it('l’or est adossé au puits des bâtiments, au 1er niveau du rang visé', () => {
    for (const r of [1, 3, 6, 9])
      expect(ascensionCost(r).gold).toBe(Math.round(buildingUpgradeCost(rankStartLevel(r)) / 4));
  });

  it('les sceaux montent doucement avec le rang', () => {
    expect([1, 2, 3, 4, 5, 7, 8, 9].map((r) => ascensionCost(r).seals)).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3,
    ]);
  });
});

describe('ce qui bloque', () => {
  const plenty = () => addSeals(emptySeals(), 'champion', 1, 99);
  const ctx = { pantheonLevel: 100, seals: plenty(), gold: 1e12 };

  it('permis quand tout y est', () => {
    expect(ascensionBlocker(adv(10, 0), ctx)).toBeNull();
  });

  it('pas avant ★★★★★', () => {
    expect(ascensionBlocker(adv(9, 0), ctx)).toBe('notReady');
  });

  it('pas au-delà de ce que le Panthéon laisse atteindre', () => {
    expect(ascensionBlocker(adv(10, 0), { ...ctx, pantheonLevel: 10 })).toBe('pantheon');
    expect(ascensionBlocker(adv(10, 0), { ...ctx, pantheonLevel: 11 })).toBeNull();
  });

  it('les sceaux doivent être DU RANG visé', () => {
    const wrong = addSeals(emptySeals(), 'champion', 2, 99);
    expect(ascensionBlocker(adv(10, 0), { ...ctx, seals: wrong })).toBe('seals');
    const gear = addSeals(emptySeals(), 'gear', 1, 99);
    expect(ascensionBlocker(adv(10, 0), { ...ctx, seals: gear })).toBe('seals');
  });

  it('l’or', () => {
    expect(ascensionBlocker(adv(10, 0), { ...ctx, gold: 0 })).toBe('gold');
  });

  it('au sommet', () => {
    expect(ascensionBlocker(adv(95, CHARACTER_RANKS.length - 1), ctx)).toBe('top');
  });

  it('chaque refus a son libellé', () => {
    for (const k of ['top', 'notReady', 'pantheon', 'seals', 'gold'] as const)
      expect(ASCENSION_BLOCK_LABEL[k].length).toBeGreaterThan(5);
  });
});

describe('les sceaux d’une faille refermée', () => {
  const life = EXPE.lifespanMs.rift;
  const rift = (level: number) => ({ id: 'r', level, spawnedAt: 0 });

  it('rien si la faille n’est pas refermée', () => {
    expect(riftSeals(rift(25), life, false)).toBeNull();
  });

  it('au rang de la faille, un de plus quand elle est refermée TÔT (v0.1047, inversé)', () => {
    // Comme le mana : refermer vite paie, attendre ne paie plus.
    expect(riftSeals(rift(25), 0, true)).toEqual({ kind: 'champion', rank: 2, n: 2 });
    expect(riftSeals(rift(25), life * RIFT.secondSealAt, true)).toEqual({
      kind: 'champion',
      rank: 2,
      n: 1,
    });
  });
});

describe('🔱 les sceaux à la barre de ressources', () => {
  it('le total, et le détail par rang du plus bas au plus haut', () => {
    let s = addSeals(emptySeals(), 'champion', 2, 3);
    s = addSeals(s, 'champion', 0, 1);
    s = addSeals(s, 'gear', 1, 5);
    const c = sealsSummary(s, 'champion');
    expect(c.total).toBe(4);
    expect(c.detail).toBe(`${CHARACTER_RANKS[0]!.name} 1 · ${CHARACTER_RANKS[2]!.name} 3`);
    expect(sealsSummary(s, 'gear').total).toBe(5);
    expect(sealsSummary(emptySeals(), 'gear')).toEqual({ total: 0, detail: '' });
  });
});

describe('⬆️ on SAIT qu’un champion attend son ascension', () => {
  it('l’annonce de mission le dit quand il bute sur le ★5', () => {
    const avant = adv(9, 0);
    const apres = grantAdvXp(avant, 1_000_000, 100);
    const [e] = advProgressOf([avant], [apres]);
    expect(e!.ascendReady).toBe(true);
    const [f] = advProgressOf([adv(4, 0)], [grantAdvXp(adv(4, 0), advXpToNext(4), 100)]);
    expect(f!.ascendReady).toBe(false);
  });
  it('mais pas à chaque mission une fois bloqué (plus d’étoile à annoncer)', () => {
    const bloque = grantAdvXp(adv(9, 0), 1_000_000, 100);
    expect(advProgressOf([bloque], [grantAdvXp(bloque, 5000, 100)])).toEqual([]);
  });
  it('la Base compte les ascensions PAYABLES, avec les mêmes refus que les boutons', () => {
    const seals = addSeals(emptySeals(), 'champion', 1, 5);
    const ctx = { pantheonLevel: 100, seals, gold: 1e12 };
    expect(readyAscensions([adv(10, 0), adv(5, 0)], [], ctx)).toBe(1);
    expect(readyAscensions([adv(10, 0)], [], { ...ctx, gold: 0 })).toBe(0);
    expect(readyAscensions([adv(10, 0)], [], { ...ctx, seals: emptySeals() })).toBe(0);
  });

  it('le Panthéon montre QUI peut monter — les mêmes que la pastille compte', () => {
    const seals = addSeals(emptySeals(), 'champion', 1, 5);
    const ctx = { pantheonLevel: 100, seals, gold: 1e12 };
    const ready = { ...adv(10, 0), id: 'pret' };
    const early = { ...adv(5, 0), id: 'tot' };
    const ids = readyAscensionIds([ready, early], [], ctx);
    expect([...ids.champions]).toEqual(['pret']);
    expect(ids.gear.size).toBe(0);
    expect(ids.champions.size + ids.gear.size).toBe(readyAscensions([ready, early], [], ctx));
  });
});
