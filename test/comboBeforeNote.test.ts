// @vitest-environment happy-dom
//
// ↩ En-tête d'un exo du 360 : la mention « Avant le changement : 2 séries · 40 s · 40 s » (v1.367.0).
import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import ComboLegHead from '@/components/ComboLegHead.vue';
import type { ComboLeg } from '@/lib/combo';

async function render(props: Record<string, unknown>) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp({ render: () => h(ComboLegHead, props) });
  app.use(createPinia());
  app.mount(el);
  await nextTick();
  return { el, done: () => app.unmount() };
}
const S = (reps: number, over: Record<string, unknown> = {}) => ({ date: '2099-01-05', reps, weight: null, ...over });
const leg = (over: Partial<ComboLeg>): ComboLeg =>
  ({
    slot: 'core',
    exercise_id: 'ex_plank',
    exercise_name: 'Gainage',
    muscle_primary: 'abdominaux',
    rep_weight: 0.6,
    target: 170,
    count_mode: 'time',
    hold: true,
    sets: [],
    ...over,
  }) as ComboLeg;

describe('mention « avant le changement »', () => {
  it('une tenue passée en durée : les 2 séries d’avant, avec leurs secondes', async () => {
    const r = await render({ leg: leg({ sets: [S(40, { before: true }), S(40, { before: true }), S(30)] }) });
    const t = r.el.querySelector('[data-test="lh-before"]')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(t).toBe('↩ Avant le changement : 2 séries · 40 s · 40 s');
    r.done();
  });
  it('un exo en reps : les reps, sans « s »', async () => {
    const r = await render({
      leg: leg({ exercise_id: 'ex_pushup', exercise_name: 'Pompes', hold: undefined, count_mode: 'reps', sets: [S(12, { before: true })] }),
    });
    expect(r.el.querySelector('[data-test="lh-before"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '↩ Avant le changement : 1 série · 12',
    );
    r.done();
  });
  it('rien sans série d’avant ; au plus 6 séries listées puis « +N »', async () => {
    const none = await render({ leg: leg({ sets: [S(40)] }) });
    expect(none.el.querySelector('[data-test="lh-before"]')).toBeNull();
    none.done();
    const many = await render({ leg: leg({ sets: Array.from({ length: 8 }, (_, i) => S(30 + i, { before: true })) }) });
    const t = many.el.querySelector('[data-test="lh-before"]')?.textContent ?? '';
    expect(t).toContain('8 séries');
    expect(t).toContain('+2');
    many.done();
  });
});
