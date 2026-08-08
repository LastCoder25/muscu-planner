import { describe, it, expect } from 'vitest';
import {
  emptyBuckets,
  addXp,
  MUSCU_SIG,
  cardioSignature,
  sportSignature,
  DEFAULT_SPORT_SIG,
  activityIntensity,
  sportIntensity,
  activityBenefit,
} from '@/lib/statSignature';

describe('statSignature — direction (répartition)', () => {
  it('addXp répartit selon la signature et conserve le total', () => {
    const acc = emptyBuckets();
    addXp(acc, 100, MUSCU_SIG);
    expect(acc.power).toBeCloseTo(60);
    expect(acc.endurance).toBeCloseTo(30);
    expect(acc.agility).toBeCloseTo(10);
    expect(acc.power + acc.endurance + acc.agility).toBeCloseTo(100);
  });

  it('les directions somment à 1', () => {
    const sigs = [
      MUSCU_SIG,
      cardioSignature('course'),
      cardioSignature('velo'),
      cardioSignature('marche'),
      sportSignature('Tennis'),
      sportSignature('Escalade'),
      DEFAULT_SPORT_SIG,
    ];
    for (const s of sigs) {
      expect(s.power + s.endurance + s.agility).toBeCloseTo(1);
    }
  });

  it('course = endurance/agilité, escalade = puissance, tennis = agilité', () => {
    expect(cardioSignature('course').endurance).toBeGreaterThan(cardioSignature('course').power);
    expect(sportSignature('Escalade').power).toBeGreaterThan(sportSignature('Escalade').endurance);
    expect(sportSignature('Tennis').agility).toBeGreaterThan(sportSignature('Tennis').power);
  });

  it('sport inconnu → direction par défaut (mêmes valeurs)', () => {
    expect(sportSignature('Curling')).toEqual(DEFAULT_SPORT_SIG);
    expect(sportSignature(null)).toEqual(DEFAULT_SPORT_SIG);
  });
});

describe('statSignature — intensité (MET adouci, course = 100)', () => {
  it('course = 100, marche adoucie (50), vélo 75', () => {
    expect(activityIntensity('course')).toBe(100);
    expect(activityIntensity('marche')).toBe(50);
    expect(activityIntensity('velo')).toBe(75);
  });
  it('marche < vélo < course (fini l’illusion de la normalisation)', () => {
    expect(activityIntensity('marche')).toBeLessThan(activityIntensity('velo'));
    expect(activityIntensity('velo')).toBeLessThan(activityIntensity('course'));
  });
  it('l’endurance ABSOLUE de la course dépasse celle de la marche', () => {
    expect(activityBenefit('course').endurance).toBeGreaterThan(
      activityBenefit('marche').endurance,
    );
  });
  it('intensité « autre sport » : yoga (chill) < tennis < course', () => {
    expect(sportIntensity('Yoga')).toBeLessThan(sportIntensity('Tennis'));
    expect(sportIntensity('Tennis')).toBeLessThan(sportIntensity('Course'));
  });
});
