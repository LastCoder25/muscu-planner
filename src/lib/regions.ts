// regions.ts — BIOMES de l'Aventure (pur/testé). Regroupe les donjons en RÉGIONS
// thématiques successives (aube → feu → néant → sauvage → chaos) pour donner la
// sensation de « découvrir de nouveaux mondes » plutôt qu'une liste plate. Chaque
// région a sa couleur/ambiance ; franchir une région est un moment célébré (reveal).
// Purement présentation + progression : n'affecte PAS le combat ni les drops.
import { PROCEDURAL } from '@/lib/proceduralContent';

export interface Region {
  id: string;
  name: string;
  emoji: string;
  color: string; // teinte d'accent (fond sombre) pour bandeau/tuiles
  blurb: string; // ambiance « coach »
  dungeonIds: string[]; // donjons de la région, dans l'ordre de progression
}

// Les ids suivent l'ordre de `DUNGEONS` (par recoLevel croissant).
const HAND_REGIONS: Region[] = [
  {
    id: 'aube',
    name: "Terres de l'Aube",
    emoji: '🌲',
    color: '#7BC86C',
    blurb: 'Clairières et ruines : on fait ses armes.',
    dungeonIds: ['clairiere', 'sentier', 'caverne', 'repaire'],
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

// Régions complètes = écrites à la main (5) + PROCÉDURALES (8, reco 25→94).
export const REGIONS: Region[] = [...HAND_REGIONS, ...PROCEDURAL.regions];

// Ordre à plat des donjons (= ordre de progression global).
const ORDERED_IDS: string[] = REGIONS.flatMap((r) => r.dungeonIds);

/** Région d'un donjon (undefined si inconnu). */
export function regionOfDungeon(dungeonId: string): Region | undefined {
  return REGIONS.find((r) => r.dungeonIds.includes(dungeonId));
}

/** Donjon « frontière » = 1er donjon non nettoyé dans l'ordre (celui en cours).
 *  Si tout est nettoyé, renvoie le dernier. */
export function frontierDungeonId(clearedIds: string[]): string {
  const cleared = new Set(clearedIds);
  return ORDERED_IDS.find((id) => !cleared.has(id)) ?? ORDERED_IDS[ORDERED_IDS.length - 1]!;
}

/** DÉBLOCAGE SÉQUENTIEL d'un donjon dans la chaîne `orderIds` (triée par recoLevel) : ouvert si
 *  c'est le premier, si le PRÉCÉDENT est nettoyé — ou si lui-même ou un donjon PLUS LOIN
 *  l'est déjà.
 *
 *  ⚠️ Cette seconde moitié protège les comptes existants quand on INSÈRE un donjon dans la
 *  chaîne (v0.1078, Sentier des loups entre la Clairière et la Caverne) : un joueur qui a
 *  déjà nettoyé la Caverne ne l'a pas fait passer par le Sentier, et le lire au pied de la
 *  lettre lui VERROUILLERAIT la Caverne — et toute la suite — jusqu'à refaire un donjon de
 *  niveau 3. Ce qu'on a passé reste passé. */
export function dungeonUnlockedIn(
  orderIds: string[],
  id: string,
  clearedIds: Iterable<string>,
): boolean {
  const cleared = new Set(clearedIds);
  const i = orderIds.indexOf(id);
  if (i <= 0) return true;
  return orderIds.slice(i - 1).some((x) => cleared.has(x));
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
export function regionProgress(
  region: Region,
  clearedIds: string[],
): { done: number; total: number } {
  const cleared = new Set(clearedIds);
  return {
    done: region.dungeonIds.filter((id) => cleared.has(id)).length,
    total: region.dungeonIds.length,
  };
}

// ── Géométrie de la CARTE-MONDE serpentine (pur/testable) ──
// Les nœuds de région zigzaguent gauche/droite sur un fil vertical ; un chemin de
// Bézier relie leurs centres. Coordonnées en unités de viewBox (x: 0..100).
const MAP_XL = 26;
const MAP_XR = 74;
const MAP_ROWH = 92;

export interface MapGeometry {
  nodes: { x: number; y: number }[];
  viewH: number;
  pathD: string; // chemin SVG reliant les nœuds (tout d'un trait)
  segments: string[]; // chemin de CHAQUE paire (segment i = nœud i → nœud i+1)
}

/** Positions des nœuds + chemin serpentin (+ segments par paire), pour `count` régions. */
export function regionMapGeometry(count = REGIONS.length): MapGeometry {
  const nodes = Array.from({ length: count }, (_, i) => ({
    x: i % 2 === 0 ? MAP_XL : MAP_XR,
    y: i * MAP_ROWH + MAP_ROWH / 2,
  }));
  let pathD = nodes.length ? `M ${nodes[0]!.x} ${nodes[0]!.y}` : '';
  const segments: string[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const p = nodes[i - 1]!;
    const n = nodes[i]!;
    // Bézier cubique en S vertical entre deux nœuds décalés.
    const c = `C ${p.x} ${p.y + MAP_ROWH / 2}, ${n.x} ${n.y - MAP_ROWH / 2}, ${n.x} ${n.y}`;
    pathD += ` ${c}`;
    segments.push(`M ${p.x} ${p.y} ${c}`);
  }
  return { nodes, viewH: count * MAP_ROWH, pathD, segments };
}

/** Fraction [0..1] du fil « énergisé » selon l'avancement (région courante + %). */
export function mapFillFraction(
  frontierRegionIdx: number,
  curRegionFraction: number,
  count = REGIONS.length,
): number {
  if (count <= 0) return 0;
  const f = (frontierRegionIdx + Math.max(0, Math.min(1, curRegionFraction))) / count;
  return Math.max(0, Math.min(1, f));
}
