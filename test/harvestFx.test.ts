// 🧺 L'animation de récolte d'une place forte : ce qu'elle montre, dans quel ordre.
import { describe, expect, it } from 'vitest';
import { harvestPieces, harvestRarity, harvestTitle } from '@/lib/harvestFx';
import { RUNE_COLOR } from '@/lib/skillRunes';
import { SUPPLIES } from '@/lib/supplies';

describe('🧺 harvestPieces', () => {
  it('rien récolté : aucune pièce (pas d’animation vide)', () => {
    expect(harvestPieces({}, [])).toEqual([]);
    expect(harvestPieces(undefined, undefined)).toEqual([]);
    expect(harvestPieces({ potion: 0 }, [])).toEqual([]);
  });
  it('une pièce par sorte, avec son nombre, dans l’ordre de l’écran', () => {
    const p = harvestPieces({ potion: 2, rations: 1 }, []);
    expect(p.map((x) => [x.key, x.count])).toEqual([
      ['rations', 1],
      ['potion', 2],
    ]);
    expect(p[1]!.emoji).toBe(SUPPLIES.potion.emoji);
  });
  it('les runes après les consommables, regroupées, la plus rare en dernier', () => {
    const p = harvestPieces({ potion: 1 }, ['gold', 'green', 'green']);
    expect(p.map((x) => [x.key, x.count])).toEqual([
      ['potion', 1],
      ['rune:green', 2],
      ['rune:gold', 1],
    ]);
    expect(p[2]!.rune).toBe('gold');
    expect(p[2]!.color).toBe(RUNE_COLOR.gold);
  });
});

describe('🧺 éclat et titre', () => {
  it('l’éclat suit la rune la plus rare', () => {
    expect(harvestRarity(harvestPieces({ potion: 3 }, []))).toBe('rare');
    expect(harvestRarity(harvestPieces({}, ['green', 'blue']))).toBe('rare');
    expect(harvestRarity(harvestPieces({}, ['violet']))).toBe('epic');
    expect(harvestRarity(harvestPieces({}, ['green', 'gold']))).toBe('legendary');
  });
  it('le titre compte les runes et les consommables, accordés', () => {
    expect(harvestTitle(harvestPieces({ potion: 2, rations: 1 }, []))).toBe('+3 consommables');
    expect(harvestTitle(harvestPieces({}, ['blue']))).toBe('+1 rune');
    expect(harvestTitle(harvestPieces({ potion: 1 }, ['blue', 'gold']))).toBe(
      '+2 runes · +1 consommable',
    );
  });
});
