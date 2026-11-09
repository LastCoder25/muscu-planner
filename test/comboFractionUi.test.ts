// @vitest-environment happy-dom
//
// 🔁 Le store (saisie des prises, plafond) et le composant « +1 » du mode fractionné.
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ComboFractionRow from '@/components/ComboFractionRow.vue';
import { useComboStore } from '@/stores/combo';
import { legDone, type ComboChallenge, type ComboLeg } from '@/lib/combo';

const DAY = '2099-01-02';
function leg(over: Partial<ComboLeg> = {}): ComboLeg {
  return {
    slot: 'pull',
    exercise_id: 'ex_pullup',
    exercise_name: 'Tractions',
    rep_weight: 1,
    target: 5,
    count_mode: 'reps',
    fractional: true,
    rep_min: 8,
    rep_max: 12,
    sets: [],
    ...over,
  } as ComboLeg;
}
function seed(legs: ComboLeg[]) {
  const store = useComboStore();
  store.list = [
    {
      id: 'c1',
      name: 'Défi 360',
      status: 'active',
      start_date: '2099-01-01',
      duration_days: 7,
      legs,
    } as unknown as ComboChallenge as never,
  ];
  return store;
}

describe('🔁 store : saisie d’une prise', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('une prise est une mini-série horodatée', () => {
    const store = seed([leg()]);
    store.addSet('c1', 'ex_pullup', DAY, 1, null, false, null, undefined, true);
    const s = store.list[0]!.legs[0]!.sets![0]!;
    expect(s).toMatchObject({ reps: 1, mini: true });
    expect(typeof s.at).toBe('string');
  });
  it('une série saisie normalement n’est PAS une mini-série', () => {
    const store = seed([leg()]);
    store.addSet('c1', 'ex_pullup', DAY, 3, null);
    expect(store.list[0]!.legs[0]!.sets![0]!.mini).toBeUndefined();
  });
  it('un exo fractionné n’est jamais fermé par son objectif : les reps en plus sont notées', () => {
    const store = seed([leg({ target: 5 })]);
    for (let i = 0; i < 8; i++)
      store.addSet('c1', 'ex_pullup', DAY, 1, null, false, null, undefined, true);
    expect(legDone(store.list[0]!.legs[0]!)).toBe(8);
  });
  it('un exo NON fractionné reste fermé à l’objectif (règle v1.53 inchangée)', () => {
    const store = seed([leg({ target: 5, fractional: false })]);
    for (let i = 0; i < 8; i++) store.addSet('c1', 'ex_pullup', DAY, 1, null);
    expect(legDone(store.list[0]!.legs[0]!)).toBe(5);
  });
});

async function mountRow(l: ComboLeg, events: { add: number[]; undo: number }) {
  const app = createApp({
    render: () =>
      h(ComboFractionRow, {
        leg: l,
        day: DAY,
        onAdd: (n: number) => events.add.push(n),
        onUndo: () => events.undo++,
      }),
  });
  const host = document.createElement('div');
  app.mount(host);
  await nextTick();
  return { host, unmount: () => app.unmount() };
}

describe('🔁 composant « +1 »', () => {
  it('+1 / +2 / +3 émettent la prise ; le compteur du jour et l’annulation suivent', async () => {
    const ev = { add: [] as number[], undo: 0 };
    const l = leg({
      sets: [
        { date: DAY, reps: 1, mini: true },
        { date: DAY, reps: 2, mini: true },
        { date: DAY, reps: 4 },
        { date: '2099-01-01', reps: 9, mini: true },
      ],
    });
    const { host, unmount } = await mountRow(l, ev);
    const btns = [...host.querySelectorAll('button')];
    btns.find((b) => b.textContent?.includes('+1'))!.click();
    btns.find((b) => b.textContent?.trim() === '+2')!.click();
    btns.find((b) => b.textContent?.trim() === '+3')!.click();
    expect(ev.add).toEqual([1, 2, 3]);
    expect(host.textContent).toContain('7 reps aujourd’hui'); // 1 + 2 + 4, pas la veille
    expect(host.textContent).toContain('2 prises');
    const undo = btns.find((b) => b.textContent?.includes('Annuler'))!;
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(ev.undo).toBe(1);
    unmount();
  });
  it('rien à annuler : le bouton est grisé ; au-delà de l’objectif, la pastille le dit', async () => {
    const ev = { add: [] as number[], undo: 0 };
    const { host, unmount } = await mountRow(
      leg({ target: 5, sets: [{ date: DAY, reps: 8 }] }),
      ev,
    );
    const undo = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Annuler'),
    )!;
    expect(undo.disabled).toBe(true);
    expect(host.textContent).toContain('+3 au-delà');
    unmount();
  });
});
