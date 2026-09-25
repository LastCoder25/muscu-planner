import { describe, expect, it } from 'vitest';
import { advRank, countByRank, type Adventurer } from '@/lib/adventurers';
import { CHAMPIONS } from '@/data/champions';

const champ = CHAMPIONS.find((c) => c.grade === 'S')!;
const cha = (level: number, id: string): Adventurer => ({
  id,
  name: champ.name,
  seed: 1,
  path: [],
  championId: champ.id,
  level,
  xp: 0,
});

describe('countByRank — les effectifs de la carte, rang par rang', () => {
  it('compte chaque aventurier sous le rang qu’affiche sa fiche (advRank)', () => {
    const advs = [cha(1, 'a'), cha(3, 'b'), cha(1, 'c')];
    const rows = countByRank(advs);
    const bronze = advRank(advs[0]!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      rankIndex: bronze.rankIndex,
      name: bronze.name,
      color: bronze.color,
      count: 3,
    });
  });

  it('seuls les rangs représentés, du plus haut au plus bas, et personne n’est perdu', () => {
    const advs = [cha(1, 'a'), cha(1, 'b')].map((a, i) =>
      i === 1 ? { ...a, level: 10, ascended: 1 } : a,
    );
    const rows = countByRank(advs);
    const idx = advs.map((a) => advRank(a).rankIndex);
    expect(rows).toHaveLength(2);
    expect(new Set(idx).size).toBe(rows.length);
    expect(rows.map((r) => r.rankIndex)).toEqual([...new Set(idx)].sort((x, y) => y - x));
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(advs.length);
  });

  it('un vivier vide ne donne aucune pastille', () => {
    expect(countByRank([])).toEqual([]);
  });
});
