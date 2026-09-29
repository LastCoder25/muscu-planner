import { describe, expect, it } from 'vitest';
import { restoreUnvanquished, type ExpeditionMap, type Poi } from '@/lib/expedition';

const poi = (id: string, type = 'camp', extra: Partial<Poi> = {}) =>
  ({ id, type, x: 10, y: 10, level: 5, expiresAt: 10_000, ...extra }) as unknown as Poi;
const map = (pois: Poi[]) => ({ pois }) as unknown as ExpeditionMap;
const trip = (p: Poi, win: boolean, extra: { turnBack?: number; outTurn?: number } = {}) => ({
  poi: p,
  midAt: 1000,
  returnAt: 2000,
  ...(extra.turnBack !== undefined ? { turnBack: extra.turnBack } : {}),
  outcome: { win, ...(extra.outTurn !== undefined ? { turnBack: extra.outTurn } : {}) },
});

describe('restoreUnvanquished — un lieu non terrassé reste sur la carte', () => {
  it('une défaite rend le lieu à la carte', () => {
    const m = restoreUnvanquished(map([]), [trip(poi('a'), false)], [], 2000);
    expect(m!.pois.map((p) => p.id)).toEqual(['a']);
  });
  it('une victoire l’efface (même carte rendue)', () => {
    const m0 = map([]);
    expect(restoreUnvanquished(m0, [trip(poi('a'), true)], [], 2000)).toBe(m0);
  });
  it('un demi-tour forcé sur la route (lieu jamais atteint) le rend aussi', () => {
    const m = restoreUnvanquished(map([]), [trip(poi('a'), true, { outTurn: 0.4 })], [], 2000);
    expect(m!.pois).toHaveLength(1);
  });
  it('pas tant qu’un autre voyage le vise encore', () => {
    const p = poi('a');
    const m0 = map([]);
    expect(restoreUnvanquished(m0, [trip(p, false)], [{ poi: p }], 2000)).toBe(m0);
  });
  it('ni une arène, ni un point fixe, ni un lieu expiré, ni un doublon', () => {
    const here = poi('d');
    const m0 = map([here]);
    const out = restoreUnvanquished(
      m0,
      [
        trip(poi('ar', 'arena'), false),
        trip(poi('c', 'control'), false),
        trip(poi('e', 'camp', { expiresAt: 1500 }), false),
        trip(here, false),
      ],
      [],
      2000,
    );
    expect(out).toBe(m0);
  });
});
