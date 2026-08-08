import { describe, it, expect } from 'vitest';
import {
  emptyBuckets,
  addXp,
  MUSCU_SIG,
  cardioSignature,
  sportSignature,
  DEFAULT_SPORT_SIG,
} from '@/lib/statSignature';

describe('statSignature', () => {
  it('addXp répartit selon la signature et conserve le total', () => {
    const acc = emptyBuckets();
    addXp(acc, 100, MUSCU_SIG);
    expect(acc.power).toBeCloseTo(60);
    expect(acc.endurance).toBeCloseTo(30);
    expect(acc.agility).toBeCloseTo(10);
    expect(acc.power + acc.endurance + acc.agility).toBeCloseTo(100);
  });

  it('les poids de chaque signature somment à 1', () => {
    const sigs = [
      MUSCU_SIG,
      cardioSignature('course'),
      cardioSignature('velo'),
      cardioSignature('trail'),
      sportSignature('Tennis'),
      sportSignature('Escalade'),
      sportSignature('Boxe'),
      DEFAULT_SPORT_SIG,
    ];
    for (const s of sigs) {
      expect(s.power + s.endurance + s.agility).toBeCloseTo(1);
    }
  });

  it('course = endurance/agilité, escalade = puissance dominante', () => {
    expect(cardioSignature('course').endurance).toBeGreaterThan(cardioSignature('course').power);
    expect(sportSignature('Escalade').power).toBeGreaterThan(sportSignature('Escalade').endurance);
    expect(sportSignature('Tennis').agility).toBeGreaterThan(sportSignature('Tennis').power);
  });

  it('sport inconnu → signature par défaut', () => {
    expect(sportSignature('Curling')).toBe(DEFAULT_SPORT_SIG);
    expect(sportSignature(null)).toBe(DEFAULT_SPORT_SIG);
  });

  it('activité cardio inconnue → repli endurance', () => {
    // @ts-expect-error test d'un fallback runtime
    const w = cardioSignature('inconnu');
    expect(w.endurance).toBeGreaterThan(0);
  });
});
