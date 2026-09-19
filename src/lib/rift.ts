/**
 * ⚡ FAILLES — étape 1 : ce QU'EST une faille, et ce qu'elle rapporte.
 *
 * ⚠️ **PAS ENCORE BRANCHÉ** : aucun POI de type « faille » n'est produit, aucun écran ne
 * lit ce module, et rien n'a changé pour le joueur. Même découpage que `siegeBattle.ts`
 * (v0.754) et que les camps (étapes 1 → 3) : la lib d'abord, pure et mesurée, le câblage
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

import { fuseUnits } from './skirmish';
import { refEscortUnits } from './caravan';
import { interpolate } from './proceduralContent';
import {
  mulberry32,
  offenseOf,
  seedOf,
  simulateCombat,
  survivalOf,
  type Combatant,
} from './combat';
import { factionRoster, type RaidFaction } from './raid';

/** Les trois factions du jeu — la faille et l'armée qui en sort partagent la même. */
const RIFT_FACTIONS: readonly RaidFaction[] = ['bandits', 'betes', 'mortsvivants'];

export const RIFT = {
  /** 7 jours avant le débordement (décidé). */
  maturityMs: 7 * 24 * 3_600_000,

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

  /** Ce que le BOSS ajoute, en part du mana des monstres — la prime de fermeture. */
  bossManaShare: 0.5,

  /** ⚠️ CE QUE LA MINE RÉSIDUELLE REND, en part de ce que FERMER aurait payé. C'est une
   *  **consolation, jamais une stratégie** : si ignorer une faille payait presque autant,
   *  l'optimum deviendrait « n'entrer nulle part, encaisser le pari du siège, et farmer
   *  les mines au convoi » — le robinet du gacha serait alimenté par la PASSIVITÉ. Un
   *  test verrouille le rapport, dans la langue du projet (« l'épave reste la source de
   *  POINTE », « la ferraille plus dure que l'or »). */
  mineManaShare: 0.25,

  /** Durée de vie de la mine résiduelle (elle expire comme tout POI). */
  mineLifeMs: 36 * 3_600_000,

  /** Renfort de menace de l'armée qui sort d'une faille non fermée — **×1,3 MESURÉ**
   *  (tenue d'un siège 85-91 % → 51-71 %, plat selon le niveau). ⚠️ Posé ici pour
   *  mémoire ; c'est l'étape 2 qui le passera à `rollRaid` (`threat`, figé au tirage). */
  overflowThreat: 1.3,
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
  const rng = mulberry32((seedOf(rift.id) ^ 0x1f83d9ab) >>> 0 || 1);
  return { faction: RIFT_FACTIONS[Math.floor(rng() * RIFT_FACTIONS.length)]! };
}

/** L'instant où la faille déborde. */
export function riftOverflowAt(rift: Pick<RiftLike, 'spawnedAt'>): number {
  return rift.spawnedAt + RIFT.maturityMs;
}

/** Maturité 0..1, bornée aux deux bouts (une faille ne mûrit pas au-delà de 1). */
export function riftMaturity(rift: Pick<RiftLike, 'spawnedAt'>, now: number): number {
  const t = (now - rift.spawnedAt) / RIFT.maturityMs;
  return Math.min(1, Math.max(0, t));
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
 * Ce que rapporte une incursion qui va au bout : **tous** les monstres présents + le boss.
 *
 * ⚠️ C'est la référence de l'invariant économique : fermer doit rester nettement plus
 * payant que laisser déborder et ramasser la mine.
 */
export function riftClearMana(rift: RiftLike, now: number): number {
  const foes = riftMana(riftPopulation(rift, now), rift.level);
  return Math.round(foes * (1 + RIFT.bossManaShare));
}

/** La mine de mana résiduel laissée par une faille qui a débordé. */
export interface ResidualMine {
  /** Niveau hérité de la faille — il décide de son rendement, comme tout POI de récolte. */
  level: number;
  mana: number;
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
  // Calculée sur la faille À MATURITÉ : c'est ce qu'elle valait au moment de déborder.
  // ⚠️ Écrire `now` ici est une mutation **ÉQUIVALENTE, prouvée** — `riftMaturity`
  // plafonne à 1 et la garde ci-dessus écarte tout `now < at`, donc les deux expressions
  // rendent toujours la même valeur. On garde `at` parce qu'il DIT l'intention ; noté pour
  // que personne ne perde de temps à la retenter comme si elle changeait quelque chose.
  const full = riftClearMana(rift, at);
  return {
    level: rift.level,
    mana: Math.max(1, Math.round(full * RIFT.mineManaShare)),
    spawnedAt: at,
    expiresAt: at + RIFT.mineLifeMs,
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
 * La forme (bosse vers les niveaux 20-30) reflète celle de l'escorte de référence, dont la
 * puissance ne croît pas linéairement — le même phénomène que les autres tables du projet.
 */
const RIFT_RELIEF: [number, number][] = [
  [12, 0.92],
  [20, 1.1],
  [26, 1.16],
  [30, 1.15],
  [40, 0.97],
  [50, 0.94],
  [60, 0.96],
  [70, 0.98],
  [85, 1.0],
  [100, 1.01],
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

/** Un monstre de la faille (ou son boss), nommé dans le roster de sa faction. */
export function riftFoe(level: number, faction: RaidFaction, index: number, isBoss: boolean) {
  const base = riftFoeBase(level);
  const roster = factionRoster(faction);
  const pick = roster[index % roster.length]!;
  // ⚠️ LA RAMPE NE S'APPLIQUE PAS AU GARDIEN : sa force, c'est son POIDS. Mesuré en la lui
  // appliquant aussi (il se retrouvait à 5,8× un monstre de base) : il décidait de TOUT, et
  // une faille jeune tombait de 0,97 à 0,15 de nettoyage — le nombre de monstres redevenait
  // secondaire, donc l'âge aussi. Deux multiplicateurs sur le même adversaire, c'est un de
  // trop.
  const ramp = isBoss ? 1 : riftRamp(riftDepth(index));
  const w = isBoss ? RIFT_RUN.bossWeight : 1;
  return {
    name: isBoss ? `${pick.name} (gardien)` : pick.name,
    emoji: pick.emoji,
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

  for (let i = 0; i < population; i++) {
    const foe = riftFoe(rift.level, faction, i, false);
    const rs = (seed * 131 + i * 7919) >>> 0 || 1;
    const res = simulateCombat(riftFighter(party, pv), foe, {
      seed: rs,
      goldOnWin: 0,
      startPlayerPv: pv,
    });
    if (res.log.length) pv = res.log.at(-1)!.playerPv;
    if (!res.win) {
      journal.push(`💀 ${foe.emoji} ${foe.name} a eu le dernier mot.`);
      return { cleared: false, killed, population, bossDown: false, finalPv: 0, journal };
    }
    killed++;
    journal.push(`⚔️ ${foe.emoji} ${foe.name} abattu.`);
    pv = Math.min(maxPv, pv + Math.round(maxPv * RIFT_RUN.regen));
  }

  journal.push('🚪 La porte du gardien s’ouvre.');
  const boss = riftFoe(rift.level, faction, population, true);
  const res = simulateCombat(riftFighter(party, pv), boss, {
    seed: (seed * 7919 + 13) >>> 0 || 1,
    goldOnWin: 0,
    startPlayerPv: pv,
  });
  if (res.log.length) pv = res.log.at(-1)!.playerPv;
  journal.push(
    res.win ? `🏆 ${boss.name} tombe — la faille se referme.` : `💀 ${boss.name} tient.`,
  );
  return {
    cleared: res.win,
    killed,
    population,
    bossDown: res.win,
    finalPv: res.win ? Math.max(0, pv) : 0,
    journal,
  };
}

/** Le mana d'une incursion : les monstres abattus, + le boss SI la faille est fermée. */
export function incursionMana(run: RiftRun, level: number): number {
  const foes = riftMana(run.killed, level);
  return run.cleared ? Math.round(foes * (1 + RIFT.bossManaShare)) : foes;
}
