import { describe, it, expect } from 'vitest';
import { lastWorkLoad, prefillLoads } from '@/lib/livePrefill';
import type { SessionLog } from '@/lib/types';

const log = (id: string, exId: string, loads: number[]): SessionLog =>
  ({
    id,
    exercises: [
      {
        id: exId,
        name: exId,
        performed: loads.map((l, i) => ({ set: i + 1, load_kg: l, reps: 8, difficulty: 2 })),
      },
    ],
  }) as unknown as SessionLog;

const blank = (n = 3, warm = 0) => [
  ...Array.from({ length: warm }, () => ({ load_kg: 0, done: false, warmup: true })),
  ...Array.from({ length: n }, () => ({ load_kg: 0, done: false })),
];

describe('🏋️ la charge reprend celle de la dernière séance', () => {
  it('la plus fréquente de la DERNIÈRE séance, jamais le sommet d’une pyramide', () => {
    const logs = [log('b', 'squat', [60, 60, 60, 80]), log('a', 'squat', [100, 100, 100])];
    expect(lastWorkLoad('squat', logs)).toBe(60);
    // à égalité, la plus lourde
    expect(lastWorkLoad('squat', [log('c', 'squat', [50, 55])])).toBe(55);
    expect(lastWorkLoad('dc', logs)).toBeNull();
  });

  it('pose la charge sur les séries VIDES, approches exclues', () => {
    const ex = { id: 'squat', bodyweight: false, sets: blank(3, 2) };
    expect(prefillLoads([ex], [log('a', 'squat', [70, 70])])).toBe(1);
    expect(ex.sets.filter((s) => !s.warmup).every((s) => s.load_kg === 70)).toBe(true);
    expect(ex.sets.filter((s) => s.warmup).every((s) => s.load_kg === 0)).toBe(true);
  });

  it('⚠️ ne réécrit jamais une charge posée, une série faite, le poids du corps ni une pyramide', () => {
    const logs = [log('a', 'x', [70])];
    const pose = { id: 'x', bodyweight: false, sets: [{ load_kg: 40, done: false }, { load_kg: 0, done: false }] };
    const fait = { id: 'x', bodyweight: false, sets: [{ load_kg: 0, done: true }, { load_kg: 0, done: false }] };
    const pdc = { id: 'x', bodyweight: true, sets: blank() };
    const pyr = { id: 'x', bodyweight: false, prescribed: true, sets: blank() };
    expect(prefillLoads([pose, fait, pdc, pyr], logs)).toBe(0);
    expect(pose.sets[1]!.load_kg).toBe(0);
    expect(fait.sets[1]!.load_kg).toBe(0);
    expect(pdc.sets.every((s) => s.load_kg === 0)).toBe(true);
    expect(pyr.sets.every((s) => s.load_kg === 0)).toBe(true);
  });
});
