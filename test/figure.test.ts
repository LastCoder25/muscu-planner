import { describe, it, expect } from 'vitest';
import { jointsFor, BAR_Y, FLOOR_Y, type Joints } from '@/lib/figure';
import { PATTERNS, EXERCISE_PATTERN } from '@/data/exercisePatterns';

// Vérifications « à l'aveugle » : on ne voit pas l'animation, on contrôle donc
// les relations spatiales clés de chaque mouvement (y vers le bas : plus grand = plus bas).

const P = PATTERNS;

describe('figure — relations spatiales par pattern', () => {
  it('squat : hanches plus basses en position basse', () => {
    const up = jointsFor(P.squat!.a, 'stand');
    const down = jointsFor(P.squat!.b, 'stand');
    expect(down.hip[1]).toBeGreaterThan(up.hip[1]);
  });

  it('pompe : mains sous les épaules, près du sol', () => {
    const j = jointsFor(P.pushup!.a, 'prone');
    expect(j.hand[1]).toBeGreaterThan(j.shoulder[1]); // mains plus bas que les épaules
    expect(j.hand[1]).toBeGreaterThan(FLOOR_Y - 12); // ~ au sol
  });

  it('développé militaire : mains au-dessus des épaules en haut', () => {
    const j = jointsFor(P.overhead_press!.b, 'stand');
    expect(j.hand[1]).toBeLessThan(j.shoulder[1]);
  });

  it('développé couché : bras vers le haut (mains au-dessus des épaules)', () => {
    const j = jointsFor(P.bench_press!.b, 'supine');
    expect(j.hand[1]).toBeLessThan(j.shoulder[1]);
  });

  it('curl : main plus haute en contraction', () => {
    const a = jointsFor(P.curl!.a, 'stand');
    const b = jointsFor(P.curl!.b, 'stand');
    expect(b.hand[1]).toBeLessThan(a.hand[1]);
  });

  it('élévations latérales : main plus haute en haut', () => {
    const a = jointsFor(P.lateral_raise!.a, 'stand');
    const b = jointsFor(P.lateral_raise!.b, 'stand');
    expect(b.hand[1]).toBeLessThan(a.hand[1]);
  });

  it('traction : mains fixées à la barre, corps qui monte', () => {
    const a = jointsFor(P.pullup!.a, 'hang');
    const b = jointsFor(P.pullup!.b, 'hang');
    expect(Math.abs(a.hand[1] - BAR_Y)).toBeLessThan(2); // mains à la barre
    expect(b.hip[1]).toBeLessThan(a.hip[1]); // le corps remonte
  });

  it('mollets : tout le corps monte', () => {
    const a = jointsFor(P.calf_raise!.a, 'stand');
    const b = jointsFor(P.calf_raise!.b, 'stand');
    expect(b.hip[1]).toBeLessThan(a.hip[1]);
  });

  it('relevé de jambes suspendu : jambes remontées', () => {
    const a = jointsFor(P.hanging_leg_raise!.a, 'hang');
    const b = jointsFor(P.hanging_leg_raise!.b, 'hang');
    expect(b.ankle[1]).toBeLessThan(a.ankle[1]);
  });

  it('debout : pieds posés au sol', () => {
    const j = jointsFor(P.squat!.a, 'stand');
    const foot = Math.max(j.ankle[1], j.toe[1]);
    expect(Math.abs(foot - FLOOR_Y)).toBeLessThan(2);
  });
});

describe('figure — bornes du viewBox', () => {
  it('toutes les articulations restent dans le cadre (~0..100)', () => {
    const pts = (j: Joints) => [j.head, j.shoulder, j.elbow, j.hand, j.hip, j.knee, j.ankle, j.toe];
    for (const [key, pat] of Object.entries(P)) {
      for (const pose of [pat.a, pat.b]) {
        const j = jointsFor(pose, pat.anchor);
        for (const [x, y] of pts(j)) {
          expect(x, `${key} x`).toBeGreaterThan(-10);
          expect(x, `${key} x`).toBeLessThan(110);
          expect(y, `${key} y`).toBeGreaterThan(-10);
          expect(y, `${key} y`).toBeLessThan(110);
        }
      }
    }
  });
});

describe('figure — mapping des exos', () => {
  it('chaque pattern mappé existe dans le catalogue', () => {
    for (const key of Object.values(EXERCISE_PATTERN)) {
      expect(P[key], key).toBeDefined();
    }
  });
});
