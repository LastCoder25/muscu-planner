// 🔁 « Relancer » / « Ajuster avant » : l'unité d'un exo au temps (durée ou séries) se retrouve.
import { describe, expect, it } from 'vitest';
import { comboRepeatDraft, comboRepeatInput } from '@/lib/comboRepeat';
import { legIsHold, type ComboChallenge, type ComboLeg } from '@/lib/combo';

const plank = (over: Partial<ComboLeg> = {}): ComboLeg =>
  ({
    slot: 'core',
    exercise_id: 'ex_plank',
    exercise_name: 'Planche',
    muscle_primary: 'abdominaux',
    rep_weight: 0.6,
    target: 4,
    count_mode: 'sets',
    hold: true,
    rep_min: 30,
    rep_max: 60,
    sets: [{ date: '2026-10-12', reps: 45 }],
    ...over,
  }) as ComboLeg;
const wall = (over: Partial<ComboLeg> = {}): ComboLeg =>
  plank({ exercise_id: 'ex_wall_sit', exercise_name: 'Chaise', ...over });
const combo = (legs: ComboLeg[]): ComboChallenge =>
  ({
    id: 'c1',
    name: 'Défi 360',
    start_date: '2026-10-12',
    duration_days: 7,
    status: 'done',
    legs,
  }) as unknown as ComboChallenge;
const ALL = new Set(['ex_plank', 'ex_wall_sit', 'bench']);

describe('🔁 Ajuster avant : le choix « Durée | Séries » revient dans le brouillon', () => {
  it('une tenue comptée en séries : part = sa cible, exo marqué « séries »', () => {
    const d = comboRepeatDraft(combo([plank({ target: 4 })]), ALL);
    const p = d.picks.core!;
    expect(p.holdSets).toEqual(['ex_plank']);
    expect(p.alloc).toEqual({ ex_plank: 4 }); // 4 tenues, pas 4 ÷ 30
    expect(p.target).toBe(4);
    expect(p.count_mode).toBe('sets');
    expect(p.weight_kg).toBeNull(); // une tenue n'a pas de charge de départ
    // …même si la jambe en gardait une (ancienne donnée) : le poids ne se reprend pas d'une tenue.
    const stale = comboRepeatDraft(combo([plank({ weight_kg: 12, sets: [] })]), ALL);
    expect(stale.picks.core!.weight_kg).toBeNull();
  });
  it('une tenue en durée : part = secondes ÷ 30, aucun exo marqué « séries »', () => {
    const l = plank({ count_mode: 'time', target: 120 });
    const d = comboRepeatDraft(combo([l]), ALL);
    expect(d.picks.core!.alloc).toEqual({ ex_plank: 4 });
    expect(d.picks.core!.holdSets).toBeUndefined();
  });
  it('un 360 d’avant (durée, sans `hold`) : comme avant', () => {
    const l = plank({ count_mode: 'time', target: 90 });
    delete l.hold;
    const d = comboRepeatDraft(combo([l]), ALL);
    expect(d.picks.core).toEqual({
      exercise_ids: ['ex_plank'],
      target: 3,
      setsTarget: 3,
      weight_kg: null,
      count_mode: 'sets',
      alloc: { ex_plank: 3 },
    });
  });
  it('dans un même groupe, chaque exo garde son unité', () => {
    const d = comboRepeatDraft(
      combo([plank({ target: 3 }), wall({ count_mode: 'time', target: 60 })]),
      ALL,
    );
    expect(d.picks.core!.holdSets).toEqual(['ex_plank']);
    expect(d.picks.core!.alloc).toEqual({ ex_plank: 3, ex_wall_sit: 2 });
    expect(d.picks.core!.target).toBe(5);
  });
  it('mode par groupe : pas de choix d’unité repris', () => {
    const last = combo([plank({ target: 0 })]);
    last.config = { mode: 'group', groups: [{ slot: 'core', target: 6 }] };
    expect(comboRepeatDraft(last, ALL).picks.core!.holdSets).toBeUndefined();
  });
});

describe('🔁 Relancer à l’identique : l’unité est recopiée', () => {
  it('`hold` et le mode de comptage restent ; les séries repartent à zéro', () => {
    const input = comboRepeatInput(combo([plank({ lest_kg: 5 })]), '2026-11-02');
    const l = input.legs[0]!;
    expect(l.hold).toBe(true);
    expect(l.count_mode).toBe('sets');
    expect(l.target).toBe(4);
    expect(l.sets).toEqual([]);
    expect(legIsHold(l)).toBe(true);
    expect(l.lest_kg).toBe(5);
  });
  it('un exo en durée sans `hold` n’en gagne pas', () => {
    const old = plank({ count_mode: 'time', target: 120 });
    delete old.hold;
    const l = comboRepeatInput(combo([old]), '2026-11-02').legs[0]!;
    expect('hold' in l).toBe(false);
    expect(l.count_mode).toBe('time');
  });
});
