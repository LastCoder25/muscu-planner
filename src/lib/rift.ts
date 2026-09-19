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

import { mulberry32, seedOf } from './combat';
import type { RaidFaction } from './raid';

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
