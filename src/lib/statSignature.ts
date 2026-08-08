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
// La somme reflète l'intensité RÉELLE du sport (Compendium of Physical Activities) :
// course = 100 est un REPÈRE, PAS un plafond → les sports plus intenses le dépassent
// (corde à sauter ~120, squash/MMA ~110, boxe/hyrox ~105…), les doux sont bas
// (yoga 30, pilates 35). La direction = ce que le sport travaille.
const SPORT_BENEFIT: Record<string, StatBuckets> = {
  Tennis: { power: 0, endurance: 30, agility: 45 }, // 75
  Padel: { power: 0, endurance: 28, agility: 42 }, // 70
  Football: { power: 8, endurance: 34, agility: 43 }, // 85
  Basket: { power: 11, endurance: 26, agility: 38 }, // 75
  Natation: { power: 36, endurance: 54, agility: 0 }, // 90
  Course: { power: 0, endurance: 70, agility: 30 }, // 100
  Vélo: { power: 8, endurance: 60, agility: 7 }, // 75
  Escalade: { power: 54, endurance: 9, agility: 27 }, // 90
  Boxe: { power: 31, endurance: 32, agility: 42 }, // 105
  Rugby: { power: 34, endurance: 25, agility: 26 }, // 85
  Yoga: { power: 9, endurance: 9, agility: 12 }, // 30
  Randonnée: { power: 13, endurance: 46, agility: 6 }, // 65
  Ski: { power: 28, endurance: 14, agility: 28 }, // 70
  Golf: { power: 13, endurance: 9, agility: 23 }, // 45
  Danse: { power: 6, endurance: 24, agility: 30 }, // 60
  Crossfit: { power: 40, endurance: 35, agility: 25 }, // 100
  Hyrox: { power: 31, endurance: 58, agility: 16 }, // 105
  Badminton: { power: 0, endurance: 28, agility: 42 }, // 70
  Squash: { power: 0, endurance: 55, agility: 55 }, // 110
  'Tennis de table': { power: 0, endurance: 14, agility: 31 }, // 45
  Volley: { power: 16, endurance: 11, agility: 28 }, // 55
  Handball: { power: 17, endurance: 34, agility: 34 }, // 85
  Judo: { power: 50, endurance: 20, agility: 30 }, // 100
  'Arts martiaux': { power: 28, endurance: 19, agility: 48 }, // 95
  MMA: { power: 38, endurance: 33, agility: 39 }, // 110
  Aviron: { power: 38, endurance: 57, agility: 0 }, // 95
  Surf: { power: 10, endurance: 15, agility: 25 }, // 50
  Paddle: { power: 18, endurance: 30, agility: 12 }, // 60
  Snowboard: { power: 20, endurance: 13, agility: 32 }, // 65
  Roller: { power: 8, endurance: 22, agility: 45 }, // 75
  'Corde à sauter': { power: 0, endurance: 72, agility: 48 }, // 120
  Gymnastique: { power: 32, endurance: 7, agility: 26 }, // 65
  Pilates: { power: 10, endurance: 10, agility: 15 }, // 35
  Équitation: { power: 10, endurance: 20, agility: 20 }, // 50
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
