import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  HOLD,
  HOLD_GAMES,
  HOLD_GAME_EXERCISES,
  buildHoldPlan,
  holdGame,
  holdGameAllowed,
  judgeTap,
  scoreHold,
  type HoldPlan,
  type HoldTap,
} from '@/lib/holdGames';

/** Tape juste, pile sur le temps : la réponse parfaite. */
function perfectTaps(plan: HoldPlan): HoldTap[] {
  return plan.beats.map((b) => ({ beatId: b.id, side: b.answer, at: b.at }));
}

function gaps(plan: HoldPlan): number[] {
  return plan.beats.slice(1).map((b, i) => b.at - plan.beats[i]!.at);
}

describe('les trois jeux', () => {
  it('sont trois, tous distincts, et chacun porte sa règle', () => {
    expect(HOLD_GAMES).toHaveLength(3);
    expect(new Set(HOLD_GAMES.map((g) => g.id)).size).toBe(3);
    for (const g of HOLD_GAMES) {
      expect(g.rule.length).toBeGreaterThan(10);
      expect(g.skill.length).toBeGreaterThan(2);
    }
  });

  it("sollicitent trois choses DIFFÉRENTES — c'est la seule raison d'en avoir trois", () => {
    expect(new Set(HOLD_GAMES.map((g) => g.skill)).size).toBe(3);
  });

  it('se retrouvent par leur id, et un id inconnu ne passe pas en silence', () => {
    expect(holdGame('cadence').name).toBe('Cadence');
    // @ts-expect-error id volontairement hors union
    expect(() => holdGame('inconnu')).toThrow();
  });
});

describe('les exos qui ont droit au jeu', () => {
  const sql = (() => {
    const root = join(__dirname, '..', 'supabase');
    const files = [join(root, 'seed.sql')].concat(
      readdirSync(join(root, 'migrations'))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => join(root, 'migrations', f)),
    );
    return files.map((f) => readFileSync(f, 'utf8')).join('\n');
  })();

  it('désignent tous un exercice qui existe VRAIMENT en base', () => {
    // ⚠️ Une table d'ids se périme en silence : un exo renommé, et le jeu ne s'affiche
    // plus jamais sans qu'aucune porte ne le dise. On la confronte donc au schéma.
    for (const id of HOLD_GAME_EXERCISES) {
      expect(sql, `${id} ne figure dans aucune migration`).toContain(`'${id}'`);
    }
  });

  it('écartent tout le reste, gainage latéral compris', () => {
    expect(holdGameAllowed('ex_plank')).toBe(true);
    expect(holdGameAllowed('ex_wall_sit')).toBe(true);
    // Une seule main libre : on ne propose rien plutôt qu'une version dégradée.
    expect(holdGameAllowed('ex_pp_side_plank')).toBe(false);
    // Une main au sol.
    expect(holdGameAllowed('ex_pp_bird_dog')).toBe(false);
    // Les mains tiennent l'élastique.
    expect(holdGameAllowed('ex_pp_pallof_press')).toBe(false);
    expect(holdGameAllowed('ex_squat')).toBe(false);
    expect(holdGameAllowed(null)).toBe(false);
    expect(holdGameAllowed(undefined)).toBe(false);
    expect(holdGameAllowed('')).toBe(false);
  });
});

describe('le plan', () => {
  it('est déterministe : même graine, même déroulé', () => {
    const a = buildHoldPlan('repousse', 45, 7);
    const b = buildHoldPlan('repousse', 45, 7);
    expect(a).toEqual(b);
    expect(buildHoldPlan('repousse', 45, 8)).not.toEqual(a);
  });

  it('ne déborde jamais de la durée tenue', () => {
    for (const game of ['repousse', 'cadence', 'tri'] as const) {
      for (const sec of [20, 30, 45, 60]) {
        const plan = buildHoldPlan(game, sec, 3);
        expect(plan.beats.length).toBeGreaterThan(3);
        for (const b of plan.beats) expect(b.at).toBeLessThan(sec * 1000);
      }
    }
  });

  it('ne boucle pas sur une durée nulle ou absurde', () => {
    expect(buildHoldPlan('repousse', 0, 1).beats).toHaveLength(0);
    expect(buildHoldPlan('repousse', -5, 1).beats).toHaveLength(0);
  });

  it("ACCÉLÈRE, et resserre la fenêtre — c'est ce qui tient les dernières secondes", () => {
    for (const game of ['repousse', 'cadence', 'tri'] as const) {
      const plan = buildHoldPlan(game, 60, 11);
      const g = gaps(plan);
      const third = Math.floor(g.length / 3);
      const head = g.slice(0, third).reduce((s, x) => s + x, 0) / third;
      const tail = g.slice(-third).reduce((s, x) => s + x, 0) / third;
      expect(tail, `${game} : la fin doit presser`).toBeLessThan(head * 0.85);

      const first = plan.beats[0]!.windowMs;
      const last = plan.beats.at(-1)!.windowMs;
      expect(last, `${game} : la fenêtre doit se resserrer`).toBeLessThan(first);
    }
  });

  it('monte en COURBE, pas en droite — doux au début, franc à la fin', () => {
    // Avec une rampe linéaire, le milieu tomberait à mi-chemin des deux extrêmes.
    const plan = buildHoldPlan('cadence', 60, 5);
    const g = gaps(plan);
    const mid = g[Math.floor(g.length / 2)]!;
    const head = g[0]!;
    const tail = g.at(-1)!;
    expect(mid).toBeGreaterThan((head + tail) / 2);
  });

  it('ne laisse jamais le même côté surgir indéfiniment', () => {
    for (const game of ['repousse', 'cadence', 'tri'] as const) {
      const plan = buildHoldPlan(game, 60, 21);
      let run = 0;
      let prev: string | null = null;
      for (const b of plan.beats) {
        run = b.from === prev ? run + 1 : 1;
        prev = b.from;
        expect(run, `${game} : ${run} fois le même côté`).toBeLessThanOrEqual(HOLD.maxSameSide);
      }
    }
  });
});

describe('ce qui distingue vraiment les trois', () => {
  it("Cadence est un MÉTRONOME — sans régularité il n'y a plus de rythme", () => {
    // Le tempo se resserre, donc les intervalles décroissent ; mais ils ne doivent JAMAIS
    // remonter. Avec du jitter, ils remontent sans arrêt.
    const g = gaps(buildHoldPlan('cadence', 60, 4));
    for (let i = 1; i < g.length; i++) {
      expect(g[i]!, `intervalle ${i} remonte`).toBeLessThanOrEqual(g[i - 1]! + 2);
    }
  });

  it('Repousse est IRRÉGULIER — sinon ce ne serait plus du réflexe', () => {
    const g = gaps(buildHoldPlan('repousse', 60, 4));
    const remonte = g.filter((x, i) => i > 0 && x > g[i - 1]! + 2).length;
    expect(remonte).toBeGreaterThan(3);
  });

  it('Repousse et Cadence : on tape toujours du côté où ça vient', () => {
    for (const game of ['repousse', 'cadence'] as const) {
      for (const b of buildHoldPlan(game, 60, 9).beats) {
        expect(b.answer).toBe(b.from);
        expect(b.kind).toBeUndefined();
      }
    }
  });

  it("Tri : la réponse vient de la NATURE de l'objet, jamais de son côté", () => {
    const plan = buildHoldPlan('tri', 60, 9);
    for (const b of plan.beats) {
      expect(b.kind).toBeDefined();
      expect(b.answer).toBe(b.kind === 'keep' ? 'left' : 'right');
    }
    // ⚠️ Toute la charge cognitive du Tri est là : il faut que l'objet tombe SOUVENT du
    // mauvais côté. Sans conflits, ce n'est qu'un Repousse plus lent.
    const conflits = plan.beats.filter((b) => b.from !== b.answer).length;
    expect(conflits / plan.beats.length).toBeGreaterThan(0.3);
  });
});

describe('le jugement', () => {
  const beat = {
    id: 0,
    at: 10_000,
    from: 'left' as const,
    answer: 'left' as const,
    windowMs: 1000,
  };

  it('distingue le parfait du bon', () => {
    expect(judgeTap(beat, 'left', 10_000)).toBe('perfect');
    expect(judgeTap(beat, 'left', 10_300)).toBe('perfect');
    expect(judgeTap(beat, 'left', 10_800)).toBe('good');
    expect(judgeTap(beat, 'left', 9_200)).toBe('good');
  });

  it('refuse le mauvais côté, et ce qui tombe hors de la fenêtre', () => {
    expect(judgeTap(beat, 'right', 10_000)).toBe('wrong');
    expect(judgeTap(beat, 'left', 11_500)).toBe('late');
    expect(judgeTap(beat, 'right', 11_500)).toBe('late');
  });
});

describe('le score', () => {
  const plan = buildHoldPlan('repousse', 45, 2);

  it('paie chaque réussite et récompense la série', () => {
    const s = scoreHold(plan, perfectTaps(plan));
    expect(s.hits).toBe(plan.beats.length);
    expect(s.perfects).toBe(plan.beats.length);
    expect(s.misses).toBe(0);
    expect(s.bestStreak).toBe(plan.beats.length);
    const bonus = Math.floor(plan.beats.length / HOLD.streakEvery) * HOLD.streakBonus;
    expect(s.score).toBe(plan.beats.length * HOLD.points.perfect + bonus);
  });

  it("NE RETIRE JAMAIS RIEN — se tromper coûte seulement ce qu'on ne gagne pas", () => {
    // ⚠️ La propriété centrale : on ne punit pas quelqu'un qui souffre. Ne rien faire et
    // se tromper doivent valoir EXACTEMENT le même score.
    const bons = perfectTaps(plan).slice(0, 5);
    const avecFautes: HoldTap[] = [
      ...bons,
      ...plan.beats.slice(5).map((b) => ({
        beatId: b.id,
        side: (b.answer === 'left' ? 'right' : 'left') as 'left' | 'right',
        at: b.at,
      })),
    ];
    const silence = scoreHold(plan, bons);
    const fautes = scoreHold(plan, avecFautes);
    expect(fautes.score).toBe(silence.score);
    expect(fautes.score).toBeGreaterThan(0);
    expect(fautes.wrongs).toBe(plan.beats.length - 5);
    expect(silence.misses).toBe(plan.beats.length - 5);
  });

  it('coupe la série sur une faute', () => {
    const taps = perfectTaps(plan).slice(0, 11);
    taps[5] = { ...taps[5]!, side: taps[5]!.side === 'left' ? 'right' : 'left' };
    const s = scoreHold(plan, taps);
    expect(s.bestStreak).toBe(5);
    expect(s.hits).toBe(10);
  });

  it('ignore une seconde frappe sur le même appel', () => {
    const b = plan.beats[0]!;
    const s = scoreHold(plan, [
      { beatId: b.id, side: b.answer, at: b.at },
      { beatId: b.id, side: b.answer, at: b.at },
    ]);
    expect(s.hits).toBe(1);
  });

  it('compte comme manqué ce à quoi on ne répond pas', () => {
    const s = scoreHold(plan, []);
    expect(s.misses).toBe(plan.beats.length);
    expect(s.score).toBe(0);
    expect(s.bestStreak).toBe(0);
  });
});
