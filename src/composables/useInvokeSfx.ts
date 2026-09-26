/**
 * 🔊 LES SONS DE L'INVOCATION — synthétisés par Web Audio, AUCUN fichier à télécharger
 * (le service worker ne cache rien : chaque octet serait retéléchargé à chaque visite).
 *
 * ⚠️ COUPÉS PAR DÉFAUT (décidé avec l'utilisateur) : l'app s'utilise en salle, un tirage
 * qui sonne sans prévenir serait malvenu. Le choix est retenu par appareil.
 * ⚠️ L'`AudioContext` n'est créé qu'au premier GESTE (iOS refuse de jouer sans geste).
 */
import { ref } from 'vue';

const KEY = 'muscu:gacha:sound';
function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Partagé entre les ouvertures de l'écran : un seul contexte audio pour toute l'app. */
const enabled = ref(readPref());
let AC: AudioContext | null = null;
let master: GainNode | null = null;
let hum: { o: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;

function ctx(): AudioContext | null {
  if (!AC) {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      AC = new Ctor();
      master = AC.createGain();
      master.gain.value = 0.55;
      master.connect(AC.destination);
    } catch {
      return null;
    }
  }
  if (AC.state === 'suspended') void AC.resume();
  return AC;
}
function ok(): AudioContext | null {
  return enabled.value ? ctx() : null;
}
function noise(a: AudioContext, sec: number): AudioBuffer {
  const b = a.createBuffer(1, Math.ceil(a.sampleRate * sec), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function env(g: GainNode, t: number, attack: number, peak: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}
function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, delay = 0) {
  const a = ok();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(g);
  g.connect(master);
  env(g, t, 0.006, peak, dur);
  o.start(t);
  o.stop(t + dur + 0.1);
}
function burst(
  dur: number,
  type: BiquadFilterType,
  f0: number,
  f1: number,
  peak: number,
  attack = 0.005,
) {
  const a = ok();
  if (!a || !master) return;
  const t = a.currentTime;
  const s = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  s.buffer = noise(a, dur);
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  env(g, t, attack, peak, dur);
  s.start(t);
}

export function useInvokeSfx() {
  function setEnabled(v: boolean) {
    enabled.value = v;
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* navigation privée : le choix ne survit pas, sans conséquence */
    }
    if (v) chime(1);
  }
  /** Le bourdonnement du maintien, qui monte avec la charge. */
  function humStart() {
    const a = ok();
    if (!a || !master) return;
    humStop();
    const o = a.createOscillator();
    const o2 = a.createOscillator();
    const f = a.createBiquadFilter();
    const g = a.createGain();
    o.type = 'sawtooth';
    o2.type = 'sine';
    o.frequency.value = 55;
    o2.frequency.value = 110;
    f.type = 'lowpass';
    f.frequency.value = 350;
    g.gain.value = 0.0001;
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(master);
    o.start();
    o2.start();
    g.gain.exponentialRampToValueAtTime(0.13, a.currentTime + 0.15);
    hum = { o, o2, f, g };
  }
  function humSet(p: number) {
    if (!hum || !AC) return;
    const t = AC.currentTime;
    hum.o.frequency.setTargetAtTime(55 + p * 170, t, 0.05);
    hum.o2.frequency.setTargetAtTime(110 + p * 340, t, 0.05);
    hum.f.frequency.setTargetAtTime(350 + p * 2600, t, 0.05);
  }
  function humStop() {
    if (!hum || !AC) return;
    const h = hum;
    hum = null;
    const t = AC.currentTime;
    h.g.gain.cancelScheduledValues(t);
    h.g.gain.setTargetAtTime(0.0001, t, 0.06);
    window.setTimeout(() => {
      try {
        h.o.stop();
        h.o2.stop();
      } catch {
        /* déjà arrêté */
      }
    }, 400);
  }
  const whoosh = (dur = 0.8) => burst(dur, 'bandpass', 300, 3200, 0.5, dur * 0.6);
  function crack() {
    burst(0.15, 'highpass', 1800, 1800, 0.8);
    tone('square', 900, 1800, 0.3, 0.12);
  }
  function impact(tier: number) {
    tone('sine', 150, 35, 0.55, 0.7 + tier * 0.1);
    burst(0.45, 'lowpass', 900, 900, 0.4, 0.01);
  }
  function chime(tier: number) {
    const notes = [523, 659, 784, 1047, 1319, 1568, 2093];
    const n = 2 + Math.round(tier * 1.6);
    for (let i = 0; i < n; i++)
      tone('triangle', notes[i % notes.length]!, notes[i % notes.length]!, 0.6, 0.22, i * 0.085);
  }
  const stamp = () => tone('sine', 110, 55, 0.2, 0.6);
  const tick = () => tone('square', 2400, 2400, 0.02, 0.03);
  /** Battement de la scrutation du ×10 : un peu plus aigu à chaque orbe, la tension monte. */
  const pulse = (i: number) => tone('sine', 170 + i * 28, 130 + i * 28, 0.14, 0.28);
  return {
    enabled,
    setEnabled,
    humStart,
    humSet,
    humStop,
    whoosh,
    crack,
    impact,
    chime,
    stamp,
    tick,
    pulse,
  };
}
