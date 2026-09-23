/**
 * 🎮 LES TROIS MINI-JEUX DU GAINAGE — les règles, sans une ligne d'habillage.
 *
 * Tenir 45 secondes en regardant un chrono descendre, c'est le double. Ces jeux existent
 * pour occuper l'esprit pendant l'effort ; le chrono, lui, reste affiché (décision de
 * l'utilisateur) — c'est le jeu qui détourne le regard, pas l'app qui cache le temps.
 *
 * ⚠️ LA POSTURE DÉCIDE DE TOUT : en gainage le téléphone est TENU à deux mains,
 * au-dessus du visage, coudes au sol. Donc deux pouces, deux grandes zones en bas,
 * TAP SIMPLE — jamais de balayage, jamais de cible fine, jamais de geste ample. On tremble
 * en gainage, et un geste brusque fait lâcher le téléphone sur son nez.
 *
 * ⚠️ TOLÉRANTS PAR CONSTRUCTION : rater ne retire jamais rien, il n'y a ni vie ni fin
 * anticipée. On ne punit pas quelqu'un qui est en train de souffrir — un raté coûte
 * seulement les points qu'il n'apporte pas.
 *
 * ⚠️ LE PLAN EST SEEDÉ ET GÉNÉRÉ D'AVANCE (patron d'`arenaStage`/`siegeStage`) : la lib
 * produit les SOLLICITATIONS, l'écran ne fait que les jouer. La différence avec une mise
 * en scène, c'est qu'ici le joueur agit : l'issue n'est PAS écrite, seul le déroulé l'est.
 * Le score est donc une fonction pure du couple (plan, réponses), donc rejouable et testable.
 */
import { mulberry32 } from './combat';

export type HoldGameId = 'repousse' | 'cadence' | 'tri';
export type HoldSide = 'left' | 'right';

/** Un objet qui tombe dans le Tri : à garder, ou à recycler. */
export type HoldItemKind = 'keep' | 'scrap';

export interface HoldGameDef {
  id: HoldGameId;
  emoji: string;
  name: string;
  /** La règle, en une phrase — AFFICHÉE EN PERMANENCE, pas seulement au départ. */
  rule: string;
  /** Ce que le jeu sollicite : c'est ce qui fait choisir, pas le décor. */
  skill: string;
}

/**
 * Trois jeux, TROIS TYPES D'ATTENTION — c'est le seul critère qui justifie d'en avoir
 * trois plutôt qu'un repeint. Le réflexe, le rythme et la décision ne marchent pas sur
 * les mêmes gens, et chacun donne une sensation d'effort différente.
 */
export const HOLD_GAMES: readonly HoldGameDef[] = [
  {
    id: 'repousse',
    emoji: '🛡️',
    name: 'Repousse',
    rule: 'Tape du côté où ils arrivent.',
    skill: 'Réflexe',
  },
  {
    id: 'cadence',
    emoji: '🔨',
    name: 'Cadence',
    rule: "Frappe quand le marteau touche l'enclume.",
    skill: 'Rythme',
  },
  {
    id: 'tri',
    emoji: '🎒',
    name: 'Tri',
    rule: 'Garde à gauche, recycle à droite — quel que soit le côté où ça tombe.',
    skill: 'Décision',
  },
];

export function holdGame(id: HoldGameId): HoldGameDef {
  const g = HOLD_GAMES.find((x) => x.id === id);
  if (!g) throw new Error(`jeu inconnu : ${id}`);
  return g;
}

/**
 * ⚠️ LES EXOS OÙ LE JEU A DROIT DE CITÉ — une table EXPLICITE, jamais une convention de
 * nom ni une heuristique sur l'unité (patron d'`exerciseImages`). Un défi peut se créer
 * sur n'importe quel exercice au temps, corde à sauter comprise : la seule question qui
 * compte est « les mains sont-elles libres de tenir le téléphone ? ».
 *
 * ⚠️ LE GAINAGE LATÉRAL EN EST ABSENT À DESSEIN : une seule main y est libre, donc un
 * seul pouce. Plutôt que de livrer une version dégradée, on ne propose rien — le chrono
 * nu reste parfaitement valable.
 */
export const HOLD_GAME_EXERCISES: readonly string[] = [
  'ex_plank', // Gainage (avant-bras)
  'ex_tn_plank', // Planche (avant-bras)
  'ex_wall_sit', // Chaise (wall sit) — mains totalement libres
];

export function holdGameAllowed(exerciseId: string | null | undefined): boolean {
  return !!exerciseId && HOLD_GAME_EXERCISES.includes(exerciseId);
}

export interface HoldBeat {
  id: number;
  /** Quand la réponse est attendue, en ms depuis le départ du chrono. */
  at: number;
  /** D'où ça vient — ce que l'écran DESSINE. */
  from: HoldSide;
  /** Quel côté taper. Égal à `from` partout sauf dans le Tri. */
  answer: HoldSide;
  /** Tolérance de part et d'autre de `at`. */
  windowMs: number;
  /** Tri seulement : ce qui décide de la réponse. */
  kind?: HoldItemKind;
}

export interface HoldPlan {
  game: HoldGameId;
  durationSec: number;
  beats: HoldBeat[];
}

export const HOLD = {
  /**
   * ⚠️ LA MONTÉE EST EXPONENTIELLE, PAS LINÉAIRE : elle doit rester douce au début et
   * devenir franche sur la fin, là où on lâche. Exprimée en FRACTION de la durée et non
   * en « 10 dernières secondes », pour valoir autant sur 20 s que sur 60.
   */
  rampExp: 1.6,
  /**
   * ⚠️ LE PLAN VA AU-DELÀ DE LA DURÉE VISÉE. Un gainage n'a pas de fin imposée : on tient
   * ce qu'on peut, et se surpasser est précisément le moment qu'il ne faut PAS laisser
   * sans jeu. La rampe, elle, reste calée sur la cible et plafonne — au-delà, le rythme
   * demeure à son maximum plutôt que de s'emballer sans fin.
   */
  overrun: 2,
  /** Jamais plus de N fois le même côté d'affilée : au-delà, ça se lit comme une panne. */
  maxSameSide: 3,
  /** Une frappe dans cette fraction de la fenêtre est « parfaite ». */
  perfectShare: 0.35,
  points: { perfect: 15, good: 10 },
  /** Bonus tous les N enchaînements réussis. */
  streakEvery: 5,
  streakBonus: 5,
} as const;

interface Tuning {
  /** Intervalle entre deux sollicitations, au départ puis à la fin. */
  gapStart: number;
  gapEnd: number;
  /** Irrégularité de l'intervalle (0 = métronome). */
  jitter: number;
  /** Fenêtre de réponse, au départ puis à la fin. */
  windowStart: number;
  windowEnd: number;
  /** Combien de temps à l'avance la sollicitation est VISIBLE. */
  leadMs: number;
}

/**
 * ⚠️ LE RÉGLAGE EST CE QUI DISTINGUE VRAIMENT LES TROIS JEUX.
 *
 * `cadence` a un jitter NUL, et ce n'est pas un détail : sans régularité il n'y a pas de
 * rythme, donc pas d'anticipation, donc plus qu'un Repousse mal déguisé. C'est aussi ce
 * qui lui donne son seul bénéfice physique — un tempo régulier entraîne la respiration,
 * quand l'erreur classique du gainage est de bloquer son souffle.
 *
 * `tri` est le plus LENT des trois alors qu'il est le plus difficile : sa charge est
 * cognitive, il faut le temps de lire l'objet avant de décider. Le presser ne le rendrait
 * pas plus intéressant, juste injouable. ⚠️ C'est aussi pourquoi il se voit venir de plus
 * LOIN que les deux autres : on doit pouvoir lire l'objet avant qu'il n'arrive.
 */
const TUNING: Record<HoldGameId, Tuning> = {
  repousse: {
    gapStart: 1500,
    gapEnd: 750,
    jitter: 0.35,
    windowStart: 1100,
    windowEnd: 650,
    leadMs: 1200,
  },
  cadence: {
    gapStart: 900,
    gapEnd: 550,
    jitter: 0,
    windowStart: 450,
    windowEnd: 320,
    leadMs: 1200,
  },
  tri: {
    gapStart: 1700,
    gapEnd: 1000,
    jitter: 0.2,
    windowStart: 1400,
    windowEnd: 900,
    leadMs: 1700,
  },
};

/** Combien de temps à l'avance une sollicitation est visible, pour ce jeu. */
export function holdLeadMs(game: HoldGameId): number {
  return TUNING[game].leadMs;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Construit le déroulé d'une partie. Déterministe : même graine, même plan. */
export function buildHoldPlan(game: HoldGameId, durationSec: number, seed: number): HoldPlan {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0 || 1);
  const t = TUNING[game];
  const target = Math.max(0, durationSec) * 1000;
  // On génère plus loin que la cible : celui qui se surpasse ne doit pas se retrouver
  // seul avec son chrono au moment précis où il a le plus besoin d'être occupé.
  const total = target * HOLD.overrun;
  const beats: HoldBeat[] = [];

  let at = 0;
  let sameSide = 0;
  let last: HoldSide | null = null;

  for (;;) {
    // La difficulté suit le TEMPS écoulé, jamais le nombre de sollicitations déjà tombées.
    // ⚠️ Rapportée à la CIBLE et plafonnée : au-delà, le rythme reste au maximum atteint
    // plutôt que de s'emballer indéfiniment.
    const p = target > 0 ? Math.min(1, at / target) : 1;
    const eased = Math.pow(p, HOLD.rampExp);
    const gap = lerp(t.gapStart, t.gapEnd, eased);
    at += t.jitter > 0 ? gap * (1 + (rng() * 2 - 1) * t.jitter) : gap;
    if (at >= total) break;

    const windowMs = lerp(t.windowStart, t.windowEnd, eased);

    let from: HoldSide = rng() < 0.5 ? 'left' : 'right';
    // Le garde anti-répétition porte sur le CÔTÉ DESSINÉ : c'est lui qu'on voit.
    if (from === last && sameSide >= HOLD.maxSameSide) from = from === 'left' ? 'right' : 'left';
    sameSide = from === last ? sameSide + 1 : 1;
    last = from;

    const beat: HoldBeat = {
      id: beats.length,
      at: Math.round(at),
      from,
      answer: from,
      windowMs: Math.round(windowMs),
    };

    if (game === 'tri') {
      const kind: HoldItemKind = rng() < 0.5 ? 'keep' : 'scrap';
      beat.kind = kind;
      beat.answer = kind === 'keep' ? 'left' : 'right';
    }

    beats.push(beat);
  }

  return { game, durationSec, beats };
}

export type HoldVerdict = 'perfect' | 'good' | 'wrong' | 'late';

/** Ce que vaut une frappe. Hors fenêtre → `late` : l'écran ne devrait pas la router. */
export function judgeTap(beat: HoldBeat, side: HoldSide, at: number): HoldVerdict {
  const off = Math.abs(at - beat.at);
  if (off > beat.windowMs) return 'late';
  if (side !== beat.answer) return 'wrong';
  return off <= beat.windowMs * HOLD.perfectShare ? 'perfect' : 'good';
}

export interface ActiveBeat {
  beat: HoldBeat;
  /** 0 à l'apparition, 1 au moment de répondre, au-delà tant que la fenêtre dure. */
  progress: number;
}

/**
 * Ce qu'il y a à DESSINER à cet instant : les sollicitations déjà visibles et pas encore
 * résolues. ⚠️ En lib et non dans la scène : c'est du gameplay — « à quel moment ça
 * devient visible » décide de ce qu'on peut anticiper. Trois scènes qui en auraient
 * chacune leur idée ne joueraient pas au même jeu.
 */
export function activeBeats(
  plan: HoldPlan,
  nowMs: number,
  resolved: ReadonlySet<number>,
): ActiveBeat[] {
  const lead = holdLeadMs(plan.game);
  const out: ActiveBeat[] = [];
  for (const beat of plan.beats) {
    if (resolved.has(beat.id)) continue;
    const from = beat.at - lead;
    if (nowMs < from || nowMs > beat.at + beat.windowMs) continue;
    out.push({ beat, progress: (nowMs - from) / lead });
  }
  return out;
}

/**
 * Quelle sollicitation une frappe vise : la plus proche encore ouverte.
 *
 * ⚠️ LE CÔTÉ TAPÉ N'ENTRE PAS DANS LE CHOIX, et c'est la règle qui fait exister le Tri :
 * viser « le beat dont la réponse correspond » rendrait toute erreur impossible. On
 * désigne la sollicitation, puis `judgeTap` dit si on s'est trompé.
 */
export function targetBeat(
  plan: HoldPlan,
  nowMs: number,
  resolved: ReadonlySet<number>,
): HoldBeat | null {
  let best: HoldBeat | null = null;
  let bestOff = Infinity;
  for (const beat of plan.beats) {
    if (resolved.has(beat.id)) continue;
    const off = Math.abs(nowMs - beat.at);
    if (off > beat.windowMs) continue;
    if (off < bestOff) {
      best = beat;
      bestOff = off;
    }
  }
  return best;
}

export interface HoldTap {
  beatId: number;
  side: HoldSide;
  at: number;
}

export interface HoldScore {
  score: number;
  hits: number;
  perfects: number;
  wrongs: number;
  misses: number;
  bestStreak: number;
}

/**
 * Rejoue les réponses contre le plan. ⚠️ Une frappe ratée ou fautive ne RETIRE jamais de
 * points : elle coupe seulement la série. C'est toute la tolérance du système.
 *
 * ⚠️ `untilMs` = l'instant où l'on a lâché. Le plan va plus loin que la durée visée, donc
 * sans cette borne quelqu'un qui tient 30 s sur une cible de 45 récolterait des dizaines
 * de « manqués » pour des sollicitations qui ne sont jamais tombées. Une sollicitation
 * dont la fenêtre était encore ouverte à l'arrêt n'est ni réussie ni ratée : elle
 * n'a pas eu sa chance.
 */
export function scoreHold(plan: HoldPlan, taps: readonly HoldTap[], untilMs = Infinity): HoldScore {
  const byBeat = new Map<number, HoldTap>();
  for (const tap of taps) if (!byBeat.has(tap.beatId)) byBeat.set(tap.beatId, tap);

  let score = 0;
  let hits = 0;
  let perfects = 0;
  let wrongs = 0;
  let misses = 0;
  let streak = 0;
  let bestStreak = 0;

  for (const beat of plan.beats) {
    const tap = byBeat.get(beat.id);
    // Ni jugée ni comptée : on s'est arrêté avant qu'elle ait eu sa chance.
    if (!tap && beat.at + beat.windowMs > untilMs) continue;
    const verdict = tap ? judgeTap(beat, tap.side, tap.at) : 'late';

    if (verdict === 'perfect' || verdict === 'good') {
      hits += 1;
      if (verdict === 'perfect') perfects += 1;
      score += HOLD.points[verdict];
      streak += 1;
      if (streak % HOLD.streakEvery === 0) score += HOLD.streakBonus;
      if (streak > bestStreak) bestStreak = streak;
    } else {
      if (verdict === 'wrong') wrongs += 1;
      else misses += 1;
      streak = 0;
    }
  }

  return { score, hits, perfects, wrongs, misses, bestStreak };
}
