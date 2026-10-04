/**
 * 🪬 LA MISE EN SCÈNE DE L'OUVERTURE D'UNE RUNE (spec `2026-09-30-runes-multicolores` § 8).
 *
 * ⚠️ ELLE NE DÉCIDE RIEN : le store a DÉJÀ tiré et crédité (`openRuneBatch`). Ce module ne dit
 * que le RYTHME et le PRÉSAGE de la scène — la règle de `gachaReveal`, `siegeStage` et
 * `arenaStage`. Le composant (`RuneReveal.vue`) ne fait que peindre ce qui est décidé ici.
 *
 * La scène : un mur de pierre gravé, une alcôve. La rune tombe dans l'alcôve, les glyphes du
 * mur s'allument un à un (plus il y en a, plus la couleur est rare), un temps suspendu, puis la
 * couleur tirée envahit le mur et la compétence se révèle.
 */
import { RUNE_TIERS, SKILLS, type RuneTier, type SkillId } from './skillRunes';

/** Rang d'une couleur : 0 verte → 3 dorée. */
export const tierRank = (t: RuneTier): number => RUNE_TIERS.indexOf(t);

/** Les réglages de la scène. */
export const RUNE_REVEAL = {
  /** Glyphes gravés autour de l'alcôve. */
  glyphs: 12,
  /** Glyphes allumés avant la révélation, par couleur : la dorée allume TOUT le mur. */
  litByRank: [5, 7, 10, 12] as readonly number[],
  /** Chute de la rune dans l'alcôve. */
  dropMs: 900,
  /** Pas d'un glyphe à l'autre, et le ralenti des trois derniers pour une couleur rare. */
  glyphStepMs: 140,
  glyphSlowMs: 220,
  /** Le temps suspendu avant l'éclat : plus la couleur est rare, plus il dure. */
  holdMs: 300,
  holdMsPerRank: 380,
  /** La couleur qui envahit le mur. */
  floodMs: 700,
  /** Le nom tapé à la machine, lettre par lettre. */
  typeMs: 45,
  /** Lot : chute décalée d'une alcôve à l'autre, scrutation, cascade des communes. */
  lotDropGapMs: 120,
  lotScanMs: 150,
  lotCascadeMs: 260,
} as const;

/** Les glyphes du mur (futhark). */
export const RUNE_GLYPHS = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ'] as const;

/** Combien de glyphes s'allument pour cette couleur. */
export function litGlyphs(t: RuneTier): number {
  return Math.min(RUNE_REVEAL.glyphs, RUNE_REVEAL.litByRank[tierRank(t)]!);
}

/** Délai (depuis le début des glyphes) auquel le glyphe `i` s'allume. Les trois derniers
 *  ralentissent pour une couleur rare : la tension monte avant l'éclat. */
export function glyphAt(t: RuneTier, i: number): number {
  const n = litGlyphs(t);
  const slow = tierRank(t) >= 2 ? 3 : 0;
  let ms = 0;
  for (let k = 0; k < i; k++)
    ms += RUNE_REVEAL.glyphStepMs + (slow && k >= n - slow ? RUNE_REVEAL.glyphSlowMs : 0);
  return ms;
}

/** Le temps suspendu avant l'éclat. */
export const holdMs = (t: RuneTier): number =>
  RUNE_REVEAL.holdMs + tierRank(t) * RUNE_REVEAL.holdMsPerRank;

/**
 * 🔮 LE PRÉSAGE, HONNÊTE (spec § 8) : RIEN sur une verte ni une bleue, une lueur sur une
 * violette, plus forte sur une dorée. ⚠️ Une verte ne fait JAMAIS semblant d'être rare :
 * c'est l'ABSENCE de lueur qui donne son sens à la lueur.
 */
export function runeOmen(t: RuneTier): number {
  return t === 'gold' ? 1 : t === 'violet' ? 0.5 : 0;
}

/** Une alcôve du lot ×10. `hot` : une rune hors basique (bleue et au-dessus), qu'on ouvre EN
 *  GRAND au toucher. */
export interface LotCell {
  index: number;
  id: SkillId;
  tier: RuneTier;
  hot: boolean;
  /** Quand elle s'ouvre toute seule (communes) ; `null` pour une rare. */
  autoAt: number | null;
}

/** Le lot : seules les vertes (basiques) s'ouvrent en cascade (dans l'ordre du tirage) après la
 *  chute et la scrutation ; toute rune hors basique attend qu'on la touche — comme un A ou un S
 *  au ×10 des champions (v1.55.3, demandé). */
export function lotCells(ids: readonly SkillId[]): LotCell[] {
  const start = lotCascadeStart(ids.length);
  let k = 0;
  return ids.map((id, index) => {
    const tier = SKILLS[id].tier;
    const hot = tierRank(tier) >= 1;
    return {
      index,
      id,
      tier,
      hot,
      autoAt: hot ? null : start + k++ * RUNE_REVEAL.lotCascadeMs,
    };
  });
}

/** Début de la cascade : toutes les runes tombées, puis une scrutation alcôve par alcôve. */
export function lotCascadeStart(n: number): number {
  return (
    RUNE_REVEAL.dropMs + Math.max(0, n - 1) * RUNE_REVEAL.lotDropGapMs + n * RUNE_REVEAL.lotScanMs
  );
}

/** La couleur la plus rare d'un lot (le mur prend sa teinte à la fin). */
export function bestTier(ids: readonly SkillId[]): RuneTier {
  return ids.reduce<RuneTier>(
    (m, id) => (tierRank(SKILLS[id].tier) > tierRank(m) ? SKILLS[id].tier : m),
    'green',
  );
}
