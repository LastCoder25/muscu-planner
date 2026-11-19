// @vitest-environment happy-dom
//
// 🧱 Lest d'une tenue du Défi 360 (planche, chaise) : choisi dans la fiche, il part avec la série
// (chrono ou ajout rapide), se mémorise, s'affiche — et n'entre NI dans le tonnage NI dans l'XP.
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import HoldLestStepper from '@/components/HoldLestStepper.vue';
import { useComboStore } from '@/stores/combo';
import {
  HOLD_LEST_MAX,
  comboXpPoints,
  holdLestLabel,
  legHoldLest,
  legHoldLoadable,
  type ComboChallenge,
  type ComboLeg,
} from '@/lib/combo';
import { comboLogEntries } from '@/lib/volume';

const D = '2099-01-02';
function hold(id: string, over: Partial<ComboLeg> = {}): ComboLeg {
  return {
    slot: 'core',
    exercise_id: id,
    exercise_name: id === 'ex_wall_sit' ? 'Chaise' : 'Gainage',
    rep_weight: 0.6,
    target: 240,
    count_mode: 'time',
    sets: [],
    ...over,
  } as ComboLeg;
}
const combo = (legs: ComboLeg[]) =>
  ({
    id: 'c1',
    name: '360',
    status: 'active',
    start_date: D,
    duration_days: 7,
    legs,
  }) as unknown as ComboChallenge;

describe('🧱 qui accepte un lest', () => {
  it('la planche et la chaise en mode durée — pas le gainage latéral, pas un exo en reps', () => {
    expect(legHoldLoadable(hold('ex_plank'))).toBe(true);
    expect(legHoldLoadable(hold('ex_wall_sit'))).toBe(true);
    expect(legHoldLoadable(hold('ex_glute_bridge_hold'))).toBe(true);
    expect(legHoldLoadable(hold('ex_superman_hold'))).toBe(false);
    expect(legHoldLoadable(hold('ex_side_plank'))).toBe(false);
    expect(legHoldLoadable(hold('ex_plank', { count_mode: 'sets' }))).toBe(false);
  });
  it('le lest proposé : dernière série lestée, sinon dernier choisi, sinon 0', () => {
    expect(legHoldLest(hold('ex_plank'))).toBe(0);
    expect(legHoldLest(hold('ex_plank', { lest_kg: 5 }))).toBe(5);
    expect(
      legHoldLest(hold('ex_plank', { lest_kg: 5, sets: [{ date: D, reps: 40, lest: 10 }] })),
    ).toBe(10);
    expect(legHoldLest(hold('ex_side_plank', { lest_kg: 5 }))).toBe(0);
  });
  it('l’étiquette : « +10 kg », vide sans lest', () => {
    expect(holdLestLabel({ lest: 10 })).toBe('+10 kg');
    expect(holdLestLabel({ lest: 2.5 })).toBe('+2,5 kg');
    expect(holdLestLabel({})).toBe('');
  });
});

describe('🧱 le store', () => {
  beforeEach(() => setActivePinia(createPinia()));
  const setup = () => {
    const store = useComboStore();
    store.list = [combo([hold('ex_plank'), hold('ex_side_plank')])] as never;
    return store;
  };
  it('une série lestée garde son lest et le mémorise ; le poids reste vide', () => {
    const store = setup();
    store.addSet('c1', 'ex_plank', D, 45, null, false, null, undefined, 10);
    const l = store.list[0]!.legs[0]!;
    expect(l.sets![0]).toMatchObject({ reps: 45, lest: 10 });
    expect(l.sets![0]!.weight).toBeNull();
    expect(l.lest_kg).toBe(10);
  });
  it('sur un exo non lestable, le lest est ignoré', () => {
    const store = setup();
    store.addSet('c1', 'ex_side_plank', D, 30, null, false, null, undefined, 10);
    expect(store.list[0]!.legs[1]!.sets![0]!.lest).toBeUndefined();
    expect(store.list[0]!.legs[1]!.lest_kg).toBeUndefined();
  });
  it('setHoldLest : borné [0, max], sans effet sur un exo non lestable', () => {
    const store = setup();
    store.setHoldLest('c1', 'ex_plank', 7.5);
    expect(store.list[0]!.legs[0]!.lest_kg).toBe(7.5);
    store.setHoldLest('c1', 'ex_plank', 9999);
    expect(store.list[0]!.legs[0]!.lest_kg).toBe(HOLD_LEST_MAX);
    store.setHoldLest('c1', 'ex_plank', -4);
    expect(store.list[0]!.legs[0]!.lest_kg).toBe(0);
    store.setHoldLest('c1', 'ex_side_plank', 5);
    expect(store.list[0]!.legs[1]!.lest_kg).toBeUndefined();
  });
});

describe('🧱 aucune XP ni tonnage pour le lest', () => {
  it('même XP et même tonnage avec ou sans lest', () => {
    const plain = combo([hold('ex_plank', { sets: [{ date: D, reps: 60 }] })]);
    const loaded = combo([hold('ex_plank', { sets: [{ date: D, reps: 60, lest: 20 }] })]);
    expect(comboXpPoints([loaded], 80)).toBe(comboXpPoints([plain], 80));
    const ton = (c: ComboChallenge) =>
      comboLogEntries([c]).reduce(
        (a, e) =>
          a +
          (e.log.exercises ?? []).reduce(
            (b, ex) => b + ex.performed.reduce((s, p) => s + (p.load_kg || 0) * (p.reps || 0), 0),
            0,
          ),
        0,
      );
    expect(ton(loaded)).toBe(ton(plain));
  });
});

describe('🧱 le stepper monté', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('+ monte de 2,5 kg, − redescend, le chiffre suit la jambe', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useComboStore();
    store.list = [combo([hold('ex_wall_sit')])] as never;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp({
      render: () => h(HoldLestStepper, { comboId: 'c1', leg: store.list[0]!.legs[0]! }),
    });
    app.use(pinia);
    app.mount(el);
    await nextTick();
    expect(el.querySelector('[data-test="hold-lest-val"]')!.textContent).toContain('—');
    (el.querySelector('[data-test="hold-lest-plus"]') as HTMLButtonElement).click();
    (el.querySelector('[data-test="hold-lest-plus"]') as HTMLButtonElement).click();
    await nextTick();
    expect(store.list[0]!.legs[0]!.lest_kg).toBe(5);
    expect(el.querySelector('[data-test="hold-lest-val"]')!.textContent).toContain('5');
    (el.querySelector('[data-test="hold-lest-minus"]') as HTMLButtonElement).click();
    await nextTick();
    expect(store.list[0]!.legs[0]!.lest_kg).toBe(2.5);
    app.unmount();
  });
});
