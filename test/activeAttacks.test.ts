// ⚔️ La liste des attaques visibles en cours (icône à côté de celle des points fixes).
import { describe, expect, it } from 'vitest';
import { activeAttacks } from '@/lib/fieldArmy';
import type { Poi } from '@/lib/expedition';

const base = { level: 20, x: 50, y: 50, distNorm: 0.5, spawnedAt: 0, expiresAt: 9e15 };
const army = (id: string, kind: 'siege' | 'retake', at: number, targetId = 'raid1'): Poi =>
  ({
    ...base,
    id,
    type: 'warband',
    army: { kind, targetId, at, faction: 'bandits', size: 3 },
  }) as Poi;
const point = { ...base, id: 'ctl_mine', type: 'control' } as Poi;
const camp = { ...base, id: 'c1', type: 'camp' } as Poi;

describe('⚔️ attaques en cours', () => {
  it('les armées en marche, la plus proche de frapper d’abord, avec leur cible', () => {
    const list = activeAttacks(
      [camp, point, army('a', 'siege', 900), army('b', 'retake', 300, 'ctl_mine')],
      100,
    );
    expect(list.map((r) => r.army.id)).toEqual(['b', 'a']);
    expect(list[0]!.target?.id).toBe('ctl_mine');
    expect(list[0]!.inMs).toBe(200);
    expect(list[1]!.target).toBeNull();
  });
  it('une armée déjà arrivée ne compte plus, un lieu ordinaire jamais', () => {
    expect(activeAttacks([camp, army('a', 'siege', 100)], 100)).toEqual([]);
  });
});
