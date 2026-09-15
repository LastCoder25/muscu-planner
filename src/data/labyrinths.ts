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
const LABY_CLEAR_PREFIX = 'laby:';
export const labyClearId = (id: string) => `${LABY_CLEAR_PREFIX}${id}`;
/** Le palier d'un id de `cleared_dungeons`, ou null s'il n'est pas un palier de Labyrinthe. */
export const labyIdOfClear = (clearId: string | null | undefined): string | null =>
  clearId?.startsWith(LABY_CLEAR_PREFIX) ? clearId.slice(LABY_CLEAR_PREFIX.length) : null;

/** Runs LANCÉS et runs NETTOYÉS, par palier (`characters.laby_stats`, migr. 0073). Un run
 *  compte au lancement (clés payées) ; mort, retraite et run quitté en route ne nettoient pas. */
export type LabyStats = Record<string, { runs: number; clears: number }>;

/** Relecture défensive du JSONB : entrées malformées écartées, compteurs entiers ≥ 0, jamais
 *  plus de runs nettoyés que de runs lancés. */
export function normalizeLabyStats(v: unknown): LabyStats {
  const out: LabyStats = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const n = (x: unknown) => (typeof x === 'number' && x > 0 ? Math.floor(x) : 0);
  for (const [id, e] of Object.entries(v as Record<string, unknown>)) {
    if (!e || typeof e !== 'object') continue;
    const runs = n((e as { runs?: unknown }).runs);
    const clears = Math.min(runs, n((e as { clears?: unknown }).clears));
    if (runs > 0) out[id] = { runs, clears };
  }
  return out;
}

/** Un run LANCÉ sur le palier `id`. */
export function labyRunStarted(stats: LabyStats, id: string): LabyStats {
  const cur = stats[id] ?? { runs: 0, clears: 0 };
  return { ...stats, [id]: { runs: cur.runs + 1, clears: cur.clears } };
}

/** Le palier `id` est NETTOYÉ. Un nettoyage sans lancement enregistré (run commencé avant que
 *  les compteurs existent) compte aussi comme un run : le % ne dépasse jamais 100. */
export function labyRunCleared(stats: LabyStats, id: string): LabyStats {
  const cur = stats[id] ?? { runs: 0, clears: 0 };
  const clears = cur.clears + 1;
  return { ...stats, [id]: { runs: Math.max(cur.runs, clears), clears } };
}

/** % de runs nettoyés sur le palier, ou null si le joueur ne l'a jamais lancé. */
export function labySuccessPct(stats: LabyStats, id: string): number | null {
  const e = stats[id];
  if (!e || e.runs <= 0) return null;
  return Math.round((Math.min(e.clears, e.runs) / e.runs) * 100);
}

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

/**
 * COMBIEN DE CLÉS 🗝️ COÛTE UN PALIER : une de plus tous les trois paliers.
 *
 * ⚠️ UNE CLÉ PAR RUN, QUEL QUE SOIT LE PALIER, FAISAIT DE LA PORTE UN ROBINET DE FARM EN
 * FIN DE PARTIE. Son débit est linéaire en niveau (~0,14 run/jour par niveau, v0.794) :
 * mesuré au palier de pointe du joueur, **3 runs/jour au niveau 3 mais 17 au niveau
 * 100**. Le Labyrinthe est la SEULE source de familiers — on finissait par vivre dedans.
 *
 * ⚠️ UNE MONNAIE, PAS UN PÉAGE : le coût suit la profondeur, donc on CHOISIT où dépenser —
 * beaucoup de runs peu profonds (familiers de rang modeste) ou peu de runs au fond.
 * Mesuré avec cette règle, le palier de pointe reste finançable **3 à 4 fois par jour du
 * niveau 3 au niveau 100** — la courbe devient plate, ce qui est tout l’objet.
 *
 * ⚠️ Les TROIS premiers paliers restent à une clé : le début de partie ne change pas.
 * Règle comparée à trois autres (par rang de familier, par étages, un de plus tous les
 * deux paliers) : c’est la seule qui ne descende pas sous 2 runs/jour dès le niveau 6.
 */
export function labyKeyCost(id: string): number {
  const i = Math.max(
    0,
    LABYRINTHS.findIndex((l) => l.id === id),
  );
  return 1 + Math.floor(i / 3);
}

/**
 * Les clés qui restent après avoir payé `cost`, ou `null` si le compte n’y est pas.
 *
 * ⚠️ LE PRIX ENTIER, jamais « au moins une » : un palier profond coûte plusieurs clés, et un
 * garde sur `keys > 0` laissait entrer avec une clé pour trois. Vivait dans le store, donc
 * hors de portée des tests — c’était le relevé non traité de la v0.799. Un coût est au
 * moins d’une clé : un paramètre à zéro ou fractionnaire ne fait pas entrer gratuitement.
 */
export function keysAfterPaying(keys: number, cost: number): number | null {
  const prix = Math.max(1, Math.floor(cost));
  return keys >= prix ? keys - prix : null;
}

/**
 * Ce qu’on dit en fin de run pour décider de rejouer : les clés restantes, et combien de runs
 * du MÊME palier elles paient (ou combien il en manque pour le prochain).
 * ⚠️ Même règle de prix que `keysAfterPaying` (au moins une clé, prix entier) : les deux ne
 * doivent jamais annoncer des choses différentes pour le même palier.
 */
export function replayKeysInfo(
  keys: number,
  cost: number,
): { keys: number; runs: number; missing: number; label: string } {
  const prix = Math.max(1, Math.floor(cost));
  const k = Math.max(0, Math.floor(keys));
  const runs = Math.floor(k / prix);
  const missing = runs > 0 ? 0 : prix - k;
  const cles = `${k} clé${k > 1 ? 's' : ''}`;
  const label =
    runs > 0
      ? `🗝️ Il te reste ${cles} — de quoi rejouer ce palier ${runs} fois.`
      : `🗝️ Il te reste ${cles} — il en manque ${missing} pour rejouer ce palier.`;
  return { keys: k, runs, missing, label };
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
