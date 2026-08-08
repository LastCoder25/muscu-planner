// statSignature.ts — « signature » de chaque source d'effort : comment son XP se
// répartit entre les 3 stats du personnage (💪 Puissance / ❤️ Endurance / ⚡ Agilité).
// Fondé sur la physio : chaque sport sollicite différemment force, cardio et
// explosivité. Pur/testable. Les poids d'une signature somment ~1 → le TOTAL de
// l'XP de fond est conservé, seulement réparti dans les 3 réservoirs.
import type { CardioActivity } from './types';

export interface StatWeights {
  power: number;
  endurance: number;
  agility: number;
}
export interface StatBuckets {
  power: number;
  endurance: number;
  agility: number;
}

export function emptyBuckets(): StatBuckets {
  return { power: 0, endurance: 0, agility: 0 };
}

/** Ajoute `xp` réparti selon la signature `w` dans l'accumulateur. */
export function addXp(acc: StatBuckets, xp: number, w: StatWeights): void {
  if (!xp) return;
  acc.power += xp * w.power;
  acc.endurance += xp * w.endurance;
  acc.agility += xp * w.agility;
}

// Muscu (séances, défis muscu, Défi 360) : force d'abord, un peu d'endurance (reps).
export const MUSCU_SIG: StatWeights = { power: 0.6, endurance: 0.3, agility: 0.1 };
// Défis cardio (marche/course/vélo) : cardio générique.
export const CARDIO_CHALLENGE_SIG: StatWeights = { power: 0, endurance: 0.7, agility: 0.3 };

// Cardio par activité (course = endurance ; trail = + jambes ; vélo = endurance pure…).
const CARDIO_SIG: Record<CardioActivity, StatWeights> = {
  course: { power: 0, endurance: 0.7, agility: 0.3 },
  course_tapis: { power: 0, endurance: 0.7, agility: 0.3 },
  trail: { power: 0.2, endurance: 0.6, agility: 0.2 },
  velo: { power: 0.1, endurance: 0.8, agility: 0.1 },
  velo_appart: { power: 0.1, endurance: 0.8, agility: 0.1 },
  rando: { power: 0.2, endurance: 0.7, agility: 0.1 },
  marche: { power: 0, endurance: 0.85, agility: 0.15 },
  marche_tapis: { power: 0, endurance: 0.85, agility: 0.15 },
};
export function cardioSignature(a: CardioActivity): StatWeights {
  return CARDIO_SIG[a] ?? { power: 0, endurance: 0.7, agility: 0.3 };
}

// « Autre sport » par nom (cf. SPORT_OPTIONS). Basé sur ce que chaque sport travaille.
const SPORT_SIG: Record<string, StatWeights> = {
  Tennis: { power: 0, endurance: 0.4, agility: 0.6 },
  Padel: { power: 0, endurance: 0.4, agility: 0.6 },
  Football: { power: 0.1, endurance: 0.4, agility: 0.5 },
  Basket: { power: 0.15, endurance: 0.35, agility: 0.5 },
  Natation: { power: 0.4, endurance: 0.6, agility: 0 },
  Course: { power: 0, endurance: 0.7, agility: 0.3 },
  Vélo: { power: 0.1, endurance: 0.8, agility: 0.1 },
  Escalade: { power: 0.6, endurance: 0.1, agility: 0.3 },
  Boxe: { power: 0.3, endurance: 0.3, agility: 0.4 },
  Rugby: { power: 0.4, endurance: 0.3, agility: 0.3 },
  Yoga: { power: 0.3, endurance: 0.3, agility: 0.4 },
  Randonnée: { power: 0.2, endurance: 0.7, agility: 0.1 },
  Ski: { power: 0.4, endurance: 0.2, agility: 0.4 },
  Golf: { power: 0.3, endurance: 0.2, agility: 0.5 },
  Danse: { power: 0.1, endurance: 0.4, agility: 0.5 },
};
// Sport inconnu / « Autre » libre : équilibré (léger biais endurance).
export const DEFAULT_SPORT_SIG: StatWeights = { power: 0.3, endurance: 0.4, agility: 0.3 };
export function sportSignature(name?: string | null): StatWeights {
  return (name && SPORT_SIG[name]) || DEFAULT_SPORT_SIG;
}

/** Liste (nom → signature) pour l'affichage pédagogique (ex. page admin). */
export const SPORT_SIGNATURES = SPORT_SIG;
