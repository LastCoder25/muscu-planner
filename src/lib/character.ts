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
 * Construit le personnage à partir des 3 RÉSERVOIRS d'XP (alimentés par chaque
 * sport selon sa signature, cf. statSignature.ts) et de l'énergie disponible.
 * @param powerXp     réservoir 💪 Puissance
 * @param enduranceXp réservoir ❤️ Endurance
 * @param agilityXp   réservoir ⚡ Agilité
 * @param energy      énergie brute disponible (XP de fond + bonus connexion)
 * @param energySpent énergie déjà dépensée en aventures
 */
export function computeCharacter(
  powerXp: number,
  enduranceXp: number,
  agilityXp: number,
  energy: number,
  energySpent = 0,
): Character {
  const puissance = statFromXp(powerXp);
  const endurance = statFromXp(enduranceXp);
  const agilite = statFromXp(agilityXp);
  // Niveau de fond = total réparti dans les 3 réservoirs (= XP de fond).
  const fondXp = Math.max(0, powerXp) + Math.max(0, enduranceXp) + Math.max(0, agilityXp);
  return {
    level: computeLevel(fondXp),
    puissance,
    endurance,
    agilite,
    pv: 100 + endurance * 10,
    // Peut être NÉGATIF (déficit) : si on retire des séances/séries après avoir
    // dépensé l'énergie, il faut la regagner par du sport avant de rejouer.
    energy: Math.round(energy) - Math.round(energySpent),
    profile: characterProfile(puissance, agilite),
  };
}

// Bonus d'énergie versé en atteignant un niveau (croissant avec le niveau) →
// les niveaux hauts sont rares mais plus juteux, ce qui compense l'écart croissant.
export function levelUpEnergy(level: number): number {
  return 30 + Math.max(0, level) * 12;
}

// Validation d'un pseudo d'aventurier (unicité gérée en base par contrainte).
export function normalizePseudo(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
export function isValidPseudo(raw: string): boolean {
  const p = normalizePseudo(raw);
  return p.length >= 3 && p.length <= 20 && /^[\p{L}\p{N} _-]+$/u.test(p);
}
