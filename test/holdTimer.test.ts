// @vitest-environment happy-dom
//
// ⏱ Le minuteur / chrono des tenues (v1.346.0). Trois étages : la lib pure (états, signaux),
// le composable (l'HORLOGE, jamais un compteur ; enregistrement ; bips), le composant monté et le
// câblage des écrans.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import {
  bumpTarget,
  DEFAULT_HOLD_SETTINGS,
  fmtHold,
  HOLD_TARGET_MAX,
  HOLD_TARGET_MIN,
  holdCues,
  holdLoggedSec,
  holdView,
  normalizeHoldSettings,
  parseHoldSettings,
  startHoldRun,
  type HoldCue,
  type HoldSettings,
} from '@/lib/holdTimer';
import { useHoldTimer } from '@/composables/useHoldTimer';

const S = (over: Partial<HoldSettings> = {}): HoldSettings => ({
  ...DEFAULT_HOLD_SETTINGS,
  ...over,
});

describe('réglages sauvegardés', () => {
  it('rien d’utilisable → le comportement d’avant : chrono, départ immédiat', () => {
    for (const raw of [null, undefined, '', 'pas du json', '42', 'null', '[]']) {
      expect(parseHoldSettings(raw as string | null)).toEqual(DEFAULT_HOLD_SETTINGS);
    }
    expect(DEFAULT_HOLD_SETTINGS.mode).toBe('chrono');
    expect(DEFAULT_HOLD_SETTINGS.prepSec).toBe(0);
  });
  it('valeurs hors bornes ramenées, types faux écartés', () => {
    const n = normalizeHoldSettings({ mode: 'timer', targetSec: 99999, prepSec: -4, signals: 'oui' });
    expect(n).toEqual({ mode: 'timer', targetSec: HOLD_TARGET_MAX, prepSec: 0, signals: true });
    expect(normalizeHoldSettings({ mode: 'nimporte', targetSec: 1, prepSec: 500 })).toMatchObject({
      mode: 'chrono',
      targetSec: HOLD_TARGET_MIN,
      prepSec: 30,
    });
    expect(normalizeHoldSettings({ targetSec: 'x' }).targetSec).toBe(DEFAULT_HOLD_SETTINGS.targetSec);
  });
  it('le stepper de durée reste dans ses bornes', () => {
    expect(bumpTarget(30, 1)).toBe(35);
    expect(bumpTarget(30, -1)).toBe(25);
    expect(bumpTarget(HOLD_TARGET_MIN, -1)).toBe(HOLD_TARGET_MIN);
    expect(bumpTarget(HOLD_TARGET_MAX, 1)).toBe(HOLD_TARGET_MAX);
    expect(fmtHold(65)).toBe('1:05');
    expect(fmtHold(-3)).toBe('0:00');
  });
});

describe('holdView : tout se déduit de l’horloge', () => {
  const run = startHoldRun(S({ mode: 'timer', targetSec: 30, prepSec: 10 }), 1_000);
  it('la PRÉPARATION d’abord, jamais comptée dans la tenue', () => {
    const v = holdView(run, 1_000 + 3_200);
    expect(v.phase).toBe('prep');
    expect(v.prepLeft).toBe(7); // 6,8 s restantes → arrondi au-dessus : « 7 »
    expect(v.heldSec).toBe(0);
    expect(holdLoggedSec(v)).toBe(0);
  });
  it('la tenue commence PILE après la préparation', () => {
    const at = holdView(run, 1_000 + 10_000);
    expect(at.phase).toBe('run');
    expect(at.heldSec).toBe(0);
    expect(holdView(run, 1_000 + 10_000 + 12_900).heldSec).toBe(12);
  });
  it('minuteur : secondes restantes arrondies au-dessus, avancement, puis « fait » à la cible exacte', () => {
    const v = holdView(run, 1_000 + 10_000 + 12_900);
    expect(v.remainingSec).toBe(18); // 17,1 s → 18
    expect(v.progress).toBeCloseTo(12.9 / 30, 5);
    const done = holdView(run, 1_000 + 10_000 + 30_000);
    expect(done).toMatchObject({ phase: 'done', heldSec: 30, remainingSec: 0, progress: 1 });
    // Bien au-delà (écran éteint un moment) : toujours la CIBLE, jamais plus.
    expect(holdView(run, 1_000 + 10_000 + 999_000).heldSec).toBe(30);
  });
  it('chrono : jamais « fait », pas de reste ni d’avancement', () => {
    const c = startHoldRun(S({ mode: 'chrono', prepSec: 0 }), 0);
    const v = holdView(c, 3_600_000);
    expect(v).toMatchObject({ phase: 'run', heldSec: 3600, remainingSec: null, progress: null });
  });
  it('une horloge qui recule ne fait jamais de temps négatif', () => {
    const v = holdView(run, 0);
    expect(v.phase).toBe('prep');
    expect(v.prepLeft).toBe(10);
  });
  it('arrêt en cours de tenue : le temps réellement tenu ; en préparation : rien', () => {
    expect(holdLoggedSec(holdView(run, 1_000 + 10_000 + 7_400))).toBe(7);
    expect(holdLoggedSec(holdView(run, 1_000 + 9_999))).toBe(0);
  });
});

describe('holdCues : chaque signal une seule fois', () => {
  /** Rejoue un départ, un rafraîchissement tous les `stepMs`. */
  const play = (settings: HoldSettings, totalMs: number, stepMs = 100) => {
    const run = startHoldRun(settings, 0);
    const out: { at: number; cue: HoldCue }[] = [];
    let prev = null as ReturnType<typeof holdView> | null;
    for (let t = 0; t <= totalMs; t += stepMs) {
      const v = holdView(run, t);
      for (const cue of holdCues(prev, v)) out.push({ at: t, cue });
      prev = v;
    }
    return out;
  };
  it('préparation 5 s + minuteur 5 s : 3 tics, un départ, 3 tics, une fin', () => {
    const cues = play(S({ mode: 'timer', targetSec: 5, prepSec: 5 }), 11_000);
    expect(cues.map((c) => c.cue)).toEqual(['tick', 'tick', 'tick', 'go', 'tick', 'tick', 'tick', 'end']);
    // Les tics tombent sur « 3, 2, 1 » (2 s, 3 s, 4 s après le lancement), le départ à 5 s, la fin à 10 s.
    expect(cues.filter((c) => c.cue === 'tick').map((c) => c.at)).toEqual([
      2000, 3000, 4000, 7000, 8000, 9000,
    ]);
    expect(cues.find((c) => c.cue === 'go')!.at).toBe(5000);
    expect(cues.find((c) => c.cue === 'end')!.at).toBe(10_000);
  });
  it('chrono sans préparation : un « go » au lancement, puis plus rien', () => {
    expect(play(S({ mode: 'chrono', prepSec: 0 }), 60_000).map((c) => c.cue)).toEqual(['go']);
  });
  it('préparation de 3 s ou moins : le premier chiffre est annoncé dès le lancement', () => {
    const cues = play(S({ mode: 'chrono', prepSec: 3 }), 4_000);
    expect(cues.map((c) => c.cue)).toEqual(['tick', 'tick', 'tick', 'go']);
    expect(cues[0]!.at).toBe(0);
  });
  it('un rafraîchissement très tardif ne rejoue pas les tics manqués : départ et fin, une fois', () => {
    const cues = play(S({ mode: 'timer', targetSec: 5, prepSec: 5 }), 60_000, 60_000);
    expect(cues.map((c) => c.cue)).toEqual(['tick', 'go', 'end'].filter((c) => c !== 'tick'));
  });
  it('rien de plus une fois « fait »', () => {
    const run = startHoldRun(S({ mode: 'timer', targetSec: 5 }), 0);
    const done = holdView(run, 9_000);
    expect(holdCues(done, holdView(run, 12_000))).toEqual([]);
  });
});

// ── Le composable : horloge, enregistrement, bips ────────────────────────────────────────────
describe('useHoldTimer', () => {
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
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
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
    vi.unstubAllGlobals();
  });

  it('chrono : « Terminer » enregistre le temps réellement tenu', () => {
    mountTimer();
    api.settings.value = S({ mode: 'chrono', prepSec: 0 });
    api.start();
    vi.advanceTimersByTime(12_400);
    api.stop();
    expect(finished).toEqual([12]);
    expect(api.active.value).toBe(false);
  });

  it('la PRÉPARATION n’est jamais enregistrée, et l’annuler n’enregistre rien', () => {
    mountTimer();
    api.settings.value = S({ mode: 'chrono', prepSec: 10 });
    api.start();
    vi.advanceTimersByTime(7_000);
    expect(api.view.value?.phase).toBe('prep');
    api.stop(); // « Terminer » trop tôt, pendant le décompte
    expect(finished).toEqual([]);
    api.start();
    vi.advanceTimersByTime(4_000);
    api.cancel();
    expect(finished).toEqual([]);
    expect(api.active.value).toBe(false);
    // Et la tenue qui suit la préparation compte bien depuis son départ : 10 s de prépa + 8,5 s.
    api.start();
    vi.advanceTimersByTime(10_000 + 8_500);
    api.stop();
    expect(finished).toEqual([8]);
  });

  it('⚠️ minuteur : à la cible l’écran RESTE à 0 et rien n’est enregistré avant « OK » (cible exacte, une seule fois)', () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 20, prepSec: 5 });
    api.start();
    vi.advanceTimersByTime(5_000 + 19_900);
    expect(api.finished.value).toBe(false);
    vi.advanceTimersByTime(200);
    // Arrivé : toujours actif, à 0, PAS enregistré (on est peut-être debout, loin du téléphone).
    expect(finished).toEqual([]);
    expect(api.active.value).toBe(true);
    expect(api.finished.value).toBe(true);
    expect(api.view.value?.remainingSec).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(finished).toEqual([]);
    api.stop(); // « OK »
    expect(finished).toEqual([20]);
    expect(api.active.value).toBe(false);
    api.stop();
    expect(finished).toEqual([20]);
  });

  it('quitter l’écran sans avoir validé un minuteur terminé garde la série (cible exacte)', () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 15, prepSec: 0 });
    api.start();
    vi.advanceTimersByTime(16_000);
    expect(finished).toEqual([]);
    app.unmount();
    expect(finished).toEqual([15]);
  });

  it('arrêt anticipé d’un minuteur : le temps tenu, pas la cible', () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 60, prepSec: 0 });
    api.start();
    vi.advanceTimersByTime(23_700);
    api.stop();
    expect(finished).toEqual([23]);
  });

  it('⚠️ L’HORLOGE, pas un compteur : écran éteint (aucun intervalle ne tourne), le temps est juste', () => {
    mountTimer();
    api.settings.value = S({ mode: 'chrono', prepSec: 0 });
    api.start();
    // 45 s passent SANS qu'aucun rafraîchissement ne soit joué (onglet gelé, téléphone posé).
    vi.setSystemTime(Date.now() + 45_000);
    api.stop();
    expect(finished).toEqual([45]); // un compteur « +1 par intervalle » aurait donné 0
  });

  it('⚠️ au retour de l’écran, un minuteur échu depuis longtemps est à 0, en attente de « OK »', () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 30, prepSec: 5 });
    api.start();
    vi.setSystemTime(Date.now() + 120_000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(finished).toEqual([]);
    expect(api.finished.value).toBe(true);
    api.stop();
    expect(finished).toEqual([30]);
  });

  it('quitter l’écran en pleine tenue garde ce qui a été tenu ; en préparation, rien', () => {
    mountTimer();
    api.settings.value = S({ mode: 'chrono', prepSec: 5 });
    api.start();
    vi.advanceTimersByTime(5_000 + 9_000);
    app.unmount();
    expect(finished).toEqual([9]);

    finished = [];
    mountTimer();
    api.settings.value = S({ mode: 'chrono', prepSec: 5 });
    api.start();
    vi.advanceTimersByTime(3_000);
    app.unmount();
    expect(finished).toEqual([]);
  });

  it('les réglages sont mémorisés par appareil et relus au prochain écran', async () => {
    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 45, prepSec: 10, signals: false });
    await nextTick();
    app.unmount();
    mountTimer();
    expect(api.settings.value).toEqual({ mode: 'timer', targetSec: 45, prepSec: 10, signals: false });
  });

  it('bips et vibration : au départ et à la fin ; aucun si « silencieux »', () => {
    const beeps: number[] = [];
    class FakeCtx {
      currentTime = 0;
      destination = {};
      resume = async () => undefined;
      close = async () => undefined;
      createOscillator() {
        beeps.push(1);
        return { frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
        };
      }
    }
    vi.stubGlobal('AudioContext', FakeCtx);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });

    mountTimer();
    api.settings.value = S({ mode: 'timer', targetSec: 5, prepSec: 0, signals: true });
    api.start();
    expect(beeps.length).toBe(1); // « go »
    vi.advanceTimersByTime(5_200);
    // go (1) + tics 3, 2, 1 (3) + fin (1 bip)
    expect(beeps.length).toBe(1 + 3 + 1);
    expect(vibrate).toHaveBeenCalled();

    // ⚠️ UN SEUL bip de fin (v1.350.0 : « juste un bip pour dire que c'est terminé ») : rien
    // ensuite, ni sonnerie répétée ni rappel, jusqu'au « OK ».
    const atEnd = beeps.length;
    vibrate.mockClear();
    vi.advanceTimersByTime(10 * 60_000);
    expect(beeps.length).toBe(atEnd);
    expect(vibrate).not.toHaveBeenCalled();
    expect(api.finished.value).toBe(true);
    api.stop();
    expect(finished).toEqual([5]);

    beeps.length = 0;
    vibrate.mockClear();
    api.settings.value = S({ mode: 'timer', targetSec: 5, prepSec: 0, signals: false });
    api.start();
    vi.advanceTimersByTime(30_000);
    expect(beeps.length).toBe(0);
    expect(vibrate).not.toHaveBeenCalled();
    api.stop();
    expect(finished).toEqual([5, 5]);
  });
});

// ── Le composant monté (Quasar n'est pas enregistré dans ce harnais : `q-dialog` rend son
// contenu en place, ce qui permet de le lire et d'y cliquer) ───────────────────────────────────
describe('HoldTimerButton monté', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T10:00:00Z'));
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const mount = async (props: Record<string, unknown> = {}) => {
    const { default: HoldTimerButton } = await import('@/components/HoldTimerButton.vue');
    const got: number[] = [];
    let err: unknown = null;
    const app = createApp({
      render: () => h(HoldTimerButton, { label: 'Planche', ...props, onFinish: (s: number) => got.push(s) }),
    });
    app.config.warnHandler = () => {};
    app.config.errorHandler = (e) => (err = e);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await nextTick();
    const q = (t: string) => host.querySelector(`[data-test="${t}"]`) as HTMLElement | null;
    const tap = async (t: string) => {
      const el = q(t);
      expect(el, t).not.toBeNull();
      el!.click();
      await nextTick();
    };
    return { host, got, q, tap, unmount: () => app.unmount(), err: () => err };
  };

  it('se monte : bouton, deux modes, chips de préparation, départ immédiat par défaut', async () => {
    const m = await mount();
    expect(m.err()).toBeNull();
    expect(m.q('hold-open')?.textContent).toContain('Lancer la tenue');
    expect(m.q('hold-mode-chrono')).not.toBeNull();
    expect(m.q('hold-mode-timer')).not.toBeNull();
    for (const p of [0, 5, 10, 15]) expect(m.q(`hold-prep-${p}`), `prep ${p}`).not.toBeNull();
    expect(m.q('hold-target-30')).toBeNull(); // la durée n'apparaît qu'en minuteur
    expect(m.host.textContent).toContain('départ immédiat');
    m.unmount();
  });

  it('minuteur 20 s, départ dans 5 s : décompte, tenue, puis écran à 0 et « OK » qui enregistre', async () => {
    const m = await mount({ suggested: 25 });
    await m.tap('hold-mode-timer');
    expect(m.q('hold-target-25')?.textContent).toContain('🎯'); // l'objectif de la série est proposé
    await m.tap('hold-target-20');
    await m.tap('hold-prep-5');
    expect(m.host.textContent).toContain('Minuteur 0:20 · départ dans 5 s');
    await m.tap('hold-start');
    expect(m.q('hold-prep')).not.toBeNull();
    expect(m.host.textContent).toContain('Installe-toi');
    vi.advanceTimersByTime(5_100);
    await nextTick();
    expect(m.q('hold-run')).not.toBeNull();
    expect(m.host.textContent).toContain('Tiens');
    vi.advanceTimersByTime(20_100);
    await nextTick();
    // ⚠️ Il RESTE sur le minuteur, à 0, avec « OK » : rien d'enregistré tant qu'on n'a pas validé.
    expect(m.got).toEqual([]);
    expect(m.q('hold-run')).toBeNull();
    expect(m.q('hold-done')).not.toBeNull();
    expect(m.q('hold-time')?.textContent?.trim()).toBe('0:00');
    expect(m.host.textContent).toContain('Terminé');
    vi.advanceTimersByTime(30_000);
    await nextTick();
    expect(m.q('hold-done')).not.toBeNull(); // il attend, aussi longtemps qu'il faut
    await m.tap('hold-ok');
    expect(m.got).toEqual([20]);
    expect(m.q('hold-done')).toBeNull();
    m.unmount();
  });

  it('chrono : « Terminer » ouvre le contrôle puis « Valider » enregistre ; « Annuler » pendant le décompte n’enregistre rien', async () => {
    const m = await mount();
    await m.tap('hold-prep-10');
    await m.tap('hold-start');
    vi.advanceTimersByTime(4_000);
    await nextTick();
    await m.tap('hold-cancel');
    expect(m.got).toEqual([]);
    expect(m.q('hold-start')).not.toBeNull(); // retour aux réglages

    await m.tap('hold-start');
    vi.advanceTimersByTime(10_000 + 6_300);
    await nextTick();
    await m.tap('hold-stop');
    // v1.370.0 : le chrono s'arrête sur un écran de contrôle (corrigeable) ; rien n'est enregistré avant « Valider ».
    expect(m.got).toEqual([]);
    expect(m.q('hold-review-val')?.textContent?.trim()).toBe('0:06');
    await m.tap('hold-review-ok');
    expect(m.got).toEqual([6]);
    m.unmount();
  });

  it('une durée de minuteur se règle au pas de 5 s, bornée', async () => {
    const m = await mount();
    await m.tap('hold-mode-timer');
    await m.tap('hold-target-30');
    await m.tap('hold-target-plus');
    expect(m.q('hold-target-val')?.textContent?.trim()).toBe('0:35');
    for (let i = 0; i < 10; i++) await m.tap('hold-target-minus');
    expect(m.q('hold-target-val')?.textContent?.trim()).toBe('0:05');
    m.unmount();
  });
});

// ── Le câblage des écrans (lecture de la source) ─────────────────────────────────────────────
describe('les écrans de tenue utilisent le minuteur partagé', () => {
  const src = (f: string) => readFileSync(f, 'utf8');
  it('Défi 360 : fiche, liste et séance n’ont plus leur chrono « +1 par intervalle »', () => {
    for (const f of [
      'src/pages/ComboDetailPage.vue',
      'src/pages/ChallengesPage.vue',
      'src/pages/ComboSessionPage.vue',
    ]) {
      const s = src(f);
      expect(s, f).toContain('<HoldTimerButton');
      expect(s, f).not.toMatch(/setInterval\(\(\) => \((chronoSec|timerSec)\.value \+= 1\)/);
    }
  });
  it('séance libre et séance live : le bouton n’apparaît que pour un exo au temps', () => {
    expect(src('src/pages/FreeSessionPage.vue')).toMatch(/<HoldTimerButton\s+v-if="isTimeEx/);
    expect(src('src/pages/SessionLivePage.vue')).toMatch(/<HoldTimerButton\s+v-if="isTimeEx"/);
  });
  it('défi : le minuteur s’ajoute, et le chrono maison se déduit de l’horloge', () => {
    const s = src('src/pages/ChallengeDetailPage.vue');
    expect(s).toContain('<HoldTimerButton');
    expect(s).toContain('Date.now() - t0');
    expect(s).not.toContain('e.elapsed_sec++');
  });
});
