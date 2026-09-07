// arenaStage.ts — ARÈNE PHYSIQUE : transforme une run d'arène (`runArena`) en une
// CHORÉGRAPHIE spatiale, pure et déterministe.
//
// RÈGLE FONDATRICE : ce module ne décide RIEN du combat. Il ne fait que placer dans
// l'espace ce que `simulateCombat` a déjà tranché. Les vagues tenues, la courbe de PV
// et donc les récompenses restent identiques au bit près à la simulation abstraite —
// la calibration « le sport est le plafond » n'est pas touchée. C'est la même relation
// que CombatStage entretient avec le log d'un donjon, mais en 2 dimensions.
//
// Le seul apport est de VENTILER le monstre unique d'une vague en PLUSIEURS corps
// répartis autour du héros : leurs parts de PV se cumulent exactement au PV de la
// vague, si bien que le dernier corps tombe précisément quand la vague est gagnée.
import { mulberry32 } from './combat';
import type { CombatEvent } from './combat';
import type { ArenaRun } from './expedition';
import { pickLabyFoe, LABY_ROSTERS } from '@/data/labyrinthFoes';

/** Un corps ennemi sur le terrain. Coordonnées en fraction du terrain ([0,1]²,
 *  le héros démarre au centre) → le rendu reste responsive sans toucher au modèle. */
export interface StageFoe {
  name: string;
  emoji: string;
  archetype: string; // identité visuelle (aura + idle), cf. CombatStage
  maxPv: number; // part du PV de la vague portée par ce corps
  x: number;
  y: number;
}

/** Un événement du log, rattaché à un corps et à une position dans le temps. */
export interface StageBeat {
  who: 'player' | 'monster';
  type: CombatEvent['type'];
  damage: number;
  heroPv: number;
  /** Dégâts CUMULÉS sur le pool de la vague après ce beat → le rendu en déduit les
   *  PV de chaque corps (monotone : un corps tombé ne se relève jamais). */
  dealt: number;
  /** Corps concerné : celui que le héros frappe, ou celui qui frappe le héros. */
  foeIdx: number;
  /** Corps qui TOMBENT sur ce beat. Dérivé des bornes cumulées, donc toujours d'accord
   *  avec les barres de vie — le rendu peut en faire un événement (éclat de mort,
   *  ralenti sur le dernier corps d'une vague) sans rien recalculer de son côté. */
  kills: number[];
}

export interface StageWave {
  wave: number;
  foes: StageFoe[];
  beats: StageBeat[];
  totalPv: number;
  cleared: boolean;
  /** Bornes cumulées des parts : le corps i est mort dès que `dealt >= cuts[i]`. */
  cuts: number[];
}

/** Nombre de corps qui surgissent autour du héros à la vague donnée (1-based).
 *  Croît par paliers puis plafonne : la pression monte, l'écran reste lisible. */
export function arenaFoeCount(wave: number): number {
  return Math.min(ARENA_STAGE.maxFoes, 3 + Math.floor(Math.max(0, wave - 1) / 2));
}

export const ARENA_STAGE = {
  maxFoes: 7,
  ringMin: 0.33, // rayon de spawn min (0.5 = le bord du terrain)
  ringMax: 0.46,
  squashY: 0.78, // terrain ovale, plus large que haut (lecture sur mobile)
} as const;

/** Répartit `total` en `n` parts entières dont la somme fait EXACTEMENT `total`. */
function splitPv(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Construit la chorégraphie d'une run d'arène. `seed` ne pilote que le COSMÉTIQUE
 *  (espèces, positions de spawn) — jamais l'issue, déjà figée par `run`. */
export function buildArenaStage(run: ArenaRun, seed: number, level: number): StageWave[] {
  const rng = mulberry32((seed ^ 0x2f6b1d3c) >>> 0);
  // Roster thématique : plus le héros est profond, plus la ménagerie est sinistre.
  const tier = Math.max(0, Math.min(LABY_ROSTERS.length - 1, Math.floor(Math.sqrt(level) * 0.9)));

  return run.fights.map((f) => {
    const totalPv = Math.max(1, f.maxPv);
    // Jamais plus de corps que de PV à répartir (sinon des corps à 0 PV).
    const n = Math.max(1, Math.min(arenaFoeCount(f.wave), totalPv));
    const shares = splitPv(totalPv, n);

    // Spawn en ANNEAU autour du héros : secteurs réguliers (personne n'apparaît sur
    // la tête d'un autre) + gigue seedée (jamais deux vagues identiques).
    const rot = rng() * Math.PI * 2;
    const foes: StageFoe[] = shares.map((maxPv, k) => {
      const a = rot + (k / n) * Math.PI * 2 + (rng() - 0.5) * ((Math.PI * 2) / n) * 0.45;
      const r = ARENA_STAGE.ringMin + rng() * (ARENA_STAGE.ringMax - ARENA_STAGE.ringMin);
      const kind = pickLabyFoe(rng, tier, false);
      return {
        name: kind.name,
        emoji: kind.emoji,
        archetype: kind.arch.arch, // identité VISUELLE (les multiplicateurs ne s'appliquent pas : cf. règle fondatrice)
        maxPv,
        x: 0.5 + Math.cos(a) * r,
        y: 0.5 + Math.sin(a) * r * ARENA_STAGE.squashY,
      };
    });

    // Bornes cumulées : le corps i meurt quand les dégâts cumulés atteignent cuts[i].
    const cuts: number[] = [];
    shares.reduce((acc, s) => {
      const end = acc + s;
      cuts.push(end);
      return end;
    }, 0);

    let dealt = 0;
    let biter = 0; // tourniquet : plusieurs corps mordent le héros, pas toujours le même
    const beats: StageBeat[] = f.log.map((e) => {
      // Monotone : les épines peuvent faire remonter le PV du pool ; on ne ressuscite
      // jamais un corps tombé (le cosmétique cède devant la cohérence).
      const prev = dealt;
      dealt = Math.max(dealt, totalPv - e.monsterPv);
      const alive: number[] = [];
      const kills: number[] = [];
      for (let i = 0; i < n; i++) {
        const nowAlive = dealt < cuts[i]!;
        if (nowAlive) alive.push(i);
        else if (prev < cuts[i]!) kills.push(i); // debout avant ce beat, à terre après
      }
      let foeIdx: number;
      if (e.who === 'player') {
        // Le héros s'en prend au premier corps encore debout : sa cible courante.
        foeIdx = alive[0] ?? n - 1;
      } else {
        foeIdx = alive.length ? alive[biter++ % alive.length]! : (alive[0] ?? n - 1);
      }
      return {
        who: e.who,
        type: e.type,
        damage: e.damage,
        heroPv: e.playerPv,
        dealt,
        foeIdx,
        kills,
      };
    });

    return { wave: f.wave, foes, beats, totalPv, cleared: f.win, cuts };
  });
}

/** PV restants du corps `i` après `dealt` dégâts cumulés sur la vague. */
export function foePvAt(wave: StageWave, i: number, dealt: number): number {
  const share = wave.foes[i]?.maxPv ?? 0;
  const end = wave.cuts[i] ?? 0;
  return Math.max(0, Math.min(share, end - dealt));
}
