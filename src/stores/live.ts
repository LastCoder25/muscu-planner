// Store live — la séance en cours d'exécution.
// État persisté en localStorage (reprise après fermeture) ; sync Supabase
// uniquement à la fin via le store logs (insert session_log).
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref, computed } from 'vue';
import type {
  Session, SessionLog, ExerciseTarget, PerformedSet, LoggedExercise, Difficulty,
} from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';

export interface LiveSet {
  load_kg: number;
  reps: number;
  done: boolean;
  difficulty: number; // 0 = pas encore noté
  rir: number | null;
  comment: string;
}

export interface LiveExercise {
  id: string;
  name: string;
  muscle_primary: string | undefined;
  equipment: string | undefined;
  swapped_from: string | null;
  alternatives: string[];
  rest_seconds: number;
  planned: ExerciseTarget;
  bodyweight: boolean;
  sets: LiveSet[];
  exercise_comment: string;
}

export interface LiveRun {
  session_id: string;
  name: string;
  started_at: string;
  exIndex: number;
  exercises: LiveExercise[];
  free?: boolean; // séance libre (sans plan source) → session_id null au log
  readiness?: number; // forme du jour 1–5 (check pré-séance)
}

const keyFor = (sid: string) => `muscu:live:${sid}`;

export const useLiveStore = defineStore('live', () => {
  const run = ref<LiveRun | null>(null);

  const current = computed(() => run.value?.exercises[run.value.exIndex] ?? null);

  function persist() {
    if (run.value) localStorage.setItem(keyFor(run.value.session_id), JSON.stringify(run.value));
  }

  function hasSaved(sessionId: string) {
    return localStorage.getItem(keyFor(sessionId)) !== null;
  }

  // Démarre (ou reprend) l'exécution d'une session.
  // opts.light = séance allégée (−1 série/exo, plancher 2) ; opts.readiness = forme du jour.
  function start(session: Session, opts: { resume?: boolean; light?: boolean; readiness?: number } = {}) {
    const { resume = true, light = false, readiness } = opts;
    if (resume) {
      const saved = localStorage.getItem(keyFor(session.id));
      if (saved) {
        run.value = JSON.parse(saved) as LiveRun;
        return;
      }
    }
    run.value = {
      session_id: session.id,
      name: session.name,
      started_at: new Date().toISOString(),
      exIndex: 0,
      readiness,
      exercises: session.exercises.map((ex) => {
        const bodyweight = ex.target.load === 'bodyweight';
        const base = bodyweight ? (ex.target.added_kg ?? 0) : (ex.target.load_kg ?? 0);
        const blank = (load: number, reps: number): LiveSet => ({
          load_kg: load, reps, done: false, difficulty: 0, rir: null, comment: '',
        });
        // Séries détaillées (pyramide importée) si présentes, sinon dérivées de la cible.
        let sets: LiveSet[] = ex.prescription?.length
          ? ex.prescription.map((p) => blank(p.load_kg ?? base, p.reps))
          : Array.from({ length: ex.target.sets }, () => blank(base, ex.target.reps_min));
        if (light && sets.length > 2) sets = sets.slice(0, sets.length - 1);
        return {
          id: ex.id,
          name: ex.name,
          muscle_primary: ex.muscle_primary,
          equipment: ex.equipment,
          swapped_from: null,
          alternatives: ex.alternatives ?? [],
          rest_seconds: ex.rest_seconds,
          planned: ex.target,
          bodyweight,
          sets,
          exercise_comment: '',
        };
      }),
    };
    persist();
  }

  function clear() {
    if (run.value) localStorage.removeItem(keyFor(run.value.session_id));
    run.value = null;
  }

  // Abandonne une séance sauvegardée sans la charger (ex. depuis la Home).
  function discardSaved(sessionId: string) {
    localStorage.removeItem(keyFor(sessionId));
    if (run.value?.session_id === sessionId) run.value = null;
  }

  // ── Séance libre (sans plan source) ───────────────────
  function startFree(resume = true) {
    if (resume) {
      const saved = localStorage.getItem(keyFor('free'));
      if (saved) {
        run.value = JSON.parse(saved) as LiveRun;
        return;
      }
    }
    run.value = {
      session_id: 'free',
      free: true,
      name: 'Séance libre',
      started_at: new Date().toISOString(),
      exIndex: 0,
      exercises: [],
    };
    persist();
  }

  function addExercise(def: { id: string; name: string; muscle_primary?: string; equipment?: string; unit?: string | null }) {
    if (!run.value) return;
    const bodyweight = def.equipment === 'poids_du_corps';
    const isTime = def.unit === 'time';
    run.value.exercises.push({
      id: def.id,
      name: def.name,
      muscle_primary: def.muscle_primary,
      equipment: def.equipment,
      swapped_from: null,
      alternatives: [],
      rest_seconds: isTime ? 60 : 90,
      planned: isTime ? { sets: 0, reps_min: 0, reps_max: 0, unit: 'time' } : { sets: 0, reps_min: 0, reps_max: 0 },
      bodyweight,
      // Série créée NON validée : on note la difficulté après l'avoir faite (flux « valider »).
      sets: [{ load_kg: 0, reps: isTime ? 30 : 8, done: false, difficulty: 0, rir: null, comment: '' }],
      exercise_comment: '',
    });
    persist();
  }

  function removeExercise(i: number) {
    if (!run.value) return;
    run.value.exercises.splice(i, 1);
    persist();
  }

  function goToExercise(i: number) {
    if (!run.value) return;
    run.value.exIndex = Math.min(Math.max(0, i), run.value.exercises.length - 1);
    persist();
  }

  function addSet() {
    const ex = current.value;
    if (!ex) return;
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({
      load_kg: last?.load_kg ?? 0,
      reps: last?.reps ?? 8,
      done: false,
      difficulty: 0,
      rir: null,
      comment: '',
    });
    persist();
  }

  function removeSet(i: number) {
    const ex = current.value;
    if (!ex || ex.sets.length <= 1) return;
    ex.sets.splice(i, 1);
    persist();
  }

  // Remplace l'exo courant en conservant la charge des séries (trace swapped_from).
  function swapCurrent(target: { id: string; name: string; muscle_primary?: string; equipment?: string }) {
    const ex = current.value;
    if (!ex) return;
    ex.swapped_from = ex.id;
    ex.id = target.id;
    ex.name = target.name;
    ex.muscle_primary = target.muscle_primary;
    ex.equipment = target.equipment;
    ex.alternatives = [];
    persist();
  }

  // Construit le SessionLog final (réimportable par progression.ts).
  function buildLog(global: { difficulty: number; comment: string }): SessionLog {
    const r = run.value;
    if (!r) throw new Error('Aucune séance en cours.');
    const ended = new Date();
    const duration = Math.max(1, Math.round((ended.getTime() - new Date(r.started_at).getTime()) / 60000));

    const log: SessionLog = {
      schema_version: SCHEMA_VERSION,
      type: 'session_log',
      id: crypto.randomUUID(),
      session_id: r.free ? undefined : r.session_id,
      name: r.name,
      started_at: r.started_at,
      ended_at: ended.toISOString(),
      duration_min: duration,
      exercises: r.exercises.map<LoggedExercise>((ex) => ({
        id: ex.id,
        name: ex.name,
        swapped_from: ex.swapped_from,
        planned: ex.planned,
        performed: ex.sets
          .filter((s) => s.done)
          .map<PerformedSet>((s, i) => {
            const ps: PerformedSet = {
              set: i + 1,
              load_kg: s.load_kg,
              reps: s.reps,
              difficulty: (s.difficulty || 2) as Difficulty,
            };
            if (s.rir != null) ps.rir = s.rir;
            if (s.comment) ps.comment = s.comment;
            return ps;
          }),
        exercise_comment: ex.exercise_comment || '',
      })),
    };
    if (global.difficulty) log.global_difficulty = global.difficulty as Difficulty;
    if (global.comment) log.global_comment = global.comment;
    if (r.readiness != null) log.readiness = r.readiness;
    return log;
  }

  return {
    run, current, persist, hasSaved, start, clear, discardSaved,
    startFree, addExercise, removeExercise,
    goToExercise, addSet, removeSet, swapCurrent, buildLog,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLiveStore, import.meta.hot));
}
