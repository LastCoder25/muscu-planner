// 🧺 L'animation de récolte d'une place forte : ce qu'elle montre, dans quel ordre.
import { describe, expect, it } from 'vitest';
import { harvestPieces, harvestRarity, harvestTitle } from '@/lib/harvestFx';
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
  it('les runes (multicolores) après les consommables, en une pièce', () => {
    const p = harvestPieces({ potion: 1 }, 3);
    expect(p.map((x) => [x.key, x.count])).toEqual([
      ['potion', 1],
      ['rune', 3],
    ]);
    expect(p[1]!.rune).toBe('multi');
    // ⚠️ Un butin d'avant la bascule (tableau de couleurs) compte une rune par entrée.
    expect(harvestPieces({}, ['gold', 'green'])[0]!.count).toBe(2);
  });
});

describe('🧺 éclat et titre', () => {
  it('une rune (sa couleur est encore cachée) éclate plus qu’un panier de consommables', () => {
    expect(harvestRarity(harvestPieces({ potion: 3 }, 0))).toBe('rare');
    expect(harvestRarity(harvestPieces({}, 1))).toBe('epic');
  });
  it('le titre compte les runes et les consommables, accordés', () => {
    expect(harvestTitle(harvestPieces({ potion: 2, rations: 1 }, []))).toBe('+3 consommables');
    expect(harvestTitle(harvestPieces({}, 1))).toBe('+1 rune');
    expect(harvestTitle(harvestPieces({ potion: 1 }, 2))).toBe('+2 runes · +1 consommable');
  });
});
