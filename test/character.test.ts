import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  statFromXp,
  computeCharacter,
  characterProfile,
  levelUpEnergy,
  isValidPseudo,
  normalizePseudo,
} from '@/lib/character';
import { computeLevel } from '@/lib/levels';
import { floorStats, STAT_FLOOR_SHARE } from '@/lib/combat';

describe('statFromXp', () => {
  it('linéaire (÷15) arrondi, jamais négatif', () => {
    expect(statFromXp(900)).toBe(60);
    expect(statFromXp(150)).toBe(10);
    expect(statFromXp(0)).toBe(0);
    expect(statFromXp(-50)).toBe(0);
  });
});

describe('computeCharacter', () => {
  it('chaque stat vient de son réservoir ; niveau = total', () => {
    const c = computeCharacter(900, 600, 300, 1200);
    // Les VRAIES stats (fiche) : chacune vient de son réservoir.
    expect(c.sport).toEqual({ puissance: 60, endurance: 40, agilite: 20 }); // ÷15
    expect(c.energy).toBe(1200);
    expect(c.level.level).toBe(computeLevel(900 + 600 + 300).level);
  });
  it('⚖️ les stats de COMBAT ont le plancher : 20 % du total, pris aux stats en excès', () => {
    const c = computeCharacter(900, 600, 300, 0); // 60 / 40 / 20 → total 120, plancher 24
    expect(c.agilite).toBeCloseTo(24, 6);
    expect(c.puissance + c.endurance + c.agilite).toBeCloseTo(120, 6); // total conservé
    expect(c.puissance).toBeLessThan(60);
    expect(c.endurance).toBeLessThan(40);
    expect(c.pv).toBe(Math.round(100 + c.endurance * 10));
    // L'orientation se lit sur le sport, pas sur le combat.
    expect(computeCharacter(1500, 0, 0, 0).profile).toBe('puissant');
  });
});

describe('⚖️ floorStats', () => {
  it('un build équilibré n’est pas touché (le combattant de référence non plus)', () => {
    expect(floorStats({ puissance: 30, endurance: 30, agilite: 30 })).toEqual({
      puissance: 30,
      endurance: 30,
      agilite: 30,
    });
  });
  it('un pur muscu reçoit 20 % d’agilité, au prorata de l’excès des deux autres', () => {
    const f = floorStats({ puissance: 60, endurance: 40, agilite: 0 }); // plancher 20
    expect(f.agilite).toBeCloseTo(20, 6);
    // Excès sur le plancher : 40 et 20 → on prend 2/3 à la puissance, 1/3 à l'endurance.
    expect(f.puissance).toBeCloseTo(60 - (20 * 40) / 60, 6);
    expect(f.endurance).toBeCloseTo(40 - (20 * 20) / 60, 6);
  });
  it('deux stats sous le plancher montent toutes les deux, total conservé', () => {
    const f = floorStats({ puissance: 100, endurance: 0, agilite: 0 });
    expect(f.endurance).toBeCloseTo(20, 6);
    expect(f.agilite).toBeCloseTo(20, 6);
    expect(f.puissance).toBeCloseTo(60, 6);
  });
  it('rien du tout → rien', () => {
    expect(floorStats({ puissance: 0, endurance: 0, agilite: 0 })).toEqual({
      puissance: 0,
      endurance: 0,
      agilite: 0,
    });
  });
  it('le plancher vaut STAT_FLOOR_SHARE', () => {
    expect(STAT_FLOOR_SHARE).toBe(0.2);
  });
  it('le niveau arrondit la SOMME des réservoirs, une seule fois (même niveau que le Global)', () => {
    // 3 réservoirs fractionnaires qui somment pile au palier du niveau 2 (200 XP) :
    // arrondis un par un ils vaudraient 199 → niveau 1, alors que le Global dit 2.
    const c = computeCharacter(66.4, 66.4, 67.2, 0);
    expect(c.level.level).toBe(computeLevel(200).level);
    expect(c.level.level).toBe(2);
  });
  it('useProgress passe les réservoirs NON arrondis (sinon 41 ici, 42 sur l’accueil)', () => {
    const src = readFileSync('src/composables/useProgress.ts', 'utf8');
    for (const k of ['power', 'endurance', 'agility'])
      expect(src).toMatch(new RegExp(`${k}Xp: computed\\(\\(\\) => statBuckets\\.value\\.${k}\\)`));
  });
  it('énergie = dispo − dépensée (déficit possible, négatif)', () => {
    expect(computeCharacter(0, 0, 0, 30, 10).energy).toBe(20);
    expect(computeCharacter(0, 0, 0, 10, 50).energy).toBe(-40); // déficit
  });
});

describe('levelUpEnergy', () => {
  it('croît avec le niveau', () => {
    expect(levelUpEnergy(5)).toBeGreaterThan(levelUpEnergy(2));
    expect(levelUpEnergy(20)).toBeGreaterThan(levelUpEnergy(10));
    expect(levelUpEnergy(1)).toBeGreaterThan(0);
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
