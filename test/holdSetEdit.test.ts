// @vitest-environment happy-dom
//
// ✏️ Corriger une série de TENUE du Défi 360 (planche, chaise…) : secondes + lest, ou la retirer.
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import HoldSetEditor from '@/components/HoldSetEditor.vue';
import ComboSetHistory from '@/components/ComboSetHistory.vue';
import { useComboStore } from '@/stores/combo';
import { legDone, updateHoldSetAt, type ComboChallenge, type ComboLeg, type ComboSet } from '@/lib/combo';

const D = '2099-01-02';
const hold = (id: string, sets: ComboSet[]): ComboLeg =>
  ({
    slot: 'core',
    exercise_id: id,
    exercise_name: id === 'ex_plank' ? 'Gainage' : 'Planche latérale',
    muscle_primary: 'abdominaux',
    rep_weight: 0.6,
    target: 240,
    count_mode: 'time',
    sets,
  }) as ComboLeg;
const combo = (legs: ComboLeg[]) =>
  ({ id: 'c1', name: '360', status: 'active', start_date: D, duration_days: 7, legs }) as unknown as ComboChallenge;

describe('updateHoldSetAt (lib)', () => {
  const sets: ComboSet[] = [
    { date: D, reps: 40, lest: 5, weight: null, at: 'a' },
    { date: D, reps: 30, weight: null, at: 'b' },
  ];
  it('change les secondes et le lest de CETTE série seulement', () => {
    const out = updateHoldSetAt(sets, 0, { sec: 55, lest: 7.5 });
    expect(out[0]).toMatchObject({ reps: 55, lest: 7.5, at: 'a' });
    expect(out[1]).toBe(sets[1]);
  });
  it('un lest nul retire le champ (poids du corps) ; l’original n’est pas modifié', () => {
    const out = updateHoldSetAt(sets, 0, { sec: 40, lest: 0 });
    expect('lest' in out[0]!).toBe(false);
    expect(sets[0]!.lest).toBe(5);
  });
});

describe('store.updateHoldSet', () => {
  beforeEach(() => setActivePinia(createPinia()));
  const setup = () => {
    const s = useComboStore();
    s.list = [
      combo([
        hold('ex_plank', [{ date: D, reps: 40, lest: 5, weight: null, at: 'a' }]),
        hold('ex_plank_side', [{ date: D, reps: 30, weight: null, at: 'b' }]),
      ]),
    ] as never;
    return s;
  };
  it('corrige les secondes et le lest, mémorise le lest de la dernière série', () => {
    const s = setup();
    s.updateHoldSet('c1', 'ex_plank', 0, 50, 10);
    const l = s.list[0]!.legs[0]!;
    expect(l.sets![0]).toMatchObject({ reps: 50, lest: 10 });
    expect(l.lest_kg).toBe(10);
    expect(legDone(l)).toBe(50);
  });
  it('sur une tenue non lestable, le lest est ignoré mais les secondes se corrigent', () => {
    const s = setup();
    s.updateHoldSet('c1', 'ex_plank_side', 0, 45, 10);
    const l = s.list[0]!.legs[1]!;
    expect(l.sets![0]!.reps).toBe(45);
    expect(l.sets![0]!.lest).toBeUndefined();
  });
  it('ignore une série inexistante ou des secondes nulles', () => {
    const s = setup();
    s.updateHoldSet('c1', 'ex_plank', 5, 50, 10);
    s.updateHoldSet('c1', 'ex_plank', 0, 0, 10);
    expect(s.list[0]!.legs[0]!.sets![0]).toMatchObject({ reps: 40, lest: 5 });
  });
});

async function mount(comp: Parameters<typeof h>[0], props: Record<string, unknown>) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp({ render: () => h(comp, props) });
  app.use(pinia);
  app.mount(el);
  await nextTick();
  return { el, pinia, done: () => app.unmount() };
}

describe('éditeur monté', () => {
  it('+5 s, +2,5 kg puis Enregistrer : la série du store est corrigée', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const s = useComboStore();
    s.list = [combo([hold('ex_plank', [{ date: D, reps: 40, lest: 5, weight: null, at: 'a' }])])] as never;
    const leg = s.list[0]!.legs[0]!;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp({
      render: () => h(HoldSetEditor, { modelValue: true, comboId: 'c1', leg, index: 0 }),
    });
    app.use(pinia);
    app.mount(el);
    await nextTick();
    const q = (t: string) => document.querySelector(`[data-test="${t}"]`) as HTMLElement;
    expect((q('hold-edit-sec') as HTMLInputElement).value).toBe('40');
    q('hold-edit-sec-plus').click();
    q('hold-edit-lest-plus').click();
    await nextTick();
    q('hold-edit-save').click();
    await nextTick();
    expect(s.list[0]!.legs[0]!.sets![0]).toMatchObject({ reps: 45, lest: 7.5 });
    app.unmount();
  });
  it('une tenue non lestable n’affiche pas le lest', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const s = useComboStore();
    s.list = [combo([hold('ex_plank_side', [{ date: D, reps: 30, weight: null, at: 'b' }])])] as never;
    const leg = s.list[0]!.legs[0]!;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp({
      render: () => h(HoldSetEditor, { modelValue: true, comboId: 'c1', leg, index: 0 }),
    });
    app.use(pinia);
    app.mount(el);
    await nextTick();
    expect(document.querySelector('[data-test="hold-edit-lest"]')).toBeNull();
    expect(document.querySelector('[data-test="hold-edit-sec"]')).not.toBeNull();
    app.unmount();
  });
});

describe('historique : lignes de tenue touchables', () => {
  const leg = hold('ex_plank', [
    { date: D, reps: 40, lest: 5, weight: null, at: 'a' },
    { date: D, reps: 30, weight: null, at: 'b' },
  ]);
  it('défi en cours : toucher une ligne émet son index', async () => {
    const got: number[] = [];
    const t = await mount(ComboSetHistory, {
      modelValue: true,
      leg,
      editable: true,
      onEdit: (i: number) => got.push(i),
    });
    const rows = document.querySelectorAll('[data-test="hist-hold-row"]');
    expect(rows.length).toBe(2);
    (rows[0] as HTMLElement).click(); // la plus récente en tête : index 1
    expect(got).toEqual([1]);
    t.done();
  });
  it('défi terminé (non éditable) : aucune ligne touchable', async () => {
    const t = await mount(ComboSetHistory, { modelValue: true, leg, editable: false });
    expect(document.querySelectorAll('[data-test="hist-hold-row"]').length).toBe(0);
    t.done();
  });
});
