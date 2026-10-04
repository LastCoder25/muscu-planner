import { describe, expect, it } from 'vitest';
import {
  ASCENSION_BLOCK_LABEL,
  addSeals,
  type Seals,
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
  advRank,
  advRankProgress,
  advRarity,
  advStats,
  advXpToNext,
  ascendAdventurer,
  grantAdvXp,
  type Adventurer,
} from '@/lib/adventurers';
import { buildingUpgradeCost } from '@/lib/buildings';
import { CHARACTER_RANKS, rankStartLevel } from '@/lib/characterRank';
import { ruinsSealKind, ruinsSeals } from '@/lib/expedition';
import { CHAMPIONS } from '@/data/champions';
import { RANK_ORDER } from '@/lib/items';

const adv = (level: number, ascended?: number, xp = 0): Adventurer => ({
  id: 'a',
  name: 'A',
  seed: 1,
  path: ['guerrier'],
  level,
  xp,
  ...(ascended != null ? { ascended } : {}),
});

/** Au plafond ET ★5 plein : l’XP du niveau plafond est terminée. */
const pret = (): Adventurer => adv(10, 0, advXpToNext(10));

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
    expect(s).toEqual({ champion: { 0: 3 }, gear: { 0: 2 } });
    // 🔱⚜️ les sceaux d’avant (par rang) s’ADDITIONNENT en une seule réserve, dans les deux
    // familles (champion : v1.50) — rien n’est perdu
    expect(normalizeSeals({ gear: { 1: 2, 3: 4 } }).gear).toEqual({ 0: 6 });
    expect(normalizeSeals({ champion: { 0: 13, 1: 16, 3: 8 } }).champion).toEqual({ 0: 37 });
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

  it('un stock d’avant, encore rangé par rang, se lit en entier (v1.50)', () => {
    const raw = { champion: { 0: 13, 1: 16, 3: 8 }, gear: {} } as Seals;
    expect(sealCount(raw, 'champion', 2)).toBe(37);
    expect(addSeals(raw, 'champion', 2, -8).champion).toEqual({ 0: 29 });
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

  it('les sceaux : 4 × le rang visé (Argent 4, Or 8… Tout-puissant 36)', () => {
    expect([1, 2, 3, 4, 5, 7, 8, 9].map((r) => ascensionCost(r).seals)).toEqual([
      4, 8, 12, 16, 20, 28, 32, 36,
    ]);
  });
});

describe('ce qui bloque', () => {
  const plenty = () => addSeals(emptySeals(), 'champion', 1, 99);
  const ctx = { pantheonLevel: 100, seals: plenty(), gold: 1e12 };

  it('permis quand tout y est', () => {
    expect(ascensionBlocker(pret(), ctx)).toBeNull();
  });

  it('pas avant ★★★★★', () => {
    expect(ascensionBlocker(adv(9, 0), ctx)).toBe('notReady');
  });

  it('au plafond mais ★5 à moitié : pas encore (signalé : Brontès, niveau 20 avec 19 XP)', () => {
    expect(ascensionBlocker(adv(10, 0), ctx)).toBe('notReady');
    expect(ascensionBlocker(adv(10, 0, advXpToNext(10) - 1), ctx)).toBe('notReady');
  });

  it('pas au-delà de ce que le Panthéon laisse atteindre', () => {
    expect(ascensionBlocker(pret(), { ...ctx, pantheonLevel: 10 })).toBe('pantheon');
    expect(ascensionBlocker(pret(), { ...ctx, pantheonLevel: 11 })).toBeNull();
  });

  it('les sceaux de champion n’ont pas de rang, mais il en faut ASSEZ', () => {
    // un sceau tombé avec un autre rang paie quand même (v1.50)
    const other = addSeals(emptySeals(), 'champion', 2, 99);
    expect(ascensionBlocker(pret(), { ...ctx, seals: other })).toBeNull();
    const need = ascensionCost(1).seals;
    const short = addSeals(emptySeals(), 'champion', 0, need - 1);
    expect(ascensionBlocker(pret(), { ...ctx, seals: short })).toBe('seals');
    const just = addSeals(emptySeals(), 'champion', 0, need);
    expect(ascensionBlocker(pret(), { ...ctx, seals: just })).toBeNull();
    // les deux familles restent distinctes
    const gear = addSeals(emptySeals(), 'gear', 1, 99);
    expect(ascensionBlocker(pret(), { ...ctx, seals: gear })).toBe('seals');
  });

  it('l’or', () => {
    expect(ascensionBlocker(pret(), { ...ctx, gold: 0 })).toBe('gold');
  });

  it('au sommet', () => {
    expect(ascensionBlocker(adv(95, CHARACTER_RANKS.length - 1), ctx)).toBe('top');
  });

  it('chaque refus a son libellé', () => {
    for (const k of ['top', 'notReady', 'pantheon', 'seals', 'gold'] as const)
      expect(ASCENSION_BLOCK_LABEL[k].length).toBeGreaterThan(5);
  });
});

describe('les sceaux de champion des ruines anciennes (2026-09-27 : plus des failles)', () => {
  it('au rang du LIEU, jamais du joueur', () => {
    const id = Array.from({ length: 40 }, (_, i) => `r${i}`).find(
      (i) => ruinsSealKind({ id: i }) === 'champion',
    )!;
    expect(ruinsSeals({ id, level: 25 }, 90)).toMatchObject({ kind: 'champion', rank: 2 });
  });
});

describe('🔱 les sceaux à la barre de ressources', () => {
  it('le total, sans rang, par famille', () => {
    let s = addSeals(emptySeals(), 'champion', 2, 3);
    s = addSeals(s, 'champion', 0, 1);
    s = addSeals(s, 'gear', 1, 5);
    expect(sealsSummary(s, 'champion')).toEqual({ total: 4 });
    expect(sealsSummary(s, 'gear')).toEqual({ total: 5 });
    expect(sealsSummary(emptySeals(), 'gear')).toEqual({ total: 0 });
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
    expect(readyAscensions([pret(), adv(5, 0)], [], ctx)).toBe(1);
    expect(readyAscensions([pret()], [], { ...ctx, gold: 0 })).toBe(0);
    expect(readyAscensions([pret()], [], { ...ctx, seals: emptySeals() })).toBe(0);
  });

  it('le Panthéon montre QUI peut monter — les mêmes que la pastille compte', () => {
    const seals = addSeals(emptySeals(), 'champion', 1, 5);
    const ctx = { pantheonLevel: 100, seals, gold: 1e12 };
    const ready = { ...pret(), id: 'pret' };
    const early = { ...adv(5, 0), id: 'tot' };
    const ids = readyAscensionIds([ready, early], [], ctx);
    expect([...ids.champions]).toEqual(['pret']);
    expect(ids.gear.size).toBe(0);
    expect(ids.champions.size + ids.gear.size).toBe(readyAscensions([ready, early], [], ctx));
  });
});

describe('la fiche se met à jour à l’ascension (signalé : « rang et stats inchangés »)', () => {
  const champ = (level: number, ascended?: number): Adventurer => ({
    ...adv(level, ascended),
    championId: CHAMPIONS[0]!.id,
  });

  it('sans XP en réserve, le rang affiché passe au ★1 du rang ouvert', () => {
    const bloque = champ(10, 0);
    expect(advRank(bloque).rankIndex).toBe(0);
    expect(advRank(bloque).star).toBe(5);
    const monte = ascendAdventurer(bloque, 100);
    expect(monte.level).toBe(10); // aucune réserve : le niveau ne bouge pas…
    expect(advRank(monte).rankIndex).toBe(1); // …mais le rang affiché, si
    expect(advRank(monte).star).toBe(1);
    expect(advRank(monte).tier).toBeGreaterThan(advRank(bloque).tier);
  });

  it('…et il PORTE aussitôt le rang ouvert, ce qui débloque l’ascension de son équipement', () => {
    const bloque = champ(10, 0);
    expect(advRarity(bloque)).toBe(RANK_ORDER[0]);
    const monte = ascendAdventurer(bloque, 100);
    expect(monte.level).toBe(10);
    expect(advRarity(monte)).toBe(RANK_ORDER[1]);
    // Le niveau prime quand il est plus haut (un ancien `ascended` ne rétrograde rien).
    expect(advRarity(champ(25, 0))).toBe(RANK_ORDER[2]);
  });

  it('…et les stats montent aussitôt (+5 %)', () => {
    const bloque = champ(10, 0);
    const monte = ascendAdventurer(bloque, 100);
    const b = advStats(bloque);
    const a = advStats(monte);
    expect(a.puissance + a.endurance + a.agilite).toBeGreaterThan(
      b.puissance + b.endurance + b.agilite,
    );
  });

  it('la barre repart de zéro, puis ne recule pas au niveau suivant', () => {
    const monte = ascendAdventurer(champ(10, 0), 100);
    expect(advRankProgress(monte)).toBe(0);
    expect(advRankProgress({ ...monte, level: 11 })).toBeGreaterThanOrEqual(0);
    expect(advRank({ ...monte, level: 11 }).tier).toBe(advRank(monte).tier);
  });

  it('un aventurier sans ascension garde le rang de son niveau', () => {
    expect(advRank(champ(10)).star).toBe(5);
    expect(advRank(champ(15)).rankIndex).toBe(1);
  });
});
