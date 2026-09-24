// adventurers.ts — ceux qui partent en mission : stats, rang, disponibilité.
// Pur/testable, aucune dépendance Vue/Supabase.
//
// ⚠️ DEUX PEUPLES DANS UN SEUL TYPE, et c'est voulu. Un `Adventurer` est soit un
// CHAMPION (`championId` + `copies`, invoqué au Panthéon, réveillé par ses doublons),
// soit un LEGACY — recruté avant la bascule (v0.951), qui porte encore un `path` de
// classes. Chaque accesseur (`advStats`, `advRarity`, `advSignatures`, `advRoles`,
// `advTitle`, `advRank`, `advAvatar`) regarde d'abord le champion et retombe sur le
// chemin sinon : les deux cohabitent sans qu'aucun appelant ait à choisir.
//
// ⚠️ `ADV_CLASSES` N'EST PLUS UN ARBRE, C'EST UNE TABLE DE CONSULTATION. L'arbre de
// promotion est parti avec le recrutement (plus de `classChoices`, `canPromote`,
// `eligibleClasses` : on n'élève plus une recrue, on invoque un champion). Ses 94
// classes restent parce qu'elles nourrissent encore deux lectures : les aventuriers
// LEGACY déjà en base, et les lignées de RÉFÉRENCE écrites à la main dans
// `caravan.ts` (`REF_LINEAGES`), sur lesquelles la route se calibre. Les champs
// `req`/`tags` ne pilotent donc plus rien — ils documentent la filiation d'origine.
//
// ⚠️ LE PRINCIPE QUI COMMANDE TOUT LE RESTE : « le sport fixe le PLAFOND, le travail
// fixe le RYTHME ». Deux freins — le niveau du Panthéon (donc du joueur, donc du sport),
// qui plafonne le niveau d'un champion ET combien on en ENGAGE à la fois (`engageCap`), et l'XP
// gagnée en mission. Le plafond doit rester EN RETRAIT pour un joueur peu sportif :
// mesuré, le niveau d'un aventurier ÉGALE celui du joueur à chaque relevé — l'XP n'est
// jamais le frein, le Panthéon l'est toujours.
import {
  legendaryOf,
  relicPowerOf,
  trophyPowerOf,
  SET_SIGNATURES,
  prestigeRankIndex,
  RANK_ORDER,
  RARITY_RANK,
  RANK_COLOR,
  RARITY_LABEL,
  type EffectType,
  type Rarity,
} from './items';
import {
  CHAMPION_BY_ID,
  GRADE_COLOR,
  REF_CHAMPION_BY_ID,
  type Champion,
  type ChampionGrade,
} from '@/data/champions';
import {
  CHARACTER_RANKS,
  characterRank,
  rankProgress,
  rankStartLevel,
  type CharacterRank,
} from './characterRank';
// ⚠️ IMPORT DE TYPE SEUL : `combat.ts` n'importe rien, mais le garder en `type`
// documente qu'aucun runtime ne traverse — les signatures sont des `EffectType` et des
// `CombatSkill` NOMMÉS là où ils vivent, jamais une seconde nomenclature.
import { type CombatSkill } from './combat';

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
/** ⚠️ `what` est la PHRASE (ce que la compétence fait, pour une fiche), `name` le NOM
 *  COURT (pour un bandeau de combat, où il n'y a la place que d'un mot). Les deux vivent
 *  ici et pas dans deux tables : c'est la même compétence, lue à deux échelles. */
const ADV_SIGNATURE_INFO: Partial<
  Record<EffectType, { emoji: string; what: string; name: string }>
> = {
  damage_pct: { emoji: '⚔️', what: 'Frappe plus fort', name: 'Frappe' },
  crit_pct: { emoji: '🎯', what: 'Coups critiques plus souvent', name: 'Précision' },
  execute_pct: { emoji: '☠️', what: 'Achève les ennemis affaiblis', name: 'Exécution' },
  lifesteal_pct: { emoji: '🩸', what: 'Se soigne en frappant', name: 'Vol de vie' },
  // ⚠️ « Vitalité » et non « Robustesse » : ce nom est celui de la stat du Colosse (2026-09-22).
  max_pv_pct: { emoji: '❤️', what: 'Plus de PV', name: 'Vitalité' },
  momentum_pct: { emoji: '🌀', what: 'Frappe de plus en plus fort', name: 'Élan' },
  rage_pct: { emoji: '🔥', what: 'Redoutable quand il est mal en point', name: 'Rage' },
  thorns_pct: { emoji: '🛡️', what: 'Renvoie une part des coups reçus', name: 'Épines' },
  // Refonte de l'équipement du héros (étape 3) : nommées ici pour le bandeau de combat.
  bleed_pct: { emoji: '🩸', what: 'Fait saigner ses cibles', name: 'Saignement' },
  block_pct: { emoji: '🛡️', what: 'Bloque une partie des coups', name: 'Blocage' },
  parry_pct: { emoji: '🤺', what: 'Pare et étourdit', name: 'Parade' },
  riposte_pct: { emoji: '↩️', what: 'Contre-attaque quand on le frappe', name: 'Riposte' },
  start_shield_pct: {
    emoji: '🔰',
    what: 'Commence le combat derrière une barrière',
    name: 'Barrière de départ',
  },
  toughness_pct: { emoji: '🪨', what: 'Encaisse les gros coups sans broncher', name: 'Robustesse' },
};
// ─────────────────────────────────────────────────────────────────────────────
// ⚔️ CE QUI A MORDU PENDANT UN COMBAT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Où lire le nom d'une compétence de combat. ⚠️ **ON DIT OÙ CHERCHER, ON NE RECOPIE PAS** :
 * les libellés et les emojis existent déjà dans `ADV_SIGNATURE_INFO` (les signatures que
 * portent les champions), `LEGENDARY_PROCS` et `SET_SIGNATURES`. Une quatrième copie
 * aurait divergé au premier renommage — c'est le défaut que ce projet documente à
 * répétition (les libellés de POI, le test de ferraille, le dessin des balistes).
 *
 * ⚠️ **EXHAUSTIF PAR CONSTRUCTION** : ajouter une `CombatSkill` sans dire où la lire ne
 * compile plus. C'est le patron des `Record<PoiType, …>`.
 */
const SKILL_SOURCE: Record<CombatSkill, 'sig' | 'proc' | 'set' | 'relic' | 'trophy'> = {
  rp_brasier: 'relic',
  rp_rempart: 'relic',
  rp_coup_fatal: 'relic',
  rp_festin: 'relic',
  rp_tempete: 'relic',
  rp_riposte_parfaite: 'relic',
  rp_ronces: 'relic',
  rp_carapace: 'relic',
  rp_ouverture: 'relic',
  rp_moisson: 'relic',
  rp_phenix: 'relic',
  rp_second_souffle: 'relic',
  execute: 'sig',
  rage: 'sig',
  momentum: 'sig',
  lifesteal: 'sig',
  thorns: 'sig',
  bleed: 'sig',
  block: 'sig',
  parry: 'sig',
  riposte: 'sig',
  read: 'sig',
  start_shield: 'sig',
  toughness: 'sig',
  initiative: 'proc',
  predator_eye: 'proc',
  aegis: 'proc',
  retort: 'proc',
  phoenix: 'proc',
  secondwind: 'proc',
  executioner: 'proc',
  vampiric: 'proc',
  charge: 'proc',
  cadence: 'proc',
  quarry: 'proc',
  endurance: 'proc',
  whetted: 'proc',
  thirst: 'proc',
  living_armor: 'proc',
  scarring: 'proc',
  vigilance: 'proc',
  sang_froid: 'proc',
  sidestep: 'proc',
  dance: 'proc',
  rage_seal: 'proc',
  hunter: 'proc',
  sig_berserker: 'set',
  sig_gardien: 'set',
  sig_assassin: 'set',
  sig_vampire: 'set',
  sig_colosse: 'set',
  sig_duelliste: 'set',
  sig_epineux: 'set',
  sig_frenetique: 'set',
  tr_quest: 'trophy',
  tr_dechainer: 'trophy',
  tr_achever: 'trophy',
  tr_annuler: 'trophy',
  tr_retourner: 'trophy',
  tr_etaler: 'trophy',
  tr_desarmer: 'trophy',
  tr_renvoyer: 'trophy',
  tr_accelerer: 'trophy',
};

const SET_SIG_BY_ID = new Map(Object.values(SET_SIGNATURES).map((x) => [x.id, x]));

/**
 * ⚔️ Le nom et l'emoji d'une compétence qui a mordu — pour le rejeu et le rapport.
 *
 * ⚠️ Rend `undefined` plutôt que d'inventer un nom : une compétence retirée d'une table
 * cesse simplement de s'afficher, elle ne fait pas tomber un écran de combat.
 */
export function combatSkillInfo(skill: CombatSkill): { emoji: string; name: string } | undefined {
  const where = SKILL_SOURCE[skill];
  if (where === 'sig') {
    // ⚠️ Les ids de signature sont les `EffectType` SANS leur suffixe `_pct` — un seul mot
    // pour la stat et pour son déclenchement, donc aucune table de correspondance à tenir.
    const info = ADV_SIGNATURE_INFO[(skill + '_pct') as EffectType];
    return info ? { emoji: info.emoji, name: info.name } : undefined;
  }
  // 🏆 Trophée : `tr_quest` = la quête accomplie ; `tr_<pouvoir>` = son effet.
  if (where === 'trophy') {
    if (skill === 'tr_quest') return { emoji: '🏆', name: 'Quête accomplie' };
    const p = trophyPowerOf(skill.slice('tr_'.length));
    return p ? { emoji: p.emoji, name: p.name } : undefined;
  }
  // 🔮 Pouvoir de relique : l'id de la compétence est `rp_` + celui du pouvoir.
  if (where === 'relic') {
    const p = relicPowerOf(skill.slice('rp_'.length));
    return p ? { emoji: p.emoji, name: p.name } : undefined;
  }
  const src = where === 'proc' ? legendaryOf({ legendary: skill }) : SET_SIG_BY_ID.get(skill);
  return src ? { emoji: src.emoji, name: src.name } : undefined;
}

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
  // 🏅 Un champion n'a pas de chemin à habiller : c'est sa RARETÉ EFFECTIVE qui l'habille,
  // sur les quatre emplacements. ⚠️ L'EFFECTIVE et non celle qu'on a tirée — un primordial
  // au niveau 1 ne doit pas porter des atours qu'il ne peut pas mener (`advRarity`), sinon
  // le portrait promettrait ce que le combat refuse.
  if (adv.championId) {
    const r = advRarity(adv);
    return {
      profile,
      gear: Object.fromEntries(ADV_AVATAR_SLOTS.map((s) => [s, r])),
    };
  }
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
/** ⚠️ EXPORTÉE pour les CHAMPIONS (`gacha.championStats`) : une seconde écriture de la
 *  courbe de niveau divergerait au premier réglage, et c'est précisément sur ce facteur
 *  que repose « un commun investi bat un primordial nu » (×11,5 sur 71 niveaux). */
export const ADV_LEVEL_K = 0.15;

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

/** Un aventurier : un CHEMIN de classes (une par strate franchie) et un niveau gagné en
 *  travaillant. ⚠️ Aucune rareté n'est stockée : elle se DÉDUIT de la longueur du chemin,
 *  donc elle ne peut pas mentir. */
export interface Adventurer {
  id: string;
  name: string;
  /** Graine figée à la création : c'est elle qui décide des propositions reçues, donc
   *  deux aventuriers de la même classe n'ont pas le même destin. */
  seed: number;
  /** Ids de classe, du plus ancien au plus récent. `path[0]` = la classe de départ.
   *  ⚠️ VIDE pour un CHAMPION : il n'a pas de chemin, il a une identité (`championId`). */
  path: string[];
  /**
   * 🏅 L'id du CHAMPION qu'il EST, quand il en est un — sinon absent.
   *
   * ⚠️ **UNE IDENTITÉ, PAS UN CHEMIN.** C'est toute la correction de la v0.939 : les deux
   * versions précédentes de la spec faisaient d'un champion un CHEMIN dans l'arbre des
   * classes, donc son identité était indéfinissable, donc les **doublons** impossibles,
   * donc l'Éveil, donc le cœur du gacha. Un id, et les doublons existent.
   *
   * ⚠️ **ADDITIF** : un aventurier sans `championId` garde EXACTEMENT le comportement
   * d'aujourd'hui, chemin de classes compris — aucune migration, et les deux systèmes
   * cohabitent le temps de la bascule.
   */
  championId?: string;
  /** Combien d'exemplaires on possède de ce champion. ⚠️ C'est ce compte qui porte l'Éveil
   *  (`awakenLevel`) : la PREMIÈRE copie est le champion, les suivantes le réveillent. */
  copies?: number;
  level: number;
  xp: number;
  /** ⬆️ Rang (index de `CHARACTER_RANKS`) ouvert par ASCENSION — son XP s'arrête au ★5 de ce
   *  rang (`advAscensionCap`). ⚠️ ABSENT = le rang de son niveau actuel : un champion d'avant
   *  la règle n'a donc rien à rattraper, il bute simplement sur la fin de son rang. */
  ascended?: number;
  /** Occupé jusqu'à (escorte, camp, incursion) — ms epoch. */
  busyUntil?: number;
  /** Blessé jusqu'à — ms epoch. Soigné plus vite par l'Infirmerie, comme le héros. */
  hurtUntil?: number;
  // ⚠️ Plus de COMPAGNON ni de TALENT (v0.996) : familiers et talents sont réservés au
  // HÉROS. Les champs `familiarId`/`talentId` des sauvegardes d'avant ne sont plus lus
  // (et sont retirés au chargement). Ce qu'ils apportaient est rendu par `CHAMPION_SOLO`.
  /** ÉQUIPEMENT — ids de pièces du stock d'aventurier, un par emplacement.
   *  ⚠️ L'appariement vit SUR l'aventurier : la pièce suit son homme.
   *  Absent = rien de porté (tous les aventuriers d'avant). */
  gear?: Partial<Record<'weapon' | 'armor' | 'accessory' | 'relic', string>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏅 UN CHAMPION À LA PLACE D'UN AVENTURIER
// ─────────────────────────────────────────────────────────────────────────────

/** Le champion qu'il EST, ou `undefined` s'il suit encore un chemin de classes.
 *  ⚠️ Un id qui ne désigne plus rien rend `undefined` plutôt que de faire tomber le
 *  combat — la règle des familiers et des talents appariés (v0.758). */
export function advChampion(adv: Adventurer): Champion | undefined {
  if (!adv.championId) return undefined;
  // 📏 Les champions de l'ÉTALON (`ref:…`) ne sont pas au roster : ils n'existent que pour
  // mesurer (cf. `REF_CHAMPIONS_BY_RANK`).
  return CHAMPION_BY_ID.get(adv.championId) ?? REF_CHAMPION_BY_ID.get(adv.championId);
}

/** 🏷️ Le nom d'un champion est COPIÉ dans le vivier au tirage (`grantChampion`) : quand le
 *  roster est renommé (v0.1106, noms de gacha), les champions déjà tirés gardaient l'ancien.
 *  On le relit au chargement — le roster fait foi, l'id ne change jamais. Rend le MÊME objet
 *  quand rien ne change (pas d'écriture pour rien). Un aventurier legacy garde son prénom. */
export function syncChampionName(adv: Adventurer): Adventurer {
  const champ = adv.championId ? CHAMPION_BY_ID.get(adv.championId) : undefined;
  return champ && adv.name !== champ.name ? { ...adv, name: champ.name } : adv;
}

/** Son rang d'Éveil, dérivé du nombre d'exemplaires. */
export function advAwaken(adv: Adventurer): number {
  return awakenLevel(adv.copies ?? 1);
}

/** Ce qu'un cran d'Éveil vaut, en % de stats (arrondi) — le barème COMMUN `AWAKEN.perStep`. */
function awakenPct(lvl: number): number {
  return Math.round((awakenMult(lvl) - 1) * 100);
}

/**
 * ✨ **CE QUE VEUT DIRE « ÉVEIL »**, pour CE champion (demandé : « quand je clique sur
 * Éveil, me dire ce que ça signifie »). Une pastille « ✨ Éveil 3 » ne dit rien à qui ne
 * connaît pas le genre : d'où il vient (les doublons), ce qu'il rapporte (en %, calculé
 * par `awakenMult`, jamais recopié), ses crans ÉCRITS (une signature qui monte) et ce que
 * rapportera le suivant. ⚠️ Pur : l'écran ne fait que l'afficher.
 */
export function awakenExplain(adv: Adventurer): { title: string; intro: string; lines: string[] } {
  const champ = advChampion(adv);
  const title = `✨ Éveil de ${adv.name}`;
  if (!champ) {
    return {
      title,
      intro:
        'L’Éveil appartient aux champions invoqués : chaque doublon tiré réveille le champion d’un cran. Cet aventurier vient d’avant les champions, il n’en a pas.',
      lines: [],
    };
  }
  const lvl = advAwaken(adv);
  const lines = [`Actuellement : Éveil ${lvl}/${AWAKEN.max} — +${awakenPct(lvl)} % de stats.`];
  for (const s of [...champ.awaken].sort((a, b) => a.at - b.at)) {
    const sig = ADV_SIGNATURE_INFO[s.skill];
    lines.push(
      `${lvl >= s.at ? '✅' : '🔒'} Éveil ${s.at} : ${sig ? `${sig.emoji} ${sig.name}` : 'sa signature'} gagne un niveau.`,
    );
  }
  lines.push(
    lvl < AWAKEN.max
      ? `Prochain doublon : Éveil ${lvl + 1} → +${awakenPct(lvl + 1)} % de stats.`
      : 'Éveil au maximum : les prochains doublons se convertissent en pierres de mana 💠.',
  );
  return {
    title,
    intro: `L’Éveil, ce sont les doublons : chaque fois que tu retires ${adv.name}, il se réveille d’un cran (${AWAKEN.max} au maximum) et devient plus fort.`,
    lines,
  };
}

/** Stats de l'aventurier : le chemin de classes donne la FORME et le volume de base,
 *  le niveau multiplie. Chaque strate distribue son budget selon les parts de la classe. */
export function advStats(adv: Adventurer): {
  puissance: number;
  endurance: number;
  agilite: number;
} {
  // 🏅 Un champion n'a pas de chemin à cumuler : sa rareté DIT son budget, sa forme le
  // répartit, et ses doublons le multiplient. Même courbe de niveau, quelques lignes plus bas.
  const champ = advChampion(adv);
  if (champ) return championStats(champ, adv.level, adv.copies ?? 1);
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
  // ⚠️ Pour un champion, c'est son RANG (son niveau) — jamais sa lettre (refonte 2026-09-21).
  // C'est lui qui borne son équipement : un S tiré au niveau 1 porte du
  // Bronze, comme un A. « Le sport est le plafond » passe par le NIVEAU, pas par l'étiquette.
  if (advChampion(adv)) return RANK_ORDER[prestigeRankIndex(Math.max(1, adv.level))]!;
  const top = adv.path.reduce((m, id) => Math.max(m, advClass(id)?.stratum ?? 0), 0);
  return RANK_ORDER[Math.min(RANK_ORDER.length - 1, top)]!;
}

/**
 * 🎰 LA LETTRE d'un champion (S ou A) — ce qu'on a TIRÉ, fixe à vie (refonte 2026-09-21).
 * `null` pour un aventurier legacy (sans identité de champion).
 */
export function advGrade(adv: Adventurer): ChampionGrade | null {
  return advChampion(adv)?.grade ?? null;
}

/** 🎰 Ce que la tuile d'un champion affiche comme « rareté » : sa LETTRE (S / A) dans sa
 *  couleur. ⚠️ Source unique des trois écrans (portrait, tuile d'escorte, fiche) — un
 *  legacy sans lettre garde sa rareté de classe. */
export function advGradeBadge(adv: Adventurer): { label: string; color: string } {
  const g = advGrade(adv);
  if (g) return { label: g, color: GRADE_COLOR[g] };
  const r = advRarity(adv);
  return { label: RARITY_LABEL[r], color: RANK_COLOR[r] };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏅 LE BUDGET DE STATS D'UN CHAMPION — et le plafond qui garde le sport au sommet
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Budget de stats par rareté. `round(20 × (106/20)^(i/7))`.
 *
 * ⚠️ **LE PLANCHER EST À 20, ET C'EST MESURÉ.** Le rang multiplie les stats par **×11,5**
 * (`ADV_LEVEL_K` 0,15 sur 71 niveaux). Pour qu'un **commun investi batte un primordial nu**
 * — la propriété que tous les gachas défendent — l'écart de rareté doit rester sous ce
 * facteur. La table d'aujourd'hui (cumul le long d'un chemin de classes) va de 6 à 106,
 * soit **×17,7** : mesuré, 6 × 11,5 = 69 **perd** contre 106. Avec le plancher à 20 :
 * 230 contre 106, **la propriété tient**.
 *
 * ⚠️ **SEUL LE PLANCHER BOUGE — garder 106 en haut est non négociable** : c'est lui qui
 * tient tout l'équilibrage de fin de partie (`refAdventurer` et sept fichiers de test).
 */
export const RARITY_BUDGET: number[] = RANK_ORDER.map((_, i) =>
  Math.round(20 * (106 / 20) ** (i / 7)),
);

/**
 * 🎰 Ce que vaut une lettre, en part du budget de son RANG (refonte 2026-09-21).
 *
 * ⚠️ **S = 1, et c'est ce qui garde toute la calibration des combats intacte** : l'étalon
 * (`refChampions`) prend des S au niveau du joueur, donc son budget est EXACTEMENT celui
 * d'avant (`RARITY_BUDGET` au rang du joueur). Convois, sièges, camps et failles ne bougent
 * pas.
 *
 * ⚠️ **A = 1 / 1,45** : un A à Éveil complet (×1,48) vaut un S nu — le contrat du genre
 * (4★ C6 ≈ 5★ C0), mesuré en P0. À Éveil égal, le S gagne toujours ; et le niveau domine
 * la lettre (×11,5 sur la plage), donc un A investi bat un S nu.
 */
export const GRADE_BUDGET: Record<ChampionGrade, number> = { S: 1, A: 1 / 1.45 };

/**
 * 🏅 Le budget de stats d'un champion : celui de son **RANG** (son niveau), × sa lettre.
 *
 * ⚠️ **« LE SPORT EST LE PLAFOND » PASSE DÉSORMAIS PAR LE NIVEAU**, plus par l'étiquette :
 * le niveau d'un champion est borné par le Panthéon, lui-même borné par le niveau du
 * joueur. Un S tiré au niveau 5 n'a que le budget du rang Bronze — mais il RESTE un S
 * (l'ancien plafonnement de la rareté affichée, v0.938, rendait le jackpot invisible).
 */
export function championBudget(grade: ChampionGrade, level: number): number {
  return RARITY_BUDGET[prestigeRankIndex(Math.max(1, level))]! * GRADE_BUDGET[grade];
}

// ─────────────────────────────────────────────────────────────────────────────
// ✨ L'ÉVEIL — ce que font les doublons
// ─────────────────────────────────────────────────────────────────────────────

export const AWAKEN = {
  /** Nombre de crans, à la Genshin (C1-C6). */
  max: 6,
  /** Ce qu'un cran ajoute en MAGNITUDE, en part du budget. ⚠️ Barème COMMUN à tous les
   *  champions : tout écrire, ce serait 6 crans × 32 champions = **192 effets** à écrire ET
   *  à équilibrer, dont chacun peut casser le combat (le moteur applique ce qu'on lui
   *  donne). Le barème borne l'écriture à ~64 lignes.
   *
   *  ⚠️ **MESURÉ : UN ÉVEIL COMPLET (×1,48) VAUT UN CRAN DE RARETÉ, JAMAIS DEUX.** Le pas
   *  entre deux raretés voisines vaut ×1,25 à ×1,28 (régulier sur toute l'échelle), donc un
   *  C6 dépasse la rareté juste au-dessus et n'atteint jamais la suivante. **C'est le
   *  contrat assumé du genre** (un 4★ C6 vaut un 5★ C0) : la collection rattrape la chance
   *  d'UN cran, pas plus — et à Éveil ÉGAL la rareté gagne toujours, ce qui préserve le
   *  tirage. ⚠️ Rester SOUS un cran demanderait `perStep ≤ 0,042`, soit un Éveil complet
   *  imperceptible — donc pas d'Éveil du tout. Deux tests bornent les deux côtés.
   *
   *  ⚠️ La v0.939 justifiait ce barème en le comparant au **×5,3 entre les EXTRÊMES** de
   *  l'échelle : le mauvais écart. Ce qui décide, c'est le pas entre raretés VOISINES. */
  perStep: 0.08,
} as const;

/**
 * ✨ Rang d'Éveil pour `copies` exemplaires — **la première copie EST le champion**.
 *
 * ⚠️ **PLAFONNÉ, et un doublon au-delà n'est JAMAIS perdu** : il se convertit (en pierres
 * de mana). Sinon un joueur chanceux reçoit du vide, ce qui est exactement ce qu'un gacha
 * ne doit jamais faire.
 */
export function awakenLevel(copies: number): number {
  return Math.max(0, Math.min(AWAKEN.max, Math.floor(copies) - 1));
}

/** Vrai si cette copie-là ne monte plus rien (elle se convertit). */
export function awakenOverflow(copies: number): boolean {
  return awakenLevel(copies) >= AWAKEN.max && Math.floor(copies) - 1 > AWAKEN.max;
}

/** Multiplicateur de magnitude au rang d'Éveil `lvl`. */
export function awakenMult(lvl: number): number {
  return 1 + AWAKEN.perStep * Math.max(0, Math.min(AWAKEN.max, lvl));
}

/**
 * ✨ Niveau d'une SIGNATURE, crans écrits compris.
 *
 * ⚠️ **AUCUN SYSTÈME NEUF** : `AdvSkill` porte déjà un niveau par répétition (v0.757 — une
 * compétence portée deux fois vaut niveau 2), et l'écran sait déjà l'afficher. Un cran
 * qualitatif, c'est **+1 niveau**, rien de plus.
 */
export function championSkillLevel(
  champ: { skills: readonly string[]; awaken: readonly { at: number; skill: string }[] },
  skill: string,
  awakenLvl: number,
): number {
  if (!champ.skills.includes(skill)) return 0;
  const gagnes = champ.awaken.filter((a) => a.skill === skill && a.at <= awakenLvl).length;
  return 1 + gagnes;
}

/**
 * 🐾🧠 CE QUE LES COMPAGNONS APPORTAIENT, RENDU DANS LA BASE (v0.996, mesuré ; décision de
 * l'utilisateur : « enlève les talents et les familiers des champions, on les garde pour
 * le héros uniquement », avec compensation « à l'identique »).
 *
 * ⚠️ MESURÉ, pas choisi : pour chaque champion de RÉFÉRENCE (`refChampionAdv`, équipé de
 * `refAdvGear`), on a cherché par bisection le multiplicateur de stats qui redonne la
 * puissance (`combatPowerRaw`) qu'il avait avec un familier de référence (rang droppable,
 * jet 0,3, niveau d'objet à niveau) ET un talent de référence (même rang, même jet).
 * Moyenne des trois orientations : **×1,13 (niv 3) · 1,12 (12) · 1,12 (20) · 1,09 (30) ·
 * 1,10 (45) · 1,15 (60) · 1,15-1,21 (80) · 1,16-1,22 (100)**. En puissance, familier +
 * talent valaient **+3,5 à +5 %** jusqu'au niveau 20, **+6 à +12 %** aux niveaux 30-45 et
 * **+15 à +25 %** au-delà de 60 — d'où une courbe qui monte en fin de partie.
 *
 * ⚠️ PLAT à `base` jusqu'au niveau `from`, puis linéaire jusqu'à `top` au niveau
 * `to` : ce qu'un familier rapporte suit sa rareté, qui s'envole en fin de partie.
 *
 * ⚠️ APPLIQUÉ À L'ÉTALON AUSSI (`refChampionAdv` passe par `championStats`), et c'est ce
 * qui garde la route, les camps et les failles calibrés : la référence perd son compagnon
 * et gagne la même puissance en stats. Seuls les SIÈGES (calibrés sur le héros) auraient
 * senti le retrait — la compensation les tient au même niveau.
 */
export const CHAMPION_SOLO = { base: 1.12, from: 40, to: 80, top: 1.18 } as const;

export function championSoloMult(level: number): number {
  const { base, from, to, top } = CHAMPION_SOLO;
  const t = Math.min(1, Math.max(0, (level - from) / (to - from)));
  return base + (top - base) * t;
}

/**
 * 🏅 Les stats d'un champion : son budget (plafonné par le rang du joueur) réparti sur sa
 * forme, × le niveau, × l'Éveil, × ce que ses compagnons lui apportaient (`CHAMPION_SOLO`).
 *
 * ⚠️ **LA COURBE DE NIVEAU EST CELLE DES AVENTURIERS** — la MÊME expression qu'`advStats`,
 * cent lignes plus haut, et c'est pour ça que ce bloc vit ICI : c'est
 * sur ce facteur ×11,5 que repose « un commun investi bat un primordial nu », et une
 * seconde écriture divergerait au premier réglage.
 *
 * ⚠️ **LE NIVEAU DU CHAMPION EST BORNÉ PAR CELUI DU JOUEUR**, comme les aventuriers
 * aujourd'hui (mesuré v0.905 : le niveau d'un aventurier ÉGALE celui du joueur, c'est la
 * Guilde qui bride). Sans ça, un champion pourrait dépasser le sport.
 */
export function championStats(
  champ: Champion,
  playerLevel: number,
  copies = 1,
): { puissance: number; endurance: number; agilite: number } {
  const budget = championBudget(champ.grade, playerLevel) * awakenMult(awakenLevel(copies));
  // ⚠️ Le niveau d'un champion EST celui du joueur — pas un second compteur à borner.
  // Mesuré (v0.905) : le niveau d'un aventurier égale déjà exactement celui du joueur,
  // c'est la Guilde qui bride. Un `Math.min(playerLevel, playerLevel)` aurait été un garde
  // incapable de mordre, le motif qu'on vient de supprimer deux fois dans ce module.
  const mult =
    (1 + ADV_LEVEL_K * (Math.max(1, playerLevel) - 1)) * championSoloMult(Math.max(1, playerLevel));
  const { p, e, a } = champ.form;
  const sum = Math.max(1, p + e + a);
  return {
    puissance: Math.round(((budget * p) / sum) * mult),
    endurance: Math.round(((budget * e) / sum) * mult),
    agilite: Math.round(((budget * a) / sum) * mult),
  };
}

/** XP nécessaire pour passer du niveau `level` au suivant. Mesuré avec l'ANCIEN `missionXp`
 *  (socle × bonus forfaitaire par embuscade traversée), AVANT la v0.864 : ~8 missions pour
 *  le niveau 2, 38 pour le 5, 118 pour le 8, 255 pour le 23. ⚠️ Depuis la v0.864 l'XP de
 *  combat est la part des bandits ABATTUS (`skirmishXpShares`) : ces comptes de missions
 *  n'ont pas été re-mesurés.
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
  /** ⬆️ Il vient de BUTER sur le ★5 de son rang : l'XP s'arrête jusqu'à l'ascension. Dit
   *  à part, sinon « une étoile de plus » cacherait qu'il faut maintenant agir. */
  ascendReady: boolean;
}

/**
 * Compare un vivier AVANT et APRÈS un versement d’XP, et rend ce qu’il y a à DIRE.
 *
 * ⚠️ Le niveau d’un aventurier est CACHÉ : sans annonce, une mission qui lui fait gagner
 * une étoile ne se voit qu’en rouvrant la Guilde et en regardant une barre.
 *
 * ⚠️ ELLE N’ANNONCE PLUS DE PROMOTION (v0.951) : l’arbre de classes est parti avec les
 * aventuriers. Un champion ne se promeut pas — ses DOUBLONS le réveillent, et c’est
 * l’invocation qui l’annonce. Il ne reste donc que ce qui bouge vraiment : le rang et
 * l’étoile.
 */
export function advProgressOf(
  before: readonly Adventurer[],
  after: readonly Adventurer[],
): AdvProgress[] {
  const was = new Map(before.map((a) => [a.id, a]));
  const out: AdvProgress[] = [];
  for (const a of after) {
    const b = was.get(a.id);
    // Un aventurier qui n’existait pas avant n’a rien « gagné » : recruté entre-temps.
    if (!b) continue;
    const av = advRank(b);
    const ap = advRank(a);
    // ⚠️ Le ★5 tombe AVANT le blocage (niveau 9 puis 10) : buter sur le plafond ne change
    // donc plus d'étoile, et une annonce lue sur les seules étoiles le taisait.
    const ascendReady =
      advNextAscension(a) != null && a.level >= advAscensionCap(a) && b.level < advAscensionCap(a);
    if (ap.tier <= av.tier && !ascendReady) continue;
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
      ascendReady,
    });
  }
  return out;
}

/** L'XP TOTALE accumulée par un aventurier (niveaux gagnés + réserve). Une ascension, un
 *  soin ou une formation ne la changent pas : comparer deux instantanés dit donc ce qu'une
 *  mission a appris, quelle que soit la source. */
export function advTotalXp(a: Adventurer): number {
  let t = Math.max(0, a.xp);
  for (let l = 1; l < a.level; l++) t += advXpToNext(l);
  return t;
}

/** Un morceau de la barre d'étoile : du `from` au `to` (0..1) DANS l'étoile `star` du rang. */
export interface AdvXpSegment {
  star: number;
  rankName: string;
  rankEmoji: string;
  rankColor: string;
  from: number;
  to: number;
  /** La barre atteint le bout ET l'étoile est gagnée : on la célèbre avant de repartir. */
  starUp: boolean;
  /** L'étoile gagnée ouvre un NOUVEAU rang (★5 → ★1 du rang suivant). */
  rankUp: boolean;
}

/** Ce qu'une mission a fait avancer un aventurier, découpé étoile par étoile — la matière de
 *  la barre animée au retour. */
export interface AdvXpTrack {
  id: string;
  name: string;
  championId?: string;
  /** XP réellement gagnée (différence d'XP totale). */
  xp: number;
  /** Au moins un segment ; plusieurs si des étoiles tombent pendant la mission. */
  segments: AdvXpSegment[];
  /** Il vient de buter sur le ★5 de son rang : l'XP s'arrête jusqu'à l'ascension. */
  ascendReady: boolean;
}

/**
 * La barre d'avancement vers l'étoile suivante, AVANT → APRÈS une mission.
 *
 * ⚠️ Le niveau est CACHÉ : entre deux étoiles, « +142 XP » ne dit pas si l'on est près de
 * la prochaine. La barre le dit — et c'est le cas le plus fréquent (la plupart des missions
 * ne font gagner aucune étoile, et l'annonce d'étoile ne jouait donc rien).
 *
 * ⚠️ Les segments se lisent sur le CRAN GLOBAL (`advRank().tier`), monotone, jamais sur
 * l'étoile seule qui retombe de ★5 à ★1 au passage de rang. Les deux bouts viennent de
 * `advRankProgress`, la barre de la Guilde : on anime exactement ce qu'elle affichera.
 */
export function advXpTracks(
  before: readonly Adventurer[],
  after: readonly Adventurer[],
): AdvXpTrack[] {
  const was = new Map(before.map((a) => [a.id, a]));
  const out: AdvXpTrack[] = [];
  for (const a of after) {
    const b = was.get(a.id);
    if (!b) continue;
    const xp = advTotalXp(a) - advTotalXp(b);
    if (xp <= 0) continue;
    const t0 = advRank(b).tier;
    const t1 = Math.max(t0, advRank(a).tier);
    const p0 = advRankProgress(b);
    const p1 = advRankProgress(a);
    const segments: AdvXpSegment[] = [];
    for (let t = t0; t <= t1; t++) {
      const rankIndex = Math.floor(t / ADV_STARS);
      const r = CHARACTER_RANKS[rankIndex]!;
      const from = t === t0 ? p0 : 0;
      const to = t === t1 ? Math.max(from, p1) : 1;
      segments.push({
        star: (t % ADV_STARS) + 1,
        rankName: r.name,
        rankEmoji: r.emoji,
        rankColor: r.color,
        from,
        to,
        starUp: t < t1,
        rankUp: t < t1 && Math.floor((t + 1) / ADV_STARS) > rankIndex,
      });
    }
    const ascendReady =
      advNextAscension(a) != null && a.level >= advAscensionCap(a) && b.level < advAscensionCap(a);
    out.push({
      id: a.id,
      name: a.name,
      ...(a.championId ? { championId: a.championId } : {}),
      xp,
      segments,
      ascendReady,
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
  // rang suivant, mais sa classe n’a pas suivi — et c’est la CLASSE qui borne son
  // équipement (`canWearAdvGear`). Afficher « Argent » à qui ne peut porter que du
  // Bronze ferait mentir la règle. Il reste donc à son rang, ★★★★★ :
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
  // ⚠️ Pour un champion, le rang affiché est celui de son NIVEAU (`advRarity`, source
  // unique depuis la refonte S/A) : sa lettre ne borne rien, son niveau borne tout.
  if (adv.championId) return RARITY_RANK[advRarity(adv)] ?? 0;
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
 * La puissance vient de l’APPELANT (`adventurerPowers`, équipement compris) : ce module ne
 * connaît pas le stock d’équipement.
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

/**
 * 🗂️ Le vivier RANGÉ PAR LETTRE (S puis A), et dans chacune l'ordre de
 * `compareAdventurers` (rang, étoile, expérience, puissance). Une lettre absente du vivier
 * n'a pas de section.
 *
 * ⚠️ Un aventurier LEGACY (sans champion) n'a pas de lettre : il se range avec les A.
 * ⚠️ On COPIE : `advList` garde l'ordre du vivier, dont dépendent d'autres règles.
 */
export function groupByGrade(
  advs: readonly Adventurer[],
  powerOf: (x: Adventurer) => number,
): { grade: ChampionGrade; advs: Adventurer[] }[] {
  const out: { grade: ChampionGrade; advs: Adventurer[] }[] = [];
  for (const grade of ['S', 'A'] as const) {
    const list = advs.filter((a) => (advGrade(a) ?? 'A') === grade);
    if (list.length)
      out.push({ grade, advs: list.sort((x, y) => compareAdventurers(x, y, powerOf)) });
  }
  return out;
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

/** Nom de métier courant = la classe la plus récente. */
export function advTitle(adv: Adventurer): { emoji: string; label: string } | undefined {
  // 🏅 Un champion EST son propre titre : il n'a pas de métier courant, il a un nom.
  // ⚠️ Le type de retour se resserre à `{ emoji, label }` — la PART d'`AdvClass` que les
  // six écrans lisaient réellement (vérifié un par un). Rendre un `AdvClass` synthétique
  // aurait obligé à inventer une strate, des poids et des tags qu'un champion n'a pas,
  // et le premier lecteur de ces champs bidons aurait menti en silence.
  const champ = advChampion(adv);
  if (champ) return { emoji: champ.emoji, label: champ.name };
  const c = adv.path.length ? advClass(adv.path[adv.path.length - 1]!) : undefined;
  return c ? { emoji: c.emoji, label: c.label } : undefined;
}

/**
 * Son SOUS-TITRE : sa classe — et rien du tout quand elle répète son nom.
 *
 * ⚠️ `advTitle` rend le **nom** d'un champion (il n'a pas de métier courant, il a un nom),
 * si bien qu'un écran qui affiche les deux écrit « Aurore Première » sous « Aurore
 * Première ». Depuis le wipe, tout le vivier est fait de champions : le doublon est donc
 * systématique. La comparaison au nom garde la ligne utile aux aventuriers **legacy**, où
 * elle dit bien la classe — leur seule identité.
 *
 * ⚠️ **EN LIB, parce que DEUX écrans posaient la même question** (le portrait du vivier et
 * la fiche) : recopiée, cette règle aurait divergé au premier ajustement, et le même
 * aventurier se serait lu différemment d'un écran à l'autre.
 */
export function advSubtitle(adv: Adventurer): string {
  const l = advTitle(adv)?.label;
  return l && l !== adv.name ? l : '';
}

/** Signatures portées par le chemin (les strates hautes en donnent une). */
export function advSignatures(adv: Adventurer): EffectType[] {
  const champ = advChampion(adv);
  // ⚠️ ON RÉPÈTE CHAQUE SIGNATURE AUTANT DE FOIS QUE SON NIVEAU, et c'est ce qui fait que
  // l'Éveil ne demande AUCUN système neuf : `levelsOf` compte déjà les occurrences (v0.757),
  // donc `advSignatureLevels`, `advBadges` et tous les écrans en aval suivent sans une
  // ligne de plus. Un cran d'Éveil qualitatif, c'est +1 occurrence.
  if (champ) {
    const lvl = advAwaken(adv);
    return champ.skills.flatMap((s) =>
      Array.from({ length: championSkillLevel(champ, s, lvl) }, () => s),
    );
  }
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
  // ⚠️ Un champion porte 0 ou 1 rôle — `null` est un choix du roster, pas un oubli : un
  // champion peut n'être qu'un combattant.
  // ⚠️ MAIS AUCUN CHAMPION N'EST DANS CE CAS AUJOURD'HUI, et deux règles se contredisent :
  // le TYPE prévoit `null`, la GRILLE l'interdit (4 rôles distincts sur les 4 champions de
  // chaque rareté, testé). La branche est donc inatteignable — elle n'est pas un garde
  // dormant qu'on pourrait supprimer pour autant : sans elle, `[champ.role]` vaudrait
  // `(AdvRole | null)[]` et ne compilerait pas. C'est une porte ouverte pour un roster
  // élargi (la règle d'extension ajoute en HAUT, où une rareté peut dépasser 4 places).
  const champ = advChampion(adv);
  if (champ) return champ.role ? [champ.role] : [];
  return adv.path.map((id) => advClass(id)?.role).filter((r): r is AdvRole => !!r);
}

/**
 * 🗿 COMBIEN DE CHAMPIONS PEUVENT AGIR **EN MÊME TEMPS** — 1 de base, +1 tous les 2
 * niveaux de Panthéon.
 *
 * ⚠️ C'est un plafond **PAR ENGAGEMENT**, jamais un banc : toute la collection reste
 * utilisable, et on choisit à chaque fois QUI part et QUI monte au rempart. Un plafond
 * GLOBAL (v0.948→0.951) rendait mort-né le champion tiré en trop — l'inverse de ce qu'un
 * gacha promet. Ce qui est borné, c'est ce qui AGIT ; ce qu'on POSSÈDE ne l'est pas.
 *
 * ⚠️ **IL RESTE PORTEUR, et c'est mesuré** : `guardUnits` fait défendre tout le vivier
 * qu'on lui passe, et un groupe envoyé sur un camp n'a AUCUN maximum (`escortMax` ne vaut
 * que pour les convois). Sans lui — tenue d'un siège, enceinte à niveau, sans héros —
 * **11 % à 0 champion, 65 % à 5, 95 % à 10, 100 % à 20** au niveau 12 ; 51 % → 100 % à 40
 * au niveau 30. Une collection illimitée rendrait la base imprenable, et **les convois n'y
 * changent rien** : ils bornent le nombre de CONVOIS, pas la défense ni les camps.
 *
 * ⚠️ La formule est celle de la Guilde reprise TELLE QUELLE — déjà mesurée. Le niveau du
 * Panthéon étant plafonné par celui du joueur, l'effectif reste indexé sur le SPORT, mais
 * LINÉAIREMENT là où la puissance du héros croît en ~L⁴ : c'est ce qui garde la boucle
 * accessible à un joueur peu sportif.
 */
export function engageCap(pantheonLevel: number): number {
  // ⚠️ Le `Math.max(0, …)` est DORMANT — un niveau de bâtiment vient de `buildingLevel`,
  // qui rend 0 au minimum, donc la mutation qui le retire survit. Il reste parce que c'est
  // la formule de la Guilde reprise TELLE QUELLE : la retirer ferait diverger l'effectif
  // de la courbe déjà mesurée, pour rien.
  return 1 + Math.floor(Math.max(0, pantheonLevel) / 2);
}

/**
 * ⬆️ LE RANG OUVERT PAR ASCENSION (v0.1014, étape B de la spec ascension/éveil ; décision de
 * l'utilisateur : « une fois monté rang Bronze ★5, il faudrait des ressources (et l'XP) pour
 * passer Argent ★1 »).
 *
 * ⚠️ ABSENT = le rang de son niveau ACTUEL : aucun champion d'avant la règle n'a de retard à
 * rattraper — il bute simplement sur la fin du rang où il se trouve.
 */
export function advAscendedRank(adv: Adventurer): number {
  const last = CHARACTER_RANKS.length - 1;
  const r = adv.ascended ?? characterRank(Math.max(1, adv.level)).rankIndex;
  return Math.max(0, Math.min(last, Math.floor(r)));
}

/** Le niveau le plus haut que son ascension lui permet : le ★5 du rang ouvert (niveau 10,
 *  20, …). ⚠️ Le DERNIER rang court jusqu'au plafond du jeu : il n'y a plus rien à ouvrir. */
export function advAscensionCap(adv: Adventurer): number {
  const r = advAscendedRank(adv);
  return r >= CHARACTER_RANKS.length - 1 ? ADV_MAX_LEVEL : rankStartLevel(r + 1) - 1;
}

/** Le rang que la PROCHAINE ascension ouvrirait, ou `null` s'il n'y en a plus. */
export function advNextAscension(adv: Adventurer): number | null {
  const r = advAscendedRank(adv);
  return r >= CHARACTER_RANKS.length - 1 ? null : r + 1;
}

/**
 * Applique une ascension : le rang suivant s'ouvre, puis l'XP mise de côté au plafond est
 * REVERSÉE (`grantAdvXp` à 0) — un champion qui a continué de travailler bloqué à ★5
 * récupère aussitôt ses niveaux. ⚠️ Ne vérifie NI le coût NI le Panthéon : c'est
 * `ascensionBlocker` (`ascension.ts`) qui décide si c'est permis. Pur.
 */
export function ascendAdventurer(adv: Adventurer, pantheonLevel: number): Adventurer {
  const next = advNextAscension(adv);
  if (next == null) return adv;
  return grantAdvXp({ ...adv, ascended: next }, 0, pantheonLevel);
}

/** Applique l’XP gagnée : montées de niveau EN CHAÎNE (un gros voyage peut en donner
 *  plusieurs), plafonnées par la Guilde.
 *
 *  ⚠️ Au plafond, l’XP EXCÉDENTAIRE EST CONSERVÉE et non jetée : quand la Guilde monte,
 *  l’aventurier récupère aussitôt ce qu’il avait accumulé. Sinon un joueur peu sportif —
 *  celui dont le plafond bouge le plus lentement, donc exactement la cible de la
 *  feature — travaillerait des semaines pour rien. Pur : rend un NOUVEL aventurier. */
export function grantAdvXp(adv: Adventurer, xp: number, pantheonLevel: number): Adventurer {
  // ⚠️ DEUX plafonds, le plus bas gagne : le Panthéon (le sport, via son niveau) et
  // l'ASCENSION (la fin du rang ouvert). L'XP au-delà reste dans le pool dans les deux cas.
  const cap = Math.min(Math.max(1, pantheonLevel), advAscensionCap(adv));
  let level = adv.level;
  let pool = Math.max(0, adv.xp) + Math.max(0, Math.round(xp));
  while (level < cap && pool >= advXpToNext(level)) {
    pool -= advXpToNext(level);
    level++;
  }
  return { ...adv, level, xp: pool };
}

/** Pourquoi un aventurier ne peut PAS partir — `null` s'il est disponible.
 *  ⚠️ SOURCE UNIQUE de la disponibilité : `advAvailable` en DÉRIVE. Un écran qui dit
 *  POURQUOI quelqu'un est grisé ne peut donc jamais contredire le refus du store.
 *  Ordre : sur la route, puis à l'infirmerie (le premier qui s'applique). */
export type AdvUnavailable = 'busy' | 'hurt';
export function advUnavailableReason(adv: Adventurer, now: number): AdvUnavailable | null {
  if ((adv.busyUntil ?? 0) > now) return 'busy';
  if ((adv.hurtUntil ?? 0) > now) return 'hurt';
  // ⚠️ PLUS DE BANC ICI. Le plafond du Panthéon (`engageCap`) ne dit plus « ce champion
  // n'existe pas pour le jeu » mais « on n'en engage que N à la fois » : il s'applique à
  // l'ENGAGEMENT (taille d'un groupe, nombre de défenseurs au rempart), pas à la personne.
  return null;
}
export const ADV_UNAVAILABLE_LABEL: Record<AdvUnavailable, string> = {
  busy: '🧭 en route',
  hurt: '🤕 infirmerie',
};

/** Disponible ? Ni en mission, ni à l'infirmerie. */
export function advAvailable(adv: Adventurer, now: number): boolean {
  return advUnavailableReason(adv, now) === null;
}

/** OÙ RANGER un aventurier — sa catégorie, disponible compris.
 *
 *  ⚠️ DÉRIVÉE de `advUnavailableReason`, jamais recalculée : l'écran de la Guilde en avait
 *  sa propre version (`stateOf`) avec un ORDRE DIFFÉRENT (formation avant infirmerie), si
 *  bien qu'un aventurier blessé ET en formation — cas réel, une formation court pendant
 *  une convalescence (v0.739) — s'affichait « en formation » mais se serait rangé « à
 *  l'infirmerie ». Deux vérités sur le même écran valent moins qu'un ordre d'étiquetage
 *  légèrement différent ; l'information perdue (la formation qui court aussi) se dit dans
 *  le libellé plutôt que dans la catégorie. */
export type AdvStatus = AdvUnavailable | 'free';
export function advStatus(adv: Adventurer, now: number): AdvStatus {
  return advUnavailableReason(adv, now) ?? 'free';
}
/** Les catégories dans l'ordre où on les propose : ce qui peut partir d'abord. */
export const ADV_STATUSES: readonly AdvStatus[] = ['free', 'busy', 'hurt'];
export const ADV_STATUS_LABEL: Record<AdvStatus, string> = {
  free: '✅ disponibles',
  busy: '🧭 en expédition',
  hurt: '🛏️ infirmerie',
};
