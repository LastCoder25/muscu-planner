import { describe, it, expect } from 'vitest';
import {
  REGIONS,
  regionOfDungeon,
  frontierDungeonId,
  currentRegion,
  nextRegion,
  regionProgress,
  regionMapGeometry,
  mapFillFraction,
} from '@/lib/regions';
import { DUNGEONS } from '@/data/dungeons';

describe('regions — biomes de l’Aventure', () => {
  it('les régions couvrent EXACTEMENT tous les donjons (une seule fois)', () => {
    const inRegions = REGIONS.flatMap((r) => r.dungeonIds).sort();
    const all = DUNGEONS.map((d) => d.id).sort();
    expect(inRegions).toEqual(all);
    // Pas de doublon.
    expect(new Set(inRegions).size).toBe(inRegions.length);
  });

  it('l’ordre des régions suit le recoLevel croissant', () => {
    const flat = REGIONS.flatMap((r) => r.dungeonIds);
    const recos = flat.map((id) => DUNGEONS.find((d) => d.id === id)!.recoLevel);
    for (let i = 1; i < recos.length; i++) expect(recos[i]!).toBeGreaterThanOrEqual(recos[i - 1]!);
  });

  it('regionOfDungeon rattache chaque donjon à sa région', () => {
    expect(regionOfDungeon('clairiere')?.id).toBe('aube');
    expect(regionOfDungeon('faille_chaos')?.id).toBe('chaos');
    expect(regionOfDungeon('inconnu')).toBeUndefined();
  });

  it('frontière = 1er donjon non nettoyé (sinon le dernier)', () => {
    expect(frontierDungeonId([])).toBe('clairiere');
    expect(frontierDungeonId(['clairiere', 'caverne'])).toBe('repaire');
    const allIds = REGIONS.flatMap((r) => r.dungeonIds);
    expect(frontierDungeonId(allIds)).toBe(allIds[allIds.length - 1]);
  });

  it('région courante + suivante progressent avec les clears', () => {
    expect(currentRegion([]).id).toBe('aube');
    expect(nextRegion([])?.id).toBe('gouffres');
    // Toute la 1re région nettoyée → on passe à la 2e.
    const r1 = REGIONS[0]!.dungeonIds;
    expect(currentRegion(r1).id).toBe('gouffres');
    // Tout nettoyé → dernière région, plus de suivante.
    const allIds = REGIONS.flatMap((r) => r.dungeonIds);
    expect(currentRegion(allIds).id).toBe('chaos');
    expect(nextRegion(allIds)).toBeUndefined();
  });

  it('regionProgress compte les donjons nettoyés de la région', () => {
    const r = REGIONS[0]!;
    expect(regionProgress(r, [])).toEqual({ done: 0, total: 3 });
    expect(regionProgress(r, ['clairiere', 'caverne'])).toEqual({ done: 2, total: 3 });
  });

  it('regionMapGeometry : nœuds en zigzag + chemin', () => {
    const g = regionMapGeometry(5);
    expect(g.nodes).toHaveLength(5);
    expect(g.viewH).toBe(460);
    expect(g.nodes[0]).toEqual({ x: 26, y: 46 });
    expect(g.nodes[1]).toEqual({ x: 74, y: 138 });
    expect(g.nodes[2]!.x).toBe(26); // alternance
    expect(g.pathD.startsWith('M 26 46')).toBe(true);
    expect(g.pathD).toContain('C'); // au moins une courbe
    // Un segment par PAIRE de nœuds (5 nœuds → 4 segments), chacun un chemin propre.
    expect(g.segments).toHaveLength(4);
    expect(g.segments[0]!.startsWith('M 26 46')).toBe(true);
  });

  it('mapFillFraction : 0 au départ, 1 à la fin, bornée', () => {
    expect(mapFillFraction(0, 0, 5)).toBe(0);
    expect(mapFillFraction(4, 1, 5)).toBe(1);
    expect(mapFillFraction(2, 0.5, 5)).toBeCloseTo(0.5, 5);
    expect(mapFillFraction(9, 9, 5)).toBe(1); // clamp haut
  });
});
