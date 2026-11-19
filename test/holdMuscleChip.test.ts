// @vitest-environment happy-dom
//
// 🎯 La pastille « muscle visé » des exos au temps (gainage, planche, chaise) : un nom comme
// « Gainage » ne dit pas si on travaille les abdos, les quadriceps ou les fessiers.
import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import HoldMuscleChip from '@/components/HoldMuscleChip.vue';
import ComboLegHead from '@/components/ComboLegHead.vue';
import { holdMuscleLabel } from '@/lib/muscles';
import type { ComboLeg } from '@/lib/combo';

async function render(comp: Parameters<typeof h>[0], props: Record<string, unknown>) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp({ render: () => h(comp, props) });
  app.use(createPinia());
  app.mount(el);
  await nextTick();
  return { el, done: () => app.unmount() };
}

describe('holdMuscleLabel', () => {
  it('le libellé du muscle, tel que partout dans l’app', () => {
    expect(holdMuscleLabel('abdominaux')).toBe('Abdos');
    expect(holdMuscleLabel('quadriceps')).toBe('Quadriceps');
    expect(holdMuscleLabel('fessiers')).toBe('Fessiers');
    expect(holdMuscleLabel('dos')).toBe('Dos');
  });
  it('rien sans muscle, ni pour le cardio (pas un muscle)', () => {
    expect(holdMuscleLabel(null)).toBe('');
    expect(holdMuscleLabel('')).toBe('');
    expect(holdMuscleLabel('cardio')).toBe('');
  });
});

describe('pastille HoldMuscleChip', () => {
  it('exo au temps : le muscle ; exo en reps : rien', async () => {
    const t = await render(HoldMuscleChip, { muscle: 'abdominaux', time: true });
    expect(t.el.querySelector('[data-test="hold-muscle"]')?.textContent).toBe('Abdos');
    t.done();
    const r = await render(HoldMuscleChip, { muscle: 'abdominaux', time: false });
    expect(r.el.querySelector('[data-test="hold-muscle"]')).toBeNull();
    r.done();
  });
});

describe('en-tête d’un exo du Défi 360', () => {
  const leg = (over: Partial<ComboLeg>): ComboLeg =>
    ({
      slot: 'core',
      exercise_id: 'ex_plank',
      exercise_name: 'Gainage',
      muscle_primary: 'abdominaux',
      rep_weight: 0.6,
      target: 240,
      count_mode: 'time',
      sets: [],
      ...over,
    }) as ComboLeg;
  it('la planche dit « Abdos », la chaise « Quadriceps »', async () => {
    const a = await render(ComboLegHead, { leg: leg({}) });
    expect(a.el.querySelector('[data-test="hold-muscle"]')?.textContent).toBe('Abdos');
    a.done();
    const b = await render(ComboLegHead, {
      leg: leg({ exercise_id: 'ex_wall_sit', exercise_name: 'Chaise', muscle_primary: 'quadriceps' }),
    });
    expect(b.el.querySelector('[data-test="hold-muscle"]')?.textContent).toBe('Quadriceps');
    b.done();
  });
  it('un exo en séries n’a pas de pastille', async () => {
    const c = await render(ComboLegHead, {
      leg: leg({
        exercise_id: 'ex_bench_barbell',
        exercise_name: 'Développé couché',
        muscle_primary: 'pectoraux',
        count_mode: 'sets',
        target: 6,
      }),
    });
    expect(c.el.querySelector('[data-test="hold-muscle"]')).toBeNull();
    c.done();
  });
});
