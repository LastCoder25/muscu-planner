// 🔁 Relancer le dernier Défi 360 (lib/comboRepeat) : le même défi, vierge, à la date choisie.
import { describe, expect, it } from 'vitest';
import { comboRepeatInput, lastRepeatable, repeatBlocker, repeatSummary } from '@/lib/comboRepeat';
import type { Challenge } from '@/lib/challenges';
import type { ComboChallenge, ComboLeg } from '@/lib/combo';

const leg = (over: Partial<ComboLeg> = {}): ComboLeg => ({
  slot: 'push',
  exercise_id: 'ex_pushup',
  exercise_name: 'Pompes',
  rep_weight: 1,
  target: 6,
  count_mode: 'sets',
  rep_min: 8,
  rep_max: 12,
  weight_kg: 20,
  sets: [],
  ...over,
});
const combo = (over: Partial<ComboChallenge> = {}): ComboChallenge => ({
  id: 'c1',
  name: 'Défi 360',
  start_date: '2026-11-02',
  duration_days: 7,
  status: 'done',
  legs: [leg()],
  ...over,
});
const ch = (over: Partial<Challenge> = {}): Challenge =>
  ({
    id: 'x',
    exercise_id: 'ex_pullup',
    exercise_name: 'Tractions',
    muscle_primary: 'dos',
    rep_weight: 1.3,
    unit: 'reps',
    format: 'fixed',
    duration_days: 7,
    start_date: '2026-11-02',
    config: { start: 10 },
    daily_targets: [10],
    progress: [],
    status: 'active',
    ...over,
  }) as Challenge;

describe('lastRepeatable', () => {
  it('le plus récent des défis terminés ou abandonnés, jamais un défi en cours', () => {
    const a = combo({ id: 'a', start_date: '2026-10-05' });
    const b = combo({ id: 'b', start_date: '2026-11-02', status: 'abandoned' });
    const c = combo({ id: 'c', start_date: '2026-11-09', status: 'active' });
    expect(lastRepeatable([a, b, c])?.id).toBe('b');
    expect(lastRepeatable([c])).toBeNull();
    expect(lastRepeatable([])).toBeNull();
  });
  it('ignore un défi sans exo', () => {
    expect(lastRepeatable([combo({ legs: [] })])).toBeNull();
    const vide = combo({ id: 'v', start_date: '2026-12-01', legs: [] });
    expect(lastRepeatable([combo({ id: 'ok' }), vide])?.id).toBe('ok');
  });
});

describe('comboRepeatInput', () => {
  it('même durée, mêmes exos et mêmes cibles, à la date choisie, sans séries', () => {
    const last = combo({
      duration_days: 5,
      legs: [
        leg({ sets: [{ date: '2026-11-02', reps: 10, weight: 22 }] }),
        leg({
          slot: 'core',
          exercise_id: 'ex_plank',
          exercise_name: 'Gainage',
          target: 180,
          count_mode: 'time',
        }),
      ],
    });
    const r = comboRepeatInput(last, '2026-11-09');
    expect(r.start_date).toBe('2026-11-09');
    expect(r.duration_days).toBe(5);
    expect(r.name).toBe('Défi 360');
    expect(r.legs.map((l) => [l.exercise_id, l.target, l.count_mode])).toEqual([
      ['ex_pushup', 6, 'sets'],
      ['ex_plank', 180, 'time'],
    ]);
    expect(r.legs.every((l) => l.sets?.length === 0)).toBe(true);
    expect(r.legs[0]!.rep_min).toBe(8); // la fourchette figée est reprise
  });
  it('le dernier poids utilisé préremplit la première série', () => {
    const last = combo({
      legs: [leg({ weight_kg: 20, sets: [{ date: '2026-11-03', reps: 10, weight: 25 }] })],
    });
    expect(comboRepeatInput(last, '2026-11-09').legs[0]!.weight_kg).toBe(25);
    expect(comboRepeatInput(combo(), '2026-11-09').legs[0]!.weight_kg).toBe(20);
  });
  it('ne reprend ni l’historique de saisie, ni le mode fractionné, ni le coffre, ni la clôture', () => {
    const last = combo({
      legs: [leg({ fractional: true, progress: [{ date: '2026-11-02', value: 3 }] as never })],
      chest: { opened: true } as never,
      config: { closed_by_user: true },
    });
    const r = comboRepeatInput(last, '2026-11-09');
    expect(r.legs[0]).not.toHaveProperty('fractional');
    expect(r.legs[0]).not.toHaveProperty('progress');
    expect(r).not.toHaveProperty('chest');
    expect(r.config).toBeUndefined();
  });
  it('ne modifie jamais le défi d’origine', () => {
    const last = combo({ legs: [leg({ sets: [{ date: '2026-11-02', reps: 10, weight: 22 }] })] });
    comboRepeatInput(last, '2026-11-09');
    expect(last.legs[0]!.sets).toHaveLength(1);
  });
});

describe('repeatSummary', () => {
  it('exos, groupes distincts, durée et noms dans l’ordre', () => {
    const s = repeatSummary(
      combo({
        duration_days: 6,
        legs: [
          leg(),
          leg({ exercise_id: 'ex_dips', exercise_name: 'Dips' }),
          leg({ slot: 'core', exercise_name: 'Gainage' }),
        ],
      }),
    );
    expect(s).toEqual({ exos: 3, groups: 2, days: 6, names: ['Pompes', 'Dips', 'Gainage'] });
  });
});

describe('repeatBlocker', () => {
  it('un exo du dernier défi pris par un challenge actif empêche de relancer, et le dit', () => {
    const last = combo({
      legs: [leg(), leg({ slot: 'pull', exercise_id: 'ex_pullup', exercise_name: 'Tractions' })],
    });
    expect(repeatBlocker(last, [ch()])).toBe('Tractions : déjà dans ton challenge « Tractions »');
  });
  it('libre si le challenge est fini ou porte sur un autre exo', () => {
    const last = combo();
    expect(repeatBlocker(last, [])).toBeNull();
    expect(repeatBlocker(last, [ch({ exercise_id: 'ex_pullup' })])).toBeNull();
    expect(
      repeatBlocker(combo({ legs: [leg({ exercise_id: 'ex_pullup' })] }), [ch({ status: 'done' })]),
    ).toBeNull();
  });
});

// ── ✏️ « Ajuster avant » : le dernier défi remis en choix de l'écran de création ─────────────────
import { comboRepeatDraft } from '@/lib/comboRepeat';

describe('comboRepeatDraft', () => {
  const ALL = new Set(['ex_pushup', 'ex_dips', 'ex_plank', 'ex_row', 'ex_curl']);
  const legs = [
    leg({ exercise_id: 'ex_pushup', exercise_name: 'Pompes', target: 5 }),
    leg({ exercise_id: 'ex_dips', exercise_name: 'Dips', target: 3 }),
    leg({ slot: 'core', exercise_id: 'ex_plank', exercise_name: 'Gainage', target: 90, count_mode: 'time' }),
  ];

  it('mode par exercice : exos par groupe, volume = somme des parts, répartition reprise telle quelle', () => {
    const d = comboRepeatDraft(combo({ duration_days: 5, legs }), ALL);
    expect(d.mode).toBe('exo');
    expect(d.duration).toBe(5);
    expect(d.picks.push).toMatchObject({
      exercise_ids: ['ex_pushup', 'ex_dips'],
      target: 8,
      setsTarget: 8,
      count_mode: 'sets',
      alloc: { ex_pushup: 5, ex_dips: 3 }, // pas un partage égal : la répartition choisie est gardée
    });
    expect(d.missing).toEqual([]);
  });
  it('une tenue au temps compte en séries de 30 s (90 s = 3 séries)', () => {
    const d = comboRepeatDraft(combo({ legs }), ALL);
    expect(d.picks.core).toMatchObject({ exercise_ids: ['ex_plank'], target: 3, alloc: { ex_plank: 3 } });
  });
  it('un exo en reps : le groupe passe en reps, le volume en séries sert de repli', () => {
    const d = comboRepeatDraft(
      combo({ legs: [leg({ target: 100, count_mode: 'reps', rep_min: 8, rep_max: 12 })] }),
      ALL,
    );
    expect(d.picks.push).toMatchObject({ count_mode: 'reps', target: 100, setsTarget: 10 }); // 100 reps / 10
  });
  it('mode par groupe : le volume est celui du groupe, sans répartition par exo', () => {
    const d = comboRepeatDraft(
      combo({
        legs: legs.map((l) => ({ ...l, target: 0, count_mode: 'sets' as const })),
        config: { mode: 'group', groups: [{ slot: 'push', target: 12 }, { slot: 'core', target: 6 }] },
      }),
      ALL,
    );
    expect(d.mode).toBe('group');
    expect(d.picks.push).toMatchObject({ exercise_ids: ['ex_pushup', 'ex_dips'], target: 12, setsTarget: 12 });
    expect(d.picks.push!.alloc).toBeUndefined();
    expect(d.picks.core!.target).toBe(6);
  });
  it('le dernier poids utilisé est repris', () => {
    const d = comboRepeatDraft(
      combo({ legs: [leg({ weight_kg: 10, sets: [{ date: '2026-11-03', reps: 8, weight: 30 }] })] }),
      ALL,
    );
    expect(d.picks.push!.weight_kg).toBe(30);
  });
  it('un exo qui n’est plus disponible est signalé et retiré ; un groupe vidé disparaît', () => {
    const d = comboRepeatDraft(combo({ legs }), new Set(['ex_pushup']));
    expect(d.picks.push!.exercise_ids).toEqual(['ex_pushup']);
    expect(d.picks.push!.target).toBe(5);
    expect(d.picks.core).toBeUndefined();
    expect(d.missing).toEqual(['Dips', 'Gainage']);
  });
  it('ne modifie jamais le défi d’origine', () => {
    const last = combo({ legs });
    comboRepeatDraft(last, ALL);
    expect(last.legs).toEqual(legs);
  });
});
