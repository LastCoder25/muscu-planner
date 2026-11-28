// @vitest-environment happy-dom
//
// 🚀 Départ automatique du planificateur : le VRAI composable, un calcul simulé qui rend une
// expédition. Case cochée → elle part au calcul fini (`sendParty` appelé) ; décochée → rien ne
// part, la proposition attend le clic.
// 🚀 Un lancement groupé : aucune liste, une écriture groupée, des heures distinctes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

const notify = vi.fn();
vi.mock('quasar', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useQuasar: () => ({ notify }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  notify.mockClear();
  trips = ['p1'];
});
/** Les lieux que le calcul simulé propose. */
let trips = ['p1'];
vi.mock('@/lib/expeditionPlanner', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  planInPasses: vi.fn(async () => ({
    trips: trips.map((id) => ({
      target: { id, type: 'mine', x: 1, y: 1, level: 1 },
      units: [{ id: '__hero', hero: true, origin: 'base', power: 10 }],
      win: 0.95,
      tripMin: 60,
      xp: 0,
      kit: [],
    })),
    tripModes: trips.map(() => 'events'),
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
  /** Chaque départ : le lot est-il ouvert, que montre l'écran, à quelle heure. */
  const seen: { grouped: boolean; listed: unknown; now: number }[] = [];
  let open = false;
  const sendParty = vi.fn(
    async (_u: string, poi: { id: string }, o: { now: number }): Promise<string | null> => {
      seen.push({ grouped: open, listed: planner.rows.value, now: o.now });
      return poi.id === refuse.id ? 'plus de place' : null;
    },
  );
  const refuse = { id: '' };
  const batches = { n: 0, fail: false };
  const fetchMine = vi.fn(async () => null);
  Object.assign(char as unknown as Record<string, unknown>, {
    sendParty,
    fetchMine,
    groupedWrites: async (run: () => Promise<void>) => {
      batches.n++;
      open = true;
      try {
        await run();
      } finally {
        open = false;
      }
      if (batches.fail) throw new Error('hors ligne');
    },
  });
  (useAuthStore() as unknown as { user: unknown }).user = { id: 'u1' };
  const R = <T>(v: T) => computed(() => v);
  let planner!: ReturnType<typeof useExpeditionPlanner>;
  const Host = defineComponent({
    setup() {
      planner = useExpeditionPlanner({
        targets: ref(trips.map((id) => ({ id, type: 'mine' }))) as never,
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
  return { planner, sendParty, app, seen, refuse, batches, fetchMine };
}

describe('planificateur : départ automatique', { timeout: 60000 }, () => {
  it('case cochée : le calcul fini, l’expédition part toute seule', async () => {
    const { planner, sendParty, app } = await setup(true);
    expect(planner.autoLaunch.value).toBe(true);
    await planner.compute();
    expect(sendParty).toHaveBeenCalledTimes(1);
    expect(planner.rows.value).toBeNull(); // aucune liste
    expect(planner.sentCount.value).toBe(1);
    app.unmount();
  });

  it('départ automatique : la liste ne s’affiche jamais, un seul lot, des heures distinctes', async () => {
    trips = ['p1', 'p2', 'p3'];
    // Trois départs dans la même milliseconde : le cas d'une fiche écrite en mémoire.
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { planner, app, seen, batches } = await setup(true);
    await planner.compute();
    expect(seen.map((x) => x.listed)).toEqual([null, null, null]);
    expect(seen.map((x) => x.grouped)).toEqual([true, true, true]);
    expect(batches.n).toBe(1);
    expect(seen.map((x) => x.now)).toEqual([1_000_000, 1_000_002, 1_000_004]);
    expect(planner.sentCount.value).toBe(3);
    expect(planner.sending.value).toBeNull();
    expect(planner.launching.value).toBeNull();
    app.unmount();
  });

  it('un départ refusé reste à l’écran, avec sa raison ; les autres sont partis', async () => {
    trips = ['p1', 'p2'];
    const { planner, app, refuse } = await setup(true);
    refuse.id = 'p2';
    await planner.compute();
    expect(planner.rows.value?.map((r) => r.poi.id)).toEqual(['p2']);
    expect(planner.sentCount.value).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![0].message).toContain('plus de place');
    app.unmount();
  });

  it('« Tout lancer » à la main passe aussi par un seul lot et vide la liste', async () => {
    trips = ['p1', 'p2'];
    const { planner, app, batches, seen } = await setup(false);
    await planner.compute();
    await planner.launchAll();
    expect(batches.n).toBe(1);
    expect(seen.map((x) => x.grouped)).toEqual([true, true]);
    expect(planner.rows.value).toBeNull();
    expect(planner.sentCount.value).toBe(2);
    app.unmount();
  });

  it('⚠️ enregistrement raté : on le dit, on relit la fiche, rien n’est annoncé parti', async () => {
    const { planner, app, batches, fetchMine } = await setup(true);
    batches.fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await planner.compute();
    expect(fetchMine).toHaveBeenCalledTimes(1);
    expect(planner.rows.value).toBeNull();
    expect(planner.sentCount.value).toBe(0);
    expect(planner.launching.value).toBeNull();
    expect(notify.mock.calls.map((c) => c[0].type)).toEqual(['negative']);
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

  it('tout le monde part : héros et garnisons toujours inclus, plus de réglage « Qui peut partir »', async () => {
    const { planner, app } = await setup(false);
    expect(planner.withHero.value).toBe(true);
    expect(planner.withGarrisons.value).toBe(true);
    // Une ancienne préférence « sans garnisons » n'a plus d'effet.
    expect(localStorage.getItem('muscu:planner:garrisons')).toBeNull();
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
