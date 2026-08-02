import { describe, it, expect } from 'vitest';
import { sessionXp, drillSessionXp, estimateSessionXp } from '@/lib/athlete';
import type { SessionLog, DrillLog, Session } from '@/lib/types';

function log(over: Partial<SessionLog> = {}): SessionLog {
  return {
    schema_version: '1.0',
    type: 'session_log',
    id: 'l1',
    exercises: [],
    ...over,
  };
}

describe('sessionXp', () => {
  it('séance vide = 50 base + intensité par défaut (note 2 → 20)', () => {
    expect(sessionXp(log())).toBe(70);
  });

  it('compte reps, tonnage/100 et intensité', () => {
    const l = log({
      global_difficulty: 4,
      exercises: [
        {
          id: 'x',
          name: 'x',
          planned: {},
          performed: [
            { set: 1, load_kg: 100, reps: 10, difficulty: 4 },
            { set: 2, load_kg: 100, reps: 10, difficulty: 4 },
          ],
        },
      ],
    });
    // 50 + 20 reps + 2000 tonnage/100(=20) + 40 (note 4) = 130
    expect(sessionXp(l)).toBe(130);
  });
});

describe('drillSessionXp', () => {
  function dlog(over: Partial<DrillLog> = {}): DrillLog {
    return {
      schema_version: '1.0',
      type: 'drill_log',
      id: 'd1',
      sport: 'tennis',
      with_partner: true,
      drills: [],
      ...over,
    };
  }
  it('récompense présence + durée + drills faits + intensité', () => {
    const l = dlog({
      duration_min: 60,
      global_difficulty: 3,
      drills: [
        { id: 'a', name: 'a', done: true },
        { id: 'b', name: 'b', done: true },
        { id: 'c', name: 'c', done: false },
      ],
    });
    // 40 + 60 + 2*8(=16) + 30 = 146
    expect(drillSessionXp(l)).toBe(146);
  });
});

describe('estimateSessionXp', () => {
  it('estime depuis les cibles planifiées', () => {
    const s: Session = {
      schema_version: '1.0',
      type: 'session',
      id: 's',
      name: 's',
      exercises: [
        {
          id: 'x',
          name: 'x',
          progression: 'linear',
          rest_seconds: 90,
          target: { sets: 3, reps_min: 8, reps_max: 12, load_kg: 50 },
        },
      ],
    };
    // reps = 3 * 10 = 30 ; tonnage = 30*50=1500 →/100=15 ; 50 + 30 + 15 + 20 = 115
    expect(estimateSessionXp(s)).toBe(115);
  });
});
