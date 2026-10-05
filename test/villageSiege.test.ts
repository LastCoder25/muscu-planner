import { describe, expect, it } from 'vitest';
import {
  panAngle,
  sectorAngle,
  SIEGE_STAGE,
  SIEGE_WALL_R,
  VILLAGE,
  villageAngle,
  villageDefenderSpot,
  villageRadius,
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
    for (const a of [a0, aN]) expect(y(a, VILLAGE.wallR)).toBeLessThan(VILLAGE.shoreY);
    // Tous ses sommets sont au nord du centre (côté terre).
    for (let i = 0; i <= n; i++)
      expect(y(villageVertexAngle(i), VILLAGE.wallR)).toBeLessThanOrEqual(100);
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
      for (const r of [SIEGE_STAGE.spawnMin, SIEGE_STAGE.spawnMax, SIEGE_STAGE.wallStop])
        expect(y(a, villageRadius(r))).toBeLessThan(VILLAGE.shoreY);
    }
  });

  it("le repli conserve l'ordre autour de la ville (pas de saut entre deux pans voisins)", () => {
    for (let i = 0; i + 1 < BATTLE.sectors; i++)
      expect(villageAngle(panAngle(i + 1))).toBeGreaterThan(villageAngle(panAngle(i)));
  });

  it('la muraille est assez grande pour que deux balistes voisines ne se chevauchent pas', () => {
    // Une baliste dessinée fait ~20 unités de large (7,5 × 1,35 de rayon) : on veut de l'air.
    const p = (i: number) => {
      const a = villageVertexAngle(i);
      return { x: Math.cos(a) * VILLAGE.wallR, y: Math.sin(a) * VILLAGE.wallR };
    };
    for (let i = 0; i < BATTLE.sectors; i++) {
      const a = p(i);
      const b = p(i + 1);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(32);
    }
    expect(VILLAGE.wallR).toBeGreaterThan(SIEGE_WALL_R);
  });

  describe('les défenseurs (champions et miliciens)', () => {
    const inYard = (p: { x: number; y: number }) =>
      p.y < VILLAGE.shoreY - 8 && Math.hypot(p.x - 100, p.y - 100) < VILLAGE.wallR * 0.86;
    const breaches = Array.from({ length: BATTLE.sectors }, (_, i) => villageAngle(panAngle(i)));

    it('jamais dans l’eau, toujours dans la cour — quelle que soit la brèche', () => {
      for (const b of breaches)
        for (const n of [1, 4, 9, 16, 24])
          for (let j = 0; j < n; j++) {
            const p = villageDefenderSpot(b, j, n, 'yard');
            expect(inYard(p), `brèche ${b.toFixed(2)}, ${j}/${n}`).toBe(true);
          }
    });

    it('la cour se tient AU CENTRE du village, pas contre la brèche', () => {
      const cx = 100;
      const cy = 100 - VILLAGE.wallR * 0.45;
      for (const b of breaches)
        for (const n of [1, 6, 12]) {
          const pts = Array.from({ length: n }, (_, j) => villageDefenderSpot(b, j, n, 'yard'));
          const mx = pts.reduce((s, p) => s + p.x, 0) / n;
          const my = pts.reduce((s, p) => s + p.y, 0) / n;
          expect(Math.abs(mx - cx)).toBeLessThan(1);
          expect(Math.abs(my - cy)).toBeLessThan(1);
        }
    });

    it('deux défenseurs de la cour ne se recouvrent pas', () => {
      const n = 16;
      const pts = Array.from({ length: n }, (_, j) =>
        villageDefenderSpot(breaches[3]!, j, n, 'yard'),
      );
      for (let i = 0; i < n; i++)
        for (let k = i + 1; k < n; k++)
          expect(Math.hypot(pts[i]!.x - pts[k]!.x, pts[i]!.y - pts[k]!.y)).toBeGreaterThan(12);
    });

    it('les tireurs du rempart restent SUR la muraille, au-dessus de la mer', () => {
      const lo = villageVertexAngle(0);
      const hi = villageVertexAngle(BATTLE.sectors);
      for (const b of breaches)
        for (const n of [1, 3, 8, 14])
          for (let j = 0; j < n; j++) {
            const p = villageDefenderSpot(b, j, n, 'rampart');
            const a = Math.atan2(p.y - 100, p.x - 100);
            expect(a).toBeGreaterThan(lo);
            expect(a).toBeLessThan(hi);
            expect(p.y).toBeLessThan(VILLAGE.shoreY - 8);
            expect(Math.hypot(p.x - 100, p.y - 100)).toBeGreaterThan(VILLAGE.wallR * 0.8);
          }
    });

    it('un tireur du rempart ne recouvre pas une baliste', () => {
      for (const b of breaches)
        for (let j = 0; j < 14; j++) {
          const p = villageDefenderSpot(b, j, 14, 'rampart');
          for (let i = 0; i <= BATTLE.sectors; i++) {
            const a = villageVertexAngle(i);
            const t = {
              x: 100 + Math.cos(a) * VILLAGE.wallR,
              y: 100 + Math.sin(a) * VILLAGE.wallR,
            };
            expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeGreaterThan(13);
          }
        }
    });
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
  const ctx = {
    playerLevel: 30,
    activeDays7: 7,
    globalXp: 0,
    fortSightMs: () => 0,
    towerBoost: 0,
    levelBand: null,
  };

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
