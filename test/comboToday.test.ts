import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { legTimeBubbles, setIsToday, type ComboLeg } from '@/lib/combo';

// 🔵 Série / durée faite AUJOURD'HUI : d'une autre couleur ; le lendemain tout revient à la normale.
const TODAY = '2026-11-24';
const YDAY = '2026-11-23';

const timeLeg = (sets: [string, number][], target = 120) =>
  ({
    slot: 'core',
    exercise_id: 'ex_plank',
    rep_weight: 1,
    target,
    count_mode: 'time',
    sets: sets.map(([date, reps]) => ({ date, reps })),
    progress: [],
  }) as unknown as ComboLeg;

describe('setIsToday', () => {
  it('compare la date de la série à celle d’aujourd’hui', () => {
    expect(setIsToday({ date: TODAY, reps: 5 }, TODAY)).toBe(true);
    expect(setIsToday({ date: YDAY, reps: 5 }, TODAY)).toBe(false);
  });
  it('le lendemain, la même série n’est plus « du jour » (rien n’est stocké)', () => {
    const s = { date: TODAY, reps: 5 };
    expect(setIsToday(s, TODAY)).toBe(true);
    expect(setIsToday(s, '2026-11-25')).toBe(false);
  });
});

describe('legTimeBubbles — la part tenue aujourd’hui', () => {
  it('sans « today », aucune part du jour (comportement d’avant)', () => {
    const b = legTimeBubbles(timeLeg([[TODAY, 45]]));
    expect(b.every((x) => x.heldToday === 0)).toBe(true);
  });
  it('tout est d’aujourd’hui : 45 s = une bulle pleine du jour + une à moitié', () => {
    const b = legTimeBubbles(timeLeg([[TODAY, 45]]), TODAY);
    expect(b[0]!.heldToday).toBe(30);
    expect(b[1]!.heldToday).toBe(15);
    expect(b[2]!.heldToday).toBe(0);
  });
  it('rien d’aujourd’hui : tout reste de la couleur d’avant', () => {
    const b = legTimeBubbles(timeLeg([[YDAY, 45]]), TODAY);
    expect(b.every((x) => x.heldToday === 0)).toBe(true);
    expect(b[0]!.held).toBe(30);
  });
  it('mélange : 40 s d’hier puis 35 s d’aujourd’hui → la bulle 2 est à cheval', () => {
    const b = legTimeBubbles(timeLeg([[YDAY, 40], [TODAY, 35]]), TODAY);
    expect(b[0]).toMatchObject({ held: 30, heldToday: 0 });
    // bulle 2 (30–60 s) : 10 s d'hier puis 20 s d'aujourd'hui
    expect(b[1]).toMatchObject({ held: 30, heldToday: 20 });
    // bulle 3 (60–90 s) : 15 s, toutes d'aujourd'hui
    expect(b[2]).toMatchObject({ held: 15, heldToday: 15 });
  });
  it('la part du jour ne dépasse jamais ce qui est tenu dans la bulle', () => {
    for (const secs of [0, 7, 29, 30, 31, 90, 200]) {
      for (const b of legTimeBubbles(timeLeg([[YDAY, 20], [TODAY, secs]]), TODAY)) {
        expect(b.heldToday).toBeGreaterThanOrEqual(0);
        expect(b.heldToday).toBeLessThanOrEqual(b.held);
      }
    }
  });
});

describe('câblage : les écrans posent la classe « today » et son style', () => {
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  for (const page of ['../src/pages/ChallengesPage.vue', '../src/pages/ComboDetailPage.vue']) {
    it(`${page.split('/').pop()} : classe, fonction et couleur`, () => {
      const s = src(page);
      expect(s).toContain('today: isDoneToday(leg, n)');
      expect(s).toContain('setIsToday(s, logicalToday())');
      expect(s).toMatch(/\.seg\.on\.today\s*\{[^}]*var\(--today\)/);
    });
  }
  it('les bulles de durée colorent la part du jour', () => {
    const s = src('../src/components/ComboTimeBubbles.vue');
    expect(s).toContain('heldToday');
    expect(s).toContain('legTimeBubbles(props.leg, logicalToday())');
    expect(s).toMatch(/\.tb-fill\.today\s*\{[^}]*var\(--today\)/);
  });
  it('le jeton --today existe, distinct de l’accent', () => {
    const s = src('../src/css/app.scss');
    expect(s).toMatch(/--today:\s*#5ec8ff/i);
  });
});
