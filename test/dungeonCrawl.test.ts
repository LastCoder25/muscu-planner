import { describe, it, expect } from 'vitest';
import { generateFloor, generateDungeon, type Floor } from '@/lib/dungeonCrawl';

// Toutes les salles sont-elles atteignables depuis le départ (via les couloirs) ?
function allReachable(f: Floor): boolean {
  const seen = new Set<number>([f.startId]);
  const q = [f.startId];
  while (q.length) {
    const cur = q.shift()!;
    for (const nb of f.rooms[cur]!.links) if (!seen.has(nb)) (seen.add(nb), q.push(nb));
  }
  return seen.size === f.rooms.length;
}

describe('dungeonCrawl — génération d’étage', () => {
  it('toutes les salles sont connexes (arbre couvrant)', () => {
    for (let s = 1; s <= 20; s++) expect(allReachable(generateFloor(s, 0, 3))).toBe(true);
  });

  it('exactement 1 départ et 1 sortie ; la sortie n’est pas le départ', () => {
    const f = generateFloor(42, 0, 3);
    expect(f.rooms.filter((r) => r.type === 'start')).toHaveLength(1);
    expect(f.rooms.filter((r) => r.type === 'stairs' || r.type === 'boss')).toHaveLength(1);
    expect(f.exitId).not.toBe(f.startId);
  });

  it('escalier sauf au DERNIER étage (boss)', () => {
    const floors = generateDungeon(7, 3);
    expect(floors[0]!.rooms.find((r) => r.id === floors[0]!.exitId)!.type).toBe('stairs');
    expect(floors[2]!.rooms.find((r) => r.id === floors[2]!.exitId)!.type).toBe('boss');
    // Aucun boss avant le dernier étage.
    expect(floors[0]!.rooms.some((r) => r.type === 'boss')).toBe(false);
    expect(floors[1]!.rooms.some((r) => r.type === 'boss')).toBe(false);
  });

  it('au moins un coffre par étage', () => {
    for (let s = 1; s <= 20; s++)
      expect(generateFloor(s, 1, 4).rooms.some((r) => r.type === 'chest')).toBe(true);
  });

  it('déterministe : même seed → même étage', () => {
    expect(JSON.stringify(generateFloor(99, 2, 5))).toBe(JSON.stringify(generateFloor(99, 2, 5)));
  });

  it('liens symétriques (couloir dans les deux sens)', () => {
    const f = generateFloor(13, 0, 3);
    for (const r of f.rooms)
      for (const nb of r.links) expect(f.rooms[nb]!.links).toContain(r.id);
  });
});
