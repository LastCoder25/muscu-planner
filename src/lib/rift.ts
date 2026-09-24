/**
 * ⚡ FAILLES — étape 1 : ce QU'EST une faille, et ce qu'elle rapporte.
 *
 * ⚠️ **BRANCHÉ DEPUIS LA v0.932** — l'en-tête a longtemps annoncé le contraire, ce qui avait
 * cessé d'être vrai : les failles apparaissent sur la carte, l'incursion se joue, le
 * débordement marque la base, le harcèlement et l'interception existent. Même découpage que
 * `siegeBattle.ts` (v0.754) et que les camps : la lib d'abord, pure et mesurée, le câblage
 * ensuite. Cf. `docs/superpowers/specs/2026-09-19-failles-design.md`.
 *
 * ## Le modèle, en une phrase
 *
 * Une faille **ENGENDRE** des monstres, de plus en plus nombreux à mesure qu'elle
 * vieillit ; au bout de 7 jours elle **déborde** (son armée marche sur la base), puis elle
 * **s'effondre** en laissant une **mine de mana résiduel**. Y entrer est **gratuit** — ce
 * qu'on paie, c'est le temps et l'exclusivité du héros.
 *
 * ## ⚠️ POURQUOI IL N'Y A AUCUN ÉTAT À PERSISTER — c'est la propriété qui rend tout simple
 *
 * En tuer **n'affaiblit pas** l'armée à venir (décision de l'utilisateur : « même si le
 * héros en tue il y en aura toujours autant voire plus à la sortie »). Il n'y a donc
 * **rien à retenir** : l'effectif est une **fonction pure de l'ÂGE** de la faille. Elle
 * rentre dans le modèle des POI de la carte, qui sont **sans mémoire** (`createMap` /
 * `advanceWorld` sont déterministes à partir d'un seed et d'horodatages), et une incursion
 * redevient une **session** — on entre, on ferme ou on ressort, et la faille s'est
 * reformée. C'était le seul endroit où la feature s'écartait du modèle existant.
 *
 * ⚠️ **LA RÉGÉNÉRATION SE COMPTE EN JOURS, PAS PENDANT L'INCURSION** : la porte du boss
 * s'ouvre quand les monstres sont nettoyés, donc une faille qui repeuple en temps de
 * combat rendrait le boss **inatteignable**. À l'échelle d'une session, l'effectif est
 * FIGÉ à ce que l'âge dit ; il ne recroît qu'entre deux visites.
 */

import { fuseUnits, skirmishXpShares, type SkirmishUnit } from './skirmish';
import {
  caravanWages,
  missionXpFor,
  partyAllies,
  refEscortUnits,
  type PartyHero,
  type EscortKit,
} from './caravan';
import { interpolate } from './proceduralContent';
import {
  EXPE,
  riftFactionOf,
  riftMaturityAt,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
  type SealDrop,
} from './expedition';
import { characterRank } from './characterRank';
// ⚠️ `party.ts` porte la MISSION DE GROUPE (envoi, voyage, rapport) et la doctrine des
// graines : le pronostic ne rejoue jamais la bataille qui aura lieu. Aucun cycle — ce
// module-là n'importe pas les failles.
import { partyFightSeed, partyForecastSeed } from './party';
import { type Adventurer } from './adventurers';
import {
  offenseOf,
  seedOf,
  simulateCombat,
  type CombatEvent,
  type CombatResult,
  survivalOf,
  type Combatant,
} from './combat';
import {
  factionRoster,
  groupCombatant,
  rollRaid,
  siegeAttackers,
  type Raid,
  type RaidReport,
  type RaidFaction,
  type RiftOverflow,
} from './raid';

export const RIFT = {
  /** ⚠️ LA MATURATION N'EST PAS DÉFINIE ICI : c'est `EXPE.lifespanMs.rift`, parce que la
   *  CARTE possède déjà les durées de vie de ses POI et que la faille vit exactement sa
   *  maturation (à 7 jours elle déborde, donc elle « expire »). Deux constantes pour la
   *  même durée auraient divergé au premier réglage — `riftOverflowAt` la lit là-bas. */

  /** Effectif à maturité. ⚠️ UN SEUL AXE DE FORCE : c'est le `level` du POI (donc sa
   *  distance, règle v0.683) qui dit la difficulté ; le nombre dit l'ÂGE. Un second axe
   *  « taille » façon `CAMP_SIZES` demanderait sa propre calibration mesurée. */
  maxFoes: 12,

  /** ⚠️ LE PLANCHER N'EST PAS UN DÉTAIL. Sans lui, une faille du premier jour est vide et
   *  « la faille est l'usine de mana » sonne faux au début : c'est un **jour mort**,
   *  l'analogue direct de la règle « aucun niveau mort du 0 au 100 » (v0.731) et du
   *  `poiFloor` de la carte. Part de l'effectif maximal présente dès l'apparition. */
  popFloor: 0.18,

  /** ⚠️ COURBE **ACCÉLÉRÉE** (exposant > 1), décidée : le gros du butin tombe dans les
   *  deux derniers jours, donc attendre devient franchement tentant ET franchement
   *  dangereux. Une courbe LINÉAIRE rendrait chaque jour équivalent — donc aucune
   *  décision. C'est la langue que le projet parle déjà : `travelFactor` est
   *  super-linéaire (`TRAVEL_EXP` 1,4) pour que s'éloigner paie plus que
   *  proportionnellement. ⚠️ Valeur à ÉPROUVER avec le plancher : c'est ce couple qui
   *  règle le débit de mana, donc le rythme du gacha. */
  popExp: 2,

  /** Mana par monstre tué. ⚠️ **ÉCHELLE PROVISOIRE, ET ELLE NE PEUT PAS ÊTRE AUTRE CHOSE
   *  POUR L'INSTANT** : les coûts du gacha n'existent pas encore (les taux se calibrent
   *  après, quand le débit est connu). Ce qui est vrai dès maintenant et testé, c'est la
   *  FORME de la courbe et les RATIOS — pas ces deux nombres. */
  manaFoeBase: 2,
  manaFoePerLevel: 0.4,

  /** 💠 MANA D'UN SIÈGE DE LA BASE (v0.1108, demandé : « pousser à défendre et à tuer un
   *  max de monstres, même si la défaite est actée »). Une armée ENTIÈREMENT abattue paie
   *  comme ce nombre de monstres de faille de son niveau ; une armée à moitié abattue, la
   *  moitié. ⚠️ Calé SOUS une faille refermée (`manaFoesPaid` × prime du gardien = 5,25) :
   *  un siège arrive sans qu'on le choisisse (1 par jour au mieux), il ne doit pas
   *  détrôner les failles comme source de mana. */
  siegeManaFoes: 2,

  /** Ce que le BOSS ajoute, en part du mana des monstres — la prime de fermeture. */
  bossManaShare: 0.5,

  /** 💠 MANA FIXE PAR FAILLE (v0.1047, choix de l'utilisateur) : une faille paie comme si l'on
   *  y abattait CE nombre de monstres, quel que soit son âge. ⚠️ AVANT, le mana suivait
   *  l'effectif (2 → 12 monstres en 7 jours) et ATTENDRE payait : fermer une faille par jour
   *  rendait plus que d'en fermer deux (117 contre 83 💠/j au niveau 30). L'idée voulue est
   *  l'inverse — fermer VITE, sinon la faille devient plus dure (l'effectif monte toujours)
   *  pour aucun gain : c'est ce qui crée l'URGENCE. Le mana devient donc proportionnel au
   *  nombre de failles fermées. Calé à ~1,7 fois la valeur de départ (2 monstres) pour
   *  qu'un joueur qui ferme DEUX failles par jour retrouve le débit de référence d'avant
   *  (~un tirage par jour) : mesuré 30/62/92 💠/j à 1/2/3 fermetures au niveau 30 avec la
   *  valeur de départ seule — un tirage tous les 4 jours, trop peu. */
  manaFoesPaid: 3.5,

  /** 🔱 Maturité (0..1) AVANT laquelle le gardien laisse un SECOND sceau d'ascension :
   *  refermer tôt paie double (v0.1047 ; avant, c'était l'attente qui payait). */
  secondSealAt: 0.5,

  /** ⚠️ CE QUE LA MINE RÉSIDUELLE REND N'EST PAS DÉFINI ICI NON PLUS, et c'est un défaut
   *  que j'avais introduit : elle avait DEUX échelles — une part de ce que fermer paie
   *  (ici) et `harvestYield('mana_mine')` (la table de TOUTES les récoltes, partagée par le
   *  héros, les caravanes et les camps). Deux nombres pour la même chose finissent par se
   *  contredire. **La table des récoltes est la seule source** ; ce qui reste vrai et
   *  TESTÉ, c'est le RAPPORT : fermer une faille doit payer nettement mieux que l'ignorer
   *  et ramasser sa mine — sinon le robinet du gacha serait alimenté par la PASSIVITÉ. */

  /** ⚠️ LE RENFORT DE MENACE DE L'ARMÉE QUI SORT N'EST PAS DÉFINI ICI : c'est
   *  `RAID.riftThreat` (×1,3), avec la table de mesure qui l'a fixé. C'est une constante
   *  de SIÈGE, mesurée sur des sièges, et `groupCombatant` doit pouvoir la lire sans
   *  cycle d'import — `rift.ts` importe déjà `raid.ts`, jamais l'inverse. */
} as const;

/** Ce qu'une faille EST — dérivé, jamais stocké. */
export interface RiftSpec {
  faction: RaidFaction;
}

/** Une faille vue par ce module : de quoi calculer son âge et son butin. ⚠️ STRUCTUREL,
 *  pas `Poi` — l'étape 1 ne touche pas à `PoiType` (l'ajouter casse quatre tables
 *  exhaustives et la carte, ce qui est le travail de l'étape 2). */
export interface RiftLike {
  id: string;
  level: number;
  spawnedAt: number;
}

/**
 * Faction d'une faille — **DÉRIVÉE de son id**, jamais stockée.
 *
 * ⚠️ GÉNÉRATEUR SÉPARÉ (constante XOR propre) : c'est le patron exact de `campSpecOf`.
 * Le spawn ne tire rien de plus, donc la carte reste identique au bit près, et une faille
 * d'une carte déjà sauvegardée en aura une **sans migration ni normalisation**.
 */
export function riftSpecOf(rift: Pick<RiftLike, 'id'>): RiftSpec {
  // ⚠️ DÉLÈGUE : la dérivation vit dans `expedition.ts`, que la CARTE peut appeler pour
  // donner sa bannière à l'armée qui sort d'une faille — ce module-ci importe celui-là,
  // jamais l'inverse. Deux hachages du même id finiraient par donner deux factions.
  return { faction: riftFactionOf(rift.id) };
}

/** L'instant où la faille déborde — sa durée de vie sur la carte, qui EST sa maturation. */
export function riftOverflowAt(rift: Pick<RiftLike, 'spawnedAt'>): number {
  return rift.spawnedAt + EXPE.lifespanMs.rift;
}

/** Maturité 0..1, bornée aux deux bouts (une faille ne mûrit pas au-delà de 1). */
export function riftMaturity(rift: Pick<RiftLike, 'spawnedAt'>, now: number): number {
  // ⚠️ DÉLÈGUE : la courbe vit dans `expedition.ts`, parce que le rayon d'irradiation en a
  // besoin et que ce module-ci importe celui-là (jamais l'inverse). Deux implémentations
  // de « quel âge a-t-elle ? » finiraient par répondre différemment.
  return riftMaturityAt(rift.spawnedAt, now);
}

/** A-t-elle débordé ? (elle s'effondre alors, en laissant une mine — cf. `residualMineOf`) */
export function riftOverflowed(rift: Pick<RiftLike, 'spawnedAt'>, now: number): boolean {
  return now >= riftOverflowAt(rift);
}

/**
 * Combien de monstres la faille contient À CET INSTANT.
 *
 * `plancher + (max − plancher) × maturité^exposant`, arrondi.
 *
 * ⚠️ **PLAFONNÉE À MATURITÉ** : `riftMaturity` borne à 1, donc une faille oubliée ne
 * gonfle pas indéfiniment — elle déborde, puis elle n'existe plus. Sans ce plafond, une
 * absence longue produirait une faille imbattable, et « on ne perd jamais parce qu'on n'a
 * pas ouvert l'app » tomberait.
 *
 * ⚠️ **PAS DE `Math.max(1, …)` ICI, ET C'EST VOLONTAIRE.** Le minimum est atteint à
 * maturité 0 et vaut `round(maxFoes × popFloor)` : un garde à 1 ne pourrait donc JAMAIS
 * mordre — il donnerait la confiance sans rien couvrir (le piège des v0.751 et v0.753,
 * mesuré ici par une mutation SURVIVANTE). La vraie garantie — « une faille n'est jamais
 * vide, sinon la porte du boss s'ouvre gratuitement » — porte sur les CONSTANTES, et c'est
 * un test qui la vérifie : `maxFoes × popFloor` doit rester ≥ 1.
 */
export function riftPopulation(rift: Pick<RiftLike, 'spawnedAt'>, now: number): number {
  const floor = RIFT.maxFoes * RIFT.popFloor;
  const grown = floor + (RIFT.maxFoes - floor) * Math.pow(riftMaturity(rift, now), RIFT.popExp);
  return Math.round(grown);
}

/** Mana rendu par N monstres tués dans une faille de ce niveau. */
export function riftMana(foes: number, level: number): number {
  const per = RIFT.manaFoeBase + Math.max(1, level) * RIFT.manaFoePerLevel;
  return Math.round(Math.max(0, foes) * per);
}

/**
 * 💠 Le mana d'un SIÈGE de la base : la part de l'armée RÉELLEMENT abattue, au PRORATA des
 * PV de chaque corps (un champion pèse plus qu'un loup), × `RIFT.siegeManaFoes` monstres de
 * faille du niveau de l'armée.
 *
 * ⚠️ **PAYÉ MÊME EN CAS DE DÉFAITE** (demandé) : ce qui compte, c'est ce qu'on a abattu.
 * Un groupe à moitié tué rapporte sa moitié — on ne lit donc PAS `report.defeated`, qui ne
 * compte que les groupes tombés en entier. Les morts viennent du journal de la bataille
 * (`down`), rattachées aux assaillants que `siegeAttackers` reconstruit à l'identique :
 * rien n'est re-simulé.
 * ⚠️ Au prorata des PV et non du nombre de corps : une horde de bêtes compte 2,5× plus de
 * corps qu'une bande de brigands pour la même menace (`countMult × unitMult ≈ 1`) —
 * payer au corps ferait des bêtes la faction la plus rentable.
 */
export function siegeMana(raid: Raid, report: Pick<RaidReport, 'log'>): number {
  const att = siegeAttackers(raid);
  const total = att.reduce((a, u) => a + u.pv, 0);
  if (total <= 0) return 0;
  const down = new Set(report.log.filter((e) => e.kind === 'down').map((e) => e.to));
  const slain = att.reduce((a, u) => a + (down.has(u.id) ? u.pv : 0), 0);
  return riftMana(RIFT.siegeManaFoes * (slain / total), raid.level);
}

/**
 * Ce que rapporte une incursion qui va au bout : un mana FIXE (`manaFoesPaid`) + la prime
 * du gardien — **le même à tout âge** (v0.1047). Attendre ne rapporte plus rien.
 *
 * ⚠️ C'est la référence de l'invariant économique : fermer doit rester nettement plus
 * payant que laisser déborder et ramasser la mine.
 */
export function riftClearMana(rift: Pick<RiftLike, 'level'>): number {
  const foes = riftMana(RIFT.manaFoesPaid, rift.level);
  return Math.round(foes * (1 + RIFT.bossManaShare));
}

/**
 * 🔱 Les sceaux d'ascension que laisse le GARDIEN d'une faille refermée (v0.1014) : sceaux de
 * CHAMPION, au rang de la faille. ⚠️ **2 si elle est refermée AVANT `RIFT.secondSealAt` de sa
 * maturité, 1 après** (v0.1047, inversé) : comme le mana, le sceau récompense la RAPIDITÉ —
 * avant, le second sceau payait l'attente, à contre-courant de l'urgence voulue.
 * ⚠️ `null` si la faille n'est pas refermée : c'est le gardien qui les porte, et une incursion
 * ratée ne l'abat pas.
 */
export function riftSeals(rift: RiftLike, now: number, cleared: boolean): SealDrop | null {
  if (!cleared) return null;
  const rank = characterRank(Math.max(1, rift.level)).rankIndex;
  return { kind: 'champion', rank, n: riftMaturity(rift, now) < RIFT.secondSealAt ? 2 : 1 };
}

/**
 * 🕳️ Ce qu'une faille qui déborde ENVOIE sur la base — le descripteur de son armée.
 *
 * ⚠️ **PAS DE MAGNITUDE ICI**, exactement comme `residualMineOf` : la force de l'armée
 * vit dans `rollRaid` (faction imposée + `RAID.riftThreat`), la seule autorité sur ce
 * qu'est une armée. Deux échelles pour la même chose finissent par se contredire — c'est
 * le défaut que la mine résiduelle a déjà eu.
 *
 * ⚠️ **DATÉ DU DÉBORDEMENT, pas de `now`** : c'est ce qui rend le marquage idempotent et
 * comparable entre plusieurs failles (`markOverflow` garde le plus récent). Rejouer le
 * passage ne peut donc pas antidater ni dupliquer la menace.
 */
export function riftOverflowOf(rift: RiftLike): RiftOverflow {
  return {
    faction: riftSpecOf(rift).faction,
    level: rift.level,
    at: riftOverflowAt(rift),
  };
}

/** La mine de mana résiduel laissée par une faille qui a débordé — le DESCRIPTEUR du POI.
 *  ⚠️ Pas de magnitude : son rendement vient de `harvestYield('mana_mine', level, tf)`,
 *  comme toute récolte. Le NIVEAU est ce qui le décide, et il est hérité de la faille. */
export interface ResidualMine {
  level: number;
  spawnedAt: number;
  expiresAt: number;
}

/**
 * ⛏️ Ce que laisse une faille qui a **débordé** — et seulement celle-là.
 *
 * ⚠️ **ASYMÉTRIE VOULUE** : une faille **fermée** au boss ne laisse RIEN (on en a déjà
 * tout tiré) ; seule une faille **ignorée**, qui a craché son armée et s'est épuisée,
 * laisse suinter du mana. C'est cette asymétrie qui garde la consolation à sa place.
 *
 * ✅ **AUCUNE MÉCANIQUE NEUVE** : à l'étape 2 ce sera un type de RÉCOLTE de plus
 * (`HARVEST_TYPES`, à côté de la mine d'or, du puits, du sanctuaire, des archives et de
 * l'épave), donc « aucun combat, aucun échec » (v0.658) — et `harvestYield` est **déjà
 * partagé** par le héros, les caravanes et les camps. Donc récoltable **par convoi**, donc
 * **sans énergie** : c'est ce qui ouvre le mana au joueur qui ne combat pas (v0.725).
 *
 * Rend `null` tant que la faille n'a pas débordé.
 */
export function residualMineOf(rift: RiftLike, now: number): ResidualMine | null {
  if (!riftOverflowed(rift, now)) return null;
  const at = riftOverflowAt(rift);
  return {
    level: rift.level,
    spawnedAt: at,
    expiresAt: at + EXPE.lifespanMs.mana_mine,
  };
}

/**
 * La porte du boss s'ouvre quand les monstres sont nettoyés.
 *
 * ⚠️ Nommé plutôt que recopié : deux écrans écriraient chacun `tués >= présents` et l'un
 * des deux finirait par compter autre chose. Et cf. l'avertissement en tête de fichier —
 * l'effectif est FIGÉ pendant l'incursion, sinon cette porte ne s'ouvrirait jamais.
 */
export function riftDoorOpen(killed: number, population: number): boolean {
  return killed >= population;
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚔️ L'INCURSION — ce qu'on affronte dedans, et comment le parcours se joue.
//
// ⚠️ C'est la COMPOSITION de deux modèles qui existent déjà, pas un troisième :
//   • le GROUPE des camps (héros et/ou champions fondus en un combattant) ;
//   • l'ATTRITION du Labyrinthe (PV reportés d'un combat au suivant, vol de vie atténué).
// Un camp est UN combat fondu ; une faille en est une SUITE, et c'est l'attrition qui la
// rend tendue. Le boss attend derrière la porte, qui s'ouvre quand tout est nettoyé.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚔️ CALIBRATION DE L'INTERCEPTION — même forme que  et que les camps : une
 * force ABSOLUE, exprimée en tours de l'offense du groupe de RÉFÉRENCE du niveau du lieu.
 *
 * ⚠️ Volontairement PLUS LÉGÈRE qu'un camp de même taille : on ne détruit pas l'armée, on
 * rompt sa colonne — et c'est une action DÉFENSIVE, qu'on doit pouvoir se permettre après
 * avoir déjà manqué la faille. Valeurs MESURÉES (cf. l'entrée de CLAUDE.md).
 */
const RIFT_INTERCEPT = {
  /** MESURÉ (60 combats par case, aventuriers au niveau du lieu) — % de victoire de la
   *  taille de groupe : 1 → 0 % partout · 2 → 0-12 % · **3 (la référence) → 58-100 %** ·
   *  4 → 100 % · 6 → 100 %. Même gradient que les camps, un cran plus clément : c'est une
   *  action DÉFENSIVE de rattrapage, pas une source de butin. */
  pvTurns: 5,
  dmgPctPv: 0.09,
} as const;

export const RIFT_RUN = {
  /** Vol de vie atténué — MÊME raison qu'au Labyrinthe (`LABY_RUN.lifesteal`) : à pleine
   *  valeur le groupe remonterait au max entre deux monstres et l'attrition ne compterait
   *  plus. Le seul frein d'une suite de combats, c'est de ne pas se soigner. */
  lifesteal: 0.3,

  /** On souffle entre deux monstres, en part des PV max. ⚠️ Volontairement MAIGRE devant
   *  les 9 à 12 % des salles sûres du Labyrinthe : là-bas on CHOISIT son chemin et on peut
   *  se retirer, ici on traverse une zone ouverte. */
  regen: 0.07,

  /** ⚠️ FORCE D'UN MONSTRE : dimensionnée sur le groupe de RÉFÉRENCE du niveau du lieu
   *  (`refEscortUnits`), JAMAIS sur le groupe envoyé — sinon « combien j'en envoie » ne
   *  voudrait plus rien dire. C'est le **danger ABSOLU**, la règle des camps et de la route.
   *
   *  ⚠️ ET LA FORCE D'UN MONSTRE EST FIXE : c'est leur NOMBRE qui monte avec l'âge. Faire
   *  varier la force pour garder un total constant serait un contresens — une faille jeune
   *  doit être FACILE, pas « aussi dure avec moins d'ennemis ».
   *
   *  ⚠️ VALEURS MESURÉES (`riftCalibration.test`) : un groupe de référence du niveau du lieu
   *  nettoie une faille MÛRE (12 monstres + boss) à 78-88 % selon le niveau, une faille du
   *  premier jour à ~100 %, et un groupe amputé d'un membre tombe à 26-49 %. */
  foePvTurns: 0.9,
  foeDmgPctPv: 0.065,

  /** Le boss vaut N monstres — même idiome que `CAMP.championWeight`. */
  bossWeight: 4,

  /**
   * ⚠️ MONTÉE EN PUISSANCE DANS LA FAILLE — et ce n'est PAS un ornement, c'est ce qui
   * empêche le modèle d'être un MUR.
   *
   * **Mesuré sans elle** : une suite de N monstres IDENTIQUES avec un repos fixe est un
   * système à **SEUIL**. La variable qui décide de tout est `dégâts encaissés par combat −
   * repos` : si elle est négative on tient indéfiniment, si elle est positive on meurt —
   * le nombre de combats ne fait que rendre le verdict plus certain. Au niveau 12, la force
   * ×0,9 donnait **99 %** de nettoyage et ×1,1 **0 %** : de 99 à 0 pour ±10 % de force.
   * C'est la falaise exacte que la v0.672 a supprimée sur les sièges (« une falaise, pas
   * une pente »), et aucun réglage des deux constantes ne pouvait la corriger.
   *
   * ⚠️ **LA PROFONDEUR EST ABSOLUE, pas relative à l'effectif courant** : `i / (maxFoes−1)`.
   * Une faille jeune ne contient donc que ses PREMIERS monstres, les faibles — « on n'entre
   * pas loin » — au lieu de contenir un échantillon complet de la rampe. C'est ce qui donne
   * à l'âge une vraie pente au lieu d'un seuil, et ça se lit sans notice.
   */
  rampFrom: 0.55,
  rampTo: 1.45,
} as const;

/** Profondeur ABSOLUE du i-ème monstre dans une faille (0 à l'entrée → 1 au fond).
 *  ⚠️ Rapportée à `maxFoes`, jamais à l'effectif courant (cf. `rampFrom`). */
export function riftDepth(index: number): number {
  return RIFT.maxFoes > 1 ? Math.min(1, Math.max(0, index / (RIFT.maxFoes - 1))) : 1;
}

/** Multiplicateur de force à cette profondeur. */
export function riftRamp(depth: number): number {
  return RIFT_RUN.rampFrom + (RIFT_RUN.rampTo - RIFT_RUN.rampFrom) * depth;
}

/** Ce qu'une incursion a produit. */
export interface RiftRun {
  /** La porte franchie ET le boss abattu : la faille est fermée. */
  cleared: boolean;
  /** Monstres abattus (hors boss) — c'est eux qui paient le mana, même en cas d'échec. */
  killed: number;
  population: number;
  bossDown: boolean;
  finalPv: number;
  journal: string[];
  /** PV du groupe à l'entrée — le dénominateur de `pvTrail`. */
  maxPv: number;
  /**
   * PV du groupe APRÈS chaque combat livré (régénération comprise), dans l'ordre :
   * les monstres, puis le gardien si la porte s'est ouverte. Un combat perdu y inscrit 0.
   *
   * ⚠️ **IL EXISTE POUR LE REJEU, et il ne décide RIEN** (`riftStage.ts`) : sans lui, la
   * mise en scène devrait inventer une courbe d'attrition — c'est-à-dire mentir sur la
   * seule tension que la faille produise. 13 nombres contre les centaines d'événements
   * d'un log complet : c'est ce qui permet de le persister dans la boîte 📬, qui garde
   * 30 messages.
   */
  pvTrail: number[];
  /** Le duel contre le gardien, résumé pour le rejeu — absent si la porte ne s'est pas
   *  ouverte. Même statut que `pvTrail` : il INSCRIT le combat, il ne décide rien. */
  boss?: RiftBossReplay;
}

/** Un temps du duel contre le gardien : ce que le groupe a infligé, ce qu'il a encaissé,
 *  et les PV des deux camps à la fin de ce temps (LUS dans le log, jamais recalculés). */
export interface RiftBossStep {
  dealt: number;
  taken: number;
  /** Un coup critique du groupe dans ce temps. */
  crit: boolean;
  /** Tours joués par chaque camp dans ce temps. ⚠️ Un tour = UN camp qui agit : sans ces
   *  comptes, la scène ferait frapper les deux à chaque temps, et une attaque esquivée
   *  (0 dégât) serait indiscernable d'un camp qui n'a pas joué. */
  groupTurns: number;
  bossTurns: number;
  pv: number;
  bossPv: number;
}
export interface RiftBossReplay {
  maxPv: number;
  steps: RiftBossStep[];
}

/** Au plus autant de temps dans le duel rejoué : ~10 tours d'un gardien se regardent,
 *  40 se subissent. On REGROUPE des tours consécutifs, on n'en jette aucun. */
export const RIFT_BOSS_STEPS = 8;

/**
 * Résume le log d'un combat en au plus `max` temps.
 *
 * ⚠️ **AUCUN DÉGÂT N'EST PERDU** : les tours sont regroupés par paquets consécutifs, la
 * somme des dégâts d'un paquet est la somme de ses tours, et ses PV de fin sont ceux du
 * dernier événement du paquet. La fin du duel rejoué est donc EXACTEMENT celle du combat
 * (un test le vérifie) — la mise en scène peut accélérer, jamais arrondir l'issue.
 */
export function bossReplaySteps(log: readonly CombatEvent[], max: number): RiftBossStep[] {
  // Un tour = les événements d'un même `round` (une frappe multiple en fait plusieurs).
  const turns: RiftBossStep[] = [];
  let cur = -1;
  for (const e of log) {
    if (e.round !== cur) {
      cur = e.round;
      turns.push({
        dealt: 0,
        taken: 0,
        crit: false,
        groupTurns: e.who === 'player' ? 1 : 0,
        bossTurns: e.who === 'player' ? 0 : 1,
        pv: e.playerPv,
        bossPv: e.monsterPv,
      });
    }
    const t = turns[turns.length - 1]!;
    if (e.who === 'player') t.dealt += e.damage;
    else t.taken += e.damage;
    if (e.who === 'player' && e.type === 'crit') t.crit = true;
    t.pv = e.playerPv;
    t.bossPv = e.monsterPv;
  }
  const n = Math.max(1, Math.floor(max));
  if (turns.length <= n) return turns;
  const out: RiftBossStep[] = [];
  for (let i = 0; i < n; i++) {
    const chunk = turns.slice(
      Math.floor((i * turns.length) / n),
      Math.floor(((i + 1) * turns.length) / n),
    );
    const last = chunk[chunk.length - 1]!;
    out.push({
      dealt: chunk.reduce((s, t) => s + t.dealt, 0),
      taken: chunk.reduce((s, t) => s + t.taken, 0),
      crit: chunk.some((t) => t.crit),
      groupTurns: chunk.reduce((s, t) => s + t.groupTurns, 0),
      bossTurns: chunk.reduce((s, t) => s + t.bossTurns, 0),
      pv: last.pv,
      bossPv: last.bossPv,
    });
  }
  return out;
}

/**
 * ⚠️ RENFORT PAR NIVEAU — table **MESURÉE**, patron de `LABY_CONTENT_BOOST` (v0.851) et de
 * `PROC_DUNGEON_BOOST`. Bisection du multiplicateur de force qui amène le nettoyage d'une
 * faille MÛRE à ~0,70, avec le groupe de référence du niveau du lieu (90 incursions par
 * itération, 200 pour la vérification).
 *
 * ⚠️ **SANS ELLE LA COURBE N'EST PAS PLATE** : à renfort 1 partout, mesuré, une faille mûre
 * se nettoie à **0,22 au niveau 12, 0,99 au 26, 0,53 au 45, 0,60 au 70**. L'écart de force
 * nécessaire n'est que de ±16 %, mais la sensibilité vaut ~5 points de taux par pourcent de
 * force : un petit écart suffit à faire d'un niveau un mur et d'un autre une formalité.
 *
 * ⚠️ **ET CETTE BISECTION N'ÉTAIT PAS FIABLE AVANT LA RAMPE.** Sur le modèle sans montée en
 * puissance, deux mesures du MÊME réglage se contredisaient (0,33 et 0,71 au niveau 12) —
 * c'était la falaise, pas le bruit. Une bisection sur une falaise ne mesure rien.
 *
 * La forme reflète celle de l'escorte de référence, dont la puissance ne croît pas
 * linéairement — le même phénomène que les autres tables du projet.
 *
 * ⚠️ **RE-BISECTÉE À LA BASCULE EN CHAMPIONS (v0.952)**, sur le même harnais et la même
 * cible. L'étalon ayant changé de nature, la table entière se déplace : le renfort passe
 * de 0,92-1,16 à **0,95-1,18**, et surtout sa FORME s’inverse — la bosse ne vit plus aux
 * niveaux 20-30 mais aux DEUX BOUTS (12-20 et 60-100), parce que la référence en champions
 * a très peu de critique en début de partie et le sature en fin. Mesuré après : mûre
 * **0,69 à 0,78**, jeune **0,95 à 0,99**, groupe amputé **0,00 à 0,05**.
 *
 * ⚠️ **NIVEAU 12 RE-BISECTÉ (v0.996)** : les champions n'ont plus de familier, compensé en
 * stats (`CHAMPION_SOLO`). La compensation est exacte en puissance, pas dans l'attrition
 * d'une faille au niveau 12 (mûre 0,90 avec 1,13) : 1,13 → **1,19** rend 0,72. Les autres
 * niveaux n'ont pas bougé (mesuré : mûre 0,68-0,77 de 20 à 100).
 *
 * ⚠️ **TABLE COMPLÈTE, NIVEAU 1 À 100 (v0.1029)** : la table n'avait qu'un point tous les 8 à
 * 15 niveaux, à partir du niveau 12 — l'interpolation laissait des TROUS que le test (5
 * niveaux seulement) ne voyait pas. Mesuré avant, 3 champions de même niveau contre une
 * faille mûre : **0 % en Bronze ★1-★3, 36 % au niveau 11, 20 % au niveau 21**. La cause :
 * l'étalon change par PALIERS aux bords de rang (9, 12, 21, 41, 51, 61, 71), donc le renfort
 * saute aussi — il faut un point de CHAQUE côté d'un bord, sinon l'interpolation traverse
 * la marche. Re-bisecté sur 46 niveaux (cible 0,70) : mûre **0,63 à 0,77** partout.
 *
 * ⚠️ **NIVEAUX 10-11 ET 51-60 RE-BISECTÉS (refonte équipement, étape 7)** : l'escorte de
 * référence choisit son équipement à la puissance affichée, qui compte désormais le vol de vie
 * pour sa valeur réelle (le soin par tour) ; elle en prend davantage, et c'est au niveau 11 et
 * au rang 51-60 qu'il pèse le plus. Mesuré avant : mûre **0,92** au niveau 11, **0,84** au
 * 51 et au 60. Après : **0,67 à 0,73**. ⚠️ Le niveau 10 a désormais son propre point : sans
 * lui, l'interpolation 9 → 11 le laissait à 0,51 (une falaise entre deux paliers d'étalon).
 */
const RIFT_RELIEF: [number, number][] = [
  [1, 0.96],
  [2, 0.94],
  [8, 0.93],
  [9, 1.11],
  [10, 1.12],
  [11, 1.2],
  [12, 1.19],
  [20, 1.2],
  [21, 0.96],
  [40, 0.96],
  [41, 0.99],
  [50, 1.0],
  [51, 1.11],
  [60, 1.12],
  [61, 1.11],
  [70, 1.11],
  [71, 1.13],
  [90, 1.15],
  [100, 1.14],
];

/** Force d'UN monstre de faille — absolue, calée sur le groupe de référence du niveau. */
function riftFoeBase(level: number): { pv: number; damage: number } {
  const ref = fuseUnits(refEscortUnits(level), 'Référence');
  const k = interpolate(RIFT_RELIEF, Math.max(1, level));
  return {
    pv: Math.max(1, Math.round(Math.max(1, offenseOf(ref)) * RIFT_RUN.foePvTurns * k)),
    damage: Math.max(1, Math.round(survivalOf(ref) * 100 * RIFT_RUN.foeDmgPctPv * k)),
  };
}

/**
 * Qui l'on croise à cette place — nom et emoji, sans la moindre statistique.
 *
 * ⚠️ **SOURCE UNIQUE, et c'est tout son intérêt** : `riftFoe` (le COMBAT) l'appelle, et la
 * mise en scène (`riftStage.ts`) aussi. Une seconde règle de sélection ferait afficher au
 * rejeu un monstre que le combat n'a pas livré — le défaut exact que `troopOf` évite côté
 * camps, et celui qu'un `POI_EMO` recopié avait déjà produit (v0.853).
 */
export function riftFoeIdentity(
  faction: RaidFaction,
  index: number,
  isBoss: boolean,
): { name: string; emoji: string } {
  const roster = factionRoster(faction);
  const pick = roster[index % roster.length]!;
  return { name: isBoss ? `${pick.name} (gardien)` : pick.name, emoji: pick.emoji };
}

/** Un monstre de la faille (ou son boss), nommé dans le roster de sa faction. */
export function riftFoe(level: number, faction: RaidFaction, index: number, isBoss: boolean) {
  const base = riftFoeBase(level);
  const id = riftFoeIdentity(faction, index, isBoss);
  // ⚠️ LA RAMPE NE S'APPLIQUE PAS AU GARDIEN : sa force, c'est son POIDS. Mesuré en la lui
  // appliquant aussi (il se retrouvait à 5,8× un monstre de base) : il décidait de TOUT, et
  // une faille jeune tombait de 0,97 à 0,15 de nettoyage — le nombre de monstres redevenait
  // secondaire, donc l'âge aussi. Deux multiplicateurs sur le même adversaire, c'est un de
  // trop.
  const ramp = isBoss ? 1 : riftRamp(riftDepth(index));
  const w = isBoss ? RIFT_RUN.bossWeight : 1;
  return {
    name: id.name,
    emoji: id.emoji,
    pv: Math.max(1, Math.round(base.pv * w * ramp)),
    damage: Math.max(1, Math.round(base.damage * ramp * (isBoss ? 1 + (w - 1) * 0.3 : 1))),
    crit: 0.08,
    dodge: 0.05,
    initiative: isBoss ? 14 : 10,
  };
}

/** Le groupe tel qu'il entre dans un combat : PV reportés, vol de vie atténué. */
function riftFighter(party: Combatant, pv: number): Combatant {
  return { ...party, pv, lifesteal: (party.lifesteal ?? 0) * RIFT_RUN.lifesteal };
}

/**
 * Une incursion COMPLÈTE, sans retraite : tous les monstres présents, puis le gardien.
 *
 * ⚠️ L'EFFECTIF EST LU UNE FOIS, AU DÉBUT (`riftPopulation`) : la faille ne repeuple pas
 * pendant l'incursion, sinon la porte ne s'ouvrirait jamais (cf. l'avertissement en tête de
 * fichier). C'est ce qui rend une session déterministe à partir d'un seul instantané.
 *
 * ⚠️ `killed` compte les monstres tombés MÊME si le groupe meurt ensuite : c'est ce qui rend
 * vraie la règle « une incursion ratée paie quand même son mana ».
 */
export function simulateIncursion(
  party: Combatant,
  rift: RiftLike,
  now: number,
  seed: number,
): RiftRun {
  const population = riftPopulation(rift, now);
  const faction = riftSpecOf(rift).faction;
  const maxPv = party.pv;
  let pv = maxPv;
  let killed = 0;
  const journal: string[] = [];
  // ⚠️ AUCUN CALCUL N'EN DÉPEND : on ne fait qu'inscrire ce que le combat a déjà décidé
  // (un test de non-régression l'exige — même issue, mêmes abattus, mêmes PV finaux).
  const pvTrail: number[] = [];
  let shield: number | undefined; // 🔰 une barrière de départ par incursion

  for (let i = 0; i < population; i++) {
    const foe = riftFoe(rift.level, faction, i, false);
    const rs = (seed * 131 + i * 7919) >>> 0 || 1;
    const res = simulateCombat(riftFighter(party, pv), foe, {
      seed: rs,
      goldOnWin: 0,
      startPlayerPv: pv,
      ...(shield !== undefined ? { shield } : {}),
    });
    shield = res.shield ?? shield;
    if (res.log.length) pv = res.log.at(-1)!.playerPv;
    if (!res.win) {
      journal.push(`💀 ${foe.emoji} ${foe.name} a eu le dernier mot.`);
      pvTrail.push(0);
      return {
        cleared: false,
        killed,
        population,
        bossDown: false,
        finalPv: 0,
        journal,
        maxPv,
        pvTrail,
      };
    }
    killed++;
    journal.push(`⚔️ ${foe.emoji} ${foe.name} abattu.`);
    pv = Math.min(maxPv, pv + Math.round(maxPv * RIFT_RUN.regen));
    pvTrail.push(pv);
  }

  journal.push('🚪 La porte du gardien s’ouvre.');
  const boss = riftFoe(rift.level, faction, population, true);
  const res = simulateCombat(riftFighter(party, pv), boss, {
    seed: (seed * 7919 + 13) >>> 0 || 1,
    goldOnWin: 0,
    startPlayerPv: pv,
    ...(shield !== undefined ? { shield } : {}),
  });
  if (res.log.length) pv = res.log.at(-1)!.playerPv;
  journal.push(
    res.win ? `🏆 ${boss.name} tombe — la faille se referme.` : `💀 ${boss.name} tient.`,
  );
  pvTrail.push(res.win ? Math.max(0, pv) : 0);
  const bossReplay: RiftBossReplay = {
    maxPv: boss.pv,
    steps: bossReplaySteps(res.log, RIFT_BOSS_STEPS),
  };
  return {
    boss: bossReplay,
    cleared: res.win,
    killed,
    population,
    bossDown: res.win,
    finalPv: res.win ? Math.max(0, pv) : 0,
    journal,
    maxPv,
    pvTrail,
  };
}

/** Le mana d'une incursion : les monstres abattus, + le boss SI la faille est fermée. */
export function incursionMana(run: RiftRun, level: number): number {
  // Refermée : le mana fixe de la faille, gardien compris.
  if (run.cleared) return riftClearMana({ level });
  // Ratée : la PART de ce mana fixe qu'on a abattue (sans la prime du gardien). ⚠️ Une part,
  // pas un compte de monstres : payée au monstre, une faille mûre (plus peuplée) rapporterait
  // plus en échouant qu'une jeune en réussissant — l'attente reviendrait par la bande.
  const part = run.population > 0 ? Math.min(1, run.killed / run.population) : 0;
  return riftMana(RIFT.manaFoesPaid * part, level);
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚔️ L'INCURSION JOUABLE — on y envoie un GROUPE, comme sur un camp
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce qu'on envoie dans une faille.
 *
 * ⚠️ MÊME FORME que l'entrée d'un camp, à la `spec` près : toutes deux satisfont
 * `PartyVoyage`, donc `startParty` construit le voyage des deux sans savoir lequel.
 * ⚠️ `now` est REQUIS : l'effectif d'une faille est une fonction pure de son ÂGE, il faut
 * donc dire à quel instant on entre. Il est lu UNE fois, au départ (la faille ne repeuple
 * pas pendant la session — sinon la porte du gardien serait inatteignable).
 */
export interface IncursionInput {
  poi: Poi;
  escort: Adventurer[];
  road: EscortKit;
  hero: PartyHero | null;
  seed: number;
  now: number;
  /** ⚠️ REQUIS : la référence de la prime de rattrapage (`catchUpMult`) — c'est le plafond
   *  que `grantAdvXp` applique, jamais le niveau du joueur. */
  pantheonLevel: number;
}

/**
 * Les corps d'une faille en UNITÉS — pour l'XP seulement (qui a abattu quoi).
 *
 * ⚠️ DÉRIVÉS de `riftFoe`, la fonction que le COMBAT emploie : une seconde construction
 * paierait une XP qui ne correspond pas aux monstres réellement affrontés (le défaut que
 * `troopOf` évite côté camps). Le GARDIEN est le dernier de la liste, et il porte son poids
 * (`bossWeight`) comme dans le combat.
 * ⚠️ Leur `level` est celui de la FAILLE : c'est lui qui dit ce qu'un abattu vaut
 * (`trialXpBase`), exactement comme le niveau d'un corps de camp.
 */
export function incursionBodies(rift: RiftLike, now: number): SkirmishUnit[] {
  const population = riftPopulation(rift, now);
  const faction = riftSpecOf(rift).faction;
  const bodies: SkirmishUnit[] = [];
  for (let i = 0; i <= population; i++) {
    const isBoss = i === population;
    const f = riftFoe(rift.level, faction, i, isBoss);
    bodies.push({
      id: isBoss ? 'rift_boss' : `rift_${i}`,
      name: f.name,
      emoji: f.emoji,
      level: rift.level,
      combatant: f,
    });
  }
  return bodies;
}

/** Les corps tombés : les `killed` premiers, plus le gardien si la faille est refermée.
 *  ⚠️ L'ORDRE EST LE MÊME que celui du combat (`simulateIncursion` descend la rampe de
 *  profondeur dans l'ordre) — c'est ce qui rend « les `killed` premiers » exact. */
export function incursionFoesDown(run: RiftRun, bodies: readonly SkirmishUnit[]): string[] {
  const down = bodies
    .slice(0, Math.max(0, Math.min(run.killed, bodies.length - 1)))
    .map((b) => b.id);
  if (run.bossDown) down.push(bodies[bodies.length - 1]!.id);
  return down;
}

/**
 * ⚡ RÉSOUDRE UNE INCURSION — l'issue est calculée AU DÉPART, comme toute expédition.
 *
 * Ce qu'elle paie et ce qu'elle coûte :
 * - 💠 **MANA**, et rien d'autre. ⚠️ Une incursion RATÉE paie quand même le mana de ce
 *   qu'elle a abattu (`incursionMana`) : on ne repart jamais les mains vides, sinon
 *   « entrer » deviendrait un pari tout-ou-rien sur une activité gratuite. Fermer ajoute
 *   la prime du gardien.
 * - ⚠️ **AUCUN OBJET, AUCUNE PIÈCE D'AVENTURIER, AUCUNE AUTRE DEVISE.** La faille EST
 *   l'usine de mana ; y ajouter une source d'équipement non mesurée est précisément ce que
 *   le projet s'interdit (les « 0-3 pièces d'ensemble » de la spec sont écartées pour cette
 *   raison, et leur poids y est mesuré comme symbolique).
 * - **XP** : socle `missionXp` + part des abattus (`skirmishXpShares`), socle selon l'issue,
 *   la règle EXACTE des camps et des convois. ⚠️ Partagée entre les SEULS aventuriers : l'XP
 *   du héros vient du sport, et le compter diluerait la part du vivier.
 * - 🤕 **DÉFAITE → TOUT LE GROUPE À L'INFIRMERIE.** Une incursion perdue est une mort du
 *   combattant fondu : contrairement à un camp, il n'y a pas de corps à corps distincts à
 *   attribuer, donc pas de « certains sont tombés ». Aucune perte définitive, comme partout.
 * - ⚠️ **LE HÉROS N'EST JAMAIS BLESSÉ**, et c'est un écart ASSUMÉ avec la lettre de la spec
 *   (« défaite du héros → Infirmerie, comme sur un camp ») : vérifié, un camp perdu ne
 *   blesse PAS le héros — `base.wound` n'est posé que par un SIÈGE perdu. La spec décrivait
 *   donc une règle qui n'existe pas. On honore son INTENTION (« comme sur un camp ») plutôt
 *   que sa lettre, ce qui évite d'inventer pour la seule faille une punition que ni les
 *   camps ni les expéditions n'appliquent. Ce que l'on paie déjà : le temps du héros, son
 *   exclusivité, le péage d'or et les salaires.
 * - **Salaires** à l'encaissement (`caravanWages`), comme un camp.
 *
 * ⚠️ `kills` est VIDE (combat fondu : aucune attribution par aventurier n'est calculable) —
 * `PartyReportView` masque déjà une colonne d'abattus à zéro.
 */
export function resolveIncursion(input: IncursionInput): ExpeditionOutcome {
  const { poi, escort, hero, seed, now } = input;
  const allies = partyAllies(escort, input.road, hero);
  const group = fuseUnits(allies, 'Groupe');
  const run = simulateIncursion(group, poi, now, partyFightSeed(seed));

  const bodies = incursionBodies(poi, now);
  const shares = skirmishXpShares(escort, bodies, { foesDown: incursionFoesDown(run, bodies) });
  const xp = missionXpFor(escort, poi, run.cleared, shares, !!hero, input.pantheonLevel);

  const mana = incursionMana(run, poi.level);
  const seals = riftSeals(poi, now, run.cleared);
  const party: PartyResult = {
    hero: !!hero,
    faction: riftSpecOf(poi).faction,
    escort: escort.map((a) => a.id),
    win: run.cleared,
    foes: run.population,
    slain: run.killed,
    kills: {},
    heroKills: 0,
    xp,
    hurt: run.cleared ? [] : escort.map((a) => a.id),
    wages: caravanWages(escort, poi),
    journal: run.journal,
    // ⚠️ De quoi REJOUER, jamais de quoi recalculer : la mise en scène lit ces nombres,
    // elle n'en produit aucun (règle fondatrice de `arenaStage` et `siegeStage`).
    rift: {
      level: poi.level,
      maxPv: run.maxPv,
      pvTrail: run.pvTrail,
      ...(run.boss ? { boss: run.boss } : {}),
    },
  };

  const tag = `${run.killed}/${run.population} abattus · +${mana} 💠`;
  return {
    win: run.cleared,
    gold: 0,
    energy: 0,
    summonStones: 0,
    mana,
    ...(seals ? { seals } : {}),
    item: null,
    items: [],
    key: 0,
    reconBonus: 0,
    returnMult: 1,
    text: run.cleared
      ? `🌀 Faille refermée — le gardien est tombé. ${tag}`
      : `💀 La faille a eu le dessus. ${tag}`,
    party,
  };
}

/**
 * 🎯 % de fermeture annoncé AVANT l'envoi — le MÊME parcours que la résolution
 * (`simulateIncursion`), rejoué sur des graines dérivées.
 *
 * ⚠️ JAMAIS la graine du vrai combat : `partyForecastSeed` est toujours IMPAIRE,
 * `partyFightSeed` toujours PAIRE (doctrine v0.767). Le pronostic est calculé avant que la
 * graine du départ existe, donc il ne peut pas en révéler l'issue.
 * ⚠️ On pronostique la FERMETURE (gardien compris), pas « survivre un moment » : c'est la
 * seule issue qui referme la faille et empêche son armée de sortir.
 */
export function incursionWinPct(
  rift: RiftLike,
  allies: readonly SkirmishUnit[],
  now: number,
  samples: number,
): number {
  if (!allies.length) return 0;
  const group = fuseUnits(allies, 'Groupe');
  const n = Math.max(1, samples);
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateIncursion(group, rift, now, partyForecastSeed(s)).cleared) w++;
  return w / n;
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚔️ L'INTERCEPTION — casser l'armée d'une faille AVANT qu'elle ne renforce le siège
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L'armée que porte une bande en marche.
 *
 * ⚠️ **ELLE N'EST PAS CALIBRÉE SUR LE NIVEAU DE LA FAILLE, mais sur celui du JOUEUR** —
 * c'est le garde-fou anti-exploit mesuré en v0.931 : une armée calibrée sur une faille
 * Bronze donnait 100 % de tenue à un joueur de niveau 60, donc laisser déborder une petite
 * faille serait devenu STRICTEMENT meilleur que la fermer. La faille donne sa **faction**
 * et son **renfort** (`RAID.riftThreat`), jamais sa force.
 *
 * ⚠️ **SEEDÉE SUR L'ID de la bande** : la même bande présente donc toujours la même armée,
 * quel que soit le nombre de fois qu'on ouvre l'écran — et le pronostic ne peut pas mentir
 * sur ce qu'on va affronter.
 *
 * ⚠️ On rejoue `rollRaid`, **la seule autorité sur ce qu'est une armée**. Reconstruire des
 * groupes à la main ici donnerait une seconde définition qui divergerait du siège.
 */
export function warbandArmy(poi: Poi, playerLevel: number): Raid {
  const overflow: RiftOverflow = {
    faction: poi.faction ?? riftFactionOf(poi.id),
    level: poi.level,
    at: poi.spawnedAt,
  };
  return rollRaid(seedOf(poi.id) >>> 0 || 1, playerLevel, poi.expiresAt, 0, overflow);
}

/**
 * ⚔️ CE QU'ON AFFRONTE VRAIMENT en rase campagne — **calibré comme un camp, jamais sur
 * l'armée de siège**.
 *
 * ⚠️ **MESURÉ, ET C'EST CE QUI A INVALIDÉ LA PREMIÈRE VERSION.** Faire combattre l'armée
 * de siège elle-même (`armyCombatant`) donne 0 % de victoire à SIX aventuriers du niveau du
 * joueur dès le niveau 8 : cette armée est dimensionnée pour assiéger une base fortifiée
 * (mur, huit balistes, héros, garnison), pas pour être détruite par un groupe. Pire, une
 * simple FRACTION ne marche pas non plus — mesuré, le seuil 0 %→100 % se franchit en une
 * division par deux et GLISSE avec le niveau (0,5 au niv. 5, 0,03 au niv. 30), parce que
 * l'armée croît en ~L⁴ quand un aventurier croît linéairement (défaut structurel déjà
 * documenté en v0.779).
 *
 * D'où le même **DANGER ABSOLU** que les camps et les routes : la force se cale sur
 * l'escorte de RÉFÉRENCE du niveau du lieu, jamais sur ce qu'on envoie — sinon « combien
 * j'en envoie » ne voudrait plus rien dire.
 *
 * ⚠️ **ON N'INTERCEPTE PAS UNE ARMÉE, ON ROMPT SA COLONNE.** C'est ce que la fiction doit
 * dire, et c'est ce que la mesure impose : un groupe ne détruit pas un host qu'une
 * forteresse tient à peine. Ce qu'on brise, c'est son élan — d'où `RIFT.interceptSize`,
 * exprimé comme la force d'un camp : en tours de l'offense du groupe de référence.
 */
function warbandFoe(poi: Poi): Combatant {
  const ref = fuseUnits(refEscortUnits(poi.level), 'Référence');
  return {
    name: 'Colonne en marche',
    pv: Math.max(1, Math.round(Math.max(1, offenseOf(ref)) * RIFT_INTERCEPT.pvTurns)),
    damage: Math.max(1, Math.round(survivalOf(ref) * 100 * RIFT_INTERCEPT.dmgPctPv)),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
  };
}

/** Les corps d'une armée en UNITÉS — pour l'XP seulement (qui a abattu quoi).
 *  ⚠️ DÉRIVÉS de `groupCombatant`, ce que le combat emploie : une seconde construction
 *  finirait par décrire une autre armée que celle qu'on a affrontée. */
function warbandBodies(raid: Raid): SkirmishUnit[] {
  return raid.groups.map((g, i) => ({
    id: `war_${i}`,
    name: g.species,
    emoji: g.emoji,
    level: g.level,
    combatant: groupCombatant(g),
  }));
}

/**
 * ⚔️ Ce qu'une interception rapporte en mana : **ce qu'on a RÉELLEMENT brisé**.
 *
 * ⚠️ Pas un tout-ou-rien. La spec promet du mana pour « tout monstre de faille tué —
 * dans la faille, **sur la route**, en défense » : un groupe repoussé qui a quand même
 * éventré la moitié de l'armée doit repartir avec quelque chose. La part détruite se lit
 * sur les PV restants de l'armée à la fin du combat, donc sur le combat RÉEL.
 *
 * ⚠️ **AUCUNE PRIME DE GARDIEN** (`bossManaShare`) : il n'y a pas de boss en rase
 * campagne. Fermer la faille reste nettement plus payant que l'intercepter — c'est ce qui
 * garde l'incursion première et l'interception au rang de session de rattrapage.
 */
export function interceptionMana(raid: Raid, army: Combatant, run: CombatResult): number {
  const reste = run.win ? 0 : (run.log[run.log.length - 1]?.monsterPv ?? army.pv);
  const part = Math.max(0, Math.min(1, 1 - reste / Math.max(1, army.pv)));
  const effectif = raid.groups.reduce((s, g) => s + g.count, 0);
  return riftMana(Math.round(effectif * part), raid.level);
}

/** Ce qu'on envoie à la rencontre d'une bande. ⚠️ MÊME FORME qu'un camp ou une faille
 *  (toutes satisfont `PartyVoyage`), à `playerLevel` près — l'armée s'y calibre. */
export interface InterceptionInput {
  poi: Poi;
  escort: Adventurer[];
  road: EscortKit;
  hero: PartyHero | null;
  seed: number;
  playerLevel: number;
  /** ⚠️ REQUIS : la référence de la prime de rattrapage (`catchUpMult`) — c'est le plafond
   *  que `grantAdvXp` applique, jamais le niveau du joueur. */
  pantheonLevel: number;
}

/**
 * ⚔️ Intercepter une bande en marche.
 *
 * **Ce qu'on y gagne n'est pas du butin, c'est une PERTE ÉVITÉE** : le prochain siège ne
 * sera pas renforcé (×1,3, soit 30 à 40 points de tenue mesurés en v0.933). Le mana n'est
 * qu'un lot de consolation — l'écran le dit franchement, sinon on la lit comme du farm et
 * on est déçu.
 *
 * - **Un seul choc, pas d'attrition** : contrairement à l'incursion (une suite de salles),
 *   une rencontre en rase campagne est un affrontement unique. On fond le groupe
 *   (`fuseUnits`) contre l'armée fondue (`armyCombatant`) — les deux modèles existent
 *   déjà, on n'en invente aucun.
 * - **XP** : socle `missionXp` + part des abattus (`missionXpFor`), la règle EXACTE
 *   des camps, des convois et des incursions. Partagée entre les SEULS aventuriers.
 * - 🤕 **DÉFAITE → TOUT LE GROUPE À L'INFIRMERIE**, comme une incursion : le combattant
 *   fondu est tombé, il n'y a pas de corps à corps distincts à attribuer.
 * - ⚠️ **Le héros n'est jamais blessé** (cf. `resolveIncursion` : un camp perdu ne blesse
 *   pas le héros non plus — seul un SIÈGE perdu le fait).
 */
export function resolveInterception(input: InterceptionInput): ExpeditionOutcome {
  const { poi, escort, hero, seed, playerLevel } = input;
  const allies = partyAllies(escort, input.road, hero);
  const group = fuseUnits(allies, 'Groupe');
  const raid = warbandArmy(poi, playerLevel);
  // ⚠️ L'armée tirée ne sert QU'AU ROSTER (qui on croise, combien ils sont) ; ce qu'on
  // AFFRONTE est , calibré comme un camp. Les faire diverger serait tentant,
  // mais c'est précisément ce qui donnait 0 % de victoire à tous les niveaux.
  const army = warbandFoe(poi);
  const run = simulateCombat(group, army, { seed: partyFightSeed(seed), goldOnWin: 0 });

  const bodies = warbandBodies(raid);
  // ⚠️ Combat FONDU : on ne sait pas QUEL groupe est tombé. Une victoire les abat tous,
  // une défaite n'en crédite aucun — même convention que l'incursion, qui ne distribue
  // rien non plus quand le combattant fondu tombe.
  const foesDown = run.win ? bodies.map((b) => b.id) : [];
  const shares = skirmishXpShares(escort, bodies, { foesDown });
  const xp = missionXpFor(escort, poi, run.win, shares, !!hero, input.pantheonLevel);

  const mana = interceptionMana(raid, army, run);
  const effectif = raid.groups.reduce((s, g) => s + g.count, 0);
  // Un seul choc : le journal dit QUI on a croisé et comment ça a tourné, pas un coup par
  // coup — le rapport de groupe est déjà long, et il n'y a pas de salles à raconter ici.
  const journal: string[] = [
    `⚔️ ${effectif} combattants en marche — ${raid.groups.length} groupes.`,
    ...raid.groups.map(
      (g) => `${g.emoji} ${g.species} ×${g.count} (niv ${g.level})${g.champion ? ' 👑' : ''}`,
    ),
    run.win
      ? `🏆 Bande rompue en ${run.rounds} tours.`
      : `💀 Repli après ${run.rounds} tours — ils poursuivent leur route.`,
  ];
  const party: PartyResult = {
    hero: !!hero,
    faction: raid.faction,
    escort: escort.map((a) => a.id),
    win: run.win,
    foes: effectif,
    slain: run.win ? effectif : 0,
    kills: {},
    heroKills: 0,
    xp,
    hurt: run.win ? [] : escort.map((a) => a.id),
    wages: caravanWages(escort, poi),
    journal,
  };

  const tag = `+${mana} 💠`;
  return {
    win: run.win,
    gold: 0,
    energy: 0,
    summonStones: 0,
    mana,
    item: null,
    items: [],
    key: 0,
    reconBonus: 0,
    returnMult: 1,
    text: run.win
      ? `⚔️ Bande dispersée — le prochain siège ne sera pas renforcé. ${tag}`
      : `💀 La bande a tenu bon. Elle poursuit sa marche. ${tag}`,
    party,
  };
}

/**
 * 🎯 % d'interception annoncé AVANT l'envoi — le MÊME combat, rejoué sur des graines
 * dérivées. ⚠️ Graines IMPAIRES (`partyForecastSeed`) : disjointes par parité de celles du
 * vrai combat, donc le pronostic ne peut pas rejouer la bataille qui aura lieu.
 */
export function estimateInterception(
  poi: Poi,
  escort: Adventurer[],
  road: EscortKit,
  hero: PartyHero | null,
  samples = 24,
): number {
  const group = fuseUnits(partyAllies(escort, road, hero), 'Groupe');
  const army = warbandFoe(poi);
  let w = 0;
  for (let s = 0; s < samples; s++)
    if (simulateCombat(group, army, { seed: partyForecastSeed(s), goldOnWin: 0 }).win) w++;
  return w / samples;
}
