// @vitest-environment happy-dom
//
// 🔁 Le composant « +1 », la fiche d'un défi Découverte, et le 360 hérité de la v1.312.0
// (le fractionné y a été retiré : le store ne laisse plus passer de reps au-delà de l'objectif).
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import FractionRow from '@/components/FractionRow.vue';
import OpenChallengeView from '@/components/OpenChallengeView.vue';
import { useComboStore } from '@/stores/combo';
import { legDone, type ComboChallenge, type ComboLeg } from '@/lib/combo';
import { logicalToday, type Challenge } from '@/lib/challenges';

function legacyLeg(over: Partial<ComboLeg> = {}): ComboLeg {
  return {
    slot: 'pull',
    exercise_id: 'ex_pullup',
    exercise_name: 'Tractions',
    rep_weight: 1,
    target: 5,
    count_mode: 'reps',
    fractional: true, // posé par la v1.312.0 — lu, jamais écrit
    rep_min: 8,
    rep_max: 12,
    sets: [],
    ...over,
  } as ComboLeg;
}

describe('360 hérité de la v1.312.0 : le fractionné y est retiré', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('un exo marqué fractionné est fermé à son objectif, comme tous les autres', () => {
    const store = useComboStore();
    store.list = [
      {
        id: 'c1',
        name: 'Défi 360',
        status: 'active',
        start_date: '2099-01-01',
        duration_days: 7,
        legs: [legacyLeg({ target: 5 })],
      } as unknown as ComboChallenge as never,
    ];
    for (let i = 0; i < 8; i++) store.addSet('c1', 'ex_pullup', '2099-01-02', 1, null);
    expect(legDone(store.list[0]!.legs[0]!)).toBe(5);
  });
  it('les mini-séries déjà écrites se lisent : l’exo s’ouvre, son avancement est juste', () => {
    const l = legacyLeg({
      sets: [
        { date: '2099-01-02', reps: 1, mini: true },
        { date: '2099-01-02', reps: 2, mini: true },
      ],
    });
    expect(legDone(l)).toBe(3);
  });
});

async function mount(comp: Parameters<typeof h>[0], props: Record<string, unknown>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const app = createApp({ render: () => h(comp, props) });
  app.use(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)*', component: { render: () => null } }],
  });
  app.use(router);
  app.config.warnHandler = () => {};
  const host = document.createElement('div');
  app.mount(host);
  await nextTick();
  return { host, unmount: () => app.unmount() };
}

describe('🔁 composant « +1 »', () => {
  it('+1 / +2 / +3 émettent la prise ; le compteur du jour et l’annulation suivent', async () => {
    const ev = { add: [] as number[], undo: 0 };
    const { host, unmount } = await mount(FractionRow, {
      name: 'Tractions',
      reps: 7,
      takes: 2,
      onAdd: (n: number) => ev.add.push(n),
      onUndo: () => ev.undo++,
    });
    const btns = [...host.querySelectorAll('button')];
    btns.find((b) => b.textContent?.includes('+1'))!.click();
    btns.find((b) => b.textContent?.trim() === '+2')!.click();
    btns.find((b) => b.textContent?.trim() === '+3')!.click();
    expect(ev.add).toEqual([1, 2, 3]);
    expect(host.textContent).toContain('7 reps aujourd’hui');
    expect(host.textContent).toContain('2 prises');
    const undo = btns.find((b) => b.textContent?.includes('Annuler'))!;
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(ev.undo).toBe(1);
    unmount();
  });
  it('rien à annuler : le bouton est grisé', async () => {
    const { host, unmount } = await mount(FractionRow, { name: 'x', reps: 0, takes: 0 });
    const undo = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Annuler'),
    )!;
    expect(undo.disabled).toBe(true);
    unmount();
  });
});

function openChallenge(over: Partial<Challenge> = {}): Challenge {
  const today = logicalToday();
  return {
    id: 'c1',
    exercise_id: 'ex_pullup',
    exercise_name: 'Tractions',
    rep_weight: 1.3,
    unit: 'reps',
    format: 'open',
    duration_days: 7,
    start_date: today,
    config: { start: 0 },
    daily_targets: [0, 0, 0, 0, 0, 0, 0],
    progress: [
      {
        day: 0,
        date: today,
        target: 0,
        done: 3,
        elapsed_sec: 0,
        completed: false,
        sets: [
          { reps: 1, mini: true, at: new Date().toISOString() },
          { reps: 2, mini: true, at: new Date().toISOString() },
        ],
      },
    ],
    status: 'active',
    ...over,
  } as Challenge;
}

describe('🔁 fiche d’un défi Découverte', () => {
  it('en cours : la saisie, le compteur du jour — et rien sur un objectif, un retard ou un échec', async () => {
    const { host, unmount } = await mount(OpenChallengeView, { ch: openChallenge() });
    const text = host.textContent ?? '';
    expect(text).toContain('Découverte');
    expect(text).toContain('3 reps aujourd’hui');
    expect(text).toContain('2 prises');
    expect(text).not.toMatch(/retard|raté|échec|0\/0|objectif atteint/i);
    expect(text).not.toContain('Bilan de ta semaine');
    unmount();
  });
  it('terminé : le bilan et « Relever un défi » (total +10 %, au moins une rep de plus)', async () => {
    const { host, unmount } = await mount(OpenChallengeView, {
      ch: openChallenge({ status: 'done' }),
    });
    const text = host.textContent ?? '';
    expect(text).toContain('Bilan de ta semaine');
    expect(text).toContain('Heure de pointe');
    expect(text).toContain('Relever un défi');
    expect(text).toContain('4 reps');
    expect(host.querySelector('.hbars')).toBeTruthy();
    unmount();
  });
});
