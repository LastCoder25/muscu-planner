// holdTimer.ts — le MINUTEUR / CHRONO D'UNE TENUE (planche, chaise, pont fessier tenu…).
// Pur (aucune dépendance Vue/DOM), testé.
//
// Demandé (2026-11-23) : « soit lancer un chrono si on ne sait pas combien de temps on va tenir,
// soit un minuteur dont on règle le temps, et un DÉLAI avant que la durée ne se lance — le temps
// de poser le téléphone et de s'installer ».
//
// ⚠️ LE TEMPS VIENT DE L'HORLOGE, JAMAIS D'UN COMPTEUR. Les anciens chronos faisaient
// `setInterval(+1 s)` : dès que l'écran s'éteint ou que l'appli passe en arrière-plan (le cas
// d'un téléphone POSÉ PAR TERRE), le navigateur ralentit les intervalles et la tenue enregistrée
// était trop courte. Ici tout se déduit de `startedAt` et de `now` : un intervalle qui
// retarde ne change que le moment où l'écran se rafraîchit, jamais le résultat.

type HoldMode = 'chrono' | 'timer';

export interface HoldSettings {
  mode: HoldMode;
  /** Minuteur : combien de secondes tenir. */
  targetSec: number;
  /** Préparation : secondes AVANT que la tenue ne commence (jamais comptées dedans). */
  prepSec: number;
  /** Bips et vibration. */
  signals: boolean;
}

export const HOLD_PREP_CHOICES = [0, 5, 10, 15] as const;
export const HOLD_TARGET_CHOICES = [20, 30, 45, 60] as const;
const HOLD_TARGET_STEP = 5;
export const HOLD_TARGET_MIN = 5;
export const HOLD_TARGET_MAX = 600;
const HOLD_PREP_MAX = 30;
/** Combien de secondes avant un départ ou une fin on compte à voix haute (bips). */
const HOLD_COUNTDOWN_FROM = 3;

/** Par défaut : le chrono et aucune préparation — le comportement d'avant (rien ne change tant
 *  qu'on ne règle rien). */
export const DEFAULT_HOLD_SETTINGS: HoldSettings = {
  mode: 'chrono',
  targetSec: 30,
  prepSec: 0,
  signals: true,
};

const clampInt = (v: unknown, min: number, max: number, def: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Relit des réglages sauvegardés (JSON inconnu, ancien, abîmé) : jamais d'erreur, jamais de
 *  valeur hors bornes. */
export function normalizeHoldSettings(raw: unknown): HoldSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_HOLD_SETTINGS;
  return {
    mode: o.mode === 'timer' ? 'timer' : 'chrono',
    targetSec: clampInt(o.targetSec, HOLD_TARGET_MIN, HOLD_TARGET_MAX, d.targetSec),
    prepSec: clampInt(o.prepSec, 0, HOLD_PREP_MAX, d.prepSec),
    signals: typeof o.signals === 'boolean' ? o.signals : d.signals,
  };
}

export function parseHoldSettings(json: string | null | undefined): HoldSettings {
  if (!json) return { ...DEFAULT_HOLD_SETTINGS };
  try {
    return normalizeHoldSettings(JSON.parse(json));
  } catch {
    return { ...DEFAULT_HOLD_SETTINGS };
  }
}

/** Un départ : les réglages FIGÉS au moment du « Lancer » (les changer en cours de route ne
 *  déplace ni la préparation ni l'arrivée). */
export interface HoldRun {
  startedAt: number;
  mode: HoldMode;
  prepSec: number;
  targetSec: number;
}

export function startHoldRun(settings: HoldSettings, now: number): HoldRun {
  return {
    startedAt: now,
    mode: settings.mode,
    prepSec: settings.prepSec,
    targetSec: settings.targetSec,
  };
}

/** Les rallonges proposées pendant un minuteur (« je suis en forme, j'en refais 15 s »). */
export const HOLD_EXTEND_CHOICES = [15, 30, 60] as const;
/** Plafond d'un minuteur ALLONGÉ (30 min) : au-dessus de la durée réglable (10 min), mais borné. */
export const HOLD_EXTEND_MAX = 1800;

/** Allonge un minuteur EN COURS de sec secondes (jamais au-delà de HOLD_EXTEND_MAX). Le départ
 *  (startedAt) et la préparation ne bougent pas : le temps déjà tenu est conservé, seule la cible
 *  recule. Un chrono n'a pas de cible : il est rendu tel quel. */
export function extendHoldRun(run: HoldRun, sec: number): HoldRun {
  if (run.mode !== 'timer' || !(sec > 0)) return run;
  return { ...run, targetSec: Math.min(HOLD_EXTEND_MAX, run.targetSec + Math.round(sec)) };
}

type HoldPhase = 'prep' | 'run' | 'done';

export interface HoldView {
  phase: HoldPhase;
  /** Secondes restantes de préparation (arrondies au-dessus : « 3, 2, 1 »), 0 hors préparation. */
  prepLeft: number;
  /** Secondes TENUES (arrondies en dessous), 0 pendant la préparation. */
  heldSec: number;
  /** Minuteur : secondes restantes (arrondies au-dessus), `null` en chrono. */
  remainingSec: number | null;
  /** Minuteur : avancement 0..1, `null` en chrono. */
  progress: number | null;
}

/** Ce que montre l'écran à l'instant `now`. Une horloge qui recule ne donne jamais de temps
 *  négatif. */
export function holdView(run: HoldRun, now: number): HoldView {
  const elapsed = Math.max(0, now - run.startedAt);
  const prepMs = run.prepSec * 1000;
  if (elapsed < prepMs) {
    return {
      phase: 'prep',
      prepLeft: Math.ceil((prepMs - elapsed) / 1000),
      heldSec: 0,
      remainingSec: run.mode === 'timer' ? run.targetSec : null,
      progress: run.mode === 'timer' ? 0 : null,
    };
  }
  const heldMs = elapsed - prepMs;
  if (run.mode === 'timer') {
    const targetMs = run.targetSec * 1000;
    if (heldMs >= targetMs) {
      return { phase: 'done', prepLeft: 0, heldSec: run.targetSec, remainingSec: 0, progress: 1 };
    }
    return {
      phase: 'run',
      prepLeft: 0,
      heldSec: Math.floor(heldMs / 1000),
      remainingSec: Math.ceil((targetMs - heldMs) / 1000),
      progress: heldMs / targetMs,
    };
  }
  return {
    phase: 'run',
    prepLeft: 0,
    heldSec: Math.floor(heldMs / 1000),
    remainingSec: null,
    progress: null,
  };
}

/** Combien de secondes enregistrer si on s'arrête MAINTENANT : la préparation ne compte
 *  jamais, un minuteur terminé vaut exactement sa cible, un arrêt anticipé vaut le temps
 *  réellement tenu. */
export function holdLoggedSec(view: HoldView): number {
  return view.phase === 'prep' ? 0 : view.heldSec;
}

export type HoldCue = 'tick' | 'go' | 'end';

/**
 * Les signaux à émettre en passant de `prev` à `next` (appelé à chaque rafraîchissement).
 * - `tick` : les 3 dernières secondes avant le départ ET avant la fin d'un minuteur ;
 * - `go`   : la tenue commence ;
 * - `end`  : le minuteur arrive à sa cible.
 * Chacun une seule fois (comparaison des états, pas de l'horloge) : un rafraîchissement
 * tardif n'en émet pas deux, et un saut dans le temps n'invente pas de « tick ».
 */
export function holdCues(prev: HoldView | null, next: HoldView): HoldCue[] {
  const out: HoldCue[] = [];
  if (next.phase === 'prep') {
    if (
      next.prepLeft >= 1 &&
      next.prepLeft <= HOLD_COUNTDOWN_FROM &&
      prev?.phase === 'prep' &&
      prev.prepLeft !== next.prepLeft
    )
      out.push('tick');
    // Au tout début, un décompte de 3 s ou moins commence par son premier chiffre.
    if (
      !prev &&
      next.prepLeft >= 1 &&
      next.prepLeft <= HOLD_COUNTDOWN_FROM
    )
      out.push('tick');
    return out;
  }
  if (next.phase === 'run') {
    if (!prev || prev.phase === 'prep') out.push('go');
    else if (
      next.remainingSec !== null &&
      next.remainingSec >= 1 &&
      next.remainingSec <= HOLD_COUNTDOWN_FROM &&
      prev.remainingSec !== next.remainingSec
    )
      out.push('tick');
    return out;
  }
  // done
  if (prev?.phase !== 'done') {
    if (!prev || prev.phase === 'prep') out.push('go');
    out.push('end');
  }
  return out;
}

/** « 1:05 » — les secondes d'une tenue, au format minuteur. */
export function fmtHold(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Le pas du stepper de durée, borné. */
export function bumpTarget(current: number, dir: 1 | -1): number {
  const next = current + dir * HOLD_TARGET_STEP;
  return Math.min(HOLD_TARGET_MAX, Math.max(HOLD_TARGET_MIN, next));
}
