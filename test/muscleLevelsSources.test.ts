import { describe, expect, it } from 'vitest';
import { makeBoss } from './helpers/friendBoss';
import { itemXp, muscleLevels, rawMuscleXp, SET_XP } from '@/lib/muscleLevels';
import { REP_XP, XP_MULT } from '@/lib/athlete';
import { bossDayKey } from '@/composables/useMyBossDays';
import {
  bossAgendaEntries,
  type FriendBoss,
  type FriendBossHit,
  type FriendBossMember,
} from '@/lib/friendBoss';
import type { ComboChallenge, ComboLeg } from '@/lib/combo';
import type { Challenge } from '@/lib/challenges';
import type { LogEntry } from '@/lib/volume';
import type { SessionLog } from '@/lib/types';

// Le niveau par muscle lit aussi le Défi 360, les challenges muscu et les boss entre amis
// (mêmes sources que `muscuTotal`), via `sideVolumeItems` du graphe d'équilibre.
// Objectif « hypertrophie » : une série vaut 10 reps.
const DAY = '2026-09-14';
const MOI = 'moi';
const SECONDARIES: Record<string, string[]> = { bench: ['triceps', 'épaules'] };
const PRIMARIES: Record<string, string> = { pushup: 'pectoraux', bench: 'pectoraux' };
const base = {
  objective: 'hypertrophie' as const,
  secondaries: (id: string) => SECONDARIES[id],
  primaries: (id: string) => PRIMARIES[id],
};

/** XP d'une série de 10 reps sans charge, et de 60 reps en 6 séries. */
const SET10 = (SET_XP + 10 * REP_XP) * XP_MULT;
const SIX = 6 * SET10;

function leg(reps: number[], p: Partial<ComboLeg> = {}): ComboLeg {
  return {
    slot: 'push',
    exercise_id: 'pushup',
    exercise_name: 'Pompes',
    muscle_primary: 'pectoraux',
    rep_weight: 1,
    target: 30,
    progress: reps.map((r) => ({ date: DAY, reps: r })),
    ...p,
  } as ComboLeg;
}
const combo = (legs: ComboLeg[]): ComboChallenge =>
  ({
    id: 'c1',
    name: '360',
    start_date: DAY,
    duration_days: 7,
    status: 'active',
    legs,
  }) as ComboChallenge;

function challenge(done: number, p: Partial<Challenge> = {}): Challenge {
  return {
    id: 'ch1',
    exercise_id: 'pushup',
    exercise_name: 'Pompes',
    muscle_primary: 'pectoraux',
    unit: 'reps',
    format: 'fixed',
    duration_days: 7,
    start_date: DAY,
    config: { start: 30 },
    daily_targets: Array.from({ length: 7 }, () => 30),
    progress: [{ day: 0, date: DAY, target: 30, done, elapsed_sec: 0, completed: false }],
    status: 'active',
    ...p,
  } as Challenge;
}

const boss = (p: Partial<FriendBoss> = {}): FriendBoss =>
  makeBoss({
    ownerId: MOI,
    exerciseId: 'pushup',
    createdAt: Date.parse(`${DAY}T12:00:00`),
    startAt: Date.parse(`${DAY}T12:00:00`),
    hpTotal: 100_000,
    ...p,
  });
const membre: FriendBossMember = {
  bossId: 'b1',
  userId: MOI,
  pseudo: 'Moi',
  status: 'accepted',
  units: 60,
  claimed: false,
};
const frappe = (units: number): FriendBossHit => ({
  id: `h${units}`,
  bossId: 'b1',
  userId: MOI,
  units,
  createdAt: Date.parse(`${DAY}T12:00:00`),
});
// La chaîne RÉELLE (groupement de l'Agenda, clé de jour de production).
const hits = (b: FriendBoss, m: FriendBossMember[], h: FriendBossHit[]) =>
  bossAgendaEntries([b], m, h, MOI, bossDayKey);

function session(sets: number, primary = 'pectoraux'): LogEntry {
  const log = {
    schema_version: '1.0',
    type: 'session_log',
    id: 's1',
    exercises: [
      {
        id: 'bench',
        name: 'Développé couché',
        muscle_primary: primary,
        planned: {},
        performed: Array.from({ length: sets }, (_, k) => ({
          set: k + 1,
          load_kg: 0,
          reps: 10,
          difficulty: 2 as const,
        })),
      },
    ],
  } as SessionLog;
  return { performedAt: `${DAY}T10:00:00Z`, log };
}

describe('le niveau par muscle lit aussi 360, challenges et boss', () => {
  it('Défi 360 : 3 séries de 10 pompes valent 3 séries de séance', () => {
    const raw = rawMuscleXp({ ...base, sessions: [], combos: [combo([leg([10, 10, 10])])] });
    expect(raw.pectoraux).toBeCloseTo(3 * SET10, 6);
    const seance = rawMuscleXp({ ...base, sessions: [session(3)] });
    expect(raw.pectoraux).toBeCloseTo(seance.pectoraux!, 6);
  });

  it('challenge muscu : 60 reps = 6 séries + 60 reps', () => {
    const raw = rawMuscleXp({ ...base, sessions: [], challenges: [challenge(60)] });
    expect(raw.pectoraux).toBeCloseTo(SIX, 6);
  });

  it('boss entre amis : 60 pompes = 6 séries + 60 reps', () => {
    const raw = rawMuscleXp({
      ...base,
      sessions: [],
      bossHits: hits(boss(), [membre], [frappe(60)]),
    });
    expect(raw.pectoraux).toBeCloseTo(SIX, 6);
  });

  it('les trois sources et la séance S’ADDITIONNENT (chacune une fois)', () => {
    const raw = rawMuscleXp({
      ...base,
      sessions: [session(3)],
      combos: [combo([leg([10, 10, 10])])],
      challenges: [challenge(60)],
      bossHits: hits(boss(), [membre], [frappe(60)]),
    });
    expect(raw.pectoraux).toBeCloseTo(3 * SET10 + 3 * SET10 + SIX + SIX, 6);
  });

  it('⚠️ pas de double compte : relire la même entrée deux fois donne le même total', () => {
    const i = {
      ...base,
      sessions: [session(3)],
      combos: [combo([leg([10, 10, 10])])],
      challenges: [challenge(60)],
      bossHits: hits(boss(), [membre], [frappe(60)]),
    };
    expect(rawMuscleXp(i).pectoraux).toBe(rawMuscleXp(i).pectoraux);
    // Chaque source ne compte QUE par sa propre voie : retirer la séance ne touche pas aux autres.
    const sans = rawMuscleXp({ ...i, sessions: [] });
    expect(rawMuscleXp(i).pectoraux! - sans.pectoraux!).toBeCloseTo(3 * SET10, 6);
  });

  it('secondaire ½ pour une source hors séance (boss sur développé couché)', () => {
    const raw = rawMuscleXp({
      ...base,
      sessions: [],
      bossHits: hits(boss({ exerciseId: 'bench' }), [membre], [frappe(60)]),
    });
    expect(raw.pectoraux).toBeCloseTo(SIX, 6);
    expect(raw.triceps).toBeCloseTo(SIX / 2, 6);
    expect(raw['épaules']).toBeCloseTo(SIX / 2, 6);
  });

  it('exo au temps (boss gainage) : socle par série seulement, pas de reps', () => {
    const gainage = boss({ family: 'core', exerciseId: 'plank', exerciseName: 'Gainage' });
    const raw = rawMuscleXp({
      ...base,
      primaries: (id) => (id === 'plank' ? 'abdominaux' : PRIMARIES[id]),
      sessions: [],
      bossHits: hits(gainage, [membre], [frappe(90)]),
    });
    // 90 s ÷ 45 s = 2 séries, socle seul
    expect(raw.abdominaux).toBeCloseTo(2 * SET_XP * XP_MULT, 6);
  });

  it('boss de conditionnement et boss non accepté : rien', () => {
    expect(
      rawMuscleXp({
        ...base,
        sessions: [],
        bossHits: hits(boss({ family: 'conditioning' }), [membre], [frappe(60)]),
      }),
    ).toEqual({});
    expect(
      rawMuscleXp({
        ...base,
        sessions: [],
        bossHits: hits(boss(), [{ ...membre, status: 'invited' }], [frappe(60)]),
      }),
    ).toEqual({});
  });

  it('historique vide et sources absentes : rien, tous les niveaux à 1', () => {
    expect(
      rawMuscleXp({ ...base, sessions: [], combos: [], challenges: [], bossHits: [] }),
    ).toEqual({});
    expect(rawMuscleXp({ sessions: [], secondaries: () => undefined })).toEqual({});
    const lv = muscleLevels({ ...base, sessions: [] });
    expect(Object.values(lv).every((l) => l.level === 1)).toBe(true);
  });

  it('source absente : la séance compte seule, comme avant', () => {
    const raw = rawMuscleXp({ sessions: [session(3)], secondaries: () => undefined });
    expect(raw.pectoraux).toBeCloseTo(3 * SET10, 6);
  });

  it('le niveau monte avec les nouvelles sources (360 seul)', () => {
    const lots = Array.from({ length: 60 }, () => leg([10, 10, 10, 10, 10]));
    const lv = muscleLevels({ ...base, sessions: [], combos: [combo(lots)] });
    expect(lv.pectoraux!.level).toBeGreaterThan(1);
  });

  it('itemXp : séries × socle + reps, × XP_MULT ; rien sans série', () => {
    expect(itemXp({ sets: 2, reps: 20 })).toBeCloseTo((2 * SET_XP + 20 * REP_XP) * XP_MULT, 6);
    expect(itemXp({ sets: 0, reps: 20 })).toBe(0);
  });
});
