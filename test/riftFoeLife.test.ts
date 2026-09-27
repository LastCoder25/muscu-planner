// ❤️ La vie de chaque monstre d'une faille, gardée pour la barre de l'adversaire (v0.1216).
import { describe, expect, it } from 'vitest';
import { fuseUnits } from '@/lib/skirmish';
import { refEscortUnits } from '@/lib/caravan';
import { simulateIncursion, type RiftLike } from '@/lib/rift';
import { buildRiftStage, type RiftStageInput } from '@/lib/riftStage';

const T0 = Date.UTC(2026, 8, 19);
const DAY = 24 * 3_600_000;

function runs(units: number) {
  const rift: RiftLike = { id: 'poi_life', level: 30, spawnedAt: T0 };
  const party = fuseUnits(refEscortUnits(30).slice(0, units), 'Groupe');
  return Array.from({ length: 30 }, (_, s) => simulateIncursion(party, rift, T0 + 7 * DAY, s + 1));
}

describe('❤️ la vie des monstres affrontés', () => {
  const all = [...runs(3), ...runs(2)];
  it('une entrée par monstre AFFRONTÉ, jamais pour le gardien', () => {
    for (const r of all) {
      const faced = r.killed + (r.killed < r.population ? 1 : 0);
      expect(r.foeTrail.length).toBe(faced);
    }
  });
  it('un abattu finit à 0, celui qui a arrêté le groupe garde des PV', () => {
    let stopped = 0;
    for (const r of all)
      for (const [k, f] of r.foeTrail.entries()) {
        expect(f.maxPv).toBeGreaterThan(0);
        expect(f.pv).toBeLessThanOrEqual(f.maxPv);
        if (k < r.killed) expect(f.pv).toBe(0);
        else {
          stopped++;
          expect(f.pv).toBeGreaterThan(0);
        }
      }
    // Sans ce compte, le second cas ne serait jamais exercé.
    expect(stopped).toBeGreaterThan(0);
  });
  it('la scène les rattache au bon corps, et rien pour un rapport d’avant', () => {
    const r = all.find((x) => x.killed < x.population)!;
    const base: RiftStageInput = {
      level: 30,
      faction: 'mortsvivants',
      population: r.population,
      killed: r.killed,
      cleared: r.cleared,
      maxPv: r.maxPv,
      pvTrail: r.pvTrail,
    };
    const st = buildRiftStage({ ...base, foeTrail: r.foeTrail }, 1);
    for (const [k, f] of r.foeTrail.entries()) expect(st.foes[k]!.life).toEqual(f);
    expect(st.foes[r.foeTrail.length]!.life).toBeUndefined();
    expect(buildRiftStage(base, 1).foes.every((f) => f.life === undefined)).toBe(true);
  });
});
