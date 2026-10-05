import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL, ISLANDS } from '../src/lib/archipelago';
import { controlKindsOf, controlSpot, ensureControls } from '../src/lib/controlPoints';
import { ensureIslandConquest, NEST, nestLevel, objectiveSpot } from '../src/lib/islandConquest';
import { islandTerrain } from '../src/lib/islandTerrain';
import {
  DEFENSE_LINE_SHAPE,
  DEFENSE_LINE_WOBBLE,
  islandCenter,
  onIsland,
} from '../src/lib/islandShape';
import { createMap, EXPE } from '../src/lib/expedition';

const T = EXPE.town;

describe('🛡️ les points fixes sont à égale distance du départ et de la forteresse', () => {
  for (const isl of ISLANDS.filter((i) => !DEFENSE_LINE_SHAPE[i.id])) {
    it(`île ${isl.id}`, () => {
      const f = islandTerrain(isl.id).fortress;
      const axis = Math.hypot(f.x - T.x, f.y - T.y);
      for (const seed of [1, 12345, 999]) {
        const map = { seed, archipel: { island: isl.id } } as never;
        const spots = controlKindsOf(map).map((k) => controlSpot(map, k));
        for (const s of spots) {
          const dT = Math.hypot(s.x - T.x, s.y - T.y);
          const dF = Math.hypot(s.x - f.x, s.y - f.y);
          // « Environ » : l'écart vient du petit décalage (2 × DEFENSE_LINE_WOBBLE) et de l'arrondi.
          expect(Math.abs(dT - dF), `île ${isl.id}`).toBeLessThanOrEqual(
            2 * DEFENSE_LINE_WOBBLE + 2,
          );
          expect(onIsland(isl.id, s.x, s.y, 1)).toBe(true);
          // Ni sur le départ ni sur la forteresse : vers le milieu de l'axe.
          expect(dT).toBeGreaterThan(axis * 0.3);
        }
        // Étalés d'une côte à l'autre, pas empilés.
        for (let i = 1; i < spots.length; i++)
          expect(
            Math.hypot(spots[i]!.x - spots[i - 1]!.x, spots[i]!.y - spots[i - 1]!.y),
          ).toBeGreaterThan(14);
        // Pas une règle : les places ne sont pas toutes à la même distance du départ.
        if (spots.length >= 3) {
          const proj = spots.map(
            (s) => ((s.x - T.x) * (f.x - T.x) + (s.y - T.y) * (f.y - T.y)) / axis,
          );
          expect(Math.max(...proj) - Math.min(...proj)).toBeGreaterThan(DEFENSE_LINE_WOBBLE);
        }
      }
    });
  }
});

describe('📐 île 2 : un trait de haut-gauche à bas-droite, entre le village et la forteresse', () => {
  const f = islandTerrain(2).fortress;
  const map = { seed: 1, archipel: { island: 2 } } as never;
  const spots = controlKindsOf(map).map((k) => controlSpot(map, k));
  // Côté de la droite (premier → dernier lieu) où tombe un point.
  const side = (p: { x: number; y: number }) => {
    const a = spots[0]!;
    const b = spots[spots.length - 1]!;
    return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  };
  it('alignés, sur la terre', () => {
    const a = spots[0]!;
    const b = spots[spots.length - 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (const s of spots) {
      const off = Math.abs((b.x - a.x) * (s.y - a.y) - (b.y - a.y) * (s.x - a.x)) / len;
      expect(off).toBeLessThanOrEqual(1.5);
      expect(onIsland(2, s.x, s.y, 1)).toBe(true);
    }
  });
  it('en diagonale : de haut-gauche à bas-droite, ni verticale ni horizontale', () => {
    const a = spots[0]!;
    const b = spots[spots.length - 1]!;
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(35);
    expect(deg).toBeLessThan(60);
  });
  it('le village d’un côté, la forteresse de l’autre ; le lieu du milieu à égale distance', () => {
    expect(side(T)).not.toBe(side(f));
    const m = spots[1]!;
    expect(
      Math.abs(Math.hypot(m.x - T.x, m.y - T.y) - Math.hypot(m.x - f.x, m.y - f.y)),
    ).toBeLessThanOrEqual(8);
  });
});

describe('🎯 les objectifs sont au niveau max de l’île (sauf les nids, au rang du joueur)', () => {
  for (const isl of ISLANDS) {
    it(`île ${isl.id}`, () => {
      // Un joueur bien sous le plafond de l'île : l'objectif ne suit pas son niveau.
      const player = isl.minLevel;
      const m = ensureIslandConquest(
        createMap(7, 0, player, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(isl.id)),
        0,
        player,
      );
      const objs = m.pois.filter((q) => q.control?.kind === 'objective');
      expect(objs.length).toBe(isl.objectives);
      // 🪺 Île des nids (2026-10-04) : chacun à un rang autour du joueur (`nestLevel`).
      const want = (i: number) =>
        NEST.islands.has(isl.id) ? nestLevel(i, player, isl) : isl.maxLevel;
      objs.forEach((o) => expect(o.level).toBe(want(Number(o.id.slice('isl_obj_'.length)))));
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
          expect(Math.hypot(objs[i]!.x - objs[j]!.x, objs[i]!.y - objs[j]!.y)).toBeGreaterThan(40);
      // Pas tous groupés du côté de la forteresse : au moins un à plus de 90° de sa direction.
      const off = angs.map((a) =>
        Math.abs(Math.atan2(Math.sin(a - fortAng), Math.cos(a - fortAng))),
      );
      expect(Math.max(...off)).toBeGreaterThan(Math.PI / 2);
    });
  }
});

describe('🏳️ un lieu TENU rejoint aussi sa place (v1.49.3)', () => {
  const isl = ISLANDS[1]!;
  const lv = isl.maxLevel;
  const base = () =>
    ensureIslandConquest(
      ensureControls(
        createMap(7, 0, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(isl.id)),
        0,
        lv,
        ISLAND_OUTPOST_LEVEL,
      ),
      0,
      lv,
    );
  // Un lieu fixe tenu, posé à une ancienne place.
  const held = (m: ReturnType<typeof base>, id: string) => ({
    ...m,
    pois: m.pois.map((p) =>
      p.id === id
        ? { ...p, x: p.x - 20, y: p.y + 7, control: { ...p.control!, owner: 'player' as const } }
        : p,
    ),
  });
  it('tenu et libre : il va sur la ligne', () => {
    const m = base();
    const id = m.pois.find((p) => p.control && !p.id.startsWith('isl_'))!.id;
    const out = ensureIslandConquest(held(m, id), 1, lv);
    const p = out.pois.find((q) => q.id === id)!;
    const want = controlSpot(out, p.control!.kind);
    expect([p.x, p.y]).toEqual([want.x, want.y]);
    expect(p.control!.owner).toBe('player');
  });
  it('une équipe en est partie : il garde sa place', () => {
    const m = base();
    const id = m.pois.find((p) => p.control && !p.id.startsWith('isl_'))!.id;
    const h = held(m, id);
    const before = h.pois.find((q) => q.id === id)!;
    const out = ensureIslandConquest(h, 1, lv, new Set(), new Set([id]));
    const p = out.pois.find((q) => q.id === id)!;
    expect([p.x, p.y]).toEqual([before.x, before.y]);
  });
});
