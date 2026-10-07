import { describe, it, expect } from 'vitest';
import {
  FATIGUE,
  muscleProfile,
  muscleLoad,
  exoFatigue,
  exoFatigueCost,
  fatigueLabel,
  pickFreshest,
  comboFatigueHits,
  type FatigueHit,
} from '@/lib/muscleFatigue';
import type { ComboLeg } from '@/lib/combo';

const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 7, 18, 0, 0);
const bench = muscleProfile('Pectoraux', ['triceps', 'épaules']);
const dips = muscleProfile('pectoraux', ['triceps']);
const triExt = muscleProfile('triceps', []);
const curl = muscleProfile('biceps', ['avant_bras']);
const row = muscleProfile('dos', ['biceps']);
const hit = (profile: typeof bench, minAgo: number): FatigueHit => ({
  at: NOW - minAgo * MIN,
  profile,
});

describe('muscleProfile', () => {
  it('normalise, dédoublonne et retire le principal des secondaires', () => {
    expect(
      muscleProfile('Pectoraux', ['triceps', 'Triceps', 'pectoraux', '', 'avant_bras']),
    ).toEqual({ primary: 'pectoraux', secondaries: ['triceps', 'avant-bras'] });
  });
});

describe('muscleLoad', () => {
  it('une série vaut 1 sur le principal et la part secondaire sur chaque secondaire', () => {
    const l = muscleLoad([hit(bench, 0)], NOW);
    expect(l.pectoraux).toBeCloseTo(1);
    expect(l.triceps).toBeCloseTo(FATIGUE.secondaryShare);
    expect(l.épaules).toBeCloseTo(FATIGUE.secondaryShare);
  });
  it('décroît de moitié à chaque demi-vie', () => {
    const l = muscleLoad([hit(bench, FATIGUE.halfLifeMin)], NOW);
    expect(l.pectoraux).toBeCloseTo(0.5);
  });
  it('les séries s’additionnent', () => {
    const l = muscleLoad([hit(bench, 0), hit(bench, 0)], NOW);
    expect(l.pectoraux).toBeCloseTo(2);
  });
  it('ignore une série future et une série au-delà de l’horizon', () => {
    const l = muscleLoad([hit(bench, -5), hit(bench, FATIGUE.horizonMin + 1)], NOW);
    expect(l.pectoraux ?? 0).toBe(0);
  });
});

describe('exoFatigue', () => {
  it('juste après un développé couché : dips à reposer, extension triceps sollicitée, curl frais', () => {
    const l = muscleLoad([hit(bench, 1)], NOW);
    expect(exoFatigue(l, dips)).toEqual({ level: 'hot', muscles: ['pectoraux'] });
    expect(exoFatigue(l, triExt)).toEqual({ level: 'warm', muscles: ['triceps'] });
    expect(exoFatigue(l, curl).level).toBe('fresh');
  });
  it('un secondaire À REPOSER rend l’exo « sollicité » : trois tirages puis le curl', () => {
    const l = muscleLoad([hit(row, 6), hit(row, 3), hit(row, 0)], NOW);
    expect(exoFatigue(l, curl)).toEqual({ level: 'hot', muscles: ['biceps'] });
    const pecs = muscleLoad([hit(bench, 6), hit(bench, 3), hit(bench, 0)], NOW);
    // Le triceps, secondaire du développé couché, est à reposer à son tour.
    expect(exoFatigue(pecs, curl).level).toBe('fresh');
    expect(exoFatigue(pecs, muscleProfile('dos', ['triceps'])).level).toBe('warm');
  });
  it('se dissipe : une série seule cesse d’être « à reposer » au bout de quelques minutes', () => {
    const minutesHot = FATIGUE.halfLifeMin * Math.log2(1 / FATIGUE.hot);
    expect(minutesHot).toBeGreaterThan(3);
    expect(minutesHot).toBeLessThan(8);
    expect(exoFatigue(muscleLoad([hit(bench, minutesHot - 0.2)], NOW), dips).level).toBe('hot');
    expect(exoFatigue(muscleLoad([hit(bench, minutesHot + 0.2)], NOW), dips).level).toBe('warm');
    expect(exoFatigue(muscleLoad([hit(bench, 30)], NOW), dips).level).toBe('fresh');
  });
  it('trois séries enchaînées restent à reposer plus longtemps qu’une seule', () => {
    const three = (minAgo: number) => [
      hit(bench, minAgo + 6),
      hit(bench, minAgo + 3),
      hit(bench, minAgo),
    ];
    expect(exoFatigue(muscleLoad(three(8), NOW), dips).level).toBe('hot');
    expect(exoFatigue(muscleLoad([hit(bench, 8)], NOW), dips).level).not.toBe('hot');
  });
});

describe('pickFreshest', () => {
  it('choisit le moins chargé, pas celui qu’on vient de faire', () => {
    const l = muscleLoad([hit(bench, 0)], NOW);
    const k = pickFreshest(
      [
        { key: 'dips', profile: dips },
        { key: 'tri', profile: triExt },
        { key: 'curl', profile: curl },
      ],
      l,
    );
    expect(k).toBe('curl');
  });
  it('à égalité, évite de répéter le dernier', () => {
    expect(
      pickFreshest(
        [
          { key: 'a', profile: curl },
          { key: 'b', profile: triExt },
        ],
        {},
        'a',
      ),
    ).toBe('b');
  });
  it('à égalité sans répétition, garde l’ordre donné', () => {
    expect(
      pickFreshest(
        [
          { key: 'a', profile: curl },
          { key: 'b', profile: triExt },
        ],
        {},
      ),
    ).toBe('a');
  });
  it('compte la part secondaire dans le coût', () => {
    const l = { triceps: 1 };
    expect(exoFatigueCost(l, bench)).toBeCloseTo(FATIGUE.secondaryShare);
    expect(exoFatigueCost(l, triExt)).toBeCloseTo(1);
  });
  it('rien à choisir → null', () => {
    expect(pickFreshest([], {})).toBeNull();
  });
});

describe('fatigueLabel', () => {
  it('rien pour un exo frais, la raison sinon', () => {
    expect(fatigueLabel({ level: 'fresh', muscles: [] })).toBeNull();
    expect(fatigueLabel({ level: 'hot', muscles: ['pectoraux'] })?.text).toContain('pectoraux');
    expect(fatigueLabel({ level: 'warm', muscles: ['triceps'] })?.text).toContain('triceps');
  });
});

describe('comboFatigueHits', () => {
  const leg = (over: Partial<ComboLeg>): ComboLeg => ({
    slot: 'push',
    exercise_id: 'ex_bench',
    exercise_name: 'Développé couché',
    muscle_primary: 'pectoraux',
    rep_weight: 1,
    target: 10,
    sets: [],
    ...over,
  });
  const profileOf = (id: string, hint: string | null) =>
    muscleProfile(
      hint ?? (id === 'ex_dips' ? 'pectoraux' : null),
      id === 'ex_bench' ? ['triceps'] : [],
    );

  it('ignore les séries sans heure, lit les muscles de l’exo d’ORIGINE d’une série basculée', () => {
    const at = new Date(NOW - 2 * MIN).toISOString();
    const hits = comboFatigueHits(
      [
        leg({
          exercise_id: 'ex_curl',
          muscle_primary: 'biceps',
          sets: [
            { date: '2026-10-07', reps: 10 }, // sans heure
            {
              date: '2026-10-07',
              reps: 10,
              at,
              origin: {
                exercise_id: 'ex_bench',
                exercise_name: 'Développé couché',
                muscle_primary: 'pectoraux',
                rep_weight: 1,
              },
            },
          ],
        }),
      ],
      profileOf,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.profile).toEqual({ primary: 'pectoraux', secondaries: ['triceps'] });
    expect(hits[0]!.at).toBe(NOW - 2 * MIN);
  });
  it('un profil inconnu ignore la série', () => {
    const at = new Date(NOW).toISOString();
    expect(comboFatigueHits([leg({ sets: [{ date: 'x', reps: 1, at }] })], () => null)).toEqual([]);
  });
});
