import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL, ISLANDS } from '../src/lib/archipelago';
import { controlKindsOf, controlSpot, ensureControls } from '../src/lib/controlPoints';
import { ensureIslandConquest, objectiveSpot } from '../src/lib/islandConquest';
import { islandTerrain } from '../src/lib/islandTerrain';
import { DEFENSE_LINE_T, islandCenter, onIsland } from '../src/lib/islandShape';
import { createMap, EXPE } from '../src/lib/expedition';

const T = EXPE.town;

describe('🛡️ les points fixes forment une ligne VERTICALE entre le départ et la forteresse', () => {
  for (const isl of ISLANDS) {
    it(`île ${isl.id}`, () => {
      const f = islandTerrain(isl.id).fortress;
      const xLine = T.x + (f.x - T.x) * DEFENSE_LINE_T;
      for (const seed of [1, 12345, 999]) {
        const map = { seed, archipel: { island: isl.id } } as never;
        const spots = controlKindsOf(map).map((k) => controlSpot(map, k));
        for (const s of spots) {
          // Tous au même x (à l'arrondi près), à mi-chemin du départ et de la forteresse.
          expect(Math.abs(s.x - xLine), `île ${isl.id}`).toBeLessThanOrEqual(1);
          expect(onIsland(isl.id, s.x, s.y, 1)).toBe(true);
        }
        // Le départ d'un côté de la ligne, la forteresse de l'autre.
        expect(Math.sign(T.x - xLine)).not.toBe(Math.sign(f.x - xLine));
        // Étalés du haut au bas, pas empilés.
        for (let i = 1; i < spots.length; i++)
          expect(Math.abs(spots[i]!.y - spots[i - 1]!.y)).toBeGreaterThan(14);
      }
    });
  }
});

describe('🎯 les objectifs sont au niveau max de l’île', () => {
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
      for (const o of objs) expect(o.level).toBe(isl.maxLevel);
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
