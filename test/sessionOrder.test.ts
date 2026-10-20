import { describe, it, expect } from 'vitest';
import { muscleProfile, planSessionOrder, type OrderCandidate } from '@/lib/muscleFatigue';
import { comboStepMs } from '@/lib/combo';

// Ordre CALCULÉ des séries d'une séance du 360 (v1.249) : groupes alternés, muscles frais.
const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 20, 18, 0, 0);
const STEP = comboStepMs(60);
const bench = muscleProfile('pectoraux', ['triceps', 'épaules']);
const pushup = muscleProfile('pectoraux', ['triceps']);
const triExt = muscleProfile('triceps', []);
const row = muscleProfile('dos', ['biceps']);
const squat = muscleProfile('quadriceps', ['fessiers']);
const curl = muscleProfile('biceps', []);

const cand = (key: string, profile: ReturnType<typeof muscleProfile>, remaining: number) => ({
  key,
  profile,
  remaining,
});
const plan = (
  cands: OrderCandidate<string>[],
  extra: Partial<Parameters<typeof planSessionOrder>[1]> = {},
) => planSessionOrder(cands, { now: NOW, stepMs: STEP, ...extra });

describe('🧠 ordre calculé des séries d’une séance du 360', () => {
  it('chaque série apparaît autant de fois qu’il en reste', () => {
    const out = plan([cand('B', bench, 3), cand('R', row, 2), cand('S', squat, 4)]);
    expect(out).toHaveLength(9);
    expect(out.filter((k) => k === 'B')).toHaveLength(3);
    expect(out.filter((k) => k === 'R')).toHaveLength(2);
    expect(out.filter((k) => k === 'S')).toHaveLength(4);
  });

  it('⚠️ jamais deux séries de suite sur le même groupe, même avec deux exos du même muscle', () => {
    // Pompes et développé couché = pectoraux tous les deux : 4 séries de pecs sur 7.
    const out = plan([
      cand('B', bench, 2),
      cand('P', pushup, 2),
      cand('R', row, 2),
      cand('S', squat, 1),
    ]);
    const group = (k: string) => (k === 'B' || k === 'P' ? 'pecs' : k);
    for (let i = 1; i < out.length; i++) expect(group(out[i]!)).not.toBe(group(out[i - 1]!));
  });

  it('⚠️ regarde plus loin : ne se coince pas en fin de séance sur le groupe en surnombre', () => {
    // Les pecs viennent de travailler (série du défi il y a 2 min) : la fraîcheur seule
    // ouvrirait par le dos et finirait par deux séries de pecs. 3 pecs sur 5 → pecs d'abord.
    const hits = [{ at: NOW - 2 * MIN, profile: bench }];
    const out = plan([cand('B', bench, 3), cand('R', row, 1), cand('S', squat, 1)], { hits });
    expect(out).toHaveLength(5);
    expect(out[0]).toBe('B');
    expect(out[2]).toBe('B');
    expect(out[4]).toBe('B');
  });

  it('quand rien ne coince, la fraîcheur décide : pecs chauds → on ouvre ailleurs', () => {
    // 3 pecs sur 7 : ouvrir par le dos laisse encore de quoi tout alterner.
    const hits = [{ at: NOW - 2 * MIN, profile: bench }];
    const out = plan([cand('B', bench, 3), cand('R', row, 2), cand('S', squat, 2)], { hits });
    expect(out[0]).not.toBe('B');
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
  });

  it('propriété : sur des séances tirées au hasard, aucune répétition de groupe quand c’est possible', () => {
    const profiles = [bench, row, squat, triExt, curl];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let checked = 0;
    for (let n = 0; n < 400; n++) {
      const cands = profiles
        .map((p, i) => cand('ABCDE'[i]!, p, Math.floor(rnd() * 5)))
        .filter((c) => c.remaining > 0);
      const total = cands.reduce((a, c) => a + c.remaining, 0);
      const max = Math.max(0, ...cands.map((c) => c.remaining));
      if (!total || max > Math.ceil(total / 2)) continue;
      checked++;
      const out = plan(cands);
      for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('un développé couché fatigue aussi les triceps : on enchaîne le dos, pas les triceps', () => {
    const out = plan([cand('B', bench, 2), cand('T', triExt, 2), cand('R', row, 2)]);
    expect(out[0]).toBe('B');
    expect(out[1]).toBe('R');
  });

  it('ne recommence pas par le groupe de la dernière série faite', () => {
    const out = plan([cand('B', bench, 1), cand('R', row, 1)], { lastGroup: 'pectoraux' });
    expect(out[0]).toBe('R');
  });

  it('tient compte des séries du défi déjà faites aujourd’hui (muscles encore chauds)', () => {
    const hits = [{ at: NOW - 3 * MIN, profile: squat }];
    const out = plan([cand('S', squat, 1), cand('R', row, 1)], { hits });
    expect(out[0]).toBe('R');
  });

  it('un seul exo : ses séries s’enchaînent (rien d’autre à intercaler)', () => {
    expect(plan([cand('B', bench, 3)])).toEqual(['B', 'B', 'B']);
    expect(plan([])).toEqual([]);
  });
});
