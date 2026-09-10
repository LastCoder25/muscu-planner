// adventurers.ts — les aventuriers de la Guilde : arbre de classes, stats, rang.
// Pur/testable, aucune dépendance Vue/Supabase.
//
// ⚠️ LE PRINCIPE QUI COMMANDE TOUT LE RESTE : « le sport fixe le PLAFOND, le travail
// fixe le RYTHME ». Deux freins existent — le niveau de la Guilde (donc du joueur, donc
// du sport) et l'XP que l'aventurier gagne en travaillant. Le plafond doit rester EN
// RETRAIT pour un joueur peu sportif : mesuré, avec les seuils de promotion retenus, un
// joueur d'une séance de 30 min par semaine atteint la 6e strate sur 8 en un an — il a
// donc toujours une promotion à portée. C'est l'XP gagnée en mission qui doit brider,
// jamais le plafond, sinon on lui montre une progression inatteignable.
//
// ⚠️ ON N'ÉCRIT PAS L'ARBRE, ON ÉCRIT UN VIVIER. Un arbre plein de 8 strates × 3 choix
// ferait 9 840 nœuds — inécrivable. Chaque classe porte donc des TAGS et des PRÉREQUIS,
// et les 3 propositions d'une promotion sont TIRÉES parmi les classes éligibles, de
// façon déterministe et seedée sur l'aventurier. Résultat : deux Guerriers ne reçoivent
// pas les mêmes offres et n'ont pas le même destin, pour ~35 classes écrites au lieu de
// 9 840. Les branches re-convergent naturellement (« Maître épéiste » est atteignable
// depuis Épéiste comme depuis Bretteur : on ne l'écrit qu'une fois).
import { RANK_ORDER, type EffectType, type Rarity } from './items';
import {
  characterRank,
  rankProgress,
  rankStarStr,
  nextStarLevel,
  type CharacterRank,
} from './characterRank';

/** Rôle HORS COMBAT d'une classe — le patron du chenil (faucon → renseignement,
 *  marmotte → butin) : toute la valeur d'une équipe ne passe pas par les dégâts. */
export type AdvRole = 'heal' | 'haul' | 'speed' | 'scout';

export interface AdvClass {
  id: string;
  label: string;
  emoji: string;
  /** 0..7 → la rareté de la classe vaut `RANK_ORDER[stratum]`. */
  stratum: number;
  /** Répartition du budget de la strate sur les 3 piliers (parts relatives). */
  w: { p: number; e: number; a: number };
  /** Ce que la classe APPORTE au chemin — sert de prérequis aux strates suivantes. */
  tags: string[];
  /** Tags que le chemin doit DÉJÀ porter (tous requis). Une racine n'en a aucun.
   *  ⚠️ C'est ce qui interdit de proposer « Clerc » à un Guerrier : la filiation reste
   *  lisible, et c'était la condition posée pour accepter le tirage. */
  req?: string[];
  /** Signature de combat, réservée aux strates hautes — mêmes effets que les objets
   *  légendaires, déjà appliqués par `simulateCombat`. */
  signature?: EffectType;
  role?: AdvRole;
}

/** Budget de stats d'une strate. ⚠️ ADOSSÉ AU PAS DE RARETÉ DES OBJETS (ratio 1,219,
 *  celui de `RARITY_MULT`) : une strate vaut exactement un cran de rareté, donc
 *  l'étiquette « épique » d'une classe dit la même chose que celle d'un objet. Une table
 *  écrite à la main aurait divergé au premier réglage de l'une des deux. */
export const STRATUM_BUDGET: number[] = RANK_ORDER.map((_, i) => Math.round(6 * 1.219 ** i));

/** Niveaux d'aventurier ouvrant chaque strate. Front-chargé : les 3 premières promotions
 *  tombent dans le premier mois même pour le joueur le plus léger — c'est ce qui accroche,
 *  et c'est acquis quel que soit le rythme sportif (mesuré sur 3 profils). */
export const PROMO_LEVELS: readonly number[] = [1, 2, 3, 5, 8, 12, 17, 23];

/** Poids de la montée en NIVEAU face au chemin de classes. À 0,15, un aventurier de
 *  niveau 23 vaut ×4,3 son niveau 1 — soit plus que tout l'écart de rareté. C'est
 *  délibéré : l'aventurier qu'on a élevé doit battre celui qu'on vient de recruter. */
export const ADV_LEVEL_K = 0.15;

/** Nombre de propositions à chaque promotion. */
export const PROMO_CHOICES = 3;

// ── LE VIVIER ────────────────────────────────────────────────────────────────────
export const ADV_CLASSES: AdvClass[] = [
  // ── Strate 0 — COMMUN : les racines, aucun prérequis. ──
  {
    id: 'guerrier',
    label: 'Guerrier',
    emoji: '⚔️',
    stratum: 0,
    w: { p: 4, e: 2, a: 0 },
    tags: ['melee', 'power'],
  },
  {
    id: 'archer',
    label: 'Archer',
    emoji: '🏹',
    stratum: 0,
    w: { p: 2, e: 1, a: 3 },
    tags: ['ranged', 'agile'],
    role: 'scout',
  },
  { id: 'mage', label: 'Mage', emoji: '🔮', stratum: 0, w: { p: 4, e: 0, a: 2 }, tags: ['magic'] },
  {
    id: 'homme_armes',
    label: "Homme d'armes",
    emoji: '🛡️',
    stratum: 0,
    w: { p: 1, e: 5, a: 0 },
    tags: ['melee', 'guard'],
  },
  {
    id: 'eclaireur',
    label: 'Éclaireur',
    emoji: '🧭',
    stratum: 0,
    w: { p: 1, e: 1, a: 4 },
    tags: ['agile', 'path'],
    role: 'scout',
  },
  {
    id: 'caravanier',
    label: 'Caravanier',
    emoji: '🐫',
    stratum: 0,
    w: { p: 1, e: 4, a: 1 },
    tags: ['civil', 'haul'],
    role: 'haul',
  },

  // ── Strate 1 — INHABITUEL : l'orientation. ──
  {
    id: 'epeiste',
    label: 'Épéiste',
    emoji: '🗡️',
    stratum: 1,
    w: { p: 5, e: 2, a: 0 },
    tags: ['blade', 'power'],
    req: ['melee'],
  },
  {
    id: 'brute',
    label: 'Brute',
    emoji: '💢',
    stratum: 1,
    w: { p: 3, e: 4, a: 0 },
    tags: ['heavy'],
    req: ['melee'],
  },
  {
    id: 'bretteur',
    label: 'Bretteur',
    emoji: '🐺',
    stratum: 1,
    w: { p: 3, e: 1, a: 3 },
    tags: ['blade', 'agile'],
    req: ['melee'],
  },
  {
    id: 'sergent',
    label: 'Sergent',
    emoji: '🎖️',
    stratum: 1,
    w: { p: 2, e: 5, a: 0 },
    tags: ['guard', 'heavy'],
    req: ['guard'],
  },
  {
    id: 'franc_tireur',
    label: 'Franc-tireur',
    emoji: '🎯',
    stratum: 1,
    w: { p: 3, e: 1, a: 3 },
    tags: ['ranged', 'precise'],
    req: ['ranged'],
  },
  {
    id: 'traqueur',
    label: 'Traqueur',
    emoji: '🐾',
    stratum: 1,
    w: { p: 2, e: 2, a: 3 },
    tags: ['agile', 'path'],
    req: ['agile'],
    role: 'scout',
  },
  {
    id: 'pyromancien',
    label: 'Pyromancien',
    emoji: '🔥',
    stratum: 1,
    w: { p: 6, e: 1, a: 0 },
    tags: ['magic', 'burst'],
    req: ['magic'],
  },
  {
    id: 'givreur',
    label: 'Givreur',
    emoji: '❄️',
    stratum: 1,
    w: { p: 3, e: 2, a: 2 },
    tags: ['magic', 'control'],
    req: ['magic'],
  },
  {
    id: 'clerc',
    label: 'Clerc',
    emoji: '🩺',
    stratum: 1,
    w: { p: 1, e: 4, a: 2 },
    tags: ['magic', 'care'],
    req: ['magic'],
    role: 'heal',
  },
  {
    id: 'convoyeur',
    label: 'Convoyeur',
    emoji: '🚚',
    stratum: 1,
    w: { p: 1, e: 5, a: 1 },
    tags: ['civil', 'haul'],
    req: ['civil'],
    role: 'haul',
  },
  {
    id: 'passeur',
    label: 'Passeur',
    emoji: '🗺️',
    stratum: 1,
    w: { p: 1, e: 2, a: 4 },
    tags: ['path', 'civil'],
    req: ['path'],
    role: 'speed',
  },
  {
    id: 'veneur',
    label: 'Veneur',
    emoji: '🦅',
    stratum: 1,
    w: { p: 2, e: 2, a: 4 },
    tags: ['ranged', 'path'],
    req: ['ranged'],
    role: 'scout',
  },
  {
    id: 'coursier',
    label: 'Coursier',
    emoji: '🏃',
    stratum: 1,
    w: { p: 1, e: 2, a: 5 },
    tags: ['agile', 'path'],
    req: ['agile'],
    role: 'speed',
  },
  {
    id: 'marchand',
    label: 'Marchand',
    emoji: '🪙',
    stratum: 1,
    w: { p: 1, e: 3, a: 2 },
    tags: ['civil', 'trade'],
    req: ['civil'],
    role: 'haul',
  },
  {
    id: 'muletier',
    label: 'Muletier',
    emoji: '🐴',
    stratum: 1,
    w: { p: 1, e: 4, a: 2 },
    tags: ['haul', 'path', 'civil'],
    req: ['haul'],
    role: 'haul',
  },

  // ── Strate 2 — MAGIQUE : la spécialisation. ──
  {
    id: 'duelliste',
    label: 'Duelliste',
    emoji: '🌀',
    stratum: 2,
    w: { p: 5, e: 2, a: 3 },
    tags: ['blade', 'precise'],
    req: ['blade'],
  },
  {
    id: 'chevalier',
    label: 'Chevalier',
    emoji: '🐎',
    stratum: 2,
    w: { p: 4, e: 5, a: 0 },
    tags: ['heavy', 'guard'],
    req: ['heavy'],
  },
  {
    id: 'colosse',
    label: 'Colosse',
    emoji: '🗿',
    stratum: 2,
    w: { p: 3, e: 7, a: 0 },
    tags: ['heavy', 'wall'],
    req: ['heavy'],
  },
  {
    id: 'rodeur',
    label: 'Rôdeur',
    emoji: '🍃',
    stratum: 2,
    w: { p: 3, e: 2, a: 5 },
    tags: ['agile', 'path'],
    req: ['agile'],
    role: 'scout',
  },
  {
    id: 'arbaletrier',
    label: 'Arbalétrier',
    emoji: '🎱',
    stratum: 2,
    w: { p: 5, e: 2, a: 2 },
    tags: ['ranged', 'precise'],
    req: ['ranged'],
  },
  {
    id: 'incendiaire',
    label: 'Incendiaire',
    emoji: '🌋',
    stratum: 2,
    w: { p: 7, e: 1, a: 1 },
    tags: ['burst', 'magic'],
    req: ['burst'],
  },
  {
    id: 'sorcier',
    label: 'Sorcier',
    emoji: '📿',
    stratum: 2,
    w: { p: 5, e: 2, a: 2 },
    tags: ['magic', 'control'],
    req: ['magic'],
  },
  {
    id: 'guerisseur',
    label: 'Guérisseur',
    emoji: '💚',
    stratum: 2,
    w: { p: 1, e: 6, a: 2 },
    tags: ['care', 'magic'],
    req: ['care'],
    role: 'heal',
  },
  {
    id: 'maitre_convoi',
    label: 'Maître de convoi',
    emoji: '📦',
    stratum: 2,
    w: { p: 2, e: 6, a: 1 },
    tags: ['haul', 'civil'],
    req: ['civil'],
    role: 'haul',
  },
  {
    id: 'pisteur',
    label: 'Pisteur',
    emoji: '🧿',
    stratum: 2,
    w: { p: 2, e: 3, a: 4 },
    tags: ['path', 'agile'],
    req: ['path'],
    role: 'speed',
  },
  {
    id: 'gladiateur',
    label: 'Gladiateur',
    emoji: '🏟️',
    stratum: 2,
    w: { p: 6, e: 4, a: 1 },
    tags: ['heavy', 'power'],
    req: ['power'],
  },
  {
    id: 'capitaine',
    label: 'Capitaine',
    emoji: '🏴',
    stratum: 2,
    w: { p: 4, e: 4, a: 2 },
    tags: ['guard', 'power'],
    req: ['melee'],
  },
  {
    id: 'enchanteur',
    label: 'Enchanteur',
    emoji: '🔷',
    stratum: 2,
    w: { p: 4, e: 3, a: 2 },
    tags: ['magic', 'control'],
    req: ['magic'],
  },
  {
    id: 'negociant',
    label: 'Négociant',
    emoji: '💰',
    stratum: 2,
    w: { p: 2, e: 5, a: 2 },
    tags: ['civil', 'trade'],
    req: ['civil'],
    role: 'haul',
  },

  // ── Strates 3+ — le vivier partagé, où les branches re-convergent. C'est ici
  //    qu'apparaissent les SIGNATURES : mêmes effets que les procs légendaires. ──
  {
    id: 'maitre_epeiste',
    label: 'Maître épéiste',
    emoji: '⚡',
    stratum: 3,
    w: { p: 7, e: 3, a: 3 },
    tags: ['blade', 'master'],
    req: ['blade'],
    signature: 'momentum_pct',
  },
  {
    id: 'berserker',
    label: 'Berserker',
    emoji: '💥',
    stratum: 3,
    w: { p: 9, e: 2, a: 2 },
    tags: ['heavy', 'fury'],
    req: ['heavy'],
    signature: 'rage_pct',
  },
  {
    id: 'assassin',
    label: 'Assassin',
    emoji: '🥷',
    stratum: 3,
    w: { p: 5, e: 2, a: 6 },
    tags: ['agile', 'precise'],
    req: ['agile'],
    signature: 'execute_pct',
  },
  {
    id: 'sentinelle',
    label: 'Sentinelle',
    emoji: '🦔',
    stratum: 3,
    w: { p: 3, e: 8, a: 2 },
    tags: ['guard', 'wall'],
    req: ['guard'],
    signature: 'thorns_pct',
  },
  {
    id: 'arquebusier',
    label: 'Arquebusier',
    emoji: '💨',
    stratum: 3,
    w: { p: 7, e: 2, a: 4 },
    tags: ['ranged', 'precise'],
    req: ['precise'],
    signature: 'crit_pct',
  },
  {
    id: 'archimage',
    label: 'Archimage',
    emoji: '🌟',
    stratum: 3,
    w: { p: 8, e: 2, a: 3 },
    tags: ['magic', 'master'],
    req: ['magic'],
    signature: 'damage_pct',
  },
  {
    id: 'prelat',
    label: 'Prélat',
    emoji: '⛪',
    stratum: 3,
    w: { p: 2, e: 8, a: 3 },
    tags: ['care', 'master'],
    req: ['care'],
    role: 'heal',
    signature: 'lifesteal_pct',
  },
  {
    id: 'intendant',
    label: 'Intendant',
    emoji: '🧾',
    stratum: 3,
    w: { p: 2, e: 7, a: 4 },
    tags: ['haul', 'master'],
    req: ['haul'],
    role: 'haul',
  },
  {
    id: 'grand_passeur',
    label: 'Grand passeur',
    emoji: '🌉',
    stratum: 3,
    w: { p: 2, e: 4, a: 7 },
    tags: ['path', 'master'],
    req: ['path'],
    role: 'speed',
  },
  {
    id: 'titan',
    label: 'Titan',
    emoji: '🗿',
    stratum: 3,
    w: { p: 4, e: 9, a: 1 },
    tags: ['wall', 'master'],
    req: ['wall'],
    signature: 'max_pv_pct',
  },
  {
    id: 'champion',
    label: 'Champion',
    emoji: '🏆',
    stratum: 3,
    w: { p: 7, e: 5, a: 2 },
    tags: ['power', 'master'],
    req: ['power'],
    signature: 'damage_pct',
  },
  {
    id: 'demiurge',
    label: 'Démiurge',
    emoji: '🌪️',
    stratum: 3,
    w: { p: 8, e: 3, a: 2 },
    tags: ['magic', 'master'],
    req: ['magic'],
    signature: 'execute_pct',
  },
  {
    id: 'consul',
    label: 'Consul',
    emoji: '🏛️',
    stratum: 3,
    w: { p: 3, e: 7, a: 3 },
    tags: ['civil', 'master'],
    req: ['civil'],
    role: 'haul',
  },
];

const BY_ID = new Map(ADV_CLASSES.map((c) => [c.id, c]));
export function advClass(id: string): AdvClass | undefined {
  return BY_ID.get(id);
}

/** La rareté d'une classe DÉCOULE de sa strate — une seule échelle, jamais deux. */
export function classRarity(c: AdvClass): Rarity {
  return RANK_ORDER[Math.min(RANK_ORDER.length - 1, Math.max(0, c.stratum))]!;
}

/** Un aventurier : un CHEMIN de classes (une par strate franchie) et un niveau gagné en
 *  travaillant. ⚠️ Aucune rareté n'est stockée : elle se DÉDUIT de la longueur du chemin,
 *  donc elle ne peut pas mentir. */
export interface Adventurer {
  id: string;
  name: string;
  /** Graine figée à la création : c'est elle qui décide des propositions reçues, donc
   *  deux aventuriers de la même classe n'ont pas le même destin. */
  seed: number;
  /** Ids de classe, du plus ancien au plus récent. `path[0]` = la classe de départ. */
  path: string[];
  level: number;
  xp: number;
  /** Occupé jusqu'à (escorte, formation) — ms epoch. */
  busyUntil?: number;
  /** Blessé jusqu'à — ms epoch. Soigné plus vite par l'Infirmerie, comme le héros. */
  hurtUntil?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tags accumulés par le chemin — la mémoire de ce que l'aventurier est devenu. */
export function pathTags(path: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of path) for (const t of advClass(id)?.tags ?? []) out.add(t);
  return out;
}

/** Strate à laquelle l'aventurier peut prétendre ensuite (= longueur du chemin). */
export function nextStratum(adv: Adventurer): number {
  return adv.path.length;
}

/** Niveau requis pour ouvrir la prochaine promotion, ou null si l'arbre est fini. */
export function promoLevel(stratum: number): number | null {
  return stratum < PROMO_LEVELS.length ? PROMO_LEVELS[stratum]! : null;
}

/** Classes ÉLIGIBLES à une strate depuis un chemin donné : bonne strate, et tous les
 *  prérequis déjà portés par le chemin. Une racine (strate 0) n'a aucun prérequis. */
export function eligibleClasses(path: string[], stratum: number): AdvClass[] {
  const have = pathTags(path);
  const already = new Set(path);
  return ADV_CLASSES.filter(
    (c) => c.stratum === stratum && !already.has(c.id) && (c.req ?? []).every((t) => have.has(t)),
  );
}

/** Les propositions d'une promotion : `PROMO_CHOICES` classes tirées parmi les éligibles,
 *  de façon DÉTERMINISTE (graine de l'aventurier + strate). Même aventurier = mêmes
 *  offres, à jamais — on ne peut pas relancer le dé en rechargeant l'app.
 *  ⚠️ Si le vivier éligible est plus court que 3, on rend ce qu'on a plutôt que de
 *  compléter avec du hors-filiation : mieux vaut 2 offres cohérentes que 3 dont une
 *  absurde (c'est la condition posée pour accepter le tirage). */
export function classChoices(adv: Adventurer, stratum = nextStratum(adv)): AdvClass[] {
  const pool = eligibleClasses(adv.path, stratum);
  const rng = mulberry32((adv.seed + stratum * 2654435761) >>> 0);
  const out: AdvClass[] = [];
  const rest = [...pool];
  while (out.length < PROMO_CHOICES && rest.length) {
    out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]!);
  }
  return out;
}

/** L'aventurier peut-il être promu MAINTENANT ? Deux verrous : son niveau (le travail)
 *  et celui de la Guilde (le sport). Le second ne doit jamais être le frein habituel. */
export function canPromote(adv: Adventurer, guildLevel: number): boolean {
  const s = nextStratum(adv);
  const need = promoLevel(s);
  if (need === null) return false;
  if (adv.level < need) return false;
  if (guildLevel < need) return false;
  return classChoices(adv, s).length > 0;
}

/** Stats de l'aventurier : le chemin de classes donne la FORME et le volume de base,
 *  le niveau multiplie. Chaque strate distribue son budget selon les parts de la classe. */
export function advStats(adv: Adventurer): {
  puissance: number;
  endurance: number;
  agilite: number;
} {
  let p = 0;
  let e = 0;
  let a = 0;
  for (const id of adv.path) {
    const c = advClass(id);
    if (!c) continue;
    const budget = STRATUM_BUDGET[Math.min(STRATUM_BUDGET.length - 1, c.stratum)]!;
    const sum = Math.max(1, c.w.p + c.w.e + c.w.a);
    p += (budget * c.w.p) / sum;
    e += (budget * c.w.e) / sum;
    a += (budget * c.w.a) / sum;
  }
  const mult = 1 + ADV_LEVEL_K * (Math.max(1, adv.level) - 1);
  return {
    puissance: Math.round(p * mult),
    endurance: Math.round(e * mult),
    agilite: Math.round(a * mult),
  };
}

/** Rareté de l'aventurier = la strate la plus haute atteinte. Déduite, jamais stockée. */
export function advRarity(adv: Adventurer): Rarity {
  const top = adv.path.reduce((m, id) => Math.max(m, advClass(id)?.stratum ?? 0), 0);
  return RANK_ORDER[Math.min(RANK_ORDER.length - 1, top)]!;
}

/** Rang affiché — LE MÊME que celui du héros (`characterRank`) : le niveau reste caché,
 *  le rang se lit. Une seule échelle de prestige dans tout le jeu. */
export function advRank(adv: Adventurer): CharacterRank {
  return characterRank(Math.max(1, adv.level));
}

/** XP nécessaire pour passer du niveau `level` au suivant. Mesuré avec `missionXp` :
 *  ~8 missions pour le niveau 2, 38 pour le 5, 118 pour le 8, 255 pour le 23 — soit
 *  environ 3 mois à 3 convois par jour pour élever un aventurier à fond.
 *  ⚠️ Vit ICI et non dans `caravan.ts` : c'est la courbe de l'AVENTURIER, pas celle du
 *  convoi. Les caravanes ne sont qu'une des sources d'XP (la formation en est une autre). */
export function advXpToNext(level: number): number {
  return 40 + Math.max(1, level) * 22;
}

/** Avancement vers l'étoile suivante (0..1) — la BARRE. Le niveau étant caché, c'est
 *  le seul retour visible entre deux étoiles, et il bouge à chaque mission. */
export function advRankProgress(adv: Adventurer): number {
  return rankProgress(adv.level, Math.max(0, adv.xp) / advXpToNext(adv.level));
}

/** Niveau auquel l'aventurier gagnera son étoile suivante (info-bulle de la barre). */
export function advNextStarLevel(adv: Adventurer): number {
  return nextStarLevel(adv.level);
}

/** « ⚪ Argent ★★★☆☆ » — libellé prêt à afficher. */
export function advRankLabel(adv: Adventurer): string {
  const r = advRank(adv);
  return `${r.emoji} ${r.name} ${rankStarStr(r.star)}`;
}

/** Nom de métier courant = la classe la plus récente. */
export function advTitle(adv: Adventurer): AdvClass | undefined {
  return adv.path.length ? advClass(adv.path[adv.path.length - 1]!) : undefined;
}

/** Signatures portées par le chemin (les strates hautes en donnent une). */
export function advSignatures(adv: Adventurer): EffectType[] {
  return adv.path.map((id) => advClass(id)?.signature).filter((s): s is EffectType => !!s);
}

/** Rôles hors combat portés par le chemin (soin, cargaison, vitesse, éclaireur). */
export function advRoles(adv: Adventurer): AdvRole[] {
  return adv.path.map((id) => advClass(id)?.role).filter((r): r is AdvRole => !!r);
}

/** Effectif que la Guilde peut entretenir : 1 de base, +1 tous les 2 niveaux.
 *  ⚠️ Le niveau de la Guilde étant lui-même plafonné par celui du joueur, l’effectif
 *  reste indexé sur le SPORT — mais linéairement, là où la puissance du héros croît en
 *  ~L⁴. C’est précisément ce qui rend la boucle accessible à un joueur peu sportif. */
export function guildRoster(guildLevel: number): number {
  return 1 + Math.floor(Math.max(0, guildLevel) / 2);
}

/** Coût de recrutement : il CROÎT avec l’effectif déjà en place, sinon on remplit la
 *  Guilde d’un coup et le choix de qui l’on élève n’existe plus. */
export function recruitCost(rosterSize: number, guildLevel: number): number {
  return Math.round(220 * (1 + rosterSize) * Math.max(1, guildLevel) ** 0.6);
}

/** Applique l’XP gagnée : montées de niveau EN CHAÎNE (un gros voyage peut en donner
 *  plusieurs), plafonnées par la Guilde.
 *
 *  ⚠️ Au plafond, l’XP EXCÉDENTAIRE EST CONSERVÉE et non jetée : quand la Guilde monte,
 *  l’aventurier récupère aussitôt ce qu’il avait accumulé. Sinon un joueur peu sportif —
 *  celui dont le plafond bouge le plus lentement, donc exactement la cible de la
 *  feature — travaillerait des semaines pour rien. Pur : rend un NOUVEL aventurier. */
export function grantAdvXp(adv: Adventurer, xp: number, guildLevel: number): Adventurer {
  const cap = Math.max(1, guildLevel);
  let level = adv.level;
  let pool = Math.max(0, adv.xp) + Math.max(0, Math.round(xp));
  while (level < cap && pool >= advXpToNext(level)) {
    pool -= advXpToNext(level);
    level++;
  }
  return { ...adv, level, xp: pool };
}

/** Disponible ? Ni en mission, ni en formation, ni à l'infirmerie. */
export function advAvailable(adv: Adventurer, now: number): boolean {
  return (adv.busyUntil ?? 0) <= now && (adv.hurtUntil ?? 0) <= now;
}
