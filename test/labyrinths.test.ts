import { describe, it, expect } from 'vitest';
import {
  LABYRINTHS,
  labyClearId,
  labyrinthUnlockedTier,
  labyrinthCleared,
  frontierLabyrinth,
  deathKeepFraction,
} from '@/data/labyrinths';

describe('labyrinths — ladder de paliers', () => {
  it('paliers ordonnés (recoLevel + étages croissants)', () => {
    for (let i = 1; i < LABYRINTHS.length; i++) {
      expect(LABYRINTHS[i]!.recoLevel).toBeGreaterThan(LABYRINTHS[i - 1]!.recoLevel);
      expect(LABYRINTHS[i]!.floors).toBeGreaterThanOrEqual(LABYRINTHS[i - 1]!.floors);
      expect(LABYRINTHS[i]!.dropLevel).toBeGreaterThan(LABYRINTHS[i - 1]!.dropLevel);
      expect(LABYRINTHS[i]!.luck).toBeGreaterThanOrEqual(LABYRINTHS[i - 1]!.luck);
    }
  });

  it('le premier palier est toujours débloqué, les autres non', () => {
    expect(labyrinthUnlockedTier(LABYRINTHS[0]!.id, [])).toBe(true);
    expect(labyrinthUnlockedTier(LABYRINTHS[1]!.id, [])).toBe(false);
  });

  it('un palier se débloque en nettoyant le précédent', () => {
    const cleared = [labyClearId(LABYRINTHS[0]!.id)];
    expect(labyrinthUnlockedTier(LABYRINTHS[1]!.id, cleared)).toBe(true);
    expect(labyrinthUnlockedTier(LABYRINTHS[2]!.id, cleared)).toBe(false); // pas encore
    expect(labyrinthCleared(LABYRINTHS[0]!.id, cleared)).toBe(true);
    expect(labyrinthCleared(LABYRINTHS[1]!.id, cleared)).toBe(false);
  });

  it('frontierLabyrinth = premier palier non nettoyé', () => {
    expect(frontierLabyrinth([]).id).toBe(LABYRINTHS[0]!.id);
    expect(frontierLabyrinth([labyClearId(LABYRINTHS[0]!.id)]).id).toBe(LABYRINTHS[1]!.id);
  });

  it('id inconnu → verrouillé', () => {
    expect(labyrinthUnlockedTier('inconnu', [])).toBe(false);
  });

  it('perte à la mort liée à la profondeur : premier palier pardonne le plus, décroissant', () => {
    expect(deathKeepFraction(LABYRINTHS[0]!.id)).toBe(1);
    expect(deathKeepFraction(LABYRINTHS[LABYRINTHS.length - 1]!.id)).toBeLessThan(
      deathKeepFraction(LABYRINTHS[0]!.id),
    );
    for (let i = 1; i < LABYRINTHS.length; i++) {
      expect(deathKeepFraction(LABYRINTHS[i]!.id)).toBeLessThanOrEqual(
        deathKeepFraction(LABYRINTHS[i - 1]!.id),
      );
    }
    expect(deathKeepFraction(LABYRINTHS[LABYRINTHS.length - 1]!.id)).toBeGreaterThanOrEqual(0.4);
  });
});
