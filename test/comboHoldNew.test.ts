// @vitest-environment happy-dom
//
// ⏱️ Création du Défi 360 : la bascule « Durée | Séries » d'un exo AU TEMPS, au bilan (mode « par
// exercice » seulement), et les jambes envoyées au lancement. Même harnais que `comboNewGroup`
// (`quasar` simulé, rendu CLIENT). ⚠️ Pas de SSR : les `watch` y sont inertes.
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('quasar', () => ({ useQuasar: () => ({ notify: vi.fn(), dialog: vi.fn() }) }));

const ex = (id: string, name: string, muscle: string, unit = 'reps') => ({
  id,
  name,
  muscle_primary: muscle,
  muscle_secondary: [],
  equipment: [],
  equipment_required: [],
  difficulty: 1,
  unit,
  tags: [],
  category: 'muscu',
  retired: false,
});
const LIB = [
  ex('bench', 'Développé couché', 'pectoraux'),
  ex('pushup', 'Pompes', 'pectoraux'),
  ex('row', 'Rowing', 'dos'),
  ex('pullup', 'Tractions', 'dos'),
  ex('ex_plank', 'Planche', 'abdominaux', 'time'),
  ex('ex_side_plank', 'Gainage latéral', 'abdominaux', 'time'),
];

async function run(
  act: (host: HTMLElement, created: { input: any }) => Promise<void>,
  seed: { combo?: unknown; query?: string } = {},
) {
  localStorage.clear();
  const pinia = createPinia();
  setActivePinia(pinia);
  const { default: ComboNewPage } = await import('@/pages/ComboNewPage.vue');
  const { useAuthStore } = await import('@/stores/auth');
  const { useProfileStore } = await import('@/stores/profile');
  const { useLibraryStore } = await import('@/stores/library');
  const { useComboStore } = await import('@/stores/combo');
  const { useChallengesStore } = await import('@/stores/challenges');
  const { useLogsStore } = await import('@/stores/logs');
  (useAuthStore() as any).user = { id: 'me' };
  (useProfileStore() as any).profile = {
    experience: { level: 'intermediaire' },
    objective: 'hypertrophie',
    available_equipment: [],
    sports: [],
    favorite_exercises: [],
  };
  (useLibraryStore() as any).fetchAll = async () => LIB;
  const created = { input: null as any };
  const cs = useComboStore() as any;
  cs.list = seed.combo ? [seed.combo] : [];
  cs.fetchMine = async () => [];
  cs.create = async (input: unknown) => {
    created.input = input;
    return { id: 'new' };
  };
  const ch = useChallengesStore() as any;
  ch.list = [];
  ch.fetchMine = async () => [];
  (useLogsStore() as any).fetchAll = async () => undefined;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)*', component: { render: () => null } }],
  });
  await router.replace('/' + (seed.query ?? ''));
  await router.isReady();
  const app = createApp({ render: () => h(ComboNewPage) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  let err: unknown = null;
  app.config.errorHandler = (e) => (err = e);
  const host = document.createElement('div');
  app.mount(host);
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 5));
  await nextTick();
  await act(host, created);
  app.unmount();
  return { host, created, err };
}
const tick = async () => {
  await nextTick();
  await new Promise((r) => setTimeout(r, 5));
  await nextTick();
};
const click = async (host: HTMLElement, sel: string) => {
  const el = host.querySelector(sel) as HTMLElement | null;
  expect(el, sel).not.toBeNull();
  el!.click();
  await tick();
};
async function toRecap(host: HTMLElement) {
  await click(host, '.foot-cta');
  for (let i = 0; i < 12 && !host.querySelector('.slot-card'); i++)
    await click(host, '.draft-foot q-btn');
}
const legOf = (input: any, id: string) => input.legs.find((l: any) => l.exercise_id === id);
const pressed = (h: HTMLElement, sel: string) => h.querySelector(sel)!.getAttribute('aria-pressed');

describe('⏱️ création : la bascule « Durée | Séries » des exos au temps', () => {
  it('au bilan, seulement sous un groupe qui a un exo au temps ; « Durée » au départ', async () => {
    const { err } = await run(async (h) => {
      await toRecap(h);
      expect(h.querySelector('[data-test="holds-core"]')).not.toBeNull();
      expect(h.querySelector('[data-test="holds-push"]')).toBeNull();
      expect(h.querySelector('[data-test="holds-pull"]')).toBeNull();
      expect(pressed(h, '[data-test="hold-time-ex_plank"]')).toBe('true');
      expect(pressed(h, '[data-test="hold-sets-ex_plank"]')).toBe('false');
      // Les deux pastilles, par exo au temps du groupe.
      expect(h.querySelector('[data-test="hold-sets-ex_side_plank"]')).not.toBeNull();
    });
    expect(err).toBeNull();
  }, 90_000);

  it('rien choisi : comme avant (durée, objectif en secondes) et chaque exo au temps marqué `hold`', async () => {
    const { created, err } = await run(async (h) => {
      await toRecap(h);
      await click(h, '.foot-bar q-btn');
    });
    expect(err).toBeNull();
    const plank = legOf(created.input, 'ex_plank');
    expect(plank.count_mode).toBe('time');
    expect(plank.hold).toBe(true);
    expect(plank.target % 30).toBe(0); // des bulles de 30 s
    expect(plank.target).toBeGreaterThan(0);
    // Un exo en reps n'a ni `hold`, ni objectif en secondes.
    const bench = legOf(created.input, 'bench');
    expect('hold' in bench).toBe(false);
    expect(bench.count_mode).toBe('sets');
  }, 90_000);

  it('« Séries » : N tenues (la part, pas × 30), compté en séries, saisi en secondes', async () => {
    let share = 0;
    const { created, err } = await run(async (h) => {
      await toRecap(h);
      share = Number(h.querySelector('[data-test="share-ex_plank"]')?.textContent);
      await click(h, '[data-test="hold-sets-ex_plank"]');
      expect(pressed(h, '[data-test="hold-sets-ex_plank"]')).toBe('true');
      expect(pressed(h, '[data-test="hold-time-ex_plank"]')).toBe('false');
      // Changer d'unité ne touche ni la part ni le total du groupe.
      expect(Number(h.querySelector('[data-test="share-ex_plank"]')?.textContent)).toBe(share);
      await click(h, '.foot-bar q-btn');
    });
    expect(err).toBeNull();
    const plank = legOf(created.input, 'ex_plank');
    expect(plank.count_mode).toBe('sets');
    expect(plank.hold).toBe(true);
    expect(plank.target).toBe(share);
    expect(plank.weight_kg).toBeNull();
    // L'autre exo au temps du groupe, non touché, reste en durée.
    const side = legOf(created.input, 'ex_side_plank');
    expect(side.count_mode).toBe('time');
    expect(side.target).toBe(Number(side.target / 30) * 30);
  }, 90_000);

  it('le total du groupe est le même dans les deux unités ; on peut revenir à « Durée »', async () => {
    const { created, err } = await run(async (h) => {
      await toRecap(h);
      const total = h.querySelector('[data-test="split-total-core"]')?.textContent;
      await click(h, '[data-test="hold-sets-ex_plank"]');
      await click(h, '[data-test="hold-sets-ex_side_plank"]');
      expect(h.querySelector('[data-test="split-total-core"]')?.textContent).toBe(total);
      await click(h, '[data-test="hold-time-ex_plank"]');
      expect(pressed(h, '[data-test="hold-time-ex_plank"]')).toBe('true');
      await click(h, '.foot-bar q-btn');
    });
    expect(err).toBeNull();
    expect(legOf(created.input, 'ex_plank').count_mode).toBe('time');
    expect(legOf(created.input, 'ex_side_plank').count_mode).toBe('sets');
  }, 90_000);

  it('un emplacement compté en RÉPÉTITIONS : pas de bascule (sa part est un total de reps)', async () => {
    const { err } = await run(async (h) => {
      await toRecap(h);
      expect(h.querySelector('[data-test="holds-core"]')).not.toBeNull();
      const card = [...h.querySelectorAll<HTMLElement>('.slot-card')].find((c) =>
        c.textContent?.includes('Gainage'),
      )!;
      const reps = [...card.querySelectorAll<HTMLElement>('.mode-toggle button')].find((b) =>
        b.textContent?.includes('Répétitions'),
      )!;
      reps.click();
      await tick();
      expect(h.querySelector('[data-test="holds-core"]')).toBeNull();
    });
    expect(err).toBeNull();
  }, 90_000);

  it('mode par groupe : aucune bascule, et les jambes comme avant (une entrée = une série)', async () => {
    const { created, err } = await run(async (h) => {
      await click(h, '[data-test="mode-group"]');
      await toRecap(h);
      expect(h.querySelector('[data-test="holds-core"]')).toBeNull();
      expect(h.innerHTML).not.toContain('hold-sets-');
      await click(h, '.foot-bar q-btn');
    });
    expect(err).toBeNull();
    const plank = legOf(created.input, 'ex_plank');
    expect(plank.count_mode).toBe('time');
    expect(plank.target).toBe(0);
  }, 90_000);
});

describe('✏️ « Ajuster avant » : l’unité d’un exo au temps revient', () => {
  const last = (count_mode: 'sets' | 'time') => ({
    id: 'last',
    name: 'Défi 360',
    start_date: '2026-11-02',
    duration_days: 7,
    status: 'done',
    legs: [
      {
        slot: 'core',
        exercise_id: 'ex_plank',
        exercise_name: 'Planche',
        rep_weight: 0.6,
        target: count_mode === 'sets' ? 5 : 150,
        count_mode,
        hold: true,
        sets: [],
      },
    ],
  });
  it('un exo compté en séries reste en « Séries », avec sa part', async () => {
    const { created, err } = await run(
      async (h) => {
        expect(pressed(h, '[data-test="hold-sets-ex_plank"]')).toBe('true');
        await click(h, '.foot-bar q-btn');
      },
      { combo: last('sets'), query: '?repeat=last' },
    );
    expect(err).toBeNull();
    const plank = legOf(created.input, 'ex_plank');
    expect(plank.count_mode).toBe('sets');
    expect(plank.hold).toBe(true);
    expect(plank.target).toBe(5);
  }, 90_000);
  it('un exo compté en durée reste en « Durée » (150 s = 5 bulles)', async () => {
    const { created, err } = await run(
      async (h) => {
        expect(pressed(h, '[data-test="hold-time-ex_plank"]')).toBe('true');
        await click(h, '.foot-bar q-btn');
      },
      { combo: last('time'), query: '?repeat=last' },
    );
    expect(err).toBeNull();
    const plank = legOf(created.input, 'ex_plank');
    expect(plank.count_mode).toBe('time');
    expect(plank.target).toBe(150);
  }, 90_000);
});
