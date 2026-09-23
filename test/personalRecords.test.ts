import { describe, expect, it } from 'vitest';
import { bestSetE1RM, personalRecords } from '@/lib/estimates';
import { SCHEMA_VERSION, type PerformedSet, type SessionLog } from '@/lib/types';

function set(load: number, reps: number): PerformedSet {
  return { set: 1, load_kg: load, reps, difficulty: 2 };
}

function log(exercises: { id: string; name: string; muscle?: string; sets: PerformedSet[] }[]) {
  return {
    schema_version: SCHEMA_VERSION,
    type: 'session_log',
    id: crypto.randomUUID(),
    exercises: exercises.map((e) => {
      const le: SessionLog['exercises'][number] = {
        id: e.id,
        name: e.name,
        planned: {},
        performed: e.sets,
      };
      if (e.muscle) le.muscle_primary = e.muscle;
      return le;
    }),
  } as SessionLog;
}

const dc = (sets: PerformedSet[]) => ({
  id: 'ex_dc',
  name: 'Développé couché',
  muscle: 'pectoraux',
  sets,
});

describe('bestSetE1RM — la série, pas seulement le nombre', () => {
  it('rend la série qui produit le meilleur 1RM estimé', () => {
    const best = bestSetE1RM([set(80, 10), set(100, 3), set(60, 15)]);
    // 100×3 → 110 ; 80×10 → 106,7 ; 60×15 → 90
    expect(best?.set.load_kg).toBe(100);
    expect(best?.set.reps).toBe(3);
  });

  it('ignore les séries sans charge : un poids du corps n’a pas de record de force', () => {
    expect(bestSetE1RM([set(0, 20), set(0, 15)])).toBeNull();
  });

  it('rend null sur une liste vide', () => {
    expect(bestSetE1RM([])).toBeNull();
  });
});

describe('personalRecords — un record par exercice', () => {
  it('garde la meilleure série de tout l’historique', () => {
    const recs = personalRecords([
      { performedAt: '2026-01-10T18:00:00Z', log: log([dc([set(80, 8)])]) },
      { performedAt: '2026-02-10T18:00:00Z', log: log([dc([set(95, 5)])]) },
      { performedAt: '2026-03-10T18:00:00Z', log: log([dc([set(85, 8)])]) },
    ]);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.load).toBe(95);
    expect(recs[0]!.reps).toBe(5);
    expect(recs[0]!.dateIso).toBe('2026-02-10');
  });

  it('un record s’établit UNE fois : le refaire ne le rajeunit pas', () => {
    const recs = personalRecords([
      { performedAt: '2026-01-10T18:00:00Z', log: log([dc([set(100, 5)])]) },
      { performedAt: '2026-06-10T18:00:00Z', log: log([dc([set(100, 5)])]) },
    ]);
    expect(recs[0]!.dateIso).toBe('2026-01-10');
  });

  it('compte les séances où l’exercice a été chargé', () => {
    const recs = personalRecords([
      { performedAt: '2026-01-10T18:00:00Z', log: log([dc([set(80, 8)])]) },
      { performedAt: '2026-02-10T18:00:00Z', log: log([dc([set(95, 5)])]) },
      { performedAt: '2026-03-10T18:00:00Z', log: log([dc([set(85, 8)])]) },
    ]);
    expect(recs[0]!.sessions).toBe(3);
  });

  it('retient le nom le plus RÉCENT — un exercice peut être renommé', () => {
    const recs = personalRecords([
      { performedAt: '2026-01-10T18:00:00Z', log: log([{ ...dc([set(100, 5)]), name: 'DC' }]) },
      {
        performedAt: '2026-02-10T18:00:00Z',
        log: log([{ ...dc([set(60, 5)]), name: 'Développé couché barre' }]),
      },
    ]);
    // Le record reste celui de janvier, mais il porte le nom de février.
    expect(recs[0]!.load).toBe(100);
    expect(recs[0]!.name).toBe('Développé couché barre');
  });

  it('trie du plus lourd au plus léger', () => {
    const recs = personalRecords([
      {
        performedAt: '2026-01-10T18:00:00Z',
        log: log([
          dc([set(80, 5)]),
          { id: 'ex_sq', name: 'Squat', sets: [set(140, 5)] },
          { id: 'ex_cu', name: 'Curl', sets: [set(20, 10)] },
        ]),
      },
    ]);
    expect(recs.map((r) => r.name)).toEqual(['Squat', 'Développé couché', 'Curl']);
  });

  it('écarte les exercices sans charge', () => {
    const recs = personalRecords([
      {
        performedAt: '2026-01-10T18:00:00Z',
        log: log([
          dc([set(80, 5)]),
          { id: 'ex_pompes', name: 'Pompes', sets: [set(0, 30)] },
          { id: 'ex_gainage', name: 'Gainage', sets: [set(0, 60)] },
        ]),
      },
    ]);
    expect(recs.map((r) => r.name)).toEqual(['Développé couché']);
  });

  it('ne dépend pas de l’ordre d’arrivée des séances', () => {
    // ⚠️ Le fixture DOIT contenir ce qui dépend de la chronologie — une ÉGALITÉ de valeur
    // (qui décide de la date retenue) et un RENOMMAGE (qui décide du nom). Sans eux, le
    // résultat est le même dans tous les ordres et le test ne mord sur rien : c'est
    // exactement ce qu'une mutation « tri retiré » a révélé.
    const entries = [
      // Désordre volontaire, et le store rend justement le plus récent en premier.
      {
        performedAt: '2026-03-10T18:00:00Z',
        log: log([{ ...dc([set(100, 5)]), name: 'DC barre' }]),
      },
      { performedAt: '2026-01-10T18:00:00Z', log: log([{ ...dc([set(100, 5)]), name: 'DC' }]) },
      { performedAt: '2026-02-10T18:00:00Z', log: log([{ ...dc([set(80, 8)]), name: 'DC' }]) },
    ];
    const a = personalRecords(entries);
    const b = personalRecords([...entries].reverse());
    expect(a).toEqual(b);
    // Record établi en janvier (l'égalité de mars ne le déplace pas), nom de mars.
    expect(a[0]!.dateIso).toBe('2026-01-10');
    expect(a[0]!.name).toBe('DC barre');
  });

  it('ne modifie pas la liste qu’on lui passe', () => {
    const entries = [
      { performedAt: '2026-03-10T18:00:00Z', log: log([dc([set(85, 8)])]) },
      { performedAt: '2026-01-10T18:00:00Z', log: log([dc([set(80, 8)])]) },
    ];
    const avant = entries.map((e) => e.performedAt);
    personalRecords(entries);
    expect(entries.map((e) => e.performedAt)).toEqual(avant);
  });

  it('porte le muscle, pour colorer le mur', () => {
    const recs = personalRecords([
      { performedAt: '2026-01-10T18:00:00Z', log: log([dc([set(80, 5)])]) },
    ]);
    expect(recs[0]!.muscle).toBe('pectoraux');
  });

  it('rend une liste vide sans historique', () => {
    expect(personalRecords([])).toEqual([]);
  });
});
