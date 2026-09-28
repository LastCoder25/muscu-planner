import { describe, it, expect } from 'vitest';
import {
  loseControl,
  releaseFromControl,
  returnsEnRoute,
  sendHomeFromControl,
  settleReturns,
} from '@/lib/controlPoints';
import { militiaOnMap } from '@/lib/militia';
import { travelPosition, EXPE, type ExpeditionMap, type Poi } from '@/lib/expedition';

const point = (): Poi =>
  ({
    id: 'ctl_mine',
    type: 'control',
    level: 20,
    x: 40,
    y: 60,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 0,
    control: {
      kind: 'mine',
      owner: 'player',
      garrison: ['adv_a', 'mil:1'],
      retakes: 0,
      faction: 'bandits',
      size: 1,
    },
  }) as unknown as Poi;

const mapOf = (p: Poi): ExpeditionMap =>
  ({ seed: 1, spawnCount: 0, nextSpawnAt: 0, pois: [p] }) as ExpeditionMap;

/** Le geste du store : sortir de la garnison, puis noter le trajet du retour. */
function recall(map: ExpeditionMap, now: number, advAt: number, milAt: number): ExpeditionMap {
  const out = releaseFromControl(map, 'ctl_mine', ['adv_a', 'mil:1'], now, 20);
  return sendHomeFromControl(
    sendHomeFromControl(out, 'ctl_mine', ['adv_a'], now, advAt),
    'ctl_mine',
    ['mil:1'],
    now,
    milAt,
  );
}

describe('🏠 le retour d’un point de contrôle se voit sur la carte', () => {
  it('ramenés, ils quittent la garnison et sont EN ROUTE vers la base', () => {
    const m = recall(mapOf(point()), 1000, 5000, 7000);
    expect(m.pois[0]!.control!.garrison).toEqual([]);
    const trips = returnsEnRoute(m, 2000);
    expect(trips.map((t) => t.members)).toEqual([['adv_a'], ['mil:1']]);
  });
  it('le trajet part du point et finit à la ville', () => {
    const m = recall(mapOf(point()), 1000, 5000, 7000);
    const t = returnsEnRoute(m, 1000)[0]!;
    const start = travelPosition(t, 1000);
    expect(start.phase).toBe('return');
    expect(start.x).toBeCloseTo(40);
    expect(start.y).toBeCloseTo(60);
    const end = travelPosition(t, 4999);
    expect(end.x).toBeCloseTo(EXPE.town.x, 0);
    expect(end.y).toBeCloseTo(EXPE.town.y, 0);
  });
  it('un milicien sur le chemin du retour compte toujours dans l’effectif', () => {
    const m = recall(mapOf(point()), 1000, 5000, 7000);
    expect(militiaOnMap(m)).toBe(1);
  });
  it('à l’arrivée ils quittent la carte, et le milicien est rendu à la base', () => {
    const m = recall(mapOf(point()), 1000, 5000, 7000);
    const mid = settleReturns(m, 6000);
    expect(mid.militiaHome).toBe(0);
    expect(returnsEnRoute(mid.map, 6000).map((t) => t.members)).toEqual([['mil:1']]);
    const end = settleReturns(mid.map, 7000);
    expect(end.militiaHome).toBe(1);
    expect(returnsEnRoute(end.map, 7000)).toEqual([]);
    expect(militiaOnMap(end.map)).toBe(0);
    // Clé ABSENTE une fois vidée : la carte se compare par JSON.
    expect('returning' in end.map.pois[0]!.control!).toBe(false);
  });
  it('rend la MÊME carte quand personne n’arrive (pas d’écriture à vide)', () => {
    const m = recall(mapOf(point()), 1000, 5000, 7000);
    expect(settleReturns(m, 2000).map).toBe(m);
  });
  it('un point repris par l’ennemi ne fait pas disparaître ceux qui rentrent', () => {
    const m = loseControl(recall(mapOf(point()), 1000, 5000, 7000), 'ctl_mine', 20);
    expect(m.pois[0]!.control!.owner).toBe('enemy');
    expect(returnsEnRoute(m, 2000).length).toBe(2);
    expect(settleReturns(m, 8000).militiaHome).toBe(1);
  });
});
