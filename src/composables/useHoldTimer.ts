import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  holdCues,
  holdLoggedSec,
  holdView,
  parseHoldSettings,
  startHoldRun,
  type HoldCue,
  type HoldRun,
  type HoldSettings,
  type HoldView,
} from '@/lib/holdTimer';

const SETTINGS_KEY = 'muscu:hold:settings';
/** Rafraîchissement de l'écran. Le TEMPS, lui, vient de l'horloge (`holdView`) : un intervalle
 *  qui retarde (écran éteint, onglet en veille) ne fausse jamais la durée enregistrée. */
const REFRESH_MS = 200;

function readSettings(): HoldSettings {
  try {
    return parseHoldSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return parseHoldSettings(null);
  }
}

// ── Signaux : bips (WebAudio) et vibration. Tout est facultatif — un appareil sans l'un ou
// l'autre (iPhone : pas de vibration) fonctionne, simplement sans.
type AudioCtor = typeof AudioContext;
function audioCtor(): AudioCtor | null {
  const w = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}
const CUE_BEEP: Record<HoldCue, { hz: number; ms: number; times: number }> = {
  tick: { hz: 660, ms: 110, times: 1 },
  go: { hz: 990, ms: 380, times: 1 },
  end: { hz: 880, ms: 220, times: 2 },
};
const CUE_VIBRATE: Record<HoldCue, number[]> = {
  tick: [50],
  go: [220],
  end: [200, 100, 200],
};

/**
 * Le minuteur / chrono d'UNE tenue à la fois, partagé par tous les écrans qui en ont une
 * (Défi 360, défis, séance libre, séance live). Il ne sait rien de l'écran : à la fin il rend
 * des SECONDES (`onFinish`), l'écran les enregistre comme il enregistrait une pause de chrono.
 *
 * - `start()` : à appeler depuis un TOUCHER (le navigateur n'autorise le son qu'après un geste).
 * - `stop()` : « j'ai fini » — enregistre le temps réellement tenu (rien pendant la préparation).
 * - `cancel()` : on abandonne, rien n'est enregistré.
 * - Un minuteur qui arrive à sa cible s'enregistre TOUT SEUL (cible exacte).
 */
export function useHoldTimer(onFinish: (sec: number) => void) {
  const settings = ref<HoldSettings>(readSettings());
  watch(
    settings,
    (v) => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(v));
      } catch {
        /* stockage indisponible : les réglages ne survivent pas, rien de grave */
      }
    },
    { deep: true },
  );

  const run = ref<HoldRun | null>(null);
  const now = ref(Date.now());
  const view = computed<HoldView | null>(() => (run.value ? holdView(run.value, now.value) : null));
  const active = computed(() => run.value !== null);

  let timer: ReturnType<typeof setInterval> | undefined;
  let last: HoldView | null = null;
  let ctx: AudioContext | null = null;
  let wake: { release: () => Promise<void> } | null = null;

  function beep(cue: HoldCue) {
    if (!run.value || !settings.value.signals) return;
    try {
      navigator.vibrate?.(CUE_VIBRATE[cue]);
    } catch {
      /* pas de vibration */
    }
    if (!ctx) return;
    const { hz, ms, times } = CUE_BEEP[cue];
    const t0 = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const at = t0 + (i * (ms + 90)) / 1000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = hz;
      osc.connect(gain);
      gain.connect(ctx.destination);
      // Une enveloppe courte : sans elle le bip claque.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
      osc.start(at);
      osc.stop(at + ms / 1000 + 0.02);
    }
  }

  async function lockScreen() {
    try {
      const nav = navigator as unknown as {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock && !wake) wake = await nav.wakeLock.request('screen');
    } catch {
      wake = null; // refusé (économie d'énergie…) : la tenue se mesure quand même
    }
  }
  function unlockScreen() {
    const w = wake;
    wake = null;
    void w?.release().catch(() => undefined);
  }

  function clear() {
    clearInterval(timer);
    timer = undefined;
    run.value = null;
    last = null;
    unlockScreen();
    document.removeEventListener('visibilitychange', onVisible);
  }

  function refresh() {
    if (!run.value) return;
    now.value = Date.now();
    const v = holdView(run.value, now.value);
    for (const cue of holdCues(last, v)) beep(cue);
    last = v;
    if (v.phase === 'done') {
      const sec = holdLoggedSec(v);
      clear();
      if (sec > 0) onFinish(sec);
    }
  }
  /** L'écran se rallume : on rattrape tout de suite (et on redemande le verrou d'écran, que le
   *  navigateur retire quand la page passe en arrière-plan). */
  function onVisible() {
    if (document.visibilityState === 'visible') {
      refresh();
      if (run.value) void lockScreen();
    }
  }

  function start() {
    if (run.value) return;
    // Le contexte audio se crée ICI, dans le geste du joueur.
    const C = audioCtor();
    if (C && !ctx) {
      try {
        ctx = new C();
      } catch {
        ctx = null;
      }
    }
    void ctx?.resume?.().catch(() => undefined);
    now.value = Date.now();
    run.value = startHoldRun(settings.value, now.value);
    last = null;
    document.addEventListener('visibilitychange', onVisible);
    void lockScreen();
    timer = setInterval(refresh, REFRESH_MS);
    refresh();
  }

  /** « J'ai fini » : enregistre ce qui a été tenu (jamais la préparation). */
  function stop() {
    const v = view.value;
    if (!run.value || !v) return;
    const sec = holdLoggedSec(holdView(run.value, Date.now()));
    clear();
    if (sec > 0) onFinish(sec);
  }
  function cancel() {
    clear();
  }

  // Quitter l'écran en pleine tenue : on garde ce qui a été tenu (comme l'ancien chrono).
  onBeforeUnmount(() => {
    if (run.value) stop();
    void ctx?.close?.().catch(() => undefined);
    ctx = null;
  });

  return { settings, view, active, start, stop, cancel };
}
