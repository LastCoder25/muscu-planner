import { describe, it, expect } from 'vitest';
import { LABY_THEMES, labyTheme, roomLightRadius, LIGHT } from '@/lib/labyrinthScene';
import { LABYRINTHS } from '@/data/labyrinths';
import { LABY_GUARDIANS } from '@/data/labyrinthFoes';
import { labyTierIndex } from '@/lib/labyrinthRun';

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};

describe('LABY_THEMES', () => {
  it('une palette par rang de palier, autant que de gardiens', () => {
    expect(LABY_THEMES).toHaveLength(LABY_GUARDIANS.length);
  });
  it('chaque palier du jeu a SA palette (jamais le repli)', () => {
    for (const l of LABYRINTHS) {
      expect(labyTierIndex(l)).toBeLessThan(LABY_THEMES.length);
      expect(labyTheme(l)).toBe(LABY_THEMES[labyTierIndex(l)]);
    }
  });
  it('deux paliers de rangs différents ne partagent pas leur sol', () => {
    expect(new Set(LABY_THEMES.map((t) => t.floor)).size).toBe(LABY_THEMES.length);
  });
  it('le mur est plus sombre que le sol, le sol que l’arête du mur : on lit la salle', () => {
    for (const t of LABY_THEMES) {
      expect(lum(t.wall)).toBeLessThan(lum(t.floor));
      expect(lum(t.floor)).toBeLessThan(lum(t.wallTop));
      expect(lum(t.wall)).toBeLessThan(lum(t.corridor));
    }
  });
  it('sans palier, la première palette', () => {
    expect(labyTheme(null)).toBe(LABY_THEMES[0]);
  });
});

describe('roomLightRadius', () => {
  it('une salle visitée est bien plus éclairée qu’une salle seulement vue', () => {
    expect(roomLightRadius(66, true)).toBeCloseTo(66 * LIGHT.visited);
    expect(roomLightRadius(66, false)).toBeCloseTo(66 * LIGHT.seen);
    expect(LIGHT.visited).toBeGreaterThan(LIGHT.seen * 1.5);
  });
  it('la lumière d’une salle vue ne déborde pas jusqu’à la salle voisine (anti-divulgation)', () => {
    // Deux salles voisines sont à un pas de grille : si la lumière d'une porte atteignait le
    // centre de la voisine, on verrait une salle qu'on n'a pas découverte.
    expect(LIGHT.seen).toBeLessThan(0.5);
  });
});
