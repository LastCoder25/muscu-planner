import { describe, it, expect } from 'vitest';
import { buildArenaStage, arenaFoeCount, foePvAt, ARENA_STAGE } from '@/lib/arenaStage';
import { runArena } from '@/lib/expedition';
import { playerWithGear } from '@/lib/items';
import { computeCharacter } from '@/lib/character';

function hero(level: number) {
  const xp = 200 * level * level;
  const c = computeCharacter(xp * 0.6, xp * 0.4, level * 400);
  return { fighter: playerWithGear('Toi', c, {}, {}, c.level.level), level: c.level.level };
}
function stageOf(level = 25, seed = 4242) {
  const h = hero(level);
  const run = runArena(h.fighter, h.level, seed);
  return { run, stage: buildArenaStage(run, seed, h.level) };
}

describe('arenaFoeCount', () => {
  it('croît par paliers puis plafonne', () => {
    expect(arenaFoeCount(1)).toBe(3);
    expect(arenaFoeCount(3)).toBe(4);
    expect(arenaFoeCount(5)).toBe(5);
    expect(arenaFoeCount(99)).toBe(ARENA_STAGE.maxFoes);
  });
  it('ne descend jamais quand la vague monte', () => {
    for (let w = 2; w < 40; w++)
      expect(arenaFoeCount(w)).toBeGreaterThanOrEqual(arenaFoeCount(w - 1));
  });
});

describe('buildArenaStage', () => {
  it("n'invente aucun combat : une scène par vague, un beat par événement du log", () => {
    const { run, stage } = stageOf();
    expect(stage).toHaveLength(run.fights.length);
    stage.forEach((w, i) => {
      expect(w.beats).toHaveLength(run.fights[i]!.log.length);
      expect(w.wave).toBe(run.fights[i]!.wave);
      expect(w.cleared).toBe(run.fights[i]!.win);
      expect(w.totalPv).toBe(run.fights[i]!.maxPv);
    });
  });

  it('les parts de PV des corps somment EXACTEMENT au PV de la vague', () => {
    for (const lvl of [5, 25, 60]) {
      for (const w of stageOf(lvl, lvl * 17 + 3).stage) {
        const sum = w.foes.reduce((a, f) => a + f.maxPv, 0);
        expect(sum).toBe(w.totalPv);
        expect(w.foes.every((f) => f.maxPv >= 1)).toBe(true);
      }
    }
  });

  it('les dégâts cumulés sont monotones et bornés par le pool', () => {
    for (const w of stageOf().stage) {
      let prev = 0;
      for (const b of w.beats) {
        expect(b.dealt).toBeGreaterThanOrEqual(prev);
        expect(b.dealt).toBeLessThanOrEqual(w.totalPv);
        prev = b.dealt;
      }
    }
  });

  it('une vague gagnée finit avec TOUS les corps à terre, une vague perdue non', () => {
    const { stage } = stageOf();
    for (const w of stage) {
      const last = w.beats[w.beats.length - 1];
      if (!last) continue;
      const alive = w.foes.filter((_, i) => foePvAt(w, i, last.dealt) > 0).length;
      if (w.cleared) expect(alive).toBe(0);
      else expect(alive).toBeGreaterThan(0);
    }
  });

  it('un corps tombé ne se relève jamais', () => {
    for (const w of stageOf().stage) {
      const dead = new Set<number>();
      for (const b of w.beats)
        w.foes.forEach((_, i) => {
          if (foePvAt(w, i, b.dealt) <= 0) dead.add(i);
          else expect(dead.has(i)).toBe(false);
        });
    }
  });

  it('le héros ne frappe que des corps debout, et les corps qui mordent sont vivants', () => {
    for (const w of stageOf().stage) {
      let prevDealt = 0;
      for (const b of w.beats) {
        // PV de la cible AVANT le beat : elle devait être debout pour être frappée.
        expect(foePvAt(w, b.foeIdx, prevDealt)).toBeGreaterThan(0);
        prevDealt = b.dealt;
      }
    }
  });

  it('les corps surgissent DANS le terrain et jamais sur le héros (centre)', () => {
    for (const w of stageOf(40, 909).stage)
      for (const f of w.foes) {
        expect(f.x).toBeGreaterThan(0);
        expect(f.x).toBeLessThan(1);
        expect(f.y).toBeGreaterThan(0);
        expect(f.y).toBeLessThan(1);
        expect(Math.hypot(f.x - 0.5, f.y - 0.5)).toBeGreaterThan(0.2);
      }
  });

  it('ne touche PAS à la run : les vagues tenues (donc les récompenses) sont intactes', () => {
    const h = hero(25);
    const run = runArena(h.fighter, h.level, 4242);
    const before = JSON.stringify(run);
    buildArenaStage(run, 4242, h.level);
    expect(JSON.stringify(run)).toBe(before);
    // …et la simulation reste la seule autorité : rejouer donne le même résultat.
    expect(runArena(h.fighter, h.level, 4242).waves).toBe(run.waves);
  });

  it('les morts annoncées collent exactement aux barres de vie', () => {
    for (const w of stageOf().stage) {
      let prevDealt = 0;
      const tombes = new Set<number>();
      for (const b of w.beats) {
        for (const k of b.kills) {
          // Annoncé mort → il était debout AVANT ce beat, il ne l'est plus APRÈS.
          expect(foePvAt(w, k, prevDealt)).toBeGreaterThan(0);
          expect(foePvAt(w, k, b.dealt)).toBe(0);
          expect(tombes.has(k)).toBe(false); // jamais annoncé deux fois
          tombes.add(k);
        }
        prevDealt = b.dealt;
      }
      // Une vague gagnée annonce la chute de TOUS ses corps, ni plus ni moins.
      if (w.cleared) expect(tombes.size).toBe(w.foes.length);
      else expect(tombes.size).toBeLessThan(w.foes.length);
    }
  });

  it('est déterministe : même seed → même chorégraphie', () => {
    const a = stageOf(30, 77).stage;
    const b = stageOf(30, 77).stage;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(stageOf(30, 78).stage)).not.toBe(JSON.stringify(a));
  });
});
