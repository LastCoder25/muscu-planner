// characterRank.ts — RANG DE PRESTIGE du personnage, dérivé du NIVEAU (cosmétique).
// N'affecte NI les stats NI le combat (qui viennent de l'XP) : c'est un badge de
// progression. 10 rangs × 5 étoiles = 50 crans ; 1 étoile tous les 2 niveaux → 1 rang
// = 10 niveaux → 10 rangs couvrent les niveaux 1→100 (fin de contenu). Plafonné à
// « Tout-puissant ★5 » au-delà du niveau 100. Pur, testé.

export interface RankTier {
  name: string;
  emoji: string;
}

// L'ordre = la progression (bronze → tout-puissant).
export const CHARACTER_RANKS: RankTier[] = [
  { name: 'Bronze', emoji: '🥉' },
  { name: 'Argent', emoji: '🥈' },
  { name: 'Or', emoji: '🥇' },
  { name: 'Or noir', emoji: '🖤' },
  { name: 'Légendaire', emoji: '🏆' },
  { name: 'Demi-dieu', emoji: '⚡' },
  { name: 'Divin', emoji: '✨' },
  { name: 'Divin ancestral', emoji: '🌟' },
  { name: 'Divin céleste', emoji: '☄️' },
  { name: 'Tout-puissant', emoji: '👑' },
];

const STARS_PER_RANK = 5;
const LEVELS_PER_STAR = 2;
const MAX_TIER = CHARACTER_RANKS.length * STARS_PER_RANK - 1; // 49 (dernier cran)

export interface CharacterRank {
  rankIndex: number; // 0..9
  name: string;
  emoji: string;
  star: number; // 1..5 (étoile courante dans le rang)
  tier: number; // 0..49 (cran global)
}

/** Rang de prestige pour un niveau donné. Niveau 1 = Bronze ★1 ; +1 étoile tous les 2
 *  niveaux ; niveau 10 = Bronze ★5 ; niveau 11 = Argent ★1 ; plafond Tout-puissant ★5. */
export function characterRank(level: number): CharacterRank {
  const tier = Math.max(
    0,
    Math.min(MAX_TIER, Math.floor((Math.max(1, level) - 1) / LEVELS_PER_STAR)),
  );
  const rankIndex = Math.floor(tier / STARS_PER_RANK);
  const star = (tier % STARS_PER_RANK) + 1;
  const t = CHARACTER_RANKS[rankIndex]!;
  return { rankIndex, name: t.name, emoji: t.emoji, star, tier };
}

/** « ★★★★☆ » pour l'étoile courante d'un rang (5 crans). */
export function rankStarStr(star: number): string {
  const s = Math.max(1, Math.min(STARS_PER_RANK, star));
  return '★'.repeat(s) + '☆'.repeat(STARS_PER_RANK - s);
}
