// advGear.ts — ÉQUIPEMENT DES AVENTURIERS (pur/testé). Spec :
// docs/superpowers/specs/2026-09-14-camps-equipement-aventuriers-design.md (étape 1).
//
// ⚠️ Stock SÉPARÉ du sac du héros, pièces PROPRES À CHAQUE CLASSE DE BASE, rareté plafonnée
// par la classe du porteur. Aucune nouvelle stat : on puise dans les EffectType existants.
import {
  effectAsAggregate,
  effectBase,
  effectLabelFor,
  gradeLabel,
  rarityRank,
  round1,
  emptyEffects,
  itemLevelMult,
  mergeEffects,
  companionDropRank,
  rankRollMult,
  RARITY_RANK,
  rollCompanionTier,
  rollItemLevel,
  sellValueOf,
  type AggregatedEffects,
  type EffectType,
  type Item,
  type ItemEffect,
  type ItemSlot,
  type Rarity,
  type WeaponKind,
} from './items';
import {
  advAvatar,
  advRarity,
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

/** Valeur d'une stat d'équipement à ce grade. ⚠️ SOURCE UNIQUE : le tirage ET l'escorte de
 *  référence de la route (`refAdvGear`) la lisent — deux copies divergeraient au premier
 *  réglage de `ADV_GEAR.k`, et la route se calibrerait sur un équipement qui n'existe pas.
 *  ⚠️ PLANCHER à 0,1, pas à 1 : à k 0,15 un plancher à 1 écrasait rareté ET jet sur les
 *  petites bases (crit base 4 → 0,6 → 1 en commun comme au jet parfait). */
export function advGearValue(t: EffectType, rank: Rarity, roll: number): number {
  return Math.max(0.1, round1(effectBase(t) * rankRollMult(rank, roll) * ADV_GEAR.k));
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
export function advGearRoleValue(kind: 'speed' | 'haul', rank: Rarity, roll: number): number {
  // ⚠️ Volontairement sur la courbe D'ORIGINE, pas sur `advRankMult` : ce sont des canaux
  // CIVILS (temps de trajet, cargaison), déjà plafonnés par la route et comptés dans
  // l'économie (`scrapEconomy`). Les comprimer déplacerait le rendement des convois, un
  // réglage sans rapport avec le combat que la compression corrige.
  const scale = rankRollMult(rank, roll) / rankRollMult('commun', 0);
  return Math.round(ADV_GEAR.roleBase[kind] * scale * 1000) / 1000;
}

export function rollAdvGear(
  rng: () => number,
  opts: {
    lineage: Lineage;
    slot?: AdvGearSlot;
    level: number;
    luck?: number;
    playerLevel: number;
    /** Rang IMPOSÉ (Équipementier) : seul le jet reste tiré. */
    rank?: Rarity;
  },
): Omit<AdvGear, 'id'> {
  const luck = opts.luck ?? 0;
  const slot = opts.slot ?? ADV_GEAR_SLOTS[Math.floor(rng() * ADV_GEAR_SLOTS.length)]!;
  // ⚠️ RANG SUR LA COURBE DES COMPAGNONS (`rollCompanionTier`, v0.857), pas sur la pyramide
  // des objets du héros (`rollTier`) : une pièce d'aventurier se lit en RANG, comme son
  // porteur. La pyramide court ~2 rangs devant la classe → mesuré, 7 à 38 % seulement des
  // pièces d'un champ de bataille étaient portables par un aventurier promu au mieux. Même
  // règle que familiers et talents : son rang le plus souvent, un au-dessus très rarement.
  const drawn = rollCompanionTier(rng, companionDropRank(opts.level, opts.playerLevel), luck);
  const rank = opts.rank ?? drawn.rank;
  const roll = drawn.roll;
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
  if (advGearHasSecondAffix(rank)) {
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
  /** Couleur, et RANG + ÉTOILES de la pièce portée (`gradeLabel`, comme un objet du héros).
   *  ⚠️ Les étoiles ne sont pas décoratives : une pièce d'aventurier porte un JET
   *  (`rollAdvGear` en tire un) qui décide d'une part de sa valeur. Sans elles, deux pièces
   *  « Bronze » pouvaient valoir du simple au double sans que rien ne les distingue — le
   *  défaut que la v0.895 avait corrigé côté héros et qui survivait ici. */
  color?: string;
  rank?: string;
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
      const rk = rarityRank(piece.rarity);
      const stat = advGearEffectTexts(piece)[0];
      const grade = gradeLabel(piece); // « Bronze ★★☆☆☆ » — rang ET jet, comme le héros
      return {
        slot,
        emoji: piece.emoji,
        name: piece.name,
        filled: true,
        piece,
        color: rk.color,
        rank: grade,
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

/** Une fabrication de l'Équipementier : la pièce est tirée au LANCEMENT, elle rejoint le
 *  stock à `until`. */
export interface ForgeJob {
  until: number;
  advId: string;
  piece: Omit<AdvGear, 'id'>;
}

/** L'état persisté (jsonb `characters.adv_gear`, migr. 0068) : le stock et la FILE de
 *  l'Équipementier (v0.881 ; une seule fabrication avant, dans `forge`, relue au
 *  chargement). ⚠️ Séparé du sac du héros (`inventory`). */
export interface AdvGearState {
  stock: AdvGear[];
  forges: ForgeJob[];
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
  const isJob = (f: unknown): f is ForgeJob =>
    isObj(f) && isObj(f.piece) && typeof f.until === 'number' && typeof f.advId === 'string';
  // L'ancienne forge unique (`forge`) rejoint la file : une fabrication en cours avant la
  // mise à jour ne se perd pas.
  const forges = [...(Array.isArray(src.forges) ? src.forges : []), src.forge]
    .filter(isJob)
    .sort((a, b) => a.until - b.until);
  return { stock, forges };
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
// ⚠️ 40 → 10 min à neuf (v0.881, demandé : « création plus rapide ») ; les fabrications se
// mettent désormais en FILE (`nextForgeUntil`).
export const OUTFITTER = {
  baseMs: 10 * 60_000,
  speedMax: 0.6,
  half: 30,
  /** 💰 Ce que forger coûte, en multiples de ce que la pièce se REVENDRAIT (jet nul).
   *
   *  ⚠️ IL DOIT RESTER NETTEMENT AU-DESSUS DE 1 / `ADV_GEAR.sellK`, et c'est la seule
   *  contrainte non négociable : sinon forger puis revendre FABRIQUE DE L'OR, et l'économie
   *  entière part en boucle. Marge large ici (un jet parfait ne rapporte que +70 %).
   *
   *  ⚠️ MESURÉ contre le revenu réel (`test/helpers/goldModel`), comme `goldSink` : équiper
   *  un aventurier COMPLET (4 pièces) vaut **2 à 9 % d'une journée** de revenu du niveau 10
   *  au 80, quand UN CRAN de bâtiment en coûte 160 à 260 %. La forge se sent sans jamais
   *  rivaliser avec le vrai puits d'or. */
  goldK: 7,
} as const;
export function outfitterMsFor(level: number): number {
  const L = Math.max(0, level);
  return Math.round(OUTFITTER.baseMs * (1 - (OUTFITTER.speedMax * L) / (L + OUTFITTER.half)));
}

/** 💰 Or que coûte la fabrication d'une pièce de ce RANG pour un aventurier de ce NIVEAU
 *  (demandé : « selon le niveau de l'item qui sera fabriqué »).
 *
 *  ⚠️ IL NE DÉPEND QUE DE CE QUI EST DÉTERMINISTE — le rang (`outfitRank`) et le niveau de
 *  la cible. Le JET et le niveau d'objet réels sont TIRÉS au lancement : un coût qui en
 *  dépendrait ne pourrait pas être annoncé avant, et changerait sous les yeux du joueur.
 *
 *  ⚠️ DÉRIVÉ de `sellValueOf`, la table de valeur du projet — jamais une seconde échelle de
 *  prix : le jour où la valeur d'un rang bouge, la forge suit. */
export function outfitGoldCost(rank: Rarity, level: number): number {
  return Math.max(1, Math.round(sellValueOf(rank, 0, level) * ADV_GEAR.sellK * OUTFITTER.goldK));
}

/** Quel emplacement d'AVENTURIER un objet du héros peut nourrir : le même (4 emplacements
 *  depuis la v0.881). Le familier et le trophée n'en font aucun — on ne fond pas un animal. */
export function outfitSlot(slot: ItemSlot): AdvGearSlot | null {
  return slot === 'weapon' || slot === 'armor' || slot === 'accessory' || slot === 'relic'
    ? slot
    : null;
}

/** Rang de la pièce que l'Équipementier fabriquera (v0.881, demandé par l'utilisateur) :
 *  le rang de l'AVENTURIER (celui de sa classe), sauf si l'objet fourni est plus bas — la
 *  pièce ne dépasse alors jamais le rang de l'objet. Déterministe : l'écran l'annonce avant. */
export function outfitRank(item: Pick<Item, 'rarity'>, target: Adventurer): Rarity {
  const cls = advRarity(target);
  return RARITY_RANK[item.rarity] < RARITY_RANK[cls] ? item.rarity : cls;
}

/** Un objet du sac qu'on peut fondre pour CET aventurier, avec la pièce qui en sortira. */
/** Ce que la pièce fabriquée ferait face à ce que l'aventurier porte déjà sur l'emplacement. */
export type OutfitVerdict = 'empty' | 'up' | 'same' | 'down';

export interface OutfitOption {
  item: Item;
  slot: AdvGearSlot;
  name: string;
  emoji: string;
  rank: Rarity;
  /** L'objet est plus bas que l'aventurier : la pièce sortira à SON rang, pas à celui du porteur. */
  capped: boolean;
  /** L'aventurier ne PORTE rien sur cet emplacement (pièce retenue par `wornGear`). */
  emptySlot: boolean;
  /** La pièce qu'il porte sur cet emplacement, à comparer AVANT de fondre l'objet. */
  current?: AdvGear;
  /** Rang de la pièce fabriquée face à la pièce portée. */
  verdict: OutfitVerdict;
  /** Pièces déjà en fabrication pour lui sur cet emplacement. */
  queued: number;
}

const VERDICT_ORDER: Record<OutfitVerdict, number> = { empty: 0, up: 1, same: 2, down: 3 };

/** Les objets qu'on peut fondre pour `target`, dans l'ordre CONSEILLÉ (v0.881, demandé :
 *  « création plus rapide ») : d'abord ceux qui donnent la pièce AU RANG de l'aventurier,
 *  sur un emplacement vide, puis ceux qui battent la pièce portée, en sacrifiant l'objet le
 *  moins précieux ; les objets trop bas passent à la fin. `items` = les candidats déjà filtrés
 *  (ni 🔒, ni porté, ni familier). ⚠️ `worn` = ce que `wornGear` retient pour lui : on
 *  compare à ce qui COMPTE au combat, jamais à un id qui ne désigne plus rien (v0.885). */
export function outfitOptions(
  items: readonly Item[],
  target: Adventurer,
  worn: readonly AdvGear[],
  forges: readonly ForgeJob[],
): OutfitOption[] {
  const lineage = lineageOf(target);
  if (!lineage) return [];
  const out: OutfitOption[] = [];
  for (const item of items) {
    const slot = outfitSlot(item.slot);
    if (!slot || item.locked) continue;
    const def = LINEAGE_GEAR[lineage].pieces[slot];
    const rank = outfitRank(item, target);
    const current = worn.find((g) => g.slot === slot);
    const diff = current ? RARITY_RANK[rank] - RARITY_RANK[current.rarity] : 0;
    out.push({
      item,
      slot,
      name: def.name,
      emoji: def.emoji,
      rank,
      capped: rank !== advRarity(target),
      emptySlot: !current,
      ...(current ? { current } : {}),
      verdict: !current ? 'empty' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
      queued: forges.filter((f) => f.advId === target.id && f.piece.slot === slot).length,
    });
  }
  // Rang décroissant : une pièce plafonnée par un objet trop bas a un rang inférieur à celui de
  // la classe, donc elle passe d'elle-même après les autres.
  return out.sort(
    (a, b) =>
      RARITY_RANK[b.rank] - RARITY_RANK[a.rank] ||
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      RARITY_RANK[a.item.rarity] - RARITY_RANK[b.item.rarity] ||
      a.item.level - b.item.level,
  );
}

/** Quand une nouvelle fabrication se terminerait : les pièces se font l'une APRÈS l'autre. */
export function nextForgeUntil(forges: readonly ForgeJob[], now: number, level: number): number {
  const start = forges.reduce((m, f) => Math.max(m, f.until), now);
  return start + outfitterMsFor(level);
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
  return rollAdvGear(rng, {
    lineage,
    slot,
    level: target.level,
    luck,
    playerLevel,
    rank: outfitRank(item, target),
  });
}

/** Règlement de la forge : rien avant l'échéance, la pièce rejoint le STOCK une fois
 *  prête. ⚠️ Pur et idempotent (même patron que `settleTraining`) : appelable à chaque
 *  tick sans rien dupliquer, et rend le MÊME objet si rien ne change — c'est ce qui dit à
 *  l'appelant s'il doit persister. */
export function settleOutfit(state: AdvGearState, now: number): AdvGearState {
  const due = state.forges.filter((f) => f.until <= now);
  if (!due.length) return state;
  return {
    stock: [...state.stock, ...due.map((f) => ({ ...f.piece, id: `forge-${f.until}-${f.advId}` }))],
    forges: state.forges.filter((f) => f.until > now),
  };
}

/** Ce qu'une fabrication en lot va faire : une pièce par emplacement, et l'addition. */
export interface OutfitBatch {
  jobs: OutfitOption[];
  gold: number;
}

/**
 * ⚒️ TOUT ÉQUIPER pour UN aventurier (demandé) : remplir ses emplacements VIDES, et
 * remplacer ce qu'il porte quand on peut faire MIEUX (« s'il porte du bronze et qu'il est
 * passé argent, on crée de quoi remplacer »).
 *
 * ⚠️ AUCUNE RÈGLE NOUVELLE : on balaie `outfitOptions`, déjà trié dans l'ordre conseillé
 * (rang le plus haut, puis emplacement vide avant amélioration, puis l'objet le MOINS
 * précieux à sacrifier). Le premier candidat rencontré pour un emplacement est donc le bon,
 * et une seconde heuristique ici finirait par contredire la liste que l'écran affiche.
 *
 * ⚠️ `same` et `down` sont ÉCARTÉS : refaire une pièce de rang égal ou inférieur détruit un
 * objet et coûte de l'or pour rien.
 *
 * ⚠️ UN OBJET NE SERT QU'UNE FOIS, et un emplacement déjà EN FILE n'est pas repris — sans
 * quoi le lot commanderait deux fois la même pièce, ou fondrait un objet déjà promis.
 */
export function planOutfitBatch(
  items: readonly Item[],
  target: Adventurer,
  worn: readonly AdvGear[],
  forges: readonly ForgeJob[],
): OutfitBatch {
  const jobs: OutfitOption[] = [];
  const takenSlots = new Set<AdvGearSlot>();
  const takenItems = new Set<string>();
  for (const o of outfitOptions(items, target, worn, forges)) {
    if (o.verdict !== 'empty' && o.verdict !== 'up') continue;
    if (o.queued > 0 || takenSlots.has(o.slot) || takenItems.has(o.item.id)) continue;
    takenSlots.add(o.slot);
    takenItems.add(o.item.id);
    jobs.push(o);
  }
  return { jobs, gold: jobs.reduce((s, o) => s + outfitGoldCost(o.rank, target.level), 0) };
}

export function advGearSellValue(g: AdvGear): number {
  return Math.max(1, Math.round(sellValueOf(g.rarity, g.roll, g.level) * ADV_GEAR.sellK));
}
