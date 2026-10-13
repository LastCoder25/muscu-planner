// ✨ Un champion au maximum de l'Éveil n'est plus tiré : un autre de la même lettre à la place
// (décision de l'utilisateur, 2026-10-13), au hasard parmi ceux qu'on n'a pas ou qu'on peut
// encore éveiller. Toute la lettre au maximum : la copie redevient de la mana.
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { CHAMPIONS, championsOf } from '@/data/champions';
import { AWAKEN } from '@/lib/adventurers';
import { emptyPity, grantChampion, maxedChampions, pullChampion, pullMany } from '@/lib/gacha';

/** Exemplaires d'un champion au maximum de l'Éveil (le 1er est le champion). */
const MAX_COPIES = AWAKEN.max + 1;
const atMax = (ids: string[]) => ids.map((championId) => ({ championId, copies: MAX_COPIES }));

describe('✨ jamais un champion déjà au maximum', () => {
  it('`maxedChampions` : seuls ceux dont une copie de plus déborderait', () => {
    const [a, b] = championsOf('A');
    const m = maxedChampions([
      { championId: a!.id, copies: MAX_COPIES },
      { championId: b!.id, copies: MAX_COPIES - 1 },
      { copies: 99 }, // un aventurier d'avant, sans champion
    ]);
    expect([...m]).toEqual([a!.id]);
  });

  it('sur 2 000 lots, aucun A tiré n’est un A déjà au maximum, et les autres A sortent tous', () => {
    const all = championsOf('A').map((c) => c.id);
    const maxed = all.slice(0, all.length - 3);
    const seen = new Set<string>();
    for (let s = 1; s <= 2000; s++) {
      const { results } = pullMany(mulberry32(s), emptyPity(), 10, atMax(maxed));
      for (const r of results) if (r.champion?.grade === 'A') seen.add(r.champion.id);
    }
    expect([...seen].some((id) => maxed.includes(id))).toBe(false);
    expect([...seen].sort()).toEqual(all.slice(all.length - 3).sort());
  });

  it('dans un lot, un champion qui atteint le maximum n’est plus tiré ensuite', () => {
    const only = championsOf('A').map((c) => c.id);
    const [last, fresh] = [only[0]!, only[1]!];
    // Tous les A au maximum sauf deux : `last` à un exemplaire du sien, `fresh` neuf.
    const roster = [
      ...atMax(only.slice(2)),
      { championId: last, copies: MAX_COPIES - 1 },
      { championId: fresh, copies: 1 },
    ];
    let both = 0;
    for (let s = 1; s <= 3000; s++) {
      const ids = pullMany(mulberry32(s), emptyPity(), 10, roster)
        .results.filter((r) => r.champion?.grade === 'A')
        .map((r) => r.champion!.id);
      expect(ids.filter((id) => id === last).length).toBeLessThanOrEqual(1);
      expect(ids.every((id) => id === last || id === fresh)).toBe(true);
      if (ids.filter((id) => id === fresh).length && ids.includes(last)) both++;
    }
    expect(both).toBeGreaterThan(0); // le cas éprouvé arrive vraiment
  });

  it('toute la lettre au maximum : on tire quand même dans la lettre, la copie rend de la mana', () => {
    // Toutes les lettres au maximum (S, A et X).
    const roster = atMax(CHAMPIONS.map((c) => c.id));
    let n = 0;
    for (let s = 1; s <= 300; s++) {
      for (const r of pullMany(mulberry32(s), emptyPity(), 10, roster).results) {
        if (!r.champion) continue;
        n++;
        expect(championsOf(r.grade as 'A').map((c) => c.id)).toContain(r.champion.id);
        const advs = roster.map((x, i) => ({
          id: 'x' + i,
          name: 'x',
          seed: 1,
          path: [],
          level: 1,
          xp: 0,
          ...x,
        }));
        expect(grantChampion(advs, r.champion, { id: 'n' }).manaBack).toBeGreaterThan(0);
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  it('personne au maximum : le tirage est exactement celui d’avant (un seul `rng()`)', () => {
    for (let s = 1; s <= 200; s++) {
      const a = pullMany(mulberry32(s), emptyPity(), 10, []);
      let p = emptyPity();
      const rng = mulberry32(s);
      for (const r of a.results) {
        const one = pullChampion(rng, p, new Set());
        p = one.pity;
        expect(one.champion?.id).toBe(r.champion?.id);
      }
    }
  });
});
