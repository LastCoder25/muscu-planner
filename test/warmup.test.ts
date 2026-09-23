import { describe, expect, it } from 'vitest';
import { WARMUP, setOrdinal, warmupSeconds, warmupSets } from '@/lib/warmup';
import type { PlannedExercise } from '@/lib/types';

function ex(p: Partial<PlannedExercise['target']> & { unilateral?: boolean } = {}) {
  const { unilateral, ...target } = p;
  const e: PlannedExercise = {
    id: 'ex_test',
    name: 'Test',
    progression: 'double',
    rest_seconds: 90,
    target: { sets: 4, reps_min: 8, reps_max: 12, ...target },
  };
  if (unilateral) e.unilateral = true;
  return e;
}

describe('warmupSets — qui s’échauffe à la charge, et qui non', () => {
  it('le gainage n’a pas d’approche : il se compte en secondes', () => {
    expect(warmupSets(ex({ unit: 'time', reps_min: 30, reps_max: 60, load_kg: 100 }))).toEqual([]);
  });

  it('le poids du corps n’a pas d’approche : il n’y a pas de charge à monter', () => {
    expect(warmupSets(ex({ load: 'bodyweight', load_kg: 80 }))).toEqual([]);
  });

  it('sans charge, pas d’approche', () => {
    expect(warmupSets(ex())).toEqual([]);
  });

  it('une pyramide importée garde la montée de son auteur', () => {
    const e = ex({ load_kg: 100 });
    expect(warmupSets(e).length).toBe(3); // témoin : il en aurait eu
    e.prescription = [
      { reps: 12, load_kg: 40 },
      { reps: 8, load_kg: 70 },
      { reps: 5, load_kg: 100 },
    ];
    expect(warmupSets(e)).toEqual([]);
  });

  it('on ne s’échauffe pas sur une charge légère', () => {
    // Une élévation latérale à 8 kg : une « approche » à 4 kg ne prépare rien.
    expect(warmupSets(ex({ load_kg: 8 }))).toEqual([]);
    expect(warmupSets(ex({ load_kg: WARMUP.minLoad - WARMUP.step }))).toEqual([]);
    // Le seuil lui-même est inclus.
    expect(warmupSets(ex({ load_kg: WARMUP.minLoad })).length).toBeGreaterThan(0);
  });
});

describe('warmupSets — plus c’est lourd, plus la montée compte de marches', () => {
  it('une charge modeste vaut une seule approche', () => {
    expect(warmupSets(ex({ load_kg: 30 })).length).toBe(1);
  });

  it('une charge moyenne en vaut deux', () => {
    expect(warmupSets(ex({ load_kg: 50 })).length).toBe(2);
  });

  it('une charge lourde en vaut trois', () => {
    expect(warmupSets(ex({ load_kg: 100 })).length).toBe(3);
  });

  it('le nombre de marches ne DESCEND jamais quand la charge monte', () => {
    let prev = 0;
    for (let load = WARMUP.minLoad; load <= 250; load += WARMUP.step) {
      const n = warmupSets(ex({ load_kg: load })).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});

describe('warmupSets — les invariants, sur toute la plage de charges', () => {
  // Un cas nommé ne prouve rien : c'est l'arrondi qui fabrique les cas limites
  // (deux paliers qui retombent sur la même charge, une approche qui rejoint la
  // charge de travail). On balaie.
  const loads: number[] = [];
  for (let l = WARMUP.minLoad; l <= 300; l += WARMUP.step) loads.push(l);

  it('les charges sont STRICTEMENT croissantes', () => {
    for (const load of loads) {
      const sets = warmupSets(ex({ load_kg: load }));
      for (let i = 1; i < sets.length; i++) {
        expect(sets[i]!.load_kg!, `charge de travail ${load}`).toBeGreaterThan(
          sets[i - 1]!.load_kg!,
        );
      }
    }
  });

  it('une approche reste TOUJOURS sous la charge de travail', () => {
    for (const load of loads) {
      for (const s of warmupSets(ex({ load_kg: load }))) {
        expect(s.load_kg!, `charge de travail ${load}`).toBeLessThan(load);
      }
    }
  });

  it('une approche n’est jamais nulle ni négative', () => {
    for (const load of loads) {
      for (const s of warmupSets(ex({ load_kg: load }))) {
        expect(s.load_kg!, `charge de travail ${load}`).toBeGreaterThan(0);
      }
    }
  });

  it('les charges tombent sur le pas de la barre', () => {
    for (const load of loads) {
      for (const s of warmupSets(ex({ load_kg: load }))) {
        expect(
          Math.abs(s.load_kg! / WARMUP.step - Math.round(s.load_kg! / WARMUP.step)),
          `charge de travail ${load} → ${s.load_kg}`,
        ).toBeLessThan(1e-9);
      }
    }
  });

  it('les reps DESCENDENT à mesure que la charge monte : on prépare, on ne fatigue pas', () => {
    for (const load of loads) {
      const sets = warmupSets(ex({ load_kg: load }));
      for (let i = 1; i < sets.length; i++) {
        expect(sets[i]!.reps, `charge de travail ${load}`).toBeLessThan(sets[i - 1]!.reps);
      }
    }
  });

  it('le repos d’une approche est court — ce n’est pas du travail', () => {
    const sets = warmupSets(ex({ load_kg: 100 }));
    expect(sets.length).toBeGreaterThan(0);
    for (const s of sets) {
      expect(s.rest_seconds).toBe(WARMUP.restSec);
      // Nettement plus court que le repos de travail de l'exercice (90 s ici).
      expect(s.rest_seconds!).toBeLessThan(90);
    }
  });
});

describe('setOrdinal — deux suites entrelacées, chacune numérotée chez elle', () => {
  const W = { warmup: true };
  const S = {};

  it('les séries de travail repartent de 1 malgré les approches', () => {
    const sets = [W, W, S, S, S, S];
    expect(sets.map((_, i) => setOrdinal(sets, i))).toEqual([1, 2, 1, 2, 3, 4]);
  });

  it('sans approche, c’est la numérotation habituelle', () => {
    const sets = [S, S, S];
    expect(sets.map((_, i) => setOrdinal(sets, i))).toEqual([1, 2, 3]);
  });

  it('ne suppose pas que les approches sont en tête', () => {
    // Une approche ajoutée après coup ne doit pas décaler la numérotation du travail.
    const sets = [S, W, S, W];
    expect(sets.map((_, i) => setOrdinal(sets, i))).toEqual([1, 1, 2, 2]);
  });
});

describe('warmupSeconds — ce que les approches ajoutent à la durée', () => {
  it('vaut zéro quand il n’y a pas d’approche', () => {
    expect(warmupSeconds(ex({ load: 'bodyweight' }))).toBe(0);
    expect(warmupSeconds(ex({ load_kg: 5 }))).toBe(0);
  });

  it('croît avec le nombre d’approches', () => {
    expect(warmupSeconds(ex({ load_kg: 100 }))).toBeGreaterThan(warmupSeconds(ex({ load_kg: 30 })));
  });

  it('un unilatéral prend plus longtemps : les deux côtés', () => {
    const solo = warmupSeconds(ex({ load_kg: 50 }));
    const uni = warmupSeconds(ex({ load_kg: 50, unilateral: true }));
    expect(uni).toBeGreaterThan(solo);
  });
});
