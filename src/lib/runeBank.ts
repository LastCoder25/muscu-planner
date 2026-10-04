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
  RUNE_PLACE,
  pickTier,
  placeRuneChance,
  skillsOfTier,
  type ChampSkill,
  type PlaceRuneInput,
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

/**
 * 🪬 LES RUNES « À PARTIR DU BLEU » (l'autel des runes de l'île 5, roadmap de l'archipel,
 * étape 0) : la même table SANS le vert, renormalisée — bleu 73 %, violet 23 %, doré 3 %.
 * Dérivée de `RUNE_ODDS` : si la table bouge, celle-ci suit.
 */
export const BLESSED_ODDS: Record<RuneTier, number> = (() => {
  const rest = 1 - RUNE_ODDS.green;
  return {
    green: 0,
    blue: RUNE_ODDS.blue / rest,
    violet: RUNE_ODDS.violet / rest,
    gold: RUNE_ODDS.gold / rest,
  };
})();

/**
 * ⚗️ LES RUNES « À PARTIR DU VIOLET » (le laboratoire de l'île 5, 2026-10-04, décision de
 * l'utilisateur : « comme l'autel de rune mais sans la rareté de base de l'autel ») : la même
 * table SANS le vert NI le bleu, renormalisée — violet 87,5 %, doré 12,5 %. Dérivée de `RUNE_ODDS`
 * comme `BLESSED_ODDS` : si la table bouge, celle-ci suit.
 */
export const EXALTED_ODDS: Record<RuneTier, number> = (() => {
  const rest = RUNE_ODDS.violet + RUNE_ODDS.gold;
  return {
    green: 0,
    blue: 0,
    violet: RUNE_ODDS.violet / rest,
    gold: RUNE_ODDS.gold / rest,
  };
})();

/** La qualité d'une rune avant ouverture : ordinaire, « à partir du bleu » (autel), « à partir
 *  du violet » (laboratoire). */
export type RuneGrade = 'base' | 'blessed' | 'exalted';

const GRADE_ODDS: Record<RuneGrade, Record<RuneTier, number>> = {
  base: RUNE_ODDS,
  blessed: BLESSED_ODDS,
  exalted: EXALTED_ODDS,
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
export function openRune(owner: string, n: number, grade: boolean | RuneGrade = false): StockSkill {
  const rng = mulberry32(hashStr(`rune:${owner}:${n}`));
  // `true` = l'ancien drapeau « bénie » (autel), gardé pour les appels d'avant.
  const g: RuneGrade = grade === true ? 'blessed' : grade === false ? 'base' : grade;
  const tier = pickTier(rng, GRADE_ODDS[g]);
  const pool = skillsOfTier(tier);
  const id = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
  return { uid: `sk${n}`, id, level: 1 };
}

// ── 💾 LE STOCK ─────────────────────────────────────────────────────────────────────────

export interface RuneBank {
  /** Runes multicolores non ouvertes. */
  runes: number;
  /** 🪬 Parmi `runes`, celles « à partir du bleu » (l'autel des runes) : jamais vertes.
   *  Ouvertes EN PREMIER (elles valent plus). Toujours ≤ `runes`. */
  blessed: number;
  /** ⚗️ Parmi `runes`, celles « à partir du violet » (le laboratoire) : jamais vertes ni
   *  bleues. Ouvertes AVANT les bénies. `blessed + exalted` ≤ `runes`. */
  exalted: number;
  /** Compétences ouvertes, chacune à part. */
  skills: StockSkill[];
  /** Nombre de runes déjà ouvertes : graine du tirage et source des `uid`. */
  opened: number;
  /** Version de la bascule versée (`RUNE_BANK_VERSION`) : on ne rembourse qu'une fois. */
  comp: number;
}

/** Version courante du modèle : 2 = runes multicolores (1 = runes colorées, 0 = rien). */
export const RUNE_BANK_VERSION = 2;

export const emptyBank = (): RuneBank => ({
  runes: 0,
  blessed: 0,
  exalted: 0,
  skills: [],
  opened: 0,
  comp: RUNE_BANK_VERSION,
});

/** Ajoute `n` runes multicolores (rend un NOUVEL état), dont `blessed` « à partir du bleu »
 *  et `exalted` « à partir du violet » (toutes comptées dans les `n`). */
export function addRuneCount(bank: RuneBank, n: number, blessed = 0, exalted = 0): RuneBank {
  const k = Math.max(0, Math.floor(n));
  if (!k) return bank;
  const e = Math.min(k, Math.max(0, Math.floor(exalted)));
  const b = Math.min(k - e, Math.max(0, Math.floor(blessed)));
  return {
    ...bank,
    runes: bank.runes + k,
    blessed: (bank.blessed ?? 0) + b,
    exalted: (bank.exalted ?? 0) + e,
  };
}

/** Combien de runes porte un butin. ⚠️ Les rapports écrits AVANT la bascule portent un
 *  TABLEAU de couleurs : chacune compte pour une rune multicolore. */
export function runeCount(x: unknown): number {
  if (Array.isArray(x)) return x.length;
  const n = Math.floor(Number(x));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

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
  const runes = int(r.runes);
  const exalted = Math.min(runes, int(r.exalted));
  return {
    runes,
    blessed: Math.min(runes - exalted, int(r.blessed)),
    exalted,
    skills,
    opened: int(r.opened),
    comp: int(r.comp),
  };
}

// ── 🔓 OUVRIR ───────────────────────────────────────────────────────────────────────────

/** Taille d'un lot, et ce qu'il coûte : 9 runes pour 10 compétences. */
export const RUNE_LOT = { size: 10, cost: 9 } as const;

export type OpenBlock = 'none' | 'lot';

export const OPEN_BLOCK_LABEL: Record<OpenBlock, string> = {
  none: 'pas assez de runes',
  lot: 'on ouvre une rune, ou un lot de dix',
};

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
  // ⚗️🪬 Les runes du laboratoire s'ouvrent d'abord, puis celles de l'autel : la rune gratuite
  // d'un lot reste ordinaire.
  const heldE = Math.min(bank.exalted ?? 0, bank.runes);
  const held = Math.min(bank.blessed ?? 0, bank.runes - heldE);
  const usedE = Math.min(heldE, cost);
  const used = Math.min(held, cost - usedE);
  const opened = Array.from({ length: count }, (_, i) =>
    openRune(
      owner,
      bank.opened + i + 1,
      i < usedE ? 'exalted' : i < usedE + used ? 'blessed' : 'base',
    ),
  );
  return {
    bank: {
      ...bank,
      runes: bank.runes - cost,
      blessed: held - used,
      exalted: heldE - usedE,
      skills: [...bank.skills, ...opened],
      opened: bank.opened + count,
    },
    opened,
  };
}

// ── 🔗 FUSIONNER ────────────────────────────────────────────────────────────────────────

export type FuseBlock = 'missing' | 'same' | 'different' | 'over';

export const FUSE_BLOCK_LABEL: Record<FuseBlock, string> = {
  missing: 'compétence introuvable',
  same: 'choisis un autre exemplaire',
  different: 'seuls deux exemplaires de la même compétence fusionnent',
  over: `la fusion dépasserait le niveau ${SKILL_MAX_LEVEL}`,
};

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

export type GiveBlock = 'missing' | 'over' | 'full';

export const GIVE_BLOCK_LABEL: Record<GiveBlock, string> = {
  missing: 'introuvable',
  over: `dépasserait le niveau ${SKILL_MAX_LEVEL}`,
  full: 'choisis la compétence à remplacer',
};

export interface ChampionSlots {
  skills: readonly ChampSkill[];
  /** Emplacements du champion (A 2 · S 3 · X 4) ; 0 hors champion. */
  slots: number;
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

/** Un lieu RÉUSSI : 0 s'il ne lâche rien (la chance `placeRuneChance`, inchangée), sinon
 *  `placeRuneCount`. Une faille refermée mûre au-dessus de ton rang en rend 3. */
export function rollPlaceRunes(rng: () => number, p: PlaceRuneInput): number {
  if (rng() >= placeRuneChance(p)) return 0;
  return placeRuneCount({
    placeRankIndex: p.placeRankIndex,
    playerRankIndex: p.playerRankIndex,
    riftMature: p.place === 'rift' && (p.maturity ?? 0) >= RUNE_PLACE.riftMatureAt,
  });
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

/** Ce que la bascule lit d'un champion : ses compétences et, pour un compte qui n'avait
 *  jamais reçu la compensation des runes, sa lettre, ses rangs ouverts et ses crans d'Éveil. */
export interface LegacyChampion {
  skills: readonly ChampSkill[];
  grade: 'A' | 'S' | 'X' | null;
  ascended: number;
  awaken: number;
}

/**
 * 🔁 LA BASCULE, une fois : lit l'ancien état BRUT (`{ stock, pending, comp }`) et rend la
 * nouvelle banque et ce qui a été remboursé. `null` : déjà basculé.
 *
 * - toutes les compétences des champions sont RETIRÉES (l'appelant les efface) ; chaque niveau
 *   rend `REFUND_PER_LEVEL` de sa couleur ;
 * - les runes colorées au stock et la rune `pending` suivent le même barème ;
 * - ⚠️ un compte qui n'avait jamais reçu la compensation (`comp` 0) la reçoit ici, aux
 *   QUANTITÉS du nouveau modèle (`ascensionRuneCount` par rang ouvert, `AWAKEN_RUNE_COUNT`
 *   par cran) — sinon ses champions ascensionnés n'auraient jamais rien reçu.
 */
export function migrateLegacyRunes(
  raw: unknown,
  champs: readonly LegacyChampion[],
): { bank: RuneBank; refunded: number } | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const comp = Math.floor(Number(r.comp)) || 0;
  if (comp >= RUNE_BANK_VERSION) return null;
  const st = (r.stock && typeof r.stock === 'object' ? r.stock : {}) as Record<string, unknown>;
  const stock: Partial<Record<RuneTier, number>> = {};
  for (const t of RUNE_TIERS) stock[t] = Math.max(0, Math.floor(Number(st[t]) || 0));
  const p = r.pending as Record<string, unknown> | null | undefined;
  const pendingTier =
    p && typeof p.tier === 'string' && (RUNE_TIERS as readonly string[]).includes(p.tier)
      ? (p.tier as RuneTier)
      : null;
  let refunded = legacyRefund(
    champs.map((c) => c.skills),
    stock,
    pendingTier,
  );
  if (comp < 1)
    for (const c of champs) {
      if (!c.grade) continue;
      for (let k = 1; k <= c.ascended; k++) refunded += ascensionRuneCount(k);
      refunded += Math.max(0, c.awaken) * AWAKEN_RUNE_COUNT[c.grade];
    }
  const prev = normalizeRuneBank(raw);
  return {
    bank: { ...prev, runes: prev.runes + refunded, comp: RUNE_BANK_VERSION },
    refunded,
  };
}
