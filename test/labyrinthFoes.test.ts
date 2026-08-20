import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import {
  LABY_ROSTERS,
  LABY_GUARDIANS,
  LABY_ARCHETYPES,
  pickLabyFoe,
  pickLabyArchetype,
} from '@/data/labyrinthFoes';

describe('labyrinthFoes', () => {
  it('10 paliers (G→SSS) : un roster + un gardien par palier', () => {
    expect(LABY_ROSTERS).toHaveLength(10);
    expect(LABY_GUARDIANS).toHaveLength(10);
    for (const r of LABY_ROSTERS) expect(r.length).toBeGreaterThanOrEqual(3);
  });

  it('boss → gardien NOMMÉ du palier (déterministe)', () => {
    for (let ti = 0; ti < 10; ti++) {
      const f = pickLabyFoe(mulberry32(ti + 1), ti, true);
      expect(f.name).toBe(LABY_GUARDIANS[ti]!.name);
      expect(f.arch.id).toBe('gardien');
    }
  });

  it('salle normale → créature du roster du palier', () => {
    for (let ti = 0; ti < 10; ti++) {
      const names = new Set(LABY_ROSTERS[ti]!.map((k) => k.name));
      for (let s = 0; s < 20; s++) {
        const f = pickLabyFoe(mulberry32(s * 7 + ti), ti, false);
        expect(names.has(f.name)).toBe(true);
        expect(f.arch.id).not.toBe('gardien');
      }
    }
  });

  it('tierIndex hors bornes → clampé (pas de crash)', () => {
    expect(() => pickLabyFoe(mulberry32(1), -3, false)).not.toThrow();
    expect(() => pickLabyFoe(mulberry32(1), 99, true)).not.toThrow();
    expect(pickLabyFoe(mulberry32(1), 99, true).name).toBe(LABY_GUARDIANS[9]!.name);
  });

  it('le Rôdeur reste l’archétype le plus fréquent', () => {
    const counts: Record<string, number> = {};
    for (let s = 0; s < 4000; s++) {
      const a = pickLabyArchetype(mulberry32(s * 13 + 1));
      counts[a.id] = (counts[a.id] ?? 0) + 1;
    }
    const modal = Object.entries(counts).sort((x, y) => y[1]! - x[1]!)[0]![0];
    expect(modal).toBe('rodeur');
    // tous les archétypes sont tirables
    expect(Object.keys(counts).length).toBe(LABY_ARCHETYPES.length);
  });
});
