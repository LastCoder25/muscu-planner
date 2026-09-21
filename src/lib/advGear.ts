// advGear.ts — ÉQUIPEMENT DES AVENTURIERS (pur/testé). Spec :
// docs/superpowers/specs/2026-09-14-camps-equipement-aventuriers-design.md (étape 1).
//
// ⚠️ Stock SÉPARÉ du sac du héros, pièces PROPRES À CHAQUE CLASSE DE BASE, rareté plafonnée
// par la classe du porteur. Aucune nouvelle stat : on puise dans les EffectType existants.
import {
  effectAsAggregate,
  effectBase,
  effectLabelFor,
  round1,
  emptyEffects,
  itemLevelMult,
  mergeEffects,
  companionDropRank,
  rankRollMult,
  RANK_ORDER,
  RARITY_RANK,
  sellValueOf,
  type AggregatedEffects,
  type EffectType,
  type ItemEffect,
  type Rarity,
  type WeaponKind,
} from './items';
import { rankStartLevel } from './characterRank';
import { GRADE_COLOR, PULL_GRADES, type PullGrade } from '../data/champions';
import { advGearModelId, advGearModelName } from '../data/advGearModels';
import {
  advAvatar,
  advChampion,
  advRarity,
  advXpToNext,
  type AdvAvatarProfile,
  type ADV_AVATAR_SLOTS,
  type Adventurer,
} from './adventurers';

// ⚠️ Pas exportée (`npm run dead`) : aucun importeur hors du module — `Lineage` (le type
// dérivé) est ce que le reste du code consomme (ex. GuildPanel.vue).
const LINEAGES = ['guerrier', 'archer', 'mage', 'homme_armes', 'eclaireur', 'caravanier'] as const;
export type Lineage = (typeof LINEAGES)[number];
/** ⚠️ QUATRE emplacements depuis la v0.881 (demandé : « les 4 items comme le héros ») — la
 *  relique était fusionnée dans l'accessoire. `ADV_GEAR.k` a été ramené de 0,15 à 0,1125
 *  (× 3/4) pour que l'équipement COMPLET pèse ce qu'il pesait : la route et les sièges,
 *  calibrés sur une escorte équipée, ne bougent pas. */
export type AdvGearSlot = 'weapon' | 'armor' | 'accessory' | 'relic';
export const ADV_GEAR_SLOTS: AdvGearSlot[] = ['weapon', 'armor', 'accessory', 'relic'];

export interface AdvGear {
  id: string;
  lineage: Lineage;
  slot: AdvGearSlot;
  name: string;
  emoji: string;
  /** ⚠️ Le RANG de la pièce (échelle interne, comme le rang d'un champion) : il borne qui
   *  peut la porter et fixe sa magnitude de base. Il ne s'AFFICHE plus — l'écran montre la
   *  LETTRE (`grade`). Le nom de champ reste `rarity` : le renommer imposerait une
   *  migration de tout le stock sauvegardé pour rien. */
  rarity: Rarity;
  /** 🎰 La LETTRE (B / A / S), comme les champions — tirée, fixe à vie, et c'est ELLE que
   *  l'écran montre. Elle multiplie les stats de combat (`GEAR_GRADE_SHARE`). */
  grade: PullGrade;
  /** ⚠️ PAS DE JET (v0.1012, décision de l'utilisateur) : seuls les objets du HÉROS en ont un.
   *  Deux exemplaires du même modèle sont IDENTIQUES — c'est ce qui donne un sens au doublon.
   *  Le niveau démarre à ★1 de son rang (`rankStartLevel`). */
  level: number;
  /** ⬆️ XP en attente (v0.1015) : gagnée avec le champion qui la PORTE, sur la même courbe
   *  (`advXpToNext`). ⚠️ Bloquée au ★5 de son rang (`advGearLevelBand`) ET au niveau de son
   *  porteur — l'excédent est CONSERVÉ, puis reversé à l'ascension. */
  xp?: number;
  effect: ItemEffect;
  effect2?: ItemEffect;
  /** Lignées civiles uniquement, sur l'accessoire : trajet raccourci / cargaison (fraction). */
  role?: { kind: 'speed' | 'haul'; value: number };
  locked?: boolean;
}

interface PieceDef {
  name: string;
  emoji: string;
  /** ⚠️ Les stats ÉCRITES du modèle, plus un pool tiré : la 1ʳᵉ est l'affixe principal, la
   *  2ᵉ le second. Deux exemplaires du même modèle portent donc les mêmes stats — sans quoi
   *  un doublon ne serait pas un doublon. */
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
      relic: { name: 'Talisman', emoji: '🧿', pool: ['max_pv_pct', 'damage_pct'] },
    },
  },
  archer: {
    pieces: {
      weapon: { name: 'Arc', emoji: '🏹', pool: ['damage_pct', 'crit_pct'] },
      armor: { name: 'Cuir', emoji: '🦺', pool: ['max_pv_pct', 'crit_pct'] },
      accessory: { name: 'Carquois', emoji: '🎯', pool: ['crit_pct', 'momentum_pct'] },
      relic: { name: 'Plume porte-bonheur', emoji: '🪶', pool: ['crit_pct', 'max_pv_pct'] },
    },
  },
  mage: {
    pieces: {
      weapon: { name: 'Bâton', emoji: '🪄', pool: ['damage_pct', 'execute_pct'] },
      armor: { name: 'Robe', emoji: '👘', pool: ['max_pv_pct', 'lifesteal_pct'] },
      accessory: { name: 'Grimoire', emoji: '📖', pool: ['damage_pct', 'lifesteal_pct'] },
      relic: { name: 'Orbe', emoji: '🔮', pool: ['damage_pct', 'execute_pct'] },
    },
  },
  homme_armes: {
    pieces: {
      weapon: { name: 'Masse', emoji: '🔨', pool: ['damage_pct', 'thorns_pct'] },
      armor: { name: 'Plates', emoji: '🛡️', pool: ['dmg_reduction_pct', 'max_pv_pct'] },
      accessory: { name: 'Bouclier', emoji: '🔰', pool: ['dmg_reduction_pct', 'thorns_pct'] },
      relic: { name: 'Reliquaire', emoji: '📿', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
    },
  },
  eclaireur: {
    role: 'speed',
    pieces: {
      weapon: { name: 'Dague', emoji: '🔪', pool: ['crit_pct', 'damage_pct'] },
      armor: { name: 'Cape', emoji: '🧣', pool: ['max_pv_pct', 'crit_pct'] },
      accessory: { name: 'Longue-vue', emoji: '🔭', pool: ['crit_pct', 'damage_pct'] },
      relic: { name: 'Boussole', emoji: '🧭', pool: ['crit_pct', 'max_pv_pct'] },
    },
  },
  caravanier: {
    role: 'haul',
    pieces: {
      weapon: { name: 'Bâton de marche', emoji: '🦯', pool: ['max_pv_pct', 'damage_pct'] },
      armor: { name: 'Manteau', emoji: '🧥', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
      accessory: { name: 'Bât', emoji: '🎒', pool: ['dmg_reduction_pct', 'max_pv_pct'] },
      relic: { name: 'Lanterne', emoji: '🏮', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
    },
  },
};

/**
 * 🎰 CE QUE VAUT UNE LETTRE d'équipement (demandé : « les items de champions, comme les
 * champions, ont 3 raretés S/A/B »).
 *
 * ⚠️ **B = 1, et c'est ce qui garde la calibration intacte** : l'escorte de référence des
 * routes (`refAdvGear`) porte des B, donc la route se calibre sur EXACTEMENT l'équipement
 * d'avant, et l'immense majorité des pièces (tirages B, drops) reste à sa valeur. A et S
 * sont des TROUVAILLES qui montent au-dessus, d'un pas de 1,45 — le même écart qu'entre un
 * A et un S chez les champions (`GRADE_BUDGET`).
 *
 * ⚠️ Elle ne multiplie QUE les stats de COMBAT : les rôles civils (trajet, cargaison) sont
 * des canaux d'économie déjà mesurés (`scrapEconomy`), une lettre ne doit pas les doper.
 */
export const GEAR_GRADE_SHARE: Record<PullGrade, number> = { B: 1, A: 1.45, S: 1.45 ** 2 };

/** 🎰 Ce que l'écran montre d'une pièce : sa LETTRE, dans sa couleur. Source unique. */
export function advGearBadge(g: Pick<AdvGear, 'grade'>): { label: PullGrade; color: string } {
  return { label: g.grade, color: GRADE_COLOR[g.grade] };
}

/** Le MODÈLE nommé d'une pièce (roster, `src/data/advGearModels.ts`) : son nom, son emoji
 *  de repli et l'id de son illustration. ⚠️ DÉRIVÉ de (lignée, emplacement, lettre). */
export function advGearModel(
  lineage: Lineage,
  slot: AdvGearSlot,
  grade: PullGrade,
): { id: string; name: string; emoji: string } {
  return {
    id: advGearModelId(lineage, slot, grade),
    name: advGearModelName(lineage, slot, grade),
    emoji: LINEAGE_GEAR[lineage].pieces[slot].emoji,
  };
}

/** L'id du modèle d'une pièce (pour son illustration), ou `null` si elle est illisible. */
export function advGearModelOf(g: Pick<AdvGear, 'lineage' | 'slot' | 'grade'>): string | null {
  if (!(LINEAGES as readonly string[]).includes(g.lineage)) return null;
  if (!ADV_GEAR_SLOTS.includes(g.slot)) return null;
  return advGearModelId(g.lineage, g.slot, g.grade);
}

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
  k: 0.1125,
  /** ⚠️ RANG À PARTIR DUQUEL UNE PIÈCE PORTE UN SECOND AFFIXE — le levier qui a réparé le
   *  bas de courbe (v0.900, MESURÉ ; signalé par l'utilisateur : « du stuff bronze qui donne
   *  +1,1 % de vie, sachant qu'ils en ont très peu de base — très bizarre »).
   *
   *  Mesuré AVANT : un set COMPLET valait **+1,14 % de puissance au rang 🟤 Bronze** contre
   *  **+18,7 % en 🌟 Divin ancestral** ; rapporté à ce qu'un NIVEAU d'aventurier apporte,
   *  **0,04 niveau contre 10,2** — un écart de 250×. La feature n'existait pas pendant les
   *  ~20 premiers niveaux, exactement quand on découvre l'Équipementier et qu'on paie chaque
   *  pièce d'un objet du héros plus du temps de forge.
   *
   *  ⚠️ LA PISTE « ils ont trop peu de PV de base » EST ARITHMÉTIQUEMENT MORTE, mesurée :
   *  un set Bronze vaut 1,55 / 1,66 / 1,93 / 2,09 % aux niveaux 10/20/40/80 — une valeur
   *  PLATE. Un pourcentage suit son assiette par construction, donc relever `STRATUM_BUDGET`
   *  gonflerait le nu autant que l'équipé. Ce qui pilote la valeur, c'est le RANG.
   *
   *  ⚠️ CE SEUIL EST LE LEVIER LE PLUS BRUTAL, parce que les deux canaux se MULTIPLIENT
   *  dans `offense × survie` : à `'magique'` (🟡 Or) il créait une MARCHE entre ⚪ Argent
   *  (+2,2 %) et Or (+5,3 %). À `'commun'`, toute pièce porte deux stats et le rang ne dit
   *  plus que leur TAILLE — une règle qui s'explique en une phrase, et qui colle au modèle
   *  « rang + étoiles » de l'app.
   *
   *  ⚠️ CHOISI PARCE QU'IL EST CHIRURGICAL : Or et au-dessus portaient DÉJÀ deux affixes,
   *  donc leurs valeurs sont **inchangées au bit** (18,71 % en Divin ancestral avant comme
   *  après) — seuls Bronze (1,14 → 4,26 %) et Argent (2,17 → 4,15 %) bougent, c'est-à-dire
   *  exactement la zone cassée. Le prix du NON-équipement pour un trio passe de 5,1 à 10,5 %
   *  au niveau 2, et reste identique dès le niveau 26.
   *
   *  ⚠️ UNE COMPRESSION DE MAGNITUDE A ÉTÉ MESURÉE PUIS ÉCARTÉE (balayage de 15 réglages,
   *  exposant 1 → 0,25 pincé sur le rang maximal) : elle aplatit bien la courbe (7,5 → 18 %
   *  à l'exposant 0,25) mais fait payer **28 % de puissance** au débutant non équipé, contre
   *  5 % aujourd'hui — l'équipement deviendrait un PÉAGE, ce que `k` existe précisément pour
   *  éviter. Elle touchait aussi le milieu de courbe, donc toute la calibration de la route.
   *
   *  ⚠️ NON RÉTROACTIF : une pièce Bronze déjà en stock garde son unique affixe (l'autre
   *  serait tiré au hasard, on ne réécrit pas un objet possédé). Même politique que les
   *  refontes de tirage précédentes. */
  affix2From: 'commun' as Rarity,
  /** Bonus de rôle d'un accessoire civil commun (le rang le fait monter). */
  roleBase: { speed: 0.03, haul: 0.04 },
  /** Revente : un objet d'aventurier vaut la moitié d'un objet du héros de même grade. */
  sellK: 0.5,
} as const;

export function lineageOf(adv: Adventurer): Lineage | null {
  // ⚠️ Pour un champion elle est ÉCRITE, alors qu'elle se DÉDUISAIT de la classe racine :
  // sans chemin, c'est le seul endroit qui dise quel équipement il peut porter.
  const champ = advChampion(adv);
  if (champ) return champ.lineage;
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

/** Valeur d'une stat d'équipement à ce grade. ⚠️ SOURCE UNIQUE : le tirage ET l'escorte de
 *  référence de la route (`refAdvGear`) la lisent — deux copies divergeraient au premier
 *  réglage de `ADV_GEAR.k`, et la route se calibrerait sur un équipement qui n'existe pas.
 *  ⚠️ PLANCHER à 0,1, pas à 1 : à k 0,15 un plancher à 1 écrasait le rang sur les petites
 *  bases (crit base 4 → 0,6 → 1 quel que soit le rang).
 *  ⚠️ SANS JET : la valeur est le PLANCHER du rang (`rankRollMult(rang, 0)`). */
export function advGearValue(
  t: EffectType,
  rank: Rarity,
  /** ⚠️ Défaut B = 1 : la lettre de l'étalon (`refAdvGear`). Le tirage la passe TOUJOURS. */
  grade: PullGrade = 'B',
): number {
  return Math.max(
    0.1,
    round1(effectBase(t) * rankRollMult(rank, 0) * ADV_GEAR.k * GEAR_GRADE_SHARE[grade]),
  );
}

/** Une pièce de ce rang porte-t-elle un SECOND affixe ? — la SEULE définition.
 *
 *  ⚠️ Elle vivait en DEUX copies : `rollAdvGear` (ici) et `refAdvGear` (`caravan.ts`), qui
 *  réécrivait `RARITY_RANK[rarity] >= RARITY_RANK.magique` à la main. Or `refAdvGear` est
 *  l'ÉTALON sur lequel `roadFoe` se calibre : les laisser diverger, c'est calibrer la route
 *  sur un équipement que le jeu ne produit pas. Mesuré — changer le seuil n'avait
 *  strictement AUCUN effet sur les bandes d'embuscade tant que l'étalon gardait sa copie. */
export function advGearHasSecondAffix(rank: Rarity): boolean {
  return RARITY_RANK[rank] >= RARITY_RANK[ADV_GEAR.affix2From];
}

/** Bonus de rôle d'un accessoire civil à ce grade (même source unique que `advGearValue`). */
function advGearRoleValue(kind: 'speed' | 'haul', rank: Rarity): number {
  // ⚠️ Volontairement sur la courbe D'ORIGINE, pas sur `advRankMult` : ce sont des canaux
  // CIVILS (temps de trajet, cargaison), déjà plafonnés par la route et comptés dans
  // l'économie. Les comprimer déplacerait le rendement des convois.
  const scale = rankRollMult(rank, 0) / rankRollMult('commun', 0);
  return Math.round(ADV_GEAR.roleBase[kind] * scale * 1000) / 1000;
}

/** Plafond de niveau du jeu (celui du héros). */
const ADV_GEAR_MAX_LEVEL = 100;

/** La tranche de niveaux d'un rang : [★1, ★5]. Une pièce vit toujours dans celle de son
 *  rang — l'ascension la fera passer dans la suivante. */
export function advGearLevelBand(rank: Rarity): { min: number; max: number } {
  const i = Math.max(0, RANK_ORDER.indexOf(rank));
  // ⚠️ La DERNIÈRE rareté court jusqu'au plafond du jeu : au-delà d'elle, les rangs de
  // prestige (Divin céleste, Tout-puissant) n'ont plus de rareté d'objet à ouvrir.
  const last = i >= RANK_ORDER.length - 1;
  return { min: rankStartLevel(i), max: last ? ADV_GEAR_MAX_LEVEL : rankStartLevel(i + 1) - 1 };
}

/**
 * 🗡️ UNE PIÈCE D'UN MODÈLE, À CE RANG — entièrement DÉTERMINISTE (v0.1012).
 *
 * ⚠️ Plus aucun tirage ici : ni jet, ni niveau d'objet, ni stat tirée dans un pool. Le
 * modèle (lignée × emplacement × lettre) écrit ses stats, le rang en fixe la taille, et la
 * pièce démarre à ★1 de son rang. Deux pièces du même modèle au même rang sont donc
 * IDENTIQUES : c'est la condition pour qu'un doublon ait un sens (l'éveil le fusionnera).
 * ⚠️ SOURCE UNIQUE : le tirage du gacha, la relecture du stock et l'étalon de la route
 * (`refAdvGear`) la lisent tous — deux constructions divergeraient.
 */
export function makeAdvGear(opts: {
  lineage: Lineage;
  slot: AdvGearSlot;
  rank: Rarity;
  grade: PullGrade;
  /** Niveau de la pièce, borné à la tranche de son rang. Défaut : ★1. */
  level?: number;
}): Omit<AdvGear, 'id'> {
  const { lineage, slot, rank, grade } = opts;
  const def = LINEAGE_GEAR[lineage];
  const piece = def.pieces[slot];
  const band = advGearLevelBand(rank);
  const level = Math.min(band.max, Math.max(band.min, Math.round(opts.level ?? band.min)));
  const [t1, t2] = piece.pool;
  const model = advGearModel(lineage, slot, grade);
  const out: Omit<AdvGear, 'id'> = {
    lineage,
    slot,
    name: model.name,
    emoji: model.emoji,
    rarity: rank,
    grade,
    level,
    effect: { type: t1!, value: advGearValue(t1!, rank, grade) },
  };
  if (t2 && advGearHasSecondAffix(rank))
    out.effect2 = { type: t2, value: advGearValue(t2, rank, grade) };
  if (def.role && slot === 'accessory')
    out.role = { kind: def.role, value: advGearRoleValue(def.role, rank) };
  return out;
}

/**
 * 🎰 LA PIÈCE D'UN TIRAGE B — la SEULE source d'équipement de champion (v0.1012, décision de
 * l'utilisateur : « les items de champions ne peuvent venir QUE du tirage gacha »).
 *
 * - Lignée tirée parmi celles du vivier (jamais une lignée qu'on ne possède pas) ; vivier
 *   vide → parmi toutes, sinon le tout premier tirage d'un compte ne rendrait rien.
 * - Emplacement tiré.
 * - Rang = celui du JOUEUR (`companionDropRank`), plafonné à la meilleure classe de la
 *   lignée dans le vivier : le stock ne se remplit jamais de pièces que personne ne porte.
 */
export function rollGachaPiece(
  rng: () => number,
  advs: Adventurer[],
  opts: { playerLevel: number; grade: PullGrade },
): Omit<AdvGear, 'id'> {
  const lineage = pickLineage(rng, advs) ?? LINEAGES[Math.floor(rng() * LINEAGES.length)]!;
  const slot = ADV_GEAR_SLOTS[Math.floor(rng() * ADV_GEAR_SLOTS.length)]!;
  const lvl = Math.max(1, opts.playerLevel);
  let rank = RANK_ORDER[companionDropRank(lvl, lvl)] ?? 'commun';
  const cap = bestClassRarity(advs, lineage);
  if (cap && RARITY_RANK[cap] < RARITY_RANK[rank]) rank = cap;
  return makeAdvGear({ lineage, slot, rank, grade: opts.grade });
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

/**
 * 🗡️ CE QUI ATTEND UN PORTEUR : pour chaque aventurier, les emplacements VIDES qu'une pièce
 * du stock pourrait remplir tout de suite.
 *
 * ⚠️ POURQUOI ELLE EXISTE. Un emplacement vide peut être parfaitement normal — aucune pièce
 * de sa lignée en stock, ou toutes trop rares pour sa classe. Rien ne distinguait ce cas de
 * celui où une pièce attend, et « Confier au mieux » ne se relance pas tout seul quand une
 * forge se termine : constaté sur le compte réel, un archer restait sans arme alors qu'un
 * arc portable dormait en stock, et ça se lisait comme une panne de l'auto-équipement.
 *
 * ⚠️ « DISPONIBLE » = non portée, par lui comme par un autre (`wornGear`, les règles du
 * COMBAT) : compter une pièce déjà sur le dos de quelqu'un ferait promettre un remplissage
 * qui n'aurait pas lieu.
 *
 * ⚠️ Elle ne dit PAS que l'auto-équipement la confiera à CET aventurier : il optimise sur
 * tout le vivier et peut la donner à un meilleur porteur. Elle dit qu'il y a à faire.
 */
export function pendingAdvGear(advs: Adventurer[], stock: AdvGear[]): Map<string, AdvGearSlot[]> {
  // ⚠️ UNE SEULE lecture de `wornGear` : elle tranche à la fois ce qui est PRIS (donc
  // indisponible) et ce que chacun porte VRAIMENT (une pièce devenue trop rare y est
  // ignorée, et son emplacement compte donc comme vide — ce qu'il est).
  const byAdv = wornGear(advs, stock);
  const worn = new Set([...byAdv.values()].flat().map((g) => g.id));
  const free = stock.filter((g) => !worn.has(g.id));
  const out = new Map<string, AdvGearSlot[]>();
  for (const a of advs) {
    const mine = byAdv.get(a.id) ?? [];
    const slots = ADV_GEAR_SLOTS.filter(
      (slot) =>
        !mine.some((g) => g.slot === slot) &&
        free.some((g) => g.slot === slot && canWearAdvGear(a, g)),
    );
    if (slots.length) out.set(a.id, slots);
  }
  return out;
}

/** 🏹 LA FORME DESSINÉE de l'arme de chaque lignée (portrait du vivier, v0.865).
 *  ⚠️ Exhaustive par construction (`Record<Lineage, …>`) : une lignée ajoutée sans dire
 *  comment son arme se dessine ne compile pas. L'arc et le bâton ont leur dessin propre ;
 *  le bâton de marche du caravanier se dessine comme le bâton du mage (même silhouette). */
const LINEAGE_WEAPON_KIND: Record<Lineage, WeaponKind> = {
  guerrier: 'lame',
  archer: 'arc',
  mage: 'baton',
  homme_armes: 'masse',
  eclaireur: 'dague',
  caravanier: 'baton',
};

type AdvLookSlot = (typeof ADV_AVATAR_SLOTS)[number];
export interface AdvLook {
  profile: AdvAvatarProfile;
  /** Chaque emplacement dessiné : sa rareté, et la pièce RÉELLEMENT portée s'il y en a une
   *  (`null` = habillage par classe, `advAvatar`). */
  gear: Partial<Record<AdvLookSlot, { rarity: Rarity; piece: AdvGear | null }>>;
  /** Forme de l'arme : celle de la lignée si une arme est portée, sinon la lame d'avant. */
  weaponKind: WeaponKind;
}

/**
 * 🖼️ L'APPARENCE DU VIVIER, ÉQUIPEMENT PORTÉ COMPRIS (v0.865 ; demandé par l'utilisateur).
 * Le portrait s'habillait par CLASSE seulement (`advAvatar`) : une arme portée ne se voyait
 * pas. Une pièce réellement portée REMPLACE l'habillage de classe de son emplacement ; les
 * emplacements sans pièce gardent l'habillage (la relique en fait partie depuis la v0.881).
 * ⚠️ « Porté » = `wornGear`, la définition que lit le combat : une pièce interdite (autre
 * lignée, trop rare pour la classe) ou déjà prise ailleurs ne s'affiche pas — le portrait
 * ne peut pas montrer un équipement qui ne compte pas. D'où le VIVIER entier en entrée.
 */
export function advLooks(advs: Adventurer[], stock: AdvGear[]): Map<string, AdvLook> {
  const worn = wornGear(advs, stock);
  const out = new Map<string, AdvLook>();
  for (const a of advs) {
    const base = advAvatar(a);
    const gear: AdvLook['gear'] = {};
    for (const [slot, rarity] of Object.entries(base.gear) as [AdvLookSlot, Rarity][]) {
      gear[slot] = { rarity, piece: null };
    }
    let weaponKind: WeaponKind = 'lame';
    for (const g of worn.get(a.id) ?? []) {
      gear[g.slot] = { rarity: g.rarity, piece: g };
      if (g.slot === 'weapon') weaponKind = LINEAGE_WEAPON_KIND[g.lineage];
    }
    out.set(a.id, { profile: base.profile, gear, weaponKind });
  }
  return out;
}

/** Une case d'équipement d'un aventurier (portrait 2×2 et fiche). */
export interface AdvGearCell {
  slot: AdvGearSlot;
  emoji: string;
  name: string;
  filled: boolean;
  /** La pièce PORTÉE (règles appliquées, `wornGear`), sinon absente. */
  piece?: AdvGear;
  /** Couleur de la LETTRE de la pièce portée. (Plus de jet depuis la v0.1012 : deux pièces
   *  du même modèle au même rang sont identiques.) */
  color?: string;
  /** La LETTRE de la pièce portée (B / A / S). */
  rank?: string;
  /** Id du modèle nommé de la pièce portée, pour son illustration (`advGearArt`). */
  model?: string;
  /** ⚠️ Case VIDE qu'une pièce du stock pourrait remplir tout de suite (`pendingAdvGear`).
   *  Un vide peut être normal (rien de sa lignée, tout trop rare) : sans ce drapeau les deux
   *  se lisaient pareil, et « il me manque une arme » ressemblait à une panne. */
  pending?: boolean;
  /** Stat principale, telle que le combat la lit (valeur × niveau d'objet). */
  stat?: string;
  title: string;
}

/** Les textes d'effet d'une pièce, EXACTEMENT comme le combat les lit (`advGearEffects`). */
export function advGearEffectTexts(g: AdvGear): string[] {
  const m = itemLevelMult(g.level);
  const out = [effectLabelFor(g.effect.type, round1(g.effect.value * m))];
  if (g.effect2) out.push(effectLabelFor(g.effect2.type, round1(g.effect2.value * m)));
  return out;
}

/** Les 4 cases d'équipement d'un aventurier, dans l'ordre `ADV_GEAR_SLOTS` (la grille 2×2
 *  lit arme · armure / accessoire · relique). ⚠️ `worn` = ce que `wornGear` retient pour lui :
 *  une pièce invalide (autre métier, trop rare, prise ailleurs) se lit comme une case VIDE,
 *  jamais comme portée — le portrait ne montre pas un équipement qui ne compte pas. */
export function advGearCells(
  adv: Adventurer,
  worn: readonly AdvGear[],
  /** Emplacements qu'une pièce du stock peut remplir (`pendingAdvGear`), s'ils sont connus. */
  pending: readonly AdvGearSlot[] = [],
): AdvGearCell[] {
  const lineage = lineageOf(adv);
  const defs = lineage ? LINEAGE_GEAR[lineage].pieces : null;
  return ADV_GEAR_SLOTS.map((slot) => {
    const piece = worn.find((g) => g.slot === slot);
    if (piece) {
      // ⚠️ La LETTRE (B / A / S), comme les champions — plus le rang + étoiles du héros.
      const b = advGearBadge(piece);
      const stat = advGearEffectTexts(piece)[0];
      const grade = b.label;
      return {
        slot,
        emoji: piece.emoji,
        name: piece.name,
        filled: true,
        piece,
        color: b.color,
        rank: grade,
        model: advGearModelOf(piece) ?? undefined,
        stat,
        title: `${piece.name} · ${grade}${stat ? ' · ' + stat : ''}`,
      };
    }
    const d = defs?.[slot];
    const name = d?.name ?? 'Emplacement';
    const attend = pending.includes(slot);
    return {
      slot,
      emoji: d?.emoji ?? '＋',
      name,
      filled: false,
      ...(attend ? { pending: true } : {}),
      title: attend ? `${name} — une pièce attend en stock` : `${name} — vide`,
    };
  });
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

/** L'état persisté (jsonb `characters.adv_gear`, migr. 0068) : le stock.
 *  ⚠️ Séparé du sac du héros (`inventory`). La file de l'Équipementier (`forges`) a disparu
 *  avec la forge (v0.1012) : les pièces qui y attendaient rejoignent le stock à la relecture. */
export interface AdvGearState {
  stock: AdvGear[];
}

/** Remet une pièce sur son MODÈLE (v0.1012) : stats écrites, valeur au plancher de son rang,
 *  niveau borné à la tranche de ce rang, plus aucun jet. ⚠️ Idempotente — relire deux fois
 *  rend la même pièce. Une pièce illisible (lignée ou emplacement inconnus) est rendue telle
 *  quelle : on ne jette pas un objet possédé. */
function onModel<T extends Omit<AdvGear, 'id'>>(g: T): T {
  // ⚠️ Une pièce d'avant les lettres est un B (valeurs B = 1).
  const grade: PullGrade = PULL_GRADES.includes(g.grade) ? g.grade : 'B';
  if (!advGearModelOf({ ...g, grade })) return g;
  const rank: Rarity = RANK_ORDER.includes(g.rarity) ? g.rarity : 'commun';
  const fresh = makeAdvGear({
    lineage: g.lineage,
    slot: g.slot,
    rank,
    grade,
    level: typeof g.level === 'number' ? g.level : undefined,
  });
  // Les champs PROPRES à l'exemplaire (id, verrou) survivent ; tout le reste vient du modèle.
  const own = g as T & { id?: string };
  return {
    ...fresh,
    ...(own.id !== undefined ? { id: own.id } : {}),
    ...(g.locked ? { locked: true } : {}),
    ...(typeof g.xp === 'number' && g.xp > 0 ? { xp: Math.floor(g.xp) } : {}),
  } as unknown as T;
}

// ── ⬆️ PROGRESSION DES OBJETS (v0.1015, étape C de la spec d'ascension) ──────────────────

/** Le niveau le plus haut qu'une pièce peut atteindre ICI : le ★5 de son rang, et jamais
 *  au-dessus de son porteur (« l'objet suit son champion sans le dépasser »). Une pièce ne
 *  recule pas pour autant : la boucle de `grantAdvGearXp` ne fait que monter. */
function gearLevelCap(g: AdvGear, wearerLevel: number): number {
  return Math.min(advGearLevelBand(g.rarity).max, wearerLevel);
}

/** Verse de l'XP à une pièce : montées en chaîne, excédent conservé. Pur. */
export function grantAdvGearXp(g: AdvGear, xp: number, wearerLevel: number): AdvGear {
  const cap = gearLevelCap(g, wearerLevel);
  let level = g.level;
  let pool = Math.max(0, g.xp ?? 0) + Math.max(0, Math.round(xp));
  while (level < cap && pool >= advXpToNext(level)) {
    pool -= advXpToNext(level);
    level++;
  }
  return level === g.level && pool === (g.xp ?? 0) ? g : { ...g, level, xp: pool };
}

/** L'XP TOTALE accumulée par un aventurier (niveaux gagnés + réserve). ⚠️ C'est ce qui rend
 *  l'entraînement des objets indépendant de la SOURCE : on compare le vivier avant/après,
 *  et tout gain (convoi, groupe, siège) passe par le même chemin sans qu'aucun site n'ait
 *  à s'en souvenir. Une ascension, une promotion ou un soin ne changent pas ce total. */
function advTotalXp(a: Adventurer): number {
  let t = Math.max(0, a.xp);
  for (let l = 1; l < a.level; l++) t += advXpToNext(l);
  return t;
}

/**
 * 🗡️ LES OBJETS PORTÉS APPRENNENT AVEC LEUR CHAMPION (décision 3 : « gagné en combattant »).
 * Chaque pièce RÉELLEMENT portée (`wornGear`, la règle du combat) reçoit 100 % de ce que son
 * porteur a gagné entre `before` et `after`. Rend le MÊME tableau si rien n'a bougé — le
 * store n'écrit alors pas `adv_gear`.
 */
export function trainWornGear(
  before: Adventurer[],
  after: Adventurer[],
  stock: AdvGear[],
): AdvGear[] {
  const prev = new Map(before.map((a) => [a.id, a]));
  const worn = wornGear(after, stock);
  const next = new Map<string, AdvGear>();
  for (const a of after) {
    const p = prev.get(a.id);
    if (!p) continue;
    const gain = advTotalXp(a) - advTotalXp(p);
    if (gain <= 0) continue;
    for (const g of worn.get(a.id) ?? []) {
      const up = grantAdvGearXp(g, gain, a.level);
      if (up !== g) next.set(g.id, up);
    }
  }
  return next.size ? stock.map((g) => next.get(g.id) ?? g) : stock;
}

/** Le rang le plus haut qu'une pièce peut OUVRIR : celui de son porteur si elle est portée,
 *  sinon celui du champion le plus avancé de sa lignée (spec § 2). `null` = personne. */
export function advGearRankCap(g: AdvGear, advs: Adventurer[], stock: AdvGear[]): Rarity | null {
  for (const [id, list] of wornGear(advs, stock))
    if (list.some((x) => x.id === g.id)) {
      const w = advs.find((a) => a.id === id);
      return w ? advRarity(w) : null;
    }
  return bestClassRarity(advs, g.lineage);
}

/** Le rang que la prochaine ascension ouvrirait (index), ou `null` au sommet. */
export function advGearNextRank(g: AdvGear): number | null {
  const i = RANK_ORDER.indexOf(g.rarity);
  return i < 0 || i >= RANK_ORDER.length - 1 ? null : i + 1;
}

/** Applique l'ascension : rang suivant, ★1 de ce rang, stats reconstruites par le MODÈLE,
 *  éveil et verrou gardés, XP en attente reversée. ⚠️ Ne vérifie rien (coût, plafond) :
 *  c'est `advGearAscensionBlocker` qui décide. Pur. */
export function ascendAdvGear(g: AdvGear, wearerLevel: number): AdvGear {
  const next = advGearNextRank(g);
  if (next == null) return g;
  const rank = RANK_ORDER[next]!;
  const fresh = makeAdvGear({ lineage: g.lineage, slot: g.slot, rank, grade: g.grade });
  const up: AdvGear = {
    ...g,
    ...fresh,
    id: g.id,
    xp: g.xp ?? 0,
  };
  return grantAdvGearXp(up, 0, wearerLevel);
}

/** Relecture défensive du jsonb `adv_gear` au chargement : une entrée de stock sans `id`,
 *  `slot` ou `effect` est écartée (elle ferait planter l'écran ou le combat). Chaque pièce
 *  est remise sur son modèle (`onModel`). Jamais `null` en sortie. */
export function normalizeAdvGearState(raw: unknown): AdvGearState {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const src = isObj(raw) ? raw : {};
  const stock = (Array.isArray(src.stock) ? src.stock : [])
    .filter(
      (g): g is AdvGear =>
        isObj(g) && typeof g.id === 'string' && typeof g.slot === 'string' && isObj(g.effect),
    )
    .map(onModel);
  // ⚠️ La forge a disparu : une fabrication PAYÉE qui attendait dans la file ne se perd pas,
  // elle rejoint le stock tout de suite. Id dérivé de son échéance → relire deux fois ne la
  // duplique pas (la file n'est plus réécrite, elle disparaît à la sauvegarde suivante).
  const jobs = [...(Array.isArray(src.forges) ? src.forges : []), src.forge].filter(
    (f): f is { until: number; advId: string; piece: Omit<AdvGear, 'id'> } =>
      isObj(f) && isObj(f.piece) && typeof f.until === 'number' && typeof f.advId === 'string',
  );
  const ids = new Set(stock.map((g) => g.id));
  for (const f of jobs) {
    const id = `forge-${f.until}-${f.advId}`;
    if (ids.has(id) || typeof f.piece.slot !== 'string') continue;
    ids.add(id);
    stock.push(onModel({ ...f.piece, id }));
  }
  return { stock };
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

export function advGearSellValue(g: AdvGear): number {
  return Math.max(
    1,
    Math.round(sellValueOf(g.rarity, 0, g.level) * ADV_GEAR.sellK * GEAR_GRADE_SHARE[g.grade]),
  );
}
