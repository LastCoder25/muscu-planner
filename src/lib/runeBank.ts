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

import { mulberry32, seedOf } from './combat';
import {
  RUNE_TIERS,
  SKILLS,
  SKILL_MAX_LEVEL,
  RUNE_PLACE,
  pickTier,
  placeRuneChance,
  RISE_BLOCK_LABEL,
  riseBlocker,
  riseOf,
  riseSkill,
  type RiseBlock,
  sameSkill,
  skillsOfTier,
  withRise,
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
  /** 🌈 Crans d'élévation (cf. `SkillRef`), absent = 0. */
  up?: number;
}

/**
 * Ouvre la `n`-ième rune du joueur `owner` : couleur dans `RUNE_ODDS`, puis une compétence de
 * cette couleur, uniformément. ⚠️ DÉTERMINISTE (graine = joueur + numéro d'ouverture) : un
 * rechargement pendant l'animation ne fait pas retirer une autre compétence.
 */
export function openRune(owner: string, n: number, grade: boolean | RuneGrade = false): StockSkill {
  const rng = mulberry32(seedOf(`rune:${owner}:${n}`));
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
    skills.push(
      withRise(
        {
          uid: s.uid,
          id: s.id,
          level: Math.max(1, Math.min(SKILL_MAX_LEVEL, int(s.level) || 1)),
        },
        s.up,
      ),
    );
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

export type FuseBlock = 'few' | 'missing' | 'different' | 'over';

export const FUSE_BLOCK_LABEL: Record<FuseBlock, string> = {
  few: 'choisis au moins deux exemplaires',
  missing: 'compétence introuvable',
  different: 'seuls les exemplaires d’une même compétence, de la même couleur, fusionnent',
  over: `la fusion dépasserait le niveau ${SKILL_MAX_LEVEL}`,
};

/** ⚠️ SOURCE UNIQUE écran + store : ce qui empêche de fusionner CES exemplaires (deux ou plus,
 *  choisis par le joueur). Les niveaux s'ADDITIONNENT : une fusion qui dépasserait 5 est
 *  refusée, jamais écrêtée en silence. */
export function fuseBlocker(bank: RuneBank, uids: readonly string[]): FuseBlock | null {
  const picked = new Set(uids);
  if (picked.size < 2) return 'few';
  const copies = bank.skills.filter((s) => picked.has(s.uid));
  if (copies.length !== picked.size) return 'missing';
  if (copies.some((s) => !sameSkill(s, copies[0]!))) return 'different';
  return copies.reduce((t, s) => t + s.level, 0) > SKILL_MAX_LEVEL ? 'over' : null;
}

/** Fusionne les exemplaires choisis en UN : le plus haut garde son `uid` et sa place, les
 *  autres disparaissent. `null` si refusé. */
export function fuseSkills(
  bank: RuneBank,
  uids: readonly string[],
): { bank: RuneBank; group: FuseGroup } | null {
  if (fuseBlocker(bank, uids)) return null;
  const picked = new Set(uids);
  const copies = bank.skills.filter((s) => picked.has(s.uid));
  const keep = copies.reduce((a, b) => (b.level > a.level ? b : a));
  const total = copies.reduce((t, s) => t + s.level, 0);
  return {
    bank: {
      ...bank,
      skills: bank.skills
        .filter((s) => s.uid === keep.uid || !picked.has(s.uid))
        .map((s) => (s.uid === keep.uid ? { ...s, level: total } : { ...s })),
    },
    group: {
      id: keep.id,
      up: riseOf(keep),
      before: copies.map((s) => s.level).sort((a, b) => b - a),
      after: [total],
    },
  };
}

/** Combien d'exemplaires de chaque niveau on AJOUTE à celui qu'on a choisi. */
export type FuseTake = Record<number, number>;

/** Les AUTRES exemplaires de la compétence de `uid`, par niveau (le plus haut d'abord). */
function othersByLevel(
  bank: RuneBank,
  uid: string,
): { me: StockSkill; uids: Map<number, string[]> } | null {
  const me = bank.skills.find((s) => s.uid === uid);
  if (!me) return null;
  const uids = new Map<number, string[]>();
  for (const s of bank.skills) {
    if (!sameSkill(s, me) || s.uid === uid) continue;
    const l = uids.get(s.level);
    if (l) l.push(s.uid);
    else uids.set(s.level, [s.uid]);
  }
  return { me, uids: new Map([...uids].sort((a, b) => b[0] - a[0])) };
}

/**
 * 🔗 La fusion choisie « tout ou partie » : à l'exemplaire `uid` on ajoute `take[niveau]`
 * exemplaires de chaque niveau (bornés à ce qu'il y a au stock). Rend les lignes à afficher
 * (une par niveau), les exemplaires retenus (`uid` en tête) et le niveau obtenu.
 */
export function fusePick(
  bank: RuneBank,
  uid: string,
  take: FuseTake,
): { rows: { level: number; count: number; take: number }[]; uids: string[]; total: number } {
  const o = othersByLevel(bank, uid);
  if (!o) return { rows: [], uids: [], total: 0 };
  const rows = [...o.uids].map(([level, list]) => ({
    level,
    count: list.length,
    take: Math.max(0, Math.min(list.length, take[level] ?? 0)),
  }));
  return {
    rows,
    uids: [uid, ...rows.flatMap((r) => o.uids.get(r.level)!.slice(0, r.take))],
    total: o.me.level + rows.reduce((t, r) => t + r.take * r.level, 0),
  };
}

/**
 * 🎯 « Jusqu'au plus haut » : ce qu'il faut ajouter à `uid` pour le PLUS HAUT niveau
 * atteignable (5 au plus), avec le moins d'exemplaires possible à niveau égal. Les niveaux
 * valent 1 à 5 : on essaie toutes les combinaisons de nombres par niveau (quelques centaines).
 */
export function bestFusePick(bank: RuneBank, uid: string): { take: FuseTake; total: number } {
  const o = othersByLevel(bank, uid);
  if (!o) return { take: {}, total: 0 };
  const levels = [...o.uids.keys()];
  let best = { total: o.me.level, n: 0, take: {} as FuseTake };
  const cur: FuseTake = {};
  const walk = (i: number, total: number, n: number) => {
    if (i === levels.length) {
      if (total > best.total || (total === best.total && n < best.n))
        best = { total, n, take: { ...cur } };
      return;
    }
    const l = levels[i]!;
    const max = Math.min(o.uids.get(l)!.length, Math.floor((SKILL_MAX_LEVEL - total) / l));
    for (let k = max; k >= 0; k--) {
      cur[l] = k;
      walk(i + 1, total + k * l, n + k);
    }
  };
  walk(0, o.me.level, 0);
  return { take: best.take, total: best.total };
}

/** Refus de « Tout fusionner » (aucune compétence n'a deux exemplaires qui tiennent ensemble). */
export const FUSE_ALL_NONE = 'rien à fusionner';

/** Les exemplaires identiques (même compétence, même couleur, même niveau) en une pile « ×N »,
 *  dans l'ordre du stock ; le premier exemplaire la représente. */
export function stackSkills(skills: StockSkill[]): (StockSkill & { count: number })[] {
  const out = new Map<string, StockSkill & { count: number }>();
  for (const s of skills) {
    const k = `${s.id}:${riseOf(s)}:${s.level}`;
    const cur = out.get(k);
    if (cur) cur.count++;
    else out.set(k, { ...s, count: 1 });
  }
  return [...out.values()];
}

/** « 7 × Nv 1 → Nv 5 · Nv 2 », « Nv 3 + 2 × Nv 1 → Nv 5 ». */
export function fuseGroupText(g: FuseGroup): string {
  const n = new Map<number, number>();
  for (const l of g.before) n.set(l, (n.get(l) ?? 0) + 1);
  const parts = [...n].map(([l, k]) => (k > 1 ? `${k} × Nv ${l}` : `Nv ${l}`));
  return `${parts.join(' + ')} → ${g.after.map((l) => `Nv ${l}`).join(' · ')}`;
}

/** Ce qu'une fusion groupée fait à une compétence : les niveaux d'avant, ceux d'après. */
export interface FuseGroup {
  id: SkillId;
  /** 🌈 Élévation des exemplaires fusionnés (tous de la même couleur). */
  up: number;
  before: number[];
  after: number[];
}

/** Ce que « Tout fusionner » vise : tout (`null`), une compétence dans TOUTES ses couleurs
 *  (son id), ou une compétence DANS UNE couleur (`{ id, up }`). */
export type FuseOnly = SkillId | { id: SkillId; up?: number } | null;

/**
 * 🔗 FUSIONNE D'UN GESTE tous les exemplaires d'une compétence (`only`), ou de toutes : les
 * niveaux sont rangés du plus haut au plus bas et versés dans le premier exemplaire où ils
 * tiennent (5 au plus, jamais écrêtés) — de quoi préparer des Nv 5 pour le prochain champion.
 * Chaque exemplaire gardé garde son `uid` et sa place. Rend le stock et ce qui a changé
 * (`groups` vide = rien à fusionner).
 */
export function fuseAllSkills(
  bank: RuneBank,
  only: FuseOnly = null,
): { bank: RuneBank; groups: FuseGroup[] } {
  // 🌈 Une compétence et une COULEUR par groupe : un bleu ne se verse pas dans un vert.
  const byId = new Map<string, StockSkill[]>();
  for (const s of bank.skills) {
    if (only && (typeof only === 'string' ? s.id !== only : !sameSkill(s, only))) continue;
    const key = `${s.id}:${riseOf(s)}`;
    const copies = byId.get(key);
    if (copies) copies.push(s);
    else byId.set(key, [s]);
  }
  const level = new Map<string, number>();
  const gone = new Set<string>();
  const groups: FuseGroup[] = [];
  for (const copies of byId.values()) {
    const { id } = copies[0]!;
    if (copies.length < 2) continue;
    const bins: { uid: string; level: number }[] = [];
    for (const s of [...copies].sort((a, b) => b.level - a.level)) {
      const bin = bins.find((b) => b.level + s.level <= SKILL_MAX_LEVEL);
      if (bin) {
        bin.level += s.level;
        gone.add(s.uid);
      } else bins.push({ uid: s.uid, level: s.level });
    }
    if (bins.length === copies.length) continue;
    for (const b of bins) level.set(b.uid, b.level);
    groups.push({
      id,
      up: riseOf(copies[0]!),
      before: copies.map((s) => s.level).sort((a, b) => b - a),
      after: bins.map((b) => b.level).sort((a, b) => b - a),
    });
  }
  if (!groups.length) return { bank, groups };
  return {
    bank: {
      ...bank,
      skills: bank.skills
        .filter((s) => !gone.has(s.uid))
        .map((s) => ({ ...s, level: level.get(s.uid) ?? s.level })),
    },
    groups,
  };
}

// ── 🎁 DONNER À UN CHAMPION ─────────────────────────────────────────────────────────────

// ── 🌈 ÉLEVER AU STOCK ──────────────────────────────────────────────────────────────────

export type StockRiseBlock = RiseBlock | 'missing';

export const STOCK_RISE_BLOCK_LABEL: Record<StockRiseBlock, string> = {
  ...RISE_BLOCK_LABEL,
  missing: 'introuvable',
};

/** ⚠️ SOURCE UNIQUE écran + store : ce qui empêche d'élever l'exemplaire `uid` du stock. */
export function stockRiseBlocker(bank: RuneBank, uid: string): StockRiseBlock | null {
  const s = bank.skills.find((x) => x.uid === uid);
  return s ? riseBlocker(s) : 'missing';
}

/** 🌈 Élève l'exemplaire `uid` : il garde son `uid` et sa place, passe à la couleur au-dessus,
 *  niveau 1. `null` si refusé. */
export function riseStockSkill(
  bank: RuneBank,
  uid: string,
): { bank: RuneBank; skill: StockSkill } | null {
  const s = bank.skills.find((x) => x.uid === uid);
  const next = s && riseSkill(s);
  if (!next) return null;
  return {
    bank: { ...bank, skills: bank.skills.map((x) => (x.uid === uid ? next : x)) },
    skill: next,
  };
}

// ── 🎁 DONNER À UN CHAMPION (suite) ─────────────────────────────────────────────────────

/** Ce que la compétence ferait à ce champion. `swap` : il la porte déjà, dans une AUTRE
 *  couleur — elle prend sa place (la sienne est perdue avec ses niveaux). */
export type GiveKind = 'new' | 'stack' | 'replace' | 'swap';

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
export function giveKind(c: ChampionSlots, sk: Pick<ChampSkill, 'id' | 'up'>): GiveKind {
  const cur = c.skills.find((s) => s.id === sk.id);
  if (cur) return sameSkill(cur, sk) ? 'stack' : 'swap';
  return c.skills.length < c.slots ? 'new' : 'replace';
}

/** L'exemplaire tel qu'un champion le porte (sans `uid`, élévation gardée). */
const carried = (sk: StockSkill): ChampSkill => withRise({ id: sk.id, level: sk.level }, sk.up);

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
  const kind = giveKind(c, sk);
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
  const kind = giveKind(c, sk);
  const cur = c.skills.map((s) => ({ ...s }));
  const skills =
    kind === 'stack'
      ? cur.map((s) => (s.id === sk.id ? { ...s, level: s.level + sk.level } : s))
      : kind === 'swap'
        ? cur.map((s) => (s.id === sk.id ? carried(sk) : s))
        : kind === 'new'
          ? [...cur, carried(sk)]
          : cur.map((s, i) => (i === replaceIndex ? carried(sk) : s));
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
