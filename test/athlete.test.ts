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
  it('durée seule = base (durée×3), même sans détail', () => {
    expect(sessionXp(log({ duration_min: 45 }))).toBe(135);
    expect(sessionXp(log())).toBe(0);
  });

  it('durée + reps×0,2 + tonnage/500 (bonus détail)', () => {
    const l = log({
      duration_min: 40,
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
    // 40×3(=120) + 20 reps×0,2(=4) + 2000 tonnage/500(=4) = 128
    expect(sessionXp(l)).toBe(128);
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
    // reps = 3*10 = 30 → ×0,2 = 6 ; tonnage 1500/500 = 3 ; total 9
    expect(estimateSessionXp(s)).toBe(9);
  });
});
