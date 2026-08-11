// regions.ts — BIOMES de l'Aventure (pur/testé). Regroupe les donjons en RÉGIONS
// thématiques successives (aube → feu → néant → sauvage → chaos) pour donner la
// sensation de « découvrir de nouveaux mondes » plutôt qu'une liste plate. Chaque
// région a sa couleur/ambiance ; franchir une région est un moment célébré (reveal).
// Purement présentation + progression : n'affecte PAS le combat ni les drops.

export interface Region {
  id: string;
  name: string;
  emoji: string;
  color: string; // teinte d'accent (fond sombre) pour bandeau/tuiles
  blurb: string; // ambiance « coach »
  dungeonIds: string[]; // donjons de la région, dans l'ordre de progression
}

// Les ids suivent l'ordre de `DUNGEONS` (par recoLevel croissant).
export const REGIONS: Region[] = [
  {
    id: 'aube',
    name: "Terres de l'Aube",
    emoji: '🌲',
    color: '#7BC86C',
    blurb: 'Clairières et ruines : on fait ses armes.',
    dungeonIds: ['clairiere', 'caverne', 'repaire'],
  },
  {
    id: 'gouffres',
    name: 'Gouffres Ardents',
    emoji: '🌋',
    color: '#FF6A45',
    blurb: 'Cryptes, fournaises et antres de dragon.',
    dungeonIds: ['cryptes', 'fournaise', 'abime'],
  },
  {
    id: 'neant',
    name: 'Confins du Néant',
    emoji: '🌌',
    color: '#9A6BFF',
    blurb: 'Là où le monde se déchire — démons et chimères.',
    dungeonIds: ['neant', 'apocalypse', 'chimere_den'],
  },
  {
    id: 'marches',
    name: 'Marches Sauvages',
    emoji: '🌊',
    color: '#3FB6C6',
    blurb: 'Bêtes colossales des eaux et des cavernes.',
    dungeonIds: ['hydre_marais', 'behemoth_caverne', 'leviathan_fosse'],
  },
  {
    id: 'chaos',
    name: 'Abysses du Chaos',
    emoji: '☠️',
    color: '#FF3B6B',
    blurb: 'Le plus profond : mort et chaos absolus.',
    dungeonIds: ['kraken_abysses', 'necropole', 'faille_chaos'],
  },
];

// Ordre à plat des donjons (= ordre de progression global).
const ORDERED_IDS: string[] = REGIONS.flatMap((r) => r.dungeonIds);

/** Région d'un donjon (undefined si inconnu). */
export function regionOfDungeon(dungeonId: string): Region | undefined {
  return REGIONS.find((r) => r.dungeonIds.includes(dungeonId));
}

/** Index de région d'un donjon (−1 si inconnu). */
export function regionIndexOfDungeon(dungeonId: string): number {
  return REGIONS.findIndex((r) => r.dungeonIds.includes(dungeonId));
}

/** Donjon « frontière » = 1er donjon non nettoyé dans l'ordre (celui en cours).
 *  Si tout est nettoyé, renvoie le dernier. */
export function frontierDungeonId(clearedIds: string[]): string {
  const cleared = new Set(clearedIds);
  return ORDERED_IDS.find((id) => !cleared.has(id)) ?? ORDERED_IDS[ORDERED_IDS.length - 1]!;
}

/** Région COURANTE = celle du donjon frontière. */
export function currentRegion(clearedIds: string[]): Region {
  return regionOfDungeon(frontierDungeonId(clearedIds)) ?? REGIONS[0]!;
}

/** Région SUIVANTE (à découvrir), ou undefined si on est déjà dans la dernière. */
export function nextRegion(clearedIds: string[]): Region | undefined {
  const idx = REGIONS.findIndex((r) => r.id === currentRegion(clearedIds).id);
  return REGIONS[idx + 1];
}

/** Avancement d'une région : {done, total} donjons nettoyés. */
export function regionProgress(region: Region, clearedIds: string[]): { done: number; total: number } {
  const cleared = new Set(clearedIds);
  return {
    done: region.dungeonIds.filter((id) => cleared.has(id)).length,
    total: region.dungeonIds.length,
  };
}
