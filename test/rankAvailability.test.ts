import { describe, expect, it } from 'vitest';
import { advRank, rankAvailability, type Adventurer } from '@/lib/adventurers';
import { CHAMPIONS } from '@/data/champions';

const champ = CHAMPIONS.find((c) => c.grade === 'S')!;
const cha = (level: number, id: string, ascended?: number): Adventurer => ({
  id,
  name: champ.name,
  seed: 1,
  path: [],
  championId: champ.id,
  level,
  xp: 0,
  ...(ascended ? { ascended } : {}),
});
const free = (ids: string[]) => (a: Adventurer) => ids.includes(a.id);

describe('rankAvailability — les effectifs de la carte, rang par rang', () => {
  it('libres sur possédés, sous le rang qu’affiche la fiche (advRank)', () => {
    const advs = [cha(1, 'a'), cha(3, 'b'), cha(1, 'c')];
    const bronze = advRank(advs[0]!);
    expect(rankAvailability(advs, free(['a', 'c']))).toEqual([
      { rankIndex: bronze.rankIndex, name: bronze.name, color: bronze.color, free: 2, total: 3 },
    ]);
  });

  it('un rang sans personne de libre reste affiché (0 sur N)', () => {
    const [row] = rankAvailability([cha(1, 'a')], free([]));
    expect(row).toMatchObject({ free: 0, total: 1 });
  });

  it('seuls les rangs possédés, du plus haut au plus bas, et personne n’est perdu', () => {
    const advs = [cha(1, 'a'), cha(10, 'b', 1), cha(1, 'c')];
    const rows = rankAvailability(advs, free(['b']));
    const idx = advs.map((a) => advRank(a).rankIndex);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.rankIndex)).toEqual([...new Set(idx)].sort((x, y) => y - x));
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(advs.length);
    expect(rows[0]).toMatchObject({ free: 1, total: 1 });
    expect(rows[1]).toMatchObject({ free: 0, total: 2 });
  });

  it('un vivier vide ne donne aucune pastille', () => {
    expect(rankAvailability([], () => true)).toEqual([]);
  });
});
