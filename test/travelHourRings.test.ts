import { describe, expect, it } from 'vitest';
import { travelHourRings, travelOneWayMin, EXPE, spawnWindow } from '@/lib/expedition';

describe('cercles d’heures de trajet', () => {
  it('chaque cercle tombe là où un lieu posé à cette distance met cette durée', () => {
    for (const L of [5, 30, 80]) {
      const rings = travelHourRings(L, 1, 108);
      expect(rings.length).toBeGreaterThan(0);
      for (const { hours, r } of rings) {
        const dn = Math.max(0, (r - EXPE.distMin) / (EXPE.distMax - EXPE.distMin));
        const w = spawnWindow(L);
        const lvl = w.min + Math.round(Math.min(1, dn) * (w.max - w.min));
        expect(Math.abs(travelOneWayMin(lvl, dn) - hours * 60)).toBeLessThan(6);
      }
    }
  });

  it('une heure de plus = un cercle plus loin, et l’Avant-poste les éloigne', () => {
    const rings = travelHourRings(30, 1, 108);
    for (let i = 1; i < rings.length; i++) expect(rings[i]!.r).toBeGreaterThan(rings[i - 1]!.r);
    expect(rings.map((x) => x.hours)).toEqual(rings.map((_, i) => i + 1));
    const faster = travelHourRings(30, 0.6, 108);
    expect(faster[0]!.r).toBeGreaterThan(rings[0]!.r);
  });

  it('aucun cercle au-delà de la zone révélée', () => {
    expect(travelHourRings(30, 1, 20)).toEqual([]);
    for (const x of travelHourRings(30, 1, 60)) expect(x.r).toBeLessThanOrEqual(60);
  });
});
