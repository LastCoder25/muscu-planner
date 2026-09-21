import { describe, expect, it } from 'vitest';
import {
  advGearLevelBand,
  advGearRankStar,
  compareAdvGear,
  makeAdvGear,
  type AdvGear,
} from '@/lib/advGear';
import { CHARACTER_RANKS } from '@/lib/characterRank';
import { RANK_ORDER, type Rarity } from '@/lib/items';

const piece = (id: string, over: Partial<AdvGear> = {}): AdvGear => ({
  id,
  ...makeAdvGear({ lineage: 'guerrier', slot: 'weapon', rank: 'commun', grade: 'B' }),
  ...over,
});

describe('🏅 le rang et les étoiles d’une pièce', () => {
  it('le RANG vient de la rareté, sur l’échelle de tout le jeu', () => {
    RANK_ORDER.forEach((r, i) => {
      const s = advGearRankStar({ rarity: r, level: advGearLevelBand(r).min });
      expect(s.name).toBe(CHARACTER_RANKS[i]!.name);
      expect(s.emoji).toBe(CHARACTER_RANKS[i]!.emoji);
      expect(s.color).toBe(CHARACTER_RANKS[i]!.color);
    });
  });

  it('les ÉTOILES parcourent la tranche du rang : ★1 au début, ★5 au bout', () => {
    for (const r of RANK_ORDER as readonly Rarity[]) {
      const b = advGearLevelBand(r);
      expect(advGearRankStar({ rarity: r, level: b.min }).star, r).toBe(1);
      expect(advGearRankStar({ rarity: r, level: b.max }).star, r).toBe(5);
    }
    // Un rang de 10 niveaux : une étoile tous les 2, comme un champion.
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
        (l) => advGearRankStar({ rarity: 'commun', level: l }).star,
      ),
    ).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
});

describe('🗂️ l’ordre d’une liste de pièces — comme le sac du héros', () => {
  it('la lettre d’abord, puis le rang, puis les étoiles, puis l’éveil', () => {
    const list = [
      piece('b-commun-1'),
      piece('b-commun-8', { level: 8 }),
      piece('b-rare', { rarity: 'rare', level: 31 }),
      piece('a-commun', { grade: 'A' }),
      piece('s-commun', { grade: 'S' }),
      piece('b-commun-8-eveil', { level: 8, awaken: 2 }),
      // ⚠️ Une ARMURE plus avancée passe devant une arme : l'emplacement ne départage qu'en dernier.
      piece('b-armure-9', { slot: 'armor', level: 9 }),
    ];
    expect([...list].sort(compareAdvGear).map((g) => g.id)).toEqual([
      's-commun',
      'a-commun',
      'b-rare',
      'b-armure-9',
      'b-commun-8-eveil',
      'b-commun-8',
      'b-commun-1',
    ]);
  });
});
