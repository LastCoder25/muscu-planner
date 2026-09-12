// ⚔️🧱 BATAILLE DE SIÈGE — le moteur en DEUX PHASES, avec des unités qui ont un métier.
//
// ⚠️ IL REMPLACE `simulateDungeon` POUR LES SIÈGES (décision explicite de l'utilisateur).
// L'ancien modèle était « un combattant contre une file » : la Base était une masse de PV
// avec un chiffre de dégâts, l'armée une suite de groupes. Il ne pouvait donc représenter
// NI le rôle du mur (retarder), NI la brèche, NI le fait qu'un assaillant au corps à corps
// ne peut pas atteindre un archer sur le rempart. Deux moteurs auraient divergé au premier
// réglage — c'est le piège que ce projet documente partout —, donc on remplace.
//
// ⚠️ CE QUE LE MODÈLE DIT, en une phrase : **on frappe ce qu'on peut atteindre ; à portée
// égale, on frappe ce qui fait le plus mal.** Tout le reste en découle, sans table de
// priorités à maintenir :
//   · un assaillant au CORPS À CORPS ne peut rien contre les tireurs du rempart — il ne
//     peut que cogner le mur, puis entrer par la brèche ;
//   · un assaillant à DISTANCE ne peut pas ouvrir le mur — il ne peut que faire taire les
//     tireurs d'en face ;
//   · donc une armée SANS béliers s'use dehors, une armée SANS archers se fait faucher
//     jusqu'au bout, et seule une armée ÉQUILIBRÉE fait taire puis ouvre.
// La composition de l'armée devient lisible et actionnable — c'est précisément ce que la
// Tour de guet vend.
//
// ⚠️ LE GOULOT EST LE RESSORT, pas la brèche elle-même. Une brèche est étroite : trois
// hommes de front, pas cinquante. Elle transforme une masse en file, et c'est ce qui
// permet à une poignée de défenseurs de tenir contre une armée. Sans lui, « le mur tombe »
// voudrait dire « c'est fini », et le siège n'aurait qu'une seule issue.
//
// ⚠️ PERSONNE NE MEURT CÔTÉ DÉFENSE. Aventuriers et héros sortent blessés, jamais perdus
// (règle du projet depuis le chenil) : sinon on n'engage pas ceux qu'on a élevés pendant
// des semaines, et la mécanique reste vide le jour où elle se déclenche.

import { mulberry32 } from './combat';

/** @public — contrat du moteur, lu par l'écran quand il sera branché (étape 2).
 *  Ce qu'une unité sait faire. C'est la SEULE chose qui décide de ce qu'elle peut
 *  atteindre — et donc toute la tactique. */
export type UnitKind = 'melee' | 'ranged';

/** @public — contrat du moteur.
 *  D'où vient l'unité — sert à l'affichage et au butin, jamais au combat. */
export type UnitOrigin = 'turret' | 'hero' | 'adventurer' | 'attacker';

/** @public — contrat du moteur.
 *  OÙ un défenseur se tient. C’était jusqu’ici IMPLICITE dans son `kind` — un tireur
 *  voyait tout, un homme d’armes n’existait qu’une fois la brèche ouverte — donc « être
 *  sur le mur » et « en descendre » n’avaient aucune existence.
 *
 *  ⚠️ C’EST LE POSTE QUI DONNE L’ABRI, pas le type d’unité. Le rempart couvre TOUT ce
 *  qui s’y tient — l’archer comme la baliste ; la cour ne couvre personne. Avant, seules
 *  les balistes portaient une `armor` : l’archer debout à côté d’elles n’avait rien,
 *  ce qui contredisait le modèle (on est mieux protégé sur le mur qu’en bas). */
export type SiegePost = 'rampart' | 'yard';

export interface SiegeUnit {
  id: string;
  side: 'att' | 'def';
  kind: UnitKind;
  name: string;
  emoji: string;
  pv: number;
  maxPv: number;
  /** Dégâts par tour, crit déjà fondu dedans (on ne rejoue pas les dés du crit ici : la
   *  bataille compte déjà assez d'aléa par le ciblage et l'ordre d'entrée). */
  damage: number;
  origin: UnitOrigin;
  /** Assaillant ayant FRANCHI la brèche. Change ce qu'il peut atteindre, et ce qui peut
   *  l'atteindre. */
  inside?: boolean;
  /** Place occupée au pied du mur, en corps de RÉFÉRENCE (1 par défaut).
   *
   *  ⚠️ SANS ELLE, LE GOULOT TRAHIT LA SILHOUETTE DES FACTIONS. Le projet tient depuis la
   *  v0.661 un invariant : `countMult × unitMult ≈ 1` — une horde nombreuse et fragile
   *  pèse autant qu'une bande réduite et aguerrie, seule la FORME change. Un front compté
   *  en TÊTES le casse : à huit corps quels qu'ils soient, une meute de loups ne porte au
   *  mur que la force de huit loups. Mesuré sur le nouveau moteur, front en têtes :
   *  bandits **3 à 35 %** de tenue et 100 % de brèches, bêtes **100 %** de tenue et 12 à
   *  39 % de brèches — la même armée, rendue inoffensive par sa seule silhouette.
   *  (Le tireur donné aux bêtes n'y était pour rien : elles ne perçaient déjà pas.)
   *
   *  Le front est donc une capacité d'ESPACE, pas un décompte : un loup tient moins de
   *  place qu'un mercenaire en armure, il en rentre davantage au pied du rempart. */
  bulk?: number;
  /** Le poste d’un DÉFENSEUR. Absent sur un assaillant, qui a `inside` pour ça.
   *
   *  ⚠️ Optionnel parce qu’il n’a de sens que d’un côté, et le type ne sait pas
   *  l’exprimer. Ce qu’il ne garantit pas, un test le fait : TOUT défenseur produit par
   *  `siegeDefenders` en porte un. */
  post?: SiegePost;
  /** Jusqu’où l’unité porte, en PAS du terrain d’approche. `0` = au contact.
   *
   *  ⚠️ C’est la portée qui JUSTIFIE la puissance d’une baliste : elle n’est pas forte
   *  parce qu’elle a de gros chiffres, elle est forte parce qu’elle frappe **la première
   *  et pendant plus longtemps**. Même idée que le mur qui convertit sa solidité en
   *  temps (v0.753), appliquée au feu. */
  range?: number;
  /** ASSAILLANT : à combien de pas du rempart il se trouve. Décroît chaque tour.
   *  Absent côté défense — un défenseur EST au mur. */
  dist?: number;
  /** Où sur l’anneau. Porté par les BALISTES (fixées à leur sommet) et par les
   *  assaillants (l’armée se masse sur quelques pans).
   *
   *  ⚠️ ABSENT sur un défenseur humain, et c’est la distinction qui compte : **une
   *  baliste ne pivote pas**, un homme marche le long du chemin de ronde. Sans secteur,
   *  aucun arc ne le borne. */
  sector?: number;
  /** Pas parcourus par tour. Défaut 1 — une machine de siège avance moins vite qu’une
   *  meute, et c’est le levier qui dira combien de temps on reste sous le feu. */
  speed?: number;
  /** 🛡️ CE QUE LE REMPART ABSORBE POUR CETTE UNITÉ (0..1), tant qu’il tient.
   *
   *  ⚠️ C’EST LE MÉTIER DU MUR, ET IL AVAIT ÉTÉ PERDU. `wallArmorK` existe depuis la
   *  v0.753 (« le mur encaisse et abrite ceux qui tirent ») mais le moteur en deux phases
   *  ne l’a JAMAIS lu — `SiegeUnit` n’avait pas d’armure et `strike` appliquait les dégâts
   *  bruts. Une baliste tire depuis le HAUT du rempart : sans lui, elle se fait faucher.
   *
   *  ⚠️ L’ABRI S’ÉRODE AVEC LE MUR (× son intégrité) : un rempart entamé protège moins,
   *  un rempart tombé ne protège plus. C’est ce qui fait du mur une structure qui COUVRE
   *  et pas un second réservoir de PV — et c’est ce qui garde l’usure en fin de partie,
   *  quand les grosses armées ouvrent vite. */
  armor?: number;
}

export interface SiegeWall {
  pv: number;
  maxPv: number;
}

export const BATTLE = {
  /** La brèche s'ouvre quand le mur descend sous cette fraction de ses PV max.
   *  ⚠️ Pas à zéro : un rempart cède bien avant d'être entièrement pulvérisé, et laisser
   *  la brèche à 0 % ferait de la phase 2 un épilogue de deux tours. */
  breachAt: 0.4,
  /**
   * Combien d'assaillants tiennent DE FRONT dans une brèche grande ouverte.
   *
   * ⚠️ C'est LA variable d'équilibrage de la phase 2 : elle décide si une poignée de
   * défenseurs tient ou se fait submerger.
   *
   * ⚠️ **4 → 7, en DEUX temps et pour deux raisons distinctes.** À quatre, les entrants
   * pesaient 7 à 10 % de la mêlée adverse : le goulot ne bornait qu'un camp, si bien
   * que « une brèche permet à une poignée de tenir contre une armée » (v0.754) devenait
   * « une armée tient contre une armée », et le vivier ne valait que **+9 points** de
   * tenue. On s'est d'abord arrêté à **5**, seule valeur que la FALAISE tolérait ; puis
   * cet invariant a été re-cadré sur la configuration que le jeu attend (avec garnison,
   * cf. `raid.test.ts`), et la borne est devenue l'ISO-MENACE.
   *
   * ⚠️ **7 est le MAXIMUM que les invariants autorisent**, et c'est une mesure. Balayage
   * sur les quantités des TESTS eux-mêmes (falaise à mi-enceinte AVEC vivier · écart
   * entre factions, seuil 13 · apport du vivier au niveau 26) :
   *
   *   4 → 49,6 · 5,2 · +9   |   5 → 50,0 · 6,5 · +10   |   6 → 49,2 · 7,5 · +10
   *   **7 → 46,9 · 10,3 · +13**   |   8 → 46,5 · **15,2** · +14   |   10 → 45,4 · **18,4** · +17
   *
   * ⚠️ **La falaise n'est plus le verrou, et le renversement est instructif** : avec la
   * garnison, la mi-enceinte ne bouge quasiment pas (49,6 → 45,4 de la largeur 4 à 10).
   * Ce qui décroche, c'est l'iso-menace : une horde de bêtes inonde une brèche large là
   * où une bande de brigands ne le peut pas, et la faction cesse d'être un simple
   * changement de FORME.
   *
   * ⚠️ Une variante SYMÉTRIQUE a été écrite, mesurée, puis jetée : borner aussi le
   * nombre de défenseurs au contact (physiquement plus juste — on ne met pas quinze
   * épées au travers d'un trou par où quatre hommes passent) **annule l'apport du
   * vivier en fin de partie** (+9 → +5) et effondre la mi-enceinte (20 → 3). Le vivier
   * doit pouvoir submerger ce qui entre, sinon il ne sert plus à rien.
   */
  breachMaxWidth: 7,
  /** Les pans de l’enceinte. ⚠️ DOIT valoir `TURRET_SLOTS` — une baliste par sommet ;
   *  un test le verrouille, parce que les deux vivent dans des fichiers différents. */
  sectors: 8,
  /** La profondeur du terrain découvert, en PAS. C’est le champ de tir : l’armée le
   *  traverse avant de pouvoir toucher quoi que ce soit, et **c’est là que les balistes
   *  gagnent leur valeur**. C’est aussi le repère à partir duquel toutes les portées se
   *  définissent en fractions — une baliste couvre le terrain ENTIER, c’est son métier. */
  fieldDepth: 6,
  /** De combien de pans, de part et d’autre du sien, une baliste couvre le terrain.
   *
   *  ⚠️ **C’EST LE DIAL DE LA PUISSANCE DE FEU.** Une armée massée sur quelques pans
   *  n’affronte que les balistes qui la couvrent : à arc 0 elle n’en affronte qu’une par
   *  pan occupé, à arc 3 elle les affronte toutes. Il ne se règle qu’à la mesure. */
  turretArc: 1,
  /** Part du feu des archers assaillants qui passe À TRAVERS la brèche pour frapper les
   *  défenseurs de la cour. Étroite par nature : on tire dans un couloir. */
  rangedThroughBreach: 0.35,
  /** Combien de corps de RÉFÉRENCE tiennent de front au pied du MUR (cf. `SiegeUnit.bulk` :
   *  un corps plus menu en occupe moins d'un, il en rentre donc plus).
   *
   *  ⚠️ LE MUR EST UN GOULOT, LUI AUSSI — et l'avoir oublié a été trouvé par la mesure :
   *  la brèche s'ouvrait dans **100 %** des sièges. On ne met pas cinquante béliers côte
   *  à côte contre un rempart ; seul un front tient à sa base. L'ancien moteur portait
   *  déjà ce garde-fou, mais implicitement — les dégâts d'un groupe suivaient `√effectif`
   *  (`groupDmgExp`, « seuls quelques assaillants tiennent au pied du mur »). En éclatant
   *  les groupes en unités, cette retenue avait disparu et l'armée entière cognait d'un
   *  bloc. Elle est ici EXPLICITE, ce qui vaut mieux qu'un exposant : on lit combien.
   *
   *  Les autres ne sont pas oisifs — ils attendent leur tour, et se font tirer dessus.
   *  Valeur calée sur le périmètre de l'enceinte (8 pans, comme les 8 tourelles). */
  wallFront: 8,
  /** Garde-fou anti-boucle. Un siège qui dure plus longtemps est un siège où plus
   *  personne ne peut tuer personne : on tranche par les PV restants. */
  maxRounds: 60,
} as const;

/** @public — contrat du moteur : la mise en scène rejouera ce log, comme SiegeStage. */
export interface BattleEvent {
  round: number;
  kind: 'hit' | 'wall' | 'breach' | 'enter' | 'down' | 'descend';
  /** Qui frappe (absent pour l'ouverture de la brèche). */
  from?: string;
  /** Qui encaisse (`'wall'` pour la muraille). */
  to?: string;
  amount?: number;
  /** Largeur de la brèche au moment où elle s'ouvre ou s'élargit. */
  width?: number;
}

export interface BattleResult {
  /** La base a-t-elle tenu ? */
  held: boolean;
  rounds: number;
  /** La brèche s'est-elle ouverte ? (et à quel tour) */
  breached: boolean;
  breachRound: number | null;
  /** Assaillants abattus / effectif total. */
  killed: number;
  total: number;
  /** Assaillants ayant franchi la brèche au cours du siège. */
  entered: number;
  /** PV du mur à la fin (0 = pulvérisé). */
  wallPv: number;
  /** Défenseurs mis hors de combat — BLESSÉS, jamais morts. */
  wounded: string[];
  log: BattleEvent[];
}

const alive = (u: SiegeUnit) => u.pv > 0;

/**
 * La largeur de la brèche : 0 tant que le mur tient, puis elle S'ÉLARGIT à mesure qu'il
 * continue de tomber.
 *
 * ⚠️ Ce n'est pas un état binaire, et c'est délibéré : si la brèche s'ouvrait d'un coup à
 * sa taille maximale, le mur n'aurait plus aucune valeur une fois le seuil franchi — une
 * falaise. Là, chaque point de mur restant continue de payer.
 */
export function breachWidth(wall: SiegeWall): number {
  const seuil = wall.maxPv * BATTLE.breachAt;
  if (wall.pv > seuil) return 0;
  if (seuil <= 0) return BATTLE.breachMaxWidth;
  const ouverture = 1 - Math.max(0, wall.pv) / seuil; // 0 au seuil, 1 à zéro PV
  return Math.max(1, Math.ceil(ouverture * BATTLE.breachMaxWidth));
}

/**
 * La cible d'une unité : la plus DANGEREUSE parmi celles qu'elle peut atteindre.
 *
 * ⚠️ « La plus dangereuse » et non « la plus faible » : on neutralise la menace, c'est ce
 * qu'un défenseur fait vraiment. Et ça suffit à produire toute la tactique — pas besoin
 * d'une table de priorités par type, qu'il faudrait maintenir et qui mentirait un jour.
 *
 * ⚠️ À égalité, on départage par la GRAINE et non par l'ordre du tableau : sans ça, la
 * première unité écrite concentre tous les coups et l'ordre de déclaration devient une
 * mécanique de jeu invisible.
 */
export function pickTarget(candidates: SiegeUnit[], rng: () => number): SiegeUnit | null {
  const vivants = candidates.filter(alive);
  if (!vivants.length) return null;
  let best = vivants[0]!;
  let bestScore = -1;
  for (const u of vivants) {
    // Le bruit est minuscule devant l'écart de dégâts : il ne départage QUE les égalités.
    const score = u.damage + rng() * 1e-6;
    if (score > bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best;
}

/** L’écart angulaire entre deux pans, sur un anneau — donc au plus la moitié du tour. */
export function sectorGap(a: number, b: number): number {
  const d = Math.abs(Math.round(a) - Math.round(b)) % BATTLE.sectors;
  return Math.min(d, BATTLE.sectors - d);
}

/**
 * Est-ce dans l’ARC de tir ?
 *
 * ⚠️ La borne ne s’applique qu’aux unités QUI ONT UN SECTEUR — c’est-à-dire aux
 * BALISTES. Une machine est fixée à son sommet et ne pivote pas ; un homme, lui, marche
 * le long du chemin de ronde. Ne pas donner de secteur à un archer n’est donc pas un
 * oubli, c’est la règle.
 */
function inArc(d: SiegeUnit, a: SiegeUnit): boolean {
  if (d.sector === undefined || a.sector === undefined) return true;
  return sectorGap(d.sector, a.sector) <= BATTLE.turretArc;
}

/** Est-ce à PORTÉE ? Un assaillant sans distance est réputé au contact. */
const inRange = (d: SiegeUnit, a: SiegeUnit) => (a.dist ?? 0) <= (d.range ?? 0);

/** Qui se tient dans la COUR. Descendus compris — c'est là tout le sujet. */
const inYard = (d: SiegeUnit) => d.post === 'yard' && alive(d);
/** Qui tient le REMPART : les balistes, et les tireurs qui n'en sont pas descendus. */
const onRampart = (d: SiegeUnit) => d.post === 'rampart' && alive(d);

/** Ce qu'un ASSAILLANT peut atteindre. */
function attackerTargets(u: SiegeUnit, def: SiegeUnit[], breach: number): SiegeUnit[] {
  if (u.kind === 'melee') {
    // ⚠️ Dehors, un homme d'armes ne peut RIEN faire d'autre que cogner le mur : c'est
    // ce qui rend une armée sans béliers incapable d'entrer.
    if (!u.inside) return [];
    // Entré, il se heurte à ce qui tient la COUR — et seulement une fois la cour balayée
    // il monte aux escaliers pour égorger les servants du rempart. Le critère est la
    // POSITION, plus le type : un tireur DESCENDU est dans la ligne, donc pris à partie
    // comme les autres. C’est la moitié du prix de la descente.
    const devant = def.filter(inYard);
    return devant.length ? devant : def.filter(alive);
  }
  // ⚠️ Un tireur doit d'abord ENTRER DANS SA PROPRE PORTÉE : tant qu'il traverse le
  // terrain, il encaisse sans rendre. C'est tout l'intérêt d'une muraille — et la seule
  // riposte possible est d'amener des machines qui portent plus loin qu'elle.
  if (!u.inside && (u.dist ?? 0) > (u.range ?? 0)) return [];
  // Un tireur vise le REMPART : ce sont ses servants qui le tuent, et les faire taire
  // est la seule façon d'ouvrir la voie aux siens.
  const remparts = def.filter(onRampart);
  if (remparts.length) return remparts;
  // Rempart muet — abattu, OU descendu : on arrose ce qui reste, mais seulement si la
  // brèche offre une ligne de vue.
  return breach > 0 ? def.filter(alive) : [];
}

/**
 * Ce qu'un DÉFENSEUR peut atteindre — **sa POSITION, et rien d'autre**.
 *
 * ⚠️ La règle vivait dans le `kind` ET dans l’`origin` : la mêlée ne voyait que
 * l'intérieur, la tourelle que l'extérieur, et l'archer **voyait TOUT, gratuitement**.
 * C'est exactement ce qui rendait « descendre » sans objet — rien à gagner en
 * descendant, donc rien à perdre en restant. Désormais :
 *   · sur le REMPART, on ne frappe que ce qui est DEHORS ;
 *   · dans la COUR, que ce qui est ENTRÉ.
 * Trois cas particuliers deviennent UNE règle, et l'arbitrage existe.
 *
 * (Les balistes d'en face tirent quand même dans la cour — `turretInsideShare`, une
 * fraction DÉRIVÉE de la géométrie de l'octogone, traitée à part dans le tour.)
 */
function defenderTargets(u: SiegeUnit, att: SiegeUnit[]): SiegeUnit[] {
  if (u.post === 'yard') return att.filter((a) => a.inside && alive(a));
  // Depuis le rempart : DEHORS, à PORTÉE, et DANS L’ARC. Trois termes, et l’ordre
  // d’engagement s’en déduit tout seul — les balistes ouvrent le feu de loin, les
  // archers entrent dans la danse quand l’assaut se rapproche.
  return att.filter((a) => !a.inside && alive(a) && inRange(u, a) && inArc(u, a));
}

/**
 * LA DESCENTE : les tireurs quittent le rempart pour tenir la cour.
 *
 * ⚠️ DÉRIVÉE, jamais une table de priorités — on garde la règle fondatrice du moteur.
 * Ils descendent quand **la cour est en train de céder** : ce qui est entré frappe plus
 * fort que ce qui le retient. Un seul rapport, lisible, et qui se tait tout seul tant
 * qu'aucune brèche n'est ouverte (rien dedans → rien à comparer).
 *
 * ⚠️ À SENS UNIQUE sur un siège (l'appelant ne rebascule jamais) : sinon l'unité
 * oscillerait d'un tour à l'autre — absurde à regarder, et du bruit dans une simulation
 * qu'on veut stable et rejouable.
 */
function yardIsFalling(def: SiegeUnit[], att: SiegeUnit[]): boolean {
  const menace = att.reduce((n, a) => (a.inside && alive(a) ? n + a.damage : n), 0);
  if (menace <= 0) return false;
  return menace > def.reduce((n, d) => (inYard(d) ? n + d.damage : n), 0);
}

/** Frappe, et rend l'EXCÉDENT non consommé (0 si la cible a encaissé le tout). */
function strike(
  from: SiegeUnit,
  to: SiegeUnit,
  amount: number,
  round: number,
  log: BattleEvent[],
  /** Intégrité du rempart (0..1) : ce qui reste de l’abri. */
  shelter = 0,
): number {
  // ⚠️ LE POSTE COMMANDE L’ABRI, et c’est ce qui fait que la descente COÛTE sans qu’on
  // l’écrive deux fois : on ne bascule que `post`, la couverture tombe avec. Poser
  // aussi `armor` à zéro en descendant rouvrirait la divergence que l’étape 1 venait
  // de fermer — deux champs qui disent la même chose finissent par se contredire.
  const cover = to.post === 'yard' ? 0 : (to.armor ?? 0);
  // ⚠️ Le plancher à 1 s’applique APRÈS l’abri : un coup touche toujours, sinon une
  // armure élevée rendrait une unité invulnérable et la bataille ne finirait jamais.
  const soften = 1 - Math.min(0.9, Math.max(0, cover * Math.max(0, shelter)));
  const potentiel = Math.max(1, Math.round(amount * soften));
  const dealt = Math.min(to.pv, potentiel);
  to.pv -= dealt;
  log.push({ round, kind: 'hit', from: from.id, to: to.id, amount: dealt });
  if (to.pv <= 0) log.push({ round, kind: 'down', to: to.id });
  // ⚠️ L'excédent est rendu en dégâts BRUTS (on annule l'abri de CETTE cible) : le
  // suivant appliquera le SIEN, qui n'est pas forcément le même.
  return soften > 0 ? Math.max(0, (potentiel - dealt) / soften) : 0;
}

/**
 * UNE VOLÉE : le tir se dépense ENTIÈREMENT, il ne se perd pas dans un cadavre.
 *
 * ⚠️ C'est le correctif de l'ISO-MENACE, et il vient d'une mesure. `strike` plafonnait
 * les dégâts aux PV restants (`Math.min(to.pv, …)`) : abattre un corps de 300 PV avec un
 * trait qui en porte 1 600 jetait 1 300 points. Mesuré sur 600 sièges par niveau, la part
 * de feu ainsi PERDUE dépendait de la faction — **bêtes 16 % · morts-vivants 10 % ·
 * bandits 5 %**, stable du niveau 12 au 100. Une horde de menus corps absorbait donc
 * ~10 points de tir de plus qu'une bande d'élite **à masse égale** : c'était la vraie
 * cause de l'écart entre factions, celle que `countMult × unitMult ≈ 1` ne peut pas
 * voir — l'invariant conserve les PV et les dégâts, jamais la façon dont le feu ADVERSE
 * se dépense contre eux.
 *
 * ⚠️ RÉSERVÉ AU TIR, des DEUX côtés, et c'est la fiction qui tranche : une volée s'étale
 * sur ce qui reste debout, un coup d'épée ne traverse pas un homme pour en toucher un
 * second. La mêlée garde donc son gaspillage — chez elle il est juste.
 *
 * ⚠️ La boucle est BORNÉE : un tour qui ne tue pas consomme tout le reliquat et s'arrête ;
 * un tour qui tue en couche un de moins. Jamais plus de passages que de cibles.
 */
function volley(
  from: SiegeUnit,
  targets: SiegeUnit[],
  amount: number,
  round: number,
  log: BattleEvent[],
  rng: () => number,
  shelter = 0,
) {
  let reste = amount;
  for (let i = 0; i < targets.length && reste > 0; i++) {
    const cible = pickTarget(targets.filter(alive), rng);
    if (!cible) return;
    reste = strike(from, cible, reste, round, log, shelter);
  }
}

/**
 * La bataille. Déterministe pour une graine — comme tout le reste de ce jeu, pour qu'un
 * rapport puisse être rejoué et qu'une mise en scène ne décide jamais rien.
 *
 * ⚠️ Les deux phases ne se REMPLACENT pas, elles se SUPERPOSENT : une fois la brèche
 * ouverte, les tourelles continuent de faucher dehors pendant qu'on se bat dedans. Un
 * « switch » d'écran serait une trahison du modèle.
 */
export function simulateSiege(
  attackers: SiegeUnit[],
  defenders: SiegeUnit[],
  wall: SiegeWall,
  seed: number,
): BattleResult {
  const rng = mulberry32((seed ^ 0x51ed270b) >>> 0 || 1);
  const att = attackers.map((u) => ({ ...u }));
  const def = defenders.map((u) => ({ ...u }));
  const w: SiegeWall = { ...wall };
  const log: BattleEvent[] = [];
  const total = att.length;
  let breachRound: number | null = null;
  let entered = 0;
  let width = 0;
  let round = 0;

  /**
   * ⚠️ ON NE PERD QUE SI L'ENNEMI EST ENTRÉ. Trouvé par un test : une armée d'ARCHERS
   * SEULS faisait taire les tourelles puis « prenait » la ville — alors que le mur était
   * INTACT et qu'aucun assaillant n'avait posé le pied dedans. Un siège qui ne perce pas
   * est un siège repoussé, même si les remparts sont muets.
   *
   * ⚠️ MAIS LE CODE NE DISAIT PAS ÇA : il exigeait `w.pv <= 0` — **le mur à ZÉRO**, pas
   * l'entrée. Or la brèche s'ouvre dès `breachAt` (40 % des PV) : une armée pouvait avoir
   * balayé TOUTE la garnison et occuper la ville, mur debout à 25 %, et le siège comptait
   * comme tenu. Pire, il ne pouvait alors plus se conclure du tout — un homme d'armes
   * ENTRÉ ne vise plus rien quand la défense est à terre, et ne peut pas frapper le mur
   * (réservé à ceux du dehors). Mesuré : **31 à 51 % des sièges d'une base nue étaient
   * GELÉS**, terminés par le plafond de tours et attribués d'office à la défense.
   *
   * ⚠️ ET LA CONDITION PORTE SUR LA COUR, PAS SUR LE DERNIER CRÉNEAU. Exiger que les
   * HUIT balistes soient abattues laissait le cas dominant intact : un intrus dans une
   * cour VIDE est intouchable (une baliste ne tire que vers le dehors) et grignote la
   * maçonnerie à 200 PV/tour contre 32 000 — 160 tours pour un plafond à 60. La ville
   * était donc « tenue » par des machines qui ne pouvaient rien contre l'homme qui
   * marchait dans ses rues.
   *
   * ⚠️ C'est aussi ce qui donne enfin leur métier aux AVENTURIERS : depuis la v0.777 ce
   * sont eux qui tiennent la brèche, et la DESCENTE existe pour qu'un tireur du rempart
   * vienne les épauler. Sans personne dans la cour, il n'y a rien à disputer — et une
   * enceinte sans garnison cesse d'être imprenable.
   *
   * La garantie des archers seuls est intacte : sans entrée et sans mur abattu, on ne
   * perd pas.
   */
  const dedans = () => att.some((a) => a.inside && alive(a));
  const perdu = () => !def.some(alive) && (dedans() || w.pv <= 0);

  for (; round < BATTLE.maxRounds; round++) {
    if (!att.some(alive) || perdu()) break;

    // ── 0. On descend du rempart quand la cour cède ────────────────────────
    // ⚠️ TOUS ENSEMBLE, et seulement les non-balistes : une baliste est de la
    // maçonnerie, elle ne descend pas. Descendre par unité demanderait un critère
    // individuel qui n’existe pas — la cour tient ou ne tient pas.
    if (yardIsFalling(def, att)) {
      for (const d of def) {
        if (d.origin === 'turret' || !onRampart(d)) continue;
        d.post = 'yard';
        log.push({ round, kind: 'descend', to: d.id });
      }
    }

    // ── 1. Les tireurs du rempart ──────────────────────────────────────────
    // ⚠️ UNE BALISTE NE TIRE PLUS DANS SA PROPRE COUR (décision de l’utilisateur, et
    // c’est la fiction qui a raison : on n’envoie pas un trait de siège au milieu de ses
    // propres hommes). `turretInsideShare` — la fraction d’en face — disparaît, et avec
    // elle le dernier cas particulier de cette boucle : `defenderTargets` est désormais
    // seule autorité pour TOUT LE MONDE.
    // ⚠️ Mesuré : pris isolément, c’est un BUFF de la défense (+0 à +25 points de tenue),
    // parce que les traits gaspillés sur 4 corps déjà pris en tenaille repartent sur ceux
    // qui cassent le rempart. C’est l’ARC qui retire de la puissance de feu, pas ceci.
    for (const d of def.filter((x) => x.kind === 'ranged' && alive(x))) {
      volley(d, defenderTargets(d, att), d.damage, round, log, rng);
    }

    // ── 2. La mêlée défensive tient la brèche ──────────────────────────────
    for (const d of def.filter((x) => x.kind === 'melee' && alive(x))) {
      const cible = pickTarget(defenderTargets(d, att), rng);
      if (cible)
        strike(d, cible, d.damage, round, log, w.maxPv > 0 ? Math.max(0, w.pv) / w.maxPv : 0);
    }

    // ── 3. Les assaillants ─────────────────────────────────────────────────
    // ⚠️ Le front devant le mur est LIMITÉ (cf. `wallFront`) : les premiers cognent, les
    // autres patientent sous le feu. C'est ce qui permet à une muraille de tenir face à
    // une armée — et sans quoi la brèche s'ouvrait à tous les coups (mesuré).
    let front = BATTLE.wallFront;
    for (const a of att.filter(alive)) {
      // ⚠️ `attackerTargets` est la SEULE autorité sur « ce que je peux atteindre ».
      // La boucle testait d'abord « mêlée dehors ? » et n'appelait la fonction qu'ensuite :
      // sa garde devenait INATTEIGNABLE, donc invérifiable — une mutation qui la retirait
      // passait au vert. Même défaut que le plafond de réduction du mur (v0.753). Ici,
      // une liste vide EST le signal : l'homme d'armes n'a rien devant lui, alors il
      // cogne le mur ; le tireur, lui, attend son heure.
      const cibles = attackerTargets(a, def, width);
      if (!cibles.length) {
        // ⚠️ `dist === 0` : on ne cogne pas un mur qu’on n’a pas encore atteint. Sans
        // cette borne, toute l’armée frappait dès le premier tour et le terrain
        // d’approche n’aurait été qu’un décor.
        if (a.kind === 'melee' && !a.inside && (a.dist ?? 0) === 0 && front > 0) {
          // ⚠️ On décompte la PLACE, pas les têtes — et on n'exige pas qu'elle tienne
          // entièrement : le dernier arrivé se glisse dans ce qui reste. Refuser un corps
          // trop encombrant pour le reliquat rendrait le front dépendant de l'ORDRE des
          // unités, qui n'est pas une mécanique de jeu.
          front -= Math.max(0.05, a.bulk ?? 1);
          const dealt = Math.min(w.pv, Math.max(1, Math.round(a.damage)));
          w.pv -= dealt;
          log.push({ round, kind: 'wall', from: a.id, amount: dealt });
        }
        continue;
      }
      // ⚠️ Un archer qui tire À TRAVERS la brèche ne donne qu'une fraction de son feu :
      // on tire dans un couloir, pas sur une ligne.
      // ⚠️ « Tirer à travers la brèche » veut dire « le rempart ne répond plus » — donc
      // `onRampart`, et non « plus aucun tireur adverse » : depuis la descente, un archer
      // vivant peut très bien avoir quitté le mur.
      const through = a.kind === 'ranged' && !a.inside && !def.some(onRampart);
      const puissance = a.damage * (through ? BATTLE.rangedThroughBreach : 1);
      const abri = w.maxPv > 0 ? Math.max(0, w.pv) / w.maxPv : 0;
      // ⚠️ Le tir s'étale sur ce qui reste debout, des deux côtés (cf. `volley`) ; la
      // mêlée, elle, s'arrête au corps qu'elle a devant elle.
      if (a.kind === 'ranged') volley(a, cibles, puissance, round, log, rng, abri);
      else {
        const cible = pickTarget(cibles, rng);
        if (cible) strike(a, cible, puissance, round, log, abri);
      }
    }

    // ── 4. La brèche s'ouvre, s'élargit, et on la franchit ─────────────────
    const nouvelle = breachWidth(w);
    if (nouvelle > width) {
      if (breachRound === null) breachRound = round;
      log.push({ round, kind: 'breach', width: nouvelle });
      width = nouvelle;
    }
    if (width > 0) {
      // ⚠️ Le GOULOT : on ne complète que jusqu'à la largeur, et seuls les hommes
      // d'armes ARRIVÉS AU PIED DU MUR entrent. Les tireurs restent dehors — ils tirent
      // à travers ; ceux qui traversent encore le terrain ne sont nulle part près d'une
      // brèche.
      const dedans = att.filter((a) => a.inside && alive(a)).length;
      const dehors = att.filter(
        (a) => !a.inside && a.kind === 'melee' && (a.dist ?? 0) === 0 && alive(a),
      );
      for (let i = 0; i < Math.min(width - dedans, dehors.length); i++) {
        dehors[i]!.inside = true;
        entered++;
        log.push({ round, kind: 'enter', from: dehors[i]!.id });
      }
    }

    // ── 5. On avance ───────────────────────────────────────────────────────
    // ⚠️ EN FIN DE TOUR : l'armée agit d'abord depuis là où elle est, puis progresse.
    // Sinon elle aurait déjà gagné un pas avant que la première salve ne parte, et le
    // terrain vaudrait un pas de moins que ce qu'il annonce.
    for (const a of att) {
      if (!alive(a) || a.inside) continue;
      const d = a.dist ?? 0;
      if (d > 0) a.dist = Math.max(0, d - Math.max(1, a.speed ?? 1));
    }
  }

  const killed = att.filter((a) => !alive(a)).length;
  const held = !perdu();
  return {
    held,
    rounds: round,
    breached: breachRound !== null,
    breachRound,
    killed,
    total,
    entered,
    wallPv: Math.max(0, w.pv),
    // Les défenseurs tombés sont BLESSÉS — le mot compte : rien n'est perdu.
    wounded: def.filter((d) => !alive(d)).map((d) => d.id),
    log,
  };
}
