// 🗓️ QUÊTES DE LA SEMAINE (v0.1209 ; décisions de l'utilisateur, 2026-09-27 : « quête qui
// paie », « 3 objectifs chaque lundi », « objectifs de SPORT seulement », « 2 tickets »).
//
// Trois objectifs de sport, tirés chaque lundi (jour logique, bascule à 4 h), valables
// jusqu'au dimanche. Les trois bouclés → **2 tickets d'invocation 🎟️**. Ce qui n'est pas fait
// est perdu, sans pénalité : il n'y a rien à rattraper, la semaine suivante repart à zéro.
//
// ⚠️ OBJECTIFS DE SPORT SEULEMENT, et c'est ce qui garde la règle des tickets intacte : ils
// ne se gagnent QUE par le sport (les pierres de mana 💠 se gagnent en jouant). Un objectif de
// jeu (failles, sièges) aurait cassé cette séparation.
//
// ⚠️ ON PAIE UNE ÉTAPE, PAS LE VOLUME (doctrine des tickets, v0.992) : les objectifs se
// comptent en JOURS et en minutes de sortie — ils ne repaient pas l'XP déjà versée par chaque
// séance, ils disent « ta semaine est bouclée ».
//
// ⚠️ LES CIBLES SONT CALÉES SUR TON HISTORIQUE (les 4 semaines complètes AVANT ce lundi) :
// une cible fixe serait triviale pour un joueur très actif et hors de portée pour celui qui
// vient une fois par semaine. Elles ne dépendent que du passé, donc elles ne bougent pas
// pendant la semaine — et rien n'est à stocker.
//
// Module pur : les dates sont des chaînes `YYYY-MM-DD` comparées en chaînes, l'aujourd'hui est
// PASSÉ par l'appelant (leçon `activityDays.ts`).

import { legSets, type ComboChallenge } from './combo';
import { isCardioTrackChallenge } from '@/data/cardio';
import { seedOf } from './combat';

export type QuestKind = 'active_days' | 'strength_days' | 'cardio_minutes' | 'variety';
export type SportKind = 'muscu' | 'cardio' | 'tennis';

export const WEEKLY_QUESTS = {
  /** Tickets 🎟️ d'une semaine entièrement bouclée (décision de l'utilisateur). */
  tickets: 2,
  /** Semaines d'historique qui calent les cibles. */
  historyWeeks: 4,
  /** Minutes de sortie : cible = moyenne × cette marge, bornée. */
  cardioPush: 1.15,
  cardioMin: 30,
  cardioMax: 300,
} as const;

/** Tout ce qui témoigne d'une pratique, avec ce qu'il faut pour la CLASSER. Même famille que
 *  `ActivitySources` (chaque champ requis : oublier une source ne compile pas). */
export interface QuestSources {
  /** `session_logs` : muscu, séance libre, prépa physique. */
  sessions: { performed_at?: string | null }[];
  /** Sorties cardio (miroirs compris : ils reflètent une vraie sortie de défi). */
  cardio: { performed_at?: string | null; payload?: { duration_min?: number | null } | null }[];
  /** Séances sur le court. */
  tennis: { performed_at?: string | null }[];
  /** Défis solo. */
  challenges: {
    unit: string;
    exercise_id: string;
    config?: { discipline?: string | null } | null;
    progress: { date: string; done: number }[];
  }[];
  /** Défi 360. */
  combos: ComboChallenge[];
  /** Boss entre amis : mes saisies. */
  bossHits: { createdAt: number }[];
}

export interface QuestEntry {
  day: string;
  kind: SportKind;
  /** Minutes de sortie cardio (0 pour le reste). */
  minutes: number;
}

const dayOf = (iso: string | null | undefined): string | null =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : null;

/** Toutes les pratiques, datées et classées. */
export function questEntries(src: QuestSources): QuestEntry[] {
  const out: QuestEntry[] = [];
  const push = (iso: string | null | undefined, kind: SportKind, minutes = 0) => {
    const d = dayOf(iso);
    if (d) out.push({ day: d, kind, minutes });
  };
  for (const r of src.sessions) push(r.performed_at, 'muscu');
  for (const r of src.cardio)
    push(r.performed_at, 'cardio', Math.max(0, Number(r.payload?.duration_min) || 0));
  for (const r of src.tennis) push(r.performed_at, 'tennis');
  for (const c of src.challenges) {
    // ⚠️ La VOIE du défi (`challengeLane`) : une sortie reste du cardio, un défi tennis du tennis.
    const kind: SportKind = isCardioTrackChallenge(c)
      ? 'cardio'
      : c.config?.discipline === 'tennis'
        ? 'tennis'
        : 'muscu';
    // ⚠️ `done > 0` : les journées d'un défi existent d'avance, une journée vide ne compte pas.
    // Pas de minutes : les minutes d'un défi de sortie sont DÉJÀ dans sa sortie miroir.
    for (const p of c.progress) if (p.done > 0) push(p.date, kind);
  }
  for (const c of src.combos)
    for (const leg of c.legs) for (const s of legSets(leg)) if (s.reps > 0) push(s.date, 'muscu');
  for (const h of src.bossHits)
    if (h.createdAt > 0) push(new Date(h.createdAt).toISOString(), 'muscu');
  return out;
}

const DAY_MS = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fmt(parse(d) + n * DAY_MS);

/** Le lundi de la semaine qui contient `day` (UTC explicite : pas d'aller-retour de fuseau). */
export function weekStart(day: string): string {
  const dow = new Date(parse(day)).getUTCDay(); // 0 = dimanche
  return addDays(day, -((dow + 6) % 7));
}

interface WeekStats {
  activeDays: number;
  strengthDays: number;
  cardioMinutes: number;
  kinds: number;
}

/** Ce qu'une semaine [monday, monday+6] a produit. */
function weekStats(entries: QuestEntry[], monday: string): WeekStats {
  const end = addDays(monday, 6);
  const active = new Set<string>();
  const strength = new Set<string>();
  const kinds = new Set<SportKind>();
  let minutes = 0;
  for (const e of entries) {
    if (e.day < monday || e.day > end) continue;
    active.add(e.day);
    kinds.add(e.kind);
    if (e.kind === 'muscu') strength.add(e.day);
    minutes += e.minutes;
  }
  return {
    activeDays: active.size,
    strengthDays: strength.size,
    cardioMinutes: Math.round(minutes),
    kinds: kinds.size,
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Les cibles de la semaine, calées sur les `historyWeeks` semaines complètes d'avant. */
export function questTargets(entries: QuestEntry[], monday: string): Record<QuestKind, number> {
  const n = WEEKLY_QUESTS.historyWeeks;
  let a = 0;
  let s = 0;
  let c = 0;
  for (let w = 1; w <= n; w++) {
    const st = weekStats(entries, addDays(monday, -7 * w));
    a += st.activeDays;
    s += st.strengthDays;
    c += st.cardioMinutes;
  }
  a /= n;
  s /= n;
  c /= n;
  return {
    // Un cran au-dessus de sa moyenne tant qu'elle est modeste ; pas plus de 6 (un jour de repos).
    active_days: clamp(Math.round(a) + (a < 4 ? 1 : 0), 2, 6),
    strength_days: clamp(Math.round(s) + (s < 3 ? 1 : 0), 1, 4),
    cardio_minutes: clamp(
      Math.ceil((c * WEEKLY_QUESTS.cardioPush) / 10 - 1e-9) * 10,
      WEEKLY_QUESTS.cardioMin,
      WEEKLY_QUESTS.cardioMax,
    ),
    // Deux pratiques différentes (muscu, cardio, tennis) : la découverte, côté sport.
    variety: 2,
  };
}

export const QUEST_INFO: Record<QuestKind, { emoji: string; label: (t: number) => string }> = {
  active_days: { emoji: '📅', label: (t) => `Fais du sport ${t} jours` },
  strength_days: {
    emoji: '💪',
    label: (t) => `Muscu ${t} jour${t > 1 ? 's' : ''} (séance, défi ou 360)`,
  },
  cardio_minutes: { emoji: '🏃', label: (t) => `${t} min de sortie cardio` },
  variety: { emoji: '🎾', label: (t) => `${t} sports différents (muscu, cardio, tennis)` },
};

export interface WeeklyQuest {
  kind: QuestKind;
  target: number;
  done: number;
  complete: boolean;
}

export interface WeeklyQuestBoard {
  monday: string;
  sunday: string;
  quests: WeeklyQuest[];
  complete: boolean;
  /** Tickets à récupérer maintenant (0 si déjà récupérés ou semaine pas bouclée). */
  claimable: number;
  claimed: boolean;
}

/** Les 3 quêtes de la semaine de `today`. « Jours actifs » est toujours là (c'est le cœur de
 *  la semaine) ; les deux autres sont tirées sur la graine joueur + lundi — la même toute la
 *  semaine, différente d'un joueur à l'autre. `claimedWeek` = lundi de la dernière semaine
 *  récupérée. */
export function weeklyQuests(
  src: QuestSources,
  today: string,
  userId: string,
  claimedWeek: string | null,
): WeeklyQuestBoard {
  const entries = questEntries(src);
  const monday = weekStart(today);
  const targets = questTargets(entries, monday);
  const now = weekStats(entries, monday);
  const doneOf: Record<QuestKind, number> = {
    active_days: now.activeDays,
    strength_days: now.strengthDays,
    cardio_minutes: now.cardioMinutes,
    variety: now.kinds,
  };
  const pool: QuestKind[] = ['strength_days', 'cardio_minutes', 'variety'];
  const skip = seedOf(`${userId}|${monday}`) % pool.length;
  const kinds: QuestKind[] = ['active_days', ...pool.filter((_, i) => i !== skip)];
  const quests = kinds.map((kind) => {
    const target = targets[kind];
    const done = doneOf[kind];
    return { kind, target, done, complete: done >= target };
  });
  const complete = quests.every((q) => q.complete);
  const claimed = claimedWeek === monday;
  return {
    monday,
    sunday: addDays(monday, 6),
    quests,
    complete,
    claimed,
    claimable: complete && !claimed ? WEEKLY_QUESTS.tickets : 0,
  };
}
