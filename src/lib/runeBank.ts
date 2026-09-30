/**
 * 🪬 RUNES MULTICOLORES — ÉTAPE 1 : LA LOGIQUE (2026-09-30).
 *
 * Spec : `docs/superpowers/specs/2026-09-30-runes-multicolores.md`, décisions de l'utilisateur.
 *
 * ⚠️ **PAS ENCORE BRANCHÉ** : le jeu tourne toujours sur les runes colorées de `skillRunes.ts`
 * (stock par couleur, tirage chez le champion, `pending`). Ce module pose le modèle suivant,
 * testé à part ; les sources, la migration et les écrans le brancheront ensuite.
 *
 * Le modèle : on gagne une RUNE MULTICOLORE, toujours la même. On l'OUVRE : elle révèle une
 * compétence tirée dans une table UNIQUE. La compétence va au STOCK DE COMPÉTENCES, où on la
 * FUSIONNE (niveaux additionnés, 5 au plus) ou la DONNE à un champion. Une compétence donnée ne
 * revient jamais au stock. La qualité ne dépend plus de la source : seule la QUANTITÉ change.
 */

import { mulberry32 } from './combat';
import {
  RUNE_TIERS,
  SKILLS,
  SKILL_MAX_LEVEL,
  canUseRune,
  pickTier,
  skillsOfTier,
  type ChampSkill,
  type RuneTier,
  type SkillId,
} from './skillRunes';

// ── 🎲 LA TABLE UNIQUE ──────────────────────────────────────────────────────────────────

/** La couleur d'une rune ouverte : celle d'un lieu À TON RANG (l'ancienne table « de base »),
 *  désormais pour TOUTES les runes. Somme 1 (testé). */
export const RUNE_ODDS: Record<RuneTier, number> = {
  green: 0.7,
  blue: 0.22,
  violet: 0.07,
  gold: 0.01,
};

/** Une compétence au stock : un EXEMPLAIRE, avec son niveau. Deux exemplaires de la même
 *  compétence restent séparés tant que le joueur ne les fusionne pas. */
export interface StockSkill {
  uid: string;
  id: SkillId;
  level: number;
}

/** Graine stable d'une chaîne (FNV-1a). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0 || 1;
}

/**
 * Ouvre la `n`-ième rune du joueur `owner` : couleur dans `RUNE_ODDS`, puis une compétence de
 * cette couleur, uniformément. ⚠️ DÉTERMINISTE (graine = joueur + numéro d'ouverture) : un
 * rechargement pendant l'animation ne fait pas retirer une autre compétence.
 */
export function openRune(owner: string, n: number): StockSkill {
  const rng = mulberry32(hashStr(`rune:${owner}:${n}`));
  const tier = pickTier(rng, RUNE_ODDS);
  const pool = skillsOfTier(tier);
  const id = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
  return { uid: `sk${n}`, id, level: 1 };
}

// ── 💾 LE STOCK ─────────────────────────────────────────────────────────────────────────

export interface RuneBank {
  /** Runes multicolores non ouvertes. */
  runes: number;
  /** Compétences ouvertes, chacune à part. */
  skills: StockSkill[];
  /** Nombre de runes déjà ouvertes : graine du tirage et source des `uid`. */
  opened: number;
}

export const emptyBank = (): RuneBank => ({ runes: 0, skills: [], opened: 0 });

const isSkill = (s: unknown): s is SkillId => typeof s === 'string' && s in SKILLS;

/** Relecture DÉFENSIVE d'un JSONB : ce qui n'a pas la bonne forme est écarté. */
export function normalizeRuneBank(raw: unknown): RuneBank {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const int = (v: unknown) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const seen = new Set<string>();
  const skills: StockSkill[] = [];
  for (const s of Array.isArray(r.skills) ? (r.skills as Record<string, unknown>[]) : []) {
    if (!s || typeof s.uid !== 'string' || seen.has(s.uid) || !isSkill(s.id)) continue;
    seen.add(s.uid);
    skills.push({
      uid: s.uid,
      id: s.id,
      level: Math.max(1, Math.min(SKILL_MAX_LEVEL, int(s.level) || 1)),
    });
  }
  return { runes: int(r.runes), skills, opened: int(r.opened) };
}

// ── 🔓 OUVRIR ───────────────────────────────────────────────────────────────────────────

/** Taille d'un lot, et ce qu'il coûte : 9 runes pour 10 compétences. */
export const RUNE_LOT = { size: 10, cost: 9 } as const;

export type OpenBlock = 'none' | 'lot';

/** ⚠️ SOURCE UNIQUE écran + store : ce qui empêche d'ouvrir `count` compétences
 *  (1, ou `RUNE_LOT.size`). */
export function openBlocker(bank: RuneBank, count: number): OpenBlock | null {
  const cost = count === RUNE_LOT.size ? RUNE_LOT.cost : count;
  if (count !== 1 && count !== RUNE_LOT.size) return 'lot';
  return bank.runes >= cost ? null : 'none';
}

/** Ouvre `count` compétences (1 ou un lot) : rend le nouveau stock et ce qui est sorti, dans
 *  l'ordre du tirage. `null` si c'est refusé. */
export function openRunes(
  bank: RuneBank,
  owner: string,
  count: number,
): { bank: RuneBank; opened: StockSkill[] } | null {
  if (openBlocker(bank, count)) return null;
  const cost = count === RUNE_LOT.size ? RUNE_LOT.cost : count;
  const opened = Array.from({ length: count }, (_, i) => openRune(owner, bank.opened + i + 1));
  return {
    bank: {
      runes: bank.runes - cost,
      skills: [...bank.skills, ...opened],
      opened: bank.opened + count,
    },
    opened,
  };
}

// ── 🔗 FUSIONNER ────────────────────────────────────────────────────────────────────────

export type FuseBlock = 'missing' | 'same' | 'different' | 'over';

/** ⚠️ SOURCE UNIQUE écran + store : ce qui empêche de fusionner deux exemplaires. Les niveaux
 *  s'ADDITIONNENT : une fusion qui dépasserait 5 est refusée, jamais écrêtée en silence. */
export function fuseBlocker(bank: RuneBank, uidA: string, uidB: string): FuseBlock | null {
  if (uidA === uidB) return 'same';
  const a = bank.skills.find((s) => s.uid === uidA);
  const b = bank.skills.find((s) => s.uid === uidB);
  if (!a || !b) return 'missing';
  if (a.id !== b.id) return 'different';
  return a.level + b.level > SKILL_MAX_LEVEL ? 'over' : null;
}

/** Fusionne `uidB` dans `uidA` (A garde sa place). `null` si refusé. */
export function fuseSkills(bank: RuneBank, uidA: string, uidB: string): RuneBank | null {
  if (fuseBlocker(bank, uidA, uidB)) return null;
  const b = bank.skills.find((s) => s.uid === uidB)!;
  return {
    ...bank,
    skills: bank.skills
      .filter((s) => s.uid !== uidB)
      .map((s) => (s.uid === uidA ? { ...s, level: s.level + b.level } : { ...s })),
  };
}

// ── 🎁 DONNER À UN CHAMPION ─────────────────────────────────────────────────────────────

/** Ce que la compétence ferait à ce champion. */
export type GiveKind = 'new' | 'stack' | 'replace';

export type GiveBlock = 'missing' | 'rank' | 'over' | 'full';

export interface ChampionSlots {
  skills: readonly ChampSkill[];
  /** Emplacements du champion (A 2 · S 3 · X 4) ; 0 hors champion. */
  slots: number;
  /** Rang de prestige du champion (index de `CHARACTER_RANKS`). */
  rankIndex: number;
}

/** Ce que donner cet exemplaire ferait, sans rien décider. `full` : il faudra choisir quoi
 *  remplacer. */
export function giveKind(c: ChampionSlots, id: SkillId): GiveKind {
  if (c.skills.some((s) => s.id === id)) return 'stack';
  return c.skills.length < c.slots ? 'new' : 'replace';
}

/**
 * ⚠️ SOURCE UNIQUE écran + store : ce qui empêche de donner `uid` à ce champion.
 * `replaceIndex` n'est requis que pour un remplacement : sans lui, un champion plein répond
 * `full` (l'écran demande alors quoi remplacer).
 */
export function giveBlocker(
  bank: RuneBank,
  uid: string,
  c: ChampionSlots,
  replaceIndex: number | null = null,
): GiveBlock | null {
  const sk = bank.skills.find((s) => s.uid === uid);
  if (!sk || c.slots <= 0) return 'missing';
  if (!canUseRune(SKILLS[sk.id].tier, c.rankIndex)) return 'rank';
  const kind = giveKind(c, sk.id);
  if (kind === 'stack') {
    const cur = c.skills.find((s) => s.id === sk.id)!;
    return cur.level + sk.level > SKILL_MAX_LEVEL ? 'over' : null;
  }
  if (
    kind === 'replace' &&
    (replaceIndex === null || replaceIndex < 0 || replaceIndex >= c.skills.length)
  )
    return 'full';
  return null;
}

/** Donne `uid` au champion : rend le stock sans lui et les compétences du champion. La
 *  compétence remplacée (s'il y en a une) est PERDUE avec ses niveaux. `null` si refusé. */
export function giveSkill(
  bank: RuneBank,
  uid: string,
  c: ChampionSlots,
  replaceIndex: number | null = null,
): { bank: RuneBank; skills: ChampSkill[] } | null {
  if (giveBlocker(bank, uid, c, replaceIndex)) return null;
  const sk = bank.skills.find((s) => s.uid === uid)!;
  const kind = giveKind(c, sk.id);
  const cur = c.skills.map((s) => ({ ...s }));
  const skills =
    kind === 'stack'
      ? cur.map((s) => (s.id === sk.id ? { ...s, level: s.level + sk.level } : s))
      : kind === 'new'
        ? [...cur, { id: sk.id, level: sk.level }]
        : cur.map((s, i) => (i === replaceIndex ? { id: sk.id, level: sk.level } : s));
  return { bank: { ...bank, skills: bank.skills.filter((s) => s.uid !== uid) }, skills };
}

// ── 📦 COMBIEN DE RUNES CHAQUE SOURCE DONNE ─────────────────────────────────────────────

/** Un lieu réussi qui lâche des runes : 1 sous ton rang ou à ton rang, 2 au-dessus, 3 pour une
 *  faille au-dessus refermée mûre. La CHANCE de lâcher reste `placeRuneChance`. */
export function placeRuneCount(p: {
  placeRankIndex: number;
  playerRankIndex: number;
  riftMature?: boolean;
}): number {
  if (p.placeRankIndex <= p.playerRankIndex) return 1;
  return p.riftMature ? 3 : 2;
}

/** Une ascension vers le rang `rankIndex` (1 = Argent) : 1 rune jusqu'à l'Or noir, 2 de
 *  Légendaire à Divin, 3 au-delà. */
export function ascensionRuneCount(rankIndex: number): number {
  return rankIndex >= 7 ? 3 : rankIndex >= 4 ? 2 : 1;
}

/** Un cran d'Éveil : selon la LETTRE du champion. */
export const AWAKEN_RUNE_COUNT: Record<'A' | 'S' | 'X', number> = { A: 1, S: 2, X: 3 };

// ── 🔁 LA MIGRATION (une fois) ──────────────────────────────────────────────────────────

/** Runes multicolores rendues par NIVEAU de compétence retirée, selon sa couleur. Sous la
 *  valeur réelle d'une couleur (une bleue coûte ~4,5 runes, une dorée ~100), mais rare =
 *  mieux remboursé. */
export const REFUND_PER_LEVEL: Record<RuneTier, number> = { green: 1, blue: 2, violet: 3, gold: 5 };

/**
 * Ce que rend l'ancien modèle : chaque NIVEAU des compétences portées par les champions,
 * chaque rune colorée encore au stock (comme un niveau 1 de sa couleur) et la rune `pending`
 * (idem) — au barème `REFUND_PER_LEVEL`.
 */
export function legacyRefund(
  champSkills: readonly (readonly ChampSkill[])[],
  stock: Partial<Record<RuneTier, number>>,
  pendingTier: RuneTier | null,
): number {
  let n = 0;
  for (const list of champSkills)
    for (const s of list) n += s.level * REFUND_PER_LEVEL[SKILLS[s.id].tier];
  for (const t of RUNE_TIERS) n += Math.max(0, Math.floor(stock[t] ?? 0)) * REFUND_PER_LEVEL[t];
  if (pendingTier) n += REFUND_PER_LEVEL[pendingTier];
  return n;
}
