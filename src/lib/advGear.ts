// advGear.ts — ÉQUIPEMENT DES AVENTURIERS (pur/testé). Spec :
// docs/superpowers/specs/2026-09-14-camps-equipement-aventuriers-design.md (étape 1).
//
// ⚠️ Stock SÉPARÉ du sac du héros, pièces PROPRES À CHAQUE CLASSE DE BASE, rareté plafonnée
// par la classe du porteur. Aucune nouvelle stat : on puise dans les EffectType existants.
import {
  effectAsAggregate,
  effectBase,
  emptyEffects,
  itemLevelMult,
  mergeEffects,
  companionDropRank,
  rankRollMult,
  RARITY_RANK,
  rollCompanionTier,
  rollItemLevel,
  scrapValueOf,
  sellValueOf,
  type AggregatedEffects,
  type EffectType,
  type Item,
  type ItemEffect,
  type ItemSlot,
  type Rarity,
} from './items';
import { advRarity, type Adventurer } from './adventurers';

// ⚠️ Pas exportée (`npm run dead`) : aucun importeur hors du module — `Lineage` (le type
// dérivé) est ce que le reste du code consomme (ex. GuildPanel.vue).
const LINEAGES = ['guerrier', 'archer', 'mage', 'homme_armes', 'eclaireur', 'caravanier'] as const;
export type Lineage = (typeof LINEAGES)[number];
export type AdvGearSlot = 'weapon' | 'armor' | 'accessory';
export const ADV_GEAR_SLOTS: AdvGearSlot[] = ['weapon', 'armor', 'accessory'];

export interface AdvGear {
  id: string;
  lineage: Lineage;
  slot: AdvGearSlot;
  name: string;
  emoji: string;
  rarity: Rarity;
  roll: number;
  level: number;
  effect: ItemEffect;
  effect2?: ItemEffect;
  /** Lignées civiles uniquement, sur l'accessoire : trajet raccourci / cargaison (fraction). */
  role?: { kind: 'speed' | 'haul'; value: number };
  locked?: boolean;
}

interface PieceDef {
  name: string;
  emoji: string;
  /** Stats possibles ; la 1ʳᵉ tirée est l'affixe principal, une AUTRE le 2ᵉ (Magique+). */
  pool: EffectType[];
}
export interface LineageGearDef {
  role?: 'speed' | 'haul';
  pieces: Record<AdvGearSlot, PieceDef>;
}

export const LINEAGE_GEAR: Record<Lineage, LineageGearDef> = {
  guerrier: {
    pieces: {
      weapon: { name: 'Épée', emoji: '🗡️', pool: ['damage_pct', 'crit_pct'] },
      armor: { name: 'Cuirasse', emoji: '🥋', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
      accessory: { name: 'Gantelets', emoji: '🧤', pool: ['crit_pct', 'damage_pct'] },
    },
  },
  archer: {
    pieces: {
      weapon: { name: 'Arc', emoji: '🏹', pool: ['damage_pct', 'crit_pct'] },
      armor: { name: 'Cuir', emoji: '🦺', pool: ['max_pv_pct', 'crit_pct'] },
      accessory: { name: 'Carquois', emoji: '🎯', pool: ['crit_pct', 'momentum_pct'] },
    },
  },
  mage: {
    pieces: {
      weapon: { name: 'Bâton', emoji: '🪄', pool: ['damage_pct', 'execute_pct'] },
      armor: { name: 'Robe', emoji: '👘', pool: ['max_pv_pct', 'lifesteal_pct'] },
      accessory: { name: 'Grimoire', emoji: '📖', pool: ['damage_pct', 'lifesteal_pct'] },
    },
  },
  homme_armes: {
    pieces: {
      weapon: { name: 'Masse', emoji: '🔨', pool: ['damage_pct', 'thorns_pct'] },
      armor: { name: 'Plates', emoji: '🛡️', pool: ['dmg_reduction_pct', 'max_pv_pct'] },
      accessory: { name: 'Bouclier', emoji: '🔰', pool: ['dmg_reduction_pct', 'thorns_pct'] },
    },
  },
  eclaireur: {
    role: 'speed',
    pieces: {
      weapon: { name: 'Dague', emoji: '🔪', pool: ['crit_pct', 'damage_pct'] },
      armor: { name: 'Cape', emoji: '🧣', pool: ['max_pv_pct', 'crit_pct'] },
      accessory: { name: 'Longue-vue', emoji: '🔭', pool: ['crit_pct', 'damage_pct'] },
    },
  },
  caravanier: {
    role: 'haul',
    pieces: {
      weapon: { name: 'Bâton de marche', emoji: '🦯', pool: ['max_pv_pct', 'damage_pct'] },
      armor: { name: 'Manteau', emoji: '🧥', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
      accessory: { name: 'Bât', emoji: '🎒', pool: ['dmg_reduction_pct', 'max_pv_pct'] },
    },
  },
};

/** Réglages. ⚠️ `k` est LE levier d'équilibrage de l'équipement (mesuré en Task 4).
 *  Pas exportée (`npm run dead`) : lue uniquement dans ce fichier. */
const ADV_GEAR = {
  /** ⚠️ MESURÉ à 0,15 — l'équipement est un BONUS, pas un péage. À 1, un trio sans pièces
   *  tombait à 22-28 % de ses embuscades calmes dès le niveau 26 face à une route calibrée
   *  sur une escorte équipée : la plupart des joueurs, équipés partiellement pendant des
   *  semaines, auraient payé l'absence d'équipement. Même précédent que les familiers
   *  (un gain modeste). Mesuré sur 2000 graines, niveaux 12/20/26/45/70/85 : trio équipé
   *  calme 92/89/76/74/85/89 %, périlleux 26/27/35/25/29/34 % ; le même SANS pièces
   *  90/86/72/63/67/65 % en calme. Ne pas remonter sans re-mesurer les deux. */
  k: 0.15,
  /** Bonus de rôle d'un accessoire civil commun, jet 0 (rareté et jet le font monter). */
  roleBase: { speed: 0.03, haul: 0.04 },
  /** Revente : un objet d'aventurier vaut la moitié d'un objet du héros de même grade. */
  sellK: 0.5,
} as const;

/** Chances de pièce d'aventurier par source. ⚠️ À re-mesurer si l'économie de siège bouge. */
export const ADV_GEAR_DROP = { corpse: 0.02, champion: 0.5, ambush: 0.25 } as const;

export function lineageOf(adv: Adventurer): Lineage | null {
  const root = adv.path[0];
  return root && (LINEAGES as readonly string[]).includes(root) ? (root as Lineage) : null;
}

/** ⚠️ Même règle que `canAdvTalent` : la rareté ne dépasse pas celle de la classe. */
export function canWearAdvGear(adv: Adventurer, g: AdvGear): boolean {
  return lineageOf(adv) === g.lineage && RARITY_RANK[g.rarity] <= RARITY_RANK[advRarity(adv)];
}

/** Une lignée présente dans le vivier — sinon le stock se remplirait d'objets importables. */
export function pickLineage(rng: () => number, advs: Adventurer[]): Lineage | null {
  const present = [...new Set(advs.map(lineageOf).filter((l): l is Lineage => !!l))];
  if (!present.length) return null;
  return present[Math.floor(rng() * present.length)]!;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Valeur d'une stat d'équipement à ce grade. ⚠️ SOURCE UNIQUE : le tirage ET l'escorte de
 *  référence de la route (`refAdvGear`) la lisent — deux copies divergeraient au premier
 *  réglage de `ADV_GEAR.k`, et la route se calibrerait sur un équipement qui n'existe pas.
 *  ⚠️ PLANCHER à 0,1, pas à 1 : à k 0,15 un plancher à 1 écrasait rareté ET jet sur les
 *  petites bases (crit base 4 → 0,6 → 1 en commun comme au jet parfait). */
export function advGearValue(t: EffectType, rank: Rarity, roll: number): number {
  return Math.max(0.1, round1(effectBase(t) * rankRollMult(rank, roll) * ADV_GEAR.k));
}

/** Bonus de rôle d'un accessoire civil à ce grade (même source unique que `advGearValue`). */
export function advGearRoleValue(kind: 'speed' | 'haul', rank: Rarity, roll: number): number {
  const scale = rankRollMult(rank, roll) / rankRollMult('commun', 0);
  return Math.round(ADV_GEAR.roleBase[kind] * scale * 1000) / 1000;
}

export function rollAdvGear(
  rng: () => number,
  opts: { lineage: Lineage; slot?: AdvGearSlot; level: number; luck?: number; playerLevel: number },
): Omit<AdvGear, 'id'> {
  const luck = opts.luck ?? 0;
  const slot = opts.slot ?? ADV_GEAR_SLOTS[Math.floor(rng() * ADV_GEAR_SLOTS.length)]!;
  // ⚠️ RANG SUR LA COURBE DES COMPAGNONS (`rollCompanionTier`, v0.857), pas sur la pyramide
  // des objets du héros (`rollTier`) : une pièce d'aventurier se lit en RANG, comme son
  // porteur. La pyramide court ~2 rangs devant la classe → mesuré, 7 à 38 % seulement des
  // pièces d'un champ de bataille étaient portables par un aventurier promu au mieux. Même
  // règle que familiers et talents : son rang le plus souvent, un au-dessus très rarement.
  const { rank, roll } = rollCompanionTier(
    rng,
    companionDropRank(opts.level, opts.playerLevel),
    luck,
  );
  const level = rollItemLevel(rng, Math.max(1, Math.min(opts.level, opts.playerLevel)), luck);
  const def = LINEAGE_GEAR[opts.lineage];
  const piece = def.pieces[slot];
  const i1 = Math.floor(rng() * piece.pool.length);
  const t1 = piece.pool[i1]!;
  const value = (t: EffectType) => advGearValue(t, rank, roll);
  const out: Omit<AdvGear, 'id'> = {
    lineage: opts.lineage,
    slot,
    name: piece.name,
    emoji: piece.emoji,
    rarity: rank,
    roll,
    level,
    effect: { type: t1, value: value(t1) },
  };
  if (RARITY_RANK[rank] >= RARITY_RANK.magique) {
    const others = piece.pool.filter((t) => t !== t1);
    const t2 = others[Math.floor(rng() * others.length)]!;
    out.effect2 = { type: t2, value: value(t2) };
  }
  if (def.role && slot === 'accessory') {
    out.role = { kind: def.role, value: advGearRoleValue(def.role, rank, roll) };
  }
  return out;
}

/** Ce que des pièces apportent au combat — valeur × niveau d'objet, comme un objet du héros. */
export function advGearEffects(gear: AdvGear[]): AggregatedEffects {
  const parts = gear.flatMap((g) => {
    const m = itemLevelMult(g.level);
    const out = [effectAsAggregate(g.effect.type, g.effect.value * m)];
    if (g.effect2) out.push(effectAsAggregate(g.effect2.type, g.effect2.value * m));
    return out;
  });
  return parts.length ? mergeEffects(...parts) : emptyEffects();
}

/**
 * Qui porte quoi, règles appliquées. ⚠️ Lu par le COMBAT, pas seulement l'écran : une pièce
 * portée deux fois ne compte qu'une, une pièce sur le mauvais emplacement ou devenue trop
 * rare est ignorée, un id qui ne désigne plus rien (vendu, recyclé) aussi.
 */
export function wornGear(advs: Adventurer[], stock: AdvGear[]): Map<string, AdvGear[]> {
  const byId = new Map(stock.map((g) => [g.id, g]));
  const taken = new Set<string>();
  const out = new Map<string, AdvGear[]>();
  for (const a of advs) {
    const list: AdvGear[] = [];
    for (const slot of ADV_GEAR_SLOTS) {
      const id = a.gear?.[slot];
      if (!id || taken.has(id)) continue;
      const g = byId.get(id);
      if (!g || g.slot !== slot || !canWearAdvGear(a, g)) continue;
      taken.add(id);
      list.push(g);
    }
    if (list.length) out.set(a.id, list);
  }
  return out;
}

/** Bonus de rôle PORTÉS par une escorte (fractions, non plafonnées — la route plafonne). */
export function advGearRoles(
  escort: Adventurer[],
  stock: AdvGear[],
): { speed: number; haul: number } {
  const out = { speed: 0, haul: 0 };
  for (const list of wornGear(escort, stock).values())
    for (const g of list) if (g.role) out[g.role.kind] += g.role.value;
  return out;
}

/** Ce que le sélecteur d'un emplacement propose, et combien de pièces sont masquées. */
export function advGearOptions(
  adv: Adventurer,
  advs: Adventurer[],
  stock: AdvGear[],
  slot: AdvGearSlot,
): { options: AdvGear[]; otherLineage: number; tooRare: number; taken: number } {
  const takenIds = new Set(
    advs.filter((o) => o.id !== adv.id).flatMap((o) => Object.values(o.gear ?? {})),
  );
  const res = { options: [] as AdvGear[], otherLineage: 0, tooRare: 0, taken: 0 };
  const lineage = lineageOf(adv);
  for (const g of stock) {
    if (g.slot !== slot) continue;
    if (g.lineage !== lineage) res.otherLineage++;
    else if (RARITY_RANK[g.rarity] > RARITY_RANK[advRarity(adv)]) res.tooRare++;
    else if (takenIds.has(g.id)) res.taken++;
    else res.options.push(g);
  }
  return res;
}

/** L'état persisté (jsonb `characters.adv_gear`, migr. 0068) : le stock et une
 *  forge éventuellement en cours. ⚠️ Séparé du sac du héros (`inventory`). */
export interface AdvGearState {
  stock: AdvGear[];
  forge?: { until: number; advId: string; piece: Omit<AdvGear, 'id'> } | null;
}

/** Relecture défensive du jsonb `adv_gear` au chargement : une entrée de stock sans `id`,
 *  `slot` ou `effect` est écartée (elle ferait planter l'écran ou le combat), une forge
 *  sans `piece` ou sans échéance numérique est remise à `null` (elle ne se conclurait
 *  jamais). Jamais `null` en sortie. */
export function normalizeAdvGearState(raw: unknown): AdvGearState {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const src = isObj(raw) ? raw : {};
  const stock = (Array.isArray(src.stock) ? src.stock : []).filter(
    (g): g is AdvGear =>
      isObj(g) && typeof g.id === 'string' && typeof g.slot === 'string' && isObj(g.effect),
  );
  const f = src.forge;
  const forge =
    isObj(f) && isObj(f.piece) && typeof f.until === 'number'
      ? (f as unknown as NonNullable<AdvGearState['forge']>)
      : null;
  return { stock, forge };
}

// ── ÉQUIPEMENTIER (Task 7) ──
// Un bâtiment qui transforme un objet dont le héros ne veut plus en pièce d'AVENTURIER,
// faite pour le MÉTIER de la cible. ⚠️ L'objet sacrifié ne fixe que le SLOT (arme/armure/
// accessoire, relique fusionnée dans l'accessoire) — jamais le rang de la pièce produite,
// et jamais sa lignée : c'est la CIBLE qui décide de tout, sinon un objet primordial du
// héros fabriquerait une pièce primordiale pour une recrue de niveau 3, ce qui casserait
// « chaque pièce est faite pour SON porteur » (canWearAdvGear).

/** Durée de fabrication, asymptotique (règle « aucun niveau mort du 0 au 100 ») : chaque
 *  niveau du bâtiment raccourcit un peu, sans jamais devenir instantanée. */
export const OUTFITTER = { baseMs: 40 * 60_000, speedMax: 0.6, half: 30 } as const;
export function outfitterMsFor(level: number): number {
  const L = Math.max(0, level);
  return Math.round(OUTFITTER.baseMs * (1 - (OUTFITTER.speedMax * L) / (L + OUTFITTER.half)));
}

/** Quel emplacement d'AVENTURIER un objet du héros peut nourrir. L'aventurier n'a que
 *  TROIS emplacements (`ADV_GEAR_SLOTS`) : accessoire ET relique fusionnent dans le sien.
 *  Le familier n'en fait aucun — on ne fond pas un animal. */
export function outfitSlot(slot: ItemSlot): AdvGearSlot | null {
  if (slot === 'weapon' || slot === 'armor') return slot;
  if (slot === 'accessory' || slot === 'relic') return 'accessory';
  return null;
}

/** Plafonne le RANG d'une pièce fraîchement tirée à ce que sa cible peut PORTER — même
 *  seuil que `canWearAdvGear`, appliqué avant que la pièce ne quitte la forge. Le tirage
 *  se cale sur le NIVEAU de l'aventurier, pas sur sa CLASSE (`advRarity`) : un archer
 *  resté à sa classe de départ mais monté haut en niveau roulerait sinon une pièce que
 *  lui-même ne pourra jamais équiper — la forge vise un aventurier NOMMÉ, la pièce doit
 *  lui aller.
 *  ⚠️ Le ROLL et le NIVEAU D'OBJET sont conservés (c'est le rang qui cède, pas le farm de
 *  jet) ; les VALEURS sont RECALCULÉES avec le MÊME helper que le tirage
 *  (`advGearValue`/`advGearRoleValue`) — sans ça la pièce garderait des valeurs d'un rang
 *  qu'elle n'a plus. Le 2ᵉ affixe (réservé à Magique+) disparaît si le nouveau rang ne le
 *  porte plus, exactement comme un tirage direct à ce rang. */
function capAdvGearToWearable(piece: Omit<AdvGear, 'id'>, cap: Rarity): Omit<AdvGear, 'id'> {
  if (RARITY_RANK[piece.rarity] <= RARITY_RANK[cap]) return piece;
  const out: Omit<AdvGear, 'id'> = {
    ...piece,
    rarity: cap,
    effect: { type: piece.effect.type, value: advGearValue(piece.effect.type, cap, piece.roll) },
  };
  if (piece.effect2) {
    if (RARITY_RANK[cap] >= RARITY_RANK.magique) {
      out.effect2 = {
        type: piece.effect2.type,
        value: advGearValue(piece.effect2.type, cap, piece.roll),
      };
    } else {
      delete out.effect2;
    }
  }
  if (piece.role) {
    out.role = { kind: piece.role.kind, value: advGearRoleValue(piece.role.kind, cap, piece.roll) };
  }
  return out;
}

/** Meilleure rareté de CLASSE parmi les aventuriers d'une lignée (`null` si aucun). */
function bestClassRarity(advs: Adventurer[], lineage: Lineage): Rarity | null {
  let best: Rarity | null = null;
  for (const a of advs) {
    if (lineageOf(a) !== lineage) continue;
    const r = advRarity(a);
    if (!best || RARITY_RANK[r] > RARITY_RANK[best]) best = r;
  }
  return best;
}

/**
 * Pièce d'aventurier tombée d'une source de butin (cadavre de siège, embuscade repoussée).
 * ⚠️ SOURCE UNIQUE des deux sources : le bloc chance → lignée → tirage vivait en deux
 * copies (raid.ts, caravan.ts).
 * - la lignée est tirée parmi `advs` (jamais une lignée qu'on ne possède pas) ;
 * - le rang suit la courbe des compagnons (cf. `rollAdvGear`), borné par `playerLevel` ;
 * - puis il est PLAFONNÉ à la meilleure classe de cette lignée dans `advs`
 *   (`capAdvGearToWearable`) : le stock ne se remplit jamais de pièces que personne ne
 *   peut porter. Rend `null` si le tirage échoue ou si le vivier est vide.
 * ⚠️ `rng` doit être le générateur DÉDIÉ à l'équipement (`gearRng`) : un tirage de plus sur
 * le flux principal décalerait tout le reste du butin.
 */
export function rollAdvGearDrop(
  rng: () => number,
  advs: Adventurer[],
  opts: { chance: number; level: number; luck: number; playerLevel: number },
): Omit<AdvGear, 'id'> | null {
  if (rng() >= opts.chance) return null;
  const lineage = pickLineage(rng, advs);
  if (!lineage) return null;
  const cap = bestClassRarity(advs, lineage);
  if (!cap) return null; // inatteignable : la lignée vient de `advs`
  const piece = rollAdvGear(rng, {
    lineage,
    level: opts.level,
    luck: opts.luck,
    playerLevel: opts.playerLevel,
  });
  return capAdvGearToWearable(piece, cap);
}

/** Transforme un objet du héros en pièce d'aventurier, pour la CIBLE visée.
 *  ⚠️ Le RANG est tiré autour du niveau de L'AVENTURIER, jamais de celui de l'objet
 *  sacrifié ni du héros : un objet primordial ne fabrique pas une pièce primordiale pour
 *  une recrue — seuls le SLOT et la LIGNÉE viennent de l'objet/de la cible. La rareté de
 *  l'objet ne joue qu'en LUCK (un meilleur objet aide un peu, sans jamais dicter le rang).
 *  ⚠️ Le rang tiré est ensuite PLAFONNÉ à ce que la cible peut porter (`capAdvGearToWearable`) :
 *  sans ça, une pièce trop rare pour la classe de son propre destinataire pourrait sortir
 *  de la forge. */
export function outfitFromItem(
  rng: () => number,
  item: Item,
  target: Adventurer,
  playerLevel: number,
): Omit<AdvGear, 'id'> | null {
  const slot = outfitSlot(item.slot);
  const lineage = lineageOf(target);
  if (!slot || !lineage || item.locked) return null;
  const luck = Math.min(0.5, 0.1 + RARITY_RANK[item.rarity] * 0.05);
  const piece = rollAdvGear(rng, { lineage, slot, level: target.level, luck, playerLevel });
  return capAdvGearToWearable(piece, advRarity(target));
}

/** Règlement de la forge : rien avant l'échéance, la pièce rejoint le STOCK une fois
 *  prête. ⚠️ Pur et idempotent (même patron que `settleTraining`) : appelable à chaque
 *  tick sans rien dupliquer, et rend le MÊME objet si rien ne change — c'est ce qui dit à
 *  l'appelant s'il doit persister. */
export function settleOutfit(state: AdvGearState, now: number): AdvGearState {
  const f = state.forge;
  if (!f || f.until > now) return state;
  return {
    stock: [...state.stock, { ...f.piece, id: `forge-${f.until}-${f.advId}` }],
    forge: null,
  };
}

export function advGearSellValue(g: AdvGear): number {
  return Math.max(1, Math.round(sellValueOf(g.rarity, g.roll, g.level) * ADV_GEAR.sellK));
}
export function advGearScrap(g: AdvGear): number {
  return scrapValueOf(g.slot, g.rarity, g.level);
}
