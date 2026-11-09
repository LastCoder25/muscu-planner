import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addFractionTake,
  challengeDayXp,
  challengeEndDate,
  challengeStats,
  challengeLiveBalance,
  challengeTargetBetween,
  challengeXpBreakdown,
  challengeXpPoints,
  computeDailyTargets,
  evaluateAchievements,
  fractionAllowed,
  fractionDay,
  groupChallengeSets,
  isChallengeComplete,
  openChallengeExpired,
  openChallengeReport,
  recalibrationSuggestion,
  removeLastFractionTake,
  suggestConfig,
  type Challenge,
  type DayProgress,
} from '@/lib/challenges';
import { CHALLENGE_FORMATS } from '@/data/challengeFormats';
import { followUpTarget } from '@/lib/repsHabit';
import { challengeLogEntries } from '@/lib/volume';
import { doneVolume } from '@/lib/bodyBalance';
import { defisSummary } from '@/lib/defisHome';
import { buildFriendFeed } from '@/lib/friendFeed';
import { REP_XP, XP_MULT } from '@/lib/athlete';

const START = '2026-11-02'; // un lundi
const D = (i: number) => {
  const d = new Date(Date.UTC(2026, 10, 2 + i));
  return d.toISOString().slice(0, 10);
};
const AT = (day: number, h: number, m = 0) => new Date(2026, 10, 2 + day, h, m).toISOString();

function open(progress: DayProgress[] = [], over: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1',
    exercise_id: 'ex_pullup',
    exercise_name: 'Tractions',
    muscle_primary: 'dos',
    rep_weight: 1.3,
    unit: 'reps',
    format: 'open',
    duration_days: 7,
    start_date: START,
    config: { start: 0 },
    daily_targets: [0, 0, 0, 0, 0, 0, 0],
    progress,
    status: 'active',
    ...over,
  } as Challenge;
}
const take = (n: number, day: number, h = 10) => ({
  reps: n,
  weight: null,
  assisted: false,
  mini: true as const,
  at: AT(day, h),
});
const dayOf = (i: number, done: number, sets: DayProgress['sets'] = []): DayProgress => ({
  day: i,
  date: D(i),
  target: 0,
  done,
  elapsed_sec: 0,
  completed: false,
  sets,
});
const tpl = { weight: null, assisted: false };

describe('🔁 XP : 30 prises d’1 rep = 3 séries de 10 (barème des challenges)', () => {
  const takes30 = open([
    dayOf(
      0,
      30,
      Array.from({ length: 30 }, () => take(1, 0)),
    ),
  ]);
  const sets3 = open([
    dayOf(
      0,
      30,
      Array.from({ length: 3 }, () => ({ reps: 10, weight: null, assisted: false })),
    ),
  ]);
  it('même XP du jour, même XP totale (le barème est linéaire en reps, sans racine par série)', () => {
    const expected = Math.round(30 * REP_XP * 1.3 * XP_MULT);
    expect(challengeDayXp(takes30, takes30.progress[0]!)).toBe(expected);
    expect(challengeDayXp(sets3, sets3.progress[0]!)).toBe(expected);
    expect(challengeXpPoints([takes30])).toBe(challengeXpPoints([sets3]));
  });
  it('un défi Découverte ne verse AUCUNE prime, même terminé', () => {
    const done = open(takes30.progress, { status: 'done' });
    const b = challengeXpBreakdown(done);
    expect(b.bonus).toBe(0);
    expect(b.total).toBe(b.reps);
    expect(b.reps).toBeGreaterThan(0);
    // Même si un client bricolé lui posait des objectifs, la prime reste nulle.
    const odd = open(takes30.progress, {
      status: 'done',
      daily_targets: [5, 5, 5, 5, 5, 5, 5],
    });
    expect(challengeXpBreakdown(odd).bonus).toBe(0);
    // … alors qu'un cumulé bouclé en verse une (le garde-fou n'est pas un zéro par défaut).
    const cum = open([dayOf(0, 30)], {
      format: 'cumulative',
      config: { start: 0, total: 30 },
      status: 'done',
    });
    expect(challengeXpBreakdown(cum).bonus).toBeGreaterThan(0);
  });
  it('jamais « complété » : pas d’objectif à atteindre', () => {
    expect(isChallengeComplete(takes30)).toBe(false);
  });
});

describe('🔁 une prise', () => {
  it('ajoute ses reps au jour et garde son détail (mini + heure)', () => {
    const c = open();
    const next = addFractionTake(c, D(2), 2, tpl, AT(2, 9))!;
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ day: 2, date: D(2), done: 2 });
    expect(next[0]!.sets![0]).toMatchObject({ reps: 2, mini: true, at: AT(2, 9) });
    const again = addFractionTake({ ...c, progress: next }, D(2), 1, tpl, AT(2, 10))!;
    expect(again[0]!.done).toBe(3);
    expect(again[0]!.sets).toHaveLength(2);
  });
  it('ne modifie pas le défi d’origine', () => {
    const c = open([dayOf(0, 1, [take(1, 0)])]);
    addFractionTake(c, D(0), 3, tpl, AT(0, 9));
    expect(c.progress[0]!.done).toBe(1);
    expect(c.progress[0]!.sets).toHaveLength(1);
  });
  it('refuse hors des 7 jours, une quantité nulle, le mode séries et les exos en temps', () => {
    const c = open();
    expect(addFractionTake(c, D(7), 1, tpl, AT(7, 9))).toBeNull();
    expect(addFractionTake(c, D(-1), 1, tpl, AT(0, 9))).toBeNull();
    expect(addFractionTake(c, D(0), 0, tpl, AT(0, 9))).toBeNull();
    expect(
      addFractionTake({ ...c, config: { start: 0, count_mode: 'sets' } }, D(0), 1, tpl, AT(0, 9)),
    ).toBeNull();
    expect(addFractionTake({ ...c, unit: 'time' }, D(0), 1, tpl, AT(0, 9))).toBeNull();
  });
  it('sur un défi classique, la journée se valide à l’objectif du jour', () => {
    const c = open([], {
      format: 'fixed',
      config: { start: 3 },
      daily_targets: [3, 3, 3, 3, 3, 3, 3],
    });
    const a = addFractionTake(c, D(0), 2, tpl, AT(0, 9))!;
    expect(a[0]!.completed).toBe(false);
    const b = addFractionTake({ ...c, progress: a }, D(0), 1, tpl, AT(0, 10))!;
    expect(b[0]!.completed).toBe(true);
  });
});

describe('🔁 annuler la dernière prise', () => {
  it('retire la dernière PRISE du jour et ses reps, jamais une vraie série', () => {
    const c = open([
      dayOf(0, 14, [
        { reps: 10, weight: null, assisted: false },
        take(1, 0, 9),
        take(2, 0, 10),
        { reps: 1, weight: null, assisted: false },
      ]),
    ]);
    const next = removeLastFractionTake(c, D(0))!;
    expect(next[0]!.done).toBe(12);
    expect(next[0]!.sets!.map((s) => s.reps)).toEqual([10, 1, 1]);
    const again = removeLastFractionTake({ ...c, progress: next }, D(0))!;
    expect(again[0]!.done).toBe(11);
    expect(again[0]!.sets!.every((s) => !s.mini)).toBe(true);
    // Plus aucune prise : rien à annuler (la vraie série reste).
    expect(removeLastFractionTake({ ...c, progress: again }, D(0))).toBeNull();
  });
  it('ne touche pas aux prises d’un autre jour', () => {
    const c = open([dayOf(0, 1, [take(1, 0)]), dayOf(1, 0, [])]);
    expect(removeLastFractionTake(c, D(1))).toBeNull();
  });
  it('rouvre la journée si l’objectif n’est plus atteint', () => {
    const c = open([{ ...dayOf(0, 3, [take(3, 0)]), target: 3, completed: true }], {
      format: 'fixed',
      daily_targets: [3, 3, 3, 3, 3, 3, 3],
    });
    expect(removeLastFractionTake(c, D(0))![0]!.completed).toBe(false);
  });
});

describe('🔁 compteur du jour, regroupement et qui peut se fractionner', () => {
  it('« N reps aujourd’hui · M prises » : les reps de tout le jour, les prises à part', () => {
    expect(fractionDay(undefined)).toEqual({ reps: 0, takes: 0 });
    const p = dayOf(0, 15, [{ reps: 10, weight: null }, take(1, 0), take(2, 0), take(2, 0)]);
    expect(fractionDay(p)).toEqual({ reps: 15, takes: 3 });
  });
  it('les prises d’un jour tiennent en UNE ligne, les séries pleines restent seules', () => {
    const lines = groupChallengeSets([
      { reps: 1, mini: true as const, date: D(0) },
      { reps: 10, date: D(0) },
      { reps: 2, mini: true as const, date: D(0) },
      { reps: 4, mini: true as const, date: D(1) },
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ kind: 'mini', date: D(0), reps: 3, takes: 2 });
    expect(lines[1]).toMatchObject({ kind: 'set', index: 1 });
    expect(lines[2]).toMatchObject({ kind: 'mini', date: D(1), reps: 4, takes: 1 });
  });
  it('seuls les challenges FRACTIONNÉS de REPS sur tractions, pompes et dips, en cours, offrent « +1 »', () => {
    const c = open([], { format: 'fixed', config: { start: 10, fraction: true } });
    expect(fractionAllowed(c)).toBe(true);
    expect(fractionAllowed({ ...c, exercise_id: 'ex_pushup' })).toBe(true);
    expect(fractionAllowed({ ...c, exercise_id: 'ex_dips' })).toBe(true);
    expect(fractionAllowed({ ...c, exercise_id: 'ex_bw_squat' })).toBe(false);
    expect(fractionAllowed({ ...c, exercise_id: 'ex_lat_pulldown' })).toBe(false);
    expect(
      fractionAllowed({ ...c, config: { start: 1, fraction: true, count_mode: 'sets' } }),
    ).toBe(false);
    expect(fractionAllowed({ ...c, unit: 'time' })).toBe(false);
    expect(fractionAllowed({ ...c, status: 'done' })).toBe(false);
  });
});

describe('🔁 le format Découverte : rien ne divise par zéro, rien n’est « raté »', () => {
  const week = open([dayOf(0, 5, [take(5, 0)]), dayOf(2, 9, [take(9, 2)])]);
  it('aucun objectif : sept zéros, config vide', () => {
    expect(computeDailyTargets('open', { start: 0 }, 7, START)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // Même un start résiduel n'en fait pas un objectif.
    expect(computeDailyTargets('open', { start: 40 }, 7, START)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(suggestConfig('reps', 'intermediaire', 'open', 7, 'ex_pullup')).toEqual({ start: 0 });
    expect(challengeTargetBetween(week, START, D(7))).toBe(0);
  });
  it('les stats restent neutres (pas de NaN, pas de retard, pas de série cassée)', () => {
    const s = challengeStats(week, D(4));
    for (const v of Object.values(s))
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    expect(s.completionPct).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.todayTarget).toBe(0);
    expect(s.isDoneToday).toBe(true); // jamais « à faire »
    expect(s.totalDone).toBe(14);
    expect(challengeLiveBalance(week, D(4))).toBe(0);
    // Des reps faites AUJOURD'HUI ne sont pas un « surplus » sur un objectif de 0.
    expect(challengeLiveBalance(week, D(2))).toBe(0);
    expect(recalibrationSuggestion(week, D(5))).toBeNull();
  });
  it('l’accueil ne le compte jamais « à faire aujourd’hui »', () => {
    expect(defisSummary([week], [], D(4)).dueToday).toBe(0);
  });
  it('aucun succès de complétion (ni terminé ni abandonné), mais ses reps comptent', () => {
    const none = evaluateAchievements([]);
    expect(evaluateAchievements([open(week.progress, { status: 'done' })])).toEqual(none);
    expect(evaluateAchievements([open(week.progress, { status: 'abandoned' })])).toEqual(none);
  });
  it('se clôt à la fin des 7 jours, en « terminé » seulement', () => {
    expect(challengeEndDate(week)).toBe(D(6));
    expect(openChallengeExpired(week, D(6))).toBe(false); // le dernier jour est encore le sien
    expect(openChallengeExpired(week, D(7))).toBe(true);
    expect(openChallengeExpired({ ...week, status: 'done' }, D(9))).toBe(false);
    expect(openChallengeExpired({ ...week, format: 'fixed' }, D(9))).toBe(false);
  });
  it('est au catalogue des formats, et la base n’en limite aucun (aucune migration)', () => {
    expect(CHALLENGE_FORMATS.map((f) => f.id)).toContain('open');
    const dir = resolve(__dirname, '..', 'supabase', 'migrations');
    for (const f of readdirSync(dir)) {
      const sql = readFileSync(resolve(dir, f), 'utf8');
      expect(/check\s*\(\s*format\b/i.test(sql), f).toBe(false);
      expect(/format\s+text[^,]*check/i.test(sql), f).toBe(false);
    }
  });
});

describe('🔁 équilibre du corps, stats, agenda : 30 prises = 3 séries', () => {
  const takes = open([
    dayOf(
      0,
      30,
      Array.from({ length: 30 }, () => take(1, 0)),
    ),
  ]);
  it('statistiques : les prises d’un jour sont rangées en séries équivalentes', () => {
    const perf = challengeLogEntries([takes])[0]!.log.exercises[0]!.performed;
    expect(perf).toHaveLength(3);
    expect(perf.reduce((a, p) => a + p.reps, 0)).toBe(30);
  });
  it('équilibre du corps : 30 reps ÷ milieu de fourchette = 3 séries, et aucun objectif engagé', () => {
    const v = doneVolume(
      {
        sessions: [],
        combos: [],
        challenges: [takes],
        bossHits: [],
        objective: null,
        secondaries: () => undefined,
        primaries: () => undefined,
      } as never,
      D(0),
      D(7),
    );
    expect(v.totalSets).toBeCloseTo(3, 5);
  });
  it('le fil des amis ne dit jamais qu’un défi Découverte est « bouclé » ni son pourcentage', () => {
    const now = '2026-11-10T12:00:00.000Z';
    const done = {
      ...open(takes.progress, { status: 'done' }),
      created_at: '2026-11-02T08:00:00.000Z',
      updated_at: '2026-11-09T08:00:00.000Z',
    };
    const feed = buildFriendFeed(
      [{ userId: 'u', pseudo: 'Léa', challenges: [done], combos: [] } as never],
      now,
      '2026-11-10',
    );
    expect(feed.every((i) => !/bouclé|%/.test(i.text))).toBe(true);
  });
});

describe('📊 le bilan d’un défi Découverte', () => {
  const c = open([
    dayOf(0, 6, [take(2, 0, 8), take(2, 0, 8), take(2, 0, 14)]),
    dayOf(2, 12, [take(3, 2, 14), take(3, 2, 14), take(6, 2, 20)]),
    dayOf(3, 12, [take(12, 3, 9)]),
  ]);
  it('total, jours actifs, meilleur jour, moyenne par jour actif, prises', () => {
    const r = openChallengeReport(c);
    expect(r.total).toBe(30);
    expect(r.activeDays).toBe(3);
    expect(r.days).toBe(7);
    expect(r.bestDay).toEqual({ date: D(3), reps: 12 }); // à égalité, le plus récent
    expect(r.avgPerActiveDay).toBe(10);
    expect(r.takes).toBe(7);
  });
  it('répartition par heure de la journée (via l’heure des prises)', () => {
    const h = openChallengeReport(c).byHour!;
    expect(h).toHaveLength(24);
    expect(h[8]).toBe(4);
    expect(h[9]).toBe(12);
    expect(h[14]).toBe(8);
    expect(h[20]).toBe(6);
    expect(h.reduce((a, b) => a + b, 0)).toBe(30);
  });
  it('sans heure, la répartition est omise ; sans rep, un bilan vide propre', () => {
    const noAt = open([dayOf(0, 3, [{ reps: 3, weight: null, assisted: false }])]);
    expect(openChallengeReport(noAt).byHour).toBeNull();
    const empty = openChallengeReport(open());
    expect(empty).toMatchObject({ total: 0, activeDays: 0, bestDay: null, avgPerActiveDay: 0 });
  });
  it('« Relever un défi » : le total +10 %, arrondi propre, toujours au moins une rep de plus', () => {
    expect(followUpTarget(100)).toBe(110);
    expect(followUpTarget(48)).toBe(55);
    expect(followUpTarget(30)).toBe(35); // 33 → 35
    expect(followUpTarget(5)).toBe(6);
    expect(followUpTarget(3)).toBe(4);
    expect(followUpTarget(0)).toBe(10);
  });
});
