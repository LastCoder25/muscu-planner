import { describe, it, expect } from 'vitest';
import {
  statFromXp,
  computeCharacter,
  characterProfile,
  isValidPseudo,
  normalizePseudo,
} from '@/lib/character';

describe('statFromXp', () => {
  it('racine carrée arrondie, jamais négatif', () => {
    expect(statFromXp(900)).toBe(30);
    expect(statFromXp(3600)).toBe(60);
    expect(statFromXp(0)).toBe(0);
    expect(statFromXp(-50)).toBe(0);
  });
});

describe('computeCharacter', () => {
  it('Puissance←muscu, Agilité←cardio, Endurance←moyenne', () => {
    const c = computeCharacter(900, 400, 120);
    expect(c.puissance).toBe(30); // √900
    expect(c.agilite).toBe(20); // √400
    expect(c.endurance).toBe(statFromXp(650)); // √((900+400)/2)
    expect(c.pv).toBe(100 + c.endurance * 10);
    expect(c.energy).toBe(120);
    expect(c.level.level).toBeGreaterThanOrEqual(1);
  });
  it('énergie = minutes − dépensée, plancher 0', () => {
    expect(computeCharacter(0, 0, 30, 10).energy).toBe(20);
    expect(computeCharacter(0, 0, 10, 50).energy).toBe(0);
  });
});

describe('characterProfile', () => {
  it('muscu dominante → puissant, cardio → agile, sinon polyvalent', () => {
    expect(characterProfile(50, 20)).toBe('puissant');
    expect(characterProfile(20, 50)).toBe('agile');
    expect(characterProfile(30, 30)).toBe('polyvalent');
  });
});

describe('pseudo', () => {
  it('valide 3–20 caractères autorisés', () => {
    expect(isValidPseudo('Alban')).toBe(true);
    expect(isValidPseudo('ab')).toBe(false);
    expect(isValidPseudo('a'.repeat(21))).toBe(false);
    expect(isValidPseudo('bad!!')).toBe(false);
    expect(isValidPseudo('Le_Guerrier-2')).toBe(true);
  });
  it('normalise les espaces', () => {
    expect(normalizePseudo('  le   héros  ')).toBe('le héros');
  });
});
