import { describe, it, expect } from 'vitest';
import {
  TENNIS_SLOTS,
  canStartCombo,
  challengeLane,
  comboKind,
  exerciseLane,
  fitsPlace,
  isTennisExercise,
  takenFamilies,
  tennisRange,
  tennisSlotOf,
} from '@/lib/tennisTraining';
import { suggestFullBodyPlan, type ComboChallenge } from '@/lib/combo';
import type { Challenge } from '@/lib/challenges';

const tennisEx = (tags: string[]) => ({ category: 'prepa_physique', tags: ['tennis', ...tags] });

describe('exos tennis : groupe et lieu viennent des TAGS', () => {
  it('un exo tennis = prépa physique + tag tennis', () => {
    expect(isTennisExercise(tennisEx([]))).toBe(true);
    expect(isTennisExercise({ category: 'prepa_physique', tags: ['padel'] })).toBe(false);
    expect(isTennisExercise({ category: 'musculation', tags: ['tennis'] })).toBe(false);
    expect(isTennisExercise({ category: null, tags: null })).toBe(false);
  });

  it('le groupe du 360 se lit dans le tag t360:', () => {
    expect(tennisSlotOf(tennisEx(['pliometrie', 't360:explosivite']))).toBe('explosivite');
    expect(tennisSlotOf(tennisEx(['t360:prevention']))).toBe('prevention');
    // échauffement : exo tennis sans groupe → hors 360
    expect(tennisSlotOf(tennisEx(['activation']))).toBeNull();
    // groupe inconnu → ignoré, jamais un emplacement fantôme
    expect(tennisSlotOf(tennisEx(['t360:inconnu']))).toBeNull();
    // un exo muscu ne peut pas avoir de groupe tennis
    expect(tennisSlotOf({ category: 'musculation', tags: ['t360:rotation'] })).toBeNull();
  });

  it('lieu : maison, court, ou les deux', () => {
    const maison = tennisEx(['maison']);
    const court = tennisEx(['court']);
    const partout = tennisEx(['maison', 'court']);
    const nulle = tennisEx([]);
    expect(fitsPlace(maison, 'maison')).toBe(true);
    expect(fitsPlace(maison, 'court')).toBe(false);
    expect(fitsPlace(court, 'court')).toBe(true);
    expect(fitsPlace(partout, 'maison') && fitsPlace(partout, 'court')).toBe(true);
    expect(fitsPlace(court, 'both')).toBe(true);
    // un exo sans lieu n'est proposé nulle part (donnée incomplète, pas un joker)
    expect(fitsPlace(nulle, 'both')).toBe(false);
  });
});

describe('les 6 groupes du 360 Tennis', () => {
  it('4 obligatoires puis 2 optionnels, clés uniques', () => {
    expect(TENNIS_SLOTS.map((s) => [s.key, s.essential])).toEqual([
      ['explosivite', true],
      ['reactivite', true],
      ['rotation', true],
      ['gainage', true],
      ['jambes', false],
      ['prevention', false],
    ]);
  });

  it('l’explosivité se travaille court et frais, la prévention léger et long', () => {
    expect(tennisRange('explosivite', false)).toMatchObject({ min: 4, max: 6, rest: 90 });
    expect(tennisRange('prevention', false)).toMatchObject({ min: 12, max: 15 });
    expect(tennisRange('gainage', true)).toMatchObject({ min: 30, max: 45 });
    // l'unité compte : un exo au temps reçoit des SECONDES
    expect(tennisRange('reactivite', true).max).toBeGreaterThan(
      tennisRange('reactivite', false).max,
    );
  });

  it('le plan du 360 active les 4 obligatoires en débutant, les 6 au-delà', () => {
    const deb = suggestFullBodyPlan('debutant', 'moderate', 'med', [...TENNIS_SLOTS]);
    expect(deb.filter((p) => p.active).map((p) => p.slot)).toEqual([
      'explosivite',
      'reactivite',
      'rotation',
      'gainage',
    ]);
    const av = suggestFullBodyPlan('avance', 'moderate', 'med', [...TENNIS_SLOTS]);
    expect(av.every((p) => p.active)).toBe(true);
  });
});

describe('deux sortes de Défi 360', () => {
  const c = (kind: 'tennis' | undefined, status: ComboChallenge['status']) => ({ kind, status });

  it('un 360 sans sorte est un 360 muscu (tous ceux d’avant)', () => {
    expect(comboKind({})).toBe('muscu');
    expect(comboKind({ kind: 'tennis' })).toBe('tennis');
  });

  it('⚠️ un 360 muscu et un 360 Tennis coexistent ; jamais deux de la même sorte', () => {
    expect(canStartCombo([c(undefined, 'active')], 'tennis')).toBe(true);
    expect(canStartCombo([c('tennis', 'active')], 'muscu')).toBe(true);
    expect(canStartCombo([c(undefined, 'active')], 'muscu')).toBe(false);
    expect(canStartCombo([c('tennis', 'active')], 'tennis')).toBe(false);
    // terminé ou abandonné : on peut relancer
    expect(canStartCombo([c('tennis', 'done'), c('tennis', 'abandoned')], 'tennis')).toBe(true);
  });
});

describe('trois voies de jetons', () => {
  const ch = (p: Partial<Challenge>) =>
    ({ unit: 'reps', exercise_id: 'ex_pp_squat_jump', config: { start: 10 }, ...p }) as Challenge;

  it('un challenge tennis vit dans la voie tennis', () => {
    expect(challengeLane(ch({ config: { start: 10, discipline: 'tennis' } }))).toBe('tennis');
    expect(challengeLane(ch({}))).toBe('muscu');
  });

  it('⚠️ une sortie reste une sortie, même marquée tennis', () => {
    expect(
      challengeLane(ch({ unit: 'distance', config: { start: 5, discipline: 'tennis' } })),
    ).toBe('cardio');
    expect(challengeLane(ch({ exercise_id: 'ex_burpees' }))).toBe('cardio');
  });

  it('voie d’un exo avant création', () => {
    expect(exerciseLane({ id: 'x', ...tennisEx([]) }, false)).toBe('tennis');
    expect(exerciseLane({ id: 'x', ...tennisEx([]) }, true)).toBe('cardio');
    expect(exerciseLane({ id: 'x', category: 'musculation', tags: [] }, false)).toBe('muscu');
  });
});

describe('exclusivité : un exo n’est que dans UN défi', () => {
  const leg = (id: string) => ({ exercise_id: id }) as ComboChallenge['legs'][number];

  it('exos des challenges actifs et de TOUS les 360 actifs (muscu ET tennis)', () => {
    const taken = takenFamilies(
      [
        { status: 'active', unit: 'reps', exercise_id: 'ex_pp_russian_twist' },
        { status: 'done', unit: 'reps', exercise_id: 'ex_pp_bird_dog' },
      ],
      [
        { status: 'active', legs: [leg('ex_pp_squat_jump')] },
        { status: 'active', legs: [leg('ex_bench_press')] },
        { status: 'abandoned', legs: [leg('ex_pp_side_plank')] },
      ],
    );
    expect([...taken].sort()).toEqual([
      'ex_bench_press',
      'ex_pp_russian_twist',
      'ex_pp_squat_jump',
    ]);
  });

  it('une sortie cardio ne réserve aucun exo', () => {
    const taken = takenFamilies(
      [{ status: 'active', unit: 'distance', exercise_id: 'ex_ch_marche_course' }],
      [],
    );
    expect(taken.size).toBe(0);
  });
});
