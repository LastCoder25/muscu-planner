// @vitest-environment happy-dom
//
// 🧩 Écran de création du Défi 360 : choix du mode, mode groupe de bout en bout, et répartition
// éditable (total du groupe fixe) en mode exo. Rendu CLIENT (pas de SSR : les `watch` y sont inertes).
// ⚠️ `quasar` est simulé : l'écran notifie après la création, et sans plugin `$q` est vide.
import { describe, it, expect, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('quasar', () => ({ useQuasar: () => ({ notify: vi.fn(), dialog: vi.fn() }) }));

const ex = (id: string, name: string, muscle: string) => ({
  id,
  name,
  muscle_primary: muscle,
  muscle_secondary: [],
  equipment: [],
  equipment_required: [],
  difficulty: 1,
  unit: 'reps',
  tags: [],
  category: 'muscu',
  retired: false,
});
const LIB = [
  ex('bench', 'Développé couché', 'pectoraux'),
  ex('pushup', 'Pompes', 'pectoraux'),
  ex('row', 'Rowing', 'dos'),
  ex('pullup', 'Tractions', 'dos'),
];

async function run(
  act: (host: HTMLElement, created: { input: any }) => Promise<void>,
  seed: { combo?: unknown; query?: string; level?: string } = {},
): Promise<{ host: HTMLElement; created: { input: any }; err: unknown }> {
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
    experience: { level: seed.level ?? 'intermediaire' },
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
/** Du réglage jusqu'au récap : « Choisir mes exercices », puis « Suivant » à chaque groupe. */
async function toRecap(host: HTMLElement) {
  await click(host, '.foot-cta');
  for (let i = 0; i < 12 && !host.querySelector('.slot-card'); i++)
    await click(host, '.draft-foot q-btn');
}

describe('création du Défi 360 : le choix du mode', () => {
  it('deux tuiles de mode, « par exercice » est celle du départ', async () => {
    const { host, err } = await run(async (h) => {
      expect(h.querySelector('[data-test="mode-exo"]')!.getAttribute('aria-pressed')).toBe('true');
      expect(h.querySelector('[data-test="mode-group"]')!.getAttribute('aria-pressed')).toBe(
        'false',
      );
    });
    expect(err).toBeNull();
    expect(host.innerHTML).toBe('');
  }, 30_000);

  it('mode exo (défaut) : AUCUNE config, cibles par exo comme avant', async () => {
    const { created, err } = await run(async (h) => {
      await click(h, '.cta-auto');
    });
    expect(err).toBeNull();
    const input = created.input;
    expect(input.config).toBeUndefined();
    expect(input.legs.length).toBeGreaterThan(1);
    expect(input.legs.every((l: any) => l.target > 0)).toBe(true);
  }, 30_000);

  it('mode groupe : config {mode, groups}, exos sans cible, en séries', async () => {
    const { created, err } = await run(async (h) => {
      await click(h, '[data-test="mode-group"]');
      await click(h, '.cta-auto');
    });
    expect(err).toBeNull();
    const input = created.input;
    expect(input.config.mode).toBe('group');
    const slots = input.config.groups.map((g: any) => g.slot);
    expect(slots).toContain('push');
    expect(slots).toContain('pull');
    expect(input.config.groups.every((g: any) => g.target >= 1)).toBe(true);
    expect(input.legs.length).toBeGreaterThan(1);
    expect(input.legs.every((l: any) => l.target === 0 && l.count_mode === 'sets')).toBe(true);
    // Chaque groupe de la config a au moins un exo au menu.
    for (const s of slots) expect(input.legs.some((l: any) => l.slot === s)).toBe(true);
  }, 30_000);
});

describe('récap : mode groupe', () => {
  it('pas de répartition par exo ni de bascule reps : le volume du groupe, modifiable', async () => {
    const { err } = await run(async (h) => {
      await click(h, '[data-test="mode-group"]');
      await toRecap(h);
      const html = h.innerHTML;
      expect(html).toContain('data-test="group-note-push"');
      expect(html).not.toContain('data-test="split-push"');
      expect(html).not.toContain('Répétitions');
    });
    expect(err).toBeNull();
  }, 30_000);
});

describe('récap : répartition éditable en mode exo (total du groupe fixe)', () => {
  const targets = (input: any, slot: string) =>
    Object.fromEntries(
      input.legs.filter((l: any) => l.slot === slot).map((l: any) => [l.exercise_id, l.target]),
    ) as Record<string, number>;

  it('sans toucher : partage égal, comme avant', async () => {
    let total = 0;
    const { created, err } = await run(async (h) => {
      await toRecap(h);
      total = Number(h.querySelector('[data-test="split-total-push"]')?.textContent);
      await click(h, '.foot-bar q-btn');
    });
    expect(err).toBeNull();
    const t = targets(created.input, 'push');
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(total);
    const [a, b] = Object.values(t);
    expect(Math.abs(a! - b!)).toBeLessThanOrEqual(1);
  }, 30_000);

  it('déplacer une série d’un exo à l’autre : la somme ne change pas, minimum 1', async () => {
    let total = 0;
    const { created, err } = await run(async (h) => {
      await toRecap(h);
      total = Number(h.querySelector('[data-test="split-total-push"]')?.textContent);
      // 4 déplacements vers « Pompes » : le donneur finit au plancher de 1, rien ne dépasse.
      for (let i = 0; i < 20; i++) await click(h, '[data-test="more-pushup"]');
      expect(Number(h.querySelector('[data-test="split-total-push"]')?.textContent)).toBe(total);
      await click(h, '.foot-bar q-btn');
    });
    expect(err).toBeNull();
    const t = targets(created.input, 'push');
    expect(t.bench).toBe(1);
    expect(t.pushup).toBe(total - 1);
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(total);
  }, 30_000);
});

describe('🧭 conseil de volume à la création (réglages et récap)', () => {
  const tile = async (host: HTMLElement, sel: string, text: string) => {
    const el = [...host.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent?.includes(text));
    expect(el, `${sel} « ${text} »`).toBeTruthy();
    el!.click();
    await tick();
  };
  const advice = (h: HTMLElement) => h.querySelector('[data-test="volume-advice"]');

  it('réglages : « zone de progression » au départ, « léger » au volume léger', async () => {
    const { err } = await run(async (h) => {
      expect(advice(h)?.className).toContain('ok');
      await tile(h, '.obj-tile', 'Léger');
      expect(advice(h)?.className).toContain('light');
      expect(advice(h)?.textContent).toContain('reprise');
    });
    expect(err).toBeNull();
  }, 30_000);

  it('réglages : gros volume sur 3 jours → « soutenu » ou plus et la durée est dite ; il suit le volume en direct', async () => {
    const { err } = await run(async (h) => {
      await tile(h, '.obj-tile', 'Intense');
      await tile(h, '.dur-tile', '3 j');
      expect(advice(h)?.className).toMatch(/high|veryHigh/);
      expect(advice(h)?.textContent).toContain('Sur 3 jours');
      await tile(h, '.obj-tile', 'Léger');
      expect(advice(h)?.className).toContain('light');
      expect(advice(h)?.textContent).not.toContain('Sur 3 jours');
    });
    expect(err).toBeNull();
  }, 30_000);

  it('récap : passer tous les groupes en répétitions ne fait pas exploser le conseil (il lit des séries, pas des reps)', async () => {
    const { err } = await run(async (h) => {
      await toRecap(h);
      const before = advice(h)?.className;
      for (const b of [...h.querySelectorAll<HTMLElement>('.mode-toggle button')].filter((x) =>
        x.textContent?.includes('Répétitions'),
      ))
        b.click();
      await tick();
      expect(advice(h)?.className).toBe(before);
    });
    expect(err).toBeNull();
  }, 30_000);

  it('récap : le conseil est en tête et suit la répartition finale', async () => {
    const { err } = await run(async (h) => {
      await toRecap(h);
      expect(advice(h)).not.toBeNull();
      expect(h.innerHTML.indexOf('volume-advice')).toBeLessThan(h.innerHTML.indexOf('slot-card'));
    });
    expect(err).toBeNull();
  }, 30_000);
});

describe('✏️ « Ajuster avant » : l’écran de création rouvert sur le dernier défi', () => {
  const last = (over: Record<string, unknown> = {}) => ({
    id: 'last',
    name: 'Défi 360',
    start_date: '2026-11-02',
    duration_days: 5,
    status: 'done',
    legs: [
      { slot: 'push', exercise_id: 'bench', exercise_name: 'Développé couché', rep_weight: 1, target: 5, count_mode: 'sets', sets: [] },
      { slot: 'push', exercise_id: 'pushup', exercise_name: 'Pompes', rep_weight: 1, target: 2, count_mode: 'sets', sets: [] },
      { slot: 'pull', exercise_id: 'row', exercise_name: 'Rowing', rep_weight: 1, target: 4, count_mode: 'sets', sets: [] },
    ],
    ...over,
  });
  async function runRepeat(
    lastCombo: unknown,
    query: string,
    act: (host: HTMLElement, created: { input: any }) => Promise<void>,
  ) {
    // Niveau « avancé » : différent du niveau de départ de l'écran, donc les réglages CHANGENT au
    // chargement et relancent le plan — c'est précisément ce que `keepRepeat` doit empêcher.
    return run(async (h, c) => act(h, c), { combo: lastCombo, query, level: 'avance' });
  }

  it('ouvre le bilan avec les exos, la répartition et la durée du dernier défi, puis lance tel quel', async () => {
    const { logicalToday } = await import('@/lib/challenges');
    const { addDaysUtcIso } = await import('@/lib/startDate');
    const tomorrow = addDaysUtcIso(logicalToday(), 1);
    const { created, err } = await runRepeat(last(), '?repeat=last&start=' + tomorrow, async (h, c) => {
      expect(h.querySelector('.slot-card')).not.toBeNull(); // on est au bilan
      expect(h.querySelector('[data-test="split-total-push"]')?.textContent).toBe('7');
      await click(h, '.foot-bar q-btn');
      expect(c.input).not.toBeNull();
    });
    expect(err).toBeNull();
    const input = created.input;
    expect(input.duration_days).toBe(5);
    expect(input.start_date).toBe(tomorrow); // la date choisie sur la carte suit
    const t = Object.fromEntries(input.legs.map((l: any) => [l.exercise_id, l.target]));
    expect(t).toEqual({ bench: 5, pushup: 2, row: 4 }); // la répartition 5/2 est gardée, pas 4/3
  }, 30_000);

  it('la répartition reste modifiable au bilan (total du groupe fixe)', async () => {
    const { created, err } = await runRepeat(last(), '?repeat=last', async (h) => {
      await click(h, '[data-test="more-pushup"]');
      expect(h.querySelector('[data-test="split-total-push"]')?.textContent).toBe('7');
      await click(h, '.foot-bar q-btn');
    });
    expect(err).toBeNull();
    const t = Object.fromEntries(created.input.legs.map((l: any) => [l.exercise_id, l.target]));
    expect(t.bench! + t.pushup!).toBe(7);
    expect(t.pushup).toBe(3);
  }, 30_000);

  it('un défi par groupe se rouvre en mode groupe, cibles de groupe comprises', async () => {
    const g = last({
      legs: [
        { slot: 'push', exercise_id: 'bench', exercise_name: 'Développé couché', rep_weight: 1, target: 0, count_mode: 'sets', sets: [] },
        { slot: 'pull', exercise_id: 'row', exercise_name: 'Rowing', rep_weight: 1, target: 0, count_mode: 'sets', sets: [] },
      ],
      config: { mode: 'group', groups: [{ slot: 'push', target: 9 }, { slot: 'pull', target: 6 }] },
    });
    const { created, err } = await runRepeat(g, '?repeat=last', async (h) => {
      expect(h.querySelector('[data-test="group-note-push"]')).not.toBeNull();
      await click(h, '.foot-bar q-btn');
    });
    expect(err).toBeNull();
    expect(created.input.config.mode).toBe('group');
    expect(created.input.config.groups).toEqual([
      { slot: 'push', target: 9 },
      { slot: 'pull', target: 6 },
    ]);
  }, 30_000);

  it('sans paramètre, l’écran s’ouvre aux réglages comme avant', async () => {
    const { err } = await run(async (h) => {
      expect(h.querySelector('.slot-card')).toBeNull();
      expect(h.querySelector('[data-test="mode-exo"]')).not.toBeNull();
    });
    expect(err).toBeNull();
  }, 30_000);
});
