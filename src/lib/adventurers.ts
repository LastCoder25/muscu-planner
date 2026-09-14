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
  CHARACTER_RANKS,
  characterRank,
  rankProgress,
  rankStartLevel,
  type CharacterRank,
} from './characterRank';
// ⚠️ LE PRNG DU PROJET, pas une n-ième copie. Les trois qui traînaient étaient
// arithmétiquement IDENTIQUES (seul l'idiome différait) — donc aucun tirage ne bouge —
// mais quatre exemplaires d'un générateur seedé, c'est quatre occasions qu'une retouche
// n'en touche qu'un et fasse diverger des mondes censés être reproductibles.
// `combat.ts` n'importe RIEN : le prendre pour source ne crée aucun cycle.
import { mulberry32 } from './combat';

/** Rôle HORS COMBAT d'une classe — le patron du chenil (faucon → renseignement,
 *  marmotte → butin) : toute la valeur d'une équipe ne passe pas par les dégâts. */
export type AdvRole = 'heal' | 'haul' | 'speed' | 'scout';

/** Ce qu’un rôle fait CONCRÈTEMENT sur un convoi. ⚠️ Écrit ici, à côté du type, comme
 *  `ROLE_LABEL` pour la garnison : l’écran de promotion l’affiche, et c’est une des deux
 *  choses qui distinguent vraiment deux classes (l’autre étant la signature).
 *
 *  ⚠️ L’EMOJI EST UN CHAMP, pas un préfixe de la phrase : le choix d’escorte est une grille
 *  de tuiles étroites (344 px sur un Z Fold plié) où seule l’icône tient. L’extraire du
 *  libellé marcherait aujourd’hui et casserait au premier renommage — et un emoji n’est
 *  pas toujours un seul caractère.
 */
const ADV_ROLE_INFO: Record<AdvRole, { emoji: string; what: string }> = {
  heal: { emoji: '🩺', what: 'Convalescences plus courtes' },
  haul: { emoji: '🐫', what: 'Cargaison plus grosse' },
  speed: { emoji: '🧭', what: 'Trajets plus rapides' },
  scout: { emoji: '👁️', what: 'Repère les embuscades' },
};
/** La phrase complète, DÉRIVÉE — deux tables auraient divergé au premier renommage. */
export const ADV_ROLE_LABEL: Record<AdvRole, string> = Object.fromEntries(
  Object.entries(ADV_ROLE_INFO).map(([k, v]) => [k, `${v.emoji} ${v.what}`]),
) as Record<AdvRole, string>;

/** Ce qu'une SIGNATURE fait en combat, en clair. ⚠️ Les effets sont ceux des procs
 *  légendaires (`EffectType`), déjà appliqués par `simulateCombat` — on ne réinvente
 *  rien, on les NOMME. Sans ça, l'écran de promotion affichait la forme des stats et la
 *  rareté, mais pas ce qui sépare réellement deux classes de même strate. */
const ADV_SIGNATURE_INFO: Partial<Record<EffectType, { emoji: string; what: string }>> = {
  damage_pct: { emoji: '⚔️', what: 'Frappe plus fort' },
  crit_pct: { emoji: '🎯', what: 'Coups critiques plus souvent' },
  execute_pct: { emoji: '☠️', what: 'Achève les ennemis affaiblis' },
  lifesteal_pct: { emoji: '🩸', what: 'Se soigne en frappant' },
  max_pv_pct: { emoji: '❤️', what: 'Plus robuste' },
  momentum_pct: { emoji: '🌀', what: 'Frappe de plus en plus fort' },
  rage_pct: { emoji: '🔥', what: 'Redoutable quand il est mal en point' },
  thorns_pct: { emoji: '🛡️', what: 'Renvoie une part des coups reçus' },
};
export const ADV_SIGNATURE_LABEL: Partial<Record<EffectType, string>> = Object.fromEntries(
  Object.entries(ADV_SIGNATURE_INFO).map(([k, v]) => [k, `${v.emoji} ${v.what}`]),
);

/** L'ORIENTATION d'une classe, lue sur la répartition de son budget : c'est ce que
 *  « 💪3 ❤️2 ⚡1 » veut dire, en mots. Le pilier dominant l'emporte ; à égalité, c'est un
 *  profil complet. */
export function advShapeLabel(w: { p: number; e: number; a: number }): string {
  const max = Math.max(w.p, w.e, w.a);
  const top = [w.p === max && 'p', w.e === max && 'e', w.a === max && 'a'].filter(Boolean);
  if (top.length > 1) return 'Polyvalent';
  if (top[0] === 'p') return 'Cogneur';
  if (top[0] === 'e') return 'Encaisseur';
  return 'Rapide';
}

/**
 * L’APPARENCE d’un aventurier dans son portrait (v0.807 ; demandé par l’utilisateur :
 * « selon la classe, affiche l’avatar de l’aventurier »).
 *
 * ⚠️ DÉRIVÉE, jamais stockée — comme sa rareté (v0.727) : elle ne peut pas mentir.
 * - La SILHOUETTE vient de sa FORME réelle (`advShapeLabel`, la même lecture que sa fiche) :
 *   Cogneur → puissant, Rapide → agile, le reste → polyvalent.
 * - Chaque CLASSE lui met une pièce sur le dos (arme, puis armure, cape, relique), teintée
 *   de la rareté de cette classe : une promotion se VOIT. Au-delà de quatre classes, ce
 *   sont les quatre plus récentes qui l’habillent — il continue de monter en éclat.
 */
export type AdvAvatarProfile = 'puissant' | 'agile' | 'polyvalent';
export const ADV_AVATAR_SLOTS = ['weapon', 'armor', 'accessory', 'relic'] as const;
export function advAvatar(adv: Adventurer): {
  profile: AdvAvatarProfile;
  gear: Partial<Record<(typeof ADV_AVATAR_SLOTS)[number], Rarity>>;
} {
  const st = advStats(adv);
  const shape = advShapeLabel({ p: st.puissance, e: st.endurance, a: st.agilite });
  const profile: AdvAvatarProfile =
    shape === 'Cogneur' ? 'puissant' : shape === 'Rapide' ? 'agile' : 'polyvalent';
  const classes = adv.path.map((id) => advClass(id)).filter((c): c is AdvClass => !!c);
  const gear: Partial<Record<(typeof ADV_AVATAR_SLOTS)[number], Rarity>> = {};
  const n = Math.min(ADV_AVATAR_SLOTS.length, classes.length);
  const from = classes.length - n;
  for (let k = 0; k < n; k++) {
    const c = classes[from + k]!;
    gear[ADV_AVATAR_SLOTS[k]!] = RANK_ORDER[Math.min(RANK_ORDER.length - 1, c.stratum)]!;
  }
  return { profile, gear };
}

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

/**
 * Niveaux d’aventurier ouvrant chaque strate — **UN PAR RANG DE PRESTIGE**.
 *
 * ⚠️ MODÈLE POSÉ PAR L’UTILISATEUR : « le rang, c’est comme le joueur — bronze, argent,
 * or, or noir… L’aventurier choisit une classe au rang bronze à sa création, ensuite
 * une au rang argent, une à l’or, etc. » Une promotion **EST** un rang gagné, au sens
 * littéral : la table est `rankStartLevel(i)`, donc **1 · 11 · 21 · 31 · 41 · 51 · 61 · 71**.
 *
 * ⚠️ ELLE EST CALCULÉE, PAS RECOPIÉE : `characterRank` est la seule autorité sur « où
 * commence un rang ». Deux tables jumelles écrites séparément divergent au premier
 * réglage — le projet vient de se le faire deux fois de suite (strates contre gate des
 * objets, puis étoiles contre promotions).
 *
 * ⚠️ IL Y A 10 RANGS ET 8 STRATES, et cet écart est ASSUMÉ : les deux derniers rangs
 * (Divin céleste, Tout-puissant) montent en prestige **sans nouvelle classe** — l’arbre
 * est fini, le titre continue. Écrire deux strates de plus ferait ~24 classes
 * supplémentaires pour deux paliers que presque personne n’atteindra.
 *
 * ⚠️ CE QUE ÇA COÛTE, mesuré : un rang prend **dix niveaux**, donc le joueur le plus
 * léger (une séance de 30 min par semaine, niveau 13 à un an) ne prend que sa
 * **deuxième** classe dans l’année. C’est le prix d’une promotion qui veut dire quelque
 * chose ; les ÉTOILES portent le retour entre-temps (une tous les deux niveaux).
 */
export const PROMO_LEVELS: readonly number[] = RANK_ORDER.map((_, i) => rankStartLevel(i));

/** Poids de la montée en NIVEAU face au chemin de classes. À 0,15, un aventurier de
 *  niveau 23 vaut ×4,3 son niveau 1 — soit plus que tout l'écart de rareté. C'est
 *  délibéré : l'aventurier qu'on a élevé doit battre celui qu'on vient de recruter. */
const ADV_LEVEL_K = 0.15;

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

  // ── Strate 4 — ÉPIQUE : on cesse d'être un métier pour devenir un NOM. ──
  // ⚠️ CHAQUE FAMILLE GARDE AU MOINS DEUX SUITES, et c'est ce qui rend les strates
  // hautes écrivables sans exploser. Les quatre tags de RACINE — `melee`, `agile`,
  // `magic`, `civil` — sont les seuls qu'un chemin porte forcément (chaque racine en
  // pose un), donc deux classes par tag suffisent à garantir un vrai choix à tout le
  // monde. Les classes à prérequis plus étroit (`blade`, `wall`, `guard`…) s'ajoutent
  // par-dessus : une lignée spécialisée voit davantage d'offres, jamais moins.
  {
    id: 'maitre_armes',
    label: 'Maître d’armes',
    emoji: '⚔️',
    stratum: 4,
    w: { p: 8, e: 5, a: 3 },
    tags: ['melee', 'master'],
    req: ['melee'],
    signature: 'damage_pct',
  },
  {
    id: 'brise_bouclier',
    label: 'Brise-bouclier',
    emoji: '🪓',
    stratum: 4,
    w: { p: 10, e: 4, a: 2 },
    tags: ['heavy', 'fury'],
    req: ['melee'],
    signature: 'execute_pct',
  },
  {
    id: 'ombre',
    label: 'Ombre',
    emoji: '🌑',
    stratum: 4,
    w: { p: 6, e: 3, a: 9 },
    tags: ['agile', 'precise'],
    req: ['agile'],
    signature: 'crit_pct',
  },
  {
    id: 'eclaireur_royal',
    label: 'Éclaireur royal',
    emoji: '🧭',
    stratum: 4,
    w: { p: 3, e: 5, a: 8 },
    tags: ['path', 'master'],
    req: ['agile'],
    role: 'scout',
  },
  {
    id: 'thaumaturge',
    label: 'Thaumaturge',
    emoji: '✨',
    stratum: 4,
    w: { p: 9, e: 4, a: 3 },
    tags: ['magic', 'master'],
    req: ['magic'],
    signature: 'momentum_pct',
  },
  {
    id: 'hierophante',
    label: 'Hiérophante',
    emoji: '🕯️',
    stratum: 4,
    w: { p: 3, e: 9, a: 3 },
    tags: ['care', 'magic'],
    req: ['magic'],
    signature: 'lifesteal_pct',
    role: 'heal',
  },
  {
    id: 'logisticien',
    label: 'Logisticien',
    emoji: '📦',
    stratum: 4,
    w: { p: 2, e: 9, a: 4 },
    tags: ['haul', 'master'],
    req: ['civil'],
    role: 'haul',
  },
  {
    id: 'maitre_route',
    label: 'Maître de route',
    emoji: '🛤️',
    stratum: 4,
    w: { p: 3, e: 6, a: 7 },
    tags: ['path', 'trade'],
    req: ['civil'],
    role: 'speed',
  },
  {
    id: 'paladin',
    label: 'Paladin',
    emoji: '🛡️',
    stratum: 4,
    w: { p: 6, e: 9, a: 2 },
    tags: ['guard', 'wall'],
    req: ['guard'],
    signature: 'thorns_pct',
  },
  {
    id: 'lame_noire',
    label: 'Lame noire',
    emoji: '🗡️',
    stratum: 4,
    w: { p: 9, e: 3, a: 5 },
    tags: ['blade', 'fury'],
    req: ['blade'],
    signature: 'execute_pct',
  },
  {
    id: 'maitre_arc',
    label: 'Maître d’arc',
    emoji: '🎯',
    stratum: 4,
    w: { p: 8, e: 3, a: 6 },
    tags: ['ranged', 'precise'],
    req: ['ranged'],
    signature: 'crit_pct',
  },
  {
    id: 'rempart',
    label: 'Rempart',
    emoji: '🧱',
    stratum: 4,
    w: { p: 4, e: 12, a: 2 },
    tags: ['wall', 'guard'],
    req: ['wall'],
    signature: 'max_pv_pct',
  },

  // ── Strate 5 — LÉGENDAIRE : on n'est plus seulement fort, on fait École. ──
  {
    id: 'heros',
    label: 'Héros',
    emoji: '🦁',
    stratum: 5,
    w: { p: 10, e: 7, a: 4 },
    tags: ['melee', 'power'],
    req: ['melee'],
    signature: 'damage_pct',
  },
  {
    id: 'fleau',
    label: 'Fléau',
    emoji: '☄️',
    stratum: 5,
    w: { p: 13, e: 4, a: 3 },
    tags: ['fury', 'heavy'],
    req: ['melee'],
    signature: 'rage_pct',
  },
  {
    id: 'spectre',
    label: 'Spectre',
    emoji: '👤',
    stratum: 5,
    w: { p: 8, e: 3, a: 12 },
    tags: ['agile', 'precise'],
    req: ['agile'],
    signature: 'execute_pct',
  },
  {
    id: 'vent_courant',
    label: 'Vent courant',
    emoji: '💨',
    stratum: 5,
    w: { p: 3, e: 6, a: 11 },
    tags: ['path', 'agile'],
    req: ['agile'],
    role: 'speed',
  },
  {
    id: 'mage_supreme',
    label: 'Mage suprême',
    emoji: '🌟',
    stratum: 5,
    w: { p: 12, e: 4, a: 4 },
    tags: ['magic', 'master'],
    req: ['magic'],
    signature: 'momentum_pct',
  },
  {
    id: 'oracle',
    label: 'Oracle',
    emoji: '🔭',
    stratum: 5,
    w: { p: 4, e: 8, a: 7 },
    tags: ['magic', 'control'],
    req: ['magic'],
    signature: 'crit_pct',
    role: 'scout',
  },
  {
    id: 'grand_intendant',
    label: 'Grand intendant',
    emoji: '🏛️',
    stratum: 5,
    w: { p: 3, e: 12, a: 4 },
    tags: ['haul', 'master'],
    req: ['civil'],
    role: 'haul',
  },
  {
    id: 'prince_marchand',
    label: 'Prince marchand',
    emoji: '💰',
    stratum: 5,
    w: { p: 3, e: 8, a: 6 },
    tags: ['trade', 'civil'],
    req: ['civil'],
    role: 'haul',
  },
  {
    id: 'gardien_serment',
    label: 'Gardien du serment',
    emoji: '🕊️',
    stratum: 5,
    w: { p: 7, e: 12, a: 2 },
    tags: ['guard', 'wall'],
    req: ['guard'],
    signature: 'thorns_pct',
  },
  {
    id: 'danseur_lames',
    label: 'Danseur de lames',
    emoji: '🌀',
    stratum: 5,
    w: { p: 10, e: 4, a: 8 },
    tags: ['blade', 'precise'],
    req: ['blade'],
    signature: 'momentum_pct',
  },
  {
    id: 'oeil_faucon',
    label: 'Œil de faucon',
    emoji: '🦅',
    stratum: 5,
    w: { p: 10, e: 3, a: 8 },
    tags: ['precise', 'ranged'],
    req: ['precise'],
    signature: 'crit_pct',
  },
  {
    id: 'colosse_eternel',
    label: 'Colosse éternel',
    emoji: '🗿',
    stratum: 5,
    w: { p: 5, e: 15, a: 2 },
    tags: ['wall', 'heavy'],
    req: ['wall'],
    signature: 'max_pv_pct',
  },

  // ── Strate 6 — MYTHIQUE : on n'est plus tout à fait de ce monde. ──
  {
    id: 'demi_dieu',
    label: 'Demi-dieu',
    emoji: '🌋',
    stratum: 6,
    w: { p: 13, e: 8, a: 5 },
    tags: ['melee', 'power'],
    req: ['melee'],
    signature: 'damage_pct',
  },
  {
    id: 'avatar_guerre',
    label: 'Avatar de guerre',
    emoji: '⚔️',
    stratum: 6,
    w: { p: 15, e: 6, a: 4 },
    tags: ['fury', 'heavy'],
    req: ['melee'],
    signature: 'rage_pct',
  },
  {
    id: 'souffle',
    label: 'Souffle',
    emoji: '🌬️',
    stratum: 6,
    w: { p: 9, e: 5, a: 14 },
    tags: ['agile', 'precise'],
    req: ['agile'],
    signature: 'execute_pct',
  },
  {
    id: 'messager_astral',
    label: 'Messager astral',
    emoji: '✴️',
    stratum: 6,
    w: { p: 4, e: 8, a: 13 },
    tags: ['path', 'master'],
    req: ['agile'],
    role: 'speed',
  },
  {
    id: 'tisseur_mondes',
    label: 'Tisseur de mondes',
    emoji: '🌌',
    stratum: 6,
    w: { p: 14, e: 6, a: 5 },
    tags: ['magic', 'control'],
    req: ['magic'],
    signature: 'momentum_pct',
  },
  {
    id: 'porteur_lumiere',
    label: 'Porteur de lumière',
    emoji: '🌤️',
    stratum: 6,
    w: { p: 5, e: 14, a: 5 },
    tags: ['care', 'master'],
    req: ['magic'],
    signature: 'lifesteal_pct',
    role: 'heal',
  },
  {
    id: 'batisseur',
    label: 'Bâtisseur',
    emoji: '🏗️',
    stratum: 6,
    w: { p: 4, e: 15, a: 5 },
    tags: ['haul', 'trade'],
    req: ['civil'],
    role: 'haul',
  },
  {
    id: 'voie_royale',
    label: 'Voie royale',
    emoji: '👑',
    stratum: 6,
    w: { p: 5, e: 10, a: 8 },
    tags: ['trade', 'path'],
    req: ['civil'],
    role: 'speed',
  },
  {
    id: 'inebranlable',
    label: 'Inébranlable',
    emoji: '⛰️',
    stratum: 6,
    w: { p: 6, e: 18, a: 3 },
    tags: ['wall', 'guard'],
    req: ['wall'],
    signature: 'max_pv_pct',
  },
  {
    id: 'lame_destin',
    label: 'Lame du destin',
    emoji: '⚡',
    stratum: 6,
    w: { p: 13, e: 6, a: 9 },
    tags: ['blade', 'master'],
    req: ['blade'],
    signature: 'crit_pct',
  },
  {
    id: 'sentinelle_eternelle',
    label: 'Sentinelle éternelle',
    emoji: '🏰',
    stratum: 6,
    w: { p: 8, e: 15, a: 3 },
    tags: ['guard', 'wall'],
    req: ['guard'],
    signature: 'thorns_pct',
  },

  // ── Strate 7 — PRIMORDIAL : le sommet, et la fin de l'arbre. ──
  // ⚠️ `PROMO_LEVELS` compte 8 entrées, une par rareté : au-delà, `promoLevel` rend `null` et
  // `canPromote` refuse. L'aventurier plafonne à `RANK_ORDER[7]` — primordial — et c'est le
  // bout de l'échelle, pas un trou.
  {
    id: 'primarque',
    label: 'Primarque',
    emoji: '👑',
    stratum: 7,
    w: { p: 16, e: 10, a: 6 },
    tags: ['melee', 'master'],
    req: ['melee'],
    signature: 'damage_pct',
  },
  {
    id: 'fureur_premiere',
    label: 'Fureur première',
    emoji: '🔥',
    stratum: 7,
    w: { p: 19, e: 7, a: 5 },
    tags: ['fury', 'power'],
    req: ['melee'],
    signature: 'rage_pct',
  },
  {
    id: 'ombre_premiere',
    label: 'Ombre première',
    emoji: '🕳️',
    stratum: 7,
    w: { p: 11, e: 6, a: 17 },
    tags: ['agile', 'precise'],
    req: ['agile'],
    signature: 'execute_pct',
  },
  {
    id: 'pas_du_monde',
    label: 'Pas du monde',
    emoji: '🌍',
    stratum: 7,
    w: { p: 5, e: 10, a: 16 },
    tags: ['path', 'master'],
    req: ['agile'],
    role: 'speed',
  },
  {
    id: 'verbe_originel',
    label: 'Verbe originel',
    emoji: '📜',
    stratum: 7,
    w: { p: 17, e: 7, a: 6 },
    tags: ['magic', 'master'],
    req: ['magic'],
    signature: 'momentum_pct',
  },
  {
    id: 'souffle_vital',
    label: 'Souffle vital',
    emoji: '💗',
    stratum: 7,
    w: { p: 6, e: 17, a: 6 },
    tags: ['care', 'master'],
    req: ['magic'],
    signature: 'lifesteal_pct',
    role: 'heal',
  },
  {
    id: 'pilier_du_monde',
    label: 'Pilier du monde',
    emoji: '🏛️',
    stratum: 7,
    w: { p: 5, e: 18, a: 6 },
    tags: ['haul', 'master'],
    req: ['civil'],
    role: 'haul',
  },
  {
    id: 'grand_route',
    label: 'Grand-route',
    emoji: '🧭',
    stratum: 7,
    w: { p: 6, e: 12, a: 10 },
    tags: ['trade', 'path'],
    req: ['civil'],
    role: 'scout',
  },
  {
    id: 'socle_premier',
    label: 'Socle premier',
    emoji: '🗻',
    stratum: 7,
    w: { p: 7, e: 22, a: 4 },
    tags: ['wall', 'master'],
    req: ['wall'],
    signature: 'max_pv_pct',
  },
  {
    id: 'tranchant_absolu',
    label: 'Tranchant absolu',
    emoji: '🗡️',
    stratum: 7,
    w: { p: 16, e: 7, a: 11 },
    tags: ['blade', 'master'],
    req: ['blade'],
    signature: 'crit_pct',
  },
  {
    id: 'serment_premier',
    label: 'Serment premier',
    emoji: '🛡️',
    stratum: 7,
    w: { p: 10, e: 18, a: 4 },
    tags: ['guard', 'master'],
    req: ['guard'],
    signature: 'thorns_pct',
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
  /** Promotion EN COURS au Centre de formation. ⚠️ Une promotion n'est pas instantanée :
   *  c'est le temps passé au Centre qui la paie, et c'est ce que son niveau raccourcit.
   *  Le `classId` n'est PAS encore dans `path` — il n'y entre qu'à l'échéance, sinon
   *  l'aventurier profiterait de ses nouvelles stats pendant sa formation. */
  training?: { classId: string; until: number };
  /**
   * Son COMPAGNON — l'id d'un familier de l'inventaire.
   *
   * ⚠️ L'appariement vit SUR L'AVENTURIER, pas dans une liste à part, et c'est ce qui
   * lui donne son sens : le familier SUIT son homme partout (convoi comme rempart).
   * Rangé ailleurs, il aurait fallu deux règles — « qui est apparié » et « qui part en
   * mission » — et rien pour les tenir d'accord.
   *
   * ⚠️ Un familier ne peut être apparié qu'à UN aventurier, et pas en même temps porté
   * par le héros : c'est `companionsOf` qui le vérifie, jamais l'écran seul.
   *
   * Absent = pas de compagnon. Les aventuriers d'avant n'en ont aucun, donc le
   * mécanisme est INERTE tant que personne n'en assigne un.
   */
  familiarId?: string;
  /**
   * Son TALENT — l'id d'un talent de la collection.
   *
   * ⚠️ UN aventurier = UN talent, là où le héros en équipe plusieurs. C'est ce qui en
   * fait un « mini-héros bien moins fort » (conception de l'utilisateur) plutôt qu'un
   * second héros : même grammaire — stats, compagnon, talent — mais une seule ligne de
   * chaque, et bridée.
   *
   * ⚠️ Effet de bord VOULU : les talents en surplus, qui ne servaient que de carburant
   * à l'infusion, trouvent enfin un emploi. Un talent porté par le HÉROS n'est pas
   * disponible — c'est `advTalentsOf` qui l'assure, jamais l'écran seul.
   *
   * Absent = aucun talent. Inerte tant que personne n'en assigne un.
   */
  talentId?: string;
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
/** ⭐ PEUT-ON LE PROMOUVOIR **MAINTENANT** ? — la règle COMPLÈTE, en un seul endroit.
 *
 *  ⚠️ Signalé par un joueur : « j’ai encore l’étoile sur la guilde alors qu’il n’y a rien à
 *  faire ». La condition vivait en TROIS exemplaires, chacun avec un sous-ensemble
 *  différent — la pastille ne testait que `canPromote` + « pas en formation », le bouton
 *  de la Guilde y ajoutait `busyUntil`, et seul le STORE exigeait en plus un Centre de
 *  formation. Résultat : l’étoile s’allumait pour des promotions que rien ne pouvait
 *  accepter. Trois copies d’une règle finissent toujours par diverger.
 *
 *  ⚠️ `hurtUntil` N’EN FAIT PAS PARTIE, volontairement : une formation peut courir
 *  PENDANT une convalescence — c’est même le bon moment, et on ne fait pas attendre un
 *  blessé deux fois (décision v0.739, à ne pas défaire par mégarde). */
export function canPromoteNow(
  adv: Adventurer,
  ctx: { guildLevel: number; trainingLevel: number; now: number },
): boolean {
  // Sans Centre de formation, aucune promotion n’est possible — pas même de l’annoncer.
  if (ctx.trainingLevel <= 0) return false;
  // Une seule formation à la fois : la décision est déjà prise.
  if (adv.training) return false;
  // Parti en convoi : il est physiquement sur la route, pas au Centre.
  if ((adv.busyUntil ?? 0) > ctx.now) return false;
  return canPromote(adv, ctx.guildLevel);
}

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

/** XP nécessaire pour passer du niveau `level` au suivant. Mesuré avec `missionXp` :
 *  ~8 missions pour le niveau 2, 38 pour le 5, 118 pour le 8, 255 pour le 23.
 *  ⚠️ Vit ICI et non dans `caravan.ts` : c’est la courbe de l’AVENTURIER, pas celle du
 *  convoi. Les caravanes ne sont qu’une de ses sources d’XP (la formation en est une autre). */
export function advXpToNext(level: number): number {
  return 40 + Math.max(1, level) * 22;
}

/** Ce qu’une mission a changé pour un aventurier — la matière de l’annonce. */
export interface AdvProgress {
  id: string;
  name: string;
  /** Le CRAN GLOBAL (0..49) avant et après.
   *
   *  ⚠️ ON NE COMPARE PAS LES ÉTOILES : au passage de rang, l’étoile **retombe de ★5 à
   *  ★1**. Un gain lu sur elle manquerait donc exactement le moment le plus important —
   *  celui où l’aventurier change de rang. Le cran, lui, est monotone d’un bout à
   *  l’autre de l’échelle. (Trouvé par un test, pas par relecture.) */
  from: number;
  to: number;
  /** L’étoile à AFFICHER (1..5), après coup. */
  star: number;
  /** Le RANG a changé : l’annonce n’est plus du même ordre qu’une étoile de plus. */
  rankUp: boolean;
  /** Le rang APRÈS, tel qu’on l’écrit (« 🟤 Bronze »). */
  rankEmoji: string;
  rankName: string;
  /** Sa rareté de classe — la teinte de la célébration. */
  rarity: Rarity;
  /** Une promotion s’ouvre MAINTENANT, et elle ne s’ouvrait pas avant. */
  promoted: boolean;
}

/**
 * Compare un vivier AVANT et APRÈS un versement d’XP, et rend ce qu’il y a à DIRE.
 *
 * ⚠️ Le niveau d’un aventurier est CACHÉ : sans annonce, une mission qui lui fait gagner
 * une étoile ne se voit qu’en rouvrant la Guilde et en regardant une barre.
 *
 * ⚠️ `promoted` EST UN FRANCHISSEMENT, pas un état — et c’est tout ce qui empêche la
 * feuille de promotion de se rouvrir à CHAQUE cargaison pour quelqu’un qu’on a déjà
 * décidé de ne pas promouvoir. Ce qui ouvre la fenêtre, c’est que CETTE mission l’a
 * rendue possible. Le badge ⭐ de la Guilde reste le rappel permanent, lui.
 *
 * Pur : `now` est toujours passé, jamais lu de l’horloge.
 */
export function advProgressOf(
  before: readonly Adventurer[],
  after: readonly Adventurer[],
  ctx: { guildLevel: number; trainingLevel: number; now: number },
): AdvProgress[] {
  const was = new Map(before.map((a) => [a.id, a]));
  const out: AdvProgress[] = [];
  for (const a of after) {
    const b = was.get(a.id);
    // Un aventurier qui n’existait pas avant n’a rien « gagné » : recruté entre-temps.
    if (!b) continue;
    const av = advRank(b);
    const ap = advRank(a);
    const promoted = canPromoteNow(a, ctx) && !canPromoteNow(b, ctx);
    if (ap.tier <= av.tier && !promoted) continue;
    out.push({
      id: a.id,
      name: a.name,
      from: av.tier,
      to: ap.tier,
      star: ap.star,
      rankUp: ap.rankIndex > av.rankIndex,
      rankEmoji: ap.emoji,
      rankName: ap.name,
      rarity: advRarity(a),
      promoted,
    });
  }
  return out;
}

/** Plafond de l’échelle affichée — celui du jeu, et donc du barème de prestige. */
export const ADV_MAX_LEVEL = 100;

/** Crans de l’étoile. Cinq, comme pour le héros. */
export const ADV_STARS = 5;

/**
 * Rang affiché — **LE MÊME BARÈME QUE LE JOUEUR** (🟤 Bronze → 👑 Tout-puissant), et les
 * étoiles disent où en est son NIVEAU dans le rang (une tous les deux niveaux).
 *
 * ⚠️ DEUX ALLERS-RETOURS ONT MENÉ ICI, et la raison de chacun compte. Le rang a d’abord
 * été ce barème (v0.725) — mais les promotions étaient **front-chargées** (cinq dans le
 * seul rang Bronze), donc « une promotion = un rang gagné » était faux et la fiche
 * montrait deux progressions sans rapport. On a alors fait du rang **la rareté de la
 * classe** (v0.793), ce qui rendait la phrase vraie… en abandonnant l’échelle commune
 * avec le héros. La vraie correction n’était ni l’une ni l’autre : c’est **la CADENCE**
 * qui était fausse. Une classe par rang (`PROMO_LEVELS` = `rankStartLevel`) rend la
 * phrase littéralement vraie **et** garde une seule échelle de prestige dans tout le jeu.
 *
 * La **rareté de la classe** reste lisible à côté (« Maître épéiste · épique ») : elle ne
 * concurrence plus le rang, elle avance avec lui, cran pour cran.
 */
export function advRank(adv: Adventurer): CharacterRank {
  const byLevel = characterRank(Math.max(1, adv.level));
  const cap = advRankCap(adv);
  if (byLevel.rankIndex <= cap) return byLevel;
  // ⚠️ PAS PROMU, PAS DE NOUVEAU RANG À L’ÉCRAN (v0.834 ; demandé par l’utilisateur : « s’il
  // n’a pas été promu, ne change pas le visuel de son rang »). Son niveau a franchi le
  // rang suivant, mais sa classe n’a pas suivi — et c’est la CLASSE qui borne ses
  // compagnons (`canAdvFamiliar` / `canAdvTalent`). Afficher « Argent » à qui ne peut
  // mener que du Bronze ferait mentir la règle. Il reste donc à son rang, ★★★★★ :
  // « prêt », jusqu’à ce que la promotion le fasse monter.
  const t = CHARACTER_RANKS[cap]!;
  return {
    rankIndex: cap,
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    star: ADV_STARS,
    tier: cap * ADV_STARS + ADV_STARS - 1,
  };
}

/** Le rang le plus haut que sa CLASSE autorise à afficher. ⚠️ Au sommet de l’arbre (8
 *  classes) il n’y a plus de promotion à attendre : les deux derniers rangs se gagnent au
 *  niveau seul, sinon ils seraient inatteignables. */
function advRankCap(adv: Adventurer): number {
  return adv.path.length >= PROMO_LEVELS.length
    ? CHARACTER_RANKS.length - 1
    : Math.max(0, adv.path.length - 1);
}

/**
 * L’ORDRE DU VIVIER (v0.808 ; demandé par l’utilisateur : « par rang, puis par XP, puis par
 * puissance, dans cet ordre ») — du plus avancé au moins avancé.
 *
 * ⚠️ « L’XP » se lit comme l’EXPÉRIENCE ACCUMULÉE : le niveau d’abord, puis l’XP du niveau
 * en cours. Le champ `xp` seul repart à zéro à chaque niveau — trier dessus mettrait un
 * aventurier fraîchement monté derrière un autre sur le point de le faire.
 * La puissance vient de l’APPELANT (`adventurerPowers`, compagnon et talent compris) : ce
 * module ne connaît ni les familiers ni les talents.
 */
export function compareAdventurers(
  a: Adventurer,
  b: Adventurer,
  powerOf: (x: Adventurer) => number,
): number {
  // ⚠️ Le rang se DÉDUIT du niveau : la clé suivante le départagerait de toute façon.
  // Elle reste écrite parce que c'est l'ordre demandé, et qu'un rang un jour découplé du
  // niveau ne doit pas changer l'ordre en silence.
  return (
    advRank(b).rankIndex - advRank(a).rankIndex ||
    b.level - a.level ||
    b.xp - a.xp ||
    powerOf(b) - powerOf(a)
  );
}

/** Étoile courante, 1..5 — la progression du niveau DANS le rang. */
export function advStar(adv: Adventurer): number {
  return advRank(adv).star;
}

/** Avancement DANS l’étoile courante (0..1) — la BARRE. L’XP du niveau en cours compte,
 *  sinon elle ne bougerait qu’au passage de niveau : plusieurs jours de convois sans
 *  le moindre retour, alors que le niveau est caché. */
export function advRankProgress(adv: Adventurer): number {
  // Bloqué à son rang faute de promotion : la barre est pleine, il n’avance plus ici.
  if (characterRank(Math.max(1, adv.level)).rankIndex > advRankCap(adv)) return 1;
  return rankProgress(adv.level, Math.max(0, adv.xp) / advXpToNext(adv.level));
}

/** Niveau qui ouvrira la PROCHAINE PROMOTION, ou null quand l’arbre est fini.
 *
 *  ⚠️ Ce n’est PAS « le prochain rang » : les deux derniers rangs n’apportent plus de
 *  classe (8 strates pour 10 rangs). Rendre le niveau du rang suivant promettrait une
 *  promotion qui n’arrivera jamais. */
export function advNextPromoLevel(adv: Adventurer): number | null {
  return promoLevel(nextStratum(adv));
}
/** Nom de métier courant = la classe la plus récente. */
export function advTitle(adv: Adventurer): AdvClass | undefined {
  return adv.path.length ? advClass(adv.path[adv.path.length - 1]!) : undefined;
}

/** Signatures portées par le chemin (les strates hautes en donnent une). */
export function advSignatures(adv: Adventurer): EffectType[] {
  return adv.path.map((id) => advClass(id)?.signature).filter((s): s is EffectType => !!s);
}

/** Une COMPÉTENCE et son NIVEAU. */
export interface AdvSkill<T> {
  what: T;
  level: number;
}

/**
 * Compte les répétitions d'une liste et en fait des compétences à NIVEAU.
 *
 * ⚠️ Le niveau n'est pas décoratif : il REMPLACE le décompte d'occurrences que les
 * caravanes faisaient déjà (`countRole` additionnait les doublons). Les deux lectures
 * existaient donc en parallèle — l'une chiffrée, l'autre listée deux fois à l'écran —
 * et rien ne garantissait qu'elles restent d'accord. Il n'y en a plus qu'une.
 *
 * ⚠️ ORDRE DE PREMIÈRE APPARITION conservé : c'est l'ordre du parcours, donc l'ordre
 * dans lequel l'aventurier a appris. Un tri par niveau raconterait autre chose.
 */
function levelsOf<T>(list: T[]): AdvSkill<T>[] {
  const out: AdvSkill<T>[] = [];
  for (const what of list) {
    const seen = out.find((s) => s.what === what);
    if (seen) seen.level++;
    else out.push({ what, level: 1 });
  }
  return out;
}

/** Les rôles de convoi, avec leur NIVEAU (deux fois le même rôle = niveau 2). */
export function advRoleLevels(adv: Adventurer): AdvSkill<AdvRole>[] {
  return levelsOf(advRoles(adv));
}

/** UNE COMPÉTENCE EN UN COUP D’ŒIL : de quoi la reconnaître (emoji), ce qu’elle fait
 *  (phrase) et son niveau. ⚠️ Demandé par l’utilisateur : on choisissait son escorte sur
 *  un emoji de classe et un prénom, alors que ce sont les RÔLES qui décident du convoi
 *  (trajet, cargaison, embuscades) — l’information existait, elle vivait juste dans un
 *  autre écran.
 *
 *  ⚠️ LES RÔLES D’ABORD, les signatures ensuite : sur un convoi, un 🧭 change le voyage à
 *  tous les coups, une signature de combat ne sert que s’il y a embuscade. */
export interface AdvBadge {
  emoji: string;
  what: string;
  level: number;
  role: boolean;
}
export function advBadges(adv: Adventurer): AdvBadge[] {
  const roles = advRoleLevels(adv).map((s) => ({
    ...ADV_ROLE_INFO[s.what],
    level: s.level,
    role: true,
  }));
  const sigs = advSignatureLevels(adv).flatMap((s) => {
    const i = ADV_SIGNATURE_INFO[s.what];
    return i ? [{ ...i, level: s.level, role: false }] : [];
  });
  return [...roles, ...sigs];
}

/** Les signatures de combat, avec leur NIVEAU. */
export function advSignatureLevels(adv: Adventurer): AdvSkill<EffectType>[] {
  return levelsOf(advSignatures(adv));
}

/** Le niveau d'un rôle donné sur TOUTE une escorte : les niveaux de chacun s'ajoutent.
 *  ⚠️ C'est exactement ce que faisait le décompte d'occurrences — les valeurs de jeu ne
 *  bougent pas d'un iota, elles passent seulement par une notion qui a un nom. */
export function escortRoleLevel(advs: Adventurer[], role: AdvRole): number {
  return advs.reduce((n, a) => n + (advRoleLevels(a).find((s) => s.what === role)?.level ?? 0), 0);
}

/** Rôles hors combat portés par le chemin (soin, cargaison, vitesse, éclaireur). */
export function advRoles(adv: Adventurer): AdvRole[] {
  return adv.path.map((id) => advClass(id)?.role).filter((r): r is AdvRole => !!r);
}

/**
 * Les compétences ACCESSIBLES en partant de ce chemin — celles de la classe courante
 * comprises.
 *
 * ⚠️ POURQUOI : recruter, c'est choisir une LIGNÉE, pas une classe. Les offres
 * n'annonçaient que la forme des stats — on s'engageait sans savoir si cette voie mène
 * un jour à de la cargaison ou à du soin, alors que la filiation est stricte (un
 * Guerrier ne se verra JAMAIS proposer Clerc). On montre donc l'horizon.
 *
 * ⚠️ On énumère les CHEMINS, pas les classes : l'éligibilité dépend des tags ACCUMULÉS
 * par le parcours (`req`), donc « telle classe est-elle atteignable » n'a de sens que
 * relativement à un chemin. La profondeur écrite s'arrête à la strate 3, ce qui borne
 * l'énumération — le test qui parcourt tous les chemins s'appuie sur le même fait.
 */
export function reachableSkills(path: string[]): {
  roles: AdvRole[];
  signatures: EffectType[];
} {
  const roles = new Set<AdvRole>();
  const signatures = new Set<EffectType>();
  const seen = new Set<string>();
  const walk = (p: string[]) => {
    const key = p.join('>');
    if (seen.has(key)) return;
    seen.add(key);
    for (const id of p) {
      const k = advClass(id);
      if (k?.role) roles.add(k.role);
      if (k?.signature) signatures.add(k.signature);
    }
    const next = eligibleClasses(p, p.length);
    for (const k of next) walk([...p, k.id]);
  };
  walk(path);
  return { roles: [...roles], signatures: [...signatures] };
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
  // ⚠️ La formation IMMOBILISE, et c'est tout son coût : promouvoir maintenant, c'est
  // renoncer à cet aventurier pour les prochains convois. Sans ça, une promotion serait
  // gratuite et il n'y aurait aucune décision.
  return (
    (adv.busyUntil ?? 0) <= now && (adv.hurtUntil ?? 0) <= now && (adv.training?.until ?? 0) <= now
  );
}

/** Une promotion arrivée à terme est APPLIQUÉE ; sinon l'aventurier est rendu tel quel.
 *  ⚠️ Pur et idempotent : on peut l'appeler à chaque tick sans rien dupliquer. */
export function settleTraining(adv: Adventurer, now: number): Adventurer {
  const t = adv.training;
  if (!t || t.until > now) return adv;
  const reste = { ...adv, path: [...adv.path, t.classId] };
  delete reste.training; // la formation est CONSOMMÉE : la laisser la rejouerait
  return reste;
}

/** Idem sur un vivier entier. Rend le MÊME tableau si rien n'a bougé, pour que
 *  l'appelant sache s'il doit persister. */
export function settleAllTraining(
  list: Adventurer[],
  now: number,
): { list: Adventurer[]; changed: boolean } {
  let changed = false;
  const next = list.map((a) => {
    const s = settleTraining(a, now);
    if (s !== a) changed = true;
    return s;
  });
  return changed ? { list: next, changed } : { list, changed: false };
}

/** Temps restant de formation (0 si aucune). */
export function advTrainingLeftMs(adv: Adventurer, now: number): number {
  return Math.max(0, (adv.training?.until ?? 0) - now);
}
