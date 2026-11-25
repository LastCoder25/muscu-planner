// comboVolumeAdvice.ts — LE CONSEIL DE VOLUME À LA CRÉATION D'UN DÉFI 360 (v1.359.0 ; demandé :
// « avertir si le volume est un peu gros pour la durée, ou un peu faible pour avoir des gains —
// sans que ce soit forcément négatif : la personne peut être en reprise, ou charger moins lourd »).
// Pur (aucune dépendance Vue/Supabase).
//
// ⚠️ CE N'EST PAS UN VERDICT, C'EST UN REPÈRE. Le ton est celui de l'information : « léger » est
// une bonne nouvelle pour une reprise, « soutenu » en est une pour qui charge moins lourd que
// d'habitude. Le conseil ne bloque jamais rien et ne change jamais le volume choisi.
//
// LA MESURE : les séries d'un groupe ramenées à une SEMAINE (séries × 7 / durée), puisque les
// objectifs du 360 sont déjà mis au prorata des jours (`comboProrata`) : c'est le RYTHME qui dit si
// on en demande beaucoup, pas le total d'une fenêtre courte. Repères de séries directes par groupe
// et par semaine (ordres de grandeur de la littérature sur le volume d'entraînement : en dessous
// de ~8 à 12 selon l'expérience, de quoi entretenir plus que progresser ; jusqu'à ~14 à 22, la zone
// où l'on progresse ; au-delà, de plus en plus de fatigue pour un gain qui s'émousse). Un groupe
// ACCESSOIRE est ramené à l'échelle d'un groupe essentiel (l'app lui vise 30 % de moins). ⚠️ Des heuristiques, pas des mesures
// faites sur cette app : elles se règlent ici, au même endroit.
//
// LA DURÉE COURTE : sur 4 jours ou moins, un même muscle a moins de temps pour récupérer entre
// deux séances (48 h entre deux passages = 2 passages au plus sur 3 jours). Les seuils « soutenu »
// et « très gros » descendent alors de `SHORT_WINDOW_EASE` séries, et le texte le dit.
import type { Level } from '@/lib/types';
import { COMBO_MAX_DAYS, COMBO_MIN_DAYS } from '@/lib/combo';

export type VolumeTone = 'light' | 'ok' | 'high' | 'veryHigh';

/** En dessous : volume léger, selon l'expérience (un débutant progresse déjà avec moins). Calés
 *  pour que le préréglage « léger » de l'app tombe en « léger » et « modéré » en « zone de
 *  progression » à chaque niveau (cf. `comboWeeklySets`) — un test le verrouille. */
export const VOLUME_LIGHT_BELOW: Record<Level, number> = {
  debutant: 8,
  intermediaire: 10,
  avance: 12,
};
/** Une fenêtre de ce nombre de jours ou moins est « courte ». */
export const SHORT_WINDOW_DAYS = 4;
/** De combien les seuils haut descendent sur une fenêtre courte (séries/sem). */
export const SHORT_WINDOW_EASE = 3;
/** Écart entre « soutenu » et « très gros ». */
const VERY_HIGH_GAP = 6;

/** Seuil « soutenu » (séries directes / groupe / semaine) selon l'expérience : un débutant
 *  récupère moins vite qu'un pratiquant aguerri. */
const HIGH_FROM: Record<Level, number> = { debutant: 14, intermediaire: 18, avance: 22 };

export interface VolumeGroupInput {
  slot: string;
  /** Séries visées sur la durée choisie (pas par semaine). */
  sets: number;
  /** Groupe accessoire (bras, épaules, mollets…) : l'app lui vise 30 % de moins (`comboWeeklySets`),
   *  on le ramène à l'échelle d'un groupe essentiel avant de comparer. Absent = essentiel. */
  essential?: boolean;
}

/** Part du volume d'un groupe essentiel que vise un groupe accessoire (cf. `comboWeeklySets`). */
const ACCESSORY_SHARE = 0.7;

export interface VolumeAdvice {
  tone: VolumeTone;
  /** Séries par groupe et par semaine, moyenne ramenée à 7 jours. */
  perWeek: number;
  /** Fenêtre de 4 jours ou moins. */
  shortWindow: boolean;
  /** Groupes nettement au-dessus du reste (clés d'emplacement) — vide quand tout est homogène. */
  hot: string[];
  /** Titre court (pour une pastille). */
  title: string;
  /** Une à deux phrases, ton neutre. */
  text: string;
}

function thresholds(level: Level, short: boolean): { high: number; veryHigh: number } {
  const high = HIGH_FROM[level] - (short ? SHORT_WINDOW_EASE : 0);
  return { high, veryHigh: high + VERY_HIGH_GAP };
}

export function volumeTone(perWeek: number, level: Level, shortWindow: boolean): VolumeTone {
  const t = thresholds(level, shortWindow);
  if (perWeek < VOLUME_LIGHT_BELOW[level]) return 'light';
  if (perWeek >= t.veryHigh) return 'veryHigh';
  if (perWeek >= t.high) return 'high';
  return 'ok';
}

const RANK: Record<VolumeTone, number> = { light: 0, ok: 1, high: 2, veryHigh: 3 };

/** Le conseil pour un défi de `duration` jours dont les groupes portent `groups[].sets` séries.
 *  null s'il n'y a aucun groupe avec des séries. Ne dépend ni de l'ordre ni des doublons. */
export function comboVolumeAdvice(input: {
  level: Level;
  duration: number;
  groups: readonly VolumeGroupInput[];
}): VolumeAdvice | null {
  const groups = input.groups.filter((g) => g.sets > 0);
  if (!groups.length) return null;
  const days = Math.min(COMBO_MAX_DAYS, Math.max(COMBO_MIN_DAYS, Math.round(input.duration)));
  const shortWindow = days <= SHORT_WINDOW_DAYS;
  const weekly = (g: VolumeGroupInput) =>
    (g.sets * 7) / days / (g.essential === false ? ACCESSORY_SHARE : 1);
  const avg = groups.reduce((a, g) => a + weekly(g), 0) / groups.length;
  const TONES: VolumeTone[] = ['light', 'ok', 'high', 'veryHigh'];
  const worst = Math.max(...groups.map((g) => RANK[volumeTone(weekly(g), input.level, shortWindow)]));
  // La moyenne ne doit pas cacher un groupe très chargé : le ton monte d'un cran sous le pire groupe
  // (un « très gros » isolé fait au moins « soutenu », un « soutenu » isolé au moins « zone de progression »).
  const tone = TONES[Math.max(RANK[volumeTone(avg, input.level, shortWindow)], worst - 1)]!;
  const perWeek = Math.round(avg);
  // Les groupes plus chargés que le ton retenu : ils méritent d'être nommés.
  const hot = groups
    .filter((g) => RANK[volumeTone(weekly(g), input.level, shortWindow)] > RANK[tone])
    .map((g) => g.slot);
  const w = shortWindow
    ? ` Sur ${days} jours, un même muscle a moins de temps pour récupérer entre deux séances.`
    : '';
  const COPY: Record<VolumeTone, { title: string; text: string }> = {
    light: {
      title: '🌱 Volume léger',
      text:
        `≈ ${perWeek} séries par groupe et par semaine : idéal pour une reprise, un retour de ` +
        'blessure ou une semaine de décharge. Pour progresser, vise plutôt 10 à 12 séries par ' +
        'groupe et par semaine.',
    },
    ok: {
      title: '✅ Zone de progression',
      text: `≈ ${perWeek} séries par groupe et par semaine : de quoi progresser sans trop de fatigue.`,
    },
    high: {
      title: '💪 Volume soutenu',
      text:
        `≈ ${perWeek} séries par groupe et par semaine : bien si tu es en forme ou si tu charges ` +
        `moins lourd que d'habitude ; sinon, garde de la marge pour récupérer.${w}`,
    },
    veryHigh: {
      title: '🔥 Très gros volume',
      text:
        `≈ ${perWeek} séries par groupe et par semaine : avec tes charges habituelles, le risque de ` +
        'surcharge et de blessure monte. Pertinent si c’est voulu (charges légères, bonne ' +
        `récupération) ; sinon, baisse un peu le volume ou allonge la durée.${w}`,
    },
  };
  return { tone, perWeek, shortWindow, hot, ...COPY[tone] };
}
