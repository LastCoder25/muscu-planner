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
import {
  combatPower,
  mulberry32,
  simulateDungeon,
  type Combatant,
  type DungeonFight,
} from './combat';
import { refFighter } from './proceduralContent';
import { rollDrop, famLevel, famAtkMult, famDefMult, type Item } from './items';
import type { UnitKind } from './siegeBattle';

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

export interface BaseState {
  defenses: DefenseStructure[];
  /** Ids des familiers POSTÉS au chenil (max `garrisonSlots(niveau)`). Ils restent dans le sac :
   *  poster n'est pas ranger, c'est affecter. */
  garrison?: string[];
  wound?: HeroWound | null;
  raid: Raid | null;
  nextRaidAt: number;
  field: BattleField | null;
  freeze: ProductionFreeze | null;
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
  finalPv: number;
  maxPv: number;
  heroHome: boolean;
  fights: DungeonFight[];
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
  wallArmorK: 0.05,

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
  turretDmgK: 0.105,
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
  scoutLeadBaseMs: 3600_000, // 1 h de préavis sans Tour de guet…
  scoutLeadPerLevelMs: 20 * 60_000, // …+20 min par niveau
  scoutLeadCapMs: 8 * 3600_000,
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
  dispatchMs: 40 * 60_000, // durée d'une vague de fouille
} as const;

/** Fossoyeurs envoyés PAR VAGUE — le seul effet du niveau du chantier. Il répond à une
 *  question unique et lisible : « combien j'en ramasse d'un coup ». */
export function scavengerCount(level: number): number {
  // ⚠️ La capacite suit la MASSE (`RAID.massMult`) : il y a ~2,5x plus de corps, chacun
  // ~2,5x moins riche, donc il faut pouvoir en ramasser ~2,5x plus dun coup. Sans cela, la
  // meme valeur de champ de bataille aurait demande 7 allers-retours au lieu de 3 : la
  // foule serait devenue une corvee, alors quelle ne doit rien changer a leffort.
  return level <= 0 ? 0 : Math.round((1 + Math.floor(level / 2)) * RAID.massMult);
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
    { emoji: '🧙', name: 'Nécromant', kind: 'ranged' },
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

/** Préavis offert par la Tour de guet. C'est lui qui rend la préparation possible — et
 *  c'est à la DÉTECTION que part la notification, pas à l'impact : monter la Tour achète
 *  donc littéralement du temps de réaction. */
export function scoutLeadMs(watchtowerLevel: number): number {
  return Math.min(
    RAID.scoutLeadCapMs,
    RAID.scoutLeadBaseMs + Math.max(0, watchtowerLevel) * RAID.scoutLeadPerLevelMs,
  );
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

export function groupCombatant(g: RaidGroup): Combatant {
  const ref = refFighter(Math.max(1, g.level));
  const um = g.unitMult ?? 1; // silhouette de la faction (horde fragile ↔ bande aguerrie)
  const champPv = g.champion ? RAID.championPvMult : 1;
  const champDmg = g.champion ? RAID.championDmgMult : 1;
  const unitPv = offensePerRound(ref) * RAID.foePvK * champPv * um;
  const unitDmg = ref.pv * RAID.foeDmgK * champDmg * um;
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

function raidFoes(raid: Raid): { combatant: Combatant; gold: number }[] {
  return raid.groups.map((g) => ({ combatant: groupCombatant(g), gold: 0 }));
}

/** Ce que la garnison apporte au mur. Les quatre premiers champs alimentent le
 *  `Combatant` de la base ; les deux derniers sortent du combat (renseignement, fouille)
 *  — c'est ce qui donne un rôle non-combattant à des espèces qui n'en auraient pas. */
export interface GarrisonBonus {
  damagePct?: number;
  maxPvPct?: number;
  dmgReduction?: number; // 0..1
  regen?: number; // 0..1
  scoutBonus?: number; // + clarté d'espionnage (le faucon voit loin)
  lootPct?: number; // + butin sur les cadavres (la marmotte fouille bien)
}

/** ESPÈCE → RÔLE au mur. On lit l'effet que le familier porte DÉJÀ (le loup fait des
 *  dégâts, l'ours réduit, etc.) plutôt que d'inventer une seconde table : poster un ours
 *  ou un loup ne donne donc pas la même bataille, sans un seul concept en plus. */
export type GarrisonRole = 'damage' | 'pv' | 'armor' | 'regen' | 'scout' | 'loot';
export const GARRISON_ROLE: Record<string, GarrisonRole> = {
  damage_pct: 'damage',
  max_pv_pct: 'pv',
  dmg_reduction_pct: 'armor',
  lifesteal_pct: 'regen', // le sang qu'il rend à la ville entre deux assauts
  crit_pct: 'scout', // le faucon : il voit venir
  gold_pct: 'loot', // la marmotte : elle fouille mieux les corps
};
export const ROLE_LABEL: Record<GarrisonRole, string> = {
  damage: 'Dégâts du mur',
  pv: 'Solidité de la ville',
  armor: 'Encaisse mieux',
  regen: 'Souffle entre deux assauts',
  scout: 'Renseignement',
  loot: 'Fouille des corps',
};

/** Emplacements de garnison : **un de plus tous les 5 niveaux, à partir de 1**. Le chenil
 *  grandit donc avec le joueur au lieu de rester figé à 3 — et comme les familiers ne
 *  viennent que du Labyrinthe, la réserve suit le même rythme que les places.
 *  ⚠️ Le nombre de places multiplie l'apport de la garnison : les canaux de COMBAT sont
 *  donc plafonnés (`GARRISON_CAP`), faute de quoi une garnison de dix rendrait la base
 *  imprenable. Seuls le renseignement et la fouille, qui ne sont pas des stats de combat,
 *  s'additionnent librement. */
export function garrisonSlots(playerLevel: number): number {
  return 1 + Math.floor(Math.max(1, playerLevel) / 5);
}
/** ⚠️ IL N'Y A PLUS DE REPLI, ET C'EST VOULU. `garrisonBonus` et `autoGarrison`
 *  prenaient `slots = GARRISON_SLOTS` (3) par défaut : le STORE omettait l'argument —
 *  donc le combat ne comptait que 3 familiers — pendant que l'ÉCRAN passait
 *  `garrisonSlots(niveau)` et annonçait le bonus de tous. Au niveau 28 : 6 postés
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

/** Part de son effet qu'un familier apporte au MUR.
 *  ⚠️ Pas 100 % : mesuré sur une garnison réelle de trois légendaires (loup +23,4 %,
 *  salamandre 14,7 %, ours 9,4 %), la valeur pleine faisait passer la tenue de 72 % à
 *  **90 %** dès le dressage 0, et à **100 %** au dressage maximal — le chenil devenait un
 *  bouton « gagner » et annulait tout le travail sur la fenêtre de niveau. La garnison
 *  doit être un levier, pas un verrou. */
const GARRISON_K = 0.4;

/** Plafonds par canal. La RÉGÉNÉRATION est plafonnée le plus bas parce qu'elle est la
 *  seule à COMPOSER : elle s'applique entre chaque groupe, donc quatre ou cinq fois par
 *  siège — 15 % de soin par groupe rend une base quasi increvable. */
export const GARRISON_CAP = {
  damagePct: 30,
  maxPvPct: 25,
  dmgReduction: 0.15,
  regen: 0.06,
} as const;

/** Le repos qu'il reste à un familier sorti d'un siège. L'Infirmerie l'abrège. */
export function fatigueMsFor(infirmaryLevel: number): number {
  return Math.round(FATIGUE_MS * Math.max(0.25, 1 - Math.max(0, infirmaryLevel) * 0.05));
}
export function isFatigued(fam: { fatigueUntil?: number }, now: number): boolean {
  return !!fam.fatigueUntil && now < fam.fatigueUntil;
}

/** Niveau de dressage DÉFENSIF effectif d'un familier posté. ⚠️ **Plafonné par le
 *  CHENIL** : c'est le bâtiment qui entraîne, un familier ne peut pas dépasser l'école
 *  qui le forme. Sans ce plafond, le chenil de niveau 1 vaudrait le chenil de niveau 20
 *  dès que les familiers auraient tourné quelques sièges — le bâtiment n'aurait servi
 *  qu'à ouvrir des places. */
export function garrisonLevel(fam: Item, kennelLevel: number): number {
  return Math.min(famLevel(fam.defXp, 'def'), Math.max(0, kennelLevel));
}

/** Valeur RÉELLE qu'un familier apporte au mur : son effet × son dressage DÉFENSIF.
 *  Une seule lecture, partagée par le tri automatique et le dédoublonnage — sans quoi
 *  « le meilleur » ne voudrait pas dire la même chose aux deux endroits. */
function defWeight(f: Item): number {
  return f.effect.value * famDefMult(famLevel(f.defXp));
}

/** ⚠️ UN SEUL FAMILIER PAR RÔLE AU MUR — on garde le meilleur de chaque, on écarte les
 *  copies. Deux loups, ce n'est pas deux fois la même bataille : leurs bonus tombent dans
 *  le MÊME canal (`GARRISON_ROLE`), déjà plafonné (`GARRISON_CAP`), donc le second
 *  n'apportait qu'un reliquat tout en occupant une place qu'un autre rôle aurait remplie.
 *  Une garnison est un ensemble de rôles COMPLÉMENTAIRES : dégâts, solidité, encaisse,
 *  souffle, renseignement, fouille.
 *
 *  ⚠️ Le tri se fait sur la VALEUR, pas sur l'ordre reçu : l'appelant passe souvent les
 *  familiers dans l'ordre du SAC (`garrisonedFamiliars` filtre l'inventaire) — garder
 *  « le premier » y désignerait un familier au hasard.
 *
 *  Appliqué au CALCUL DU COMBAT autant qu'à l'écriture : une garnison rangée par une
 *  version antérieure se soigne donc toute seule, sans migration — même politique que les
 *  POI périmés d'`advanceWorld`. */
export function dedupeGarrisonRoles(familiars: Item[]): Item[] {
  const best = new Map<GarrisonRole, Item>();
  for (const f of familiars) {
    const role = GARRISON_ROLE[f.effect.type];
    if (!role) continue;
    const cur = best.get(role);
    if (!cur || defWeight(f) > defWeight(cur)) best.set(role, f);
  }
  return [...best.values()].sort((a, b) => defWeight(b) - defWeight(a));
}

/** Bonus de la garnison. Chaque familier apporte SON effet, amplifié par son dressage
 *  DÉFENSIF (jamais offensif : les deux carrières sont contextuelles), et réduit de
 *  moitié s'il est encore fatigué. */
export function garrisonBonus(
  familiars: Item[],
  now: number,
  kennelLevel: number,
  slots: number,
): GarrisonBonus {
  const out: GarrisonBonus = {};
  if (kennelLevel <= 0) return out;
  // ⚠️ DÉDOUBLONNÉ AVANT la coupe : la place qu'une copie écartée libère revient à un
  // autre rôle, elle ne se perd pas.
  for (const f of dedupeGarrisonRoles(familiars).slice(0, Math.max(1, slots))) {
    const role = GARRISON_ROLE[f.effect.type]!;
    const mult =
      GARRISON_K *
      famDefMult(garrisonLevel(f, kennelLevel)) *
      (isFatigued(f, now) ? DAMAGED_EFFICIENCY : 1);
    const v = f.effect.value * mult;
    if (role === 'damage') out.damagePct = (out.damagePct ?? 0) + v;
    else if (role === 'pv') out.maxPvPct = (out.maxPvPct ?? 0) + v;
    else if (role === 'armor') out.dmgReduction = (out.dmgReduction ?? 0) + v / 100;
    else if (role === 'regen') out.regen = (out.regen ?? 0) + v / 100;
    // Le renseignement et la fouille ne sont PAS des stats de combat : ni bridés par
    // GARRISON_K, ni plafonnés — un faucon voit loin, un point c'est tout.
    else if (role === 'scout') out.scoutBonus = (out.scoutBonus ?? 0) + 1;
    else
      out.lootPct = (out.lootPct ?? 0) + f.effect.value * famDefMult(garrisonLevel(f, kennelLevel));
  }
  // ⚠️ TOUS les canaux de combat sont plafonnés, pas seulement deux. Avec des places qui
  // se multiplient par 4 sur la courbe, laisser dégâts et PV s'additionner librement
  // ferait de la garnison le vrai mur — et le chenil, un bouton « gagner ».
  if (out.damagePct) out.damagePct = Math.min(GARRISON_CAP.damagePct, out.damagePct);
  if (out.maxPvPct) out.maxPvPct = Math.min(GARRISON_CAP.maxPvPct, out.maxPvPct);
  if (out.dmgReduction) out.dmgReduction = Math.min(GARRISON_CAP.dmgReduction, out.dmgReduction);
  if (out.regen) out.regen = Math.min(GARRISON_CAP.regen, out.regen);
  return out;
}

/** Choisit automatiquement les meilleurs défenseurs — le geste qu'on veut faire une
 *  fois, pas trois fois par siège. On classe par la valeur RÉELLE apportée au mur. */
export function autoGarrison(familiars: Item[], slots: number): string[] {
  // Un rôle par place : `dedupeGarrisonRoles` classe déjà par valeur réelle au mur.
  return dedupeGarrisonRoles(familiars)
    .slice(0, slots)
    .map((f) => f.id);
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
export function baseCombatant(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero?: Combatant | null,
  garrison?: GarrisonBonus,
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
  pv *= 1 + (garrison?.maxPvPct ?? 0) / 100;
  damage *= 1 + (garrison?.damagePct ?? 0) / 100;

  return {
    name: 'La Base',
    pv: Math.max(1, Math.round(pv)),
    damage: Math.max(1, Math.round(damage)),
    crit: 0,
    dodge: 0,
    initiative: 999, // les défenseurs tirent en premier : ils voient venir
    // Le rempart ABRITE : sa réduction s'ajoute à celle de la garnison, sous le même
    // plafond de 50 % (au-delà, plus rien ne peut tomber et le siège n'a plus d'issue).
    dmgReduction: Math.min(
      0.5,
      (wl > 0 ? RAID.wallArmorK * share(wl) * defenseEfficiency(defenses, 'wall') : 0) +
        (garrison?.dmgReduction ?? 0),
    ),
    strikes: 1,
    regen: RAID.regenPct + (garrison?.regen ?? 0),
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

/** Puissance de DÉFENSE de la base, dans l'unité de tout le jeu. */
export function defensePower(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero?: Combatant | null,
  garrison?: GarrisonBonus,
): number {
  return combatPower(baseCombatant(defenses, playerLevel, hero, garrison));
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
  /** Puissance perdue si ce contributeur disparaissait (≥ 0). */
  power: number;
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

export function defenseBreakdown(
  defenses: DefenseStructure[],
  playerLevel: number,
  hero: Combatant | null,
  garrison: GarrisonBonus,
): { total: number; parts: DefenseShare[] } {
  const base = baseCombatant(defenses, playerLevel, hero, garrison);
  const total = combatPower(base);
  const full = defenseFacets(base);
  /** Ce qu'un contributeur apporte — puissance, tenue et feu — par UNE SEULE ablation.
   *  ⚠️ Le combattant amputé est construit une fois et les trois valeurs en dérivent :
   *  deux ablations séparées (une pour la puissance, une pour les facettes) doublaient le
   *  travail ET pouvaient diverger. */
  const contrib = (d: DefenseStructure[], h: Combatant | null, g: GarrisonBonus) => {
    const c = baseCombatant(d, playerLevel, h, g);
    const f = defenseFacets(c);
    return {
      power: Math.max(0, total - combatPower(c)),
      def: Math.max(0, full.def - f.def),
      atk: Math.max(0, full.atk - f.atk),
    };
  };
  const drop = (id: DefenseId) => defenses.filter((d) => d.typeId !== id);
  // ⚠️ Le nom et l'emoji d'une STRUCTURE viennent de `DEFENSE_TYPES`, jamais d'une
  // recopie : ils y sont déjà, dans ce fichier, et renommer une structure laisserait
  // sinon ce panneau sur l'ancien nom. C'est la règle que le commentaire ci-dessus
  // invoque pour les CALCULS — elle vaut aussi pour les libellés.
  const struct = (id: DefenseId) => {
    const t = defenseType(id);
    return { label: t?.label ?? id, emoji: t?.emoji ?? '' };
  };
  const parts: DefenseShare[] = [
    {
      id: 'wall',
      ...struct('wall'),
      ...contrib(drop('wall'), hero, garrison),
      active: defenseLevel(defenses, 'wall') > 0,
    },
    {
      id: 'turret',
      ...struct('turret'),
      ...contrib(drop('turret'), hero, garrison),
      active: defenseLevel(defenses, 'turret') > 0,
    },
    // Garnison et héros ne sont PAS des structures : ils n'ont pas d'entrée dans
    // `DEFENSE_TYPES`, leur libellé vit donc ici — à côté de son type, comme
    // `ROLE_LABEL` et `FACTION_LABEL`.
    {
      id: 'garrison',
      // ⚠️ « Garnison » se lisait comme « mes soldats » — un joueur dont tous les
      // aventuriers étaient en convoi voyait donc une ligne fantôme (signalé). Ce sont
      // les FAMILIERS postés au chenil, et le mot doit le dire.
      label: 'Familiers',
      emoji: '🐾',
      ...contrib(defenses, hero, {}),
      active: Object.keys(garrison).length > 0,
    },
    {
      id: 'hero',
      label: 'Héros',
      emoji: '🦸',
      ...(hero ? contrib(defenses, null, garrison) : { power: 0, def: 0, atk: 0 }),
      active: !!hero,
    },
  ];
  // ⚠️ Plus de champ `share` : il n'alimentait qu'une barre de proportion, remplacée par
  // les deux colonnes 🛡️/⚔️. Un champ que plus personne ne lit est du code mort.
  return { total, parts };
}

/** Le pronostic, en bandes CALIBRÉES sur la sonde ci-dessus — jamais un pourcentage
 *  inventé. ⚠️ On ne donne pas un chiffre de victoire : la sonde mesure des moyennes sur
 *  60 graines, un « 72 % » afficherait une précision qu'on n'a pas. */
/** ⚠️ LE SEUIL D'ÉQUILIBRE N'EST PAS À PARITÉ, et c'est ce qui rend deux nombres côte
 *  à côte TROMPEURS : mesuré, on tient une fois sur deux vers un rapport de **0,88**,
 *  pas 1,00 (les défenseurs tirent en premier et régénèrent entre deux groupes). Un
 *  joueur qui lit « 1741 contre 1926 » conclut qu'il perd, alors qu'il tient à ~72 %.
 *  La jauge se REPÈRE donc sur ce seuil au lieu de laisser comparer deux nombres bruts. */
export const SIEGE_EVEN = 0.88;

/** Position sur la jauge, 0..1, avec l'ÉQUILIBRE pile au milieu — c'est ce qui permet de
 *  lire « à gauche ça cède, à droite je tiens » sans connaître le seuil. */
export function siegeGauge(ratio: number): number {
  const r = Math.max(0, ratio);
  // En dessous de l'équilibre on occupe la moitié gauche, au-dessus la moitié droite ;
  // au-delà de deux fois l'équilibre, on est collé à la butée (la jauge sature, elle
  // ne ment pas : « largement » est largement).
  return r <= SIEGE_EVEN
    ? 0.5 * (r / SIEGE_EVEN)
    : 0.5 + 0.5 * Math.min(1, (r - SIEGE_EVEN) / SIEGE_EVEN);
}

export type SiegeOdds = 'perdu' | 'risque' | 'serre' | 'favorable' | 'large';
export function siegeOdds(ratio: number): SiegeOdds {
  if (ratio < 0.55) return 'perdu';
  if (ratio < 0.72) return 'risque';
  if (ratio < 0.88) return 'serre';
  if (ratio < 1.05) return 'favorable';
  return 'large';
}
export const ODDS_LABEL: Record<SiegeOdds, string> = {
  perdu: 'L’enceinte cède',
  risque: 'Très risqué',
  serre: 'Ça va se jouer',
  favorable: 'Tu devrais tenir',
  large: 'Tu tiens largement',
};

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
export function woundMsFor(infirmaryLevel: number, intervalMs?: number): number {
  const base = Math.min(
    WOUND_MAX_MS,
    Math.round(RAID.woundMs * Math.max(0.2, 1 - Math.max(0, infirmaryLevel) * 0.06)),
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
export function resolveRaid(
  defender: Combatant,
  raid: Raid,
  now: number,
  heroHome: boolean,
): RaidReport {
  const r = simulateDungeon(defender, raidFoes(raid), { seed: raid.seed });
  return {
    raidId: raid.id,
    faction: raid.faction,
    level: raid.level,
    groups: raid.groups,
    held: r.cleared,
    defeated: r.defeated,
    total: r.total,
    finalPv: r.finalPv,
    maxPv: defender.pv,
    heroHome,
    fights: r.fights,
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
  ctx: { playerLevel: number; defenses: DefenseStructure[]; intervalMs?: number },
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
      const a = baseCombatant(withLevel(l), ctx.playerLevel).pv;
      const b = baseCombatant(withLevel(next), ctx.playerLevel).pv;
      return b > a
        ? `Niveau ${next} : ${a} → ${b} PV de muraille (+${b - a})`
        : 'Déjà au niveau de ton personnage — c’est le sport qui débloque la suite.';
    }
    case 'turret': {
      const a = baseCombatant(withLevel(l), ctx.playerLevel).damage;
      const b = baseCombatant(withLevel(next), ctx.playerLevel).damage;
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
      const leadPlein = scoutLeadMs(next) === scoutLeadMs(l);
      const lead = leadPlein
        ? `préavis ${fmtSpan(scoutLeadMs(l))} (déjà au maximum)`
        : `préavis ${fmtSpan(scoutLeadMs(l))} → ${fmtSpan(scoutLeadMs(next))}`;
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
      if (b > a) return `Niveau ${next} : ${a} → ${b} corps fouillés par vague (+${b - a})`;
      const step = nextStepLevel(scavengerCount, l);
      return step
        ? `${a} corps par vague. Ce palier-ci ne change rien — le prochain gain est au niveau ${step} (${scavengerCount(step)}).`
        : `${a} corps par vague — déjà au maximum.`;
    }
    case 'kennel':
      // ⚠️ Le chenil ne donne PAS de places (elles suivent le niveau du personnage) : il
      // plafonne le DRESSAGE défensif. Le dire, sinon on l’améliore en attendant un slot.
      return `Niveau ${next} : dressage de défense plafonné à ${next} (les places, elles, viennent de ton niveau)`;
    case 'infirmary': {
      const wa = woundMsFor(l, ctx.intervalMs);
      const wb = woundMsFor(next, ctx.intervalMs);
      const fa = fatigueMsFor(l);
      const fb = fatigueMsFor(next);
      const fam = `familiers fatigués ${fmtSpan(fa)} → ${fmtSpan(fb)}`;
      if (wb < wa)
        return `Niveau ${next} : convalescence du héros ${fmtSpan(wa)} → ${fmtSpan(wb)}, ${fam}`;
      // ⚠️ DEUX plafonds distincts, et il ne faut surtout pas les confondre : le
      // PLANCHER de la structure (−80 %, atteint vers le niveau 14) et le RYTHME des
      // sièges (`WOUND_INTERVAL_SHARE`, quand on court les séances). Annoncer le mauvais
      // motif enverrait le joueur réduire son entraînement pour un gain imaginaire.
      const brutBouge = woundMsFor(next) < woundMsFor(l);
      const motif = brutBouge
        ? `bornée par ton rythme de sièges (elle ne dépasse jamais ${Math.round(WOUND_INTERVAL_SHARE * 100)} % de l’intervalle) — la monter n’y changera rien`
        : `déjà à son plancher — elle ne descendra pas plus bas`;
      const tete = `La convalescence du héros (${fmtSpan(wa)}) est ${motif}.`;
      return fb < fa
        ? `Niveau ${next} : ${fam}. ${tete}`
        : `${tete} Les familiers (${fmtSpan(fa)}) aussi : cette structure est au maximum.`;
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
    b = { ...b, field: null };
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
  const lead = scoutLeadMs(scoutLevel(b.defenses));
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

export function remainingCorpses(field: BattleField | null): number {
  return field ? field.corpses.filter((c) => !c.looted).length : 0;
}

/** DOUBLONS de familiers : ceux qu’AUCUNE configuration ne pourra jamais employer.
 *
 *  ⚠️ Un familier n’est pas un objet : il sert sur DEUX fronts qui ne se classent pas de
 *  la même façon — l’attaque (un seul équipé, dressage ⚔️) et le mur (jusqu’à
 *  `garrisonSlots` postés, dressage 🛡️). Un compagnon médiocre au combat peut être un
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
 *  Gardés par effet = `garrisonSlots(niveau) + 1` : la garnison pleine d’un seul rôle,
 *  plus celui qu’on porte. Au-delà, la copie est inemployable par construction.
 *  Le dressage défensif est lu NON PLAFONNÉ par le chenil (comme `autoGarrison`) : le
 *  chenil se monte, on ne brade pas un bon défenseur parce que son école est en retard. */
export function duplicateFamiliars(
  familiars: Item[],
  playerLevel: number,
  opts: { equippedId?: string | null; postedIds?: string[] } = {},
): Item[] {
  const keep = garrisonSlots(playerLevel) + 1;
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
