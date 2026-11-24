// @vitest-environment happy-dom
//
// ➕ Rallonger un minuteur de tenue EN COURS (« +15 s », « +30 s », « +60 s ») : le temps déjà tenu
// est gardé, seule la cible recule ; possible même juste après le bip (le minuteur repart).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { useHoldTimer } from '@/composables/useHoldTimer';
import {
  DEFAULT_HOLD_SETTINGS,
  HOLD_EXTEND_CHOICES,
  HOLD_EXTEND_MAX,
  extendHoldRun,
  holdView,
  startHoldRun,
  type HoldSettings,
} from '@/lib/holdTimer';

const S = (over: Partial<HoldSettings>): HoldSettings => ({ ...DEFAULT_HOLD_SETTINGS, ...over });

describe('extendHoldRun (pur)', () => {
  const run = (over: Partial<HoldSettings> = {}) =>
    startHoldRun(S({ mode: 'timer', targetSec: 30, prepSec: 5, ...over }), 1_000);

  it('allonge la cible, sans toucher au départ ni à la préparation', () => {
    const r = extendHoldRun(run(), 15);
    expect(r.targetSec).toBe(45);
    expect(r.startedAt).toBe(1_000);
    expect(r.prepSec).toBe(5);
  });
  it('le temps déjà tenu est gardé : 20 s tenues puis +15 → il reste 25 s sur 45', () => {
    const r = extendHoldRun(run(), 15);
    const v = holdView(r, 1_000 + 5_000 + 20_000);
    expect(v.heldSec).toBe(20);
    expect(v.remainingSec).toBe(25);
    expect(v.phase).toBe('run');
  });
  it('un minuteur déjà arrivé à 0 repart quand on le rallonge', () => {
    const r = run();
    expect(holdView(r, 1_000 + 5_000 + 31_000).phase).toBe('done');
    expect(holdView(extendHoldRun(r, 30), 1_000 + 5_000 + 31_000).phase).toBe('run');
  });
  it('plafonné à HOLD_EXTEND_MAX', () => {
    const r = extendHoldRun(run({ targetSec: 600 }), 5_000);
    expect(r.targetSec).toBe(HOLD_EXTEND_MAX);
  });
  it('un chrono n’a pas de cible : rien ne change ; une durée nulle ou négative non plus', () => {
    const chrono = startHoldRun(S({ mode: 'chrono' }), 0);
    expect(extendHoldRun(chrono, 15)).toBe(chrono);
    const r = run();
    expect(extendHoldRun(r, 0)).toBe(r);
    expect(extendHoldRun(r, -10)).toBe(r);
  });
  it('les rallonges proposées sont croissantes et utilisables', () => {
    expect([...HOLD_EXTEND_CHOICES]).toEqual([15, 30, 60]);
  });
});

describe('useHoldTimer.extend', () => {
  let finished: number[];
  let api: ReturnType<typeof useHoldTimer>;
  let app: ReturnType<typeof createApp>;
  const mountTimer = () => {
    const Host = defineComponent({
      setup() {
        api = useHoldTimer((s) => finished.push(s));
        return () => h('div');
      },
    });
    app = createApp(Host);
    app.mount(document.createElement('div'));
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
    localStorage.clear();
    finished = [];
  });
  afterEach(() => {
    try {
      app.unmount();
    } catch {
      /* déjà démonté */
    }
    vi.useRealTimers();
  });

  it('pendant la tenue : le minuteur est rallongé et la série enregistrée à la NOUVELLE cible', () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 20, prepSec: 0 });
    api.start();
    vi.advanceTimersByTime(10_000);
    api.extend(15);
    expect(api.view.value?.remainingSec).toBe(25);
    vi.advanceTimersByTime(24_000);
    expect(api.finished.value).toBe(false); // l'ancienne cible (20 s) est dépassée, pas la nouvelle
    vi.advanceTimersByTime(1_500);
    expect(api.finished.value).toBe(true);
    api.stop();
    expect(finished).toEqual([35]);
  });
  it('juste après le bip : le minuteur repart, et un nouveau bip de fin retentit à la nouvelle cible', () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 10, prepSec: 0 });
    api.start();
    vi.advanceTimersByTime(10_500);
    expect(api.finished.value).toBe(true);
    api.extend(30);
    expect(api.finished.value).toBe(false);
    expect(api.view.value?.phase).toBe('run');
    vi.advanceTimersByTime(30_000);
    expect(api.finished.value).toBe(true);
    api.stop();
    expect(finished).toEqual([40]);
  });
  it('plusieurs rallonges se cumulent', () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 20, prepSec: 0 });
    api.start();
    api.extend(15);
    api.extend(30);
    expect(api.view.value?.remainingSec).toBe(65);
  });
  it('sans effet : pendant la préparation, en chrono, ou sans tenue', () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 20, prepSec: 10 });
    api.start();
    api.extend(15);
    expect(api.view.value?.remainingSec).toBe(20); // la préparation n'est pas une tenue
    api.cancel();
    api.extend(15); // rien en cours : ne plante pas
    expect(api.active.value).toBe(false);

    api.settings.value = S({ mode: 'chrono', prepSec: 0 });
    api.start();
    api.extend(15);
    expect(api.view.value?.remainingSec).toBeNull();
  });
});

describe('HoldTimerButton : les pastilles « + » pendant le minuteur', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());
  const mount = async (settings: Partial<HoldSettings>) => {
    localStorage.setItem('muscu:hold:settings', JSON.stringify(S(settings)));
    const { default: HoldTimerButton } = await import('@/components/HoldTimerButton.vue');
    const got: number[] = [];
    const app = createApp({
      render: () => h(HoldTimerButton, { label: 'Planche', onFinish: (s: number) => got.push(s) }),
    });
    app.config.warnHandler = () => {};
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    const q = (t: string) => host.querySelector(`[data-test="${t}"]`) as HTMLElement | null;
    const tap = async (t: string) => {
      expect(q(t), t).not.toBeNull();
      q(t)!.click();
      await nextTick();
    };
    return { host, got, q, tap, unmount: () => app.unmount() };
  };

  it('minuteur en cours : +15 / +30 / +60 ; « +30 s » rallonge le temps affiché', async () => {
    const m = await mount({ mode: 'timer', targetSec: 30, prepSec: 0 });
    await m.tap('hold-start');
    expect(m.q('hold-run')).not.toBeNull();
    for (const s of [15, 30, 60]) expect(m.q(`hold-extend-${s}`)?.textContent).toContain(`+${s} s`);
    vi.advanceTimersByTime(10_000);
    await nextTick();
    expect(m.q('hold-time')?.textContent?.trim()).toBe('0:20');
    await m.tap('hold-extend-30');
    expect(m.q('hold-time')?.textContent?.trim()).toBe('0:50');
    m.unmount();
  });
  it('après le bip : « + » fait repartir le minuteur, « OK » enregistre la NOUVELLE durée', async () => {
    const m = await mount({ mode: 'timer', targetSec: 10, prepSec: 0 });
    await m.tap('hold-start');
    vi.advanceTimersByTime(10_500);
    await nextTick();
    expect(m.q('hold-done')).not.toBeNull();
    await m.tap('hold-extend-15');
    expect(m.q('hold-run')).not.toBeNull();
    vi.advanceTimersByTime(15_000);
    await nextTick();
    await m.tap('hold-ok');
    expect(m.got).toEqual([25]);
    m.unmount();
  });
  it('en mode chrono : pas de pastilles « + » (il n’y a pas de cible à rallonger)', async () => {
    const m = await mount({ mode: 'chrono', prepSec: 0 });
    await m.tap('hold-start');
    expect(m.q('hold-run')).not.toBeNull();
    expect(m.q('hold-extend-15')).toBeNull();
    m.unmount();
  });
});
