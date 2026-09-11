// raid.ts — DÉFENSE DE LA BASE (pur/testable). Une armée marche sur ta ville : elle
// arrive à une heure CONNUE À L'AVANCE, que l'app soit ouverte ou non, et ce que tu as
// construit d'ici là décide de l'issue. Le jeu est la préparation ; la bataille est le
// verdict.
//
// ⚠️ RÈGLES FONDATRICES (elles expliquent la plupart des choix ci-dessous) :
//  1. On ne perd JAMAIS parce qu'on n'a pas ouvert l'app. Le siège se résout tout seul,
//     un seul en attente à la fois, et rien de ce que le SPORT a payé (niveau, stats,
//     objets) n'est en jeu — on ne risque que le rendement passif de la base.
//  2. Un siège PERDU envoie le héros à l'infirmerie : il est indisponible quelques
//     heures (`HeroWound`, abrégé par l'Infirmerie, et on peut toujours payer des soins
//     d'urgence en ferraille). Un simple malus de dégâts avait été essayé — sans mordant,
//     parce qu'on farme surtout du contenu qu'on domine. Ce que ça ne casse pas :
//     l'énergie ne se périme pas, donc une séance faite pendant la convalescence est
//     différée, jamais perdue. La blessure ne survient que sur une DÉFAITE, donc sa
//     présence au mur reste un pari gagnant — sinon la stratégie optimale serait de
//     l'envoyer en expédition les soirs de raid, et la mécanique se retournerait.
//  3. C'est OPT-IN : pas d'enceinte PRÊTE → pas d'attaque (cf. `raidsEnabled`).
//  4. Le siège est FINI et GAGNABLE. Une armée a un effectif : on la tient en entier ou
//     elle passe. (C'est la différence avec l'arène, dont la rampe géométrique garantit
//     la mort — un contresens ici, où investir doit pouvoir payer par une victoire nette.)
//
// NB `Date.now()` n'est PAS utilisé ici : le `now` (ms epoch) est TOUJOURS passé par
// l'appelant → fonctions pures et testables, résolution déterministe hors-ligne.
import { combatPower, mulberry32, type Combatant } from './combat';
import { refFighter } from './proceduralContent';
import {
  rollDrop,
  famLevel,
  famAtkMult,
  famDefMult,
  rankIndex,
  RANK_ORDER,
  RARITY_LABEL,
  mergeEffects,
  type AggregatedEffects,
  type Item,
} from './items';
import { escortCombatant, companionEffects, advTalentEffects, COMPANION_K } from './caravan';
import { type TalentInstance } from './talents';
import { beyondCap } from './buildings';
import { advStats, PROMO_LEVELS, type Adventurer } from './adventurers';
import {
  simulateSiege,
  type UnitKind,
  type SiegeUnit,
  type SiegeWall,
  type BattleEvent,
} from './siegeBattle';

// ── Types ──

/** Qui attaque. La faction décide du BUTIN — c'est donc la première chose que la Tour
 *  de guet révèle : on sait ce qu'on va farmer avant que ça arrive. */
export type RaidFaction = 'bandits' | 'betes' | 'mortsvivants';

/** Un groupe de l'armée : plusieurs individus de MÊME espèce et MÊME niveau. Une armée
 *  en aligne 3 à 5, de niveaux différents — le dernier est le champion. */
export interface RaidGroup {
  species: string;
  emoji: string;
  count: number;
  level: number;
  champion?: boolean;
  /** Corps à corps ou tir. ⚠️ PORTÉ par le groupe, jamais déduit du nom de l'espèce :
   *  un lookup par libellé casserait au premier renommage, en silence. Absent sur les
   *  raids d'avant la v0.754 → lus comme du corps à corps (cf. `groupKind`). */
  kind?: UnitKind;
  /** Force UNITAIRE, posée au tirage selon la faction (cf. `FACTION_PROFILE`). Une bête
   *  vaut moins qu'un brigand, mais elles arrivent en nombre. Portée par le groupe pour
   *  que `groupCombatant` reste autonome (la mise en scène lit la même valeur). */
  unitMult?: number;
  /** Facteur par lequel l'effectif de CE groupe a été gonflé au-delà de la calibration
   *  (cf. `RAID.massMult`). Ses assaillants sont d’autant plus faibles et leurs corps
   *  d’autant moins riches. **1 pour le champion**, qui n’est pas gonflé. */
  massMult?: number;
}

export interface Raid {
  id: string;
  seed: number;
  faction: RaidFaction;
  groups: RaidGroup[];
  /** Niveau du champion = ce qu'on annonce comme « niveau du raid ». */
  level: number;
  detectedAt: number; // ms epoch : la Tour l'a vu (= arrivesAt − préavis)
  arrivesAt: number; // ms epoch : la bataille se résout
}

export type DefenseId = 'wall' | 'turret' | 'watchtower' | 'salvage' | 'kennel' | 'infirmary';

/** Une structure de l'enceinte. `damaged` = niveau CONSERVÉ mais efficacité réduite de
 *  moitié jusqu'à réparation — on ne rétrograde jamais un investissement (cf.
 *  `raidDamage`) et on ne l'annule jamais non plus (cf. `DAMAGED_EFFICIENCY`). */
export interface DefenseStructure {
  typeId: DefenseId;
  level: number;
  damaged?: boolean;
}

/** Un cadavre sur le champ de bataille. Sa richesse vient de SON niveau (il était
 *  dangereux), pas du niveau du bâtiment de fouille. */
export interface Corpse {
  id: string;
  emoji: string;
  name: string;
  level: number;
  champion?: boolean;
  looted?: boolean;
  /** Dilution de masse HÉRITÉE de son groupe : ce corps est un parmi ~2,5× trop nombreux,
   *  il est donc d'autant moins riche (cf. `RAID.massMult`). Absent = 1 (le champion, et
   *  les champs sauvegardés avant la v0.720). */
  massMult?: number;
  /** Position sur le champ (0..100), posée au tirage → stable d'un rendu à l'autre. */
  x: number;
  y: number;
}

/** Le champ de bataille APRÈS un siège (gagné ou perdu : on tue toujours quelqu'un). */
export interface BattleField {
  corpses: Corpse[];
  expiresAt: number; // les corps pourrissent
  dispatchUntil?: number; // fossoyeurs en route : fin de la vague (ms epoch)
  dispatchIds?: string[]; // corps réservés par la vague en cours
}

/** Production gelée après une défaite. Levée par une SÉANCE DE SPORT (le raccourci) ou
 *  toute seule au bout de `RAID.freezeMs` (le garde-fou : l'app ne réclame jamais
 *  d'entraînement — une semaine de repos ne doit pas geler la base). */
interface ProductionFreeze {
  until: number;
  /** XP globale à l'instant du gel : toute XP en plus = une séance faite → dégel. */
  atXp: number;
}

/** Le héros sort meurtri d'un siège PERDU et PART À L'INFIRMERIE : il est indisponible
 *  jusqu'à `until` (ni donjon, ni boss, ni faille, ni Labyrinthe, ni expédition).
 *
 *  ⚠️ Un simple malus de dégâts avait été essayé d'abord : sans mordant, parce qu'on farme
 *  surtout du contenu qu'on domine largement — il ne changeait rien. Une indisponibilité,
 *  elle, se sent.
 *
 *  Ce que ça ne casse PAS : l'énergie ne se périme pas, donc une séance faite pendant la
 *  convalescence n'est jamais perdue, seulement différée. Et la durée reste très courte
 *  devant l'intervalle entre deux sièges (cf. `WOUND_MAX_MS` vs `intervalActiveMs`), sans
 *  quoi un héros à l'infirmerie manquerait la défense suivante — la spirale, encore. */
interface HeroWound {
  until: number;
}

/** 📜 CE QUE LA FOUILLE A RAPPORTÉ EN TOUT — le rapport de pillage, en cours d’écriture.
 *
 *  ⚠️ On cumule des COMPTES, pas des objets : le butin est crédité vague par vague (rien
 *  ne peut donc se perdre si le champ pourrit avant la fin), et le rapport ne fait que
 *  RÉCAPITULER. Stocker les objets ici les mettrait en double. */
interface PillageTally {
  corpses: number;
  waves: number;
  gold: number;
  scrap: number;
  keys: number;
  summonStones: number;
  items: number;
  startedAt: number;
}

export interface BaseState {
  defenses: DefenseStructure[];
  /** Ids des familiers POSTÉS au chenil (max `companionSlots(niveau)`). Ils restent dans le sac :
   *  poster n'est pas ranger, c'est affecter. */
  garrison?: string[];
  wound?: HeroWound | null;
  raid: Raid | null;
  nextRaidAt: number;
  field: BattleField | null;
  freeze: ProductionFreeze | null;
  /** Fouille en cours : ce qui a déjà été remonté du champ (cf. `PillageTally`). */
  pillage?: PillageTally | null;
  lastReport: RaidReport | null;
  seed: number;
}

export interface RaidReport {
  raidId: string;
  faction: RaidFaction;
  level: number;
  groups: RaidGroup[];
  held: boolean; // toute l'armée repoussée
  defeated: number; // groupes repoussés
  total: number;
  /** PV du MUR à la fin (0 = pulvérisé). */
  finalPv: number;
  /** PV du mur au départ. */
  maxPv: number;
  heroHome: boolean;
  /** ⚠️ Le log du moteur en DEUX PHASES, pas une suite de combats de donjon. C'est lui
   *  que le rejeu animé relit — il ne re-simule jamais rien. */
  log: BattleEvent[];
  /** La brèche s'est-elle ouverte ? */
  breached: boolean;
  resolvedAt: number;
}

/** Ce qu'une défaite coûte. Aucune ligne ne touche à ce que le sport a payé. */
export interface RaidDamage {
  stockStolen: boolean; // la production non récoltée est perdue
  damaged: DefenseId[]; // structures hors service jusqu'à réparation
  freeze: boolean; // production gelée
}

// ── Registre des structures de l'enceinte ──
// ⚠️ Elles vivent SUR L'ENCEINTE, pas sur les 6 emplacements de la carte : sinon il
// faudrait sacrifier la mine d'or pour un mur — un arbitrage cruel et sans intérêt.

export interface DefenseType {
  id: DefenseId;
  label: string;
  emoji: string;
  buildGold: number;
  // ⚠️ Ferraille exigée à la CONSTRUCTION — 0 partout, à dessein. La ferraille ne vient
  // que des épaves de la carte et de la Fonderie ; en exiger pour BÂTIR enfermait le
  // joueur dans un œuf et la poule : la 1re tourelle coûtait 20 🔩 qu'il n'avait pas, et
  // la Fonderie niv.1 met 166 h à les produire. Le 1er niveau se paie donc en OR seul ;
  // la ferraille sert aux AMÉLIORATIONS et aux RÉPARATIONS. Le champ reste pour qu'une
  // future structure puisse en demander en connaissance de cause.
  buildScrap: number;
  unlockLevel: number;
  desc: string;
}

export const DEFENSE_TYPES: DefenseType[] = [
  {
    id: 'wall',
    label: 'Muraille',
    emoji: '🧱',
    buildGold: 500,
    buildScrap: 0, // le 1er niveau ne coûte pas de ferraille : c'est le déblocage
    unlockLevel: 3,
    desc: 'L’enceinte encaisse les assauts. Tant qu’elle et les tourelles ne suivent pas ton niveau, personne ne vient t’attaquer.',
  },
  {
    id: 'turret',
    label: 'Tourelles',
    emoji: '🏹',
    buildGold: 700,
    buildScrap: 0,
    unlockLevel: 3,
    desc: 'Elles tirent. Chaque niveau ajoute de la puissance de feu, et une tourelle de plus sur le mur (jusqu’à 8).',
  },
  {
    id: 'watchtower',
    label: 'Tour de guet',
    emoji: '🗼',
    buildGold: 600,
    buildScrap: 0,
    unlockLevel: 3,
    desc: 'Elle renseigne : plus elle est haute, plus tu en sais sur l’armée qui vient — et plus tôt tu l’apprends.',
  },
  {
    id: 'salvage',
    label: 'Fosse commune',
    emoji: '🦴',
    buildGold: 650,
    buildScrap: 0,
    unlockLevel: 3,
    desc: 'Envoie des fossoyeurs dépouiller les corps après la bataille. Chaque niveau = des fossoyeurs en plus par vague.',
  },
  {
    id: 'kennel',
    label: 'Chenil',
    emoji: '🐾',
    buildGold: 750,
    buildScrap: 0,
    unlockLevel: 3,
    desc: 'Poste tes familiers à la défense. Leur ESPÈCE décide de ce qu’ils apportent au mur.',
  },
  {
    id: 'infirmary',
    label: 'Infirmerie',
    emoji: '⛑️',
    buildGold: 700,
    buildScrap: 0,
    unlockLevel: 3,
    desc: 'Soigne le héros blessé et remet les familiers fatigués sur pied plus vite.',
  },
];

const DEF_BY_ID = new Map(DEFENSE_TYPES.map((d) => [d.id, d]));
export function defenseType(id: DefenseId): DefenseType | undefined {
  return DEF_BY_ID.get(id);
}

/** Part d'efficacité conservée par une structure ENDOMMAGÉE.
 *  ⚠️ Surtout pas 0 : une muraille à 0 rendrait la base sans PV, donc la défaite
 *  suivante certaine, donc de nouveaux dégâts — exactement la spirale que le modèle
 *  « endommagé plutôt que rétrogradé » existe pour éviter. Diminuée, jamais annulée. */
const DAMAGED_EFFICIENCY = 0.5;

/** Niveau d'une structure (0 si absente). L'état « endommagé » ne le change PAS : il
 *  pèse sur l'EFFET (cf. `defenseEfficiency`).
 *  ⚠️ Ne pas être tenté d'amputer le niveau à la place : l'effet d'un niveau est
 *  quadratique (les stats de référence croissent en L²), si bien qu'un « demi-niveau »
 *  retire en réalité ~72 % des PV. Mesuré, cette erreur ramenait une base au mur intact
 *  à 74 % de tenue et une base au mur fendu à 4 % — la spirale, précisément. */
export function defenseLevel(defenses: DefenseStructure[], id: DefenseId): number {
  return defenses.find((x) => x.typeId === id)?.level ?? 0;
}
/** Efficacité (0..1) : 0 si absente, `DAMAGED_EFFICIENCY` si endommagée, sinon 1. */
function defenseEfficiency(defenses: DefenseStructure[], id: DefenseId): number {
  const d = defenses.find((x) => x.typeId === id);
  if (!d) return 0;
  return d.damaged ? DAMAGED_EFFICIENCY : 1;
}
/** Niveau POSSÉDÉ — alias explicite pour l'UI et le coût de réparation. */
export function ownedLevel(defenses: DefenseStructure[], id: DefenseId): number {
  return defenseLevel(defenses, id);
}
export function isDamaged(defenses: DefenseStructure[], id: DefenseId): boolean {
  return !!defenses.find((x) => x.typeId === id)?.damaged;
}

/** Emplacements de tourelle DESSINÉS sur la muraille. Le nombre est fixe : les
 *  emplacements vides se voient, et disent au joueur ce qu'il pourrait avoir. */
export const TURRET_SLOTS = 8;

/** Tourelles en place : TOUTES dès que la structure existe, AUCUNE sinon.
 *
 *  ⚠️ Elles apparaissaient auparavant une par une (1 + niveau/3), ce qui donnait une
 *  défense croissant en NOMBRE × PUISSANCE — quadratique — et un rempart à moitié nu qu'on
 *  ne comprenait pas : cliquer un emplacement vide n'y bâtissait rien, puisque l'ordre de
 *  remplissage était imposé. Un rempart se garnit d'un coup ; c'est le NIVEAU, partagé par
 *  toutes les tours, qui porte la puissance de feu. La montée redevient donc LINÉAIRE, et
 *  la puissance au niveau maximal est inchangée (8 × turretDmgK dans les deux modèles). */
export function turretCount(level: number): number {
  return level > 0 ? TURRET_SLOTS : 0;
}

// ── Constantes de dimensionnement ──
// Calibration RELATIVE au combattant de référence du niveau (`refFighter`), comme le
// contenu procédural : pas de polynôme à re-fitter quand les stats de base bougent.
const WEEK_MS = 7 * 24 * 3600_000;

export const RAID = {
  /** Sièges simulés pour annoncer une tenue (cf. `siegeHoldChance`). Mesuré : ~0,55 ms
   *  par siège. En deçà le % sautille d’un rendu à l’autre, au-delà on paie sans rien
   *  gagner en lisibilité — la conduite du combat varie peu à composition fixée. */
  oddsSamples: 24,
  /** Armées différentes tirées pour le repère « face à une armée type » (cf.
   *  `referenceHold`). ⚠️ Mesuré : à composition FIXE la conduite du combat varie peu,
   *  mais d’une armée à l’autre la tenue va de 8 % à 78 % au même niveau — c’est donc sur
   *  les ARMÉES qu’il faut moyenner, pas sur les déroulés. */
  typicalArmies: 6,
  // XP de défense des aventuriers (cf. `siegeXp`)
  xpBase: 8,
  xpPerLevel: 2,
  /** Part versée même si RIEN n’a été repoussé : on a tenu la brèche, on a appris. */
  xpFloorShare: 0.25,
  // Composition
  minGroups: 3,
  maxGroups: 5,
  // Fenêtre de niveau : cf. `levelSpanFor`. Deux régimes dont on prend le minimum —
  // `spanEarly` borne le début de partie, `spanFlat + spanLate × niveau` prend le relais
  // et croît moins vite que le joueur, pour que la difficulté ne s'éteigne pas.
  spanEarly: 0.6,
  spanFlat: 7,
  spanLate: 0.45,
  // Effectif quasi PLAT sur toute la partie (6 au début → 12 au niveau 100). Il ne suit
  // volontairement pas le niveau : un champ de 100 cadavres qu'on ne peut pas dépouiller
  // serait frustrant, et l'effectif est aussi ce qui déséquilibre le siège (les dégâts
  // encaissés croissent en effectif^1,5, quand la défense, elle, plafonne à 8 tourelles).
  foesBase: 10,
  foesPerLevel: 10,

  // Assaillants (relatif au refFighter de LEUR niveau)
  foePvK: 0.9, // PV d'un assaillant = 0,9 × offense/tour d'un joueur de référence
  foeDmgK: 0.05, // dégâts = 5 % des PV d'un joueur de référence
  championPvMult: 3, // le champion est une élite, pas un soldat de plus
  championDmgMult: 2.2,
  // Les dégâts d'un groupe croissent en √effectif, pas linéairement : seuls quelques
  // assaillants tiennent au pied du mur à la fois. Un gros groupe est donc une éponge à
  // PV, pas un pic de dégâts — c'est ce qui rend le siège tenable au lieu d'expédier la
  // base en un tour.
  groupDmgExp: 0.5,

  // Défense (relatif au refFighter du NIVEAU DE LA STRUCTURE).
  // ⚠️ Les tourelles se calibrent sur l'OFFENSE/TOUR de la référence (dégâts × frappes ×
  // crit), pas sur ses dégâts de base — c'est l'unité dans laquelle sont exprimés les PV
  // ennemis. Avec `damage` seul, la défense suivait ~L² face à des PV en ~L⁴ : mesuré,
  // elle s'effondrait à 0 % de tenue dès le niveau 60 quel que soit l'investissement.
  wallPvK: 3.4,
  // Les hommes postés sur le rempart. Volontairement FAIBLE devant les tourelles (une
  // ligne de 8 tourelles vaut ~0,84 en équivalent) : le mur encaisse, les tourelles
  // tuent. Il ne s'agit que d'écarter le zéro absolu.
  // ⚠️ SEUIL DE DÉCLENCHEMENT des sièges — part de l’enceinte réellement bâtie, mur ET
  // tourelles (cf. `defenseReadiness`). Mesuré : une enceinte à MOITIÉ ne tient rien à
  // AUCUN niveau (1-13 %), et une muraille à niveau SANS tourelle tient 0 % partout — le
  // mur ne tue plus du tout (`wallDmgK` = 0) : il encaisse et il abrite (`wallArmorK`).
  // Allumer les sièges dès `wall > 0` revenait donc à punir le joueur d’avoir fait le
  // premier pas. À 0,85 on tient 54 à 100 % (héros présent) du niveau 3 au niveau 70, et
  // l’enceinte garde 2 à 7 niveaux de marge avant que les sièges se coupent d’eux-mêmes.
  enableShare: 0.85,
  /** ⚠️ LE MUR NE TUE PLUS (0) — il ENCAISSE et il FAIT GAGNER DU TEMPS.
   *  Il infligeait 6,1 % des dégâts de l'enceinte (mesuré, constant à tout niveau), ce
   *  qui n'a aucun sens : une muraille n'abat personne, elle retarde. Et le motif qui
   *  justifiait ce plancher a CESSÉ D'ÊTRE VRAI — il protégeait le cas « mur sans
   *  tourelle » (0 dégât → défaite certaine), or `defenseReadiness` prend depuis la
   *  v0.723 le MINIMUM des parts mur ET tourelles : sans tourelle, aucun siège ne se
   *  déclenche. Vérifié : mur seul = 0 % de tenue, et « sièges actifs : NON » à tous
   *  les niveaux. Le plancher gardait une porte qui ne peut plus s'ouvrir. */
  wallDmgK: 0,
  /** Ce que le rempart fait À LA PLACE : il ABRITE ceux qui tirent (réduction de dégâts).
   *  ⚠️ Calibré pour que la difficulté ne bouge pas — mesuré à 0,05, la tenue redevient
   *  94/87/75/70 % aux niveaux 10/28/50/80, contre 94/86/75/70 avant. On change ce que
   *  le mur SIGNIFIE, pas la difficulté du jeu. Plus de PV et moins de dégâts reçus =
   *  plus de tours tenus = plus de tirs de tourelles : le mur convertit sa solidité en
   *  temps, et les tourelles convertissent ce temps en morts. */
  wallArmorK: 0.65,

  // Coûts propres à la défense (cf. defenseUpgradeCost).
  upBase: 28,
  upExp: 1.9,
  // Ferraille d'une amélioration : socle + puissance. ⚠️ MESURÉ (v0.681). L'ancien
  // `4 + niveau` était linéaire quand tout le reste croît en puissance : monter les 6
  // structures d'un cran coûtait **0,6 à 0,7 épave** à TOUS les niveaux, et la Fonderie
  // seule couvrait ce cran en 2,2 à 2,8 jours — autrement dit la ferraille tombait toute
  // seule et n'était un frein nulle part. À 1,35 il faut **1,5 à 2,8 épaves** par cran
  // (à tout niveau), et la Fonderie seule met 6 à 10 jours : elle complète, elle ne
  // remplace plus. Ne pas monter plus haut : à 1,45 la fin de partie demandait 4,5 épaves
  // et 16 jours de production passive par cran — de la corvée, pas un arbitrage.
  // Chance qu'un corps ORDINAIRE laisse une pièce d'équipement (un champion en laisse
  // toujours une). Les bandits sont équipés, les bêtes et les morts-vivants beaucoup moins.
  gearDropBandits: 0.5,
  gearDropOther: 0.12,
  scrapBase: 6,
  scrapExp: 1.45,
  turretDmgK: 0.175,
  /** PV d'UNE tourelle, en part des PV de la référence.
   *  ⚠️ Le modèle à UN SEUL combattant n'en avait pas besoin — tout était fondu. Le
   *  moteur en deux phases, lui, en fait des unités qu'on peut RÉDUIRE AU SILENCE : sans
   *  PV, les archers assaillants n'auraient aucune prise et « faire taire les tireurs »
   *  ne voudrait rien dire. Modeste : une baliste est un ouvrage, pas un soldat. */
  turretPvK: 0.42,
  /** La MEUTE du chenil, quand aucun aventurier ne défend : ce que valent les bêtes
   *  seules, en part de la référence du niveau. ⚠️ Volontairement modeste — c'est un
   *  filet pour que le chenil ne devienne jamais inutile, pas une garnison de rechange. */
  packPvK: 1.5,
  packDmgK: 0.12,
  // Le héros présent prête une part de sa force. Dosé pour transformer un siège serré en
  // victoire probable — pas pour le rendre acquis : mesuré à 0,55/0,35, sa seule présence
  // donnait 100 % de tenue dès le niveau 40, ce qui aurait vidé de son sens tout
  // l'investissement dans l'enceinte.
  heroDmgShare: 0.3,
  heroPvShare: 0.22,
  regenPct: 0.1, // la base souffle un peu entre deux groupes

  // Rythme : plus tu t'entraînes, plus ta base prospère — et plus elle attire. Un siège
  // étant un ROBINET (butin, cadavres), « plus actif = plus attaqué » se lit comme plus
  // de contenu, jamais comme une punition de l'entraînement.
  // ⚠️ UNE SÉANCE = UN SIÈGE (v0.702). Avant, la fréquence lisait le nombre de JOURS
  // ACTIFS sur 7 — donc elle PLAFONNAIT : quelqu'un qui s'entraîne trois fois par jour
  // était au même régime (un siège / 24 h) que quelqu'un qui bouge une fois par jour.
  // Tout le volume au-delà du premier effort quotidien ne rapportait aucun contenu.
  // Désormais l'intervalle est `semaine / nombre de séances` : 2 séances → 2 sièges,
  // 7 → un par jour, 21 → un toutes les 8 h. Le siège étant un ROBINET (butin, cadavres,
  // ferraille), « plus actif = plus attaqué » se lit comme plus de jeu, jamais comme une
  // punition de l'entraînement.
  // 🔩 Acier laissé par un corps ARMÉ. ⚠️ Calibré sur le BESOIN mesuré (combler ce que
  // les sources bornées par l'horloge ne peuvent pas suivre quand les sièges se
  // multiplient), et non au jugé : au premier réglage, un siège rendait 585 🔩 contre 62
  // pour une épave — il aurait détrôné la source de pointe, que le test verrouille.
  /** ⚠️ MASSE VISIBLE ≠ MENACE. Mesuré : une armée comptait `10 + ⌊niveau/10⌋` corps,
   *  soit **8 brigands au niveau 26 et 20 au niveau 100** — une bande, pas un siège.
   *  Pire, l'effectif ne DOUBLAIT qu'entre le niveau 12 et 100, quand la puissance du
   *  joueur croît en ~L⁴ : toute la difficulté passait par le NIVEAU des assaillants,
   *  jamais par la masse. Et le motif du plafond (« un champ de 100 cadavres qu'on ne
   *  pourrait pas dépouiller ») avait cessé d'être vrai : les fossoyeurs ramassent
   *  `1 + ⌊niveau/2⌋` corps PAR VAGUE renouvelable, soit 1,4 vague pour tout prendre au
   *  niveau 26 et 0,7 au niveau 100 — la capacité de fouille dépasse l'armée entière.
   *
   *  L'armée est donc ~2,5× plus nombreuse, mais chaque assaillant est d'autant plus
   *  FAIBLE et son cadavre d'autant moins RICHE : **la menace et le butin d'un siège
   *  sont inchangés, seule la foule change.** Même relation que `siegeStage` avec la
   *  simulation — la mise en scène ne décide rien.
   *
   *  ⚠️ La dilution est portée PAR GROUPE (`RaidGroup.massMult`), jamais appliquée comme
   *  une constante globale : le CHAMPION est seul (count 1), il n'est donc pas gonflé —
   *  le diluer le rendrait 2,5× plus faible que la calibration. Même raison que son
   *  `unitMult: 1` : une élite ne suit pas la dilution de sa horde. */
  massMult: 2.5,
  corpseScrapBase: 0,
  corpseScrapPerLevel: 0.16,
  intervalFloorMs: 3 * 3600_000, // plancher : en deçà, un siège n'est plus un événement
  intervalMaxMs: 7 * 24 * 3600_000, // 1 séance par semaine → 1 siège par semaine
  intervalIdleMs: 72 * 3600_000, // repli quand on ne sait rien de l'activité
  intervalJitter: 0.25,
  freezeMs: 24 * 3600_000, // dégel automatique (le sport est le raccourci, pas la rançon)
  woundMs: 6 * 3600_000, // convalescence de base après une défaite (abrégée par l’Infirmerie)

  // Espionnage
  /** ⚠️ LE PRÉAVIS EST UNE PART DE L’INTERVALLE, plus une durée absolue (v0.776).
   *  Une durée fixe ne veut pas dire la même chose selon le rythme : 8 h valent un
   *  tiers du cycle à 24 h d’intervalle et 5 % à sept jours. Et elle plafonnait au
   *  niveau 21 → 79 niveaux morts, payés au prix quadratique.
   *  Part SANS Tour — un filet, pas un service. */
  scoutLeadShareMin: 0.03,
  /** Part ASYMPTOTIQUE, jamais atteinte : être prévenu tout le temps tuerait la
   *  mécanique, la Tour doit toujours laisser une part d’imprévu. */
  scoutLeadShareMax: 0.85,
  /** Niveau où la Tour a rendu la MOITIÉ de ce qu’elle peut rendre. */
  scoutLeadShareHalf: 30,
  clarityMax: 5,
  // ⚠️ OPACITÉ RELATIVE À LA FENÊTRE, et non à l’écart brut de niveaux. L’ancien
  // `⌊écart/3⌋` était absolu face à un terme de tour NON BORNÉ (`⌊tour/2⌋` vaut 50 au
  // niveau 100 pour un plafond de 5) : la soustraction était noyée, et la clarté
  // maximale tombait sur **100 %** des raids dès le niveau 20 — mesuré, et jamais
  // redescendu ensuite. Rapportée à `levelSpanFor`, elle mord à TOUS les niveaux. La
  // part mange au plus la MOITIÉ de l’échelle : au-delà, un joueur pleinement investi
  // devenait aveugle en début de partie (mesuré 27 % de clarté 0 à 0,6).
  scoutOpacity: 0.5,
  // Les éclaireurs ratent parfois. Tiré sur la graine du RAID → déterministe et
  // hors-ligne comme tout le reste, mais imprévisible pour le joueur : la Tour achète
  // une PROBABILITÉ, plus une certitude. À 2 crans la clarté maximale devenait
  // inatteignable (le haut de l’échelle serait du contenu mort).
  scoutNoise: 1,
  /** Largeur RELATIVE de la fourchette de puissance assaillante, par cran de clarté
   *  (index = clarté ; la clarté maximale donne le chiffre exact, hors de ce tableau).
   *  ⚠️ Calibrée pour que chaque cran se SENTE : ±40 % ne permet pas de décider, ±8 %
   *  si. C'est ce dégradé qui fait vouloir monter la Tour. */
  estimateWidth: [0, 0.8, 0.45, 0.22, 0.08] as number[],
} as const;

/** Le fosse commune : capacité PAR VAGUE, renouvelable tant que les corps sont
 *  frais. On peut renvoyer les fossoyeurs autant de fois qu'on veut dans les 24 h → un
 *  petit chantier fait plusieurs allers-retours, il ne condamne pas le butin. */
export const SCAV = {
  fieldMs: 24 * 3600_000, // les corps pourrissent au bout de 24 h
  /** Durée d’UN aller-retour. ⚠️ 40 min → 4 min : le chantier est **juste devant la
   *  porte**, et depuis que les vagues s’enchaînent SEULES une longue attente ne crée
   *  plus aucune décision — elle ne fait que retarder. Signalé par l’utilisateur. */
  dispatchMs: 4 * 60_000,
  /** Ce que le niveau du Chantier retire AU PLUS au temps d’un aller-retour, et le
   *  niveau où il en a retiré la moitié. Asymptotique : chaque cran gratte, aucun ne
   *  ramène jamais à zéro — on ne dépouille pas un champ instantanément. */
  speedMax: 0.7,
  speedHalf: 20,
} as const;

/** ⏱️ DURÉE D’UN ALLER-RETOUR, raccourcie par le niveau du Chantier.
 *
 *  ⚠️ SECOND LEVIER, et il est NÉCESSAIRE : le nombre de bras monte par crans de quatre
 *  niveaux, donc trois niveaux sur quatre ne changeraient rien — ce que « aucun niveau
 *  mort du 0 au 100 » (v0.731) interdit. Même réponse qu’au Comptoir : le NOMBRE monte
 *  lentement, la VITESSE monte en continu.
 *
 *  ⚠️ ASYMPTOTIQUE, jamais linéaire : un aller-retour ne peut pas devenir instantané.
 *  Mesuré : 4 min à neuf, ~2 min 50 au niveau 14, ~1 min 45 au niveau 90. */
export function scavengeMs(level: number): number {
  const l = Math.max(0, level);
  return Math.round(SCAV.dispatchMs * (1 - SCAV.speedMax * (l / (l + SCAV.speedHalf))));
}

/** Fossoyeurs envoyés PAR VAGUE — le seul effet du niveau du chantier. Il répond à une
 *  question unique et lisible : « combien j'en ramasse d'un coup ». */
export function scavengerCount(level: number): number {
  // ⚠️ LE FACTEUR DE MASSE EST RETIRÉ, et son motif s’est INVERSÉ. Il avait été ajouté en
  // v0.720 pour qu’un champ 2,5× plus peuplé ne demande pas 2,5× plus d’allers-retours —
  // « la foule ne doit pas devenir une corvée ». C’était juste tant que chaque vague se
  // lançait et se ramassait À LA MAIN. Depuis qu’elles s’enchaînent seules et durent
  // 4 minutes, un aller-retour ne COÛTE plus rien — et le joueur a signalé l’effet de
  // bord : « en 1 voire 2 vagues max j’ai tout ramassé ». Mesuré, la capacité valait 20
  // corps par vague pour une armée de ~48. Sans le facteur : ~6 vagues, soit une fouille
  // qui DURE un peu et qu’on regarde avancer.
  return level <= 0 ? 0 : 1 + Math.floor(level / 4);
}

// ── Rosters par faction ──
/**
 * ⚠️ CHAQUE ESPÈCE PORTE SON TYPE — c'est ce qui donne sa tactique au siège : un homme
 * d'armes ne peut que cogner le mur, un tireur ne peut que faire taire les tireurs d'en
 * face (cf. `siegeBattle.ts`).
 *
 * ⚠️ L'ORDRE DU ROSTER EST UNE MÉCANIQUE, pas une présentation : `rollRaid` tire les
 * espèces **dans l'ordre** (`roster[i % length]`), pas au hasard. Une espèce placée en
 * 4ᵉ position n'apparaît donc que dans les armées les plus fournies. Chaque faction a
 * son tireur à l'**index 1** pour qu'il soit présent dès deux groupes de troupe —
 * mesuré : sans lui, les bêtes tenaient 0 % du temps en défense adverse (100 % de
 * tenue pour le joueur), faute de pouvoir réduire une seule baliste au silence.
 *
 * ⚠️ Le CHAMPION est toujours le DERNIER du roster (cf. `rollRaid`) : les quatre
 * premières places sont donc celles de la troupe.
 */
const ROSTERS: Record<RaidFaction, { emoji: string; name: string; kind: UnitKind }[]> = {
  bandits: [
    { emoji: '🗡️', name: 'Coupe-jarret', kind: 'melee' },
    { emoji: '🏹', name: 'Archer déserteur', kind: 'ranged' },
    { emoji: '🪓', name: 'Brise-porte', kind: 'melee' },
    { emoji: '🛡️', name: 'Mercenaire', kind: 'melee' },
    { emoji: '👺', name: 'Chef de bande', kind: 'melee' },
  ],
  betes: [
    { emoji: '🐺', name: 'Loup famélique', kind: 'melee' },
    // L'arachné CRACHE (toile, venin) : c'est la réponse des bêtes aux balistes, et la
    // seule espèce du bestiaire pour qui « frapper de loin » va de soi.
    { emoji: '🕷️', name: 'Arachné des bois', kind: 'ranged' },
    { emoji: '🐗', name: 'Sanglier enragé', kind: 'melee' },
    { emoji: '🐻', name: 'Ours des cavernes', kind: 'melee' },
    { emoji: '🦂', name: 'Scorpion géant', kind: 'melee' },
  ],
  mortsvivants: [
    { emoji: '🧟', name: 'Revenant', kind: 'melee' },
    // Le spectre draine à distance ; le nécromant reste au fond. Deux tireurs, c'est
    // l'identité de cette faction — et il faudra vérifier qu'elle n'en devient pas la
    // plus dure (cf. la mesure par faction).
    { emoji: '👻', name: 'Spectre plaintif', kind: 'ranged' },
    { emoji: '💀', name: 'Ossuaire ambulant', kind: 'melee' },
    // ⚠️ LE NÉCROMANT COMBAT AU CORPS À CORPS, et c'est une contrainte d'ÉQUILIBRE, pas
    // de thème. Chaque faction doit aligner LE MÊME NOMBRE DE TIREURS dans sa troupe :
    // ce sont eux qui réduisent les balistes au silence, donc deux tireurs au lieu d'un
    // changent l'issue. Mesuré avec lui à distance : morts-vivants repoussés 80 % du
    // temps contre 95 % pour les bêtes, 15 points d'écart là où l'iso-menace en tolère
    // 12. ⚠️ Le passer CHAMPION a été essayé et rejeté par la mesure : un champion qui
    // tire (×3 PV, ×2,2 dégâts) fait taire les tourelles si vite que la tenue tombait
    // à 58 % — bien pire que le mal qu'on soignait.
    { emoji: '🧙', name: 'Nécromant', kind: 'melee' },
    { emoji: '⚰️', name: 'Porte-linceul', kind: 'melee' },
  ],
};

/** SILHOUETTE d'une faction : combien ils sont, et ce que vaut chacun. Le produit
 *  `countMult × unitMult` vaut ~1 partout → la MASSE (donc la menace) est la même, seule
 *  la forme change. C'est ce qui permet à une horde de bêtes d'être visiblement deux fois
 *  plus nombreuse qu'une bande de brigands sans être deux fois plus dangereuse — et sans
 *  dérégler la calibration, où l'effectif pèse en puissance 1,5. */
export const FACTION_PROFILE: Record<
  RaidFaction,
  { countMult: number; unitMult: number; shape: string }
> = {
  bandits: { countMult: 0.7, unitMult: 1.4, shape: 'Peu nombreux, mais aguerris' },
  betes: {
    countMult: 1.7,
    unitMult: 0.58,
    shape: 'Une horde : beaucoup de bêtes, chacune fragile',
  },
  mortsvivants: { countMult: 1.2, unitMult: 0.83, shape: 'Une cohorte lente et nombreuse' },
};

export const FACTION_LABEL: Record<RaidFaction, string> = {
  bandits: 'Bandits',
  betes: 'Bêtes sauvages',
  mortsvivants: 'Morts-vivants',
};
export const FACTION_EMOJI: Record<RaidFaction, string> = {
  bandits: '🗡️',
  betes: '🐺',
  mortsvivants: '💀',
};
/** Ce que la faction laisse sur ses morts — annoncé AVANT l'assaut par la Tour, donc on
 *  sait ce qu'on farme. ⚠️ Aucune ne lâche de FERRAILLE : trouver des plaques d'acier
 *  sur un loup n'aurait aucun sens (la ferraille se ramasse sur les épaves de la carte). */
export const FACTION_LOOT: Record<RaidFaction, string> = {
  bandits: '🪙 or et équipement',
  betes: '🗝️ clés du Labyrinthe',
  mortsvivants: '🔮 pierres d’invocation',
};

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// ── Composition de l'armée ──

/** Effectif de CALIBRATION : celui sur lequel toute la difficulté des sièges a été
 *  mesurée (v0.661 → v0.687). Il n'est ni affiché ni dépouillé — il ne sert qu'à savoir
 *  de combien l'armée VISIBLE a été gonflée, donc de combien la diluer. */
export function raidThreatSize(playerLevel: number, faction?: RaidFaction): number {
  const base = RAID.foesBase + Math.floor(Math.max(1, playerLevel) / RAID.foesPerLevel);
  return Math.max(3, Math.round(base * (faction ? FACTION_PROFILE[faction].countMult : 1)));
}

/** Effectif RÉEL : ce qui marche sur la ville, se dessine et se dépouille.
 *  ⚠️ Plus nombreux ne veut PAS dire plus dangereux — cf. `RAID.massMult`. */
export function raidSize(playerLevel: number, faction?: RaidFaction): number {
  return Math.max(3, Math.round(raidThreatSize(playerLevel, faction) * RAID.massMult));
}

/** Largeur RÉELLE de la fenêtre de niveau — le plus petit de deux régimes.
 *
 *  Un écart FIXE ne peut pas marcher aux deux bouts : +15 double le niveau d'une armée
 *  au niveau 10, mais ne l'augmente que de 17 % au niveau 90. Mesuré dans les deux sens :
 *  à +15 fixe, un joueur de niveau 10 tenait 0 % de ses sièges, tandis qu'au niveau 90 il
 *  en tenait **96 %** — le siège s'éteignait en fin de partie.
 *
 *  Mais un span strictement proportionnel (60 % du niveau) bascule dans l'excès inverse :
 *  40 % de tenue au niveau 90 en bâtissant pourtant à son niveau, et un gradient
 *  d'investissement écrasé (18 % à −5 contre 40 % à niveau → construire ne paie plus).
 *
 *  D'où deux régimes dont on prend le MINIMUM : `EARLY` (60 % du niveau) borne le début
 *  de partie, `LATE` prend le relais vers le niveau ~23.
 *
 *  ⚠️ **PENTE LATE RELEVÉE 0,30 → 0,45 (v0.687, re-mesuré).** À 0,30 le span croissait
 *  bien moins vite que le joueur, donc l'écart RELATIF entre l'armée et la base se
 *  refermait : la difficulté S'ÉTEIGNAIT en fin de partie. Mesuré sur les trois profils —
 *  enceinte à moitié montée, la tenue passait de **34 % au niveau 12 à 76 % au niveau
 *  100**, et à 75 % d'enceinte de 86 % à 98 %. Plus on avançait, plus c'était facile.
 *  Le déclencheur est l'élargissement du CHENIL (une place tous les 5 niveaux, v0.683) :
 *  la garnison apporte désormais un bonus qui sature ses plafonds dès le niveau 60.
 *  À 0,45, ces deux courbes redeviennent PLATES (34 → 51 % et 86 → 83 %), le gradient
 *  d'investissement reste net à tout niveau (50 % / 75 % / 100 % d'enceinte → 51 / 83 /
 *  96 % de tenue au niveau 100) et le héros retrouve du poids en fin de partie (96 %
 *  avec lui, 55 % sans). ⚠️ Ne pas aller au-delà : à 0,60 (proportionnel pur) la doc
 *  d'origine mesurait 40 % de tenue en bâtissant pourtant à son niveau. */
export function levelSpanFor(playerLevel: number): number {
  const L = Math.max(1, playerLevel);
  return Math.max(3, Math.round(Math.min(L * RAID.spanEarly, RAID.spanFlat + L * RAID.spanLate)));
}

/** Tire une armée. Les niveaux se répartissent dans [niveau perso, +15] avec un biais
 *  BAS (rng², comme les POI de la carte) : le haut de la fourchette reste l'exception
 *  qu'on redoute, pas la norme qu'on subit. Les groupes arrivent du plus faible au plus
 *  fort, le champion en dernier. */
export function rollRaid(
  seed: number,
  playerLevel: number,
  arrivesAt: number,
  leadMs: number,
): Raid {
  const rng = mulberry32(seed >>> 0 || 1);
  const faction = pick(rng, ['bandits', 'betes', 'mortsvivants'] as const);
  const roster = ROSTERS[faction];
  const L = Math.max(1, playerLevel);
  const nGroups = RAID.minGroups + Math.floor(rng() * (RAID.maxGroups - RAID.minGroups + 1));
  const total = raidSize(L, faction);
  const unitMult = FACTION_PROFILE[faction].unitMult;
  const span = levelSpanFor(L);

  // Niveaux de troupe : biaisés bas, triés croissant.
  const levels: number[] = [];
  for (let i = 0; i < nGroups - 1; i++) {
    levels.push(L + Math.min(span, Math.floor(rng() * rng() * (span + 1))));
  }
  levels.sort((a, b) => a - b);
  // Le champion prend le HAUT de la fourchette : toujours au-dessus de sa troupe.
  const topTroop = levels.length ? levels[levels.length - 1]! : L;
  const championLevel = Math.min(L + span, topTroop + 1 + Math.floor(rng() * 4));

  // Effectifs : le champion est SEUL (c'est une élite) ; le reste se répartit.
  const groups: RaidGroup[] = [];
  const troops = Math.max(nGroups - 1, total - 1);
  // ⚠️ Dilution EXACTE, et non la constante : les arrondis et le champion (toujours seul,
  // donc jamais gonflé) font que la troupe n'a pas été multipliée par pile `massMult`.
  // On mesure le gonflement réellement subi → la menace est conservée au bit près.
  const troopsRef = Math.max(nGroups - 1, raidThreatSize(L, faction) - 1);
  const massMult = troops / troopsRef;
  let left = troops;
  for (let i = 0; i < nGroups - 1; i++) {
    const remaining = nGroups - 1 - i;
    const share = remaining === 1 ? left : Math.max(1, Math.round(left / remaining));
    left -= share;
    const skin = roster[i % roster.length]!;
    groups.push({
      species: skin.name,
      emoji: skin.emoji,
      kind: skin.kind,
      count: share,
      level: levels[i]!,
      unitMult,
      massMult,
    });
  }
  const champSkin = roster[roster.length - 1]!;
  groups.push({
    species: champSkin.name,
    emoji: champSkin.emoji,
    kind: champSkin.kind,
    count: 1,
    level: championLevel,
    champion: true,
    // Le champion est une élite, pas un membre de la horde : sa force ne suit ni la
    // dilution de sa faction (sinon un chef de meute serait plus faible qu'un brigand),
    // ni celle de la MASSE — il est seul, il n'a pas été gonflé.
    unitMult: 1,
    massMult: 1,
  });

  return {
    id: `raid_${seed}_${arrivesAt}`,
    seed,
    faction,
    groups,
    level: championLevel,
    detectedAt: arrivesAt - leadMs,
    arrivesAt,
  };
}

// ── Rythme ──

/** Délai jusqu'au prochain siège, selon l'ACTIVITÉ SPORTIVE (jours actifs sur 7). */
export function raidIntervalMs(activeDays7: number, rng?: () => number): number {
  const s = Math.max(0, activeDays7);
  // 0 séance → la garde `raidsEnabled` a déjà coupé les sièges ; on rend l'échéance
  // lointaine par sécurité plutôt que d'improviser une division par zéro.
  const base = s <= 0 ? RAID.intervalIdleMs : WEEK_MS / s;
  const clamped = Math.min(RAID.intervalMaxMs, Math.max(RAID.intervalFloorMs, base));
  if (!rng) return Math.round(clamped);
  const j = 1 + (rng() * 2 - 1) * RAID.intervalJitter;
  return Math.round(clamped * j);
}

// ── Espionnage ──

/** Niveau de renseignement effectif : celui de la Tour, amputé si elle est éventrée —
 *  une tour endommagée voit moins loin et moins bien. Source unique pour le préavis ET
 *  la clarté, pour qu'ils ne divergent jamais. */
export function scoutLevel(defenses: DefenseStructure[]): number {
  return defenseLevel(defenses, 'watchtower') * defenseEfficiency(defenses, 'watchtower');
}

/** Part de l’intervalle que la Tour donne d’avance. Croît à CHAQUE niveau, de 1 à 100,
 *  sans jamais atteindre son plafond. */
export function scoutLeadShare(watchtowerLevel: number): number {
  const l = Math.max(0, watchtowerLevel);
  const { scoutLeadShareMin: lo, scoutLeadShareMax: hi, scoutLeadShareHalf: half } = RAID;
  return lo + (hi - lo) * (l / (l + half));
}

/** ⏱️ PRÉAVIS OFFERT PAR LA TOUR DE GUET — c’est lui qui rend la préparation possible,
 *  et c’est à la DÉTECTION que part la notification, pas à l’impact : monter la Tour
 *  achète littéralement du temps de réaction.
 *
 *  ⚠️ EXPRIMÉ EN PART DE L’INTERVALLE, plus en durée absolue (demandé par l’utilisateur :
 *  « il faut qu’elle soit de plus en plus performante jusqu’au 100, quitte à baisser sa
 *  performance à bas niveau »). Deux raisons, et la première seule suffisait :
 *  (1) l’ancienne formule PLAFONNAIT au niveau 21 → **79 niveaux morts** ;
 *  (2) une durée fixe ne signifie rien hors de son rythme — 8 h valent un tiers du
 *  cycle quand on s’entraîne tous les jours, et 5 % quand on vient une fois par
 *  semaine. La part, elle, veut dire la même chose partout.
 *
 *  ⚠️ REDISTRIBUTION ASSUMÉE, et c’est une EXCEPTION explicitement autorisée à la règle
 *  « on prolonge, on ne redistribue pas » (v0.731) : les bas niveaux rendent moins
 *  qu’avant pour que les hauts rendent davantage. Sans cette permission, il n’y avait
 *  pas de courbe possible.
 *
 *  ⚠️ ASYMPTOTIQUE : on n’est JAMAIS prévenu à 100 %. Un préavis qui couvre tout
 *  l’intervalle voudrait dire « toujours au courant » et tuerait la mécanique. */
export function scoutLeadMs(watchtowerLevel: number, intervalMs: number): number {
  return Math.round(Math.max(0, intervalMs) * scoutLeadShare(watchtowerLevel));
}

/** Clarté du renseignement (0..5). Elle dépend de la Tour ET de la force de l'armée : une
 *  grosse armée reste opaque, et c'est en montant la Tour qu'on rachète de la lisibilité.
 *  `falconBonus` = un faucon posté au chenil (V2) voit plus loin. */
export function scoutClarity(
  watchtowerLevel: number,
  raidLevel: number,
  playerLevel: number,
  falconBonus = 0,
  raidSeed = 0,
): number {
  const L = Math.max(1, playerLevel);
  // La TOUR vaut sa PART du niveau du joueur — comme toute structure de l’enceinte
  // (cf. `baseCombatant`). Avec l’ancien `⌊tour/2⌋`, un débutant plafonnait à 1 cran
  // quoi qu’il bâtisse tandis qu’un vétéran voyait tout : la courbe était à l’envers.
  const base = RAID.clarityMax * Math.min(1, Math.max(0, watchtowerLevel) / L);
  // L’OPACITÉ : où l’armée se situe DANS la fenêtre de niveaux qui peut te viser.
  const gap = Math.max(0, raidLevel - L);
  const opacity =
    RAID.clarityMax * RAID.scoutOpacity * Math.min(1, gap / Math.max(1, levelSpanFor(L)));
  const c = Math.round(base - opacity) - scoutNoise(raidSeed) + falconBonus;
  return Math.min(RAID.clarityMax, Math.max(0, c));
}

/** Crans perdus par l’aléa du renseignement, tirés sur la graine du raid (0 = pas de
 *  graine fournie → aucun bruit, ce qui garde les comparaisons de la fiche déterministes). */
function scoutNoise(raidSeed: number): number {
  if (!raidSeed || RAID.scoutNoise <= 0) return 0;
  let h = raidSeed >>> 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return (h >>> 0) % (RAID.scoutNoise + 1);
}

export interface ScoutReport {
  clarity: number;
  faction: RaidFaction | null; // clarté ≥ 1
  size: number | null; // ≥ 2
  avgLevel: number | null; // ≥ 3
  hasChampion: boolean | null; // ≥ 3
  groups: RaidGroup[] | null; // ≥ 4
  /** ⚠️ PLUS DE PRONOSTIC CHIFFRÉ (v0.718). L'espionnage disait « 87 % de chances de
   *  tenir » : le siège n'avait plus rien à raconter, on lisait le résultat avant la
   *  bataille. La Tour renseigne sur l'ENNEMI (faction, effectif, niveaux, composition)
   *  et achète du PRÉAVIS ; elle ne prédit pas l'issue. Le doute est le sujet. */
  fullRead: boolean; // ≥ 5 : composition lue sans zone d'ombre
}

/** Ce que tu sais réellement de l'armée qui vient. Chaque palier de clarté ouvre une
 *  ligne de plus — le renseignement est une progression, pas un interrupteur. */
export function scoutReport(raid: Raid, clarity: number): ScoutReport {
  const size = raid.groups.reduce((s, g) => s + g.count, 0);
  const avg = Math.round(
    raid.groups.reduce((s, g) => s + g.level * g.count, 0) / Math.max(1, size),
  );
  return {
    clarity,
    faction: clarity >= 1 ? raid.faction : null,
    size: clarity >= 2 ? size : null,
    avgLevel: clarity >= 3 ? avg : null,
    hasChampion: clarity >= 3 ? raid.groups.some((g) => g.champion) : null,
    groups: clarity >= 4 ? raid.groups : null,
    fullRead: clarity >= 5,
  };
}

// ── Combattants ──

function offensePerRound(f: Combatant): number {
  return f.damage * (f.strikes ?? 1) * (1 + f.crit);
}

/** Un groupe de l'armée, en un combattant. PV = effectif × PV unitaire ; dégâts en
 *  √effectif (cf. `groupDmgExp`). */
/** Le type d'un groupe, avec repli pour les raids écrits avant la v0.754.
 *  ⚠️ Corps à corps par défaut : c'est le cas qui ne peut RIEN faire d'inattendu (il
 *  cogne le mur). Un repli « tireur » aurait fait apparaître des archers là où il n'y
 *  en avait jamais eu. */
export function groupKind(g: RaidGroup): UnitKind {
  return g.kind ?? 'melee';
}

/**
 * Le multiplicateur de DÉGÂTS d'une silhouette de faction.
 *
 * ⚠️ MESURÉ : `countMult × unitMult ≈ 1` conserve les **PV** d'une armée, **pas ses
 * dégâts**. Les PV d'un groupe suivent l'effectif (∝ `um × eff`) mais ses dégâts n'en
 * suivent que la RACINE (`groupDmgExp`), donc ∝ `um × eff^0,5` ; à effectif ∝ `1/um`,
 * cela vaut `√um`. Relevé sur les trois factions : dégâts **×1,18** pour les bandits,
 * **×0,91** pour les morts-vivants, **×0,76** pour les bêtes — 55 % d'écart de puissance
 * de feu là où la doctrine affirme « la masse est conservée, seule la FORME change ».
 *
 * ⚠️ Le défaut PRÉEXISTE au moteur en deux phases ; l'ancien le diluait en affrontant les
 * groupes l'un après l'autre. En unités, il se voit : 13 points d'écart de tenue entre
 * bêtes et bandits, mesuré sur 9000 sièges.
 *
 * On prend donc `√um` au lieu de `um` sur le terme de dégâts, ce qui l'annule
 * exactement. C'est une IDENTITÉ dérivée de `groupDmgExp`, pas un coefficient ajusté.
 */
function silhouetteDmgMult(unitMult: number): number {
  return Math.pow(Math.max(1e-6, unitMult), 1 - RAID.groupDmgExp);
}

export function groupCombatant(g: RaidGroup): Combatant {
  const ref = refFighter(Math.max(1, g.level));
  const um = g.unitMult ?? 1; // silhouette de la faction (horde fragile ↔ bande aguerrie)
  const champPv = g.champion ? RAID.championPvMult : 1;
  const champDmg = g.champion ? RAID.championDmgMult : 1;
  const unitPv = offensePerRound(ref) * RAID.foePvK * champPv * um;
  const unitDmg = ref.pv * RAID.foeDmgK * champDmg * silhouetteDmgMult(um);
  // ⚠️ EFFECTIF DE CALIBRATION : la foule visible est ramenée au nombre sur lequel la
  // difficulté a été mesurée. Les PV suivent l’effectif, les dégâts sa RACINE — la
  // dilution doit donc emprunter le MÊME chemin, sans quoi une armée plus nombreuse
  // frapperait moins fort (√ oblige) tout en encaissant pareil.
  const eff = g.count / (g.massMult ?? 1);
  return {
    name: `${g.emoji} ${g.species}${g.count > 1 ? ` ×${g.count}` : ''}`,
    pv: Math.max(1, Math.round(unitPv * eff)),
    damage: Math.max(1, Math.round(unitDmg * Math.pow(eff, RAID.groupDmgExp))),
    crit: g.champion ? 0.15 : 0.05,
    dodge: 0,
    initiative: g.level,
    strikes: 1,
  };
}

/** Ce que la garnison apporte au mur. Les quatre premiers champs alimentent le
 *  `Combatant` de la base ; les deux derniers sortent du combat (renseignement, fouille)
 *  — c'est ce qui donne un rôle non-combattant à des espèces qui n'en auraient pas. */

/** Emplacements de garnison : **un de plus tous les 5 niveaux, à partir de 1**. Le chenil
 *  grandit donc avec le joueur au lieu de rester figé à 3 — et comme les familiers ne
 *  viennent que du Labyrinthe, la réserve suit le même rythme que les places.
 *  ⚠️ Le nombre de places multiplie l'apport de la garnison : les canaux de COMBAT sont
 *  donc plafonnés (`GARRISON_CAP`), faute de quoi une garnison de dix rendrait la base
 *  imprenable. Seuls le renseignement et la fouille, qui ne sont pas des stats de combat,
 *  s'additionnent librement. */
/** 🐾 COMBIEN D’AVENTURIERS PEUVENT PORTER UN COMPAGNON — le Chenil est à eux ce que
 *  la Guilde est aux aventuriers, **sauf qu’il ne les crée pas** : les familiers
 *  viennent du Labyrinthe (formulation de l’utilisateur).
 *
 *  ⚠️ MÊME RYTHME QUE `guildRoster` — **+1 tous les 2 niveaux** : « on recrute un
 *  aventurier tous les 2 lvl », donc on doit pouvoir en équiper un tous les 2 lvl,
 *  sinon le vivier grandit plus vite que ce qu’on sait armer.
 *
 *  ⚠️ PLUS DE PLAFOND DE RÔLES (v0.773.1, retiré) : il venait des 6 rôles de garnison
 *  au mur, or cette garnison n’existe plus. Un compagnon n’occupe plus un « rôle »,
 *  il suit son homme — deux loups sur deux aventuriers sont deux combattants un peu
 *  meilleurs, pas un doublon inemployable. */
export function companionSlots(kennelLevel: number): number {
  return kennelLevel <= 0 ? 0 : 1 + Math.floor(kennelLevel / 2);
}

/** 🎖️ RANG MAXIMAL qu’un familier peut avoir pour tenir le mur — le second levier du
 *  Chenil, et l’exact pendant de ce que la Guilde fait pour les aventuriers.
 *
 *  ⚠️ ON RÉUTILISE `PROMO_LEVELS`, la table qui gate déjà les strates d’aventurier.
 *  Elle dit « quel niveau de bâtiment pour quel rang » et compte exactement autant
 *  d’entrées que `RANK_ORDER` — écrire une seconde table, c’est garantir qu’elles
 *  divergent au premier réglage. Commun dès le niveau 1, primordial au 23.
 *
 *  ⚠️ Ça ne concerne QUE le mur. Le familier que le héros PORTE n’est pas au chenil :
 *  il part au combat avec lui, et aucun bâtiment ne le plafonne. */
function companionRankCap(kennelLevel: number): number {
  let cap = -1;
  // ⚠️ Borné à `RANK_ORDER` : `PROMO_LEVELS` compte aujourd’hui autant d’entrées que de
  // raretés, mais il appartient aux AVENTURIERS — s’il en gagne une, le cap ne doit pas
  // désigner un rang qui n’existe pas.
  const max = Math.min(PROMO_LEVELS.length, RANK_ORDER.length);
  for (let i = 0; i < max; i++) if (kennelLevel >= PROMO_LEVELS[i]!) cap = i;
  return cap;
}

/** Ce familier peut-il être POSTÉ ? ⚠️ Appliqué au CALCUL du combat autant qu’à
 *  l’écriture : une garnison rangée avant ce changement se soigne toute seule, sans
 *  migration — même politique que `dedupeGarrisonRoles` et que les POI périmés. */
/** Le rang maximal du Chenil, en toutes lettres. ⚠️ Une seule lecture : le store en a
 *  besoin pour refuser, l’écran pour l’annoncer — deux conversions index→libellé
 *  finiraient par se contredire, et `RANK_ORDER` n’a rien à faire dans un store. */
export function companionRankLabel(kennelLevel: number): string {
  const i = companionRankCap(kennelLevel);
  return i < 0 ? '—' : RARITY_LABEL[RANK_ORDER[i]!];
}

/** Le niveau de Chenil qui ouvrira la place SUIVANTE — `null` une fois toutes les
 *  places ouvertes. ⚠️ La règle du pas (`/5`) ET son plafond vivent ICI : l’écran la
 *  recalculait, et annonçait donc « +1 place au niveau 30 » alors qu’aucune ne viendra
 *  plus jamais. Une règle recopiée finit toujours par mentir. */
export function companionNextSlotLevel(kennelLevel: number): number | null {
  const l = Math.max(0, kennelLevel);
  const next = (Math.floor(l / 5) + 1) * 5;
  return companionSlots(next) > companionSlots(l) ? next : null;
}

/** Le niveau de Chenil qui ouvrira le rang SUIVANT — `null` une fois au sommet.
 *  ⚠️ La page ne doit pas importer `PROMO_LEVELS` : cette table appartient aux
 *  AVENTURIERS, et un écran qui la lit directement ne saurait pas qu’elle a bougé. */
export function companionNextRankLevel(kennelLevel: number): number | null {
  const next = companionRankCap(kennelLevel) + 1;
  return next < Math.min(PROMO_LEVELS.length, RANK_ORDER.length) ? PROMO_LEVELS[next]! : null;
}

export function canCompanion(fam: Item, kennelLevel: number): boolean {
  return kennelLevel > 0 && rankIndex(fam.rarity) <= companionRankCap(kennelLevel);
}
/** ⚠️ IL N'Y A PLUS DE REPLI, ET C'EST VOULU. `garrisonBonus` et `autoGarrison`
 *  prenaient `slots = GARRISON_SLOTS` (3) par défaut : le STORE omettait l'argument —
 *  donc le combat ne comptait que 3 familiers — pendant que l'ÉCRAN passait
 *  `companionSlots(niveau)` et annonçait le bonus de tous. Au niveau 28 : 6 postés
 *  affichés, 3 qui se battent. L'étiquette mentait, et c'est précisément ce que la
 *  v0.683 prétendait avoir corrigé (« le total réellement appliqué »).
 *  Le paramètre est désormais REQUIS : l'oublier ne compile plus. */

/** Une structure ENDOMMAGÉE ne rend que la moitié de son effet ; un familier FATIGUÉ
 *  aussi. Il n'est jamais perdu ni blessé : sinon personne ne posterait ses bons
 *  familiers, et la mécanique mourrait le jour où elle se déclenche. */
const FATIGUE_MS = 6 * 3600_000;

/** Plafond DUR de la convalescence. Il doit rester très en deçà de l'intervalle entre
 *  deux sièges (24 h au plus serré) : un héros encore alité au siège suivant ne pourrait
 *  pas défendre, la défaite entraînerait la défaite. */
export const WOUND_MAX_MS = 8 * 3600_000;
/** Part maximale de l'intervalle entre deux sièges que la convalescence peut occuper. */
const WOUND_INTERVAL_SHARE = 0.4;

/** Le repos qu'il reste à un familier sorti d'un siège. L'Infirmerie l'abrège. */
export function fatigueMsFor(infirmaryLevel: number): number {
  return Math.round(
    FATIGUE_MS *
      infirmaryMult(
        infirmaryLevel,
        INFIRMARY.fatiguePerLvl,
        INFIRMARY.fatigueFloor,
        INFIRMARY.fatigueTail,
      ),
  );
}
function isFatigued(fam: { fatigueUntil?: number }, now: number): boolean {
  return !!fam.fatigueUntil && now < fam.fatigueUntil;
}

/** Niveau de dressage DÉFENSIF effectif d'un familier posté. ⚠️ **Plafonné par le
 *  CHENIL** : c'est le bâtiment qui entraîne, un familier ne peut pas dépasser l'école
 *  qui le forme. Sans ce plafond, le chenil de niveau 1 vaudrait le chenil de niveau 20
 *  dès que les familiers auraient tourné quelques sièges — le bâtiment n'aurait servi
 *  qu'à ouvrir des places. */
function cappedDefLevel(fam: Item, kennelLevel: number): number {
  return Math.min(famLevel(fam.defXp, 'def'), Math.max(0, kennelLevel));
}

/** La BASE en défenseur : la muraille encaisse, les tourelles tirent, le héros présent
 *  prête une part de sa force. Une structure ENDOMMAGÉE ne compte pas (defenseLevel). */
/** La BASE en défenseur.
 *
 *  ⚠️ `playerLevel` n'est pas décoratif : l'enceinte vaut une FRACTION de ce que ton
 *  niveau justifie (`niveau de la structure / ton niveau`), et non la valeur absolue d'un
 *  combattant de son propre niveau. Sans ça, l'écart se paie de façon EXPONENTIELLE —
 *  l'offense d'un `refFighter` croît en ~L⁴, si bien qu'une enceinte à 4 niveaux de retard
 *  ne valait pas « un peu moins » mais RIEN : mesuré, 0 % de tenue jusqu'à 19, 24 % à 22,
 *  78 % à 26. Une falaise, pas une pente. Proportionnelle, une enceinte à moitié montée
 *  vaut la moitié — ce que le joueur attend, et ce qui rend le rattrapage lisible. */
/** ⚠️ CHEMIN LEGACY : plus aucun appel dans `src/` depuis que `resolveRaid` prend
 *  l’état (v0.761). Il ne survit que pour les tests d’enceinte, qui y lisent la part du
 *  mur et des tourelles. Son paramètre de GARNISON est retiré avec elle. */
export function baseCombatant(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero?: Combatant | null,
): Combatant {
  const wl = defenseLevel(defenses, 'wall');
  const tl = defenseLevel(defenses, 'turret');
  const L = Math.max(1, playerLevel);
  const ref = refFighter(L);
  const refOff = offensePerRound(ref);
  /** Part de l'enceinte réellement bâtie, bornée à 1 : sur-monter au-delà de son niveau
   *  ne donne rien de plus (le sport reste le plafond). */
  const share = (lvl: number) => Math.min(1, Math.max(0, lvl) / L);

  let pv = wl > 0 ? ref.pv * RAID.wallPvK * share(wl) * defenseEfficiency(defenses, 'wall') : 0;
  // Le mur ne contribue plus aux dégâts (`wallDmgK` = 0) — terme gardé comme point
  // d'extension : cf. sa constante pour le pourquoi.
  let damage = wl > 0 ? refOff * RAID.wallDmgK * share(wl) : 0;
  if (tl > 0) {
    damage +=
      refOff *
      RAID.turretDmgK *
      turretCount(tl) *
      share(tl) *
      defenseEfficiency(defenses, 'turret');
  }
  if (hero) {
    pv += hero.pv * RAID.heroPvShare;
    damage += hero.damage * (hero.strikes ?? 1) * RAID.heroDmgShare;
  }

  return {
    name: 'La Base',
    pv: Math.max(1, Math.round(pv)),
    damage: Math.max(1, Math.round(damage)),
    crit: 0,
    dodge: 0,
    initiative: 999, // les défenseurs tirent en premier : ils voient venir
    // Le rempart ABRITE, sous un plafond de 50 % : au-delà, plus rien ne peut tomber
    // et le siège n'aurait plus d'issue.
    dmgReduction: Math.min(
      0.5,
      wl > 0 ? RAID.wallArmorK * share(wl) * defenseEfficiency(defenses, 'wall') : 0,
    ),
    strikes: 1,
    regen: RAID.regenPct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚖️ LE RAPPORT DE FORCES — ce que vaut ma défense, ce que vaut l'armée
//
// ⚠️ POURQUOI : la contribution de l'enceinte, des familiers postés et du héros était
// INVISIBLE (signalé par l'utilisateur : « extrêmement flou »). On assignait à
// l'aveugle, donc la stratégie sûre était de tout garder à la maison en permanence —
// ce qui coûte du temps de carte sans qu'on sache si ça servait à quelque chose.
//
// ⚠️ UN SEUL ARBITRE : `combatPower` (= √(offense × survie)), celui qui tranche déjà
// les objets, les donjons et les familiers. En inventer un second pour la défense
// recréerait exactement le défaut « deux comparateurs qui disent des trucs différents »
// réglé sur l'équipement en v0.744.
//
// ⚠️ MESURÉ AVANT D'ÊTRE AFFICHÉ (sonde, 40 configurations × 60 graines, niveaux 10 à
// 90) : le rapport défense/assaut prédit la tenue avec **14 inversions sur 780 paires**
// (1,8 %), et — c'est ce qui compte — la courbe est LA MÊME à tous les niveaux :
// ratio 0,40 → 0 % · 0,60 → 20 % · 0,80 → 45 % · 1,00 → 75 % · 1,15 → 95 %.
// Une jauge unique ne ment donc à aucun niveau. Si la mesure avait montré le contraire,
// il ne fallait PAS l'afficher.

/**
 * CE QUI DÉFEND VRAIMENT, ramené à un combattant — la SEULE base du rapport de forces.
 *
 * ⚠️ IL LIT LES MÊMES UNITÉS QUE LA BATAILLE (`siegeWallOf` + `siegeDefenders`). Après le
 * branchement du moteur en deux phases, le panneau lisait encore `baseCombatant` : il
 * ignorait donc les AVENTURIERS — qui défendent désormais — et appliquait le bonus du
 * chenil à la MURAILLE, ce qui n’est plus vrai. Deux comparateurs qui se contredisent,
 * exactement le défaut réglé sur l’équipement en v0.744. En dérivant des mêmes unités,
 * ils ne peuvent plus diverger.
 *
 * ⚠️ Les PV du MUR comptent dans la survie : c’est ce que l’armée doit abattre avant
 * d’entrer, donc ça fait partie de ce qui « tient ». Les dégâts, eux, ne viennent que
 * des défenseurs — un rempart ne tue personne (v0.753).
 */
function defenseCombatant(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero: Combatant | null,
  guard: GuardUnit[] = [],
): Combatant {
  const wall = siegeWallOf(defenses, playerLevel);
  const def = siegeDefenders(defenses, playerLevel, hero, guard);
  const wl = defenseLevel(defenses, 'wall');
  const share = Math.min(1, Math.max(0, wl) / Math.max(1, playerLevel));
  return {
    name: 'La Base',
    pv: Math.max(1, wall.pv + def.reduce((n, u) => n + u.pv, 0)),
    damage: Math.max(
      1,
      def.reduce((n, u) => n + u.damage, 0),
    ),
    crit: 0,
    dodge: 0,
    initiative: 999,
    dmgReduction: wl > 0 ? RAID.wallArmorK * share * defenseEfficiency(defenses, 'wall') : 0,
    strikes: 1,
    regen: RAID.regenPct,
  };
}

/** ⚖️ COMBIEN DE FOIS SUR CENT LA BASE TIENT — MESURÉ SUR LE MOTEUR, jamais estimé.
 *
 *  ⚠️ POURQUOI ON A ARRÊTÉ D’ESTIMER. Le pronostic passait par un PROXY : un rapport de
 *  deux « puissances » comparé à des seuils calibrés une fois pour toutes. En branchant
 *  le moteur en deux phases (v0.763), les tourelles sont devenues des unités qu’on peut
 *  réduire au silence — donc elles ont des PV, qui se sont ajoutés à ceux du mur. La
 *  survie affichée a gonflé sans que la difficulté bouge : un joueur a signalé sa défense
 *  passée de 1900 à 3000 sans rien avoir changé. On avait mesuré l’équivalence de TENUE ;
 *  la jauge, non.
 *
 *  ⚠️ ET CE N’ÉTAIT PAS RATTRAPABLE PAR UNE CONSTANTE. Mesuré sur 72 configurations ×
 *  60 sièges : le ratio saute à 1,26-2,39 quand la jauge sature dès 1,05, « Tu tiens
 *  largement » recouvrait des tenues réelles de 13 % à 100 %, et le seuil d’équilibre
 *  DÉRIVAIT avec le niveau (1,15 au niveau 12 → 1,55 au niveau 80) — or c’est la
 *  platitude de cette courbe qui autorisait une jauge unique. Il n’y avait plus de
 *  constante à recalibrer.
 *
 *  ⚠️ UN PRONOSTIC SIMULÉ NE PEUT PAS DIVERGER DE LA BATAILLE, par construction — c’est
 *  toute la raison de ce changement, et c’est déjà ce que font le 🎯 % des donjons et le
 *  « ~N vagues » de l’arène. Le jour où l’équilibrage du siège bougera, le pronostic
 *  suivra sans que personne n’ait à s’en souvenir.
 *
 *  ⚠️ ON NE REJOUE JAMAIS LA GRAINE RÉELLE : le siège qui vient est déjà écrit, la rejouer
 *  révélerait son issue. On tire des graines DÉRIVÉES — déterministes, donc le pronostic
 *  ne sautille pas d’un rendu à l’autre — et toutes différentes de celle de la vraie
 *  bataille. Le % dit « sur des batailles comparables », jamais « sur CELLE-ci ».
 *
 *  ⚠️ LA COMPOSITION, ELLE, EST FIXE : seule la conduite du combat varie. Faire varier
 *  l’armée reviendrait à pronostiquer sur une autre armée que celle qui arrive. Mesuré,
 *  cette variance-là est faible (8 % contre 5 % entre 24 et 200 tirages) : c’est l’ARMÉE
 *  qui fait la différence, pas le déroulé — d’où un pronostic net, et 24 tirages qui
 *  suffisent. */
export function siegeHoldChance(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero: Combatant | null,
  guard: GuardUnit[],
  raid: Raid,
  samples: number = RAID.oddsSamples,
): number {
  // ⚠️ Les trois entrées sont construites UNE fois : `simulateSiege` copie ce qu’on lui
  // donne (`att.map(u => ({ ...u }))`), donc les rejouer est sûr — et les rebâtir à chaque
  // tirage coûterait plus cher que la bataille elle-même.
  const wall = siegeWallOf(defenses, playerLevel);
  const att = siegeAttackers(raid);
  const def = siegeDefenders(defenses, playerLevel, hero, guard);
  const n = Math.max(1, samples);
  let held = 0;
  for (let i = 1; i <= n; i++) {
    if (simulateSiege(att, def, wall, (raid.seed ^ (i * 0x9e3779b1)) >>> 0 || 1).held) held++;
  }
  return held / n;
}
/** L'armée ramenée à UN combattant équivalent.
 *  ⚠️ PV CUMULÉS (elle se bat en séquence, la base les encaisse tous) et dégâts moyens
 *  PONDÉRÉS PAR LES PV : ceux qui tiennent le plus longtemps frappent le plus de fois.
 *  Une moyenne simple sous-estimerait le champion, qui est justement celui qui dure. */
export function armyCombatant(raid: Raid): Combatant {
  const cs = raid.groups.map(groupCombatant);
  const pv = cs.reduce((s, c) => s + c.pv, 0);
  const dmg = cs.reduce((s, c) => s + c.damage * c.pv, 0) / Math.max(1, pv);
  return {
    name: 'Armée',
    pv: Math.max(1, Math.round(pv)),
    damage: Math.max(1, Math.round(dmg)),
    crit: 0.05,
    dodge: 0,
    initiative: raid.level,
    strikes: 1,
  };
}

/** ⚔️🛡️ PUISSANCE DE DÉFENSE — la MAGNITUDE de ce que vaut la base, dans l’unité de
 *  tout le jeu (`combatPower` = √(offense × survie), l’arbitre des objets et des donjons).
 *
 *  ⚠️ RENDUE À LA DEMANDE DE L’UTILISATEUR (« je voudrais ravoir la puissance de défense
 *  plutôt qu’un % »), et il a raison : le pronostic SATURE. À enceinte pleine il affiche
 *  100 % et ne bouge plus — donc il ne montre RIEN du progrès quand on améliore une
 *  structure, alors que c’est précisément la question qu’on se pose devant « Améliorer ».
 *
 *  ⚠️ ELLE NE PRÉDIT RIEN, ET C’EST TOUT L’ACCORD AVEC LA v0.767. Ce chiffre a été retiré
 *  parce qu’on s’en servait pour PRONOSTIQUER via un rapport de puissances — et ce rapport
 *  avait cessé d’être fidèle. Le pronostic reste donc SIMULÉ (`siegeHoldChance`) ; la
 *  puissance ne répond qu’à « est-ce que je vaux plus qu’hier ? », à quoi elle répond
 *  toujours juste parce qu’elle est MONOTONE. Deux questions, deux nombres, aucun
 *  risque qu’ils se contredisent — ils ne parlent pas de la même chose. */
export function defensePower(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero?: Combatant | null,
  guard: GuardUnit[] = [],
): number {
  return combatPower(defenseCombatant(defenses, playerLevel, hero ?? null, guard));
}

/** Puissance d'ASSAUT de l'armée, dans la même unité que la défense. */
export function assaultPower(raid: Raid): number {
  return combatPower(armyCombatant(raid));
}

/** Ce qu'un contributeur apporte, mesuré PAR ABLATION : on recalcule la puissance sans
 *  lui, et l'écart EST sa contribution.
 *
 *  ⚠️ Jamais une formule recopiée — c'est la leçon de `garrisonBonus` appliqué à un seul
 *  familier (v0.683) : une étiquette qui refait le calcul à sa façon finit par mentir
 *  (le projet s'est fait avoir deux fois, sur les libellés de POI et le budget de
 *  ferraille). Ici l'étiquette ne PEUT pas diverger du combat : c'est le même appel.
 *
 *  ⚠️ Les parts ne s'additionnent pas exactement au total, et c'est NORMAL : les canaux
 *  se multiplient (la garnison amplifie des PV que le mur fournit). On affiche donc
 *  « ce qu'on perdrait en le retirant », qui est la question qu'on se pose vraiment. */
export interface DefenseShare {
  id: 'wall' | 'turret' | 'garrison' | 'hero';
  label: string;
  emoji: string;
  /** PUISSANCE perdue si ce contributeur disparaissait (≥ 0). ⚠️ Contrairement à
   *  `holdLoss`, elle ne SATURE pas : à enceinte pleine on tient 100 % avec ou sans le
   *  mur, mais on ne VAUT pas la même chose. C’est ce qui rend l’investissement lisible. */
  power: number;
  /** POINTS DE TENUE perdus si ce contributeur disparaissait (0..1, ≥ 0).
   *  ⚠️ C’était une « puissance » — un proxy. C’est désormais ce que le joueur risque
   *  vraiment : « sans les tourelles, tu tombes de 88 % à 12 % ». */
  holdLoss: number;
  /** Présent aujourd'hui ? (un héros parti, une garnison vide) */
  active: boolean;
  /** ⚠️ CE QU'IL FAIT, séparément : 🛡️ ce qu'il fait TENIR (PV × réduction) et ⚔️ ce
   *  qu'il fait TUER (dégâts par tour). Un seul nombre mélangeait les deux et laissait
   *  croire qu'un mur pouvait gagner une bataille — signalé par l'utilisateur. Mesuré
   *  par ablation comme le reste : la valeur SANS lui, soustraite. */
  def: number;
  atk: number;
}

/** Les deux faces d'un combattant : ce qu'il ENCAISSE (PV corrigés de la réduction) et
 *  ce qu'il SORT par tour.
 *
 *  ⚠️ PRIVÉE, volontairement. L'écran doit passer par `defenseBreakdown` : une valeur
 *  BRUTE n'est pas une PART (ce qu'on perdrait sans ce contributeur), et exposer les deux
 *  inviterait à les confondre.
 *
 *  ⚠️ Elle redit la décomposition de `combatPower` (offense × survie) sans la partager —
 *  aujourd'hui sans conséquence, `baseCombatant` forçant crit = 0, dodge = 0 et aucun proc.
 *  Le jour où le héros transmettrait son crit à la base, `atk` divergerait de la puissance
 *  affichée juste au-dessus, dans le même panneau. À rapatrier dans `combat.ts`
 *  (`offenseOf`/`survivalOf`, avec `combatPower` construite par-dessus) le jour où l'un des
 *  deux bouge. */
function defenseFacets(c: Combatant): { def: number; atk: number } {
  return {
    def: Math.round(c.pv / (1 - (c.dmgReduction ?? 0))),
    atk: Math.round(offensePerRound(c)),
  };
}

/** ⚠️ LA DÉCOMPOSITION PARLE DE TA BASE, PAS DU SIÈGE DU JOUR — et c’est délibéré. On
 *  vient ici pour savoir ce que chaque structure APPORTE, y compris quand rien n’est en
 *  vue ; l’adosser à l’armée en approche l’aurait rendue muette les trois quarts du temps
 *  et aurait fait bouger les parts à chaque nouvelle armée, sans qu’on ait rien touché.
 *  Elle se mesure donc contre le repère (`referenceHold`) ; le pronostic, lui, reste sur
 *  le vrai raid. */
export function defenseBreakdown(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero: Combatant | null,
  guard: GuardUnit[],
  now: number,
): { power: number; hold: number; parts: DefenseShare[] } {
  const chance = (d: DefenseStructure[], h: Combatant | null, g: GuardUnit[]) =>
    referenceHold(d, playerLevel, h, g, now);
  const hold = chance(defenses, hero, guard);
  const porte = defenseCombatant(defenses, playerLevel, hero, guard);
  const total = combatPower(porte);
  const full = defenseFacets(porte);
  /** Ce qu’un contributeur apporte — tenue, encaisse et feu — par UNE SEULE ablation. */
  const contrib = (d: DefenseStructure[], h: Combatant | null, g: GuardUnit[]) => {
    const f = defenseFacets(defenseCombatant(d, playerLevel, h, g));
    return {
      power: Math.max(0, total - combatPower(defenseCombatant(d, playerLevel, h, g))),
      holdLoss: Math.max(0, hold - chance(d, h, g)),
      def: Math.max(0, full.def - f.def),
      atk: Math.max(0, full.atk - f.atk),
    };
  };
  const drop = (id: DefenseId) => defenses.filter((d) => d.typeId !== id);
  // ⚠️ Le nom et l’emoji d’une STRUCTURE viennent de `DEFENSE_TYPES`, jamais d’une
  // recopie : renommer une structure laisserait sinon ce panneau sur l’ancien nom.
  const struct = (id: DefenseId) => {
    const t = defenseType(id);
    return { label: t?.label ?? id, emoji: t?.emoji ?? '' };
  };
  const parts: DefenseShare[] = [
    {
      id: 'wall',
      ...struct('wall'),
      ...contrib(drop('wall'), hero, guard),
      active: defenseLevel(defenses, 'wall') > 0,
    },
    {
      id: 'turret',
      ...struct('turret'),
      ...contrib(drop('turret'), hero, guard),
      active: defenseLevel(defenses, 'turret') > 0,
    },
    // ⚠️ LA GARNISON EST UNE LIGNE À PART : les aventuriers défendent depuis le
    // branchement du moteur, et rien ne le disait. C’est aussi la ligne qui rend lisible
    // « qui est parti » — un convoi en route, c’est autant de moins ici.
    {
      id: 'garrison',
      label: 'Garnison',
      emoji: '⚔️',
      ...contrib(defenses, hero, []),
      active: guard.length > 0,
    },
    {
      id: 'hero',
      label: 'Héros',
      emoji: '🦸',
      ...(hero ? contrib(defenses, null, guard) : { power: 0, holdLoss: 0, def: 0, atk: 0 }),
      active: !!hero,
    },
  ];
  return { power: total, hold, parts };
}

/**
 * LA DÉFENSE AU COMPLET : ce que la base vaudrait si TOUT LE MONDE était là.
 *
 * ⚠️ C’est la question que le joueur se pose en envoyant un convoi, et elle n’avait
 * aucune réponse à l’écran (demandé par l’utilisateur). Le panneau montrait la défense
 * du moment sans dire ce qu’elle DEVIENDRAIT — ni ce qu’on est en train d’abandonner en
 * faisant partir des gens.
 *
 * ⚠️ On passe le vivier ENTIER et le héros supposé présent : c’est un PLAFOND, pas une
 * prévision. Les blessés en font partie — ils rentreront.
 */
/** 📐 LE REPÈRE PERMANENT : ce que vaut ta base FACE À UNE ARMÉE TYPE DE TON NIVEAU.
 *
 *  ⚠️ POURQUOI IL EXISTE. Le pronostic ne parle que de l’armée qui arrive ; or on vient
 *  sur cet écran pour savoir « est-ce que mon enceinte tient la route ? », y compris
 *  quand rien n’est en vue. Sans repère, le panneau serait muet les trois quarts du temps
 *  — et c’est justement au calme qu’on décide d’améliorer une structure.
 *
 *  ⚠️ IL NE COURT-CIRCUITE PAS L’ESPIONNAGE : il ne dit rien de l’armée en approche (ni
 *  faction, ni effectif, ni niveau), seulement ce que vaut la base dans l’absolu. La Tour
 *  de guet garde donc l’exclusivité du pronostic sur CE siège-là.
 *
 *  ⚠️ ON MOYENNE SUR PLUSIEURS ARMÉES, pas sur une graine fixe : mesuré, deux armées du
 *  même niveau donnent 8 % et 78 % de tenue. Une seule armée de référence serait un tirage
 *  au sort déguisé en repère. */
export function referenceHold(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero: Combatant | null,
  guard: GuardUnit[],
  now: number,
): number {
  const k = Math.max(1, RAID.typicalArmies);
  const par = Math.max(1, Math.round(RAID.oddsSamples / k));
  let sum = 0;
  for (let i = 0; i < k; i++) {
    // Graines FIXES : le repère ne doit pas bouger d’un rendu à l’autre alors que rien
    // n’a changé — on compare sa base à elle-même d’un jour sur l’autre.
    const raid = rollRaid((0x5eed + i * 0x9e37) >>> 0, playerLevel, now, 0);
    sum += siegeHoldChance(defenses, playerLevel, hero, guard, raid, par);
  }
  return sum / k;
}

/** ⚠️ PLUS DE JAUGE À SEUIL, et c’est le cœur du changement. Tant que le pronostic
 *  passait par un rapport de puissances, il lui fallait un repère (`SIEGE_EVEN` = 0,88,
 *  mesuré une fois) et une fonction pour placer ce repère au milieu d’une barre. La TENUE
 *  n’en a pas besoin : elle EST déjà une position de 0 à 1, et « 7 fois sur 10 » se lit
 *  sans connaître aucun seuil. `siegeGauge` et `SIEGE_EVEN` sont donc SUPPRIMÉS, pas
 *  recalibrés — il n’y avait plus de constante à régler. */
export type SiegeOdds = 'perdu' | 'risque' | 'serre' | 'favorable' | 'large';
/** Les bandes, en TENUE MESURÉE. ⚠️ Elles ne se calibrent plus : ce sont des tranches
 *  d’une probabilité, pas des seuils sur un proxy. Un changement d’équilibrage déplace
 *  les joueurs d’une bande à l’autre, il ne rend jamais les bandes fausses. */
export function siegeOdds(hold: number): SiegeOdds {
  if (hold < 0.2) return 'perdu';
  if (hold < 0.45) return 'risque';
  if (hold < 0.65) return 'serre';
  if (hold < 0.85) return 'favorable';
  return 'large';
}

export const ODDS_LABEL: Record<SiegeOdds, string> = {
  perdu: 'L’enceinte cède',
  risque: 'Très risqué',
  serre: 'Ça va se jouer',
  favorable: 'Tu devrais tenir',
  large: 'Tu tiens largement',
};

/** Les bandes où la base ne tient PLUS. Source unique : un écran qui redresserait la
 *  liste dériverait le jour où une bande change de nom. */
const ODDS_BAD: readonly SiegeOdds[] = ['perdu', 'risque', 'serre'];
export const isOddsRisky = (o: SiegeOdds): boolean => ODDS_BAD.includes(o);

/**
 * CE QUE COÛTERAIT UN DÉPART, face à l’armée qui arrive.
 *
 * ⚠️ LA QUESTION QUE LE JOUEUR SE POSE AU MOMENT D’ENVOYER (demandé par l’utilisateur :
 * « pouvoir envoyer des convois ou le héros sans se mettre dans le rouge »). L’écran
 * d’envoi ne savait RIEN du siège en approche : on partait, et on découvrait en
 * rentrant que la base était tombée pendant le voyage.
 *
 * ⚠️ Rend TOUJOURS les deux pronostics, même quand rien ne change : c’est l’écran qui
 * décide d’alerter ou non, et lui donner un `null` l’obligerait à refaire le calcul
 * pour afficher l’état courant.
 */
/** Le héros sera-t-il DERRIÈRE LES MURS quand l’armée frappera ?
 *
 *  ⚠️ Signalé par l’utilisateur : l’écran annonçait « il ne défendra pas » alors qu’il
 *  rentrait dans une heure et l’assaut tombait dans deux. C’est la MÊME règle que
 *  `departureRisk` — la défense qui compte est celle du MOMENT OÙ L’ARMÉE FRAPPE — et
 *  c’est exactement l’écran dont on redoutait qu’il l’oublie. Elle vit donc ici, une
 *  seule fois, pour les deux.
 *
 *  ⚠️ La RÉSOLUTION, elle, était déjà juste : `baseTick` lit `heroIsHome` à l’instant du
 *  combat, où l’expédition est close. Seul l’AFFICHAGE était pessimiste — il faisait
 *  renoncer à des départs qui ne coûtaient rien.
 *
 *  @param home   il est à la base MAINTENANT
 *  @param backAt quand il rentre (null : il n’est pas parti, ou on ne sait pas)
 *  @param raidAt quand l’armée frappe (null : aucune armée en vue) */
export function heroDefends(
  home: boolean,
  backAt?: number | null,
  raidAt?: number | null,
): boolean {
  if (home) return true;
  // Sans les deux dates on ne SAIT pas : il est dehors, on le compte absent. Supposer
  // qu’il rentre à temps gonflerait la défense affichée sur une devinette.
  if (!backAt || !raidAt) return false;
  // Borne inclusive, comme `departureRisk` : rentrer à l’heure pile, c’est être rentré.
  return backAt <= raidAt;
}

export function departureRisk(
  defenses: DefenseStructure[],
  playerLevel: number,
  raid: Raid,
  avant: { hero: Combatant | null; guard: GuardUnit[] },
  apres: { hero: Combatant | null; guard: GuardUnit[] },
  /** QUAND ils rentrent, et QUAND l’armée frappe. Omis = on ne sait pas, donc on alerte. */
  timing?: { backAt: number; raidAt: number },
): {
  before: SiegeOdds;
  after: SiegeOdds;
  /** Les tenues mesurées, pour dire de combien ça bouge et pas seulement que ça bouge. */
  holdBefore: number;
  holdAfter: number;
  worsens: boolean;
  risky: boolean;
  /** Ils sont RENTRÉS avant que l’armée ne frappe : le départ ne coûte rien au siège. */
  inTime: boolean;
  /** Le départ AURAIT dégradé la bande, mais ils rentrent à temps. C’est la seule
   *  condition où il vaut la peine de le DIRE : le silence, sinon, ressemble à un oubli. */
  covered: boolean;
} {
  const chance = (x: { hero: Combatant | null; guard: GuardUnit[] }) =>
    siegeHoldChance(defenses, playerLevel, x.hero, x.guard, raid);
  const holdBefore = chance(avant);
  const holdAfter = chance(apres);
  const before = siegeOdds(holdBefore);
  const after = siegeOdds(holdAfter);
  // ⚠️ UN VOYAGE QUI SE TERMINE AVANT L’ASSAUT NE COÛTE RIEN (signalé par l’utilisateur).
  // La défense qui compte est celle du MOMENT OÙ L’ARMÉE FRAPPE, jamais celle de l’instant
  // du départ : un convoi de deux heures face à un siège dans huit n’enlève personne.
  // Alerter quand même serait un faux positif — et une alerte qu’on prend en défaut cesse
  // d’être lue, y compris les fois où elle a raison.
  // ⚠️ La règle vit ICI, pas dans un écran : deux boutons envoient du monde (convoi et
  // héros), et le second finirait par l’oublier.
  const inTime = !!timing && timing.backAt <= timing.raidAt;
  // « Ça empire » se lit sur l’ORDRE des bandes, pas sur la tenue brute : c’est ce que le
  // joueur voit, et deux tenues voisines dans la même bande ne changent rien pour lui.
  const degrade = ODDS_ORDER.indexOf(after) < ODDS_ORDER.indexOf(before);
  return {
    before,
    after,
    holdBefore,
    holdAfter,
    worsens: !inTime && degrade,
    risky: !inTime && isOddsRisky(after),
    inTime,
    covered: inTime && degrade,
  };
}

/** Les bandes, de la pire à la meilleure — l'ordre EST la comparaison. */
const ODDS_ORDER: readonly SiegeOdds[] = ['perdu', 'risque', 'serre', 'favorable', 'large'];

/** Ce que l'ESPIONNAGE laisse voir de la puissance assaillante.
 *
 *  ⚠️ C'est ici que la Tour de guet gagne son métier de haut niveau : elle n'achète plus
 *  seulement du préavis (plafonné à 8 h dès son niveau 21) et des paliers de composition,
 *  mais de la PRÉCISION sur le seul chiffre qui décide — « est-ce que je tiens ? ».
 *
 *  ⚠️ L'intervalle CONTIENT toujours la vérité : le renseignement peut être vague, il ne
 *  MENT jamais. Sa position dans la fourchette est tirée sur la graine du raid — sinon
 *  l'encadrement serait centré sur la vraie valeur, et « imprécis » ne voudrait rien dire
 *  (on lirait le milieu). */
export function assaultEstimate(
  power: number,
  clarity: number,
  raidSeed = 0,
): { known: boolean; lo: number; hi: number; exact: boolean } {
  if (clarity <= 0) return { known: false, lo: 0, hi: 0, exact: false };
  if (clarity >= RAID.clarityMax) return { known: true, lo: power, hi: power, exact: true };
  // Largeur relative de la fourchette : large quand on ne voit rien, serrée près du max.
  const width = RAID.estimateWidth[Math.min(clarity, RAID.estimateWidth.length - 1)]!;
  const span = power * width;
  // Où la vérité tombe DANS la fourchette (0..1), tiré sur la graine du raid.
  // ⚠️ XOR **puis** normalisation, comme partout ailleurs dans le projet
  // (`(seed ^ K) >>> 0 || 1`) : l'ordre inverse laissait un `|| 1` inutile (un XOR par
  // une constante non nulle ne rend jamais 0) et une valeur signée. Sans conséquence
  // ici, mais une forme orpheline est une invitation à diverger.
  const rng = mulberry32((raidSeed ^ 0x5f3a7c11) >>> 0 || 1);
  const at = rng();
  const lo = Math.max(0, Math.round(power - span * at));
  return { known: true, lo, hi: Math.round(lo + span), exact: false };
}

export function isWounded(base: BaseState | null | undefined, now: number): boolean {
  return !!base?.wound && now < base.wound.until;
}
/** Le héros peut-il partir en donjon / boss / faille / Labyrinthe / expédition ? */
export function heroAvailable(base: BaseState | null | undefined, now: number): boolean {
  return !isWounded(base, now);
}
export function woundRemainingMs(base: BaseState | null | undefined, now: number): number {
  return isWounded(base, now) ? base!.wound!.until - now : 0;
}
/** Convalescence. L'Infirmerie l'abrège — c'est tout son intérêt. ⚠️ Bornée à
 *  `WOUND_MAX_MS` : elle doit rester COURTE devant l'intervalle entre deux sièges, sinon
 *  un héros encore alité manquerait la défense suivante et la défaite s'auto-entretiendrait. */
/** 🏥 LE MULTIPLICATEUR DE L’INFIRMERIE, avec sa QUEUE.
 *
 *  ⚠️ ELLE ÉTAIT LA SEULE STRUCTURE ENTIÈREMENT MORTE (signalé par l’utilisateur :
 *  « l’infirmerie est déjà au max »). Mesuré : ses DEUX leviers touchaient leur
 *  plancher dur aux niveaux 14 et 15 — soit 85 niveaux sur 100 qu’on paie au prix
 *  quadratique pour rien. Les autres structures gardent au moins un levier vivant
 *  (le Chenil par le dressage, la Tour de guet par la clarté).
 *
 *  ⚠️ ON PROLONGE, ON NE REDISTRIBUE PAS (règle v0.731) : `beyondCap` ne rend 0
 *  qu’en deçà du plafond, donc **toute valeur jusqu’à celui-ci est strictement
 *  inchangée** — personne ne se réveille avec une infirmerie moins bonne qu’hier.
 *
 *  ⚠️ UNE ASYMPTOTE, PAS UNE PENTE, et la queue reste SOUS le plancher : une
 *  convalescence ne peut jamais devenir gratuite. Sinon un héros blessé serait remis
 *  sur pied instantanément et le siège perdu cesserait de coûter quoi que ce soit. */
const INFIRMARY = {
  woundPerLvl: 0.06,
  woundFloor: 0.2,
  /** Ce que la queue retire AU PLUS, au-delà du plancher. **Strictement < au plancher.** */
  woundTail: 0.1,
  fatiguePerLvl: 0.05,
  fatigueFloor: 0.25,
  fatigueTail: 0.12,
  /** Niveaux au-delà du plafond où la queue a rendu la moitié de son effet. */
  tailHalf: 40,
} as const;

function infirmaryMult(level: number, perLvl: number, floor: number, tail: number): number {
  const l = Math.max(0, level);
  // Le plafond est DÉRIVÉ des deux constantes : régler le plancher déplace la queue
  // avec lui, au lieu de laisser un nombre écrit à la main prendre du retard.
  return (
    Math.max(floor, 1 - l * perLvl) - beyondCap(l, (1 - floor) / perLvl, tail, INFIRMARY.tailHalf)
  );
}

export function woundMsFor(infirmaryLevel: number, intervalMs?: number): number {
  const base = Math.min(
    WOUND_MAX_MS,
    Math.round(
      RAID.woundMs *
        infirmaryMult(
          infirmaryLevel,
          INFIRMARY.woundPerLvl,
          INFIRMARY.woundFloor,
          INFIRMARY.woundTail,
        ),
    ),
  );
  // ⚠️ BORNÉE PAR LE RYTHME RÉEL DES SIÈGES (v0.702). Tant que la fréquence était plafonnée
  // à un siège / 24 h, une convalescence de 6-8 h restait courte devant l'intervalle. Depuis
  // qu'elle suit le nombre de SÉANCES, l'intervalle descend à 3 h — un héros blessé
  // manquerait alors la défense suivante, puis la suivante : très exactement la spirale que
  // tout le système de siège s'attache à éviter. La convalescence ne peut donc jamais
  // dépasser une fraction de l'intervalle courant.
  return intervalMs ? Math.min(base, Math.round(intervalMs * WOUND_INTERVAL_SHARE)) : base;
}
/** Soins d'urgence : on peut toujours le remettre sur pied tout de suite, en ferraille.
 *  ∝ au repos qu'il reste → écourter la fin coûte une bricole, sauter toute la
 *  convalescence se paie. Il y a donc toujours une porte de sortie. */
export function healCost(remainingMs: number): number {
  return Math.max(1, Math.ceil((remainingMs / 3600_000) * 12));
}

// ── Résolution ──

/** Le siège. Les groupes arrivent l'un après l'autre et les PV de la base se reportent :
 *  c'est un donjon inversé, et `simulateDungeon` le fait déjà exactement. */
// ─────────────────────────────────────────────────────────────────────────────
// ⚔️🧱 LES UNITÉS DU SIÈGE — ce que le moteur en deux phases voit du vrai état.
//
// ⚠️ ON DÉRIVE, ON NE RÉINVENTE PAS : chaque terme reprend celui de `baseCombatant`
// (part du niveau joueur, efficacité d'une structure endommagée, parts du héros). Une
// seconde formule finirait par diverger du panneau de forces, et les deux mentiraient
// à tour de rôle — le défaut déjà rencontré trois fois sur ce projet.

/** La muraille, avec ses PV. */
export function siegeWallOf(defenses: DefenseStructure[], playerLevel: number): SiegeWall {
  const wl = defenseLevel(defenses, 'wall');
  const L = Math.max(1, playerLevel);
  const share = Math.min(1, Math.max(0, wl) / L);
  const pv =
    wl > 0
      ? Math.max(
          1,
          Math.round(refFighter(L).pv * RAID.wallPvK * share * defenseEfficiency(defenses, 'wall')),
        )
      : 1;
  return { pv, maxPv: pv };
}

/**
 * Les DÉFENSEURS, un par corps.
 *
 * ⚠️ QUI TIRE ET QUI COGNE, et pourquoi : les **tourelles** tirent (c'est leur métier) ;
 * le **héros** tient la brèche au corps à corps (sa présence doit peser là où ça se
 * décide) ; les **aventuriers** se répartissent selon leur FORME — l'agilité domine, on
 * en fait un tireur, sinon un homme d'armes. On ne tire pas ça au hasard : c'est la même
 * lecture que `advShapeLabel` montre déjà sur leur fiche.
 */
export function siegeDefenders(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero: Combatant | null,
  guard: {
    id: string;
    name: string;
    emoji: string;
    pv: number;
    damage: number;
    ranged: boolean;
  }[] = [],
): SiegeUnit[] {
  const L = Math.max(1, playerLevel);
  const ref = refFighter(L);
  const refOff = offensePerRound(ref);
  const tl = defenseLevel(defenses, 'turret');
  const share = (lvl: number) => Math.min(1, Math.max(0, lvl) / L);
  const out: SiegeUnit[] = [];

  const n = turretCount(tl);
  if (n > 0) {
    const dmg =
      (refOff * RAID.turretDmgK * n * share(tl) * defenseEfficiency(defenses, 'turret')) / n;
    const pv = Math.max(1, Math.round(ref.pv * RAID.turretPvK * share(tl)));
    // ⚠️ L’ABRI NE DÉPEND PAS DU NIVEAU DU MUR — un créneau est un créneau. Mis en
    // facteur de `share`, il rouvrait la FALAISE que la v0.672 avait supprimée : une
    // enceinte à moitié montée cumulait demi-abri et demi-PV, et tombait à 3 % de tenue
    // (mesuré). Le NIVEAU du mur se paie en PV — il tient plus longtemps, donc il abrite
    // plus longtemps. C’est déjà toute la boucle « il fait gagner du temps ».
    const cover = defenseLevel(defenses, 'wall') > 0 ? RAID.wallArmorK : 0;
    for (let i = 0; i < n; i++) {
      out.push({
        id: `t${i}`,
        side: 'def',
        kind: 'ranged',
        name: 'Baliste',
        emoji: '🏹',
        pv,
        maxPv: pv,
        damage: Math.max(1, Math.round(dmg)),
        origin: 'turret',
        armor: cover,
      });
    }
  }

  for (const a of guard) {
    out.push({
      id: a.id,
      side: 'def',
      kind: a.ranged ? 'ranged' : 'melee',
      name: a.name,
      emoji: a.emoji,
      pv: Math.max(1, Math.round(a.pv)),
      maxPv: Math.max(1, Math.round(a.pv)),
      damage: Math.max(1, Math.round(a.damage)),
      origin: 'adventurer',
    });
  }

  if (hero) {
    const pv = Math.max(1, Math.round(hero.pv * RAID.heroPvShare));
    out.push({
      id: 'hero',
      side: 'def',
      kind: 'melee',
      name: hero.name,
      emoji: '🦸',
      pv,
      maxPv: pv,
      damage: Math.max(1, Math.round(hero.damage * (hero.strikes ?? 1) * RAID.heroDmgShare)),
      origin: 'hero',
    });
  }
  return out;
}

/**
 * Les ASSAILLANTS, un par corps.
 *
 * ⚠️ LA MASSE EST DILUÉE COMME DANS `groupCombatant` : les PV suivent l'effectif, les
 * dégâts sa RACINE. Éclater un groupe en corps sans reprendre ce chemin ferait frapper
 * une armée nombreuse bien plus fort qu'elle ne le doit — c'est exactement ce que
 * `groupDmgExp` retient depuis la v0.661.
 *
 * ⚠️ `bulk` : la place qu'un corps prend au pied du mur. Un loup tient moins de place
 * qu'un mercenaire en armure. Sans lui, le goulot comptait des TÊTES et rendait les
 * hordes inoffensives (mesuré v0.755).
 *
 * ⚠️ MAIS `unitMult` SEUL NE SUFFIT PAS, et l'exposant se DÉRIVE. Les dégâts d'un groupe
 * suivent `√effectif` (`groupDmgExp`), donc le coup d'UN corps vaut
 * `unitMult × effectif^(g−1)` ; à masse conservée l'effectif vaut `1/unitMult`, d'où
 * `unitMult^(2−g)`. Une place proportionnelle à `unitMult` laissait donc les hordes
 * frapper le mur **23 % moins fort** : mesuré au niveau 26, les bêtes étaient repoussées
 * **97 %** du temps contre **80 %** pour les morts-vivants — 17 points d'écart, là où
 * l'iso-menace de la v0.661 en tolère 12. Avec l'exposant, les dégâts au mur ne dépendent
 * plus du tout de la silhouette : c'est une IDENTITÉ, pas un réglage ajusté après coup.
 */
export function siegeAttackers(raid: Raid): SiegeUnit[] {
  const out: SiegeUnit[] = [];
  for (const g of raid.groups) {
    const ref = refFighter(Math.max(1, g.level));
    const um = g.unitMult ?? 1;
    const mm = g.massMult ?? 1;
    const champPv = g.champion ? RAID.championPvMult : 1;
    const champDmg = g.champion ? RAID.championDmgMult : 1;
    const unitPv = (offensePerRound(ref) * RAID.foePvK * champPv * um) / mm;
    const eff = g.count / mm;
    const groupDmg =
      ref.pv * RAID.foeDmgK * champDmg * silhouetteDmgMult(um) * Math.pow(eff, RAID.groupDmgExp);
    const perBody = groupDmg / Math.max(1, g.count);
    for (let i = 0; i < g.count; i++) {
      out.push({
        id: `a${out.length}`,
        side: 'att',
        kind: groupKind(g),
        name: g.species,
        emoji: g.emoji,
        pv: Math.max(1, Math.round(unitPv)),
        maxPv: Math.max(1, Math.round(unitPv)),
        damage: Math.max(1, Math.round(perBody)),
        origin: 'attacker',
        bulk: Math.pow(um, 2 - RAID.groupDmgExp),
      });
    }
  }
  return out;
}

/** Un défenseur de la garnison, tel que l'appelant le connaît. */
export interface GuardUnit {
  id: string;
  name: string;
  emoji: string;
  pv: number;
  damage: number;
  ranged: boolean;
}

/**
 * LA GARNISON, en unités : les aventuriers PRÉSENTS, épaulés par les familiers postés.
 *
 * ⚠️ C'EST LA CHAÎNE FAMILIERS → GARNISON → DÉFENSES. Le bonus du chenil ne multiplie
 * plus la muraille (un loup ne rend pas la pierre plus solide) : il épaule des HOMMES,
 * comme celui du héros épaule le héros.
 *
 * ⚠️ SANS AUCUN AVENTURIER, IL RESTE LES BÊTES. C'était la condition pour basculer sans
 * régression : le chenil fonctionnait seul jusqu'ici, et s'il ne servait plus qu'à
 * multiplier une troupe absente, un joueur sans Guilde perdrait tout son bonus d'un
 * coup. Les familiers postés forment donc une MEUTE, calée sur le niveau du joueur —
 * comme toute structure de l'enceinte. Plus faible qu'une garnison d'hommes, jamais nulle.
 *
 * ⚠️ Un aventurier est un TIREUR quand l'agilité domine sa forme, un homme d'armes
 * sinon : la même lecture que sa fiche affiche déjà (`advShapeLabel`).
 */
/**
 * ⚠️ UNE UNITÉ DE SIÈGE N'A QUE DES PV ET DES DÉGÂTS — ni réduction, ni régénération.
 * Les canaux du chenil qui ne sont pas de la frappe doivent donc être REPLIÉS dessus,
 * sinon l'ours et la salamandre ne serviraient plus à rien : mesuré, la garnison
 * n'apportait plus que **+2 points** de tenue contre **+9 à +13** avant la bascule.
 *
 * ⚠️ La RÉDUCTION se replie en PV EFFECTIFS (`pv / (1 − r)`) — la conversion que le
 * projet emploie déjà pour calibrer la morsure des routes. Encaisser 20 % de moins,
 * c'est durer 25 % de plus : les deux se valent tant qu'on ne regarde que la durée.
 *
 * ⚠️ La RÉGÉNÉRATION, elle, n'a PAS d'équivalent : elle rendait des PV entre deux
 * GROUPES, or le nouveau moteur ne les affronte plus l'un après l'autre. Le canal de la
 * salamandre perd donc son sens au mur — c'est une conséquence assumée du changement de
 * moteur, pas un oubli, et elle garde tout son effet sur les convois.
 */
function foldBonus(pv: number, dmg: number, fx: AggregatedEffects) {
  // ⚠️ `AggregatedEffects` est en FRACTIONS de bout en bout, là où l’ancien
  // `GarrisonBonus` MÉLANGEAIT pourcentages et fractions — le piège d’unité qui a déjà
  // coûté un facteur CENT dans ce projet. Une seule convention, plus de conversion.
  const red = Math.min(0.5, fx.dmgReduction ?? 0);
  return {
    pv: Math.max(1, Math.round((pv * (1 + (fx.maxPvPct ?? 0))) / (1 - red))),
    damage: Math.max(1, Math.round(dmg * (1 + (fx.damagePct ?? 0)))),
  };
}

/** ⚔️ CE QU’UN AVENTURIER APPREND EN DÉFENDANT LA BASE.
 *
 *  ⚠️ Demandé par l’utilisateur, et c’était une vraie asymétrie : les familiers postés
 *  gagnaient de l’XP de dressage à chaque siège (v0.663), les aventuriers non — alors
 *  qu’ils tiennent la brèche depuis le branchement du moteur. Rester défendre coûtait
 *  donc un convoi ET la progression qui va avec : garder son monde à la maison était
 *  puni deux fois, ce qui est l’inverse de l’arbitrage qu’on veut proposer.
 *
 *  ⚠️ MÊME FORME QUE `missionXp`, volontairement : base liée au niveau de l’épreuve, et
 *  RENDEMENT DÉCROISSANT quand elle est loin sous celui de l’aventurier (`^1.5`) — sans
 *  quoi un vétéran engrangerait sur des armées qui ne lui apprennent rien.
 *
 *  ⚠️ ON GAGNE MÊME EN PERDANT, comme sur les convois : perdre coûte déjà le stock, les
 *  réparations et la production gelée — n’avoir rien appris en plus punirait deux fois,
 *  et le joueur qui subit ses premiers sièges est justement celui qui a besoin de
 *  progresser. La part REPOUSSÉE module le gain, elle ne le conditionne pas.
 *
 *  ⚠️ AUCUN RISQUE DE FARM : un siège arrive toutes les 24 à 72 h et ne se provoque pas.
 *  C’est ce qui autorise une base plus généreuse qu’un convoi. */
export function siegeXp(adv: Adventurer, report: RaidReport): number {
  const bodies = report.groups.reduce((n, g) => n + Math.max(0, g.count), 0);
  if (!bodies) return 0;
  // Le niveau de l’épreuve = celui de l’armée, PONDÉRÉ PAR LES EFFECTIFS : un champion
  // seul de haut niveau ne doit pas faire passer une horde de bleus pour une élite.
  const armyLevel =
    report.groups.reduce((n, g) => n + Math.max(0, g.count) * Math.max(1, g.level), 0) / bodies;
  const ratio = Math.min(1, armyLevel / Math.max(1, adv.level));
  const share = report.total > 0 ? Math.max(0, report.defeated) / report.total : 0;
  const base = RAID.xpBase + armyLevel * RAID.xpPerLevel;
  // Plancher à 1 : il s’est battu, il a appris quelque chose.
  return Math.max(1, Math.round(base * ratio ** 1.5 * (RAID.xpFloorShare + share)));
}

/** 🐾 QUI PORTE QUOI, une fois les exclusions et les plafonds du Chenil appliqués.
 *
 *  ⚠️ APPLIQUÉ AU CALCUL DU COMBAT, pas seulement à l’écriture : un appariement rangé
 *  avant que le Chenil ne redescende, ou pointant sur un familier vendu, se soigne tout
 *  seul — même politique que les POI périmés, et aucune migration.
 *
 *  ⚠️ TROIS EXCLUSIONS héritées de `companionsOf`, aucune décorative : ce que le HÉROS
 *  porte n’est pas disponible (il se bat ailleurs), un même familier apparié deux fois
 *  ne compte qu’une, et un id qui ne désigne plus rien est IGNORÉ plutôt que de faire
 *  tomber le combat.
 *
 *  ⚠️ L’ORDRE EST CELUI DU VIVIER, et c’est ce qui rend la coupe aux places STABLE : si
 *  le Chenil n’en héberge que trois, ce sont les trois premiers aventuriers qui gardent
 *  leur compagnon, pas un trio qui change à chaque rendu. */
export function companionPairs(
  advs: Adventurer[],
  ctx?: CompanionCtx,
): Map<string, { familiar?: Item; talent?: TalentInstance }> {
  const out = new Map<string, { familiar?: Item; talent?: TalentInstance }>();
  if (!ctx) return out;
  const fams = new Map(ctx.familiars.map((f) => [f.id, f]));
  const tals = new Map(ctx.talents.map((t) => [t.id, t]));
  const heroTal = new Set(ctx.heroTalentIds ?? []);
  const prisF = new Set<string>();
  const prisT = new Set<string>();
  let places = companionSlots(ctx.kennelLevel);
  for (const a of advs) {
    const entry: { familiar?: Item; talent?: TalentInstance } = {};
    const fid = a.familiarId;
    if (fid && fid !== ctx.heroFamiliarId && !prisF.has(fid) && places > 0) {
      const f = fams.get(fid);
      // Hors d’école : le Chenil ne sait pas l’héberger, il ne vient pas au rempart.
      if (f && canCompanion(f, ctx.kennelLevel)) {
        prisF.add(fid);
        places--;
        entry.familiar = f;
      }
    }
    const tid = a.talentId;
    if (tid && !heroTal.has(tid) && !prisT.has(tid)) {
      const t = tals.get(tid);
      if (t) {
        prisT.add(tid);
        entry.talent = t;
      }
    }
    if (entry.familiar || entry.talent) out.set(a.id, entry);
  }
  return out;
}

/** 🦅🦫 CE QUE LES COMPAGNONS APPORTENT À LA BASE, hors combat : le faucon voit venir,
 *  la marmotte fouille mieux les corps.
 *
 *  ⚠️ ILS NE S’EMPILENT PAS, et c’est la seule différence avec les canaux de combat :
 *  ceux-là sont PORTÉS par un homme (quinze loups = quinze combattants un peu meilleurs),
 *  ceux-ci valent pour la VILLE ENTIÈRE. Quinze faucons ne voient pas quinze fois plus
 *  loin — on garde le meilleur, un point c’est tout. */
export function companionPerks(
  advs: Adventurer[],
  ctx?: CompanionCtx,
): { scoutBonus: number; lootPct: number } {
  let scout = 0;
  let loot = 0;
  for (const p of companionPairs(advs, ctx).values()) {
    const f = p.familiar;
    if (!f) continue;
    const mult = famDefMult(cappedDefLevel(f, ctx?.kennelLevel ?? 0));
    if (f.effect.type === 'crit_pct') scout = Math.max(scout, 1);
    else if (f.effect.type === 'gold_pct') loot = Math.max(loot, f.effect.value * mult);
  }
  return { scoutBonus: scout, lootPct: loot };
}

/** Ce qu’il faut savoir pour appareiller les défenseurs : la réserve, ce que le HÉROS
 *  porte (il se bat ailleurs), et le Chenil qui plafonne le nombre et le rang. */
export interface CompanionCtx {
  familiars: Item[];
  talents: TalentInstance[];
  kennelLevel: number;
  /** ⚠️ REQUIS pour la FATIGUE : un compagnon sorti du siège précédent souffle, et son
   *  apport est réduit de moitié. Sans cette date rien ne la lirait — et le second
   *  levier de l’Infirmerie (`fatigueMsFor`) deviendrait décoratif. */
  now: number;
  heroFamiliarId?: string | null;
  heroTalentIds?: readonly string[];
}

/** ⚔️🐾 LES DÉFENSEURS DE LA BRÈCHE, chacun avec SON compagnon et SON talent.
 *
 *  ⚠️ REMPLACE LA GARNISON DE FAMILIERS (demandé par l’utilisateur : « on n’a plus les 6
 *  slots en défense pour les familiers, ils sont assignés aux aventuriers »). Le bonus
 *  était GLOBAL et s’appliquait identiquement à tout le monde ; il est désormais PORTÉ
 *  par un homme — ce qui était l’intention depuis la v0.758 (« le compagnon suit son
 *  homme partout », convoi comme rempart) et ce que le moteur en deux phases permet.
 *
 *  ⚠️ PLUS AUCUN PLAFOND DE CANAL n’est nécessaire, et c’est structurel : `GARRISON_CAP`
 *  existait parce que N familiers empilaient leurs bonus sur UN pool commun. Ici chaque
 *  familier n’épaule QUE son aventurier — quinze loups font quinze combattants un peu
 *  meilleurs, jamais un mur imprenable. Le modèle se borne lui-même.
 *
 *  ⚠️ SANS AVENTURIER, PERSONNE NE TIENT LA BRÈCHE. La « meute du chenil » disparaît
 *  avec la garnison : elle existait pour donner un porteur au bonus du bâtiment quand
 *  le vivier était vide. Un compagnon étant maintenant attaché à un homme, un joueur
 *  sans Guilde n’a ni l’un ni l’autre — il lui reste le mur et les tourelles. */
export function guardUnits(
  playerLevel: number,
  advs: Adventurer[],
  ctx?: CompanionCtx,
): GuardUnit[] {
  void playerLevel;
  const pairs = companionPairs(advs, ctx);
  return advs.map((a) => {
    // ⚠️ `escortCombatant` NU, et on replie ensuite : garder la réduction sur le
    // `Combatant` la perdrait au passage en unité (une unité n'a que PV et dégâts).
    const one = escortCombatant([a], a.name);
    const st = advStats(a);
    const p = pairs.get(a.id);
    const fx = mergeEffects(
      // ⚠️ Le Chenil PLAFONNE le dressage défensif : c’est lui qui entraîne, un
      // familier ne peut pas dépasser son école. Sans ce plafond, le bâtiment ne
      // servirait plus qu’à ouvrir des places et mourrait au niveau 25.
      companionEffects(
        p?.familiar ? [p.familiar] : [],
        'def',
        // ⚠️ FATIGUÉ = DIMINUÉ DE MOITIÉ, jamais perdu ni blessé — sinon personne
        // n’engagerait le familier qu’il a élevé pendant des semaines (règle v0.663).
        p?.familiar && ctx && isFatigued(p.familiar, ctx.now)
          ? COMPANION_K * DAMAGED_EFFICIENCY
          : undefined,
        ctx?.kennelLevel,
      ),
      advTalentEffects(p?.talent ? [p.talent] : []),
    );
    const f = foldBonus(one.pv, one.damage * (one.strikes ?? 1), fx);
    return {
      id: a.id,
      name: a.name,
      emoji: '⚔️',
      ranged: st.agilite > st.puissance && st.agilite > st.endurance,
      ...f,
    };
  });
}

/**
 * LE SIÈGE, résolu par le moteur en DEUX PHASES.
 *
 * ⚠️ Il prend désormais l'ÉTAT, plus un combattant déjà fondu : c'est tout l'objet de la
 * refonte. Un seul `Combatant` ne pouvait pas porter « les familiers épaulent la
 * garnison, la garnison tient l'ouvrage » — il n'y avait rien à épauler.
 *
 * ⚠️ ÉQUIVALENCE MESURÉE avant la bascule (150 sièges × 16 configurations) : à enceinte
 * pleine avec héros, la tenue passe de 93/84/76/66 % à 95/86/73/67 % aux niveaux
 * 12/28/60/90. La difficulté ET sa pente sont conservées.
 */
export function resolveRaid(
  input: {
    defenses: DefenseStructure[];
    playerLevel: number;
    hero: Combatant | null;
    guard?: GuardUnit[];
  },
  raid: Raid,
  now: number,
  heroHome: boolean,
): RaidReport {
  const wall = siegeWallOf(input.defenses, input.playerLevel);
  const att = siegeAttackers(raid);
  const def = siegeDefenders(input.defenses, input.playerLevel, input.hero, input.guard ?? []);
  const r = simulateSiege(att, def, wall, raid.seed);

  // ⚠️ « Groupes repoussés » se DÉDUIT des corps tombés, il ne se re-simule pas : le
  // moteur nomme chaque mort, on n'a qu'à les rattacher à leur groupe. L'écran parle
  // encore en groupes — c'est ainsi que le joueur lit une armée.
  const down = new Set(r.log.filter((e) => e.kind === 'down').map((e) => e.to));
  let idx = 0;
  let defeated = 0;
  for (const g of raid.groups) {
    let all = g.count > 0;
    for (let i = 0; i < g.count; i++) if (!down.has(att[idx + i]?.id)) all = false;
    if (all) defeated++;
    idx += g.count;
  }

  return {
    raidId: raid.id,
    faction: raid.faction,
    level: raid.level,
    groups: raid.groups,
    held: r.held,
    defeated,
    total: raid.groups.length,
    finalPv: r.wallPv,
    maxPv: wall.maxPv,
    heroHome,
    log: r.log,
    breached: r.breached,
    resolvedAt: now,
  };
}

/** Ce qu'une défaite coûte, PROPORTIONNEL à ce qui est passé. Rien d'irréversible : une
 *  structure est mise hors service, jamais rétrogradée — un niveau de bâtiment coûte des
 *  dizaines de milliers d'or, le perdre enclencherait une spirale dont on ne remonte pas
 *  (défense affaiblie → raid suivant plus dur → nouvelle perte). */
export function raidDamage(report: RaidReport): RaidDamage {
  if (report.held) return { stockStolen: false, damaged: [], freeze: false };
  const breach = (report.total - report.defeated) / Math.max(1, report.total);
  const damaged: DefenseId[] = ['wall'];
  // Seuils VOLONTAIREMENT hauts : mesuré, endommager tourelles et tour dès la moitié de
  // l'armée passée laissait la base à 1 % de tenue au siège suivant — donc un verrou, pas
  // une pénalité. Il faut désormais une déroute quasi totale pour perdre plus que le mur.
  if (breach >= 0.75) damaged.push('turret');
  if (report.defeated === 0) damaged.push('watchtower');
  return { stockStolen: true, damaged, freeze: true };
}

/** Coût de remise en service, en FERRAILLE (jamais en or : l'or est déjà tendu par les
 *  bâtiments de production — mesuré, un niveau de mine coûte ~100 k au niveau 25 — et
 *  une réparation ne doit pas entrer en concurrence avec eux). */
/** Coût en OR pour monter une structure d'un niveau.
 *  ⚠️ NE PAS réutiliser `buildingUpgradeCost` : cette courbe est calée sur les bâtiments
 *  de PRODUCTION, financés par toute l'économie. Appliquée à la défense, elle demandait
 *  **1,82 M d'or** pour monter mur + tourelles jusqu'au niveau 26 — hors d'atteinte, donc
 *  un système injouable. Ici la cible est ~10 récoltes de mine pour l'enceinte complète.
 *  Même forme (L^1.9) pour que la pente reste familière, coefficient divisé par 8. */
export function defenseUpgradeCost(level: number): number {
  return Math.round(RAID.upBase * Math.pow(Math.max(1, level), RAID.upExp));
}

/** Ferraille pour monter une structure d'un niveau. **C'est le SECOND verrou de
 *  l'enceinte**, à côté de l'or : l'or mesure le volume de jeu (donjons, expéditions), la
 *  ferraille mesure qu'on est allé la CHERCHER — épaves de la carte, recyclage du sac,
 *  Fonderie. Les deux doivent mordre ; l'un sans l'autre n'est pas un choix.
 *  ⚠️ La RÉPARATION, elle, reste bon marché et linéaire (`repairCost`) : remettre en
 *  état après un siège perdu ne doit jamais devenir une punition — un jour de Fonderie y
 *  suffit encore. Ce sont deux dépenses de natures différentes. */
export function defenseUpgradeScrap(level: number): number {
  return Math.round(RAID.scrapBase + Math.pow(Math.max(1, level), RAID.scrapExp));
}

export function repairCost(level: number): number {
  return 10 + Math.round(Math.max(1, level) * 2.5);
}

/** Remet une structure en service — et RELANCE LA PRODUCTION si plus rien n'est
 *  endommagé. Le gel n'est pas une punition à part : c'est la conséquence d'une base
 *  cassée. Réparer l'enceinte suffit donc à la lever, la ferraille étant le levier
 *  commun aux deux. Les deux voies GRATUITES restent ouvertes (une séance de sport, ou
 *  l'échéance des 24 h, cf. `advanceBase`) : la ferraille achète l'immédiateté, elle ne
 *  la rançonne pas. */
export function repairStructure(base: BaseState, id: DefenseId): BaseState {
  const defenses = base.defenses.map((d) =>
    d.typeId === id ? { typeId: d.typeId, level: d.level } : d,
  );
  return { ...base, defenses, freeze: defenses.some((d) => d.damaged) ? base.freeze : null };
}

/** Ferraille nécessaire pour tout remettre en état — c'est le chiffre à afficher au
 *  joueur quand sa production est gelée : il dit ce que coûte le retour à la normale. */
export function totalRepairCost(base: BaseState): number {
  return base.defenses.filter((d) => d.damaged).reduce((s, d) => s + repairCost(d.level), 0);
}

/** Durée courte, lisible : « 6 h », « 5 h 38 », « 42 min ». */
export function fmtSpan(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/** Ce qu’un niveau de PLUS change sur une structure de l’enceinte — « actuel → suivant ».
 *
 *  ⚠️ Les descriptions disaient ce que la structure FAIT, jamais ce qu’un niveau CHANGE :
 *  or c’est exactement la question qu’on se pose devant « Améliorer ». Les bâtiments de
 *  production avaient déjà leur `perLevelLabel` (v0.683) ; l’enceinte, non.
 *
 *  ⚠️ **DÉRIVÉ, jamais recopié.** Chaque libellé appelle la VRAIE fonction à `niveau` puis
 *  à `niveau + 1` et affiche l’écart. Une étiquette qui réécrirait la formule finirait par
 *  mentir — c’est précisément ce qui vient d’arriver à `scrapEconomy.test` (v0.720).
 *
 *  ⚠️ Le `switch` est EXHAUSTIF (garde `never`) : ajouter une structure muette casse la
 *  compilation au lieu de passer inaperçu. */
/** Prochain niveau ou `f` change VRAIMENT de valeur, ou `null` si plus jamais.
 *  ⚠️ Plusieurs effets avancent par PALIERS (`⌊niveau/2⌋`) : un niveau sur deux
 *  n'apporte rien. Annoncer « +0 » est honnete mais inutilisable — ce qu'on veut
 *  savoir, c'est jusqu'ou il faut monter pour que ca bouge. */
function nextStepLevel(f: (n: number) => number, from: number, lookahead = 12): number | null {
  const cur = f(from);
  for (let n = from + 1; n <= from + lookahead; n++) if (f(n) !== cur) return n;
  return null;
}

export function defensePerLevelLabel(
  id: DefenseId,
  level: number,
  ctx: {
    playerLevel: number;
    defenses: DefenseStructure[];
    /** ⚠️ REQUIS depuis que le préavis de la Tour est une PART de l’intervalle : sans
     *  lui, on annoncerait une durée qui ne correspond à aucun rythme. L’oublier ne
     *  compile plus — c’est la seule garantie qui tienne. */
    intervalMs: number;
  },
): string {
  const l = Math.max(0, level);
  const next = l + 1;
  const withLevel = (lv: number): DefenseStructure[] => [
    ...ctx.defenses.filter((d) => d.typeId !== id),
    { typeId: id, level: lv },
  ];
  switch (id) {
    case 'wall': {
      // On interroge le combattant RÉEL de la base : la muraille ne vaut qu’une FRACTION
      // de ce que le niveau du joueur justifie, une formule recopiée l’oublierait.
      // ⚠️ `defenseCombatant`, pas `baseCombatant` : l'aperçu doit annoncer ce que le
      // niveau change VRAIMENT, donc lire le même modèle que le panneau de forces et que
      // la bataille. Sur l'ancien, il aurait décrit un mur que plus personne ne simule.
      const a = defenseCombatant(withLevel(l), ctx.playerLevel, null).pv;
      const b = defenseCombatant(withLevel(next), ctx.playerLevel, null).pv;
      return b > a
        ? `Niveau ${next} : ${a} → ${b} PV de muraille (+${b - a})`
        : 'Déjà au niveau de ton personnage — c’est le sport qui débloque la suite.';
    }
    case 'turret': {
      const a = defenseCombatant(withLevel(l), ctx.playerLevel, null).damage;
      const b = defenseCombatant(withLevel(next), ctx.playerLevel, null).damage;
      return b > a
        ? `Niveau ${next} : ${a} → ${b} dégâts par tour, sur les ${TURRET_SLOTS} tourelles (+${b - a})`
        : 'Déjà au niveau de ton personnage — c’est le sport qui débloque la suite.';
    }
    case 'watchtower': {
      // ⚠️ CLAMPÉE comme `scoutClarity`. Sans cela le libellé promettait « 7/5 » crans de
      // renseignement à une tour de niveau 13 : une étiquette qui dépasse le plafond de la
      // fonction qu’elle décrit ment, et fait payer des niveaux pour rien.
      // ⚠️ On APPELLE `scoutClarity` (armée à ton niveau, sans aléa) au lieu de recopier
      // sa règle : la copie `⌊n/2⌋` a survécu à deux refontes de la formule et aurait
      // menti dès celle-ci. Une règle recopiée diverge toujours.
      const clarte = (n: number) => scoutClarity(n, ctx.playerLevel, ctx.playerLevel);
      const cl = clarte(l);
      const cn = clarte(next);
      // ⚠️ Plus de branche « déjà au maximum » : la Tour n’a plus de plafond, chaque
      // niveau raccourcit encore l’attente. Un chemin inatteignable finit par mentir.
      const lead = `préavis ${fmtSpan(scoutLeadMs(l, ctx.intervalMs))} → ${fmtSpan(
        scoutLeadMs(next, ctx.intervalMs),
      )}`;
      if (cn > cl)
        return `Niveau ${next} : ${lead}, et un cran de renseignement en plus (${cl} → ${cn}/${RAID.clarityMax})`;
      if (cl >= RAID.clarityMax)
        return `Niveau ${next} : ${lead}. Renseignement déjà au maximum (${cl}/${RAID.clarityMax}).`;
      const step = nextStepLevel(clarte, l);
      return step
        ? `Niveau ${next} : ${lead}. Le cran de renseignement suivant est au niveau ${step}.`
        : `Niveau ${next} : ${lead}`;
    }
    case 'salvage': {
      const a = scavengerCount(l);
      const b = scavengerCount(next);
      // ⚠️ DEUX leviers, et il faut les DEUX : le nombre de bras monte par crans de
      // quatre niveaux, la vitesse à chaque cran. Sans elle, trois niveaux sur quatre
      // ne changeraient rien — « aucun niveau mort du 0 au 100 » (v0.731).
      const vite = `aller-retour ${fmtSpan(scavengeMs(l))} → ${fmtSpan(scavengeMs(next))}`;
      return b > a
        ? `Niveau ${next} : ${a} → ${b} corps par vague (+${b - a}), ${vite}`
        : `Niveau ${next} : ${vite} (${a} corps par vague — le bras suivant au niveau ${
            nextStepLevel(scavengerCount, l) ?? next
          })`;
    }
    case 'kennel': {
      // ⚠️ TROIS leviers, et ils tenaient dans une phrase qui n’en annonçait qu’un.
      // Le Chenil est à ses familiers ce que la Guilde est aux aventuriers : il dit
      // COMBIEN on en poste et JUSQU’À QUEL RANG, plus le dressage qu’il sait donner.
      const pa = companionSlots(l);
      const pb = companionSlots(next);
      const ra = companionRankCap(l);
      const rb = companionRankCap(next);
      const bits = [`dressage de défense plafonné à ${next}`];
      if (pb > pa) bits.unshift(`${pa} → ${pb} familiers au mur`);
      if (rb > ra) bits.unshift(`rang max ${companionRankLabel(next)}`);
      return `Niveau ${next} : ${bits.join(', ')}`;
    }
    case 'infirmary': {
      const wa = woundMsFor(l, ctx.intervalMs);
      const wb = woundMsFor(next, ctx.intervalMs);
      const fa = fatigueMsFor(l);
      const fb = fatigueMsFor(next);
      const fam = `familiers fatigués ${fmtSpan(fa)} → ${fmtSpan(fb)}`;
      if (wb < wa)
        return `Niveau ${next} : convalescence du héros ${fmtSpan(wa)} → ${fmtSpan(wb)}, ${fam}`;
      // ⚠️ IL NE RESTE QU’UN SEUL MOTIF possible, et c’est un progrès : la structure
      // n’a PLUS de plancher (queue asymptotique, « aucun niveau mort »), donc la
      // convalescence raccourcit à CHAQUE niveau. Si elle ne bouge pas, c’est
      // forcément le RYTHME des sièges qui borde — et il ne faut surtout pas dire
      // « plancher » à sa place : ça enverrait le joueur réduire son entraînement
      // pour un gain imaginaire. La branche « déjà à son plancher » est retirée
      // plutôt que laissée morte : un chemin inatteignable finit par mentir.
      const tete = `La convalescence du héros (${fmtSpan(wa)}) est bornée par ton rythme de sièges (elle ne dépasse jamais ${Math.round(WOUND_INTERVAL_SHARE * 100)} % de l’intervalle) — la monter n’y changera rien.`;
      return `Niveau ${next} : ${fam}. ${tete}`;
    }
    default: {
      const jamais: never = id;
      return jamais;
    }
  }
}
// ── Champ de bataille ──

/** Les corps des groupes REPOUSSÉS. Une défaite en laisse moins, jamais zéro : on repart
 *  toujours avec quelque chose, ce qui garde l'échec agaçant sans être punitif. */
/** Anneau (en % de la demi-largeur du champ) où tombent les corps : au-delà des murs et
 *  de leurs tourelles, en deçà du bord du dessin. */
// ⚠️ En % de la DEMI-LARGEUR du champ : le dessin multiplie par 2 → 41 tombe à 82 du
// centre, soit juste au-delà des tourelles (rayon 72 + 7,5 de fût). Resserré avec
// l'enceinte (80 → 72) : laissé à 45-48,5, l'armée mourait dans un no man's land à dix
// unités du mur qu'elle assiégeait.
const CORPSE_RING = { min: 41, max: 44.5 } as const;

export function corpsesFrom(raid: Raid, report: RaidReport, seed: number): Corpse[] {
  const rng = mulberry32((seed ^ 0x5bf03635) >>> 0 || 1);
  const out: Corpse[] = [];
  for (let gi = 0; gi < report.defeated && gi < raid.groups.length; gi++) {
    const g = raid.groups[gi]!;
    for (let i = 0; i < g.count; i++) {
      const a = rng() * Math.PI * 2;
      // ⚠️ Anneau EXTÉRIEUR à l'enceinte. À 26-48 (avec un aplatissement vertical), la
      // moitié des corps se retrouvait dessinée DANS la cour — l'armée mourait chez
      // l'habitant. Le champ de bataille est dehors, par définition.
      const rad = CORPSE_RING.min + rng() * (CORPSE_RING.max - CORPSE_RING.min);
      out.push({
        id: `c_${seed}_${gi}_${i}`,
        emoji: g.emoji,
        name: g.species,
        level: g.level,
        ...(g.champion ? { champion: true } : {}),
        ...(g.massMult && g.massMult !== 1 ? { massMult: g.massMult } : {}),
        x: 50 + Math.cos(a) * rad,
        y: 50 + Math.sin(a) * rad,
      });
    }
  }
  return out;
}

export interface CorpseLoot {
  gold: number;
  /** 🔮 pierres d'invocation — ce que laissent les MORTS-VIVANTS. */
  summonStones: number;
  /** 🗝️ clés du Labyrinthe — ce que traînent les BÊTES venues des profondeurs. */
  keys: number;
  /** 🔩 ferraille — l'ACIER d'une armée en déroute (voir `lootCorpses`). */
  scrap: number;
  items: Omit<Item, 'id'>[];
}

/** Dépouille des corps. La richesse vient du NIVEAU DU CORPS (il était dangereux), pas
 *  du niveau du chantier — le danger paie, comme partout ailleurs dans le jeu.
 *  ⚠️ La rareté d'un objet reste centrée sur `min(niveau du corps, niveau du joueur)` :
 *  un raid à +15 donne PLUS d'objets, jamais des raretés hors de ta ligue. */
export function lootCorpses(
  corpses: Corpse[],
  faction: RaidFaction,
  playerLevel: number,
  seed: number,
  lootPct = 0,
): CorpseLoot {
  const rng = mulberry32((seed ^ 0x2545f491) >>> 0 || 1);
  const loot: CorpseLoot = { gold: 0, summonStones: 0, keys: 0, scrap: 0, items: [] };
  // ⚠️ ACCUMULATION EN FLOTTANT, arrondie UNE SEULE fois a la fin. Arrondir la part de
  // CHAQUE corps biaise vers le haut des que cette part passe sous l unite — ce qui
  // arrive precisement depuis la dilution de masse (0,6 pierre ou 1,7 ferraille par
  // corps). Mesure : +11 % de ferraille et +25 % de pierres, assez pour faire tomber
  // la regle « la ferraille est plus dure a obtenir que l or ».
  let gold = 0;
  let stones = 0;
  let scrap = 0;
  // ⚠️ DEVISES VIVANTES UNIQUEMENT. Les fossoyeurs payaient en fragments 🧩 et poussière
  // d'encre 🖋️ pour deux factions sur trois — or plus aucune fonction ne les dépense
  // depuis le retrait des infusions de grade. Deux tiers du butin de siège étaient donc
  // de la monnaie de singe, exactement le défaut corrigé sur la carte. Chaque faction
  // paie désormais dans quelque chose qui se consomme, et de façon THÉMATIQUE : les
  // bandits ont de l'or sur eux, les morts-vivants laissent de quoi rappeler un boss,
  // les bêtes des profondeurs traînent des clés du Labyrinthe d'où elles sortent.
  let keyOdds = 0;
  for (const c of corpses) {
    const L = Math.max(1, c.level);
    // ⚠️ Un corps est d'autant moins riche que l'armée a été gonflée : il y a ~2,5× plus
    // de cadavres, la valeur TOTALE du champ de bataille est donc inchangée. Sans cette
    // division, défendre deviendrait un farm 2,5× meilleur — et la ferraille des corps
    // ferait sauter la règle « l'épave reste la source de pointe », que son test verrouille.
    const mult = (c.champion ? 4 : 1) / (c.massMult ?? 1);
    if (faction === 'bandits') gold += (14 + L * 5.5) * mult;
    else if (faction === 'mortsvivants') stones += (0.35 + L * 0.045) * mult;
    else keyOdds += (0.05 + L * 0.004) * mult; // bêtes : la clé est RARE, on cumule les chances
    // Un peu d'or partout : même une bête traîne ce qu'elle a pris au village.
    if (faction !== 'bandits') gold += (5 + L * 1.8) * mult;
    // 🔩 L'ACIER D'UNE ARMÉE (v0.702). ⚠️ Ceci PRÉCISE, sans la renier, la règle « les
    // cadavres ne donnent jamais de ferraille » : son motif était qu'on n'en trouve pas
    // sur un LOUP. Une troupe humaine ou un mort-vivant en armes, si — lames, plaques,
    // pièces de siège. Les BÊTES n'en laissent donc toujours aucune.
    //
    // Sans cette source, le passage à « une séance = un siège » (v0.702) était
    // INTENABLE, et c'est mesuré : ~93 % de la ferraille vient d'endroits bornés par
    // l'HORLOGE (les épaves, une expédition à la fois ; la Fonderie, à l'heure) et non
    // par l'entraînement. À 21 séances par semaine, les réparations dépassaient les
    // rentrées et le bilan devenait NÉGATIF dès le niveau 40 : on ne pouvait plus
    // réparer, donc plus rien monter. Le siège devient le maillon qui fait suivre le
    // métal au rythme du sport. ⚠️ Calibré pour rester SOUS l'épave par événement :
    // elle demeure la source de pointe, celle qui coûte un geste.
    if (faction !== 'betes') scrap += (RAID.corpseScrapBase + L * RAID.corpseScrapPerLevel) * mult;

    const drop = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: L,
      luck: c.champion ? 0.45 : 0.1,
      playerLevel,
    });
    // ⚠️ LES BANDITS LÂCHENT DE L'ÉQUIPEMENT, les bêtes presque pas — parce que c'est ce
    // qu'on trouve sur eux. Un homme en armes porte une arme et une armure ; un loup ne
    // porte rien, et un revenant ce qu'il reste de son linceul. La faction ne décide donc
    // pas seulement de la DEVISE, mais aussi de ce qu'on ramasse.
    const chance = faction === 'bandits' ? RAID.gearDropBandits : RAID.gearDropOther;
    // Même dilution sur les OBJETS : ~2,5× plus de tirages, chacun ~2,5× moins probable.
    if (drop && (c.champion || rng() < chance / (c.massMult ?? 1))) loot.items.push(drop);
  }
  // Bonus de fouille de la garnison (marmotte) : il porte sur les RESSOURCES, jamais
  // sur la rareté des objets — l'anti-runaway ne se contourne pas par le chenil.
  const k = 1 + Math.max(0, lootPct) / 100;
  loot.gold = Math.round(gold * k);
  loot.summonStones = Math.round(stones * k);
  loot.scrap = Math.round(scrap);
  // Les clés se tirent sur le CUMUL des chances : une vague de bêtes en rend une de
  // temps en temps, jamais une par corps.
  loot.keys = Math.floor(keyOdds * k) + (rng() < (keyOdds * k) % 1 ? 1 : 0);
  return loot;
}

// ── Cycle de vie (le tick) ──

export function emptyBase(seed: number, now: number): BaseState {
  return {
    defenses: [],
    garrison: [],
    wound: null,
    raid: null,
    nextRaidAt: now + RAID.intervalIdleMs,
    field: null,
    freeze: null,
    lastReport: null,
    seed: seed >>> 0 || 1,
  };
}

/** Les sièges sont OPT-IN et réservés à un joueur qui joue : il faut une MURAILLE et une
 *  activité sportive récente. Un joueur revenu après trois semaines ne trouve donc pas
 *  une armée sur le pas de sa porte. */
/** Part de l’enceinte réellement PRÊTE : le MINIMUM des parts du mur et des tourelles,
 *  rapportées au niveau du joueur. Le minimum, et non la moyenne, parce que les deux ont
 *  des métiers distincts et non substituables — le mur encaisse, les tourelles tuent : une
 *  muraille parfaite sans tourelle tient 0 % (mesuré, à TOUS les niveaux). Bornée à 1 :
 *  sur-monter au-delà de son niveau ne compte pas, comme dans `baseCombatant`. */
export function defenseReadiness(defenses: DefenseStructure[], playerLevel: number): number {
  const L = Math.max(1, playerLevel);
  const part = (id: DefenseId) => Math.min(1, ownedLevel(defenses, id) / L);
  return Math.min(part('wall'), part('turret'));
}

/** Les sièges sont-ils actifs ? OPT-IN à deux conditions : une enceinte réellement
 *  PRÊTE (`RAID.enableShare`) et un joueur qui s’entraîne.
 *
 *  ⚠️ Le déclencheur regardait `wall > 0` — n’importe quelle muraille, fût-elle de
 *  niveau 1 chez un joueur de niveau 12. Or à cette part-là on tient 0 % : construire
 *  sa première muraille ALLUMAIT les sièges et les faisait perdre tous. Ce n’est pas un
 *  défaut de bas niveau mais du modèle en fraction (effet quadratique) : à moitié montée,
 *  une enceinte ne tient rien à AUCUN niveau. Le sens visé est « ta ville devient une
 *  cible quand elle vaut la peine d’être attaquée », pas « dès que tu poses une pierre ».
 *
 *  Conséquence assumée : monter de niveau sans suivre côté enceinte SUSPEND les sièges,
 *  et ils reprennent tout seuls une fois rattrapé. C’est cohérent avec la règle 1 (on ne
 *  punit jamais) — et sans exploit, un siège étant un ROBINET (butin, cadavres, ferraille) :
 *  s’en priver coûte du contenu, ça n’achète pas de la sécurité. */
export function raidsEnabled(base: BaseState, activeDays7: number, playerLevel: number): boolean {
  return defenseReadiness(base.defenses, playerLevel) >= RAID.enableShare && activeDays7 >= 1;
}

export interface BaseTickResult {
  base: BaseState;
  changed: boolean;
  detected: Raid | null; // un raid vient d'apparaître (→ notification)
  dueRaid: Raid | null; // à résoudre MAINTENANT par l'appelant (il connaît le héros)
}

/** Avance l'état de la base jusqu'à `now` : planification, détection, péremption du champ
 *  de bataille et du gel. NE RÉSOUT PAS le siège — l'appelant seul sait si le héros est
 *  là et ce que vaut la garnison ; il le signale via `dueRaid`. */
export function advanceBase(
  base: BaseState,
  ctx: { playerLevel: number; activeDays7: number; globalXp: number },
  now: number,
): BaseTickResult {
  let b: BaseState = { ...base };
  let changed = false;
  let detected: Raid | null = null;

  // Dégel : une séance de sport (XP en hausse) ou l'échéance des 24 h.
  if (b.freeze && (now >= b.freeze.until || ctx.globalXp > b.freeze.atXp)) {
    b = { ...b, freeze: null };
    changed = true;
  }

  // Le héros finit de se remettre.
  if (b.wound && now >= b.wound.until) {
    b = { ...b, wound: null };
    changed = true;
  }

  // Le champ de bataille pourrit.
  if (b.field && now >= b.field.expiresAt) {
    // ⚠️ Le CUMUL de la fouille part avec lui : un relevé sans champ est un orphelin,
    // et il se retrouverait dans le rapport du siège SUIVANT. En pratique la fouille
    // rattrape tout bien avant (mesuré : moins de 3 h pour vider un champ, contre 24 h
    // de péremption) — ce cas ne reste ouvert que sans Chantier, où rien n’a été relevé.
    b = { ...b, field: null, pillage: null };
    changed = true;
  }

  if (!raidsEnabled(b, ctx.activeDays7, ctx.playerLevel)) {
    // Enceinte pas prête (ou joueur inactif) : on repousse l'échéance pour ne JAMAIS
    // accumuler un arriéré pendant l'absence.
    if (b.nextRaidAt < now) {
      b = { ...b, nextRaidAt: now + RAID.intervalIdleMs };
      changed = true;
    }
    return { base: b, changed, detected: null, dueRaid: null };
  }

  // PREMIÈRE alerte : `emptyBase` pose une échéance à 72 h (le délai d'un joueur
  // inactif) parce qu'il ne connaît pas encore l'activité sportive. Une fois la muraille
  // debout, on la RAPPROCHE à l'intervalle qui correspond vraiment au joueur — sinon un
  // joueur assidu venait de bâtir son enceinte et lisait « prochaine alerte dans 70 h »,
  // ce qui n'a aucun sens. On ne repousse jamais, on ne fait que rapprocher.
  const due = now + raidIntervalMs(ctx.activeDays7);
  if (!b.raid && b.nextRaidAt > due) {
    b = { ...b, nextRaidAt: due };
    changed = true;
  }

  // Détection : le raid se matérialise quand la Tour le voit venir.
  const lead = scoutLeadMs(scoutLevel(b.defenses), raidIntervalMs(ctx.activeDays7));
  if (!b.raid && now >= b.nextRaidAt - lead) {
    const seed = (b.seed + Math.floor(b.nextRaidAt / 60_000)) >>> 0 || 1;
    const raid = rollRaid(seed, ctx.playerLevel, b.nextRaidAt, lead);
    b = { ...b, raid };
    detected = raid;
    changed = true;
  }

  const dueRaid = b.raid && now >= b.raid.arrivesAt ? b.raid : null;
  return { base: b, changed, detected, dueRaid };
}

/** Applique l'issue d'un siège : range le rapport, sème le champ de cadavres, planifie le
 *  suivant et pose les dégâts. Le VOL DU STOCK revient à l'appelant (lui seul touche aux
 *  bâtiments de production) — on se contente de le signaler dans `damage`. */
export function applyRaidOutcome(
  base: BaseState,
  raid: Raid,
  report: RaidReport,
  ctx: { activeDays7: number; globalXp: number },
  now: number,
): { base: BaseState; damage: RaidDamage } {
  const dmg = raidDamage(report);
  const rng = mulberry32((base.seed ^ raid.seed) >>> 0 || 1);
  const corpses = corpsesFrom(raid, report, raid.seed);
  const defenses = base.defenses.map((d) =>
    dmg.damaged.includes(d.typeId) ? { ...d, damaged: true } : d,
  );
  return {
    base: {
      ...base,
      defenses,
      raid: null,
      lastReport: report,
      // Le héros présent ne sort meurtri que d'une DÉFAITE : sa présence reste un pari
      // gagnant (il fait fortement monter les chances de tenir, et ne paie que si ça rate).
      wound:
        !report.held && report.heroHome
          ? {
              until:
                now +
                woundMsFor(
                  defenseLevel(base.defenses, 'infirmary'),
                  raidIntervalMs(ctx.activeDays7),
                ),
            }
          : (base.wound ?? null),
      nextRaidAt: now + raidIntervalMs(ctx.activeDays7, rng),
      field: corpses.length ? { corpses, expiresAt: now + SCAV.fieldMs } : null,
      freeze: dmg.freeze ? { until: now + RAID.freezeMs, atXp: ctx.globalXp } : null,
    },
    damage: dmg,
  };
}

/** Cibles d'une vague de fouille : les corps les plus riches d'abord. Le choix optimal
 *  étant toujours le même, en faire une décision serait un faux choix. */
export function pickScavengeTargets(field: BattleField, capacity: number): Corpse[] {
  return field.corpses
    .filter((c) => !c.looted)
    .sort((a, b) => (b.champion ? 1 : 0) - (a.champion ? 1 : 0) || b.level - a.level)
    .slice(0, Math.max(0, capacity));
}

/** Ce qu’un tick de fouille a produit. */
export interface ScavengeTick {
  field: BattleField;
  /** Corps dépouillés pendant ce tick, toutes vagues confondues. */
  taken: Corpse[];
  /** Allers-retours achevés — de quoi dire « 3 vagues » dans le rapport. */
  waves: number;
  /** Plus rien à ramasser : le chantier a fini, le rapport peut partir. */
  done: boolean;
}

/** ⛏️ LE CHANTIER TRAVAILLE SEUL — les vagues partent et reviennent sans qu’on clique.
 *
 *  ⚠️ Demandé par l’utilisateur : « que les allées venues soient automatiques et assez
 *  rapides vu que c’est quand même juste devant la base ». Et c’est juste sur le fond :
 *  envoyer une vague n’était pas une DÉCISION — on envoie toujours, il n’y a rien à
 *  arbitrer — c’était un clic de péage. Ce qui reste un choix, c’est de monter le
 *  Chantier pour ramasser plus vite ; le reste est de la logistique.
 *
 *  ⚠️ RATTRAPE TOUT LE TEMPS ÉCOULÉ. L’app peut rester fermée une nuit : sans la boucle
 *  on ne récolterait qu’UNE vague au retour et le champ pourrirait avec le reste dedans.
 *  Les vagues s’enchaînent DOS À DOS (l’horloge suit le chantier, pas `now`), sinon une
 *  absence de six heures ne vaudrait qu’un seul aller-retour.
 *
 *  ⚠️ PURE, et elle ne connaît ni butin ni joueur : elle dit seulement QUELS CORPS ont
 *  été dépouillés. `lootCorpses` reste la seule autorité sur leur valeur — deux chemins
 *  vers le butin finiraient par diverger. */
export function advanceScavenging(
  field: BattleField,
  capacity: number,
  now: number,
  /** Durée d’un aller-retour — `scavengeMs(niveau du Chantier)` en jeu. */
  waveMs: number = SCAV.dispatchMs,
): ScavengeTick | null {
  if (capacity <= 0) return null;
  let f: BattleField = { ...field, corpses: field.corpses.map((x) => ({ ...x })) };
  const taken: Corpse[] = [];
  let waves = 0;

  /** Réserve les prochains corps à l’instant où le chantier se libère. */
  const partir = (a: number): boolean => {
    const cibles = pickScavengeTargets(f, capacity);
    if (!cibles.length) return false;
    f = { ...f, dispatchUntil: a + waveMs, dispatchIds: cibles.map((x) => x.id) };
    return true;
  };

  const enRoute = !!f.dispatchUntil;
  // Rien en route : on lance tout de suite — le chantier ne chôme pas.
  if (!enRoute) partir(now);

  // Puis on vide toutes les vagues qui ont eu le temps de rentrer, en relançant à la
  // seconde où chacune revient. La boucle est bornée par les corps : chaque tour en
  // consomme `capacity`.
  while (f.dispatchUntil && now >= f.dispatchUntil) {
    const retour = f.dispatchUntil;
    const ids = new Set(f.dispatchIds ?? []);
    for (const x of f.corpses) if (ids.has(x.id) && !x.looted) taken.push(x);
    f = {
      ...f,
      corpses: f.corpses.map((x) => (ids.has(x.id) ? { ...x, looted: true } : x)),
      dispatchUntil: undefined,
      dispatchIds: undefined,
    };
    waves++;
    if (!partir(retour)) break;
  }

  const done = !f.corpses.some((x) => !x.looted);
  return { field: f, taken, waves, done };
}

export function remainingCorpses(field: BattleField | null): number {
  return field ? field.corpses.filter((c) => !c.looted).length : 0;
}

/** DOUBLONS de familiers : ceux qu’AUCUNE configuration ne pourra jamais employer.
 *
 *  ⚠️ Un familier n’est pas un objet : il sert sur DEUX fronts qui ne se classent pas de
 *  la même façon — l’attaque (un seul équipé, dressage ⚔️) et le mur (jusqu’à
 *  `companionSlots` postés, dressage 🛡️). Un compagnon médiocre au combat peut être un
 *  excellent défenseur, et l’inverse. On ne cède donc que ceux qui sont DOMINÉS SUR LES
 *  TROIS AXES à la fois : attaque, mur, et signature ✦ (un effet conditionnel ne se
 *  remplace par rien).
 *
 *  ⚠️ Et on raisonne PAR EFFET PORTÉ, jamais sur la puissance brute. C’est l’effet qui
 *  décide du rôle au mur (`GARRISON_ROLE`) : le faucon qui renseigne et la marmotte qui
 *  fouille ne se remplacent pas, même si un loup les écrase en dégâts. Vendre tous ses
 *  faucons parce qu’ils tapent peu, ce serait perdre l’espionnage — exactement le regret
 *  qu’un bouton « tout vendre » doit rendre impossible.
 *
 *  Gardés par effet = `companionSlots(niveau) + 1` : la garnison pleine d’un seul rôle,
 *  plus celui qu’on porte. Au-delà, la copie est inemployable par construction.
 *  Le dressage défensif est lu NON PLAFONNÉ par le chenil (comme `autoGarrison`) : le
 *  chenil se monte, on ne brade pas un bon défenseur parce que son école est en retard. */
export function duplicateFamiliars(
  familiars: Item[],
  playerLevel: number,
  opts: { equippedId?: string | null; postedIds?: string[] } = {},
): Item[] {
  // ⚠️ SUR LE NIVEAU JOUEUR, PAS SUR LE CHENIL, et c’est délibéré. Ce seuil garde une
  // action DESTRUCTRICE : l’indexer sur le Chenil ferait fondre, le jour où il est en
  // retard, des familiers qu’on pourra poster dès qu’il montera. Il est volontairement
  // généreux — il l’est même plus que nécessaire depuis `dedupeGarrisonRoles` (mesuré
  // v0.756 : le jeu ne peut employer que DEUX exemplaires d’un même effet), et
  // l’utilisateur a choisi de le laisser ainsi. Il ne passe donc plus par
  // `companionSlots`, qui parle désormais du CHENIL : emprunter une fonction dont le
  // sens a changé, c’est la recette d’un écart silencieux.
  const keep = 2 + Math.floor(Math.max(1, playerLevel) / 5);
  const posted = new Set(opts.postedIds ?? []);
  const groups = new Map<string, Item[]>();
  for (const f of familiars) {
    const g = groups.get(f.effect.type);
    if (g) g.push(f);
    else groups.set(f.effect.type, [f]);
  }
  // Trois lectures de la même réserve. Un familier survit dès qu’il est dans le haut du
  // panier d’UNE d’elles — l’union protège, elle ne sélectionne pas.
  const axes: ((f: Item) => number)[] = [
    (f) => f.effect.value * famAtkMult(famLevel(f.atkXp, 'atk')),
    (f) => f.effect.value * famDefMult(famLevel(f.defXp, 'def')),
    (f) => f.effect2?.value ?? 0,
  ];
  const safe = new Set<string>();
  for (const group of groups.values()) {
    for (const score of axes) {
      [...group]
        .sort((a, b) => score(b) - score(a))
        .slice(0, keep)
        .forEach((f) => safe.add(f.id));
    }
  }
  return familiars.filter(
    (f) => !safe.has(f.id) && !f.locked && !posted.has(f.id) && f.id !== opts.equippedId,
  );
}
