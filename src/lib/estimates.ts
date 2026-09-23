// estimates.ts — estimation de force (1RM) à partir des séries réalisées.
// Pur (aucune dépendance Vue/Supabase). Consommé par le Bilan (Étape 4.1)
// et l'affichage de tendances. Formule d'Epley.
import type { PerformedSet, Session, SessionLog } from './types';
import { warmupSeconds } from './warmup';

function round(n: number, step = 0.25): number {
  return Math.round(n / step) * step;
}

/** 1RM estimé (Epley) : load * (1 + reps/30). reps<=0 → 0 ; reps===1 → load. */
export function estimate1RM(loadKg: number, reps: number): number {
  if (loadKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return round(loadKg);
  return round(loadKg * (1 + reps / 30));
}

/**
 * La série qui produit le MEILLEUR 1RM estimé, et sa valeur. `null` si aucune série
 * chargée. Source unique de « quelle série est la meilleure » : `bestE1RM` en dérive,
 * et le mur de records s'en sert pour montrer la série RÉELLE (« 100 kg × 5 »), qui
 * parle bien plus qu'un 1RM estimé qu'on n'a jamais soulevé.
 */
export function bestSetE1RM(performed: PerformedSet[]): { set: PerformedSet; e1rm: number } | null {
  let best: { set: PerformedSet; e1rm: number } | null = null;
  for (const s of performed) {
    const e = estimate1RM(s.load_kg, s.reps);
    if (e > 0 && (!best || e > best.e1rm)) best = { set: s, e1rm: e };
  }
  return best;
}

/** Meilleur 1RM estimé parmi les séries réalisées (ignore les séries sans charge). */
export function bestE1RM(performed: PerformedSet[]): number {
  return bestSetE1RM(performed)?.e1rm ?? 0;
}

/** Un record de force battu sur un exercice. */
export interface LiftPR {
  id: string;
  name: string;
  e1rm: number; // nouveau meilleur 1RM estimé
  prev: number; // ancien meilleur (> 0)
  gain: number; // e1rm − prev (kg)
}

/**
 * Records de force battus dans `current` par rapport aux bilans `priors` (antérieurs,
 * current EXCLU). Pour chaque exercice dont le meilleur 1RM estimé DÉPASSE son
 * meilleur antérieur (> 0 → on ne « célèbre » pas un premier passage). Match par id
 * d'exercice. Pur — sert au Bilan pour féliciter (les PR muscu n'étaient jamais
 * détectés, seul le cardio avait ses records).
 */
export function detectLiftPRs(current: SessionLog, priors: SessionLog[]): LiftPR[] {
  const prevBest = new Map<string, number>();
  for (const log of priors) {
    for (const ex of log.exercises ?? []) {
      const e = bestE1RM(ex.performed ?? []);
      if (e > (prevBest.get(ex.id) ?? 0)) prevBest.set(ex.id, e);
    }
  }
  const out: LiftPR[] = [];
  const seen = new Set<string>();
  for (const ex of current.exercises ?? []) {
    if (seen.has(ex.id)) continue;
    const e = bestE1RM(ex.performed ?? []);
    if (e <= 0) continue;
    const prev = prevBest.get(ex.id) ?? 0;
    if (prev > 0 && e > prev) {
      out.push({ id: ex.id, name: ex.name, e1rm: e, prev, gain: Math.round((e - prev) * 10) / 10 });
      seen.add(ex.id);
    }
  }
  return out.sort((a, b) => b.e1rm - a.e1rm);
}

/** Le record de force d'un exercice : sa meilleure série, et quand elle a été faite. */
export interface PersonalRecord {
  id: string;
  name: string;
  muscle?: string;
  e1rm: number;
  load: number; // la charge RÉELLE de la série record
  reps: number; // ses répétitions
  dateIso: string; // jour où le record a été ÉTABLI (YYYY-MM-DD)
  sessions: number; // nombre de séances où l'exercice apparaît chargé
}

/**
 * Le mur de records : un record par exercice, du plus lourd au plus léger.
 *
 * ⚠️ On rend la SÉRIE qui a produit le record, pas seulement le 1RM estimé : « 100 kg × 5 »
 * est un souvenir, « 116,7 kg » est un calcul qu'on n'a jamais soulevé.
 *
 * ⚠️ À valeur ÉGALE, on garde la date la PLUS ANCIENNE : un record s'établit une fois ; le
 * refaire ne le déplace pas dans le temps. Sans cette règle, répéter sa meilleure série
 * ferait rajeunir le record à chaque séance et « depuis quand ? » ne voudrait plus rien dire.
 *
 * Les exercices sans charge (poids du corps, gainage) n'ont pas de record de FORCE et
 * sortent d'eux-mêmes : leur 1RM estimé vaut 0. Les séries d'approche, elles, ne sont
 * jamais dans le log (cf. warmup.ts) — rien à filtrer ici.
 */
export function personalRecords(
  logs: { performedAt: string; log: SessionLog }[],
): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  // Du plus ancien au plus récent : le nom retenu sera donc le plus récent (un exercice
  // peut être renommé en base), et « la plus ancienne date à valeur égale » tombe tout seul.
  const ordered = [...logs].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  for (const { performedAt, log } of ordered) {
    const day = performedAt.slice(0, 10);
    for (const ex of log.exercises ?? []) {
      const top = bestSetE1RM(ex.performed ?? []);
      if (!top) continue;
      const prev = best.get(ex.id);
      const rec: PersonalRecord = {
        id: ex.id,
        name: ex.name,
        e1rm: top.e1rm,
        load: top.set.load_kg,
        reps: top.set.reps,
        dateIso: day,
        sessions: (prev?.sessions ?? 0) + 1,
      };
      if (ex.muscle_primary) rec.muscle = ex.muscle_primary;
      // Strictement supérieur : une égalité laisse le record à sa date d'origine.
      if (!prev || top.e1rm > prev.e1rm) best.set(ex.id, rec);
      else best.set(ex.id, { ...prev, name: ex.name, sessions: rec.sessions });
    }
  }
  return [...best.values()].sort((a, b) => b.e1rm - a.e1rm || a.name.localeCompare(b.name, 'fr'));
}

/**
 * Durée estimée d'une séance (minutes). Pour chaque série : repos + exécution
 * (≈ secondes pour le gainage `unit:'time'`, sinon ~4 s/rep, plancher 30 s).
 * + ~1 min de mise en place par exercice (installation / réglage de la charge)
 * + ~5 min d'échauffement général. Compte les séries réelles (prescription si
 * présente). Bien plus réaliste qu'un simple cumul des pauses.
 */
const WARMUP_SEC = 5 * 60;
const SETUP_PER_EXERCISE_SEC = 60;

export function estimateDurationMin(session: Session): number {
  if (session.exercises.length === 0) return 1;
  let sec = WARMUP_SEC;
  for (const ex of session.exercises) {
    const exRest = ex.rest_seconds ?? 90;
    const isTime = ex.target.unit === 'time';
    const repsAvg = ((ex.target.reps_min ?? 0) + (ex.target.reps_max ?? 0)) / 2 || 10;
    const exec = isTime ? repsAvg : Math.max(30, repsAvg * 4);
    const sides = ex.unilateral ? 2 : 1; // unilatéral : exécution des deux côtés
    sec += SETUP_PER_EXERCISE_SEC;
    // Montée en charge (dérivée, cf. warmup.ts). Le forfait `WARMUP_SEC` couvre
    // l'échauffement GÉNÉRAL (entrée en salle, mobilité) ; ceci couvre les approches
    // à la barre, qui ne se voient nulle part ailleurs dans la durée.
    sec += warmupSeconds(ex);
    if (ex.prescription?.length) {
      // Repos propre à chaque série (pyramide importée : repos croissant).
      for (const p of ex.prescription) sec += (p.rest_seconds ?? exRest) + exec * sides;
    } else {
      sec += (ex.target.sets || 0) * (exRest + exec * sides);
    }
  }
  return Math.max(1, Math.round(sec / 60));
}
