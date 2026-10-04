import { describe, expect, it } from 'vitest';
import { ISLANDS } from '../src/lib/archipelago';
import { controlKindsOf, controlSpot } from '../src/lib/controlPoints';
import { objectiveSpot } from '../src/lib/islandConquest';
import { islandTerrain } from '../src/lib/islandTerrain';
import { DEFENSE_LINE_T, islandCenter, onIsland } from '../src/lib/islandShape';
import { EXPE } from '../src/lib/expedition';

const T = EXPE.town;

describe('🛡️ les points fixes forment une ligne de défense entre le départ et la forteresse', () => {
  for (const isl of ISLANDS) {
    it(`île ${isl.id}`, () => {
      const f = islandTerrain(isl.id).fortress;
      const ax = f.x - T.x;
      const ay = f.y - T.y;
      const len2 = ax * ax + ay * ay;
      for (const seed of [1, 12345, 999]) {
        const map = { seed, archipel: { island: isl.id } } as never;
        const spots = controlKindsOf(map).map((k) => controlSpot(map, k));
        for (const s of spots) {
          // Projection sur l'axe départ → forteresse : à la part `DEFENSE_LINE_T`, à l'arrondi près.
          const t = ((s.x - T.x) * ax + (s.y - T.y) * ay) / len2;
          expect(Math.abs(t - DEFENSE_LINE_T), `île ${isl.id}`).toBeLessThan(0.03);
          expect(onIsland(isl.id, s.x, s.y, 1)).toBe(true);
        }
        // Étalés en travers, pas empilés.
        for (let i = 1; i < spots.length; i++)
          expect(
            Math.hypot(spots[i]!.x - spots[i - 1]!.x, spots[i]!.y - spots[i - 1]!.y),
          ).toBeGreaterThan(14);
      }
    });
  }
});

describe('🎯 les objectifs sont répartis sur toute l’île', () => {
  for (const isl of ISLANDS) {
    it(`île ${isl.id}`, () => {
      const f = islandTerrain(isl.id).fortress;
      const objs = Array.from({ length: isl.objectives }, (_, i) => objectiveSpot(isl.id, i));
      // Vu du CENTRE de l'île (le village des îles 2 à 5 est au bord).
      const c = islandCenter(isl.id);
      const fortAng = Math.atan2(f.y - c.y, f.x - c.x);
      const angs = objs.map((o) => Math.atan2(o.y - c.y, o.x - c.x));
      for (const o of objs) {
        expect(onIsland(isl.id, o.x, o.y, 1)).toBe(true);
        expect(Math.hypot(o.x - f.x, o.y - f.y)).toBeGreaterThan(14);
      }
      for (let i = 0; i < objs.length; i++)
        for (let j = i + 1; j < objs.length; j++)
          expect(Math.hypot(objs[i]!.x - objs[j]!.x, objs[i]!.y - objs[j]!.y)).toBeGreaterThan(50);
      // Pas tous groupés du côté de la forteresse : au moins un à plus de 90° de sa direction.
      const off = angs.map((a) =>
        Math.abs(Math.atan2(Math.sin(a - fortAng), Math.cos(a - fortAng))),
      );
      expect(Math.max(...off)).toBeGreaterThan(Math.PI / 2);
    });
  }
});
