import { describe, expect, it } from 'vitest';
import { tripLegs } from '@/lib/expedition';
import { tripTimeline, segWidths, SEG_MIN_SHARE } from '@/lib/tripLegTiles';
import { currentLegTile, tripFilterCtx, tripOrder, type NavTrip } from '@/lib/tripNav';
import { ALL_TRIPS } from '@/lib/tripFilter';

const MIN = 60_000;
// Départ à 0, 60 min d'aller, 40 min de fouille, 60 min de retour.
const V = { sentAt: 0, midAt: 100 * MIN, dwellMs: 40 * MIN, returnAt: 160 * MIN };

describe('🧭 tripLegs.steps — toutes les étapes, faites comprises, avec leur durée', () => {
  it('à l’aller : aller en cours, fouille et retour à venir, chacun sa durée', () => {
    const s = tripLegs(V, 30 * MIN)!.steps;
    expect(s.map((x) => x.leg)).toEqual(['go', 'dwell', 'back']);
    expect(s.map((x) => x.ms / MIN)).toEqual([60, 40, 60]);
    expect(s.map((x) => x.current)).toEqual([true, false, false]);
    expect(s[0]!.pct).toBeCloseTo(50);
    expect(s[1]!.pct).toBe(0);
  });
  it('une étape faite RESTE sur la frise, remplie, sans temps', () => {
    const s = tripLegs(V, 80 * MIN)!.steps;
    expect(s.map((x) => x.leg)).toEqual(['go', 'dwell', 'back']);
    expect(s[0]).toMatchObject({ pct: 100, current: false, time: '' });
    expect(s[1]!.current).toBe(true);
  });
  it('le temps d’une étape restante est celui de la tuile (d’ici sa fin)', () => {
    const r = tripLegs(V, 30 * MIN)!;
    for (const p of r.phases) expect(r.steps.find((x) => x.leg === p.leg)!.time).toBe(p.time);
  });
  it('avant le départ : l’attente ouvre la frise et c’est elle qui est en cours', () => {
    const s = tripLegs({ ...V, sentAt: 20 * MIN }, 0)!.steps;
    expect(s[0]).toMatchObject({ leg: 'wait', current: true, ms: 20 * MIN });
    expect(s.find((x) => x.leg === 'go')!.current).toBe(false);
  });
  it('un voyage d’avant `sentAt` : l’aller fait disparaît (sa durée est inconnue)', () => {
    const old = { midAt: 100 * MIN, dwellMs: 40 * MIN, returnAt: 160 * MIN };
    expect(tripLegs(old, 80 * MIN)!.steps.map((x) => x.leg)).toEqual(['dwell', 'back']);
  });
});

describe('🧭 tripTimeline — segments proportionnels et curseur', () => {
  it('les largeurs suivent les durées, le curseur le voyage entier', () => {
    const t = tripTimeline(tripLegs(V, 30 * MIN)!.steps)!;
    expect(t.segs.map((x) => x.weight / MIN)).toEqual([60, 40, 60]);
    expect(t.cursor).toBeCloseTo((30 / 160) * 100);
  });
  it('une étape faite se lit ✓, les autres leur temps', () => {
    const t = tripTimeline(tripLegs(V, 80 * MIN)!.steps)!;
    expect(t.segs[0]!.label).toBe('⚔️ ✓');
    expect(t.segs[0]!.done).toBe(true);
    expect(t.segs[2]!.label).toMatch(/^↩️ \S/);
  });
  it('durées toutes inconnues : segments égaux, curseur selon les étapes faites', () => {
    const t = tripTimeline([
      { leg: 'go', ms: 0, pct: 100, current: false, time: '' },
      { leg: 'back', ms: 0, pct: 0, current: true, time: '5 min' },
    ])!;
    expect(t.segs.map((x) => x.weight)).toEqual([1, 1]);
    expect(t.cursor).toBe(50);
  });
  it('sans étapes : pas de frise', () => {
    expect(tripTimeline(undefined)).toBeNull();
    expect(tripTimeline([])).toBeNull();
  });
});

describe('🧭 une tuile par voyage', () => {
  const at = (key: string, now: number, extra: Partial<NavTrip> = {}): NavTrip => ({
    key,
    back: false,
    time: '',
    pct: 0,
    cat: 'trips',
    legs: tripLegs(V, now),
    ...extra,
  });
  it('un voyage donne UNE tuile, celle de son étape en cours', () => {
    const order = tripOrder([at('x', 30 * MIN), at('y', 130 * MIN, { back: true })], 'home');
    expect(order.map((o) => `${o.trip.key}:${o.leg.leg}`)).toEqual(['x:go', 'y:back']);
  });
  it('le filtre « Retour » ne compte que les voyages qui sont SUR le retour', () => {
    const ctx = tripFilterCtx([at('x', 30 * MIN), at('y', 130 * MIN)], 0, ALL_TRIPS, new Set());
    expect(ctx.legCounts).toEqual({ wait: 0, go: 1, dwell: 0, back: 1 });
    expect(currentLegTile(at('z', 80 * MIN)).leg).toBe('dwell');
  });
});

describe('📐 largeur des étapes sur la frise (signalé : le dernier temps sortait de la tuile)', () => {
  it('une longue attente n’écrase plus les autres étapes : chacune garde sa part minimale', () => {
    const w = segWidths([10 * 3600, 600, 600, 600]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    for (const x of w) expect(x).toBeGreaterThanOrEqual(SEG_MIN_SHARE - 1e-9);
    // la longue garde le reste, et reste la plus large
    expect(w[0]).toBeCloseTo(1 - 3 * SEG_MIN_SHARE, 9);
  });
  it('sans étape trop courte, la largeur suit la durée', () => {
    expect(segWidths([60, 40])).toEqual([0.6, 0.4]);
  });
  it('trop d’étapes pour le plancher : parts égales, jamais plus que la frise', () => {
    const w = segWidths([1, 1, 1, 1, 1, 1]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    for (const x of w) expect(x).toBeCloseTo(1 / 6, 9);
  });
  it('une étape repassée sous le plancher en partageant le reste le prend aussi', () => {
    // 0,5 % et 20 % : la première prend le plancher, la seconde tomberait à 0,78 × 20/99,5.
    const w = segWidths([0.5, 20, 79.5]);
    for (const x of w) expect(x).toBeGreaterThanOrEqual(SEG_MIN_SHARE - 1e-9);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
});
