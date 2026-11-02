// @vitest-environment happy-dom
//
// 🚀 Départ automatique du planificateur : le VRAI composable, un calcul simulé qui rend une
// expédition. Case cochée → elle part au calcul fini (`sendParty` appelé) ; décochée → rien ne
// part, la proposition attend le clic.
import { describe, expect, it, vi } from 'vitest';
import { computed, createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('quasar', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useQuasar: () => ({ notify: () => undefined }),
}));
vi.mock('@/lib/expeditionPlanner', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  planInPasses: vi.fn(async () => ({
    trips: [
      {
        target: { id: 'p1', type: 'mine', x: 1, y: 1, level: 1 },
        units: [{ id: '__hero', hero: true, origin: 'base', power: 10 }],
        win: 0.95,
        tripMin: 60,
        xp: 0,
        kit: [],
      },
    ],
    tripModes: ['events'],
    unreachable: [],
  })),
}));

async function setup(auto: boolean) {
  localStorage.clear();
  if (auto) localStorage.setItem('muscu:planner:autolaunch', '1');
  const { useExpeditionPlanner } = await import('@/composables/useExpeditionPlanner');
  const { useCharacterStore } = await import('@/stores/character');
  const { useAuthStore } = await import('@/stores/auth');
  const pinia = createPinia();
  setActivePinia(pinia);
  const char = useCharacterStore();
  const sendParty = vi.fn(async () => null);
  (char as unknown as { sendParty: unknown }).sendParty = sendParty;
  (char as unknown as { recordWave: unknown }).recordWave = vi.fn(async () => undefined);
  (useAuthStore() as unknown as { user: unknown }).user = { id: 'u1' };
  const R = <T>(v: T) => computed(() => v);
  let planner!: ReturnType<typeof useExpeditionPlanner>;
  const Host = defineComponent({
    setup() {
      planner = useExpeditionPlanner({
        targets: ref([{ id: 'p1', type: 'mine' }]) as never,
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
      return () => h('div');
    },
  });
  const app = createApp(Host);
  app.use(pinia);
  app.mount(document.createElement('div'));
  await nextTick();
  return { planner, sendParty, app };
}

describe('planificateur : départ automatique', { timeout: 60000 }, () => {
  it('case cochée : le calcul fini, l’expédition part toute seule', async () => {
    const { planner, sendParty, app } = await setup(true);
    expect(planner.autoLaunch.value).toBe(true);
    await planner.compute();
    expect(sendParty).toHaveBeenCalledTimes(1);
    expect(planner.rows.value).toEqual([]); // partie : plus dans la liste
    app.unmount();
  });

  it('⚠️ case décochée (défaut) : rien ne part, la proposition attend', async () => {
    const { planner, sendParty, app } = await setup(false);
    expect(planner.autoLaunch.value).toBe(false);
    await planner.compute();
    expect(sendParty).not.toHaveBeenCalled();
    expect(planner.rows.value).toHaveLength(1);
    app.unmount();
  });

  it('la préférence est mémorisée', async () => {
    const { planner, app } = await setup(false);
    planner.autoLaunch.value = true;
    await nextTick();
    expect(localStorage.getItem('muscu:planner:autolaunch')).toBe('1');
    planner.autoLaunch.value = false;
    await nextTick();
    expect(localStorage.getItem('muscu:planner:autolaunch')).toBe('0');
    app.unmount();
  });
});
