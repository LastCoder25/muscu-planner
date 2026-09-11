// characterRank.ts — RANG DE PRESTIGE du personnage, dérivé du NIVEAU (cosmétique).
// N'affecte NI les stats NI le combat (qui viennent de l'XP) : c'est un badge de
// progression. 10 rangs × 5 étoiles = 50 crans ; 1 étoile tous les 2 niveaux → 1 rang
// = 10 niveaux → 10 rangs couvrent les niveaux 1→100 (fin de contenu). Plafonné à
// « Tout-puissant ★5 » au-delà du niveau 100. Pur, testé.

export interface RankTier {
  name: string;
  emoji: string;
  color: string; // couleur du rang (badge coloré → progression lisible d'un coup d'œil)
}

// L'ordre = la progression (bronze → tout-puissant). Couleur montante : cuivre →
// argent → or → or sombre → orange légendaire → violet mythique → bleus divins → or éclatant.
export const CHARACTER_RANKS: RankTier[] = [
  // Pastilles teintées métal (pas les médailles 🥉🥈🥇 qui portent un chiffre de PLACE
  // 3/2/1 → incohérent avec les étoiles de prestige, ticket fffbadf0).
  { name: 'Bronze', emoji: '🟤', color: '#cd7f32' },
  { name: 'Argent', emoji: '⚪', color: '#c9d2dc' },
  { name: 'Or', emoji: '🟡', color: '#ffcf3f' },
  { name: 'Or noir', emoji: '🖤', color: '#b8912e' },
  { name: 'Légendaire', emoji: '🏆', color: '#ff9a3f' },
  { name: 'Demi-dieu', emoji: '⚡', color: '#b07cff' },
  { name: 'Divin', emoji: '✨', color: '#6cc8ff' },
  { name: 'Divin ancestral', emoji: '🌟', color: '#5fe0d0' },
  { name: 'Divin céleste', emoji: '☄️', color: '#a9ecff' },
  { name: 'Tout-puissant', emoji: '👑', color: '#fff0a0' },
];

const STARS_PER_RANK = 5;
const LEVELS_PER_STAR = 2;
const MAX_TIER = CHARACTER_RANKS.length * STARS_PER_RANK - 1; // 49 (dernier cran)

export interface CharacterRank {
  rankIndex: number; // 0..9
  name: string;
  emoji: string;
  color: string; // couleur du rang
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
  return { rankIndex, name: t.name, emoji: t.emoji, color: t.color, star, tier };
}

/** Avancement vers l'ÉTOILE suivante, de 0 à 1.
 *
 *  ⚠️ Le niveau reste CACHÉ (on n'affiche que le rang), donc sans cette barre la
 *  progression est invisible entre deux étoiles — soit jusqu'à deux niveaux de travail
 *  sans le moindre retour. `xpInLevel` = part du niveau en cours déjà acquise (0..1) :
 *  la barre bouge alors à CHAQUE mission, pas seulement au passage de niveau.
 *
 *  Vit ici parce que c'est une propriété de l'ÉCHELLE de prestige, pas des aventuriers :
 *  le héros peut l'utiliser telle quelle. */
export function rankProgress(level: number, xpInLevel = 0): number {
  const L = Math.max(1, level);
  const inStar = (L - 1) % LEVELS_PER_STAR;
  const frac = Math.min(1, Math.max(0, xpInLevel));
  return Math.min(1, (inStar + frac) / LEVELS_PER_STAR);
}

/** Niveau auquel l'étoile suivante sera atteinte (utile pour l'info-bulle de la barre). */
export function nextStarLevel(level: number): number {
  const L = Math.max(1, level);
  return L + (LEVELS_PER_STAR - ((L - 1) % LEVELS_PER_STAR));
}

/** « ★★★★☆ » pour l'étoile courante d'un rang (5 crans). */
export function rankStarStr(star: number): string {
  const s = Math.max(1, Math.min(STARS_PER_RANK, star));
  return '★'.repeat(s) + '☆'.repeat(STARS_PER_RANK - s);
}
