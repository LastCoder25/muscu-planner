import { describe, expect, it } from 'vitest';
import { generateDungeon, pulseRoomOf } from '@/lib/dungeonCrawl';

describe('🫧 pulseRoomOf — l’effet d’une salle ne survit pas à son étage', () => {
  const dungeon = generateDungeon(7, 3);
  const big = dungeon.reduce((a, f) => (f.rooms.length > a.rooms.length ? f : a));
  const small = dungeon.reduce((a, f) => (f.rooms.length < a.rooms.length ? f : a));

  it('rend la salle quand l’effet appartient à l’étage affiché', () => {
    const last = big.rooms.length - 1;
    expect(pulseRoomOf({ id: last, floor: big.index }, big.index, big)).toBe(big.rooms[last]);
  });

  it('rend null sans effet', () => {
    expect(pulseRoomOf(null, 0, dungeon[0]!)).toBeNull();
  });

  it('rend null quand l’effet vient d’un autre étage (descente en auto rapide)', () => {
    // La salle 0 existe sur les deux étages : seul l’étage d’origine la désavoue.
    expect(pulseRoomOf({ id: 0, floor: 0 }, 1, dungeon[1]!)).toBeNull();
  });

  it('rend null quand la salle n’existe pas sur l’étage affiché (nouveau run)', () => {
    expect(pulseRoomOf({ id: 999, floor: 0 }, 0, dungeon[0]!)).toBeNull();
  });
});
