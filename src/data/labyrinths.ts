// labyrinths.ts — LA LADDER DU LABYRINTHE (paliers de plus en plus profonds).
// Le Labyrinthe (crawler à étages, cf. ExpeditionPage/dungeonCrawl) n'était qu'un
// donjon unique dont le nb d'étages suivait le niveau du perso. On le passe en
// PALIERS successifs façon donjons/boss : chaque palier est plus profond (plus
// d'étages), plus riche (butin/familiers de rang plus haut via level+luck), et se
// DÉBLOQUE en ayant nettoyé le précédent (préfixe `laby:` dans cleared_dungeons).
// Pur (aucune dépendance Vue/Supabase), testé.

import type { Rarity } from '@/lib/items';

export interface Labyrinth {
  id: string;
  name: string;
  emoji: string;
  rank: Rarity; // rang de familier CIBLE du palier (G → SSS ; un palier par rang)
  recoLevel: number; // niveau conseillé (indicatif — pas de gate dur, cf. donjons)
  floors: number; // nb d'étages (croissant → plus long, plus d'attrition)
  dropLevel: number; // niveau des objets/familier de fin (croissant)
  luck: number; // biais de rareté (coffres, trésor, familier) 0..1 (croissant)
  fragBonus: number; // fragments 🧩 bonus par coffre ET au clear (croissant)
}

// Préfixe des ids de palier nettoyés dans characters.cleared_dungeons.
export const LABY_CLEAR_PREFIX = 'laby:';
export const labyClearId = (id: string) => `${LABY_CLEAR_PREFIX}${id}`;

// 10 paliers — UN PAR RANG DE FAMILIER (G → SSS). Le `dropLevel` place le PLAFOND de rang
// (rankCeilingForLevel) sur le rang cible, et la `luck` (haute pour F+) fait taper ce
// plafond → le familier garanti est ~du rang du palier. Le palier G a une luck BASSE (le
// plafond minimum est F) pour rendre surtout du G. floors/frag/luck croissants, déblocage
// séquentiel (nettoyer le précédent). reco 2 → 85 (couvre toute la partie).
export const LABYRINTHS: Labyrinth[] = [
  {
    id: 'novice',
    name: 'Dédale des Novices',
    emoji: '🌀',
    rank: 'commun',
    recoLevel: 2,
    floors: 3,
    dropLevel: 2,
    luck: 0.15,
    fragBonus: 0,
  },
  {
    id: 'sentiers',
    name: 'Sentiers Perdus',
    emoji: '🌿',
    rank: 'inhabituel',
    recoLevel: 3,
    floors: 3,
    dropLevel: 3,
    luck: 0.9,
    fragBonus: 0,
  },
  {
    id: 'cryptes',
    name: 'Cryptes Tortueuses',
    emoji: '🕳️',
    rank: 'magique',
    recoLevel: 6,
    floors: 4,
    dropLevel: 6,
    luck: 0.9,
    fragBonus: 1,
  },
  {
    id: 'abysse',
    name: 'Abysse Sinueux',
    emoji: '🌌',
    rank: 'magique',
    recoLevel: 12,
    floors: 4,
    dropLevel: 12,
    luck: 0.9,
    fragBonus: 1,
  },
  {
    id: 'gouffre',
    name: 'Gouffre Oublié',
    emoji: '🪨',
    rank: 'rare',
    recoLevel: 20,
    floors: 5,
    dropLevel: 20,
    luck: 0.9,
    fragBonus: 2,
  },
  {
    id: 'sansfond',
    name: 'Labyrinthe Sans Fond',
    emoji: '⚫',
    rank: 'epique',
    recoLevel: 28,
    floors: 6,
    dropLevel: 28,
    luck: 0.9,
    fragBonus: 3,
  },
  {
    id: 'chaos',
    name: 'Spirale du Chaos',
    emoji: '🌪️',
    rank: 'legendaire',
    recoLevel: 40,
    floors: 7,
    dropLevel: 40,
    luck: 0.92,
    fragBonus: 4,
  },
  {
    id: 'astral',
    name: 'Vortex Astral',
    emoji: '🌠',
    rank: 'legendaire',
    recoLevel: 52,
    floors: 8,
    dropLevel: 52,
    luck: 0.95,
    fragBonus: 5,
  },
  {
    id: 'neant',
    name: 'Cœur du Néant',
    emoji: '🕸️',
    rank: 'mythique',
    recoLevel: 66,
    floors: 9,
    dropLevel: 66,
    luck: 0.97,
    fragBonus: 6,
  },
  {
    id: 'infini',
    name: "Œil de l'Infini",
    emoji: '👁️',
    rank: 'primordial',
    recoLevel: 85,
    floors: 10,
    dropLevel: 85,
    luck: 1,
    fragBonus: 8,
  },
];

/** Un palier est débloqué si c'est le premier, ou si le précédent est nettoyé
 *  (`laby:<idPrécédent>` ∈ cleared). */
export function labyrinthUnlockedTier(id: string, cleared: string[]): boolean {
  const i = LABYRINTHS.findIndex((l) => l.id === id);
  if (i <= 0) return i === 0; // premier toujours ouvert ; id inconnu → verrouillé
  return cleared.includes(labyClearId(LABYRINTHS[i - 1]!.id));
}

/** Palier nettoyé au moins une fois ? */
export function labyrinthCleared(id: string, cleared: string[]): boolean {
  return cleared.includes(labyClearId(id));
}

/** Fraction des gains (or/poussière/pierres/fragments) CONSERVÉE si on MEURT dans ce
 *  palier — les objets trouvés sont perdus dans tous les cas. La perte est liée à la
 *  PROFONDEUR : un palier profond « non terminé » pardonne MOINS (risque croissant,
 *  cohérent avec ses meilleures récompenses). novice 100 % → cœur du néant 40 %.
 *  (Ne s'applique qu'à la MORT ; la retraite banque tout le ramassé.) */
export function deathKeepFraction(id: string): number {
  const i = LABYRINTHS.findIndex((l) => l.id === id);
  return Math.max(0.4, 1 - Math.max(0, i) * 0.07); // 10 paliers : novice 100 % → infini 40 %
}

/** Premier palier NON nettoyé (la « frontière » à afficher par défaut). */
export function frontierLabyrinth(cleared: string[]): Labyrinth {
  return (
    LABYRINTHS.find((l) => !labyrinthCleared(l.id, cleared)) ?? LABYRINTHS[LABYRINTHS.length - 1]!
  );
}
