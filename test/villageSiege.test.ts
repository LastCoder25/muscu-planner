import { describe, expect, it } from 'vitest';
import {
  panAngle,
  sectorAngle,
  SIEGE_STAGE,
  SIEGE_WALL_R,
  VILLAGE,
  villageAngle,
  villageVertexAngle,
} from '@/lib/siegeStage';
import { BATTLE } from '@/lib/siegeBattle';

const y = (a: number, r: number) => 100 + Math.sin(a) * r;

describe('🏘️ le siège du village du port', () => {
  it('la muraille est un arc côté terre, ouvert sur la mer', () => {
    const n = BATTLE.sectors;
    const a0 = villageVertexAngle(0);
    const aN = villageVertexAngle(n);
    expect(aN - a0).toBeCloseTo(VILLAGE.span);
    // Ses deux extrémités tombent sur le rivage, au-dessus de la mer.
    for (const a of [a0, aN]) expect(y(a, SIEGE_WALL_R)).toBeLessThan(VILLAGE.shoreY);
    // Tous ses sommets sont au nord du centre (côté terre).
    for (let i = 0; i <= n; i++)
      expect(y(villageVertexAngle(i), SIEGE_WALL_R)).toBeLessThanOrEqual(100);
  });

  it('chaque pan du moteur tombe sur SON pan de la muraille du village', () => {
    for (let i = 0; i < BATTLE.sectors; i++) {
      const mid = (villageVertexAngle(i) + villageVertexAngle(i + 1)) / 2;
      expect(villageAngle(panAngle(i))).toBeCloseTo(mid);
      expect(villageAngle(sectorAngle(i))).toBeCloseTo(villageVertexAngle(i));
    }
  });

  it('aucun assaillant ne naît dans la mer', () => {
    for (let k = 0; k <= 400; k++) {
      const a = villageAngle((k / 400) * Math.PI * 2);
      for (const r of [SIEGE_STAGE.spawnMin, SIEGE_STAGE.spawnMax])
        expect(y(a, r)).toBeLessThan(VILLAGE.shoreY);
    }
  });

  it("le repli conserve l'ordre autour de la ville (pas de saut entre deux pans voisins)", () => {
    for (let i = 0; i + 1 < BATTLE.sectors; i++)
      expect(villageAngle(panAngle(i + 1))).toBeGreaterThan(villageAngle(panAngle(i)));
  });
});

import { advanceBase, emptyBase, rollRaid, type BaseState } from '@/lib/raid';
import { siegeArmyPoi, siegeOrigin } from '@/lib/fieldArmy';
import type { Poi } from '@/lib/expedition';

const NOW = Date.UTC(2026, 9, 4, 12);
const H = 3_600_000;

describe('🏝️ les sièges sur une île', () => {
  const ready = (): BaseState => ({
    ...emptyBase(3, NOW),
    defenses: [
      { typeId: 'wall', level: 30 },
      { typeId: 'turret', level: 30 },
      { typeId: 'watchtower', level: 30 },
    ] as BaseState['defenses'],
    nextRaidAt: NOW,
  });
  const ctx = { playerLevel: 30, activeDays7: 7, globalXp: 0, fortSightMs: () => 0, towerBoost: 0, levelBand: null };

  it('une île non pacifiée lance un siège, de la faction de l’île', () => {
    const r = advanceBase(ready(), { ...ctx, pacified: false, faction: 'mortsvivants' }, NOW);
    expect(r.detected).not.toBe(null);
    expect(r.detected!.faction).toBe('mortsvivants');
  });

  it('imposer la faction ne décale pas le reste du tirage', () => {
    const a = rollRaid(42, 30, NOW + 4 * H, H, null, null);
    const b = rollRaid(42, 30, NOW + 4 * H, H, null, null, 'betes');
    expect(b.faction).toBe('betes');
    expect(b.groups.length).toBe(a.groups.length);
    expect(b.groups.map((g) => g.level)).toEqual(a.groups.map((g) => g.level));
  });

  const ctrl = (id: string, owner: 'enemy' | 'player', x: number, y: number) =>
    ({ id, type: 'control', x, y, control: { owner } }) as unknown as Poi;

  it('l’armée sort d’un point ENNEMI, toujours le même pour un même siège', () => {
    const pois = [
      ctrl('a', 'player', 10, 10),
      ctrl('b', 'enemy', 60, 40),
      ctrl('c', 'enemy', 150, 50),
    ];
    const o = siegeOrigin({ seed: 7 }, pois)!;
    expect(['60,40', '150,50']).toContain(`${o.x},${o.y}`);
    expect(siegeOrigin({ seed: 7 }, [...pois].reverse())).toEqual(o);
    expect(siegeOrigin({ seed: 7 }, [ctrl('a', 'player', 1, 1)])).toBeUndefined();
  });

  it('elle apparaît sur la route qui vient de ce point', () => {
    const raid = rollRaid(9, 30, NOW + 2 * H, 4 * H, null, null);
    raid.detectedAt = NOW - 2 * H;
    const origin = { x: 100, y: -300 }; // plein nord, très loin
    const p = siegeArmyPoi(raid, 200, NOW, 30, undefined, origin)!;
    expect(p.from!.x).toBeCloseTo(100);
    expect(p.from!.y).toBeLessThan(100);
  });
});
