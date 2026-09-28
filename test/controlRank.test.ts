import { describe, it, expect } from 'vitest';
import {
  attackerLevel,
  controlGoldPerHour,
  isHeldControl,
  loseControl,
  trainingXpPerHour,
} from '@/lib/controlPoints';
import { characterRank } from '@/lib/characterRank';
import type { ExpeditionMap, Poi } from '@/lib/expedition';

const point = (level: number, attackAt = 1000): Poi =>
  ({
    id: 'ctl_mine',
    type: 'control',
    level,
    x: 40,
    y: 60,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 0,
    control: {
      kind: 'mine',
      owner: 'player',
      garrison: ['adv_a'],
      retakes: 2,
      faction: 'bandits',
      size: 1,
      attackAt,
    },
  }) as unknown as Poi;
const mapOf = (p: Poi): ExpeditionMap =>
  ({ seed: 7, spawnCount: 0, nextSpawnAt: 0, pois: [p] }) as ExpeditionMap;

describe('🏳️ une place tenue est neutre, le rang appartient aux assaillants', () => {
  it('tenue : elle produit au niveau du héros, quel que soit le rang qu’elle avait', () => {
    expect(controlGoldPerHour(point(3), 1, 40)).toBe(controlGoldPerHour(point(38), 1, 40));
    expect(controlGoldPerHour(point(3), 1, 60)).toBeGreaterThan(
      controlGoldPerHour(point(3), 1, 40),
    );
    expect(trainingXpPerHour(60)).toBeGreaterThan(trainingXpPerHour(40));
    expect(isHeldControl(point(3))).toBe(true);
    expect(isHeldControl({ control: { ...point(3).control!, owner: 'enemy' } })).toBe(false);
  });

  it('les assaillants tirent leur rang à CHAQUE attaque, entre Bronze et celui du joueur', () => {
    const lv = Array.from({ length: 200 }, (_, i) =>
      attackerLevel(7, point(20, 1000 + i * 977), 60),
    );
    for (const l of lv) {
      expect(l).toBeGreaterThanOrEqual(1);
      expect(l).toBeLessThanOrEqual(60);
    }
    const ranks = new Set(lv.map((l) => characterRank(l).rankIndex));
    expect(ranks.size).toBeGreaterThan(2);
    expect(ranks.has(0)).toBe(true);
    // Même attaque, même rang (rejouable) ; il ne dépend pas du rang que le lieu avait.
    expect(attackerLevel(7, point(20, 5000), 60)).toBe(attackerLevel(7, point(55, 5000), 60));
  });

  it('délogé, le lieu prend le rang et la bannière de ceux qui l’ont repris', () => {
    const m = loseControl(mapOf(point(20)), 'ctl_mine', 60, 0, {
      level: 12,
      faction: 'mortsvivants',
    });
    const p = m.pois[0]!;
    expect(p.level).toBe(12);
    expect(p.control!.faction).toBe('mortsvivants');
    expect(p.control!.owner).toBe('enemy');
    // Abandonné (sans bataille) : un rang re-tiré, jamais au-dessus du joueur.
    const a = loseControl(mapOf(point(20)), 'ctl_mine', 60, 0).pois[0]!;
    expect(a.level).toBeLessThanOrEqual(60);
  });
});
