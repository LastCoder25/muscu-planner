import { describe, expect, it } from 'vitest';
import {
  advRank,
  advRankProgress,
  advTotalXp,
  advXpTracks,
  advXpToNext,
  type Adventurer,
} from '@/lib/adventurers';
import { CHAMPIONS } from '@/data/champions';

const champ = CHAMPIONS.find((c) => c.grade === 'S')!;
const cha = (level: number, xp = 0, id = 'c'): Adventurer => ({
  id,
  name: champ.name,
  seed: 1,
  path: [],
  championId: champ.id,
  level,
  xp,
});

describe('advXpTracks — la barre d’étoile au retour de mission', () => {
  it('un gain SANS étoile se voit quand même : un segment, de l’avant vers l’après', () => {
    // ⚠️ C'est le cas le plus fréquent, et c'est celui que l'annonce d'étoile taisait.
    const [t] = advXpTracks([cha(3, 0)], [cha(3, 50)]);
    expect(t!.segments).toHaveLength(1);
    const s = t!.segments[0]!;
    expect(s.starUp).toBe(false);
    expect(s.from).toBeCloseTo(advRankProgress(cha(3, 0)));
    expect(s.to).toBeCloseTo(advRankProgress(cha(3, 50)));
    expect(s.to).toBeGreaterThan(s.from);
  });

  it('une étoile gagnée : la barre va au BOUT, puis repart de zéro dans l’étoile suivante', () => {
    const before = cha(2, 10);
    const after = cha(4, 30);
    const [t] = advXpTracks([before], [after]);
    const segs = t!.segments;
    expect(segs.length).toBe(advRank(after).tier - advRank(before).tier + 1);
    expect(segs[0]!.from).toBeCloseTo(advRankProgress(before));
    expect(segs[0]!.to).toBe(1);
    expect(segs[0]!.starUp).toBe(true);
    expect(segs.at(-1)!.from).toBe(0);
    expect(segs.at(-1)!.to).toBeCloseTo(advRankProgress(after));
    expect(segs.at(-1)!.starUp).toBe(false);
    expect(segs.at(-1)!.star).toBe(advRank(after).star);
  });

  it('plusieurs étoiles d’un coup : un segment plein par étoile traversée', () => {
    const before = cha(1, 0);
    const after = cha(7, 0);
    const segs = advXpTracks([before], [after])[0]!.segments;
    expect(segs.length).toBe(advRank(after).tier - advRank(before).tier + 1);
    for (const s of segs.slice(1, -1)) expect(s).toMatchObject({ from: 0, to: 1, starUp: true });
  });

  it('⚠️ un RANG gagné est signalé sur l’étoile qui le franchit, pas sur une autre', () => {
    // ★5 du Bronze (niveau 10) → ★1 de l'Argent (niveau 11) : l'étoile retombe, le cran monte.
    const before = cha(10, 0);
    const after = cha(11, 5);
    const segs = advXpTracks([before], [after])[0]!.segments;
    expect(segs).toHaveLength(2);
    expect(segs[0]!.rankUp).toBe(true);
    expect(segs[0]!.rankName).toBe(advRank(before).name);
    expect(segs[1]!.rankName).toBe(advRank(after).name);
    expect(segs[1]!.star).toBe(1);
    // Une étoile de routine n'est jamais un changement de rang.
    const routine = advXpTracks([cha(2, 0)], [cha(4, 0)])[0]!.segments;
    expect(routine.some((s) => s.rankUp)).toBe(false);
  });

  it('l’XP annoncée est la vraie différence d’XP totale, niveaux compris', () => {
    const before = cha(3, 20);
    const after = cha(5, 7);
    const [t] = advXpTracks([before], [after]);
    expect(t!.xp).toBe(advTotalXp(after) - advTotalXp(before));
    expect(t!.xp).toBe(advXpToNext(3) - 20 + advXpToNext(4) + 7);
  });

  it('rien pour qui n’a rien gagné, ni pour qui n’existait pas avant', () => {
    expect(advXpTracks([cha(3, 10)], [cha(3, 10)])).toEqual([]);
    expect(advXpTracks([], [cha(3, 10)])).toEqual([]);
  });

  it('la barre ne recule jamais', () => {
    for (let l = 1; l < 30; l++)
      for (const xp of [0, 20, 60]) {
        const segs = advXpTracks([cha(l, xp)], [cha(l + 1, xp)])[0]!.segments;
        for (const s of segs) expect(s.to).toBeGreaterThanOrEqual(s.from);
      }
  });
});
