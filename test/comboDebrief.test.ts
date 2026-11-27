// @vitest-environment happy-dom
//
// 📊 Bilan de répartition d'un Défi 360 clôturé (v1.368.0) : la lib (`comboDebrief`) et le composant.
import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import ComboDebrief from '@/components/ComboDebrief.vue';
import {
  BACK_TO_BACK_SETS,
  comboDebrief,
  PEAK_MIN_SETS,
  type DebriefTipId,
} from '@/lib/comboDebrief';
import type { ComboChallenge, ComboLeg, ComboSet } from '@/lib/combo';

const START = '2099-01-05'; // un lundi
const day = (i: number) => {
  const d = new Date(`${START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};
/** n séries de 10 reps faites le jour i (0 = premier jour du défi). */
const sets = (i: number, n: number, over: Partial<ComboSet> = {}): ComboSet[] =>
  Array.from({ length: n }, () => ({ date: day(i), reps: 10, weight: null, ...over }));
const leg = (slot: string, id: string, name: string, target: number, s: ComboSet[]): ComboLeg =>
  ({
    slot,
    exercise_id: id,
    exercise_name: name,
    muscle_primary: null,
    rep_weight: 1,
    target,
    count_mode: 'sets',
    sets: s,
  }) as ComboLeg;
const combo = (
  legs: ComboLeg[],
  duration = 7,
  over: Partial<ComboChallenge> = {},
): ComboChallenge => ({
  id: 'c1',
  name: '360',
  start_date: START,
  duration_days: duration,
  status: 'done',
  legs,
  ...over,
});
const tips = (c: ComboChallenge): DebriefTipId[] => (comboDebrief(c)?.tips ?? []).map((t) => t.id);

describe('comboDebrief : ce qui s’est passé', () => {
  it('rien de fait dans la fenêtre : pas de bilan', () => {
    expect(comboDebrief(combo([leg('push', 'a', 'Pompes', 6, [])]))).toBeNull();
  });
  it('range les séries par jour, groupe et exo ; compte jours actifs et repos', () => {
    const c = combo([
      leg('push', 'a', 'Pompes', 6, [...sets(0, 2), ...sets(2, 1)]),
      leg('push', 'b', 'Dips', 4, sets(0, 1)),
      leg('pull', 'c', 'Tractions', 4, sets(2, 3)),
    ]);
    const d = comboDebrief(c)!;
    expect(d.total).toBe(7);
    expect(d.days[0]!.total).toBe(3);
    expect(d.days[0]!.groups[0]).toMatchObject({ slot: 'push', sets: 3 });
    expect(d.days[0]!.groups[0]!.legs.map((l) => [l.name, l.sets])).toEqual([
      ['Pompes', 2],
      ['Dips', 1],
    ]);
    expect(d.days[2]!.groups.map((g) => g.slot).sort()).toEqual(['pull', 'push']);
    expect(d.activeDays).toBe(2);
    expect(d.restDays).toBe(5);
    expect(d.rows.find((r) => r.slot === 'push')).toMatchObject({ total: 4, daysWorked: 2 });
  });
  it('une série faite après la fin n’entre pas dans la grille mais est annoncée', () => {
    const d = comboDebrief(combo([leg('push', 'a', 'Pompes', 3, [...sets(0, 3), ...sets(8, 2)])]))!;
    expect(d.total).toBe(3);
    expect(d.lateSets).toBe(2);
  });
  it('une série basculée est nommée d’après l’exo réellement fait', () => {
    const swapped = sets(1, 1, {
      origin: {
        exercise_id: 'z',
        exercise_name: 'Pompes diamant',
        muscle_primary: null,
        rep_weight: 1,
      },
    } as Partial<ComboSet>);
    const d = comboDebrief(combo([leg('push', 'a', 'Pompes', 3, [...sets(0, 2), ...swapped])]))!;
    expect(d.days[1]!.groups[0]!.legs[0]).toMatchObject({ name: 'Pompes diamant', sets: 1 });
  });
  it('un groupe à objectif mais sans aucune série apparaît quand même (ligne à 0)', () => {
    const c = combo([leg('push', 'a', 'Pompes', 3, sets(0, 3)), leg('legs', 'b', 'Squat', 4, [])]);
    const rows = comboDebrief(c)!.rows;
    expect(rows.find((r) => r.slot === 'legs')).toMatchObject({
      total: 0,
      target: 4,
      daysWorked: 0,
    });
  });
});

describe('comboDebrief : les conseils', () => {
  it('un jour qui écrase les autres → « peak » (et le conseil donne le rythme idéal)', () => {
    const c = combo([
      leg('push', 'a', 'Pompes', 12, [...sets(0, 1), ...sets(3, 1), ...sets(4, 10)]),
    ]);
    expect(tips(c)).toContain('peak');
    const t = comboDebrief(c)!;
    expect(t.idealPerDay).toBe(2);
    expect(t.tips.find((x) => x.id === 'peak')!.text).toContain('environ 2 séries par jour');
  });
  it('« peak » ne se déclenche pas sous le volume minimal', () => {
    const c = combo([leg('push', 'a', 'Pompes', 6, sets(0, PEAK_MIN_SETS - 1))]);
    expect(tips(c)).not.toContain('peak');
  });
  it('le volume tombé sur le dernier tiers → « late »', () => {
    const c = combo([
      leg('push', 'a', 'Pompes', 10, [...sets(0, 2), ...sets(5, 4), ...sets(6, 4)]),
    ]);
    expect(tips(c)).toContain('late');
    expect(
      tips(combo([leg('push', 'a', 'Pompes', 10, [...sets(0, 4), ...sets(2, 3), ...sets(4, 3)])])),
    ).not.toContain('late');
  });
  it('3 jours de suite sans rien → « gap » avec les jours cités', () => {
    const c = combo([leg('push', 'a', 'Pompes', 6, [...sets(0, 3), ...sets(4, 3)])]);
    const g = comboDebrief(c)!.tips.find((t) => t.id === 'gap')!;
    expect(g.text).toContain('3 jours de suite');
    expect(g.text).toContain('jours 2 à 4');
  });
  it('un groupe travaillé un seul jour sur un défi de 7 → « singleDay », nommé', () => {
    const c = combo([
      leg('push', 'a', 'Pompes', 8, sets(1, 8)),
      leg('pull', 'b', 'Tractions', 6, [...sets(0, 2), ...sets(3, 2), ...sets(5, 2)]),
    ]);
    const t = comboDebrief(c)!.tips.find((x) => x.id === 'singleDay')!;
    expect(t.slots).toEqual(['push']);
  });
  it('un même groupe chargé deux jours d’affilée → « backToBack »', () => {
    const c = combo([
      leg('legs', 'a', 'Squat', 10, [
        ...sets(1, BACK_TO_BACK_SETS),
        ...sets(2, BACK_TO_BACK_SETS),
        ...sets(5, 2),
      ]),
    ]);
    expect(comboDebrief(c)!.tips.find((t) => t.id === 'backToBack')!.slots).toEqual(['legs']);
    const lighter = combo([
      leg('legs', 'a', 'Squat', 10, [
        ...sets(1, BACK_TO_BACK_SETS),
        ...sets(2, BACK_TO_BACK_SETS - 1),
        ...sets(5, 2),
      ]),
    ]);
    expect(tips(lighter)).not.toContain('backToBack');
  });
  it('aucun jour de repos sur 7 → « noRest »', () => {
    const all = Array.from({ length: 7 }, (_, i) => sets(i, 2)).flat();
    expect(tips(combo([leg('push', 'a', 'Pompes', 14, all)]))).toContain('noRest');
  });
  it('un objectif non bouclé → « missed » avec les groupes en retard', () => {
    const c = combo([
      leg('push', 'a', 'Pompes', 4, sets(0, 4)),
      leg('legs', 'b', 'Squat', 6, sets(2, 2)),
    ]);
    const m = comboDebrief(c)!.tips.find((t) => t.id === 'missed')!;
    expect(m.slots).toEqual(['legs']);
  });
  it('une répartition régulière reçoit un constat positif, et SEULEMENT dans ce cas', () => {
    const even = combo([
      leg('push', 'a', 'Pompes', 6, [...sets(0, 2), ...sets(2, 2), ...sets(4, 2)]),
      leg('pull', 'b', 'Tractions', 6, [...sets(1, 2), ...sets(3, 2), ...sets(5, 2)]),
    ]);
    const t = comboDebrief(even)!.tips;
    expect(t.map((x) => x.id)).toEqual(['regular']);
    expect(t[0]!.tone).toBe('good');
    // 3 jours actifs (assez pour un constat positif) MAIS un pic : le conseil prime, pas de « bravo ».
    const bad = combo([
      leg('push', 'a', 'Pompes', 12, [...sets(0, 1), ...sets(3, 1), ...sets(6, 10)]),
    ]);
    expect(tips(bad)).toContain('peak');
    expect(tips(bad)).not.toContain('regular');
  });
  it('fenêtre de 3 jours : pas de conseils de durée longue (late, gap, singleDay, noRest)', () => {
    const c = combo([leg('push', 'a', 'Pompes', 6, [...sets(0, 2), ...sets(2, 4)])], 3);
    const ids = tips(c);
    for (const id of ['late', 'gap', 'singleDay', 'noRest'] as const) expect(ids).not.toContain(id);
  });
});

describe('ComboDebrief (composant)', () => {
  async function render(c: ComboChallenge) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp({ render: () => h(ComboDebrief, { combo: c }) });
    app.mount(el);
    await nextTick();
    return { el, done: () => app.unmount() };
  }
  it('montre la grille, le jour par jour et les conseils', async () => {
    const c = combo([
      leg('push', 'a', 'Pompes', 12, [...sets(0, 1), ...sets(4, 11)]),
      leg('pull', 'b', 'Tractions', 3, sets(1, 3)),
    ]);
    const r = await render(c);
    expect(r.el.querySelector('[data-test="combo-debrief"]')).not.toBeNull();
    expect(r.el.querySelectorAll('[data-test="db-grid"] .g-row').length).toBe(4); // en-tête + 2 groupes + total
    expect(r.el.querySelector('[data-test="db-active"]')?.textContent).toContain(
      '3/7 jours actifs',
    );
    const days = r.el.querySelectorAll('[data-test="db-days"] .day');
    expect(days.length).toBe(7);
    expect(days[4]!.textContent).toContain('Pompes ×11');
    expect(days[2]!.textContent).toContain('repos');
    expect(r.el.querySelector('[data-tip="peak"]')).not.toBeNull();
    r.done();
  });
  it('rien à raconter : aucun bloc', async () => {
    const r = await render(combo([leg('push', 'a', 'Pompes', 3, [])]));
    expect(r.el.querySelector('[data-test="combo-debrief"]')).toBeNull();
    r.done();
  });
});
