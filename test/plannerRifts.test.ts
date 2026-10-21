import { describe, expect, it } from 'vitest';
import { planExpeditions, type PlanDeps, type PlanUnit } from '@/lib/expeditionPlanner';
import { riftsByUrgency } from '@/lib/rift';
import { EXPE } from '@/lib/expedition';

/** 🕳️ Mode « Failles » du planificateur : le monde le plus proche, la faille la plus urgente. */
interface T {
  id: string;
  need: number;
  /** Aller-retour depuis chaque point de départ. */
  trip: Record<string, number>;
}
const u = (id: string, power: number, origin = 'base'): PlanUnit => ({
  id,
  power,
  origin,
  hero: false,
});
const deps: PlanDeps<T> = {
  fits: (_t, us) => us.length > 0,
  win: (t, us) => Math.min(1, us.reduce((s, x) => s + x.power, 0) / t.need),
  tripMin: (t, us) => Math.max(...us.map((x) => t.trip[x.origin] ?? 999)),
  xp: () => 0,
};
const plan = (targets: T[], units: PlanUnit[], mode: 'events' | 'rifts') =>
  planExpeditions(targets, units, { threshold: 0.9, mode, maxTeam: 6, deps });

describe('planificateur — mode Failles', () => {
  it('envoie les plus PROCHES, même s’il faut plus de monde', async () => {
    // Base : un fort seul à 30 min. Garnison : deux faibles à 20 min.
    const t = [{ id: 'faille', need: 6, trip: { base: 30, g: 20 } }];
    const units = [u('S', 10, 'base'), u('W1', 3, 'g'), u('W2', 3, 'g')];
    // Événements : la durée d'abord depuis le 2026-10-21 (avant, le temps champion gardait le
    // fort seul, 1 × 30 < 2 × 20) — les deux proches aussi.
    const ev = (await plan(t, units, 'events'))!;
    expect(ev.trips[0]!.units.map((x) => x.id).sort()).toEqual(['W1', 'W2']);
    // Failles : les deux proches, on y est plus vite.
    const rf = (await plan(t, units, 'rifts'))!;
    expect(rf.trips[0]!.units.map((x) => x.id).sort()).toEqual(['W1', 'W2']);
    expect(rf.trips[0]!.tripMin).toBe(20);
  });

  it('à nombre égal, couvre la faille la plus URGENTE (ordre donné) plutôt que la plus proche', async () => {
    // Un seul champion : il ne peut en prendre qu'une. La 1re de la liste est la plus urgente.
    const t = [
      { id: 'urgente', need: 3, trip: { base: 90 } },
      { id: 'proche', need: 3, trip: { base: 20 } },
    ];
    const rf = (await plan(t, [u('A', 3)], 'rifts'))!;
    expect(rf.trips.map((x) => x.target.id)).toEqual(['urgente']);
    // Sans le mode Failles, la plus proche l'emporte.
    const ev = (await plan(t, [u('A', 3)], 'events'))!;
    expect(ev.trips.map((x) => x.target.id)).toEqual(['proche']);
  });

  it('rend les voyages dans l’ordre d’urgence', async () => {
    const t = [
      { id: 'a', need: 3, trip: { base: 90 } },
      { id: 'b', need: 3, trip: { base: 20 } },
    ];
    const rf = (await plan(t, [u('A', 3), u('B', 3)], 'rifts'))!;
    expect(rf.trips.map((x) => x.target.id)).toEqual(['a', 'b']);
  });
});

describe('riftsByUrgency', () => {
  it('ne garde que les failles, débordement le plus proche d’abord, sans trier en place', () => {
    const pois = [
      { id: 'jeune', type: 'rift', spawnedAt: 5_000 },
      { id: 'mine', type: 'mine', spawnedAt: 0 },
      { id: 'vieille', type: 'rift', spawnedAt: 1_000 },
    ];
    const before = pois.map((p) => p.id);
    expect(riftsByUrgency(pois).map((p) => p.id)).toEqual(['vieille', 'jeune']);
    expect(pois.map((p) => p.id)).toEqual(before);
    expect(EXPE.lifespanMs.rift).toBeGreaterThan(0);
  });
});
