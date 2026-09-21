/**
 * ⬆️ ASCENSION DES CHAMPIONS — les SCEAUX, le COÛT et ce qui BLOQUE (v0.1014, étape B de
 * `docs/superpowers/specs/2026-09-21-ascension-eveil-objets-design.md`). Pur/testé.
 *
 * Le modèle : l'XP d'un champion s'arrête au ★5 d'un rang (`advAscensionCap`) ; passer au ★1
 * du rang suivant demande de l'OR et des SCEAUX DE CE RANG. Les sceaux de champion tombent du
 * GARDIEN d'une faille refermée, au rang de la faille — « laquelle je referme ? » gagne un
 * enjeu, et le sport reste le plafond (aucune faille n'est au-dessus du rang du joueur, et
 * l'ascension ne passe jamais le niveau du Panthéon).
 *
 * ⚠️ Deux familles de sceaux dans UNE colonne (`characters.seals`, migr. 0083) : ceux des
 * CHAMPIONS (ici) et ceux des OBJETS (étape C). Distincts par décision de l'utilisateur.
 */
import { buildingUpgradeCost } from './buildings';
import { CHARACTER_RANKS, characterRank, rankStartLevel } from './characterRank';
import { advGearLevelBand, advGearNextRank, type AdvGear } from './advGear';
import { RARITY_RANK, type Rarity } from './items';
import { advAscensionCap, advNextAscension, type Adventurer } from './adventurers';
import type { SealDrop } from './expedition';

export type SealKind = SealDrop['kind'];

/** Le stock de sceaux : par famille, par rang (index de `CHARACTER_RANKS`). */
export type Seals = Record<SealKind, Partial<Record<number, number>>>;

export const emptySeals = (): Seals => ({ champion: {}, gear: {} });

const ASCENSION = {
  /** Or d'une ascension = ce que coûte un cran de BÂTIMENT au premier niveau du rang visé,
   *  divisé par ce facteur. ⚠️ Adossé au puits d'or du projet (`buildingUpgradeCost`) plutôt
   *  qu'à un nombre écrit : si l'économie des bâtiments bouge, l'ascension suit. */
  goldDiv: 4,
  /** Sceaux de champion par ascension, selon le rang VISÉ : 1 + ⌊rang/2⌋ (1, 2, 2, 3…).
   *  ⚠️ Bas à dessein : un vivier compte jusqu'à des dizaines de champions, tous à monter. */
  sealBase: 1,
  sealPerTwoRanks: 1,
} as const;

/** Relecture défensive du jsonb `seals` : tout ce qui n'est pas un compte entier positif
 *  sous un rang valide est écarté. Jamais `null`. */
export function normalizeSeals(raw: unknown): Seals {
  const out = emptySeals();
  if (!raw || typeof raw !== 'object') return out;
  for (const kind of ['champion', 'gear'] as const) {
    const src = (raw as Record<string, unknown>)[kind];
    if (!src || typeof src !== 'object') continue;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      const rank = Number(k);
      const n = typeof v === 'number' ? Math.floor(v) : 0;
      if (Number.isInteger(rank) && rank >= 0 && rank < CHARACTER_RANKS.length && n > 0)
        out[kind][rank] = n;
    }
  }
  return out;
}

export function sealCount(seals: Seals, kind: SealKind, rank: number): number {
  return seals[kind][rank] ?? 0;
}

/** Ajoute (ou retire, `n` négatif) des sceaux — PUR, rend un nouveau stock. Jamais sous 0. */
export function addSeals(seals: Seals, kind: SealKind, rank: number, n: number): Seals {
  // Un compte ≤ 0 SUPPRIME l'entrée : c'est ce qui garantit « jamais sous zéro ».
  const v = sealCount(seals, kind, rank) + Math.round(n);
  const fam = { ...seals[kind] };
  if (v > 0) fam[rank] = v;
  else delete fam[rank];
  return { ...seals, [kind]: fam };
}

/** Ce que coûte l'ascension VERS ce rang. */
export function ascensionCost(targetRank: number): { gold: number; seals: number } {
  const lvl = rankStartLevel(targetRank);
  return {
    gold: Math.round(buildingUpgradeCost(lvl) / ASCENSION.goldDiv),
    seals: ASCENSION.sealBase + Math.floor(targetRank / 2) * ASCENSION.sealPerTwoRanks,
  };
}

export type AscensionBlock = 'top' | 'notReady' | 'pantheon' | 'seals' | 'gold';

export const ASCENSION_BLOCK_LABEL: Record<AscensionBlock, string> = {
  top: 'Il est au sommet : plus aucun rang à ouvrir.',
  notReady: 'Il doit d’abord atteindre ★★★★★ dans son rang.',
  pantheon: 'Le Panthéon ne le laisse pas monter plus haut — améliore-le.',
  seals: 'Il manque des sceaux de ce rang — referme des failles de ce rang.',
  gold: 'Il manque de l’or.',
};

/**
 * Pourquoi l'ascension est REFUSÉE, ou `null` si elle est permise. ⚠️ SOURCE UNIQUE : le
 * bouton de l'écran et le refus du store lisent la même règle, dans le même ordre.
 */
export function ascensionBlocker(
  adv: Adventurer,
  ctx: { pantheonLevel: number; seals: Seals; gold: number },
): AscensionBlock | null {
  const next = advNextAscension(adv);
  if (next == null) return 'top';
  if (adv.level < advAscensionCap(adv)) return 'notReady';
  // ⚠️ Ouvrir un rang que le Panthéon ne laisse pas atteindre ne servirait à rien : le
  // niveau resterait bloqué, et les sceaux seraient dépensés pour rien.
  if (rankStartLevel(next) > ctx.pantheonLevel) return 'pantheon';
  const cost = ascensionCost(next);
  if (sealCount(ctx.seals, 'champion', next) < cost.seals) return 'seals';
  if (ctx.gold < cost.gold) return 'gold';
  return null;
}

// ── 🗡️ ASCENSION DES OBJETS (v0.1015, étape C) ───────────────────────────────────────────

/** Ce que coûte l'ascension d'une PIÈCE vers ce rang. ⚠️ DÉRIVÉ de celui d'un champion :
 *  un champion porte QUATRE pièces, donc l'or d'une pièce en vaut le quart (équiper tout un
 *  champion coûte l'ascension du champion lui-même), et les sceaux la moitié arrondie au-dessus
 *  (spec § 2 : « N plus bas que pour un champion »). */
export function advGearAscensionCost(targetRank: number): { gold: number; seals: number } {
  const c = ascensionCost(targetRank);
  return { gold: Math.round(c.gold / 4), seals: Math.ceil(c.seals / 2) };
}

export type GearAscensionBlock = 'top' | 'notReady' | 'wearer' | 'seals' | 'gold';

export const GEAR_ASCENSION_BLOCK_LABEL: Record<GearAscensionBlock, string> = {
  top: 'Elle est au sommet : plus aucun rang à ouvrir.',
  notReady: 'Elle doit d’abord atteindre ★★★★★ dans son rang, en combattant.',
  wearer: 'Aucun champion de sa lignée ne peut porter le rang suivant — fais monter le champion.',
  seals: 'Il manque des sceaux d’objet de ce rang — bats des boss de palier.',
  gold: 'Il manque de l’or.',
};

/** Pourquoi l'ascension d'une pièce est REFUSÉE, ou `null`. ⚠️ SOURCE UNIQUE écran + store.
 *  `rankCap` = `advGearRankCap` (le rang que son porteur, ou sa lignée, sait porter). */
export function advGearAscensionBlocker(
  g: AdvGear,
  ctx: { rankCap: Rarity | null; seals: Seals; gold: number },
): GearAscensionBlock | null {
  const next = advGearNextRank(g);
  if (next == null) return 'top';
  if (g.level < advGearLevelBand(g.rarity).max) return 'notReady';
  // ⚠️ Ouvrir un rang que personne ne peut porter rendrait la pièce INUTILISABLE : elle
  // tomberait de son porteur (`canWearAdvGear`), et les sceaux seraient dépensés pour rien.
  if (!ctx.rankCap || RARITY_RANK[ctx.rankCap] < next) return 'wearer';
  const cost = advGearAscensionCost(next);
  if (sealCount(ctx.seals, 'gear', next) < cost.seals) return 'seals';
  if (ctx.gold < cost.gold) return 'gold';
  return null;
}

/** 🗡️ Les sceaux d'OBJET d'une victoire sur un boss de palier (spec § 2) : 2 à la première
 *  victoire, 1 ensuite, au rang du boss PLAFONNÉ à celui du joueur — le sport reste le
 *  plafond, et chaque système a sa source (champions : failles, objets : boss). */
export function bossGearSeals(
  bossLevel: number,
  playerLevel: number,
  firstDefeat: boolean,
): SealDrop {
  const rank = Math.min(
    characterRank(Math.max(1, bossLevel)).rankIndex,
    characterRank(Math.max(1, playerLevel)).rankIndex,
  );
  return { kind: 'gear', rank, n: firstDefeat ? 2 : 1 };
}
