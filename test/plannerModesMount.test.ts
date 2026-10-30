// @vitest-environment happy-dom
//
// 🪄 Priorités du planificateur : on MONTE le vrai composable (`useExpeditionPlanner`) et le vrai
// composant (`ExpeditionPlanner`), puis on clique les tuiles dans un ordre donné — le câblage
// `toggleMode` ne se juge pas en lisant la source.
import { describe, expect, it, vi } from 'vitest';
import { computed, createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('quasar', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useQuasar: () => ({ notify: () => undefined }),
}));

async function mountReal(act: (host: HTMLElement) => Promise<void>, onHtml: (h: string) => void) {
  try {
    localStorage.clear();
  } catch {
    /* sans stockage */
  }
  const { useExpeditionPlanner } = await import('@/composables/useExpeditionPlanner');
  const { default: ExpeditionPlanner } = await import('@/components/ExpeditionPlanner.vue');
  const pinia = createPinia();
  setActivePinia(pinia);
  const R = <T>(v: T) => computed(() => v);
  const Host = defineComponent({
    setup() {
      const planner = useExpeditionPlanner({
        targets: ref([]),
        freeStable: ref([]),
        now: R(0),
        coarseNow: R(0),
        heroLevel: R(1),
        progressionLevel: R(1),
        fighter: R({}) as never,
        heroHealIn: R(0),
        outpostBuilt: R(true),
        travelMult: R(1),
        roadCtx: R({}) as never,
        base: R(null),
        cap: R(8),
        settleDueSiege: async () => undefined,
      });
      return () => h(ExpeditionPlanner, { planner, section: 'plan' });
    },
  });
  const app = createApp(Host);
  app.use(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)*', component: { render: () => null } }],
  });
  await router.replace('/');
  app.use(router);
  app.config.warnHandler = () => {};
  let err: unknown = null;
  app.config.errorHandler = (e) => (err = e);
  const host = document.createElement('div');
  app.mount(host);
  await nextTick();
  await act(host);
  onHtml(host.innerHTML);
  app.unmount();
  if (err) throw err;
}

/** Les badges lus sur les trois tuiles, dans l'ordre events / xp / rifts. */
const badges = (host: HTMLElement) =>
  ['events', 'xp', 'rifts'].map(
    (m) => host.querySelector(`[data-test="mode-${m}"] .pm-rank`)?.textContent?.trim() ?? '',
  );
const tap = async (host: HTMLElement, m: string) => {
  (host.querySelector(`[data-test="mode-${m}"]`) as HTMLElement).click();
  await nextTick();
};

describe('priorités : le vrai composant, tuile par tuile', { timeout: 60000 }, () => {
  it('failles, lieux, xp → ①②③ dans l’ordre cliqué ; retrait : les suivants remontent', async () => {
    const seen: string[][] = [];
    await mountReal(
      async (host) => {
        seen.push(badges(host)); // défaut : Lieux seul
        await tap(host, 'rifts');
        await tap(host, 'events'); // retire « Lieux » (1re), « Failles » reste
        seen.push(badges(host));
        await tap(host, 'events'); // le remet en fin de liste
        await tap(host, 'xp');
        seen.push(badges(host));
        await tap(host, 'rifts'); // retire « Failles » (1re) : ② devient ①, ③ devient ②
        seen.push(badges(host));
        await tap(host, 'events');
        await tap(host, 'xp'); // la dernière : refusée
        seen.push(badges(host));
      },
      () => undefined,
    );
    expect(seen[0]).toEqual(['①', '', '']);
    expect(seen[1]).toEqual(['', '', '①']);
    expect(seen[2]).toEqual(['②', '③', '①']);
    expect(seen[3]).toEqual(['①', '②', '']);
    expect(seen[4]).toEqual(['', '①', '']); // xp resté : on ne retire pas la dernière
  });

  it('un seul mode sans consommable : tuile « Lieux », pas de pastille ; la préférence est écrite en liste', async () => {
    let html = '';
    let saved: string | null = null;
    await mountReal(
      async (host) => {
        await tap(host, 'rifts');
        await nextTick();
        saved = localStorage.getItem('muscu:planner:mode');
      },
      (h) => (html = h),
    );
    expect(html).toContain('Lieux');
    expect(html).not.toContain('Événements');
    expect(saved).toBe('events,rifts');
  });
});
