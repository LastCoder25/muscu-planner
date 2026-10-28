// muscleLevels.ts — NIVEAU PAR GROUPE MUSCULAIRE (pur/testable). AFFICHAGE SEUL : aucun effet
// de jeu (décision de l'utilisateur) et RIEN n'est stocké — tout est recalculé depuis
// l'historique COMPLET (bilans de séance + Défi 360 + challenges muscu + boss entre amis, les
// mêmes sources que `muscuTotal`), comme les autres pistes (`useProgress`).
//
// XP d'un muscle = l'XP de ses séries : chaque série valait déjà `reps × REP_XP + charge/500`
// dans `sessionXp` ; on y ajoute un petit socle par série (`SET_XP`) car, ici, il n'y a pas de
// durée de séance pour porter l'essentiel. Même barème que le reste (× `XP_MULT`), même courbe
// (`computeLevel`/`levelCost`). Le crédit suit `creditSets` : 1 au muscle principal, ½ à chaque
// secondaire (règle unique du graphe d'équilibre).
//
// ⚠️ SECONDAIRES : `LoggedExercise` ne porte que le muscle PRINCIPAL. Les secondaires se lisent
// dans la bibliothèque par id ; id inconnu (import IA, exo supprimé) → repli sur le principal
// seul, jamais d'invention.
//
// ⚖️ PRIME D'ÉQUILIBRE (frein doux contre la dérive). Sans elle, ne travailler que son muscle
// favori ferait grimper un niveau sans fin. L'XP BRUTE d'un muscle au-dessus du SEUIL
// `max(BRAKE_FLOOR_XP, BRAKE_RATIO × médiane des autres muscles)` ne compte plus qu'à
// `BRAKE_SLOPE` (½) — jamais retirée : un muscle qu'on travaille monte toujours, juste moins
// vite que s'il rattrapait les autres. La médiane porte sur les AUTRES (un muscle ne tire pas
// sa propre barre) ; le plancher évite qu'un débutant dont les autres muscles sont à zéro soit
// freiné dès ses premières séances. Fonction MONOTONE : plus d'entraînement (n'importe où) ne
// fait jamais baisser un niveau.
import type { SessionLog } from './types';
import { computeLevel, type LevelInfo } from './levels';
import { REP_XP, XP_MULT } from './athlete';
import { creditSets, sideVolumeItems, type BalanceInput, type VolumeItem } from './bodyBalance';
import { MUSCLE_LABELS, normMuscle } from './muscles';
import { isMuscuLog, type LogEntry } from './volume';

/** Socle d'XP par série (avant `XP_MULT`) : une série faite compte même à faible charge. */
export const SET_XP = 6;
/** Seuil de freinage = ce multiple de la médiane des AUTRES muscles (XP brute)… */
export const BRAKE_RATIO = 1.5;
/** …mais jamais sous ce plancher d'XP brute (≈ niveau 3) : un début de parcours n'est pas freiné. */
export const BRAKE_FLOOR_XP = 1000;
/** Part de l'XP au-delà du seuil qui compte encore. */
export const BRAKE_SLOPE = 0.5;

/** Les muscles suivis (clés normalisées) — ceux que la silhouette et le radar connaissent. */
export const LEVEL_MUSCLES: readonly string[] = Object.keys(MUSCLE_LABELS);

export interface MuscleLevel extends LevelInfo {
  /** XP brute, avant le frein d'équilibre. */
  rawXp: number;
  /** Vrai si le frein d'équilibre retire de l'XP à ce muscle. */
  braked: boolean;
}

export interface MuscleLevelsInput {
  sessions: readonly LogEntry[];
  /** Autres sources de muscu (facultatives : absentes = ne comptent pas). Les mêmes champs
   *  que le graphe d'équilibre, lus par `sideVolumeItems`. */
  combos?: BalanceInput['combos'];
  challenges?: BalanceInput['challenges'];
  bossHits?: BalanceInput['bossHits'];
  objective?: BalanceInput['objective'];
  /** Muscles secondaires d'un exo (bibliothèque) ; inconnu → principal seul. */
  secondaries: (exerciseId: string) => readonly string[] | null | undefined;
  /** Muscle principal d'un exo (bibliothèque), quand le bilan ne le porte pas. */
  primaries?: (exerciseId: string) => string | null | undefined;
}

/** XP d'une série, avant crédit aux muscles. Exo au temps : `reps` sont des secondes, donc le
 *  socle seul (30 s de gainage ne valent pas 30 répétitions). */
export function setXp(
  s: { reps?: number; load_kg?: number },
  unit: 'reps' | 'time' | undefined,
): number {
  const reps = s.reps || 0;
  if (!(reps > 0)) return 0;
  const work = unit === 'time' ? 0 : reps * REP_XP + ((s.load_kg || 0) * reps) / 500;
  return (SET_XP + work) * XP_MULT;
}

/** XP d'un élément de volume hors bilan (360, challenge, boss) : le MÊME barème qu'une série
 *  de séance — socle par série + reps — sur ses séries (fractionnaires) et ses reps faites.
 *  Un exo au temps porte `reps: 0` : socle seul, comme `setXp`. ⚠️ Le tonnage n'y figure pas
 *  (l'élément ne le porte pas) : une charge lourde y vaut un peu moins qu'en séance. */
export function itemXp(it: Pick<VolumeItem, 'sets' | 'reps'>): number {
  if (!(it.sets > 0)) return 0;
  return (it.sets * SET_XP + (it.reps || 0) * REP_XP) * XP_MULT;
}

/** XP BRUTE par muscle normalisé (muscu seulement : prépa, cardio, autres sports exclus).
 *  Sources : bilans de séance + Défi 360 + challenges muscu + boss entre amis.
 *  ⚠️ Pas de double compte par construction : le 360, les challenges et les boss n'écrivent
 *  JAMAIS de bilan dans `logs` (seules les sorties CARDIO ont un miroir `challenge_id`, et
 *  ce n'est pas de la muscu) — comme pour `muscuTotal` (useProgress). */
export function rawMuscleXp(i: MuscleLevelsInput): Record<string, number> {
  const tally: Record<string, number> = {};
  const side = sideVolumeItems({
    combos: i.combos ?? [],
    challenges: i.challenges ?? [],
    bossHits: i.bossHits ?? [],
    primaries: i.primaries ?? (() => undefined),
    objective: i.objective,
  });
  for (const it of side) creditSets(tally, it.primary, i.secondaries(it.exerciseId), itemXp(it));
  for (const e of i.sessions) {
    const log: SessionLog = e.log;
    if (!isMuscuLog(log)) continue;
    for (const ex of log.exercises ?? []) {
      const primary = ex.muscle_primary || i.primaries?.(ex.id);
      const secondary = i.secondaries(ex.id);
      for (const s of ex.performed ?? [])
        creditSets(tally, primary, secondary, setXp(s, ex.planned?.unit));
    }
  }
  return tally;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

/** Seuil au-delà duquel l'XP de `muscle` est freinée, vu les autres. */
export function brakeThreshold(raw: Readonly<Record<string, number>>, muscle: string): number {
  const others = LEVEL_MUSCLES.filter((m) => m !== muscle).map((m) => raw[m] ?? 0);
  return Math.max(BRAKE_FLOOR_XP, BRAKE_RATIO * median(others));
}

/** XP après la prime d'équilibre. */
export function brakedXp(raw: Readonly<Record<string, number>>, muscle: string): number {
  const x = raw[muscle] ?? 0;
  const t = brakeThreshold(raw, muscle);
  return x <= t ? x : t + (x - t) * BRAKE_SLOPE;
}

/** Niveau de chaque muscle suivi (les 11 clés sont toujours présentes : historique vide → niveau 1). */
export function muscleLevels(i: MuscleLevelsInput): Record<string, MuscleLevel> {
  const raw = rawMuscleXp(i);
  // Un nom hors vocabulaire (ne devrait pas arriver) ne devient pas un muscle suivi.
  const known: Record<string, number> = {};
  for (const m of LEVEL_MUSCLES) known[m] = raw[normMuscle(m)] ?? 0;
  const out: Record<string, MuscleLevel> = {};
  for (const m of LEVEL_MUSCLES) {
    const xp = brakedXp(known, m);
    out[m] = { ...computeLevel(xp), rawXp: Math.round(known[m]!), braked: xp < known[m]! };
  }
  return out;
}
