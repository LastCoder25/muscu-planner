import { describe, expect, it, vi } from 'vitest';
import {
  ISLAND_MAX_R,
  ISLAND_MIN_R,
  ISLAND_STYLES,
  islandRadiusAt,
  islandTerrain,
  onIsland,
} from '@/lib/islandTerrain';
import { ISLANDS, ISLAND_OUTPOST_LEVEL, ISLAND_REACH, archipelOn } from '@/lib/archipelago';
import { EXPE, MAP_VIEW, createMap } from '@/lib/expedition';
import { LAND_MARGIN, NEAR, TOWN, angDiff, islandCenter } from '@/lib/islandShape';

const IDS = ISLANDS.map((i) => i.id);
const ANGLES = Array.from({ length: 360 }, (_, i) => (i / 360) * Math.PI * 2);

describe('🏝️ la côte des îles', () => {
  it('ne passe jamais dans la zone des lieux, et laisse de la mer tout autour', () => {
    expect(ISLAND_MIN_R).toBeGreaterThan(ISLAND_REACH);
    for (const id of IDS)
      for (const t of ANGLES) {
        const r = islandRadiusAt(id, t);
        expect(r).toBeGreaterThanOrEqual(ISLAND_MIN_R);
        expect(r).toBeLessThanOrEqual(ISLAND_MAX_R);
      }
    expect(ISLAND_MAX_R).toBeLessThan(MAP_VIEW.size / 2 - 15);
  });

  it('chaque île a SA silhouette : deux îles ne se ressemblent pas', () => {
    for (const a of IDS)
      for (const b of IDS) {
        if (a >= b) continue;
        const diff =
          ANGLES.reduce((s, t) => s + Math.abs(islandRadiusAt(a, t) - islandRadiusAt(b, t)), 0) /
          ANGLES.length;
        expect(diff, `îles ${a} et ${b}`).toBeGreaterThan(3);
      }
  });

  it('tous les lieux posés sur une île tombent sur SA terre, à la marge de la côte', () => {
    for (const seed of [1, 9, 42])
      for (const id of IDS) {
        const m = createMap(seed, 0, 20, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
        for (const p of m.pois) expect(onIsland(id, p.x, p.y, LAND_MARGIN - 1)).toBe(true);
      }
  });
  it('la silhouette recopie bien les valeurs de la carte (module feuille)', () => {
    expect(TOWN).toBe(EXPE.town.x);
    expect(TOWN).toBe(EXPE.town.y);
    expect(NEAR).toBe(EXPE.distMin);
    expect(ISLAND_MAX_R).toBeLessThanOrEqual(MAP_VIEW.size / 2 - 22 + 0.1);
  });

  it('une palette par île', () => {
    const lands = new Set(IDS.map((id) => ISLAND_STYLES[id]!.land0));
    expect(lands.size).toBe(IDS.length);
  });
});

describe('🏝️ le décor', () => {
  it('reste sur la terre, hors de la base', () => {
    for (const id of IDS) {
      const t = islandTerrain(id);
      expect(t.decor.length).toBeGreaterThan(40);
      for (const d of t.decor) {
        expect(onIsland(id, d.x, d.y, 2)).toBe(true);
        expect(Math.hypot(d.x - 100, d.y - 100)).toBeGreaterThan(15);
      }
    }
  });

  it('dit la menace de chaque île', () => {
    const kinds = (id: number) => new Set(islandTerrain(id).decor.map((d) => d.kind));
    expect(kinds(1).has('tent') && kinds(1).has('stake')).toBe(true); // camps de brigands
    expect(kinds(2).has('pine') && kinds(2).has('bones')).toBe(true); // bêtes
    expect(kinds(3).has('tomb') && kinds(3).has('deadtree')).toBe(true); // morts
    expect(islandTerrain(3).pools.length).toBeGreaterThan(0);
    expect(kinds(4).has('banner') && kinds(4).has('tent')).toBe(true); // seigneur de guerre
    expect(kinds(5).has('crystal') && kinds(5).has('crack')).toBe(true); // maudite
    // Chaque marqueur reste chez SA menace : des tombes seulement chez les morts, des
    // cristaux seulement sur l'île maudite, des étendards seulement chez le seigneur de guerre.
    for (const id of IDS) {
      expect(kinds(id).has('tomb'), `tombes sur l'île ${id}`).toBe(id === 3);
      expect(kinds(id).has('crystal'), `cristaux sur l'île ${id}`).toBe(id === 5);
      expect(kinds(id).has('banner'), `étendards sur l'île ${id}`).toBe(id === 4);
    }
  });

  it('est déterministe (une île est la même pour tout le monde)', async () => {
    // ⚠️ On RECHARGE le module : comparer deux appels relirait le même cache.
    vi.resetModules();
    const fresh = await import('@/lib/islandTerrain');
    for (const id of IDS)
      expect(JSON.stringify(fresh.islandTerrain(id))).toBe(JSON.stringify(islandTerrain(id)));
  });
});

describe('🏝️ port et forteresse', () => {
  it('sont sur la côte, aux deux bouts de l’île : le port à l’ouest, la forteresse à l’opposé exact', () => {
    for (const id of IDS) {
      const { fortress } = islandTerrain(id);
      // ⚓ L'île 1 n'a pas de port (demandé) : seule sa forteresse est vérifiée.
      const port = islandTerrain(id).port;
      const c = islandCenter(id);
      for (const a of port ? [port, fortress] : [fortress]) {
        const r = Math.hypot(a.x - c.x, a.y - c.y);
        expect(r).toBeGreaterThan(islandRadiusAt(id, a.angle) - 12);
        expect(r).toBeLessThanOrEqual(islandRadiusAt(id, a.angle));
      }
      // ⛵ Les îles sont en ligne, d’ouest en est : on arrive côté ouest, on repart côté est.
      expect(Math.cos(fortress.angle)).toBeGreaterThan(0);
      if (!port) continue;
      expect(Math.cos(port.angle)).toBeLessThan(0);
      expect(Math.abs(angDiff(port.angle, fortress.angle))).toBeCloseTo(Math.PI, 6);
    }
  });

  it('l’île 1 ne dessine pas de port (demandé) : on y part de la base', () => {
    expect(islandTerrain(1).port).toBeNull();
    for (const id of IDS.filter((i) => i > 1)) expect(islandTerrain(id).port).not.toBeNull();
  });

  it('îles 2 à 5 : on débarque au port, l’île s’étend devant le village ; l’île 1 est la capitale', () => {
    expect(islandCenter(1)).toEqual({ x: 100, y: 100 });
    for (const id of IDS.filter((i) => i > 1)) {
      const port = islandTerrain(id).port!;
      // Le point de départ (la ville, 100,100) est le village, tout près du port.
      expect(Math.hypot(port.x - 100, port.y - 100)).toBeLessThan(6);
      expect(onIsland(id, 100, 100)).toBe(true);
    }
  });
});
