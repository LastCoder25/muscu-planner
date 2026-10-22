import { describe, it, expect } from 'vitest';
import { circuitConflict, pickExpressCircuit, type CircuitCandidate } from '@/lib/expressCircuit';
import { muscleProfile } from '@/lib/muscleFatigue';
import { comboSessionDurationMin, legSetsLeft, type ComboLeg } from '@/lib/combo';

const leg = (over: Partial<ComboLeg>): ComboLeg => ({
  slot: 'push',
  exercise_id: 'x',
  exercise_name: 'X',
  rep_weight: 1,
  target: 10,
  ...over,
});

describe('séries restantes et transition', () => {
  it('legSetsLeft compte en séries, quel que soit le mode', () => {
    expect(legSetsLeft(leg({ target: 4 }))).toBe(4);
    const reps = leg({
      target: 50,
      count_mode: 'reps',
      sets: [{ date: '2026-10-20', reps: 10 }],
    });
    expect(legSetsLeft(reps)).toBe(4); // 40 reps restantes à 10 par série
  });
  it('« sans repos » compte quand même le changement de poste', () => {
    expect(comboSessionDurationMin([{ sets: [10, 10, 10, 10] }], 0)).toBe(4); // 4 × (40 + 15) s
  });
});

const c = (
  key: string,
  primary: string,
  secondaries: string[] = [],
  setsLeft = 3,
): CircuitCandidate<string> => ({ key, profile: muscleProfile(primary, secondaries), setsLeft });

const pompes = c('pompes', 'pectoraux', ['triceps', 'épaules']);
const dips = c('dips', 'triceps', ['pectoraux']);
const tractions = c('tractions', 'dos', ['biceps']);
const curl = c('curl', 'biceps');
const squat = c('squat', 'quadriceps', ['fessiers']);
const fentes = c('fentes', 'quadriceps', ['fessiers']);
const gainage = c('gainage', 'abdos');
const pont = c('pont', 'fessiers', ['ischio-jambiers']);

describe('circuit express du 360', () => {
  it('deux exos du même muscle principal se gênent', () => {
    expect(circuitConflict(squat.profile, fentes.profile)).toBe(true);
  });
  it('le principal de l’un en secondaire de l’autre : ils se gênent, dans les deux sens', () => {
    expect(circuitConflict(pompes.profile, dips.profile)).toBe(true);
    expect(circuitConflict(dips.profile, pompes.profile)).toBe(true);
    expect(circuitConflict(tractions.profile, curl.profile)).toBe(true);
    expect(circuitConflict(curl.profile, tractions.profile)).toBe(true);
  });
  it('pompes et tractions ne se gênent pas', () => {
    expect(circuitConflict(pompes.profile, tractions.profile)).toBe(false);
  });

  it('jamais deux exos qui se gênent dans un circuit', () => {
    const all = [pompes, dips, tractions, curl, squat, fentes, gainage, pont];
    for (let n = 2; n <= 5; n++) {
      const keys = pickExpressCircuit(all, n);
      const prof = keys.map((k) => all.find((x) => x.key === k)!.profile);
      for (let i = 0; i < prof.length; i++)
        for (let j = i + 1; j < prof.length; j++)
          expect(circuitConflict(prof[i]!, prof[j]!)).toBe(false);
    }
  });

  it('s’arrête au nombre d’exos compatibles au lieu de remplir', () => {
    expect(pickExpressCircuit([squat, fentes, gainage], 3)).toHaveLength(2);
  });

  it('trouve le plus grand circuit même quand l’exo prioritaire gêne les autres', () => {
    const x = c('x', 'dos', ['abdos'], 9);
    const y = c('y', 'abdos');
    const z = c('z', 'abdos', [], 1);
    const w = c('w', 'mollets', ['dos']);
    // x (prioritaire) gêne y, z et w ; y + w compatibles : le circuit de 2 existe.
    expect(pickExpressCircuit([x, y, z, w], 2).sort()).toEqual(['w', 'y']);
  });

  it('prend d’abord l’exo qui a le plus de séries à faire', () => {
    const peu = c('squat-peu', 'quadriceps', [], 1);
    const beaucoup = c('fentes-beaucoup', 'quadriceps', [], 6);
    expect(pickExpressCircuit([peu, beaucoup], 1)).toEqual(['fentes-beaucoup']);
  });

  it('à séries égales, le moins fatigué aujourd’hui', () => {
    const load = { quadriceps: 0.9 };
    expect(pickExpressCircuit([squat, c('pont-x', 'fessiers')], 1, { load })).toEqual(['pont-x']);
  });

  it('un exo terminé n’entre pas dans le circuit', () => {
    expect(pickExpressCircuit([c('fini', 'dos', [], 0), gainage], 2)).toEqual(['gainage']);
  });

  it('« Autre combinaison » écarte le circuit précédent quand c’est possible', () => {
    const all = [squat, fentes, tractions, c('rowing', 'dos')];
    const first = pickExpressCircuit(all, 2);
    const second = pickExpressCircuit(all, 2, { avoid: new Set(first) });
    expect(second.some((k) => first.includes(k))).toBe(false);
  });

  it('alterne haut / bas / tronc', () => {
    const keys = pickExpressCircuit([pompes, tractions, squat, gainage], 4);
    const zone = (k: string) => (k === 'squat' ? 'bas' : k === 'gainage' ? 'tronc' : 'haut');
    for (let i = 1; i < keys.length; i++) expect(zone(keys[i]!)).not.toBe(zone(keys[i - 1]!));
    expect(keys[0]).not.toBe('squat'); // la zone la plus fournie (haut) ouvre
  });
});
