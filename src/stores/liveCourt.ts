// Store liveCourt — séance de tennis EN COURS d'exécution (runner court).
// Un seul run actif à la fois, persisté en localStorage (`muscu:court:run`) pour
// survivre à un rechargement / une sortie d'app. Construit le DrillLog en fin.
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import type { DrillSession, DrillLog, LoggedDrill, PlannedDrill, Difficulty } from '@/lib/types';
import { SCHEMA_VERSION } from '@/lib/types';

const KEY = 'muscu:court:run';

// Drill en cours = drill planifié + état d'exécution.
export interface RunDrill extends PlannedDrill {
  done: boolean;
  sets_done?: number;
  elapsed_sec?: number;
  difficulty?: Difficulty;
  comment?: string;
}

interface RunState {
  sessionId: string;
  name: string;
  sport: string;
  theme?: string;
  with_partner: boolean;
  startedAt: string;
  index: number;
  drills: RunDrill[];
}

function loadSaved(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RunState) : null;
  } catch {
    return null;
  }
}

export const useLiveCourtStore = defineStore('liveCourt', () => {
  const run = ref<RunState | null>(loadSaved());

  function persist() {
    if (run.value) localStorage.setItem(KEY, JSON.stringify(run.value));
    else localStorage.removeItem(KEY);
  }

  function start(session: DrillSession, opts: { resume?: boolean } = {}) {
    if (opts.resume && run.value && run.value.sessionId === session.id) return;
    run.value = {
      sessionId: session.id,
      name: session.name,
      sport: session.sport,
      ...(session.theme ? { theme: session.theme } : {}),
      with_partner: session.with_partner,
      startedAt: new Date().toISOString(),
      index: 0,
      drills: session.drills.map((d) => ({ ...d, done: false })),
    };
    persist();
  }

  function setIndex(i: number) {
    if (!run.value) return;
    run.value.index = Math.max(0, Math.min(run.value.drills.length - 1, i));
    persist();
  }

  function update(i: number, patch: Partial<RunDrill>) {
    if (!run.value) return;
    const d = run.value.drills[i];
    if (!d) return;
    Object.assign(d, patch);
    persist();
  }

  // Valide le drill courant et avance au prochain non fait (sinon reste).
  function validate(i: number, patch: Partial<RunDrill> = {}) {
    if (!run.value) return;
    update(i, { ...patch, done: true });
    const nextUndone = run.value.drills.findIndex((d, idx) => idx !== i && !d.done);
    if (nextUndone >= 0) setIndex(nextUndone);
    else persist();
  }

  function buildLog(opts: { global_comment?: string } = {}): DrillLog | null {
    if (!run.value) return null;
    const r = run.value;
    const done = r.drills.filter((d) => d.done);
    const drills: LoggedDrill[] = r.drills.map((d) => {
      const ld: LoggedDrill = { id: d.id, name: d.name, done: d.done };
      if (d.sets_done != null) ld.sets_done = d.sets_done;
      if (d.elapsed_sec != null) ld.elapsed_sec = d.elapsed_sec;
      if (d.difficulty != null) ld.difficulty = d.difficulty;
      if (d.comment) ld.comment = d.comment;
      return ld;
    });
    const rated = done.filter((d) => d.difficulty != null);
    const avg =
      rated.length > 0
        ? (Math.round(
            rated.reduce((a, d) => a + (d.difficulty ?? 0), 0) / rated.length,
          ) as Difficulty)
        : undefined;
    const ended = new Date().toISOString();
    const durationMin = Math.max(
      1,
      Math.round((Date.parse(ended) - Date.parse(r.startedAt)) / 60000),
    );
    const log: DrillLog = {
      schema_version: SCHEMA_VERSION,
      type: 'drill_log',
      id: crypto.randomUUID(),
      drill_session_id: r.sessionId,
      name: r.name,
      sport: r.sport,
      with_partner: r.with_partner,
      started_at: r.startedAt,
      ended_at: ended,
      duration_min: durationMin,
      ...(avg != null ? { global_difficulty: avg } : {}),
      ...(opts.global_comment ? { global_comment: opts.global_comment } : {}),
      drills,
    };
    return log;
  }

  function clear() {
    run.value = null;
    persist();
  }

  function hasSaved(): boolean {
    return !!loadSaved();
  }

  function savedMeta() {
    const s = run.value ?? loadSaved();
    if (!s) return null;
    return {
      sessionId: s.sessionId,
      name: s.name,
      done: s.drills.filter((d) => d.done).length,
      total: s.drills.length,
    };
  }

  function discardSaved() {
    clear();
  }

  return {
    run,
    start,
    setIndex,
    update,
    validate,
    buildLog,
    clear,
    hasSaved,
    savedMeta,
    discardSaved,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLiveCourtStore, import.meta.hot));
}
