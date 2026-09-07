// hero3d.ts — SPÉCIFICATION du héros 3D, dérivée du personnage. Pur et testable.
//
// Le composant Three.js ne décide rien : il assemble des primitives d'après ce que ce
// module calcule. Même séparation que partout ailleurs — la logique vit dans `src/lib`,
// le rendu se contente de rendre (cf. `arenaStage.ts` / `ArenaStage.vue`).
//
// PRINCIPE : la SILHOUETTE est une projection du sport, exactement comme les stats le
// sont déjà. Un profil puissance a des épaules larges, un profil agilité est élancé et
// fin. On ne lit donc PAS les valeurs absolues (qui montent sans fin avec le niveau)
// mais leur RÉPARTITION — la même lecture que les barres relatives de la fiche Héros.
import { RANK_ORDER, RANK_COLOR, SLOTS, type Equipped, type ItemSlot, type Rarity } from './items';

/** Proportions du corps, en multiplicateurs autour de 1 (1 = silhouette neutre). */
export interface HeroBuild {
  shoulders: number; // largeur d'épaules ← 💪 Puissance
  bulk: number; // épaisseur du torse/membres ← ❤️ Endurance
  height: number; // élancement ← ⚡ Agilité
}

/** Une pièce portée, telle que la scène doit la peindre. */
export interface HeroPiece {
  slot: ItemSlot;
  color: string; // couleur de la RARETÉ (source unique `RANK_COLOR`)
  rank: number; // index dans `RANK_ORDER` → intensité de l'effet
  glow: boolean; // Légendaire+ : la pièce émet
}

export interface HeroSpec {
  build: HeroBuild;
  tint: string; // teinte de peau/tenue selon l'orientation
  pieces: HeroPiece[]; // uniquement les emplacements RÉELLEMENT portés
  familiar: HeroPiece | null; // compagnon en orbite, jamais un membre du corps
}

/** Amplitude des écarts de silhouette. Volontairement CONTENUE : on veut lire
 *  l'orientation d'un coup d'œil, pas obtenir une caricature difforme. */
export const BUILD_SPREAD = 0.45;

/** Teintes par orientation — cohérentes avec l'avatar SVG existant. */
export const PROFILE_TINT: Record<string, string> = {
  puissant: '#FF8A5B',
  agile: '#6FD3FF',
  polyvalent: '#FFD23F',
};

/** Rareté à partir de laquelle une pièce ÉMET de la lumière (Légendaire et au-delà). */
export const GLOW_FROM_RANK = 5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Répartition des 3 stats, normalisée à une somme de 1. Une stat absente (début de
 *  partie, tout à 0) donne un tiers chacune → silhouette neutre plutôt qu'un NaN. */
export function statShares(
  puissance: number,
  endurance: number,
  agilite: number,
): { p: number; e: number; a: number } {
  const p = Math.max(0, puissance);
  const e = Math.max(0, endurance);
  const a = Math.max(0, agilite);
  const sum = p + e + a;
  if (sum <= 0) return { p: 1 / 3, e: 1 / 3, a: 1 / 3 };
  return { p: p / sum, e: e / sum, a: a / sum };
}

/** Silhouette : chaque part de stat écarte sa dimension autour de 1. Un tiers pile
 *  (build parfaitement équilibré) laisse la dimension à 1 exactement. */
export function heroBuild(puissance: number, endurance: number, agilite: number): HeroBuild {
  const { p, e, a } = statShares(puissance, endurance, agilite);
  const dev = (share: number) => 1 + (share - 1 / 3) * 3 * BUILD_SPREAD;
  return {
    shoulders: clamp(dev(p), 1 - BUILD_SPREAD, 1 + BUILD_SPREAD),
    bulk: clamp(dev(e), 1 - BUILD_SPREAD, 1 + BUILD_SPREAD),
    height: clamp(dev(a), 1 - BUILD_SPREAD, 1 + BUILD_SPREAD),
  };
}

function pieceOf(slot: ItemSlot, rarity: Rarity | undefined): HeroPiece | null {
  if (!rarity) return null;
  const rank = Math.max(0, RANK_ORDER.indexOf(rarity));
  return {
    slot,
    color: RANK_COLOR[rarity] ?? RANK_COLOR[RANK_ORDER[0]!],
    rank,
    glow: rank >= GLOW_FROM_RANK,
  };
}

/** Construit la spec complète. `equipped` peut être partiel : un emplacement vide n'est
 *  simplement pas rendu (pas de pièce « fantôme » grise, qui ferait croire à un objet). */
export function buildHeroSpec(
  stats: { puissance: number; endurance: number; agilite: number },
  profile: string,
  equipped: Equipped,
): HeroSpec {
  const pieces: HeroPiece[] = [];
  for (const slot of SLOTS) {
    const piece = pieceOf(slot, equipped[slot]?.rarity);
    if (piece) pieces.push(piece);
  }
  return {
    build: heroBuild(stats.puissance, stats.endurance, stats.agilite),
    tint: PROFILE_TINT[profile] ?? PROFILE_TINT.polyvalent!,
    pieces,
    familiar: pieceOf('familiar', equipped.familiar?.rarity),
  };
}
