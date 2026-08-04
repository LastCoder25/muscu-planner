// character.ts — RPG (Phase 1) : le personnage est une PROJECTION du sport de fond.
// Aucune répartition manuelle : les stats se déduisent de l'XP muscu/cardio.
// Pur/testable, aucune dépendance Vue/Supabase.
import { computeLevel, type LevelInfo } from './levels';

// Courbe des stats : LINÉAIRE (stat = XP / 15) → la stat reflète fidèlement
// l'effort (2× d'XP = 2× de stat) ; un exo à peine commencé reste bas.
const XP_PER_STAT = 15;
export function statFromXp(xp: number): number {
  return Math.round(Math.max(0, xp) / XP_PER_STAT);
}

export type CharacterProfile = 'puissant' | 'agile' | 'polyvalent';

export interface Character {
  level: LevelInfo; // niveau du perso (fond = muscu + cardio) — plafonne l'équipement
  puissance: number; // 💪 muscu → dégâts
  endurance: number; // ❤️ muscu + cardio → PV / résistance / énergie max
  agilite: number; // ⚡ cardio → esquive / vitesse / critiques / initiative
  pv: number; // dérivé de l'endurance
  energy: number; // énergie disponible (minutes de sport − dépensée)
  profile: CharacterProfile; // orientation dominante (libellé)
}

/** Libellé d'orientation selon la stat dominante (muscu vs cardio). */
export function characterProfile(puissance: number, agilite: number): CharacterProfile {
  if (puissance >= agilite * 1.3) return 'puissant';
  if (agilite >= puissance * 1.3) return 'agile';
  return 'polyvalent';
}

export const PROFILE_LABEL: Record<CharacterProfile, string> = {
  puissant: 'cogneur',
  agile: 'coureur',
  polyvalent: 'polyvalent',
};

/**
 * Construit le personnage à partir de l'XP de fond et des minutes de sport.
 * @param muscuXp  XP musculation (déjà cumulée)
 * @param cardioXp XP cardio (déjà cumulée)
 * @param minutes  minutes de sport de fond (muscu + cardio) → énergie brute
 * @param energySpent énergie déjà dépensée en aventures (0 en phase 1)
 */
export function computeCharacter(
  muscuXp: number,
  cardioXp: number,
  minutes: number,
  energySpent = 0,
): Character {
  const puissance = statFromXp(muscuXp);
  const agilite = statFromXp(cardioXp);
  const endurance = statFromXp((muscuXp + cardioXp) / 2);
  return {
    level: computeLevel(muscuXp + cardioXp),
    puissance,
    endurance,
    agilite,
    pv: 100 + endurance * 10,
    energy: Math.max(0, Math.round(minutes) - Math.round(energySpent)),
    profile: characterProfile(puissance, agilite),
  };
}

// Validation d'un pseudo d'aventurier (unicité gérée en base par contrainte).
export function normalizePseudo(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
export function isValidPseudo(raw: string): boolean {
  const p = normalizePseudo(raw);
  return p.length >= 3 && p.length <= 20 && /^[\p{L}\p{N} _-]+$/u.test(p);
}
