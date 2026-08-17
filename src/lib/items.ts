// items.ts — équipement RPG (Phase 2c). RÈGLE : l'équipement ne donne PAS de
// stats (elles viennent du sport) — il donne des EFFETS de gameplay. Pur/testable.
import { playerCombatant, type Combatant } from './combat';
import type { FamiliarSpecies } from '@/data/familiars';
import { PROCEDURAL } from '@/lib/proceduralContent';

// `familiar` = 5ᵉ emplacement PARALLÈLE (compagnon) : compté par aggregateEffects
// mais EXCLU de SLOTS (donc des drops normaux / sets / forge). Cf. src/data/familiars.ts.
export type ItemSlot = 'weapon' | 'armor' | 'accessory' | 'relic' | 'familiar';
export const FAMILIAR_SLOT: ItemSlot = 'familiar';
// « divin » = 5ᵉ rareté au-dessus de légendaire : 1 stat TRÈS puissante, très rare
// au drop, infusable mais coûteuse. (Le légendaire garde l'adjectif « mythique ».)
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'divin';

// Effets « signature » (un par objet). value en points de %. RÈGLE : tous les
// effets doivent GRANDIR avec le niveau de l'objet (pas d'effet « drapeau »
// binaire — ils ne récompenseraient pas la montée en niveau).
export type EffectType =
  | 'damage_pct' // arme : + dégâts
  | 'crit_pct' // arme/relique : + chance de critique
  | 'lifesteal_pct' // arme : vol de vie
  | 'dmg_reduction_pct' // armure : dégâts reçus réduits
  | 'max_pv_pct' // armure : + PV max
  | 'gold_pct' // accessoire : + or gagné
  // Effets SIGNATURE (conditionnels, débloqués tard → nouveauté de haut niveau).
  | 'execute_pct' // arme : + dégâts quand l'ennemi est bas (< 25 % PV)
  | 'rage_pct' // relique : + dégâts quand TU es bas (< 30 % PV)
  | 'momentum_pct' // arme : + dégâts par coup consécutif porté (cumul)
  | 'thorns_pct'; // armure : renvoie une part des dégâts reçus à l'attaquant (épines)

export interface ItemEffect {
  type: EffectType;
  value: number; // %
}

export interface Item {
  id: string;
  slot: ItemSlot;
  name: string;
  emoji: string;
  rarity: Rarity;
  level: number; // niveau ACTUEL (monté via la Poussière d'évolution, ≤ niveau du joueur)
  baseLevel: number; // niveau à l'obtention (drop) → sert au remboursement au recyclage
  effect: ItemEffect; // effet UNIQUE. value = magnitude de BASE (niv.1) ; grandit avec le niveau
  effect2?: ItemEffect; // LEGACY : anciens objets 2-stats (les nouveaux n'en ont plus) — encore appliqué
  setId?: string; // appartenance à un SET (bonus à 2/3/4 pièces) — cf. ITEM_SETS
  locked?: boolean; // 🔒 protégé : exclu de la casse/vente (en masse ET individuelle)
  species?: string; // slot 'familiar' uniquement : id de la RACE (cf. FAMILIAR_SPECIES)
  roll?: number; // qualité du roll de l'effet principal (0..1 dans la bande ±20 %) → étoiles
}

// Qualité de roll → nombre d'ÉTOILES (1..5) : où l'effet est tombé dans la bande de
// variance ±20 %. 5★ = roll quasi max (proche du +20 %), 1★ = bas de fourchette.
// Aide le joueur à juger « bon roll ou pas » sans calcul.
export function rollStars(roll: number | undefined): number {
  if (roll == null) return 0; // objet legacy sans roll → pas d'étoiles
  return Math.min(5, 1 + Math.floor(Math.max(0, Math.min(1, roll)) * 5));
}
// Multiplicateur de qualité DISCRET par palier d'étoiles (1-5). Les paliers sont
// espacés de 0,08 → les intervalles de stats NE SE CHEVAUCHENT PAS : à rareté/niveau
// égaux, un 1★ a strictement moins qu'un 2★, etc. (fini « 2 qualités très différentes,
// mêmes stats »). La qualité est figée au drop puis suit le niveau (effectiveValue).
export function starQualityMult(stars: number): number {
  const s = Math.min(5, Math.max(1, Math.round(stars)));
  return 0.8 + (s - 0.5) * 0.08; // 1★ 0,84 · 2★ 0,92 · 3★ 1,00 · 4★ 1,08 · 5★ 1,16
}

// L'effet grandit de +5 % de la base par niveau au-dessus de 1. Pente VOLONTAIREMENT
// douce (2026‑08‑08) : le gear reste un GATE progressif (plus j'ai de bon gear,
// plus mon % monte) et n'explose pas en multiplicateur ×2 qui trivialise les boss.
export function itemLevelMult(level: number): number {
  return 1 + Math.max(0, level - 1) * 0.05;
}

// CHASSE AU LOOT (2026‑08‑15, ticket 355753d2) : la MAGNITUDE DE BASE d'un drop
// croît avec le niveau du DONJON/palier où il tombe → un objet d'un donjon profond
// est objectivement meilleur (une fois les deux infusés) qu'un objet peu profond →
// on veut remplacer son stuff en farmant plus profond. L'infusion (niveau) reste la
// grinde ; la SOURCE fixe le plafond de qualité. Modeste (~+1,5×/niv de fond) pour
// ne pas casser l'équilibrage nu.
const MAGNITUDE_PER_LEVEL = 0.015;
export function dropMagnitude(dropLevel: number): number {
  return 1 + Math.max(0, dropLevel - 1) * MAGNITUDE_PER_LEVEL;
}
/** Valeur réelle d'un effet au niveau de l'objet. */
export function effectiveValue(effect: ItemEffect, level: number): number {
  return Math.max(1, Math.round(effect.value * itemLevelMult(level)));
}

// ── Économie d'objets : Poussière (évolution) & or (vente) ──
const DUST_BY_RARITY: Record<Rarity, number> = {
  common: 5,
  rare: 12,
  epic: 25,
  legendary: 50,
  divin: 100,
};
const GOLD_BY_RARITY: Record<Rarity, number> = {
  common: 10,
  rare: 25,
  epic: 60,
  legendary: 140,
  divin: 300,
};
// Le coût d'amélioration monte avec la rareté (un divin = puits plus profond).
// ADOUCI pour la refonte « C » (infusion = progression verticale obligatoire, plus
// un luxe optionnel) : sans ça, tout monter à son niveau serait un mur de grind.
const RARITY_COST_MULT: Record<Rarity, number> = {
  common: 1,
  rare: 1.3,
  epic: 1.6,
  legendary: 2.2,
  divin: 3.5,
};

/** Coût en poussière pour passer du niveau `level` au suivant, selon la rareté.
 *  Base DIVISÉE PAR 2 (refonte C) : `5 + level*3` (vs `10 + level*6`). */
export function upgradeCost(level: number, rarity: Rarity): number {
  return Math.round((5 + level * 3) * RARITY_COST_MULT[rarity]);
}
/** Coût TOTAL pour construire un objet du niveau 1 jusqu'à `level` (sous C, tout
 *  drop part du niveau 1). Sert au recyclage history-independent + à l'affichage. */
export function fullInfuseCost(level: number, rarity: Rarity): number {
  let sum = 0;
  for (let k = 1; k < level; k++) sum += upgradeCost(k, rarity);
  return sum;
}
/** Coût pour infuser un objet de son niveau ACTUEL jusqu'au cap `playerLevel`. */
export function infuseToMaxCost(it: Item, playerLevel: number): number {
  let sum = 0;
  for (let k = it.level; k < playerLevel; k++) sum += upgradeCost(k, it.rarity);
  return sum;
}
/** Poussière déjà investie dans un objet (des niveaux payés : baseLevel → level). */
export function investedDust(it: Item): number {
  let sum = 0;
  for (let k = it.baseLevel ?? 1; k < it.level; k++) sum += upgradeCost(k, it.rarity);
  return sum;
}
// Fraction de poussière rendue au recyclage (le reste = sink permanent). Bouton
// d'équilibrage : baisser = poussière plus rare.
const REFUND_RATE = 0.5;
/** Casser un objet → base de rareté + une FRACTION du coût de construction 1→niveau.
 *  HISTORY-INDEPENDENT (refonte C) : ne dépend QUE de rareté + niveau actuel, donc un
 *  objet DROPPÉ au niv.N se recycle comme un niv.1 INFUSÉ →N (fin de l'incohérence).
 *  Faucet-free car tout drop part du niveau 1 (coût(1→1)=0). */
export function salvageValue(it: Item): number {
  return DUST_BY_RARITY[it.rarity] + Math.round(REFUND_RATE * fullInfuseCost(it.level, it.rarity));
}
/** Or obtenu en vendant un objet. */
export function sellValue(it: Item): number {
  return GOLD_BY_RARITY[it.rarity] + (it.level - 1) * 8;
}
/** Peut-on améliorer cet objet ? (poussière suffisante + pas au plafond). */
export function canUpgrade(it: Item, dust: number, playerLevel: number): boolean {
  return it.level < playerLevel && dust >= upgradeCost(it.level, it.rarity);
}

export type Equipped = Partial<Record<ItemSlot, Item>>;

// Récompense « au choix » d'un boss : 3 candidats tirés, le joueur en garde 1.
export type RewardCandidate =
  | { kind: 'item'; item: Item }
  | { kind: 'gold'; gold: number; dust: number };
export interface PendingReward {
  source: string; // ex. 'boss:dragon_primordial' (traçabilité)
  candidates: RewardCandidate[];
}

export const SLOTS: ItemSlot[] = ['weapon', 'armor', 'accessory', 'relic'];
export const SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: 'Arme',
  armor: 'Armure',
  accessory: 'Accessoire',
  relic: 'Relique',
  familiar: 'Familier',
};
export const SLOT_EMOJI: Record<ItemSlot, string> = {
  weapon: '⚔️',
  armor: '🛡️',
  accessory: '💍',
  relic: '🔮',
  familiar: '🐾',
};
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
  divin: 'Divin',
};

// Rang de rareté (0..4) pour comparer deux objets (potentiel à niveau égal).
export const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  divin: 4,
};

// Multiplicateur de magnitude par rareté. Hautes raretés ABAISSÉES (2026‑08‑12) :
// l'écart nu→équipé était trop grand (un loadout légendaire faisait sauter ~2 tiers
// de contenu → un bas niveau battait du contenu très au-dessus). Voir simulation.
const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  rare: 1.5,
  epic: 2.1,
  legendary: 2.8,
  divin: 3.8,
};

// Effet possible par slot + valeur de base (avant rareté/niveau).
// Niveau minimum pour qu'une stat « exotique » puisse tomber sur un drop (pool
// progressif) : le début est simple (dégâts/PV/or), la profondeur ajoute crit,
// vol de vie puis réduction. Les stats absentes d'ici tombent dès le niveau 1.
const EFFECT_MIN_LEVEL: Partial<Record<EffectType, number>> = {
  crit_pct: 5,
  lifesteal_pct: 8,
  dmg_reduction_pct: 10,
  // Effets SIGNATURE : débloqués TARD → il reste des choses à découvrir passé le
  // niv.10 (le pool basique se tarissait sinon). Rares (haut niveau de donjon).
  execute_pct: 12,
  momentum_pct: 18,
  rage_pct: 15,
  thorns_pct: 9, // épines : build défensif « qui pique » → débloqué en profondeur
};

const SLOT_EFFECTS: Record<ItemSlot, { type: EffectType; base: number }[]> = {
  weapon: [
    { type: 'damage_pct', base: 8 },
    { type: 'crit_pct', base: 4 },
    { type: 'lifesteal_pct', base: 6 },
    { type: 'execute_pct', base: 12 }, // signature : achève les ennemis bas
    { type: 'momentum_pct', base: 3 }, // signature : monte en puissance dans le combat
  ],
  armor: [
    { type: 'dmg_reduction_pct', base: 6 },
    { type: 'max_pv_pct', base: 10 },
    { type: 'thorns_pct', base: 12 }, // épines : renvoie des dégâts (build tanky offensif)
  ],
  // L'accessoire roule un effet de COMBAT (l'or ne servait à rien en combat → un
  // accessoire +or était un slot « mort », personne ne le prenait ; retiré).
  accessory: [
    { type: 'crit_pct', base: 5 },
    { type: 'lifesteal_pct', base: 5 },
    { type: 'dmg_reduction_pct', base: 5 },
  ],
  relic: [
    { type: 'crit_pct', base: 6 },
    { type: 'max_pv_pct', base: 8 },
    { type: 'rage_pct', base: 12 }, // signature : fureur quand tu es au bord de la mort
  ],
  // Familier : l'effet vient de la RACE (cf. rollFamiliar), pas de ce pool (jamais
  // tiré par pick(rng, SLOTS)). Entrée requise par le type Record<ItemSlot,…>.
  familiar: [{ type: 'damage_pct', base: 6 }],
};

/** Effets réellement disponibles pour un slot À CE NIVEAU (pool progressif — les
 *  effets exotiques/signature ne se débloquent qu'en profondeur via EFFECT_MIN_LEVEL).
 *  Fallback PV si rien n'est débloqué. Partagé par rollDrop / forge / reroll. */
function availableEffects(slot: ItemSlot, level: number): { type: EffectType; base: number }[] {
  const avail = SLOT_EFFECTS[slot].filter((e) => (EFFECT_MIN_LEVEL[e.type] ?? 1) <= level);
  return avail.length ? avail : [{ type: 'max_pv_pct', base: 6 }];
}

// Noms ÉVOCATEURS des objets à effet signature (« légendaires nommés » → le drop
// devient un événement, pas un « Lame mythique » de plus).
const SIGNATURE_NAMES: Partial<Record<EffectType, string[]>> = {
  execute_pct: ['Guillotine', 'Couperet du Bourreau', 'Faux des Âmes'],
  momentum_pct: ['Déferlante', 'Crescendo', 'Élan Implacable'],
  rage_pct: ['Cœur du Berserk', 'Fureur Écarlate', 'Rage du Damné'],
};

// Noms d'objets par slot (saveur).
const NAMES: Record<ItemSlot, string[]> = {
  weapon: ['Lame', 'Hache', 'Masse', 'Dague', 'Fléau'],
  armor: ['Plastron', 'Cotte', 'Cuirasse', 'Harnois'],
  accessory: ['Anneau', 'Amulette', 'Talisman', 'Bracelet'],
  relic: ['Éclat', 'Totem', 'Sceau', 'Idole'],
  familiar: ['Compagnon'], // nom réel = nom de la race (cf. rollFamiliar)
};
const RARITY_ADJ: Record<Rarity, string> = {
  common: 'usé',
  rare: 'affûté',
  epic: 'runique',
  legendary: 'mythique',
  divin: 'divin',
};

/** Libellé de l'effet à un niveau d'objet donné (valeur réelle). */
export function effectLabel(e: ItemEffect, level = 1): string {
  const v = effectiveValue(e, level);
  switch (e.type) {
    case 'damage_pct':
      return `+${v}% dégâts`;
    case 'crit_pct':
      return `+${v}% critique`;
    case 'lifesteal_pct':
      return `+${v}% vol de vie`;
    case 'dmg_reduction_pct':
      return `−${v}% dégâts reçus`;
    case 'max_pv_pct':
      return `+${v}% PV`;
    case 'gold_pct':
      return `+${v}% or`;
    case 'execute_pct':
      return `+${v}% dégâts (ennemi < 25% PV)`;
    case 'rage_pct':
      return `+${v}% dégâts (toi < 30% PV)`;
    case 'momentum_pct':
      return `+${v}% dégâts/coup (cumul)`;
    case 'thorns_pct':
      return `renvoie ${v}% des dégâts reçus`;
  }
}

/** Puissance indicative d'un objet (2 stats au niveau courant) → compare deux objets. */
export function itemScore(it: Item): number {
  return (
    effectiveValue(it.effect, it.level) + (it.effect2 ? effectiveValue(it.effect2, it.level) : 0)
  );
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// `luck` 0..1 décale progressivement les seuils vers le haut (donjons durs +
// fiole de chance). 0 = odds de base, 1 = très généreux.
// `commonDecay` 0..1 fait FONDRE les communs au profit des rares SANS toucher aux
// paliers du haut (épique/légendaire/divin restent pilotés par `luck` → l'équilibre
// boss/itémisation calibré est préservé). 0 = ~60 % commun ; 1 = ~18 % commun.
// Les communs ne disparaissent JAMAIS totalement (part de rare plafonnée à 0,85).
export function rollRarity(rng: () => number, luck = 0, commonDecay = 0): Rarity {
  const l = Math.min(1, Math.max(0, luck));
  const d = Math.min(1, Math.max(0, commonDecay));
  const r = rng();
  // Rareté AVARE en bas (début de partie = surtout du commun, un peu de rare), et
  // pilotée par la `luck` (= profondeur du donjon) pour le haut du panier : l'épique+
  // devient une chasse de mi/fin de partie, pas une pluie dès les premiers donjons.
  // Bases (luck 0) : divin 0,2 % · légendaire 0,8 % · épique 4 % · rare ~20 % · commun ~75 %.
  if (r < 0.002 + l * 0.02) return 'divin'; // 0,2 % → 2,2 % à luck max
  if (r < 0.01 + l * 0.08) return 'legendary';
  if (r < 0.05 + l * 0.22) return 'epic'; // 5 % → 27 % (band luck-dépendant)
  if (r < Math.min(0.85, 0.25 + l * 0.35 + d * 0.42)) return 'rare';
  return 'common';
}

/** Facteur de décroissance des communs selon le NIVEAU du contenu (donjon). Bas
 *  niveau = communs pleins (~60 %) ; haut niveau = communs rares (~18 %). Partagé
 *  par rollDrop et le miroir d'affichage des odds. */
export function commonDecayForLevel(level: number): number {
  return Math.min(1, Math.max(0, (level - 2) / 22));
}

/**
 * Tire un butin après un run de donjon. Renvoie l'objet SANS id (l'appelant en
 * pose un), ou null si pas de drop.
 * RÈGLE (2026‑08‑08) : le niveau du drop est fixé par le DONJON, **découplé du
 * niveau du joueur** — un perso niv.10 dans un donjon niv.1 ne trouve QUE du
 * niv.1 (on monte ensuite les objets à la Poussière). Les drops peuvent même
 * tomber un peu SOUS le niveau du donjon (`spread`) → fourrage à améliorer ; le
 * niveau plein d'un palier ne s'obtient qu'auprès des BOSS (cf. rollSetPiece).
 *  - `level` : niveau de base de l'objet (selon le donjon) ;
 *  - `spread` : combien de niveaux SOUS `level` le drop peut descendre (0 = pile au niveau) ;
 *  - `luck` : biais de rareté (donjon + fiole de chance), 0..1.
 */
export function rollDrop(
  rng: () => number,
  opts: {
    cleared: boolean;
    defeated: number;
    level?: number;
    spread?: number;
    luck?: number;
    rollFloor?: number; // 0..1 : plancher de qualité de roll (Autel des boss) → meilleures étoiles
  },
): Omit<Item, 'id'> | null {
  if (opts.defeated <= 0) return null;
  const chance = opts.cleared ? 0.6 : 0.3;
  if (rng() >= chance) return null;

  const slot = pick(rng, SLOTS);
  const lvl = opts.level ?? 1;
  // Les communs REVIENNENT (plus de couperet niv.5), mais fondent PROGRESSIVEMENT
  // avec le niveau du donjon (`commonDecay`) → plus on farme profond, moins de gris.
  const rarity = rollRarity(rng, opts.luck ?? 0, commonDecayForLevel(lvl));
  // Pool de stats PROGRESSIF : au début, seules les stats basiques (dégâts/PV)
  // tombent ; les stats exotiques se débloquent en montant (cf. EFFECT_MIN_LEVEL).
  const pool = availableEffects(slot, lvl);
  const chosen = pick(rng, pool);
  // value = magnitude de BASE : rareté × magnitude du DONJON (deeper = meilleur
  // objet, chasse au loot) × VARIANCE de roll ±20 % (farmer un bon roll a du sens).
  const mag = dropMagnitude(lvl);
  // QUALITÉ EN ÉTOILES : on tire une qualité brute (avec plancher `rollFloor` de
  // l'Autel des boss), on en déduit le PALIER d'étoiles, puis un multiplicateur
  // DISCRET (starQualityMult) → les intervalles de stats par étoile ne se chevauchent
  // pas (un 1★ ≠ un 2★ à rareté/niveau égaux).
  const rqFloor = Math.min(1, Math.max(0, opts.rollFloor ?? 0));
  const q = rqFloor + (1 - rqFloor) * rng();
  const stars = rollStars(q);
  const vf = starQualityMult(stars);
  const rollValue = (b: number, v: number = vf) =>
    Math.max(1, Math.round(b * RARITY_MULT[rarity] * mag * v));
  const value = rollValue(chosen.base, vf);
  // Objet à effet SIGNATURE → nom évocateur (« Guillotine ») ; sinon nom + adjectif.
  const sigNames = SIGNATURE_NAMES[chosen.type];
  const name = sigNames ? pick(rng, sigNames) : `${pick(rng, NAMES[slot])} ${RARITY_ADJ[rarity]}`;
  // REFONTE C : tout drop part du NIVEAU 1 (identité pure = rareté + affixe). Toute
  // la puissance se construit ensuite à la poussière jusqu'au niveau du joueur. Le
  // niveau du CONTENU (opts.level) n'agit plus que sur la RARETÉ (commonDecay) et le
  // POOL d'affixes (availableEffects ci-dessus), pas sur le niveau de l'objet.
  const level = 1;
  // PAYOFF DIVIN : la 5ᵉ rareté roule un DEUXIÈME effet (distinct) → un divin est
  // enfin « waouh » (double affixe), pas juste un ×5 de magnitude sur une stat.
  let effect2: ItemEffect | undefined;
  if (rarity === 'divin') {
    const others = pool.filter((e) => e.type !== chosen.type);
    if (others.length) {
      const second = pick(rng, others);
      effect2 = { type: second.type, value: rollValue(second.base) };
    }
  }
  return {
    slot,
    name,
    emoji: SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosen.type, value }, // 1 stat (le set fait la synergie) — sauf divin (2 effets)
    ...(effect2 ? { effect2 } : {}),
    roll: Math.round(((vf - 0.8) / 0.4) * 100) / 100,
  };
}

/**
 * Tire une PIÈCE DE SET pour une victoire de boss. Toujours une pièce (drop
 * garanti), au niveau PLEIN du palier du boss. **Anti-doublon (pity)** : si
 * `preferSlot` est fourni (un slot du set que le joueur n'a pas encore), on le
 * force → on complète le set avant de risquer un doublon ; sinon slot aléatoire.
 */
export function rollSetPiece(
  rng: () => number,
  opts: { setId: string; level: number; luck?: number; preferSlot?: ItemSlot; rollFloor?: number },
): Omit<Item, 'id'> {
  const set = SET_BY_ID[opts.setId];
  const slot = opts.preferSlot ?? pick(rng, SLOTS);
  // Rareté RARE → LÉGENDAIRE (2026‑08‑16) : les sets couvrent désormais 3 raretés
  // (plus « épique/lég uniquement ») → on trouve régulièrement mieux, la satisfaction
  // de renouveler son stuff. Pondérée par la `luck` (palier/fiole → plus haut).
  const luck = opts.luck ?? 0;
  const rr = rng();
  const rarity: Rarity = rr < 0.15 + luck * 0.4 ? 'legendary' : rr < 0.55 + luck * 0.25 ? 'epic' : 'rare';
  const chosen = pick(rng, SLOT_EFFECTS[slot]);
  // Qualité EN ÉTOILES (multiplicateur discret, non chevauchant), comme les drops.
  // `rollFloor` (Autel des boss) relève le plancher de qualité → meilleures étoiles.
  const rqFloor = Math.min(1, Math.max(0, opts.rollFloor ?? 0));
  const q = rqFloor + (1 - rqFloor) * rng();
  const vf = starQualityMult(rollStars(q));
  const value = Math.max(1, Math.round(chosen.base * RARITY_MULT[rarity] * dropMagnitude(opts.level) * vf));
  const noun = pick(rng, NAMES[slot]);
  const level = 1; // REFONTE C : la pièce de set arrive niv.1 (identité) → à infuser
  return {
    slot,
    name: set ? `${noun} · ${set.name}` : `${noun} ${RARITY_ADJ[rarity]}`,
    emoji: set ? set.emoji : SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosen.type, value }, // 1 stat + la synergie de set (bonus 2/3/4 pièces)
    ...(set ? { setId: opts.setId } : {}),
    roll: Math.round(((vf - 0.8) / 0.4) * 100) / 100,
  };
}

// ── Familiers (compagnons) — slot parallèle, monté aux PIERRES MAGIQUES 💎 ──

/** `true` si l'objet est un familier (slot compagnon). */
export function isFamiliar(it: Item | null | undefined): boolean {
  return !!it && it.slot === FAMILIAR_SLOT;
}

/** Coût en PIERRES MAGIQUES pour monter un familier du niveau `level` au suivant
 *  (plus cher que la poussière d'un objet : les pierres sont rares). Cap = niveau joueur. */
export function familiarStoneCost(level: number, rarity: Rarity): number {
  return Math.round((3 + level * 2) * RARITY_COST_MULT[rarity]);
}

// Ordre des raretés (fusion : 3 d'une rareté → 1 de la rareté juste au-dessus).
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'divin'];
/** Rareté juste au-dessus, ou `null` si déjà au maximum (divin). */
export function nextRarity(r: Rarity): Rarity | null {
  const i = RARITY_ORDER.indexOf(r);
  return i >= 0 && i < RARITY_ORDER.length - 1 ? RARITY_ORDER[i + 1]! : null;
}

// Effets SIGNATURE possibles sur un familier (2ᵉ effet conditionnel, en plus du bonus
// de race). Bases modestes → une cerise, pas un doublon d'objet ; grandit à l'infusion.
const FAMILIAR_SIGNATURE: { type: EffectType; base: number }[] = [
  { type: 'execute_pct', base: 10 },
  { type: 'rage_pct', base: 10 },
  { type: 'momentum_pct', base: 3 },
];
// Chance de rouler un effet signature selon la rareté : nulle en commun, croissante
// jusqu'au divin → un familier SIGNATURE est une trouvaille désirable (« option »).
const FAMILIAR_SIG_CHANCE: Record<Rarity, number> = {
  common: 0,
  rare: 0.1,
  epic: 0.22,
  legendary: 0.4,
  divin: 0.65,
};

/** Tire un FAMILIER d'une race donnée. L'effet = le bonus de la race, magnitude
 *  variable (rareté × niveau × variance ±20 %), comme un objet. En plus, selon la
 *  rareté, une CHANCE de rouler un effet SIGNATURE (execute/rage/momentum) en `effect2`
 *  → familier « buff constant + option signature ». `opts.rarity` force la rareté
 *  (fusion) ; sinon tirée au hasard. Pur/testable. */
export function rollFamiliar(
  rng: () => number,
  species: FamiliarSpecies,
  opts: { level: number; luck?: number; rarity?: Rarity },
): Omit<Item, 'id'> {
  const rarity = opts.rarity ?? rollRarity(rng, opts.luck ?? 0);
  const value = Math.max(1, Math.round(species.base * RARITY_MULT[rarity] * (0.8 + rng() * 0.4)));
  const level = 1; // REFONTE C : le familier arrive niv.1 (identité de race) → à infuser
  let effect2: ItemEffect | undefined;
  if (rng() < FAMILIAR_SIG_CHANCE[rarity]) {
    const sig = FAMILIAR_SIGNATURE[Math.floor(rng() * FAMILIAR_SIGNATURE.length)]!;
    effect2 = { type: sig.type, value: Math.max(1, Math.round(sig.base * RARITY_MULT[rarity] * (0.8 + rng() * 0.4))) };
  }
  return {
    slot: FAMILIAR_SLOT,
    name: species.name,
    emoji: species.emoji,
    rarity,
    level,
    baseLevel: level,
    effect: { type: species.effect, value },
    ...(effect2 ? { effect2 } : {}),
    species: species.id,
  };
}

// ── Atelier de poussière (dust sinks) : forge / reroll / craft de set ──
// (La SUBLIMATION de rareté a été retirée le 2026‑08‑10 : trop puissante — elle
// permettait de fabriquer du divin bien avant d'y avoir droit. La rareté ne monte
// plus que par les DROPS/forge, pas au craft.)

// Coûts de l'atelier VOLONTAIREMENT élevés (2026‑08‑10) : la poussière s'accumule
// vite (farm) → sans un vrai coût, on forge à l'infini. Base + composante NIVEAU +
// facteur de RARETÉ quasi-exponentiel (`rerollCost`) → altérer reste un investissement.
const RARITY_STEP: Record<number, number> = { 0: 1, 1: 2, 2: 3.5, 3: 6, 4: 10 };

// A. FORGE — créer un objet neuf. Ciblé (choisir l'emplacement) = plus cher que l'aléatoire.
export function forgeCost(level: number, targeted: boolean): number {
  const base = 50 + Math.max(1, level) * 20;
  return targeted ? Math.round(base * 1.8) : base;
}
export function forgeItem(
  rng: () => number,
  opts: { level: number; slot?: ItemSlot; luck?: number },
): Omit<Item, 'id'> {
  const slot = opts.slot ?? pick(rng, SLOTS);
  const level = Math.max(1, Math.round(opts.level));
  // Rareté : décroissance des communs selon le NIVEAU (comme les drops) → forger à
  // haut niveau ne donne plus quasi que du commun (bug : forge = commun à répétition).
  const rarity = rollRarity(rng, opts.luck ?? 0.25, commonDecayForLevel(level));
  const chosen = pick(rng, availableEffects(slot, level));
  const value = Math.max(1, Math.round(chosen.base * RARITY_MULT[rarity]));
  return {
    slot,
    name: `${pick(rng, NAMES[slot])} forgé`,
    emoji: SLOT_EMOJI[slot],
    rarity,
    level,
    baseLevel: level,
    effect: { type: chosen.type, value },
  };
}

// B. REROLL d'effet — change la stat (même rareté/niveau), un autre effet du slot.
export function rerollCost(item: Item): number {
  return Math.round((40 + item.level * 15) * (RARITY_STEP[RARITY_RANK[item.rarity]] ?? 1));
}
// Reroll de QUALITÉ (étoiles) : re-tire la QUALITÉ de l'objet en gardant le TYPE
// d'effet, la RARETÉ et le NIVEAU. Ne touche JAMAIS la rareté → aucun risque de perdre
// un divin ; sert à retenter une meilleure qualité (ex. un 1★). On rescale la valeur
// par le rapport des multiplicateurs de qualité (préserve base × rareté × magnitude),
// et on met à jour `roll` → les étoiles restent cohérentes avec la valeur.
export function rerolledQuality(
  rng: () => number,
  item: Item,
): { effect: ItemEffect; effect2?: ItemEffect; roll: number } {
  const oldStars = rollStars(item.roll);
  const oldVf = oldStars ? starQualityMult(oldStars) : 1; // legacy sans roll → base
  const stars = rollStars(rng());
  const newVf = starQualityMult(stars);
  const ratio = newVf / oldVf;
  const scale = (e: ItemEffect): ItemEffect => ({
    type: e.type,
    value: Math.max(1, Math.round(e.value * ratio)),
  });
  return {
    effect: scale(item.effect),
    ...(item.effect2 ? { effect2: scale(item.effect2) } : {}),
    roll: Math.round(((newVf - 0.8) / 0.4) * 100) / 100,
  };
}

// D. CRAFT de pièce de set ciblée — coût élevé (réutilise rollSetPiece pour l'objet).
export function craftSetCost(level: number): number {
  return 300 + Math.max(1, level) * 60;
}

export interface AggregatedEffects {
  damagePct: number;
  critAdd: number; // fraction 0..1
  dodgeAdd: number; // fraction 0..1
  lifesteal: number; // fraction
  dmgReduction: number; // fraction, plafonnée
  maxPvPct: number; // fraction
  goldPct: number; // fraction
  executePct: number; // signature : + dégâts si ennemi bas
  ragePct: number; // signature : + dégâts si joueur bas
  momentumPct: number; // signature : + dégâts/coup cumulé
  thornsPct: number; // épines : fraction des dégâts reçus renvoyée à l'attaquant
}

export function emptyEffects(): AggregatedEffects {
  return {
    damagePct: 0,
    critAdd: 0,
    dodgeAdd: 0,
    lifesteal: 0,
    dmgReduction: 0,
    maxPvPct: 0,
    goldPct: 0,
    executePct: 0,
    ragePct: 0,
    momentumPct: 0,
    thornsPct: 0,
  };
}

/** Applique une valeur (fraction) d'un EffectType donné à un agrégat. */
function applyEffect(a: AggregatedEffects, type: EffectType, v: number): void {
  switch (type) {
    case 'damage_pct':
      a.damagePct += v;
      break;
    case 'crit_pct':
      a.critAdd += v;
      break;
    case 'lifesteal_pct':
      a.lifesteal += v;
      break;
    case 'dmg_reduction_pct':
      a.dmgReduction += v;
      break;
    case 'max_pv_pct':
      a.maxPvPct += v;
      break;
    case 'gold_pct':
      a.goldPct += v;
      break;
    case 'execute_pct':
      a.executePct += v;
      break;
    case 'rage_pct':
      a.ragePct += v;
      break;
    case 'momentum_pct':
      a.momentumPct += v;
      break;
    case 'thorns_pct':
      a.thornsPct += v;
      break;
  }
}

// ── Sets d'équipement (bonus à 2 / 3 / 4 pièces) ──
// RÈGLE respectée : le bonus GRANDIT avec le niveau (moyen) des pièces du set.
// Les pièces de set droppent sur les donjons de fin (cf. dungeons.ts).
export interface SetTier {
  pieces: number; // 2, 3 ou 4
  type: EffectType;
  base: number; // magnitude de base (niveau 1), scalée par le niveau moyen des pièces
}
export interface ItemSet {
  id: string;
  name: string;
  emoji: string;
  theme: string; // résumé « coach »
  tiers: SetTier[];
}

// Un set PAR boss de palier (cf. src/data/bosses.ts). Chaque set a un pouvoir
// spécifique. Les pièces ne droppent QUE sur le boss correspondant.
// Modèle 1-STAT (2026‑08‑08) : chaque objet (donjon ou set) porte UNE stat ; le
// BONUS de set RENFORCE le thème → un set = un build focalisé et désirable. Assez
// fort pour valoir le coup, assez modéré pour qu'un légendaire de donjon (stat
// unique très élevée) puisse tenter de casser le set → vraie chasse ARPG.
const HAND_SETS: ItemSet[] = [
  {
    id: 'golem',
    name: 'Rempart du Golem',
    emoji: '🗿',
    theme: 'Le mur increvable : encaisse tout, ne tombe jamais.',
    tiers: [
      { pieces: 2, type: 'max_pv_pct', base: 8 },
      { pieces: 3, type: 'dmg_reduction_pct', base: 6 },
      { pieces: 4, type: 'max_pv_pct', base: 10 },
    ],
  },
  {
    id: 'dragon',
    name: 'Écailles du Dragon',
    emoji: '🐲',
    theme: 'Offensif : frappe fort et se soigne en tapant.',
    tiers: [
      { pieces: 2, type: 'damage_pct', base: 8 },
      { pieces: 3, type: 'crit_pct', base: 6 },
      { pieces: 4, type: 'lifesteal_pct', base: 8 },
    ],
  },
  {
    id: 'lich',
    name: 'Voile de la Liche',
    emoji: '💀',
    theme: 'Vampirique : vole la vie à chaque coup critique.',
    tiers: [
      { pieces: 2, type: 'lifesteal_pct', base: 8 },
      { pieces: 3, type: 'crit_pct', base: 6 },
      { pieces: 4, type: 'damage_pct', base: 10 },
    ],
  },
  {
    id: 'void',
    name: 'Sceau du Néant',
    emoji: '🌌',
    theme: 'Défensif-punisseur : encaisse, dure, puis frappe juste.',
    tiers: [
      { pieces: 2, type: 'max_pv_pct', base: 8 },
      { pieces: 3, type: 'dmg_reduction_pct', base: 6 },
      { pieces: 4, type: 'crit_pct', base: 10 },
    ],
  },
  {
    id: 'apocalypse',
    name: 'Braise de l’Apocalypse',
    emoji: '🔥',
    theme: 'Hybride offensif : dégâts, survie et vol de vie.',
    tiers: [
      { pieces: 2, type: 'damage_pct', base: 8 },
      { pieces: 3, type: 'max_pv_pct', base: 10 },
      { pieces: 4, type: 'lifesteal_pct', base: 10 },
    ],
  },
];
// Sets complets = écrits à la main (5 boss de palier) + PROCÉDURAUX (boss 30→100).
export const ITEM_SETS: ItemSet[] = [...HAND_SETS, ...PROCEDURAL.sets];
export const SET_BY_ID: Record<string, ItemSet> = Object.fromEntries(
  ITEM_SETS.map((s) => [s.id, s]),
);

/** Nombre de pièces équipées par set. */
export function setCounts(equipped: Equipped): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it?.setId) out[it.setId] = (out[it.setId] ?? 0) + 1;
  }
  return out;
}

/** Effets cumulés des SETS actifs (≥2 pièces), scalés par le niveau moyen des pièces.
 *  `capLevel` (optionnel) plafonne le niveau effectif des pièces au niveau du joueur. */
export function setEffects(equipped: Equipped, capLevel = Infinity): AggregatedEffects {
  const a = emptyEffects();
  const groups: Record<string, Item[]> = {};
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (it?.setId) (groups[it.setId] ??= []).push(it);
  }
  for (const [id, items] of Object.entries(groups)) {
    const def = SET_BY_ID[id];
    if (!def || items.length < 2) continue;
    const avgLvl = Math.round(
      items.reduce((s, i) => s + Math.min(i.level, capLevel), 0) / items.length,
    );
    const mult = itemLevelMult(avgLvl);
    for (const t of def.tiers) {
      if (items.length < t.pieces) continue;
      applyEffect(a, t.type, Math.max(1, Math.round(t.base * mult)) / 100);
    }
  }
  a.dmgReduction = Math.min(0.5, a.dmgReduction);
  return a;
}

// `capLevel` plafonne le niveau EFFECTIF de chaque objet au niveau du joueur (comme
// l'upgrade) → un objet sur-leveled ne donne que la puissance de TON niveau (anti
// « bas niveau en gear trop haut qui punch 3 tiers au-dessus », cf. simulation 2026‑08‑12).
export function aggregateEffects(equipped: Equipped, capLevel = Infinity): AggregatedEffects {
  const a = emptyEffects();
  for (const slot of SLOTS) {
    const it = equipped[slot];
    if (!it) continue;
    const lv = Math.min(it.level, capLevel);
    applyEffect(a, it.effect.type, effectiveValue(it.effect, lv) / 100);
    if (it.effect2) applyEffect(a, it.effect2.type, effectiveValue(it.effect2, lv) / 100);
  }
  // Familier (slot parallèle, hors SLOTS) : son bonus de race + son éventuel effet
  // SIGNATURE (effect2) comptent comme des effets.
  const fam = equipped[FAMILIAR_SLOT];
  if (fam) {
    const flv = Math.min(fam.level, capLevel);
    applyEffect(a, fam.effect.type, effectiveValue(fam.effect, flv) / 100);
    if (fam.effect2) applyEffect(a, fam.effect2.type, effectiveValue(fam.effect2, flv) / 100);
  }
  // Bonus de set (2/3/4 pièces) — ajoutés par-dessus les effets d'objet.
  const s = setEffects(equipped, capLevel);
  a.damagePct += s.damagePct;
  a.critAdd += s.critAdd;
  a.dodgeAdd += s.dodgeAdd;
  a.lifesteal += s.lifesteal;
  a.dmgReduction += s.dmgReduction;
  a.maxPvPct += s.maxPvPct;
  a.goldPct += s.goldPct;
  a.executePct += s.executePct;
  a.ragePct += s.ragePct;
  a.momentumPct += s.momentumPct;
  a.thornsPct += s.thornsPct;
  a.dmgReduction = Math.min(0.5, a.dmgReduction); // plafond 50 %
  return a;
}

/** Combattant du joueur = stats (sport) + effets de l'équipement + `extra` (talents). */
export function playerWithGear(
  name: string,
  stats: { puissance: number; endurance: number; agilite: number },
  equipped: Equipped,
  extra: Partial<AggregatedEffects> = {},
  level = 1,
): Combatant {
  const base = playerCombatant(name, stats, level);
  // Plafonne le niveau effectif du gear au niveau du joueur (anti sur-leveling).
  const e = aggregateEffects(equipped, level);
  const damagePct = e.damagePct + (extra.damagePct ?? 0);
  const maxPvPct = e.maxPvPct + (extra.maxPvPct ?? 0);
  const critAdd = e.critAdd + (extra.critAdd ?? 0);
  const dodgeAdd = e.dodgeAdd + (extra.dodgeAdd ?? 0);
  // La Défense de la Puissance se cumule à la réduction du gear (plafond 50 %).
  const dmgReduction = Math.min(0.5, (base.dmgReduction ?? 0) + e.dmgReduction + (extra.dmgReduction ?? 0));
  // Vol de vie PLAFONNÉ à 50 % (comme la réduction de dégâts) : il stacke (arme +
  // talent + set + familier) et, avec le multi-frappe, rendait le sustain quasi
  // infini. Borné → build sustain fort mais pas increvable (ticket adab525d).
  const lifesteal = Math.min(0.5, e.lifesteal + (extra.lifesteal ?? 0));
  return {
    name,
    pv: Math.round(base.pv * (1 + maxPvPct)),
    damage: Math.max(1, Math.round(base.damage * (1 + damagePct))),
    crit: Math.min(0.6, base.crit + critAdd),
    dodge: Math.min(0.4, base.dodge + dodgeAdd),
    initiative: base.initiative,
    dmgReduction,
    lifesteal,
    strikes: base.strikes ?? 1,
    execute: e.executePct + (extra.executePct ?? 0),
    rage: e.ragePct + (extra.ragePct ?? 0),
    momentum: e.momentumPct + (extra.momentumPct ?? 0),
    thorns: e.thornsPct + (extra.thornsPct ?? 0),
  };
}
