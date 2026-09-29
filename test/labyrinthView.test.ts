import { describe, it, expect } from 'vitest';
import { floorPips, labyGuardian, barrierLabel } from '@/lib/labyrinthView';
import { LABYRINTHS } from '@/data/labyrinths';
import { pickLabyFoe } from '@/data/labyrinthFoes';
import { labyTierIndex } from '@/lib/labyrinthRun';
import { mulberry32 } from '@/lib/combat';

describe('floorPips', () => {
  it('une pastille par étage, quittés / courant / restants', () => {
    expect(floorPips(0, 3)).toEqual(['cur', 'next', 'next']);
    expect(floorPips(2, 4)).toEqual(['done', 'done', 'cur', 'next']);
    expect(floorPips(3, 4)).toEqual(['done', 'done', 'done', 'cur']);
  });
  it('exactement une pastille courante', () => {
    for (let f = 0; f < 6; f++) expect(floorPips(f, 6).filter((p) => p === 'cur')).toHaveLength(1);
  });
});

describe('labyGuardian', () => {
  it('la tuile montre le gardien que le combat mettra en face, pour chaque palier', () => {
    for (const l of LABYRINTHS) {
      const boss = pickLabyFoe(mulberry32(7), labyTierIndex(l), true);
      expect(labyGuardian(l).name).toBe(boss.name);
    }
  });
  it('deux paliers de rangs différents ont deux gardiens différents', () => {
    const names = new Set(LABYRINTHS.map((l) => labyGuardian(l).name));
    expect(names.size).toBe(new Set(LABYRINTHS.map((l) => l.rank)).size);
  });
});

describe('barrierLabel', () => {
  it('rien à dire sans barrière de départ', () => {
    expect(barrierLabel(0, undefined)).toBeNull();
    expect(barrierLabel(0, 30)).toBeNull();
  });
  it('pleine tant qu’elle n’a pas servi, puis ce qui reste', () => {
    expect(barrierLabel(0.2, undefined)).toBe('pleine');
    expect(barrierLabel(0.2, 42)).toBe('42 PV');
    expect(barrierLabel(0.2, 0)).toBe('épuisée');
  });
});
