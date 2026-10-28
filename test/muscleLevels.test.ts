import { describe, expect, it } from 'vitest';
import {
  BRAKE_FLOOR_XP,
  BRAKE_RATIO,
  BRAKE_SLOPE,
  LEVEL_MUSCLES,
  SET_XP,
  brakeThreshold,
  brakedXp,
  muscleLevels,
  rawMuscleXp,
  setXp,
} from '@/lib/muscleLevels';
import { computeLevel } from '@/lib/levels';
import { MUSCLE_LABELS } from '@/lib/muscles';
import { REP_XP, XP_MULT } from '@/lib/athlete';
import type { LogEntry } from '@/lib/volume';
import type { SessionLog } from '@/lib/types';

const none = () => undefined;

function entry(
  exos: {
    id: string;
    primary?: string;
    sets: number;
    reps?: number;
    load?: number;
    unit?: 'reps' | 'time';
  }[],
  discipline?: SessionLog['discipline'],
): LogEntry {
  const log = {
    schema_version: '1.0',
    type: 'session_log',
    id: 'x',
    ...(discipline ? { discipline } : {}),
    exercises: exos.map((e) => ({
      id: e.id,
      name: e.id,
      muscle_primary: e.primary,
      planned: e.unit ? { unit: e.unit } : {},
      performed: Array.from({ length: e.sets }, (_, k) => ({
        set: k + 1,
        load_kg: e.load ?? 0,
        reps: e.reps ?? 10,
        difficulty: 2 as const,
      })),
    })),
  } as SessionLog;
  return { performedAt: '2026-01-05T10:00:00Z', log };
}

const SET = (reps: number, load = 0) => (SET_XP + reps * REP_XP + (load * reps) / 500) * XP_MULT;

describe('XP brute par muscle', () => {
  it('une série vaut le socle + reps + tonnage, × XP_MULT, créditée au principal', () => {
    const raw = rawMuscleXp({
      sessions: [entry([{ id: 'bench', primary: 'pectoraux', sets: 3, reps: 8, load: 60 }])],
      secondaries: none,
    });
    expect(raw.pectoraux).toBeCloseTo(3 * SET(8, 60), 6);
  });

  it('un secondaire de la bibliothèque reçoit la MOITIÉ', () => {
    const raw = rawMuscleXp({
      sessions: [entry([{ id: 'bench', primary: 'pectoraux', sets: 4, reps: 8, load: 60 }])],
      secondaries: (id) => (id === 'bench' ? ['triceps', 'épaules'] : undefined),
    });
    expect(raw.triceps).toBeCloseTo(raw.pectoraux! / 2, 6);
    expect(raw['épaules']).toBeCloseTo(raw.pectoraux! / 2, 6);
  });

  it('id inconnu de la bibliothèque : repli sur le principal seul', () => {
    const raw = rawMuscleXp({
      sessions: [entry([{ id: 'import-ia', primary: 'dos', sets: 2 }])],
      secondaries: none,
    });
    expect(Object.keys(raw)).toEqual(['dos']);
  });

  it('principal absent du bilan : lu dans la bibliothèque, sinon rien (pas d’invention)', () => {
    const withLib = rawMuscleXp({
      sessions: [entry([{ id: 'curl', sets: 2 }])],
      secondaries: none,
      primaries: (id) => (id === 'curl' ? 'biceps' : undefined),
    });
    expect(withLib.biceps).toBeGreaterThan(0);
    const without = rawMuscleXp({
      sessions: [entry([{ id: 'curl', sets: 2 }])],
      secondaries: none,
    });
    expect(without).toEqual({});
  });

  it('exo au temps : les secondes ne valent pas des répétitions (socle seul)', () => {
    expect(setXp({ reps: 45, load_kg: 0 }, 'time')).toBe(SET_XP * XP_MULT);
    expect(setXp({ reps: 45, load_kg: 0 }, 'reps')).toBeGreaterThan(SET_XP * XP_MULT);
    const raw = rawMuscleXp({
      sessions: [
        entry([{ id: 'planche', primary: 'abdominaux', sets: 3, reps: 45, unit: 'time' }]),
      ],
      secondaries: none,
    });
    expect(raw.abdominaux).toBeCloseTo(3 * SET_XP * XP_MULT, 6);
  });

  it('une série à 0 rep (non faite) ne rapporte rien', () => {
    expect(setXp({ reps: 0, load_kg: 80 }, 'reps')).toBe(0);
  });

  it('seule la musculation compte (cardio, prépa, autre sport exclus)', () => {
    const raw = rawMuscleXp({
      sessions: [
        entry([{ id: 'a', primary: 'dos', sets: 3 }], 'prepa_physique'),
        entry([{ id: 'b', primary: 'dos', sets: 3 }], 'autre_sport'),
      ],
      secondaries: none,
    });
    expect(raw).toEqual({});
    const muscu = rawMuscleXp({
      sessions: [entry([{ id: 'b', primary: 'dos', sets: 3 }], 'musculation')],
      secondaries: none,
    });
    expect(muscu.dos).toBeGreaterThan(0);
  });

  it('les alias de nom sont rattachés (deltoïde antérieur → épaules)', () => {
    const raw = rawMuscleXp({
      sessions: [entry([{ id: 'a', primary: 'Deltoïde antérieur', sets: 1 }])],
      secondaries: none,
    });
    expect(raw['épaules']).toBeGreaterThan(0);
  });
});

describe("prime d'équilibre", () => {
  const flat = (v: number) => Object.fromEntries(LEVEL_MUSCLES.map((m) => [m, v]));

  it('sous le seuil, rien n’est retiré', () => {
    const raw = { ...flat(3000), pectoraux: 3000 * BRAKE_RATIO };
    expect(brakedXp(raw, 'pectoraux')).toBe(raw.pectoraux);
    // Strictement dessous (80 % du seuil) : intact aussi.
    const under = { ...flat(3000), pectoraux: 3000 * BRAKE_RATIO * 0.8 };
    expect(brakedXp(under, 'pectoraux')).toBe(under.pectoraux);
  });

  it('au-dessus du seuil, l’excédent ne compte qu’à BRAKE_SLOPE — freiné, jamais retiré', () => {
    const raw = { ...flat(3000), pectoraux: 10000 };
    const t = 3000 * BRAKE_RATIO;
    expect(brakeThreshold(raw, 'pectoraux')).toBe(t);
    expect(brakedXp(raw, 'pectoraux')).toBeCloseTo(t + (10000 - t) * BRAKE_SLOPE, 6);
    expect(brakedXp(raw, 'pectoraux')).toBeGreaterThan(t);
  });

  it('la médiane porte sur les AUTRES : un muscle ne relève pas sa propre barre', () => {
    // 10 muscles à 2000, un à 100000 : la médiane des autres reste 2000 (pas celle de tous).
    const raw = { ...flat(2000), dos: 100000 };
    expect(brakeThreshold(raw, 'dos')).toBe(2000 * BRAKE_RATIO);
    // Cas où la médiane de TOUS différerait : 5 muscles à 0, 6 à 5000. Médiane des autres
    // de l'un des 6 = (0 + 5000) / 2 ; avec lui, ce serait 5000.
    const split = Object.fromEntries(LEVEL_MUSCLES.map((m, k) => [m, k < 5 ? 0 : 5000]));
    expect(brakeThreshold(split, LEVEL_MUSCLES[10]!)).toBe(2500 * BRAKE_RATIO);
    // …et le seuil d'un AUTRE muscle ignore aussi la valeur extrême (médiane robuste).
    expect(brakeThreshold(raw, 'biceps')).toBe(2000 * BRAKE_RATIO);
  });

  it('plancher : tant que les autres sont à zéro, un début de parcours n’est pas freiné', () => {
    const raw = { ...flat(0), pectoraux: BRAKE_FLOOR_XP };
    expect(brakeThreshold(raw, 'pectoraux')).toBe(BRAKE_FLOOR_XP);
    expect(brakedXp(raw, 'pectoraux')).toBe(BRAKE_FLOOR_XP);
    expect(brakedXp({ ...flat(0), pectoraux: BRAKE_FLOOR_XP + 1000 }, 'pectoraux')).toBe(
      BRAKE_FLOOR_XP + 1000 * BRAKE_SLOPE,
    );
  });

  it('monotone : travailler davantage (soi ou les autres) ne fait jamais baisser un niveau', () => {
    const base = { ...flat(1500), pectoraux: 6000 };
    const more = { ...base, dos: 4000 };
    expect(brakedXp(more, 'pectoraux')).toBeGreaterThanOrEqual(brakedXp(base, 'pectoraux'));
    expect(brakedXp({ ...base, pectoraux: 6500 }, 'pectoraux')).toBeGreaterThan(
      brakedXp(base, 'pectoraux'),
    );
  });
});

describe('niveaux par muscle', () => {
  it('historique vide : les 11 muscles sont au niveau 1, sans XP ni frein', () => {
    const lv = muscleLevels({ sessions: [], secondaries: none });
    expect(Object.keys(lv).sort()).toEqual(Object.keys(MUSCLE_LABELS).sort());
    for (const v of Object.values(lv)) {
      expect(v.level).toBe(1);
      expect(v.xp).toBe(0);
      expect(v.braked).toBe(false);
    }
  });

  it('suit la courbe partagée (computeLevel) sur l’XP après frein', () => {
    const sessions = Array.from({ length: 12 }, () =>
      entry([{ id: 'bench', primary: 'pectoraux', sets: 4, reps: 8, load: 60 }]),
    );
    const lv = muscleLevels({ sessions, secondaries: (id) => (id === 'bench' ? ['triceps'] : []) });
    const raw = rawMuscleXp({ sessions, secondaries: (id) => (id === 'bench' ? ['triceps'] : []) });
    const expected = computeLevel(
      brakedXp(Object.fromEntries(LEVEL_MUSCLES.map((m) => [m, raw[m] ?? 0])), 'pectoraux'),
    );
    expect(lv.pectoraux!.level).toBe(expected.level);
    expect(lv.pectoraux!.level).toBeGreaterThan(1);
    expect(lv.pectoraux!.xpForLevel).toBe(expected.xpForLevel);
    expect(lv.pectoraux!.rawXp).toBe(Math.round(raw.pectoraux!));
    // Le secondaire monte moins vite que le principal.
    expect(lv.triceps!.level).toBeLessThanOrEqual(lv.pectoraux!.level);
  });

  it('un muscle écrasant les autres est marqué freiné, les autres non', () => {
    const sessions = Array.from({ length: 60 }, () =>
      entry([{ id: 'bench', primary: 'pectoraux', sets: 5, reps: 8, load: 70 }]),
    );
    const lv = muscleLevels({ sessions, secondaries: none });
    expect(lv.pectoraux!.braked).toBe(true);
    expect(lv.pectoraux!.xp).toBeLessThan(lv.pectoraux!.rawXp);
    expect(lv.dos!.braked).toBe(false);
  });
});
