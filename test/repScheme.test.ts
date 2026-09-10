import { describe, it, expect } from 'vitest';
import {
  OBJECTIVE_SCHEME,
  DEFAULT_OBJECTIVE,
  TIME_RANGE,
  repRangeFor,
  repRangeForExercise,
  repRangeLabel,
  prescribedReps,
} from '@/lib/repScheme';
import type { Objective } from '@/lib/types';

// La table est la SOURCE UNIQUE (générateur de programme + Défi 360). Ces attentes
// sont écrites en dur exprès : elles doivent tomber si quelqu'un retouche un repère
// d'entraînement sans le décider.
const EXPECTED: Record<Objective, [number, number]> = {
  force: [4, 6],
  hypertrophie: [8, 12],
  endurance: [15, 20],
  remise_en_forme: [10, 15],
  perte_de_gras: [12, 15],
};

describe('repRangeFor — fourchette par objectif', () => {
  it('rend les repères classiques, pour TOUS les objectifs', () => {
    // Record<Objective, …> → ajouter un objectif sans le renseigner casse la compilation.
    for (const [obj, [min, max]] of Object.entries(EXPECTED) as [Objective, [number, number]][]) {
      const r = repRangeFor(obj);
      expect([r.min, r.max], obj).toEqual([min, max]);
      expect(r.rest, obj).toBeGreaterThan(0);
    }
  });
  it('couvre la totalité du type Objective (pas de trou dans la table)', () => {
    expect(Object.keys(OBJECTIVE_SCHEME).sort()).toEqual(Object.keys(EXPECTED).sort());
  });
  it('la force est plus courte et plus reposée que l’endurance', () => {
    expect(repRangeFor('force').max).toBeLessThan(repRangeFor('endurance').min);
    expect(repRangeFor('force').rest).toBeGreaterThan(repRangeFor('endurance').rest);
  });
  it('sans objectif (profil incomplet) → le défaut, jamais undefined', () => {
    expect(repRangeFor(null)).toEqual(repRangeFor(DEFAULT_OBJECTIVE));
    expect(repRangeFor(undefined)).toEqual(repRangeFor(DEFAULT_OBJECTIVE));
  });
});

describe('repRangeForExercise — correction par la nature de l’exo', () => {
  it('un exo au TEMPS (gainage) est en SECONDES, quel que soit l’objectif', () => {
    for (const obj of Object.keys(EXPECTED) as Objective[]) {
      const r = repRangeForExercise(obj, { time: true, muscle_primary: 'abdominaux' });
      expect([r.min, r.max], obj).toEqual([TIME_RANGE.min, TIME_RANGE.max]);
    }
  });
  it('l’ISOLATION ne descend jamais au très lourd : force sur du biceps → 8–12', () => {
    const iso = repRangeForExercise('force', { muscle_primary: 'biceps' });
    expect([iso.min, iso.max]).toEqual([8, 12]);
    // …alors que le même objectif sur un composé garde 4–6.
    const comp = repRangeForExercise('force', { muscle_primary: 'pectoraux' });
    expect([comp.min, comp.max]).toEqual([4, 6]);
  });
  it('le plancher ne RABAISSE jamais une fourchette déjà haute', () => {
    // Endurance sur de l'isolation : 15–20 reste 15–20 (le plancher est un minimum).
    const r = repRangeForExercise('endurance', { muscle_primary: 'mollets' });
    expect([r.min, r.max]).toEqual([15, 20]);
  });
  it('muscle inconnu ou absent → traité comme un composé', () => {
    expect(repRangeForExercise('force', { muscle_primary: null })).toMatchObject({
      min: 4,
      max: 6,
    });
    expect(repRangeForExercise('force', { muscle_primary: 'trapezes' })).toMatchObject({
      min: 4,
      max: 6,
    });
  });
  it('rend une COPIE — un appelant ne peut pas muter la table partagée', () => {
    const a = repRangeForExercise('force', {});
    a.min = 99;
    expect(repRangeFor('force').min).toBe(4);
  });
});

describe('libellé et prescription', () => {
  it('affiche l’unité juste : reps, ou secondes pour le gainage', () => {
    expect(repRangeLabel({ min: 8, max: 12 })).toBe('8–12 reps');
    expect(repRangeLabel({ min: 30, max: 60 }, true)).toBe('30–60 s');
  });
  it('on prescrit le HAUT de la fourchette (la cible avant de monter la charge)', () => {
    expect(prescribedReps({ min: 8, max: 12 })).toBe(12);
  });
});
