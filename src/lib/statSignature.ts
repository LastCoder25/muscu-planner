// statSignature.ts — « bénéfices » de chaque source d'effort. MODÈLE UNIFIÉ
// (2026‑08‑08) : au lieu de deux boutons arbitraires (un facteur d'XP + une
// signature normalisée à 1), CHAQUE activité a UN vecteur de bénéfices NON
// normalisé [💪 Puissance / ❤️ Endurance / ⚡ Agilité] par unité d'effort :
//   • la SOMME du vecteur = l'INTENSITÉ (pilote XP / énergie / niveau) — ancrée
//     sur le MET (Metabolic Equivalent, Compendium of Physical Activities) ×10,
//     légèrement adoucie sur le bas (marche) pour la motivation ;
//   • la RÉPARTITION = ce que le sport travaille (les 3 stats).
// Ainsi « marche 42 endurance » et « course 70 endurance » sont sur la MÊME
// échelle absolue : plus besoin d'un facteur arbitraire (ex. marche 0.45), il
// tombe de l'intensité (marche 50 / course 100 = 0.50). Course = intensité 100
// = repère (facteur 1) → les magnitudes d'XP existantes sont préservées.
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

/** Ajoute `xp` réparti selon la DIRECTION `w` (poids) dans l'accumulateur. */
export function addXp(acc: StatBuckets, xp: number, w: StatWeights): void {
  if (!xp) return;
  acc.power += xp * w.power;
  acc.endurance += xp * w.endurance;
  acc.agility += xp * w.agility;
}

// ── Outils vecteur ──
/** Intensité = somme des 3 composantes (= MET ×10 adouci). Course = 100. */
export function intensityOf(v: StatBuckets): number {
  return v.power + v.endurance + v.agility;
}
/** Direction normalisée (poids ~somme 1) d'un vecteur de bénéfices. */
export function directionOf(v: StatBuckets): StatWeights {
  const s = intensityOf(v);
  if (s <= 0) return { power: 0, endurance: 1, agility: 0 };
  return { power: v.power / s, endurance: v.endurance / s, agility: v.agility / s };
}

// Muscu (séances, défis muscu, Défi 360) : force d'abord, un peu d'endurance
// (reps). La muscu garde son XP volume-based (durée + tonnage, cf. athlete.ts),
// généreuse par choix (bénéfice force/os/métabolisme > son simple coût MET) ;
// ici on ne définit que sa DIRECTION.
export const MUSCU_SIG: StatWeights = { power: 0.6, endurance: 0.3, agility: 0.1 };

// ── Bénéfices cardio (vecteurs non normalisés, somme = intensité) ──
// Intensités adossées au MET (course ~9.8→100 ; vélo ~7→75 ; marche ~3.5 mais
// remontée à 50 pour la motivation ; rando/vélo d'appart ~6.5).
const CARDIO_BENEFIT: Record<CardioActivity, StatBuckets> = {
  course: { power: 0, endurance: 70, agility: 30 }, // 100
  course_tapis: { power: 0, endurance: 70, agility: 30 }, // 100
  trail: { power: 20, endurance: 60, agility: 20 }, // 100 (+ dénivelé côté XP)
  velo: { power: 8, endurance: 60, agility: 7 }, // 75
  velo_appart: { power: 7, endurance: 52, agility: 6 }, // 65
  rando: { power: 13, endurance: 46, agility: 6 }, // 65 (+ dénivelé)
  marche: { power: 0, endurance: 42, agility: 8 }, // 50 (adouci depuis MET 35)
  marche_tapis: { power: 0, endurance: 42, agility: 8 }, // 50
};
export function activityBenefit(a: CardioActivity): StatBuckets {
  return CARDIO_BENEFIT[a] ?? { power: 0, endurance: 70, agility: 30 };
}
/** Intensité d'une activité cardio (course = 100 → facteur d'XP = intensité/100). */
export function activityIntensity(a: CardioActivity): number {
  return intensityOf(activityBenefit(a));
}
export function cardioSignature(a: CardioActivity): StatWeights {
  return directionOf(activityBenefit(a));
}

// Défis cardio (marche/course/vélo génériques) : direction cardio générique.
// (Le montant d'XP d'un défi vient de challenges.ts, pas de l'intensité ici.)
export const CARDIO_CHALLENGE_SIG: StatWeights = { power: 0, endurance: 0.7, agility: 0.3 };

// ── Bénéfices « autre sport » (vecteurs non normalisés, somme = intensité MET×10) ──
// Basé sur ce que chaque sport travaille × son intensité typique (MET adouci).
const SPORT_BENEFIT: Record<string, StatBuckets> = {
  Tennis: { power: 0, endurance: 28, agility: 42 }, // 70
  Padel: { power: 0, endurance: 28, agility: 42 }, // 70
  Football: { power: 8, endurance: 32, agility: 40 }, // 80
  Basket: { power: 11, endurance: 26, agility: 38 }, // 75
  Natation: { power: 28, endurance: 42, agility: 0 }, // 70
  Course: { power: 0, endurance: 70, agility: 30 }, // 100
  Vélo: { power: 8, endurance: 60, agility: 7 }, // 75
  Escalade: { power: 48, endurance: 8, agility: 24 }, // 80
  Boxe: { power: 27, endurance: 27, agility: 36 }, // 90
  Rugby: { power: 32, endurance: 24, agility: 24 }, // 80
  Yoga: { power: 9, endurance: 9, agility: 12 }, // 30
  Randonnée: { power: 13, endurance: 46, agility: 6 }, // 65
  Ski: { power: 28, endurance: 14, agility: 28 }, // 70
  Golf: { power: 13, endurance: 9, agility: 23 }, // 45
  Danse: { power: 6, endurance: 22, agility: 27 }, // 55
  Crossfit: { power: 36, endurance: 32, agility: 22 }, // 90
  Hyrox: { power: 28, endurance: 52, agility: 15 }, // 95
  Badminton: { power: 0, endurance: 26, agility: 39 }, // 65
  Squash: { power: 0, endurance: 40, agility: 40 }, // 80
  'Tennis de table': { power: 0, endurance: 14, agility: 31 }, // 45
  Volley: { power: 18, endurance: 12, agility: 30 }, // 60
  Handball: { power: 16, endurance: 32, agility: 32 }, // 80
  Judo: { power: 40, endurance: 16, agility: 24 }, // 80
  'Arts martiaux': { power: 22, endurance: 15, agility: 38 }, // 75
  MMA: { power: 32, endurance: 27, agility: 31 }, // 90
  Aviron: { power: 32, endurance: 48, agility: 0 }, // 80
  Surf: { power: 12, endurance: 18, agility: 30 }, // 60
  Paddle: { power: 16, endurance: 28, agility: 11 }, // 55
  Snowboard: { power: 20, endurance: 13, agility: 32 }, // 65
  Roller: { power: 6, endurance: 20, agility: 39 }, // 65
  'Corde à sauter': { power: 0, endurance: 60, agility: 40 }, // 100
  Gymnastique: { power: 35, endurance: 7, agility: 28 }, // 70
  Pilates: { power: 10, endurance: 10, agility: 15 }, // 35
  Équitation: { power: 9, endurance: 18, agility: 18 }, // 45
};
// Sport inconnu / « Autre » libre : équilibré, intensité moyenne (~65).
export const DEFAULT_SPORT_BENEFIT: StatBuckets = { power: 20, endurance: 25, agility: 20 };
export function sportBenefit(name?: string | null): StatBuckets {
  return (name && SPORT_BENEFIT[name]) || DEFAULT_SPORT_BENEFIT;
}
/** Intensité d'un « autre sport » (course = 100 → facteur d'XP = intensité/100). */
export function sportIntensity(name?: string | null): number {
  return intensityOf(sportBenefit(name));
}
export function sportSignature(name?: string | null): StatWeights {
  return directionOf(sportBenefit(name));
}
export const DEFAULT_SPORT_SIG: StatWeights = directionOf(DEFAULT_SPORT_BENEFIT);

/** Table (nom → bénéfices) pour l'affichage pédagogique (page admin Formules). */
export const SPORT_BENEFITS = SPORT_BENEFIT;
export const SPORT_SIGNATURES = SPORT_BENEFIT; // rétro-compat (affichage)
