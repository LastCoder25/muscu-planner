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
  /** Combien d'assaillants tiennent DE FRONT dans une brèche grande ouverte.
   *  ⚠️ C'est LA variable d'équilibrage de la phase 2 : elle décide si une poignée de
   *  défenseurs tient ou se fait submerger. */
  breachMaxWidth: 4,
  /** Part du feu des tourelles qui peut encore frapper ce qui est ENTRÉ. Ce sont celles
   *  à l'OPPOSÉ de la brèche : elles seules ont l'angle pour tirer dans la cour sans
   *  arroser leurs propres défenseurs. ⚠️ Fraction DÉRIVÉE de la géométrie (3 tourelles
   *  sur 8 se font face à travers l'enceinte), pas un réglage sorti du chapeau. */
  turretInsideShare: 3 / 8,
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
  kind: 'hit' | 'wall' | 'breach' | 'enter' | 'down';
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

/** Ce qu'un ASSAILLANT peut atteindre. */
function attackerTargets(u: SiegeUnit, def: SiegeUnit[], breach: number): SiegeUnit[] {
  if (u.kind === 'melee') {
    // ⚠️ Dehors, un homme d'armes ne peut RIEN faire d'autre que cogner le mur : c'est
    // ce qui rend une armée sans béliers incapable d'entrer. Entré, il frappe ce qui lui
    // barre le passage — la mêlée d'abord, les tireurs seulement s'il n'y a plus personne
    // devant (c'est tout l'intérêt d'avoir des défenseurs au corps à corps).
    if (!u.inside) return [];
    const devant = def.filter((d) => d.kind === 'melee' && alive(d));
    return devant.length ? devant : def.filter(alive);
  }
  // Un tireur vise les tireurs d'en face : ce sont eux qui le tuent, et les faire taire
  // est la seule façon d'ouvrir la voie aux siens.
  const tireurs = def.filter((d) => d.kind === 'ranged' && alive(d));
  if (tireurs.length) return tireurs;
  // Plus de tireurs adverses : on arrose ce qui reste, mais seulement si la brèche
  // offre une ligne de vue.
  return breach > 0 ? def.filter(alive) : [];
}

/** Ce qu'un DÉFENSEUR peut atteindre. */
function defenderTargets(u: SiegeUnit, att: SiegeUnit[], breach: number): SiegeUnit[] {
  if (u.kind === 'melee') {
    // La mêlée défensive n'existe que dans la cour : elle attend la brèche. Tant que le
    // mur tient, elle ne sert à rien — et c'est le prix de l'assurance.
    return att.filter((a) => a.inside && alive(a));
  }
  if (u.origin === 'turret') {
    // Une tourelle balaie l'extérieur. Ce qui est ENTRÉ n'est atteignable que par celles
    // d'en face (cf. `turretInsideShare`), traité à part dans le tour.
    return att.filter((a) => !a.inside && alive(a));
  }
  // Les autres tireurs (aventuriers, héros à distance) sont sur le rempart, puis
  // redescendent : ils voient tout.
  void breach;
  return att.filter(alive);
}

function strike(
  from: SiegeUnit,
  to: SiegeUnit,
  amount: number,
  round: number,
  log: BattleEvent[],
  /** Intégrité du rempart (0..1) : ce qui reste de l’abri. */
  shelter = 0,
) {
  // ⚠️ Le plancher à 1 s’applique APRÈS l’abri : un coup touche toujours, sinon une
  // armure élevée rendrait une unité invulnérable et la bataille ne finirait jamais.
  const soften = 1 - Math.min(0.9, Math.max(0, (to.armor ?? 0) * Math.max(0, shelter)));
  const dealt = Math.min(to.pv, Math.max(1, Math.round(amount * soften)));
  to.pv -= dealt;
  log.push({ round, kind: 'hit', from: from.id, to: to.id, amount: dealt });
  if (to.pv <= 0) log.push({ round, kind: 'down', to: to.id });
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

  /** ⚠️ ON NE PERD QUE SI L'ENNEMI EST ENTRÉ. Trouvé par un test : une armée d'ARCHERS
   *  SEULS faisait taire les tourelles puis « prenait » la ville — alors que le mur était
   *  INTACT et qu'aucun assaillant n'avait posé le pied dedans. Un siège qui ne perce pas
   *  est un siège repoussé, même si les remparts sont muets.
   *  Corollaire : tant que le mur tient, la bataille CONTINUE sans défenseurs vivants —
   *  les béliers le démolissent sans opposition, et c'est alors qu'on peut tomber. */
  const perdu = () => w.pv <= 0 && !def.some(alive);

  for (; round < BATTLE.maxRounds; round++) {
    if (!att.some(alive) || perdu()) break;

    // ── 1. Les tireurs du rempart ──────────────────────────────────────────
    // ⚠️ Les tourelles d'en face tirent dans la cour : on tire au sort QUI parmi elles,
    // sur la graine, plutôt que de prendre les trois premières — l'ordre de déclaration
    // ne doit jamais devenir une mécanique.
    const tourelles = def.filter((d) => d.origin === 'turret' && alive(d));
    const versDedans = new Set(
      tourelles.filter(() => rng() < BATTLE.turretInsideShare).map((t) => t.id),
    );
    for (const d of def.filter((x) => x.kind === 'ranged' && alive(x))) {
      const dedans = d.origin === 'turret' && versDedans.has(d.id);
      const cibles = dedans
        ? att.filter((a) => a.inside && alive(a))
        : defenderTargets(d, att, width);
      const cible = pickTarget(cibles, rng);
      if (cible)
        strike(d, cible, d.damage, round, log, w.maxPv > 0 ? Math.max(0, w.pv) / w.maxPv : 0);
    }

    // ── 2. La mêlée défensive tient la brèche ──────────────────────────────
    for (const d of def.filter((x) => x.kind === 'melee' && alive(x))) {
      const cible = pickTarget(defenderTargets(d, att, width), rng);
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
        if (a.kind === 'melee' && !a.inside && front > 0) {
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
      const through =
        a.kind === 'ranged' && !a.inside && !def.some((d) => d.kind === 'ranged' && alive(d));
      const cible = pickTarget(cibles, rng);
      if (cible)
        strike(
          a,
          cible,
          a.damage * (through ? BATTLE.rangedThroughBreach : 1),
          round,
          log,
          w.maxPv > 0 ? Math.max(0, w.pv) / w.maxPv : 0,
        );
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
      // d'armes entrent. Les tireurs restent dehors — ils tirent à travers.
      const dedans = att.filter((a) => a.inside && alive(a)).length;
      const dehors = att.filter((a) => !a.inside && a.kind === 'melee' && alive(a));
      for (let i = 0; i < Math.min(width - dedans, dehors.length); i++) {
        dehors[i]!.inside = true;
        entered++;
        log.push({ round, kind: 'enter', from: dehors[i]!.id });
      }
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
