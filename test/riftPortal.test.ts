import { describe, expect, it } from 'vitest';
import { flameRing, portalFlames, PORTAL_VIEW } from '@/lib/riftPortal';

/** Les couples (x, y) d'un chemin fait de M/Q absolus. */
function points(d: string): { x: number; y: number }[] {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i]!, y: n[i + 1]! });
  return out;
}

describe('portail de faille', () => {
  it('le même portail a toujours les mêmes flammes', () => {
    expect(portalFlames(42)).toEqual(portalFlames(42));
    expect(portalFlames(42)[0]).not.toEqual(portalFlames(43)[0]);
  });

  it('les flammes tiennent dans le cadre, quelle que soit la graine', () => {
    for (let s = 1; s < 300; s++) {
      for (const d of portalFlames(s)) {
        for (const p of points(d)) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(PORTAL_VIEW.w);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(PORTAL_VIEW.h);
        }
      }
    }
  });

  it('le feu monte : les flammes dépassent plus au-dessus qu’en dessous', () => {
    const { cy, ry } = PORTAL_VIEW;
    for (let s = 1; s < 50; s++) {
      const ys = points(flameRing(s, 11, 0.42)).map((p) => p.y);
      const above = cy - ry - Math.min(...ys);
      const below = Math.max(...ys) - (cy + ry);
      expect(above).toBeGreaterThan(below * 2);
    }
  });

  it('la couronne entoure tout l’ovale (le chemin est fermé)', () => {
    const d = flameRing(7, 11, 0.42);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect((d.match(/Q/g) ?? []).length).toBe(22);
  });
});
