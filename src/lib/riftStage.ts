// riftStage.ts — 🕳️ LA SALLE DU GARDIEN : transforme une incursion RÉSOLUE en une
// chorégraphie spatiale, pure et déterministe.
//
// ⚠️ RÈGLE FONDATRICE, la même qu'`arenaStage` et `siegeStage` : ce module ne décide RIEN
// du combat. Il place dans l'espace ce que `simulateIncursion` a déjà tranché — les
// monstres abattus, la porte, le gardien et la courbe de PV sont LUS, jamais recalculés.
// La calibration mesurée des failles (`RIFT_RELIEF`, `riftCalibration.test`) n'est pas
// touchée d'un bit.
//
// ## Ce qu'il montre, et pourquoi ces trois choses-là
//
// 1. **L'ATTRITION** — les PV du groupe descendent de monstre en monstre, avec la maigre
//    régénération entre deux (`RIFT_RUN.regen`). C'est la seule tension d'une incursion.
// 2. **LA RAMPE DE PROFONDEUR** — la taille d'un corps est DÉRIVÉE de `riftRamp`, le
//    multiplicateur de force que le combat applique vraiment. Les monstres GRANDISSENT à
//    mesure qu'on s'enfonce : une mécanique réelle, jusqu'ici invisible.
// 3. **LA PORTE** — elle ne s'ouvre que si tous les monstres sont tombés, ce qui distingue
//    une faille du Labyrinthe (là-bas le boss attend au dernier étage, quoi qu'il arrive).
//
// ## ⚠️ Une granularité de RENCONTRE, pas de coup
//
// `arenaStage` rejoue le log coup par coup parce que l'arène s'ouvre aussitôt. Un rapport
// d'incursion, lui, dort dans la boîte 📬 (30 messages) : y persister les logs complets de
// treize combats gonflerait la ligne du personnage pour un gain d'une fraction de seconde
// d'animation. Un battement vaut donc UNE rencontre, et le sillage de PV (`pvTrail`, 13
// nombres) suffit à dire l'attrition sans rien inventer.

import { mulberry32 } from './combat';
import type { PartyResult } from './expedition';
import type { RaidFaction } from './raid';
import { RIFT_RUN, riftDepth, riftFoeIdentity, riftRamp } from './rift';

export const RIFT_STAGE = {
  /** Le premier et le dernier monstre, en fraction de la largeur du terrain. */
  firstX: 0.12,
  lastX: 0.58,
  /** La porte du gardien, et sa salle derrière. */
  doorX: 0.7,
  bossX: 0.86,
  /**
   * L'axe de marche, en fraction de la hauteur. ⚠️ PAS le milieu de l'écran : les corps
   * sont POSÉS sur le sol, donc l'axe vit sous la ligne d'horizon. Le banc l'a montré —
   * centrés à 0,5, ils flottaient au-dessus d'une bande de sol vide.
   */
  axisY: 0.58,
  /**
   * Décalage vertical d'un corps par rapport à l'axe. ⚠️ Les corps ALTERNENT (un devant,
   * un derrière) : à douze monstres sur une demi-largeur, deux voisins ne sont séparés que
   * de ~0,04 en x — sans alternance ils se recouvriraient.
   */
  lane: 0.1,
  laneJitter: 0.06,
} as const;

/** Un corps sur le terrain. Coordonnées en fraction ([0,1]²) : le rendu reste responsive
 *  sans que le modèle connaisse le moindre pixel. */
interface RiftStageFoe {
  name: string;
  emoji: string;
  boss: boolean;
  /** Profondeur ABSOLUE dans la faille (0 à l'entrée → 1 au fond) — celle du moteur. */
  depth: number;
  /** Taille relative. ⚠️ DÉRIVÉE de `riftRamp`, jamais un barème d'affichage à part : ce
   *  qu'on voit grossir EST ce qui frappe plus fort. */
  scale: number;
  x: number;
  y: number;
  /** Ce corps est-il tombé au cours de l'incursion ? */
  down: boolean;
}

/** Une rencontre, placée dans le temps. */
interface RiftStageBeat {
  kind: 'foe' | 'door' | 'boss';
  /** Index dans `foes`. ⚠️ La porte ne désigne aucun corps : −1. */
  foe: number;
  pvBefore: number;
  pvAfter: number;
  /** Le corps tombe sur ce battement. */
  down: boolean;
  /** C'est ici que le groupe s'arrête — il n'ira pas plus loin. */
  fatal: boolean;
}

/** Ce qu'une incursion a laissé, et qui suffit à la rejouer. */
export interface RiftStageInput {
  level: number;
  faction: RaidFaction;
  /** Monstres présents à l'entrée, gardien NON compris. */
  population: number;
  /** Monstres abattus — le gardien n'en fait jamais partie. */
  killed: number;
  /** La faille a été refermée : le gardien est tombé. */
  cleared: boolean;
  maxPv: number;
  /** PV après chaque rencontre. Vide pour un rapport d'avant la v0.977. */
  pvTrail: readonly number[];
}

export interface RiftStage {
  foes: RiftStageFoe[];
  beats: RiftStageBeat[];
  maxPv: number;
  cleared: boolean;
  /** Tous les monstres sont tombés : la porte s'ouvre. */
  doorOpens: boolean;
  doorX: number;
  /** ⚠️ Faux quand le sillage manque (rapport d'avant) : le rendu ne peint alors AUCUNE
   *  barre de vie, plutôt qu'une courbe qu'il aurait fallu inventer. */
  hasPv: boolean;
}

/**
 * Ce qu'il faut pour rejouer CE rapport — ou `null` si ce n'en est pas un.
 *
 * ⚠️ `party.rift` est la SEULE marque d'une incursion (cf. sa doc) : c'est elle qui décide
 * ici comme elle décide du verbe employé par le rapport. Deux façons de reconnaître une
 * faille finiraient par se contredire — le bouton de rejeu apparaîtrait sur un camp, ou
 * l'écran annoncerait « camp pris » sur une faille refermée.
 *
 * ⚠️ Rend `null` pour les rapports d'avant la v0.977 : ils n'ont pas de sillage, donc rien
 * à rejouer. On ne fabrique pas une incursion plausible à partir d'un compte d'abattus.
 */
export function riftStageInputOf(party: PartyResult): RiftStageInput | null {
  if (!party.rift) return null;
  return {
    level: party.rift.level,
    faction: party.faction,
    population: party.foes,
    killed: party.slain,
    cleared: party.win,
    maxPv: party.rift.maxPv,
    pvTrail: party.rift.pvTrail,
  };
}

/** Où se tient le k-ième monstre sur l'axe de marche. */
function laneX(k: number, pop: number): number {
  const { firstX, lastX } = RIFT_STAGE;
  if (pop <= 1) return (firstX + lastX) / 2;
  return firstX + ((lastX - firstX) * k) / (pop - 1);
}

/** De quel côté de l'axe, et de combien. ⚠️ L'alternance n'est pas cosmétique : c'est elle
 *  qui empêche deux voisins de se recouvrir (cf. `RIFT_STAGE.lane`). */
function laneY(k: number, rng: () => number): number {
  const side = k % 2 === 0 ? -1 : 1;
  return RIFT_STAGE.axisY + side * (RIFT_STAGE.lane + rng() * RIFT_STAGE.laneJitter);
}

/**
 * Construit la chorégraphie d'une incursion.
 *
 * `seed` ne pilote que le COSMÉTIQUE (le zigzag des corps) — jamais l'issue, déjà figée.
 */
export function buildRiftStage(input: RiftStageInput, seed: number): RiftStage {
  const rng = mulberry32((seed ^ 0x5eed1f7a) >>> 0 || 1);
  const pop = Math.max(0, Math.round(input.population));
  // ⚠️ PAS DE PLAFOND À `pop` ICI, et c'est délibéré : un tel clamp serait un garde
  // DORMANT (une mutation l'a montré — le retirer ne change rien). La boucle des corps est
  // bornée par `pop`, et `doorOpens` teste `>=` : un `killed` aberrant se comporte donc
  // déjà comme `killed === pop`. Le plancher, lui, MORD (un nombre négatif ferait une
  // scène vide) — d'où un test sur celui-là, et rien sur l'autre.
  const killed = Math.max(0, Math.round(input.killed));
  const doorOpens = killed >= pop;
  const cleared = doorOpens && input.cleared;

  const foes: RiftStageFoe[] = [];
  for (let k = 0; k < pop; k++) {
    const depth = riftDepth(k);
    const id = riftFoeIdentity(input.faction, k, false);
    foes.push({
      name: id.name,
      emoji: id.emoji,
      boss: false,
      depth,
      scale: riftRamp(depth),
      x: laneX(k, pop),
      y: laneY(k, rng),
      down: k < killed,
    });
  }
  // Le gardien est TOUJOURS sur le terrain, même si le groupe n'est jamais arrivé jusqu'à
  // lui : c'est lui qu'on vient chercher, et le voir au fond dit ce qui restait à faire.
  const bossId = riftFoeIdentity(input.faction, pop, true);
  foes.push({
    name: bossId.name,
    emoji: bossId.emoji,
    boss: true,
    depth: 1,
    // ⚠️ La rampe ne s'applique pas au gardien (cf. `riftFoe`) : sa force est son POIDS.
    // Une silhouette se perçoit par sa surface, donc la racine du poids en est la taille.
    scale: Math.sqrt(RIFT_RUN.bossWeight),
    x: RIFT_STAGE.bossX,
    y: RIFT_STAGE.axisY,
    down: cleared,
  });

  const trail = input.pvTrail;
  const hasPv = trail.length > 0 && input.maxPv > 0;
  const beats: RiftStageBeat[] = [];
  let pv = input.maxPv;
  let t = 0;
  const step = (): number => (hasPv ? (trail[t++] ?? 0) : pv);

  // Les monstres RÉELLEMENT affrontés : ceux qui sont tombés, plus celui qui a arrêté le
  // groupe quand il y en a un.
  const faced = doorOpens ? pop : killed + 1;
  for (let k = 0; k < faced; k++) {
    const down = k < killed;
    const before = pv;
    pv = step();
    beats.push({ kind: 'foe', foe: k, pvBefore: before, pvAfter: pv, down, fatal: !down });
  }

  if (doorOpens) {
    beats.push({ kind: 'door', foe: -1, pvBefore: pv, pvAfter: pv, down: false, fatal: false });
    const before = pv;
    pv = step();
    beats.push({
      kind: 'boss',
      foe: foes.length - 1,
      pvBefore: before,
      pvAfter: pv,
      down: cleared,
      fatal: !cleared,
    });
  }

  return {
    foes,
    beats,
    maxPv: input.maxPv,
    cleared,
    doorOpens,
    doorX: RIFT_STAGE.doorX,
    hasPv,
  };
}
