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
import { advGearLevelBand, advGearNextRank, advGearRankCap, type AdvGear } from './advGear';
import { RARITY_RANK, type Rarity } from './items';
import { advAscensionCap, advNextAscension, type Adventurer } from './adventurers';
import type { SealDrop } from './expedition';
import { GACHA } from './gacha';

export type SealKind = SealDrop['kind'];

/** Le stock de sceaux : par famille, par rang (index de `CHARACTER_RANKS`). */
export type Seals = Record<SealKind, Partial<Record<number, number>>>;

export const emptySeals = (): Seals => ({ champion: {}, gear: {} });

const ASCENSION = {
  /** Or d'une ascension = ce que coûte un cran de BÂTIMENT au premier niveau du rang visé,
   *  divisé par ce facteur. ⚠️ Adossé au puits d'or du projet (`buildingUpgradeCost`) plutôt
   *  qu'à un nombre écrit : si l'économie des bâtiments bouge, l'ascension suit. */
  goldDiv: 4,
  /** Sceaux de champion par ascension, selon le rang VISÉ : 1 + ⌊rang/4⌋ (1, 1, 1, 2…).
   *  ⚠️ MESURÉ (v0.1017, 20 simulations × 2 ans) : à 1 + ⌊rang/2⌋, un joueur qui referme une
   *  faille par jour avait son trio 5 niveaux ou plus en retard **26 à 37 %** des jours — et
   *  un trio bloqué au ★5 du rang précédent ne gagne que **0 à 26 %** de ses embuscades
   *  (contre 75-91 % à niveau) : ses convois s'effondraient. À ⌊rang/4⌋ : **6 à 14 %** à une
   *  faille/jour, **0 à 2 %** à deux. Un coût de 1 fixe rendait l'ascension formelle (≤ 1 %). */
  sealBase: 1,
  sealRankDiv: 4,
  /** Récompense en mana : `pullCost × rang visé / manaRankDiv` (cf. `ascensionMana`). */
  manaRankDiv: 10,
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
    seals: ASCENSION.sealBase + Math.floor(targetRank / ASCENSION.sealRankDiv),
  };
}

/** 💠 La récompense d'une ascension : des pierres de mana, selon le rang VISÉ —
 *  `pullCost × rang / 10`, soit 11 💠 pour Argent, 55 pour Demi-dieu, 99 pour Tout-puissant.
 *  ⚠️ DÉRIVÉ du prix d'un tirage, jamais écrit : si `pullCost` bouge, la récompense suit.
 *  ⚠️ « QUELQUES » pierres, et c'est borné par construction : chaque champion ne franchit
 *  chaque rang qu'UNE fois, donc toute sa carrière rapporte `pullCost × 45 / 10` ≈ 4,5
 *  tirages. Le vrai frein reste les sceaux ; la récompense ne peut pas devenir un robinet. */
export function ascensionMana(targetRank: number): number {
  const r = Math.max(0, Math.min(CHARACTER_RANKS.length - 1, Math.floor(targetRank)));
  return Math.round((GACHA.pullCost * r) / ASCENSION.manaRankDiv);
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
  seals: 'Il manque des sceaux d’objet de ce rang — prends des repaires sur la carte.',
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

/** 🗡️ Les sceaux d'OBJET d'un REPAIRE pris sur la carte : 1, au rang du repaire PLAFONNÉ à
 *  celui du joueur — le sport reste le plafond.
 *  ⚠️ **SUR LA CARTE, PLUS SUR LES BOSS DE PALIER (v0.1047, règle de l'utilisateur : « aucune
 *  ressource de champion à farmer dans la partie héros »).** Les deux familles de sceaux
 *  viennent désormais de la carte : 🔱 le gardien d'une faille, ⚜️ un repaire. Le héros, lui,
 *  peut profiter de tout ; ce sont les champions qui ne se nourrissent que de la carte. */
export function lairGearSeals(lairLevel: number, playerLevel: number): SealDrop {
  const rank = Math.min(
    characterRank(Math.max(1, lairLevel)).rankIndex,
    characterRank(Math.max(1, playerLevel)).rankIndex,
  );
  return { kind: 'gear', rank, n: 1 };
}

/** 🔱 Ce que la barre de ressources dit d'une famille de sceaux : le TOTAL (la puce) et le
 *  détail PAR RANG (l'infobulle), du plus bas au plus haut. ⚠️ Un sceau ne sert qu'à SON rang :
 *  un total seul ne dirait pas si l'on peut monter tel champion, d'où le détail. */
export function sealsSummary(seals: Seals, kind: SealKind): { total: number; detail: string } {
  const parts: string[] = [];
  let total = 0;
  for (let r = 0; r < CHARACTER_RANKS.length; r++) {
    const n = sealCount(seals, kind, r);
    if (n <= 0) continue;
    total += n;
    parts.push(`${CHARACTER_RANKS[r]!.name} ${n}`);
  }
  return { total, detail: parts.join(' · ') };
}

/** ⬆️ Combien d'ascensions sont PAYABLES tout de suite (champions + pièces) — ce qui allume
 *  la tuile du Panthéon sur la Base. ⚠️ Lu par les MÊMES refus que les boutons
 *  (`ascensionBlocker`, `advGearAscensionBlocker`) : la pastille ne peut pas promettre une
 *  ascension que la Guilde refuserait. ⚠️ Le coût s'additionne : deux ascensions payables
 *  séparément ne le sont pas forcément ensemble — la pastille dit « il y a à faire », pas
 *  « tout est payable ». */
export function readyAscensions(
  advs: Adventurer[],
  stock: AdvGear[],
  ctx: { pantheonLevel: number; seals: Seals; gold: number },
): number {
  let n = 0;
  for (const a of advs) if (ascensionBlocker(a, ctx) == null) n++;
  for (const g of stock)
    if (
      advGearAscensionBlocker(g, {
        rankCap: advGearRankCap(g, advs, stock),
        seals: ctx.seals,
        gold: ctx.gold,
      }) == null
    )
      n++;
  return n;
}
