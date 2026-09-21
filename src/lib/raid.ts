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
import { combatPower, combatPowerRaw, mulberry32, type Combatant } from './combat';
import { refFighter } from './proceduralContent';
import { rollDrop, type AggregatedEffects, type Item } from './items';
import { escortCombatant, escortGear, unitEffects, type EscortKit } from './caravan';
import { ADV_GEAR_SLOTS, canWearAdvGear, type AdvGear, type AdvGearSlot } from './advGear';
import { beyondCap, buildingUpgradeCost } from './buildings';
import { advStats, advTitle, type Adventurer } from './adventurers';
import {
  BATTLE,
  simulateSiege,
  type UnitKind,
  type SiegePost,
  type SiegeUnit,
  type SiegeWall,
  type BattleEvent,
} from './siegeBattle';

// ── Types ──

/** Qui attaque. La faction décide du BUTIN — c'est donc la première chose que la Tour
 *  de guet révèle : on sait ce qu'on va farmer avant que ça arrive. */
export type RaidFaction = 'bandits' | 'betes' | 'mortsvivants';

/**
 * 🕳️ UNE FAILLE A DÉBORDÉ : son armée marche sur la base.
 *
 * ⚠️ **LE TYPE VIT ICI, PAS DANS `rift.ts`** : `rift.ts` importe déjà `raid.ts`
 * (`factionRoster`, `RaidFaction`), donc l'inverse ferait un cycle. La faille le
 * CONSTRUIT (`riftOverflowOf`), la base le STOCKE, `rollRaid` le CONSOMME.
 */
export interface RiftOverflow {
  /** Faction de la faille — c'est elle qui vient, donc elle décide du BUTIN du siège. */
  faction: RaidFaction;
  /** Niveau de la faille. ⚠️ **AFFICHÉ, jamais utilisé pour calibrer l'armée** — cf. le
   *  garde-fou anti-exploit de `rollRaid`. */
  level: number;
  /** Instant du débordement (ms epoch). */
  at: number;
}

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
  /** Renfort de l’armée (PV et dégâts) figé au tirage — cf. `earlyThreatMult`. Absent sur
   *  les armées tirées avant la v0.829 → 1. */
  threat?: number;
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
  /** 🕳️ La faille dont cette armée est sortie, si elle en vient une. ⚠️ **FIGÉE AU
   *  TIRAGE, comme `threat`** : refermer une faille n'affaiblit PAS une armée déjà en
   *  marche — elle garde la force que la Tour de guet a annoncée. Fermer agit sur la
   *  SUITE (« ferme-la avant la prochaine »). Absente = armée ordinaire. */
  overflow?: RiftOverflow;
}

export type DefenseId = 'wall' | 'turret' | 'watchtower' | 'infirmary';

/** Une structure de l'enceinte. `damaged` = niveau CONSERVÉ mais efficacité réduite de
 *  moitié jusqu'à réparation — on ne rétrograde jamais un investissement (cf.
 *  `raidDamage`) et on ne l'annule jamais non plus (cf. `DAMAGED_EFFICIENCY`). */
export interface DefenseStructure {
  typeId: DefenseId;
  level: number;
  damaged?: boolean;
  /** Fin des travaux (ms epoch). Tant qu’elle n’est pas atteinte, la structure reste
   *  ENDOMMAGÉE — l'or est payé au lancement, le service reprend à la fin. */
  repairUntil?: number;
}

/** Un cadavre sur le champ de bataille. Sa richesse vient de SON niveau (il était
 *  dangereux), pas du niveau du bâtiment de fouille. */
export interface Corpse {
  id: string;
  emoji: string;
  name: string;
  level: number;
  champion?: boolean;
  /** Dilution de masse HÉRITÉE de son groupe : ce corps est un parmi ~2,5× trop nombreux,
   *  il est donc d'autant moins riche (cf. `RAID.massMult`). Absent = 1 (le champion, et
   *  les champs sauvegardés avant la v0.720). */
  massMult?: number;
  /** Position sur le champ (0..100), posée au tirage → stable d'un rendu à l'autre. */
  x: number;
  y: number;
}

/** Le champ de bataille APRÈS un siège (gagné ou perdu : on tue toujours quelqu'un).
 *
 *  ⚠️ **DU DÉCOR, ET RIEN D’AUTRE** (demandé). Le butin des corps est crédité À LA
 *  RÉSOLUTION, et il figure dans le rapport de bataille : il n’y a plus rien à venir
 *  chercher ici. Les corps restent quelques heures parce qu’une ville qui vient d’être
 *  assiégée ne se nettoie pas dans la seconde — pas parce qu’ils valent quelque chose.
 *
 *  ⚠️ C’est un RENVERSEMENT de la fouille étalée (v0.772), et son motif est tombé de
 *  lui-même : mesuré, un champ se vidait en 6 à 30 minutes pour 24 h de péremption. La
 *  fouille ne faisait donc que RETARDER un butin acquis, au prix d’un bâtiment, d’une
 *  boucle de vagues, d’un relevé de pillage et d’un second rapport. */
export interface BattleField {
  corpses: Corpse[];
  expiresAt: number; // les corps sont emportés
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
 *  jusqu'à `until` (ni donjon, ni boss, ni portail, ni Labyrinthe, ni expédition).
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

/** 🦴 CE QUE LA DERNIÈRE BATAILLE A RAPPORTÉ — affiché avec son rapport.
 *
 *  ⚠️ Des COMPTES, jamais des objets : le butin est crédité à la résolution, et le
 *  relevé ne fait que le DIRE. Stocker les objets ici les mettrait en double.
 *
 *  ⚠️ Optionnel : les bases d’avant n’en ont pas, et leur rapport n’affiche donc
 *  simplement aucun butin — plutôt qu’une colonne de zéros qui mentirait. */
export interface BattleLoot {
  corpses: number;
  gold: number;
  keys: number;
  summonStones: number;
  items: number;
}

/** 🦴 LE BUTIN DU DERNIER ASSAUT, EN PUCES — source UNIQUE des deux écrans qui
 *  l'affichent (l'écran de fin du rejeu, et la feuille de la Tour de guet).
 *
 *  ⚠️ Une seconde mise en forme divergerait au premier ajout de devise — c'est le
 *  défaut que `haulPills` a déjà corrigé pour les expéditions (v0.680), où la boîte
 *  listait ses devises À LA MAIN et affichait un butin VIDE pour une épave.
 *
 *  ⚠️ Rend une liste VIDE quand il n'y a pas de relevé : les bases d'avant n'en ont
 *  pas, et on n'affiche alors RIEN plutôt qu'une colonne de zéros qui mentirait.
 */
export function battleLootPills(loot: BattleLoot | null | undefined): string[] {
  if (!loot) return [];
  const p: string[] = [];
  if (loot.gold) p.push(`+${loot.gold} 🪙`);
  if (loot.summonStones) p.push(`+${loot.summonStones} 🔮`);
  if (loot.keys) p.push(`+${loot.keys} 🗝️`);
  if (loot.items) p.push(`+${loot.items} objet${loot.items > 1 ? 's' : ''}`);
  return p;
}

export interface BaseState {
  defenses: DefenseStructure[];
  wound?: HeroWound | null;
  raid: Raid | null;
  nextRaidAt: number;
  field: BattleField | null;
  freeze: ProductionFreeze | null;
  lastReport: RaidReport | null;
  /** Le butin du dernier assaut (cf. `BattleLoot`), posé en même temps que le rapport. */
  lastLoot?: BattleLoot | null;
  seed: number;
  /** 🕳️ Le débordement EN ATTENTE : une faille a craché son armée, elle n'est pas encore
   *  arrivée. Posé par la carte, consommé au tirage du raid.
   *
   *  ⚠️ **UN SEUL, ET IL NE S'EMPILE PAS.** Six failles qui débordent pendant une absence
   *  ne font pas ×1,3⁶ : on garde le plus RÉCENT, et le renfort reste plat. C'est la
   *  règle 1 des sièges (« on ne perd jamais parce qu'on n'a pas ouvert l'app ») — on
   *  paie UNE fois, pas une fois par faille oubliée. Champ additif (JSONB) : absent sur
   *  toutes les bases d'avant, donc armée ordinaire. */
  overflow?: RiftOverflow | null;
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
  /** Graine du raid : elle fixe le PAN d’attaque (`raidFirstSector`). ⚠️ Optionnelle —
   *  les rapports stockés avant ne l’ont pas, le rejeu la relit alors dans `raidId`. */
  seed?: number;
  /** Qui défendait, tel que le moteur les a alignés. ⚠️ Le rejeu montrait jusqu’ici le
   *  vivier d’AUJOURD’HUI : un aventurier recruté après l’assaut apparaissait dans une
   *  bataille qu’il n’a pas livrée. Optionnel pour la même raison que `seed`. */
  defenders?: SiegeDefenderInfo[];
  /** Les AVENTURIERS à terre en fin de siège (ni balistes, ni héros). Optionnel : les
   *  rapports d’avant ne l’ont pas, et n’envoient donc personne à l’infirmerie. */
  wounded?: string[];
}

/** Un défenseur tel que le rejeu doit le montrer — l’identité, pas les chiffres. */
export interface SiegeDefenderInfo {
  id: string;
  name: string;
  emoji: string;
  kind: 'melee' | 'ranged';
  /** PV de départ — ce qui permet au rejeu de montrer la barre de vie (v0.826). ⚠️
   *  Optionnel : les rapports stockés avant ne l’ont pas, et n’affichent alors aucune barre
   *  plutôt qu’une barre inventée. */
  maxPv?: number;
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
  unlockLevel: number;
  desc: string;
}

export const DEFENSE_TYPES: DefenseType[] = [
  {
    id: 'wall',
    label: 'Muraille',
    emoji: '🧱',
    buildGold: 500,
    // Niveau 1 (v0.823) : on BÂTIT dès le début ; ce sont les SIÈGES qui attendent
    // `RAID.minRaidLevel`. Construire n'expose à rien tant qu'aucune armée ne vient.
    unlockLevel: 1,
    desc: 'L’enceinte encaisse les assauts. Tant qu’elle et les tourelles ne suivent pas ton niveau, personne ne vient t’attaquer.',
  },
  {
    id: 'turret',
    label: 'Tourelles',
    emoji: '🏹',
    buildGold: 700,
    unlockLevel: 1,
    desc: 'Elles tirent. Chaque niveau ajoute de la puissance de feu, et une tourelle de plus sur le mur (jusqu’à 8).',
  },
  {
    id: 'watchtower',
    label: 'Tour de guet',
    emoji: '🗼',
    buildGold: 600,
    unlockLevel: 1,
    desc: 'Elle renseigne : plus elle est haute, plus tu en sais sur l’armée qui vient — et plus tôt tu l’apprends.',
  },
  {
    id: 'infirmary',
    label: 'Infirmerie',
    emoji: '⛑️',
    buildGold: 700,
    unlockLevel: 1,
    desc: 'Soigne plus vite le héros et les champions blessés.',
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
  /** ⚖️ À PUISSANCE ÉGALE, UNE CHANCE SUR DEUX (v0.830, mesuré ; signalé par l’utilisateur :
   *  « j’avais plus de 6000 en défense, l’attaque 2000, et j’ai perdu »).
   *  La défense et l’armée sont ramenées au même arbitre (`combatPower`), mais PAS par la
   *  même construction : la base additionne les coups de TOUS ses tireurs, l’armée est
   *  résumée en UN combattant (PV cumulés, dégâts moyens). Son chiffre brut sous-estimait
   *  donc la menace d’un facteur constant. Mesuré sur 1 008 configurations (niveaux 8 à 90,
   *  enceinte 60-100 %, héros et vivier variables, 24 sièges chacune) : on tenait une fois
   *  sur deux à un rapport défense/armée de **2,36**, et ce seuil est PLAT selon le niveau
   *  (2,22 à 2,74) — un siège PERDU pouvait afficher une défense 3 fois supérieure.
   *  Le chiffre de l’armée est donc exprimé en « défense qu’il faut pour tenir une fois
   *  sur deux ». ⚠️ Il reste une MAGNITUDE (~11 % de cas mal rangés au seuil) : la
   *  tenue simulée, affichée dessous, est le seul pronostic. */
  assaultEvenK: 2.4,
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
  // ⚠️ Plancher de la fenêtre : 3 → 2 (v0.823, mesuré). À 3, une armée de niveau 5 marchait
  // sur un joueur de niveau 2 — mesuré, enceinte à niveau + héros : 11 % de tenue au
  // niveau 1, 27 % au 2, 48 % au 3. À 2 : 93 % au niveau 2, 98 % au 3, 100 % au 4, puis
  // la fenêtre proportionnelle reprend la main (89 % au 5, identique). À 1, les niveaux
  // 1-2 tenaient 98-100 % : plus aucun enjeu, donc écarté.
  spanMin: 2,
  // Premier niveau où une armée peut venir (v0.823). L'enceinte se bâtit dès le niveau 1 ;
  // au niveau 1 le plancher de fenêtre ferait encore marcher une armée 3× plus forte que
  // le joueur (30 % de tenue mesurés), et il faut d'abord apprendre à bâtir.
  minRaidLevel: 2,
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
  // ⚠️ 0,05 → 0,055 (v0.789, mesuré) : LE PLAFOND D’UNE BASE PLEINEMENT INVESTIE.
  // Une enceinte à niveau + le héros + le vivier complet tenait **100 / 99 / 92 / 91 / 94 %**
  // (niveaux 12/28/50/80/100) : passé le milieu de partie on ne perdait littéralement plus
  // jamais, et c’est le « les bases semblent imprenables » signalé. Après : **100 / 96 / 87 /
  // 85 / 83** — une défaite tous les six sièges en fin de partie au lieu d’une sur dix-sept.
  //
  // ⚠️ CE DIAL AVAIT ÉTÉ ÉCARTÉ EN v0.786 pour une raison qui a CESSÉ D’ÊTRE VRAIE : il
  // faisait alors exploser l’iso-menace entre factions (13,9 → 21,6 dès ×1,1). Depuis que
  // les deux fuites de la v0.788 sont bouchées, mesuré à ×1,1 : **3,2**. Le chantier
  // d’iso-menace a donc bien débloqué un dial — celui-ci, pas le goulot de la brèche.
  //
  // ⚠️ LA BORNE QUI LIE TOUT EST `mi > 6` — une demi-enceinte que personne ne défend de
  // l’intérieur (test de la falaise). Mesuré : 14 à 0,05 · **8 à 0,055** · 6 à 0,0575 · 5 à
  // 0,06. C’est elle, et non l’iso-menace, qui interdit d’aller plus loin — et elle interdit
  // aussi de la combiner avec une baisse des tourelles (0,055 + turretDmgK 0,16 → 5).
  foeDmgK: 0.055,
  /** Part de `foeDmgK` que porte un TIREUR assaillant (la mêlée garde 1).
   *  ⚠️ NÉE D’UNE CORRECTION DE MODÈLE, pas d’un nerf (v0.800). Les tireurs adverses ne
   *  voient plus que leur côté de l’enceinte : avant, **63 % de leurs traits sur une baliste**
   *  visaient le côté OPPOSÉ de la ville. Ce feu perdu était un bonus CACHÉ de la défense —
   *  le retirer faisait tomber la tenue d’une enceinte pleine au niveau 90 de 63 % à 49 %.
   *  On rend exactement ce que le gaspillage donnait, à l’endroit qui l’a causé.
   *  ⚠️ Pas `turretPvK` : c’était le premier levier mesuré (0,65 recollait la courbe), mais il
   *  contredit « le mur porte plus de PV que toutes les balistes réunies » (v0.769, demande de
   *  l’utilisateur). Mesuré à 0,6, tenue sans personne / avec tout le monde / 70 % sans /
   *  70 % avec vivier, niveaux 12·28·60·90 : 78/100/21/61 · 82/93/36/63 · 78/89/23/32 ·
   *  65/90/7/16, contre 87/100/23/71 · 81/97/32/69 · 73/91/18/38 · 63/87/7/23 avant. */
  foeRangedDmgK: 0.6,
  /** Ce qu’un aventurier vaut DERRIÈRE SES MURS, face à ce qu’il vaut sur la route.
   *  ⚠️ NÉ AVEC LA BATAILLE DE LA COUR (v0.801, mesuré). Depuis que la brèche s’ouvre
   *  souvent et que seuls les meilleurs engagent chaque intrus, c’est la QUALITÉ du vivier
   *  qui tient la ville — or l’aventurier progresse linéairement quand l’armée suit ~L⁴.
   *  Mesuré, niveaux 28/50/80/100, base pleine avec héros et vivier : **90/87/93/88 %** à
   *  ×1,25, contre 89/84/88/75 à ×1 (le vivier ne tenait plus la cour en fin de partie)
   *  et 95/92/100/96 à ×2 (le plafond revenait). Appliqué au siège seul : la calibration
   *  MESURÉE des embuscades de convoi n’est pas touchée. */
  guardSiegeK: 0.9,
  /** 📈 RENFORT DE L’ARMÉE ENTRE LES NIVEAUX 6 ET 26 (v0.829, mesuré ; demandé par
   *  l’utilisateur : « durcir un peu la défense avant le niveau 16, l’apprentissage jusqu’au
   *  niveau 5 max »). Multiplie PV ET dégâts de l’armée : 1 jusqu’au niveau `learnUntil`,
   *  montée jusqu’à `1 + peak` au niveau `fullFrom`, plein jusqu’à `holdUntil`, retour
   *  linéaire à 1 au niveau `fadeUntil` — la fin de partie, déjà calibrée, n’est pas touchée.
   *  ⚠️ Pourquoi l’ARMÉE et pas les aventuriers : mesuré, diviser par 2 leur bonus de siège
   *  laissait un vivier complet à 95-100 % — seule une armée plus forte le fait bouger. */
  earlyThreat: { learnUntil: 5, fullFrom: 7, holdUntil: 16, fadeUntil: 26, peak: 0.35 },
  /** 🕳️ RENFORT D'UNE ARMÉE SORTIE D'UNE FAILLE — **×1,3, MESURÉ** (tenue d'un siège,
   *  enceinte à niveau, héros présent, vivier complet, 150 sièges par case) :
   *
   *  | renfort  | niv 12 | 28 | 50 | 80 |
   *  | -------- | ------ | -- | -- | -- |
   *  | ×1       | 90     | 91 | 85 | 89 |
   *  | ×1,15    | 70     | 83 | 67 | 74 |
   *  | **×1,3** | **53** | **71** | **52** | **51** |
   *  | ×1,5     | 32     | 52 | 29 | 27 |
   *  | ×2       | 2      | 11 | 0  | 0  |
   *
   *  ⚠️ **RETENU PARCE QU'IL EST PLAT SELON LE NIVEAU** — c'est la propriété qui autorise
   *  une valeur unique. À ×1 laisser mûrir était gagner d'office (85-91 % de tenue, donc
   *  aucune raison d'aller refermer quoi que ce soit) ; à ×2 une faille oubliée donnerait
   *  un siège imbattable, ce qui punirait celui qui joue mais n'a pas l'énergie d'y aller
   *  — la limite directe de la règle 1.
   *
   *  ⚠️ **ET IL NE MONTE PAS AVEC LE TEMPS**, piste explicitement écartée par la mesure
   *  ci-dessus : le renfort reste FIXE. Il s'applique au plus une fois par siège.
   *
   *  ⚠️ Défini ICI et non dans `rift.ts` : c'est une constante de SIÈGE, mesurée sur des
   *  sièges, et `groupCombatant` doit pouvoir la lire sans cycle d'import. */
  riftThreat: 1.3,
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

  // 🔧 Réparation d'une structure, en PART d'un cran de ce niveau (cf. `repairCost`).
  // ⚠️ Bon marché à dessein : remettre en état après un siège perdu ne doit jamais devenir
  // une punition — sinon l'échec rouvre la spirale que tout le système de siège évite.
  repairShare: 0.04, // mesuré : ~⅙ de journée de revenu (réf. donjons + mines) pour le mur, à tout niveau
  // Chance qu'un corps ORDINAIRE laisse une pièce d'équipement (un champion en laisse
  // toujours une). Les bandits sont équipés, les bêtes et les morts-vivants beaucoup moins.
  gearDropBandits: 0.5,
  gearDropOther: 0.12,
  turretDmgK: 0.175,
  /** PV d'UNE tourelle, en part des PV de la référence.
   *  ⚠️ Le modèle à UN SEUL combattant n'en avait pas besoin — tout était fondu. Le
   *  moteur en deux phases, lui, en fait des unités qu'on peut RÉDUIRE AU SILENCE : sans
   *  PV, les archers assaillants n'auraient aucune prise et « faire taire les tireurs »
   *  ne voudrait rien dire. Modeste : une baliste est un ouvrage, pas un soldat. */
  turretPvK: 0.42,

  // ── PORTÉES ────────────────────────────────────────────────────────────────
  // ⚠️ TOUTES exprimées en fraction de `BATTLE.fieldDepth`, jamais en pas écrits à la
  // main : **une baliste couvre le terrain ENTIER** (c’est son métier et son unique
  // justification), et le reste se lit par rapport à elle. Changer la profondeur du
  // terrain déplace donc tout le monde ensemble, sans rien à re-régler.

  /** L’archer du rempart : la moitié du terrain. Il entre dans la danse quand l’assaut
   *  est à mi-course — c’est ce qui STRATIFIE l’engagement au lieu d’une seule salve. */
  archerRangeShare: 0.5,
  /** Le tireur ASSAILLANT : un tiers. Il tire vers le HAUT, sur un rempart — il doit
   *  s’approcher davantage que celui qui lui tire dessus. C’est là toute la valeur d’une
   *  muraille, et la seule riposte est d’amener des machines qui portent plus loin. */
  foeRangeShare: 1 / 3,
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
  intervalFloorMs: 3 * 3600_000, // plancher : en deçà, un siège n'est plus un événement
  intervalMaxMs: 7 * 24 * 3600_000, // 1 séance par semaine → 1 siège par semaine
  intervalIdleMs: 72 * 3600_000, // repli quand on ne sait rien de l'activité
  intervalJitter: 0.25,
  freezeMs: 24 * 3600_000, // dégel automatique (le sport est le raccourci, pas la rançon)
  woundMs: 6 * 3600_000, // convalescence de base après une défaite (abrégée par l’Infirmerie)
  // Soins d’urgence du héros, EN OR (v0.824 ; demandé : « la ferraille n’est pas logique »).
  // Prix par heure = healGoldK × niveau^healGoldExp. L’exposant suit le REVENU d’or d’une
  // journée (mesuré ≈ 660 × niveau^1,65 du niveau 2 au 100) : une convalescence complète
  // de 6 h coûte ~½ journée de revenu À TOUS LES NIVEAUX — cher, mais jamais un mur.
  // ⚠️ Ne pas prendre l’exposant des bâtiments (1,9) : le prix dériverait vers le mur.
  // ⚠️ RECALÉS (mesuré) après le retrait de la Mine d’or : elle pesait 19,3 % du revenu
  // au niveau 10 mais 3,4 % au niveau 100, donc la retirer n’a pas seulement baissé le
  // revenu — elle en a changé la PENTE (≈ L^1,65 → ≈ L^1,75). À 55/1,65 une
  // convalescence complète coûtait une journée ENTIÈRE de revenu au niveau 2, contre
  // la demi-journée visée. Balayé sur 4 exposants × 6 coefficients : 32/1,75 rend
  // 0,62 / 0,58 / 0,43 / 0,41 / 0,47 journée aux niveaux 2/10/28/60/100 — la bande la
  // plus centrée sur « ½ journée » que le test verrouille.
  healGoldK: 32,
  healGoldExp: 1.75,
  // Réparations (cf. `repairMsFor`) : 30 min + 3 min par niveau, et RIEN ne les
  // raccourcit — la Fonderie est partie avec son second métier (demandé).
  repairBaseMs: 30 * 60_000,
  repairPerLevelMs: 3 * 60_000,

  // Espionnage
  /** ⏱️ PRÉAVIS SANS TOUR — un filet, pas un service : on voit la poussière à l’horizon. */
  scoutLeadMinMs: 30 * 60_000,
  /** ⏱️ PRÉAVIS MAXIMAL, atteint PILE au niveau `scoutLeadMaxLevel` (v0.802, demandé par
   *  l’utilisateur : « calibré sur 100 niveaux, détection max de 10 h au niveau 100 »).
   *  ⚠️ RETOUR À UNE DURÉE ABSOLUE, et c’est un renversement assumé de la v0.776 (part de
   *  l’intervalle, qui donnait 15 h 52 au niveau 100 à l’entraînement quotidien). Ce que la
   *  v0.776 corrigeait reste corrigé : la courbe ne plafonne plus au niveau 21, elle monte
   *  à CHAQUE niveau jusqu’au 100. */
  scoutLeadMaxMs: 10 * 3600_000,
  scoutLeadMaxLevel: 100,
  /** Forme de la montée : RACINE — on gagne vite au début, un peu à chaque niveau ensuite.
   *  Linéaire, les premiers niveaux ne rendaient presque rien pour un coût déjà réel. */
  scoutLeadExp: 0.5,
  /** Garde-fou : jamais plus que cette part de l’intervalle entre deux sièges. Être prévenu
   *  tout le temps tuerait la mécanique. ⚠️ DORMANT tant que l’intervalle vaut au moins
   *  24 h (7 jours actifs sur 7) : 10 h en font 42 %. */
  scoutLeadIntervalCap: 0.85,
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

/** ⏳ COMBIEN DE TEMPS LES CORPS RESTENT — du décor, plus une réserve de butin.
 *
 *  ⚠️ « Quelques heures » (demandé), et non les 24 h de la fouille : le butin étant
 *  crédité à la résolution, laisser le champ traîner une journée entière donnerait une
 *  base qui a l’air assiégée en permanence, pour rien. Bien en deçà de l’intervalle
 *  entre deux sièges (24 à 72 h) → on retrouve sa ville propre avant le suivant. */
export const SCAV = {
  fieldMs: 6 * 3600_000, // les corps sont emportés au bout de quelques heures
} as const;

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

/** Le roster d'une faction, dans son ORDRE (qui est une mécanique, cf. plus haut) — lu
 *  aussi par les camps de faction de la carte (`camp.ts`). Le chef est le dernier. */
export function factionRoster(
  faction: RaidFaction,
): readonly { emoji: string; name: string; kind: UnitKind }[] {
  return ROSTERS[faction];
}

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
  return Math.max(
    RAID.spanMin,
    Math.round(Math.min(L * RAID.spanEarly, RAID.spanFlat + L * RAID.spanLate)),
  );
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
  overflow?: RiftOverflow | null,
): Raid {
  const rng = mulberry32(seed >>> 0 || 1);
  // 🕳️ Une armée sortie d'une faille porte LA FACTION DE SA FAILLE — donc le butin du
  // siège se lit sur la carte avant même que la Tour de guet ne parle.
  const rolled = pick(rng, ['bandits', 'betes', 'mortsvivants'] as const);
  const faction = overflow ? overflow.faction : rolled;
  const roster = ROSTERS[faction];
  const L = Math.max(1, playerLevel);
  const nGroups = RAID.minGroups + Math.floor(rng() * (RAID.maxGroups - RAID.minGroups + 1));
  const total = raidSize(L, faction);
  const unitMult = FACTION_PROFILE[faction].unitMult;
  const span = levelSpanFor(L);
  // ⚠️ Figé AU TIRAGE, sur le niveau du JOUEUR (les groupes sont plus hauts que lui) : une
  // armée en marche garde la force annoncée, et la Tour de guet l’estime telle quelle.
  //
  // 🕳️ ⚠️ **LE NIVEAU DE L'ARMÉE NE VIENT PAS DE LA FAILLE, ET C'EST UN GARDE-FOU
  // ANTI-EXPLOIT.** Depuis la v0.929 le niveau d'une faille est tiré par RANG, donc
  // décorrélé du joueur : une faille Bronze près d'un joueur de niveau 60 produirait une
  // armée à son niveau à elle, très loin sous la calibration — laisser déborder
  // deviendrait STRICTEMENT MEILLEUR que fermer, l'inverse exact de ce qu'on construit.
  // La faille donne donc sa FACTION et son RENFORT ; l'effectif et les niveaux restent
  // calibrés sur le joueur, comme toute armée.
  const threat = earlyThreatMult(L) * (overflow ? RAID.riftThreat : 1);

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
      threat,
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
    threat,
  });

  return {
    id: `raid_${seed}_${arrivesAt}`,
    seed,
    faction,
    groups,
    level: championLevel,
    detectedAt: arrivesAt - leadMs,
    arrivesAt,
    ...(overflow ? { overflow } : {}),
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

/** ⏱️ PRÉAVIS OFFERT PAR LA TOUR DE GUET — c’est lui qui rend la préparation possible,
 *  et c’est à la DÉTECTION que part la notification, pas à l’impact : monter la Tour
 *  achète littéralement du temps de réaction.
 *
 *  Une DURÉE, calibrée sur 100 niveaux : 30 min sans Tour, **10 h au niveau 100**, en
 *  racine (cf. `RAID.scoutLeadExp`). Au-delà du niveau 100 elle ne monte plus.
 *
 *  ⚠️ HISTORIQUE, pour ne pas refaire le chemin : durée absolue plafonnée à 8 h dès le
 *  niveau 21 (79 niveaux morts) → part de l’intervalle (v0.776, 15 h 52 au niveau 100 à
 *  l’entraînement quotidien) → durée calibrée sur 100 niveaux (v0.802, demande de
 *  l’utilisateur). Le garde-fou de la part survit en plafond (`scoutLeadIntervalCap`). */
export function scoutLeadMs(watchtowerLevel: number, intervalMs: number): number {
  const t = Math.min(1, Math.max(0, watchtowerLevel) / RAID.scoutLeadMaxLevel);
  const { scoutLeadMinMs: lo, scoutLeadMaxMs: hi } = RAID;
  const lead = lo + (hi - lo) * Math.pow(t, RAID.scoutLeadExp);
  return Math.round(Math.min(lead, Math.max(0, intervalMs) * RAID.scoutLeadIntervalCap));
}

/** Clarté du renseignement (0..5). Elle dépend de la Tour ET de la force de l'armée : une
 *  grosse armée reste opaque, et c'est en montant la Tour qu'on rachète de la lisibilité. */
export function scoutClarity(
  watchtowerLevel: number,
  raidLevel: number,
  playerLevel: number,
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
  const c = Math.round(base - opacity) - scoutNoise(raidSeed);
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

/** Renfort de l’armée pour un joueur de ce niveau (cf. `RAID.earlyThreat`). Pur. */
export function earlyThreatMult(playerLevel: number): number {
  const t = RAID.earlyThreat;
  const L = playerLevel;
  if (L <= t.learnUntil || L >= t.fadeUntil) return 1;
  if (L < t.fullFrom) return 1 + (t.peak * (L - t.learnUntil)) / (t.fullFrom - t.learnUntil);
  if (L <= t.holdUntil) return 1 + t.peak;
  return 1 + (t.peak * (t.fadeUntil - L)) / (t.fadeUntil - t.holdUntil);
}

export function groupCombatant(g: RaidGroup): Combatant {
  const ref = refFighter(Math.max(1, g.level));
  const um = g.unitMult ?? 1; // silhouette de la faction (horde fragile ↔ bande aguerrie)
  const th = g.threat ?? 1; // renfort figé au tirage (1 pour les armées d’avant)
  const champPv = g.champion ? RAID.championPvMult : 1;
  const champDmg = g.champion ? RAID.championDmgMult : 1;
  const unitPv = offensePerRound(ref) * RAID.foePvK * champPv * um * th;
  // ⚠️ Même part de tir que dans `siegeAttackers` : l’estimation de la Tour de guet et la
  // bataille doivent parler de la même armée.
  const tir = groupKind(g) === 'ranged' ? RAID.foeRangedDmgK : 1;
  const unitDmg = ref.pv * RAID.foeDmgK * tir * champDmg * silhouetteDmgMult(um) * th;
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

/** 🐾 LE CHENIL EST RETIRÉ (v0.996, décision de l'utilisateur). Il ne servait plus qu'à
 *  confier des familiers aux champions (places, rang, dressage) ; familiers et talents
 *  étant désormais réservés au HÉROS, il n'avait plus aucun effet. L'investissement est
 *  RENDU au chargement (`retireKennel`) — personne ne perd l'or ni la ferraille qu'il y a
 *  mis. Le prix de pose (`buildGold`) est gardé ici : il n'est plus dans `DEFENSE_TYPES`.
 */
/** ⚠️ LE PRIX RÉELLEMENT PAYÉ, pas le prix d'aujourd'hui. Les Chenils ont été montés sur la
 *  courbe DÉDIÉE de l'enceinte (`28 × L^1,9` en or + `6 + L^1,45` en ferraille), avant que
 *  l'enceinte ne rejoigne la courbe des bâtiments (v0.998, ×32 plus chère). Rembourser au
 *  prix actuel aurait rendu ~6,9 M d'or pour un Chenil 32 payé ~424 k : on rend ce qui a
 *  été versé, la ferraille convertie au taux du retrait (`SCRAP_TO_GOLD`). Figé ici : ces
 *  constantes ne décrivent plus aucun prix du jeu. */
const RETIRED_KENNEL = { buildGold: 750, upBase: 28, upExp: 1.9, scrapBase: 6, scrapExp: 1.45 };

/** Ce que le Chenil de niveau `level` a coûté, en or (ferraille convertie). */
function kennelInvested(level: number): number {
  const k = RETIRED_KENNEL;
  let gold = k.buildGold;
  for (let l = 1; l < Math.max(1, Math.floor(level)); l++) {
    gold += Math.round(k.upBase * Math.pow(l, k.upExp));
    gold += Math.round(k.scrapBase + Math.pow(l, k.scrapExp)) * SCRAP_TO_GOLD;
  }
  return gold;
}

/** Retire le Chenil d'une enceinte et rend ce qu'il a coûté, en or. Idempotent : sans
 *  Chenil, la base revient INCHANGÉE (même référence) et le remboursement vaut zéro. */
export function retireKennel(base: BaseState): { base: BaseState; gold: number } {
  const k = base.defenses.find((d) => (d.typeId as string) === 'kennel');
  if (!k) return { base, gold: 0 };
  return {
    base: { ...base, defenses: base.defenses.filter((d) => d !== k) },
    gold: kennelInvested(k.level),
  };
}

/** Plafond DUR de la convalescence. Il doit rester très en deçà de l'intervalle entre
 *  deux sièges (24 h au plus serré) : un héros encore alité au siège suivant ne pourrait
 *  pas défendre, la défaite entraînerait la défaite. */
export const WOUND_MAX_MS = 8 * 3600_000;
/** Part maximale de l'intervalle entre deux sièges que la convalescence peut occuper. */
const WOUND_INTERVAL_SHARE = 0.4;

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

/** Puissance d'ASSAUT de l'armée, dans la même unité que la défense — ET À LA MÊME
 *  ÉCHELLE : à puissances égales, la base tient environ une fois sur deux
 *  (cf. `RAID.assaultEvenK`). */
export function assaultPower(raid: Raid): number {
  return Math.max(1, Math.round(combatPowerRaw(armyCombatant(raid)) * RAID.assaultEvenK));
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
/** ⚠️ TROIS CRANS, PLUS CINQ — parce que la TENUE EST BINAIRE (v0.902, mesuré).
 *
 *  Sur 96 configurations (4 niveaux × 3 états d'enceinte × héros ou non × 4 armées réelles,
 *  vivier complet) : **46 % des sièges tiennent 0-10 %, 52 % tiennent 90-100 %, et 2 % SEULEMENT
 *  tombent entre les deux.** Une fois l'armée connue, le siège est joué : `siegeHoldChance`
 *  ne fait varier que la CONDUITE du combat, pas la composition — et elle ne décide presque
 *  rien. Cinq bandes promettaient donc une nuance qui n'existe pas ; « Tu devrais tenir »
 *  contre « Tu tiens largement » désignait un écart que le moteur ne produit jamais.
 *
 *  Les seuils encadrent les DEUX modes réels et laissent un cran central pour les 2 % qui
 *  tombent vraiment entre les deux. ⚠️ Ils ne se calibrent pas : ce sont des tranches d'une
 *  probabilité, pas des seuils sur un proxy. */
export type SiegeOdds = 'perdu' | 'serre' | 'tenu';
export function siegeOdds(hold: number): SiegeOdds {
  if (hold < 0.35) return 'perdu';
  if (hold < 0.7) return 'serre';
  return 'tenu';
}

export const ODDS_LABEL: Record<SiegeOdds, string> = {
  perdu: 'Tu ne tiens pas',
  serre: 'Ça se joue',
  tenu: 'Tu tiens',
};

/** Les bandes où la base ne tient PLUS. Source unique : un écran qui redresserait la
 *  liste dériverait le jour où une bande change de nom. */
const ODDS_BAD: readonly SiegeOdds[] = ['perdu', 'serre'];
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

/** Les bandes, de la pire à la meilleure — l'ordre EST la comparaison.
 *  ⚠️ DÉRIVÉ de `ODDS_LABEL`, jamais réécrit : deux listes des mêmes crans finiraient par
 *  diverger, et celle-ci sert à dire « ça empire ». L'ordre des clés d'un objet littéral
 *  est celui de la déclaration, donc il suffit de déclarer `ODDS_LABEL` du pire au meilleur. */
const ODDS_ORDER = Object.keys(ODDS_LABEL) as readonly SiegeOdds[];

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
/** Le héros peut-il partir en donjon / boss / portail / Labyrinthe / expédition ? */
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
 *  (la Tour de guet par la clarté).
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
/** Soins d'urgence : on peut toujours le remettre sur pied tout de suite, EN OR, et cher.
 *  ∝ au repos qu'il reste → écourter la fin coûte peu, sauter toute la convalescence se
 *  paie (~½ journée de revenu pour 6 h). Il y a donc toujours une porte de sortie.
 *  ⚠️ `playerLevel` est REQUIS : un prix fixe serait ruineux au niveau 2 et gratuit au 100. */
export function healCost(remainingMs: number, playerLevel: number): number {
  const perHour = RAID.healGoldK * Math.pow(Math.max(1, playerLevel), RAID.healGoldExp);
  return Math.max(1, Math.ceil((remainingMs / 3600_000) * perHour));
}

/** 🤕 QUI PART À L’INFIRMERIE APRÈS UN SIÈGE (demandé : « les aventuriers blessés vont à
 *  l’infirmerie comme le héros »). Même règle que le héros : seule une DÉFAITE blesse —
 *  une victoire relève ceux qui étaient tombés, comme après une embuscade gagnée. */
export function siegeHurtIds(report: RaidReport): string[] {
  return report.held ? [] : [...(report.wounded ?? [])];
}

/** Repos qu’il reste à un aventurier (siège perdu OU convoi), 0 s’il est sur pied. */
export function advHurtMs(adv: Adventurer, now: number): number {
  return Math.max(0, (adv.hurtUntil ?? 0) - now);
}

/** Soins d’urgence d’un aventurier : AU MÊME TARIF que le héros (`healCost`, ∝ au repos
 *  restant et au niveau du joueur). Deux portes de sortie qui coûtent pareil se
 *  comprennent sans notice. 0 s’il n’y a rien à soigner. */
export function advHealCost(adv: Adventurer, now: number, playerLevel: number): number {
  const ms = advHurtMs(adv, now);
  return ms > 0 ? healCost(ms, playerLevel) : 0;
}

/** Les aventuriers à l’infirmerie, le plus long repos d’abord. */
export function woundedAdventurers(advs: readonly Adventurer[], now: number): Adventurer[] {
  return advs
    .filter((a) => advHurtMs(a, now) > 0)
    .sort((a, b) => advHurtMs(b, now) - advHurtMs(a, now));
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

  // ⚠️ L’ABRI NE DÉPEND PAS DU NIVEAU DU MUR — un créneau est un créneau. Mis en
  // facteur de `share`, il rouvrait la FALAISE que la v0.672 avait supprimée : une
  // enceinte à moitié montée cumulait demi-abri et demi-PV, et tombait à 3 % de tenue
  // (mesuré). Le NIVEAU du mur se paie en PV — il tient plus longtemps, donc il abrite
  // plus longtemps. C’est déjà toute la boucle « il fait gagner du temps ».
  const cover = defenseLevel(defenses, 'wall') > 0 ? RAID.wallArmorK : 0;
  // ⚠️ UNE SEULE EXPRESSION POUR TOUT LE MONDE. `armor` et `post` disent la même
  // chose de deux façons : les laisser se poser séparément, c’est la divergence assurée
  // (un poste sans abri, ou l’inverse) — le défaut que ce projet documente partout.
  // L’abri se DÉDUIT donc du poste, ici et nulle part ailleurs.
  const shelter = (post: SiegePost) => (post === 'rampart' ? cover : 0);

  const n = turretCount(tl);
  if (n > 0) {
    const dmg =
      (refOff * RAID.turretDmgK * n * share(tl) * defenseEfficiency(defenses, 'turret')) / n;
    const pv = Math.max(1, Math.round(ref.pv * RAID.turretPvK * share(tl)));
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
        // ⚠️ De la MAÇONNERIE : elle ne descend jamais dans la cour, et **elle ne pivote
        // pas** — d’où son SECTEUR, qui borne son arc de tir. Un archer, lui, marche le
        // long du chemin de ronde : il n’en a pas.
        post: 'rampart',
        armor: shelter('rampart'),
        sector: i,
        // Elle couvre le terrain ENTIER : c’est ce qui lui donne le premier tir, et donc
        // sa puissance. Elle ne l’a pas parce qu’on la lui a écrite.
        range: BATTLE.fieldDepth,
      });
    }
  }

  for (const a of guard) {
    // Un tireur monte sur le rempart — c’est de là qu’il sert. Un homme d’armes attend
    // dans la cour : sur un chemin de ronde il ne ferait rien, et la brèche est son
    // moment. L’abri suit le poste, donc le tireur est couvert et pas lui.
    const post: SiegePost = a.ranged ? 'rampart' : 'yard';
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
      post,
      armor: shelter(post),
      // Un arc porte moins loin qu’une baliste ; un homme d’armes ne porte pas du tout.
      range: a.ranged ? Math.round(BATTLE.fieldDepth * RAID.archerRangeShare) : 0,
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
      // Il tient la brèche : il est donc DANS la cour, et le rempart ne le couvre pas.
      post: 'yard',
      armor: shelter('yard'),
      range: 0,
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
 * ⚠️ ET LA PLACE VAUT EXACTEMENT LA FORCE DU CORPS — `bulk = unitMult`, pas davantage.
 * Le front délivre `wallFront / bulk` corps à `perBody` chacun, donc l'invariance
 * demande `bulk ∝ perBody` ; et `perBody ∝ unitMult`, puisque `silhouetteDmgMult`
 * juste au-dessus annule déjà la dépendance en `√effectif`.
 *
 * ⚠️ L'exposant `2−g` qui vivait ici **DOUBLE-COMPTAIT cette annulation** : les deux
 * corrections ont été écrites dans la MÊME version (v0.761), et la seconde a été dérivée
 * en oubliant la première. Conséquence, une horde logeait `unitMult^-1,5` corps au mur
 * pour `unitMult` de dégâts chacun, soit `unitMult^-0,5` de puissance de frappe —
 * elle cognait **plus fort** à masse égale. Mesuré (v0.788, 400 sièges × 4 niveaux) : les
 * bêtes emportaient **61 à 72 %** du rempart contre **37 à 51 %** aux bandits, un écart
 * relatif de **39 à 50 %**. Un balayage confirme le point d'invariance — l'écart tombe à
 * **8 %** à l'exposant 1 et **remonte des deux côtés** (24 % à 0,85, 48 % à 1,5).
 */
/** Le pan sur lequel l’armée aborde l’enceinte. ⚠️ Source UNIQUE : le moteur y range ses
 *  groupes, le rejeu y dessine ses corps — deux lectures de la graine auraient montré
 *  une armée à un endroit pendant que les balistes tiraient vers un autre. */
export function raidFirstSector(seed: number): number {
  return Math.abs(Math.trunc(seed)) % BATTLE.sectors;
}

export function siegeAttackers(raid: Raid): SiegeUnit[] {
  const out: SiegeUnit[] = [];
  // ⚠️ L’ARMÉE SE MASSE — elle marche, elle n’encercle pas. Le front est donc
  // CONTIGU, et sa largeur est DÉRIVÉE : **un groupe par pan**. Rien à inventer, et une
  // grosse armée (plus de groupes) s’étale donc davantage — elle affronte plus de
  // balistes, ce qui la borne toute seule.
  // Le pan d’entrée est tiré sur la graine du raid : deux assauts ne tombent pas au
  // même endroit, mais un raid donné se rejoue à l’identique.
  const first = raidFirstSector(raid.seed);
  for (const [gi, g] of raid.groups.entries()) {
    const ref = refFighter(Math.max(1, g.level));
    const um = g.unitMult ?? 1;
    const mm = g.massMult ?? 1;
    const champPv = g.champion ? RAID.championPvMult : 1;
    const champDmg = g.champion ? RAID.championDmgMult : 1;
    const th = g.threat ?? 1;
    const unitPv = (offensePerRound(ref) * RAID.foePvK * champPv * um * th) / mm;
    const eff = g.count / mm;
    const tir = groupKind(g) === 'ranged' ? RAID.foeRangedDmgK : 1;
    const groupDmg =
      ref.pv *
      RAID.foeDmgK *
      tir *
      champDmg *
      silhouetteDmgMult(um) *
      th *
      Math.pow(eff, RAID.groupDmgExp);
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
        bulk: um,
        sector: (first + gi) % BATTLE.sectors,
        // ⚠️ TOUT LE MONDE PART DU BORD DU TERRAIN. C’est la traversée qui donne leur
        // valeur aux balistes — sans elle, l’armée frappait dès le premier tour et la
        // portée n’aurait rien voulu dire.
        dist: BATTLE.fieldDepth,
        // Un homme d’armes ne porte qu’au contact ; un tireur doit entrer dans sa propre
        // portée, plus courte que celle du rempart (il vise vers le haut).
        range: groupKind(g) === 'ranged' ? Math.round(BATTLE.fieldDepth * RAID.foeRangeShare) : 0,
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
 * LA GARNISON, en unités : les champions PRÉSENTS, avec leur équipement.
 *
 * ⚠️ Un champion est un TIREUR quand l'agilité domine sa forme, un homme d'armes
 * sinon : la même lecture que sa fiche affiche déjà (`advShapeLabel`).
 */
/**
 * ⚠️ UNE UNITÉ DE SIÈGE N'A QUE DES PV ET DES DÉGÂTS — ni réduction, ni régénération.
 * Les canaux de l'équipement qui ne sont pas de la frappe doivent donc être REPLIÉS dessus.
 *
 * ⚠️ La RÉDUCTION se replie en PV EFFECTIFS (`pv / (1 − r)`) — la conversion que le
 * projet emploie déjà pour calibrer la morsure des routes. Encaisser 20 % de moins,
 * c'est durer 25 % de plus : les deux se valent tant qu'on ne regarde que la durée.
 *
 * ⚠️ La RÉGÉNÉRATION, elle, n'a PAS d'équivalent : elle rendait des PV entre deux
 * GROUPES, or le moteur ne les affronte plus l'un après l'autre.
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

/** Ce qu'un champion tire de ses pièces au rempart — la définition de la route. */
function pairEffects(gear: readonly AdvGear[] | undefined): AggregatedEffects {
  return unitEffects(gear);
}

/**
 * ⚔️ LA PUISSANCE DE CHAQUE AVENTURIER, calculée COMME CELLE DU HÉROS (v0.804).
 *
 * ⚠️ Le même arbitre que tout le jeu — `combatPower` (√ offense × survie) sur le
 * combattant `playerWithGear` que `escortCombatant` construit déjà — jamais une somme de
 * stats recopiée : une étiquette qui refait le calcul à sa façon finit par diverger.
 *
 * ⚠️ L'ÉQUIPEMENT COMPTÉ EST CELUI QUE LA BATAILLE RETIENT (`escortGear`) : une pièce
 * trop rare ou hors lignée ne gonfle pas le chiffre — exactement ce que `guardUnits`
 * applique.
 *
 * ⚠️ SANS le multiplicateur de siège (`RAID.guardSiegeK`) : c’est un avantage de
 * TERRAIN, comme la part du héros derrière ses murs, pas une propriété de l’homme. Le
 * chiffre se compare donc à celui du héros, sur la même échelle.
 */
export function adventurerPowers(advs: Adventurer[], ctx?: EscortKit): Map<string, number> {
  const pairs = ctx ? escortGear(advs, ctx) : new Map<string, AdvGear[]>();
  return new Map(
    advs.map((a) => [
      a.id,
      combatPower(escortCombatant([a], a.name, pairEffects(pairs.get(a.id)))),
    ]),
  );
}

/**
 * ⚔️🗡️ LA PUISSANCE D'UN SEUL AVENTURIER, UNE PIÈCE CANDIDATE EN MAIN — pour le
 * sélecteur d'équipement de la Guilde, qui compare N candidates à un emplacement sans
 * recalculer la puissance de TOUT le vivier à chaque ligne.
 *
 * ⚠️ `adventurerPowers` fait un `.map()` sur `advs` ENTIER : appelée une fois par
 * candidate dans un sélecteur qui en liste plusieurs dizaines, elle recalcule le combat
 * de chaque AUTRE aventurier autant de fois qu'il y a de lignes — du travail refait pour
 * un nombre qu'on jette aussitôt. Ici, seul LE PORTEUR passe par `combatPower`.
 *
 * ⚠️ L'ÉQUIPEMENT RESTE ATTRIBUÉ SUR LE VIVIER COMPLET (`escortGear(modified, ctx)`) :
 * c'est lui qui sait si une pièce est déjà portée ailleurs. Seul le calcul de COMBAT
 * final se limite à `target`.
 *
 * ⚠️ UNE PIÈCE QUE `target` NE PEUT PAS PORTER rend la MÊME puissance qu'avant : `wornGear`
 * (appelé par `escortGear`) filtre toute assignation qui échoue `canWearAdvGear`, donc
 * l'affectation candidate n'atteint jamais le combat — pas besoin de revalider ici.
 */
export function adventurerGearPower(
  advs: Adventurer[],
  target: Adventurer,
  slot: AdvGearSlot,
  gearId: string | undefined,
  ctx: EscortKit,
): number {
  const modified = advs.map((a) =>
    a.id === target.id ? { ...a, gear: { ...(a.gear ?? {}), [slot]: gearId } } : a,
  );
  const pairs = escortGear(modified, ctx);
  return combatPower(escortCombatant([target], target.name, pairEffects(pairs.get(target.id))));
}

/**
 * 🗡️ CONFIER AU MIEUX — l'ÉQUIPEMENT : le gain est
 * lu par l'arbitre du jeu (`combatPowerRaw`), attribution par GAIN DÉCROISSANT sur tout le
 * vivier (le meilleur porteur pour chaque pièce, pas la première pièce venue pour le
 * premier aventurier), une pièce par porteur, et rien d'interdit (lignée, rareté de la
 * classe — `canWearAdvGear`).
 *
 * ⚠️ ON REPART DE ZÉRO, PAS DE CE QUI EST DÉJÀ PORTÉ : ce plan REMPLACE les choix faits à
 * la main plutôt que les compléter — l'écran le dit avant le
 * geste. Un emplacement à la fois (`ADV_GEAR_SLOTS`) : pour chaque paire (aventurier
 * libre, pièce permise de CET emplacement) on mesure le gain marginal par-dessus ce qui
 * est déjà retenu pour les emplacements PRÉCÉDENTS, puis on prend les paires par gain
 * décroissant tant qu'aventurier et pièce sont encore libres.
 */
export function autoAdvGear(
  advs: Adventurer[],
  ctx: EscortKit,
): Map<string, Partial<Record<AdvGearSlot, string>>> {
  const out = new Map<string, Partial<Record<AdvGearSlot, string>>>(advs.map((a) => [a.id, {}]));
  const base = (a: Adventurer, gear: AdvGear[]) =>
    combatPowerRaw(escortCombatant([a], a.name, pairEffects(gear)));
  const taken = new Set<string>();
  const chosen = new Map<string, AdvGear[]>(advs.map((a) => [a.id, []]));
  for (const slot of ADV_GEAR_SLOTS) {
    const cands: { a: Adventurer; g: AdvGear; gain: number }[] = [];
    for (const a of advs) {
      const cur = base(a, chosen.get(a.id)!);
      for (const g of ctx.advGear)
        if (g.slot === slot && canWearAdvGear(a, g))
          cands.push({ a, g, gain: base(a, [...chosen.get(a.id)!, g]) - cur });
    }
    cands.sort((x, y) => y.gain - x.gain);
    const served = new Set<string>();
    for (const c of cands) {
      if (c.gain <= 0 || served.has(c.a.id) || taken.has(c.g.id)) continue;
      served.add(c.a.id);
      taken.add(c.g.id);
      chosen.get(c.a.id)!.push(c.g);
      out.get(c.a.id)![slot] = c.g.id;
    }
  }
  return out;
}

/**
 * 🏰 QUI MONTE AU REMPART — les `cap` plus puissants parmi ceux qu'on lui passe.
 *
 * ⚠️ **LE PLAFOND DU PANTHÉON S'APPLIQUE ICI, plus sur la personne** (`engageCap`). Il
 * disait « ce champion est en collection, il n'existe pas pour le jeu » ; il dit désormais
 * « on n'en engage que N à la fois ». Toute la collection reste donc utilisable, et c'est
 * la composition du jour — qui est parti en convoi, qui relève de blessure — qui décide de
 * qui tient les murs.
 *
 * ⚠️ **AUTOMATIQUE, et ça ne peut pas être autrement** : un siège se résout pendant que le
 * joueur est absent. Les plus forts disponibles montent donc d'eux-mêmes, ce qui donne tout
 * son poids à l'arbitrage que l'écran annonce déjà (« ce qui est dehors ») : envoyer ses
 * meilleurs en mission AFFAIBLIT le rempart, au lieu de laisser des remplaçants inertes.
 *
 * ⚠️ Tri **stable** : à puissance égale on départage par id, sinon l'ordre du vivier
 * déciderait de qui défend — donc recruter quelqu'un changerait la garnison en silence.
 */
export function rampartGuard(advs: Adventurer[], cap: number, ctx?: EscortKit): Adventurer[] {
  const n = Math.max(0, Math.floor(cap));
  if (advs.length <= n) return advs;
  const pow = adventurerPowers(advs, ctx);
  return [...advs]
    .sort((x, y) => (pow.get(y.id) ?? 0) - (pow.get(x.id) ?? 0) || x.id.localeCompare(y.id))
    .slice(0, n);
}

/**
 * Les défenseurs, en unités de bataille.
 *
 * ⚠️ **LA COUPE EST FAITE ICI**, au point de passage unique du combat, et `cap` est
 * REQUIS : un paramètre qu'on peut oublier finit par l'être — c'est exactement le défaut
 * de la v0.751, où la moitié de la garnison ne se battait pas parce qu'un seul des deux
 * appelants passait l'argument.
 */
export function guardUnits(
  playerLevel: number,
  advs: Adventurer[],
  cap: number,
  ctx?: EscortKit,
): GuardUnit[] {
  void playerLevel;
  const retenus = rampartGuard(advs, cap, ctx);
  const pairs = ctx ? escortGear(retenus, ctx) : new Map<string, AdvGear[]>();
  return retenus.map((a) => {
    // ⚠️ `escortCombatant` NU, et on replie ensuite : garder la réduction sur le
    // `Combatant` la perdrait au passage en unité (une unité n'a que PV et dégâts).
    const one = escortCombatant([a], a.name);
    const st = advStats(a);
    const fx = pairEffects(pairs.get(a.id));
    const f = foldBonus(
      one.pv * RAID.guardSiegeK,
      one.damage * (one.strikes ?? 1) * RAID.guardSiegeK,
      fx,
    );
    return {
      id: a.id,
      name: a.name,
      // L’emoji de SA classe : c’est lui qu’on reconnaît au rempart pendant le rejeu.
      emoji: advTitle(a)?.emoji ?? '⚔️',
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
    seed: raid.seed,
    defenders: def
      .filter((d) => d.origin !== 'turret')
      .map((d) => ({
        id: d.id,
        name: d.name,
        emoji: d.emoji,
        kind: d.kind === 'ranged' ? 'ranged' : 'melee',
        maxPv: d.maxPv,
      })),
    // ⚠️ Seuls les AVENTURIERS : une baliste à terre n’a pas de lit, et le héros a sa
    // propre convalescence (`base.wound`).
    wounded: r.wounded.filter((id) => def.find((d) => d.id === id)?.origin === 'adventurer'),
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

/** Coût en OR pour monter une structure de l'enceinte d'un niveau.
 *
 *  ⚠️ **LA MÊME COURBE QUE LES BÂTIMENTS DE LA COUR** (v0.998, décision de l'utilisateur :
 *  « que les bâtiments aient le même coût d'or »). L'enceinte avait sa courbe dédiée
 *  (coefficient ÷50) PLUS un second verrou en ferraille ; la ferraille est retirée, et
 *  plutôt qu'une seconde courbe à tenir d'accord avec la première, l'enceinte rejoint le
 *  puits d'or commun. `BUILD.upBase` a été re-mesuré avec les 11 structures (cf. là-bas).
 *  ⚠️ Toute retouche de coût se fait donc à UN seul endroit : `buildingUpgradeCost`. */
export function defenseUpgradeCost(level: number): number {
  return buildingUpgradeCost(level);
}

/** 🔧 Coût de remise en service, en OR : une PART d'un cran de ce niveau
 *  (`RAID.repairShare`). ⚠️ Dérivé de la courbe commune, jamais une seconde échelle :
 *  réparer suit ce que la structure a coûté, sans jamais s'en approcher. */
export function repairCost(level: number): number {
  return Math.max(1, Math.round(buildingUpgradeCost(level) * RAID.repairShare));
}

/** 🔩 → 🪙 : taux de conversion de la ferraille, devise RETIRÉE (v0.998). Sert UNE fois :
 *  la réserve d'un compte, et les rapports ou convois déposés avant le retrait.
 *  ⚠️ Calé sur l'ÉPAVE, sa seule source : ce qu'une épave rend aujourd'hui en or pour
 *  chaque unité de ferraille qu'elle rendait (mesuré au niveau 30, distance moyenne) —
 *  on rembourse ce que la ferraille AURAIT rapporté, ni plus ni moins. Mesuré : 36 🪙 par
 *  🔩 au niveau 10, 104 au 30, 177 au 60 ; on retient la valeur du milieu de partie. */
export const SCRAP_TO_GOLD = 100;

/** 🔧 DURÉE D’UNE RÉPARATION (v0.802, demandée par l’utilisateur : « mettre des délais aux
 *  réparations »).
 *
 *  Selon le NIVEAU de la structure, et RIEN d’autre — 30 min de base + 3 min par niveau,
 *  soit ~2 h au niveau 29 et 5 h 30 au niveau 100.
 *
 *  ⚠️ **AUCUN BÂTIMENT NE LA RACCOURCIT** (demandé : « fais disparaître la Fonderie »).
 *  Elle avait ce second métier, et la simplification le lui avait fait léguer à
 *  l’Entrepôt ; le faire disparaître AVEC elle est la seule lecture où la Fonderie s’en
 *  va vraiment. La sortie de secours reste ouverte, et elle est PAYANTE :
 *  `rushRepairCost` termine les travaux en or, au tarif des soins d’urgence.
 *  ⚠️ Toujours bien plus courte que l’intervalle entre deux sièges (24 h au minimum) : une
 *  base encore en travaux au siège suivant serait la spirale que tout ce système évite. */
export function repairMsFor(level: number): number {
  return RAID.repairBaseMs + RAID.repairPerLevelMs * Math.max(1, level);
}

/** Des travaux sont-ils en cours sur cette structure ? */
export function isRepairing(d: DefenseStructure | undefined, now: number): boolean {
  return !!d?.damaged && d.repairUntil != null && now < d.repairUntil;
}

/** Le gel se lève quand plus rien n’est endommagé. Le gel n'est pas une punition à part :
 *  c'est la conséquence d'une base cassée. Les deux voies GRATUITES restent ouvertes (une
 *  séance de sport, ou l'échéance des 24 h, cf. `advanceBase`). */
function withRepaired(base: BaseState, defenses: DefenseStructure[]): BaseState {
  return { ...base, defenses, freeze: defenses.some((d) => d.damaged) ? base.freeze : null };
}

/** LANCE les travaux : l'or est payé maintenant (côté store), la structure reste
 *  endommagée jusqu’à `repairUntil`. Sans effet sur une structure intacte ou déjà en
 *  travaux — relancer ne doit ni repousser l’échéance ni faire payer deux fois. */
export function startRepair(base: BaseState, id: DefenseId, now: number): BaseState {
  const defenses = base.defenses.map((d) =>
    d.typeId === id && d.damaged && d.repairUntil == null
      ? { ...d, repairUntil: now + repairMsFor(d.level) }
      : d,
  );
  return { ...base, defenses };
}

/** CONCLUT les travaux arrivés à échéance — pur et idempotent, appelé à chaque tick.
 *  ⚠️ Rend le MÊME objet quand rien n’a changé : le tick s’en sert pour ne pas écrire à vide. */
export function settleRepairs(base: BaseState, now: number): BaseState {
  if (!base.defenses.some((d) => d.repairUntil != null && now >= d.repairUntil)) return base;
  const defenses = base.defenses.map((d) =>
    d.repairUntil != null && now >= d.repairUntil ? { typeId: d.typeId, level: d.level } : d,
  );
  return withRepaired(base, defenses);
}

/** TERMINE tout de suite des travaux en cours (le store fait payer `rushRepairCost`). */
export function finishRepairNow(base: BaseState, id: DefenseId): BaseState {
  const defenses = base.defenses.map((d) =>
    d.typeId === id && d.repairUntil != null ? { typeId: d.typeId, level: d.level } : d,
  );
  return withRepaired(base, defenses);
}

/** Or pour finir des travaux maintenant, ∝ au temps restant — AU TARIF DES SOINS
 *  D'URGENCE DU HÉROS (`healCost`) : deux portes de sortie qui coûtent pareil se
 *  comprennent sans notice. Écourter la fin est une bricole, sauter le chantier se paie. */
export function rushRepairCost(remainingMs: number, playerLevel: number): number {
  return healCost(remainingMs, playerLevel);
}

/** Or nécessaire pour LANCER toutes les réparations en attente — c'est le chiffre à
 *  afficher au joueur quand sa production est gelée. Les travaux déjà lancés sont payés. */
export function totalRepairCost(base: BaseState): number {
  return base.defenses
    .filter((d) => d.damaged && d.repairUntil == null)
    .reduce((s, d) => s + repairCost(d.level), 0);
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
      // ⚠️ Le préavis a de nouveau un MAXIMUM (10 h au niveau 100, v0.802) : passé ce
      // niveau, on le dit au lieu d’annoncer « 10 h → 10 h ».
      const la = scoutLeadMs(l, ctx.intervalMs);
      const lb = scoutLeadMs(next, ctx.intervalMs);
      const lead =
        lb > la ? `préavis ${fmtSpan(la)} → ${fmtSpan(lb)}` : `préavis au maximum (${fmtSpan(la)})`;
      if (cn > cl)
        return `Niveau ${next} : ${lead}, et un cran de renseignement en plus (${cl} → ${cn}/${RAID.clarityMax})`;
      if (cl >= RAID.clarityMax)
        return `Niveau ${next} : ${lead}. Renseignement déjà au maximum (${cl}/${RAID.clarityMax}).`;
      const step = nextStepLevel(clarte, l);
      return step
        ? `Niveau ${next} : ${lead}. Le cran de renseignement suivant est au niveau ${step}.`
        : `Niveau ${next} : ${lead}`;
    }
    case 'infirmary': {
      const wa = woundMsFor(l, ctx.intervalMs);
      const wb = woundMsFor(next, ctx.intervalMs);
      if (wb < wa)
        return `Niveau ${next} : convalescence du héros et des champions ${fmtSpan(wa)} → ${fmtSpan(wb)}`;
      // ⚠️ IL NE RESTE QU’UN SEUL MOTIF possible, et c’est un progrès : la structure
      // n’a PLUS de plancher (queue asymptotique, « aucun niveau mort »), donc la
      // convalescence raccourcit à CHAQUE niveau. Si elle ne bouge pas, c’est
      // forcément le RYTHME des sièges qui borde — et il ne faut surtout pas dire
      // « plancher » à sa place : ça enverrait le joueur réduire son entraînement
      // pour un gain imaginaire. La branche « déjà à son plancher » est retirée
      // plutôt que laissée morte : un chemin inatteignable finit par mentir.
      const tete = `La convalescence du héros (${fmtSpan(wa)}) est bornée par ton rythme de sièges (elle ne dépasse jamais ${Math.round(WOUND_INTERVAL_SHARE * 100)} % de l’intervalle) — la monter n’y changera rien.`;
      return `Niveau ${next} : ${tete}`;
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
  items: Omit<Item, 'id'>[];
}

/** Dépouille des corps. La richesse vient du NIVEAU DU CORPS (il était dangereux), pas
 *  du niveau du chantier — le danger paie, comme partout ailleurs dans le jeu.
 *  ⚠️ La rareté d'un objet reste centrée sur `min(niveau du corps, niveau du joueur)` :
 *  un raid à +15 donne PLUS d'objets, jamais des raretés hors de ta ligue.
 *  ⚠️ Aucun équipement de CHAMPION ici (v0.1011) : il ne vient QUE du tirage. Les corps ne
 *  laissent que des objets du héros. */
export function lootCorpses(
  corpses: Corpse[],
  faction: RaidFaction,
  playerLevel: number,
  seed: number,
): CorpseLoot {
  const rng = mulberry32((seed ^ 0x2545f491) >>> 0 || 1);
  const loot: CorpseLoot = { gold: 0, summonStones: 0, keys: 0, items: [] };
  // ⚠️ ACCUMULATION EN FLOTTANT, arrondie UNE SEULE fois a la fin. Arrondir la part de
  // CHAQUE corps biaise vers le haut des que cette part passe sous l unite — ce qui
  // arrive precisement depuis la dilution de masse (0,6 pierre ou 1,7 ferraille par
  // corps). Mesure : +11 % de ferraille et +25 % de pierres, assez pour faire tomber
  // la regle « la ferraille est plus dure a obtenir que l or ».
  let gold = 0;
  let stones = 0;
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
    // 🔩 ⚠️ AUCUNE FERRAILLE SUR LES ASSAILLANTS (v0.856 ; décision de l'utilisateur).
    // La v0.702 en faisait tomber des bandits et des morts-vivants, au motif que les
    // réparations dépassaient les rentrées à 21 séances par semaine. Ce motif a cessé de
    // tenir : les réparations sont bon marché et prennent du temps (v0.802). Mesuré, les
    // sièges ne pesaient que 5 à 9 % du débit, et sans eux la règle « la ferraille est
    // plus dure à obtenir que l'or » tient à tous les niveaux (1,2 à 1,9). La ferraille
    // vient de ce qu'on va CHERCHER (épaves), de la Fonderie et du recyclage.

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
  loot.gold = Math.round(gold);
  loot.summonStones = Math.round(stones);
  // Les clés se tirent sur le CUMUL des chances : une vague de bêtes en rend une de
  // temps en temps, jamais une par corps.
  loot.keys = Math.floor(keyOdds) + (rng() < keyOdds % 1 ? 1 : 0);
  return loot;
}

// ── Cycle de vie (le tick) ──

export function emptyBase(seed: number, now: number): BaseState {
  return {
    defenses: [],
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

/** Les sièges sont-ils actifs ? OPT-IN à trois conditions : le niveau
 *  `RAID.minRaidLevel`, une enceinte réellement PRÊTE (`RAID.enableShare`) et un joueur
 *  qui s’entraîne.
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
  return (
    playerLevel >= RAID.minRaidLevel &&
    defenseReadiness(base.defenses, playerLevel) >= RAID.enableShare &&
    activeDays7 >= 1
  );
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

  // Les travaux arrivés à échéance se concluent (et relancent la production si plus rien
  // n’est endommagé).
  const repaired = settleRepairs(b, now);
  if (repaired !== b) {
    b = repaired;
    changed = true;
  }

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

  // Les corps sont emportés.
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
    // 🕳️ ET LE DÉBORDEMENT S'EFFACE AVEC. Tant que les sièges sont éteints, aucune armée
    // ne vient : celle qui est sortie n'a trouvé personne à assiéger et s'est dispersée.
    // ⚠️ Sans ça, un joueur qui bâtit sa PREMIÈRE enceinte encaisserait un siège renforcé
    // ×1,3 d'entrée, pour des failles qu'il a laissées mûrir à une époque où il ne pouvait
    // même pas être attaqué — la punition d'une absence qui n'était pas une faute, donc la
    // règle 1 à l'envers. C'est le même motif que le report d'échéance juste au-dessus.
    if (b.overflow) {
      b = { ...b, overflow: null };
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
    // 🕳️ Le débordement en attente est CONSOMMÉ ici : l'armée qui se met en marche est
    // celle de la faille, et le marquage s'efface. C'est ce qui garantit qu'il ne
    // s'applique qu'UNE fois — sans ça, chaque siège suivant serait renforcé à vie.
    const raid = rollRaid(seed, ctx.playerLevel, b.nextRaidAt, lead, b.overflow);
    b = { ...b, raid, overflow: null };
    detected = raid;
    changed = true;
  }

  const dueRaid = b.raid && now >= b.raid.arrivesAt ? b.raid : null;
  return { base: b, changed, detected, dueRaid };
}

/**
 * 🕳️ Marque la base d'un ou plusieurs DÉBORDEMENTS de faille.
 *
 * ⚠️ **ON GARDE LE PLUS RÉCENT, ET UN SEUL.** Deux raisons, et elles tiennent ensemble.
 * (1) **Le renfort ne s'empile pas** : six failles oubliées pendant une absence ne font
 * pas ×1,3⁶ — mesuré, à ×2 un siège est déjà imbattable, donc empiler reviendrait à
 * punir l'absence en boucle, ce que la règle 1 des sièges interdit. (2) **Le plus
 * récent** parce que c'est la menace qui est encore à la porte : celle d'il y a trois
 * jours a déjà fait son chemin, et elle a laissé sa mine de mana en consolation.
 *
 * ⚠️ **AUCUN SIÈGE DE PLUS, AUCUN SIÈGE PLUS TÔT** : le rythme reste celui du sport
 * (`raidIntervalMs`), mesuré et porteur de la règle 1. Un débordement ne CRÉE pas un
 * siège — il QUALIFIE le prochain. Dériver le rythme des débordements donnerait des
 * SALVES : les failles mûrissent groupées (le plancher en spawne plusieurs d'un coup), on
 * aurait six sièges en deux jours puis cinq jours de calme, et plus rien de ce qui a été
 * calibré ne tiendrait.
 *
 * Rend la MÊME référence si rien à marquer — l'appelant n'écrit pas à vide.
 */
export function markOverflow(base: BaseState, overflows: readonly RiftOverflow[]): BaseState {
  if (!overflows.length) return base;
  let best = base.overflow ?? null;
  for (const o of overflows) if (!best || o.at > best.at) best = o;
  return best === (base.overflow ?? null) ? base : { ...base, overflow: best };
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
): { base: BaseState; damage: RaidDamage; corpses: Corpse[] } {
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
    // ⚠️ RENDUS À L’APPELANT, plus laissés à fouiller : le butin des corps est crédité
    // À LA RÉSOLUTION et figure dans le rapport de bataille (demandé). Le champ qu’on
    // pose sur la base juste au-dessus ne sert plus qu’à MONTRER la bataille quelques
    // heures. `lootCorpses` reste la seule autorité sur leur valeur.
    corpses,
  };
}
