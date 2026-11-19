import { describe, expect, it } from 'vitest';
import { boostHeroWalk, heroWalkVoyage } from '@/lib/islandConquest';
import { voyageBoostPlan } from '@/lib/speedBoost';
import type { ExpeditionMap } from '@/lib/expedition';

const NOW = 1_000_000;
const MIN = 60_000;

function mapGoing(): ExpeditionMap {
  return {
    pois: [
      {
        id: 'p1',
        type: 'control',
        x: 10,
        y: 10,
        level: 3,
        control: {
          owner: 'player',
          heroComing: { at: NOW + 30 * MIN, from: NOW - 10 * MIN, unit: {} },
        },
      },
    ],
  } as unknown as ExpeditionMap;
}
function mapHome(): ExpeditionMap {
  return {
    pois: [],
    heroReturnAt: NOW + 20 * MIN,
    heroReturnFrom: { x: 5, y: 5, at: NOW - 5 * MIN },
  } as unknown as ExpeditionMap;
}

describe('⚡ boost de la marche du héros', () => {
  it('vers son poste : arrivée et départ avancent du gain', () => {
    const next = boostHeroWalk(mapGoing(), 10 * MIN, NOW);
    const c = next.pois[0]!.control!.heroComing!;
    expect(c.at).toBe(NOW + 20 * MIN);
    expect(c.from).toBe(NOW - 20 * MIN);
    expect(heroWalkVoyage(next, NOW)!.midAt).toBe(NOW + 20 * MIN);
  });
  it('vers la base : retour et départ avancent du gain', () => {
    const next = boostHeroWalk(mapHome(), 5 * MIN, NOW);
    expect(next.heroReturnAt).toBe(NOW + 15 * MIN);
    expect(next.heroReturnFrom!.at).toBe(NOW - 10 * MIN);
  });
  it('gain nul ou héros immobile : même carte', () => {
    const m = mapGoing();
    expect(boostHeroWalk(m, 0, NOW)).toBe(m);
    const still = { pois: [] } as unknown as ExpeditionMap;
    expect(boostHeroWalk(still, 5 * MIN, NOW)).toBe(still);
  });
  it('le plan de boost voit la marche comme un aller / un retour simple', () => {
    const go = heroWalkVoyage(mapGoing(), NOW)!;
    const pg = voyageBoostPlan({ poi: go.poi, midAt: go.midAt, returnAt: go.midAt }, 15, NOW);
    expect(pg).toMatchObject({ phase: 'go', gainMs: 15 * MIN, lostMs: 0 });
    const home = heroWalkVoyage(mapHome(), NOW)!;
    const ph = voyageBoostPlan({ poi: home.poi, midAt: home.sentAt, returnAt: home.returnAt }, 30, NOW);
    expect(ph).toMatchObject({ phase: 'back', gainMs: 20 * MIN, lostMs: 10 * MIN });
  });
});
