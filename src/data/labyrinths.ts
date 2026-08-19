// labyrinths.ts — LA LADDER DU LABYRINTHE (paliers de plus en plus profonds).
// Le Labyrinthe (crawler à étages, cf. ExpeditionPage/dungeonCrawl) n'était qu'un
// donjon unique dont le nb d'étages suivait le niveau du perso. On le passe en
// PALIERS successifs façon donjons/boss : chaque palier est plus profond (plus
// d'étages), plus riche (butin/familiers de rang plus haut via level+luck), et se
// DÉBLOQUE en ayant nettoyé le précédent (préfixe `laby:` dans cleared_dungeons).
// Pur (aucune dépendance Vue/Supabase), testé.

export interface Labyrinth {
  id: string;
  name: string;
  emoji: string;
  recoLevel: number; // niveau conseillé (indicatif — pas de gate dur, cf. donjons)
  floors: number; // nb d'étages (croissant → plus long, plus d'attrition)
  dropLevel: number; // niveau des objets/familier de fin (croissant)
  luck: number; // biais de rareté (coffres, trésor, familier) 0..1 (croissant)
  fragBonus: number; // fragments 🧩 bonus par coffre ET au clear (croissant)
}

// Préfixe des ids de palier nettoyés dans characters.cleared_dungeons.
export const LABY_CLEAR_PREFIX = 'laby:';
export const labyClearId = (id: string) => `${LABY_CLEAR_PREFIX}${id}`;

// 6 paliers couvrant la partie (reco 2 → 60). floors 3→8, dropLevel/luck/frag croissants
// → un palier profond rend des objets/familiers de rang plus haut (via level+luck) tout
// en étant plus long/dangereux (plus d'étages = plus d'attrition sans soin).
export const LABYRINTHS: Labyrinth[] = [
  {
    id: 'novice',
    name: 'Dédale des Novices',
    emoji: '🌀',
    recoLevel: 2,
    floors: 3,
    dropLevel: 4,
    luck: 0.3,
    fragBonus: 0,
  },
  {
    id: 'cryptes',
    name: 'Cryptes Tortueuses',
    emoji: '🕳️',
    recoLevel: 8,
    floors: 4,
    dropLevel: 10,
    luck: 0.45,
    fragBonus: 1,
  },
  {
    id: 'abysse',
    name: 'Abysse Sinueux',
    emoji: '🌌',
    recoLevel: 16,
    floors: 5,
    dropLevel: 18,
    luck: 0.6,
    fragBonus: 2,
  },
  {
    id: 'sansfond',
    name: 'Labyrinthe Sans Fond',
    emoji: '⚫',
    recoLevel: 26,
    floors: 6,
    dropLevel: 28,
    luck: 0.75,
    fragBonus: 3,
  },
  {
    id: 'chaos',
    name: 'Spirale du Chaos',
    emoji: '🌪️',
    recoLevel: 40,
    floors: 7,
    dropLevel: 42,
    luck: 0.9,
    fragBonus: 4,
  },
  {
    id: 'neant',
    name: 'Cœur du Néant',
    emoji: '🕸️',
    recoLevel: 60,
    floors: 8,
    dropLevel: 62,
    luck: 1,
    fragBonus: 6,
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

/** Premier palier NON nettoyé (la « frontière » à afficher par défaut). */
export function frontierLabyrinth(cleared: string[]): Labyrinth {
  return (
    LABYRINTHS.find((l) => !labyrinthCleared(l.id, cleared)) ?? LABYRINTHS[LABYRINTHS.length - 1]!
  );
}
