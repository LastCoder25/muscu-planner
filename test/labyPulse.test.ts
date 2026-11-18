import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { animationsSkipped, generateDungeon, lootFxSkipped, pulseRoomOf } from '@/lib/dungeonCrawl';

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

describe('⏭️ animationsSkipped', () => {
  it('saute en auto ou en série quand demandé', () => {
    expect(animationsSkipped(true, true, false)).toBe(true);
    expect(animationsSkipped(true, false, true)).toBe(true);
  });
  it('ne saute jamais à la main, ni si le joueur ne l’a pas demandé', () => {
    expect(animationsSkipped(true, false, false)).toBe(false);
    expect(animationsSkipped(false, true, true)).toBe(false);
  });
});

describe('🎁 lootFxSkipped — en série, plus d’animation de coffre ni de butin', () => {
  it('saute TOUJOURS en série, réglage « sauter » posé ou non', () => {
    expect(lootFxSkipped(false, false, true)).toBe(true);
    expect(lootFxSkipped(false, true, true)).toBe(true);
    expect(lootFxSkipped(true, true, true)).toBe(true);
  });
  it('hors série : comme animationsSkipped (jamais à la main, auto seulement si demandé)', () => {
    expect(lootFxSkipped(false, false, false)).toBe(false);
    expect(lootFxSkipped(true, false, false)).toBe(false);
    expect(lootFxSkipped(false, true, false)).toBe(false);
    expect(lootFxSkipped(true, true, false)).toBe(true);
  });
});

describe('🎁 ExpeditionPage — chaque animation de coffre/butin passe par lootFxSkipped', () => {
  const src = readFileSync(resolve(__dirname, '../src/pages/ExpeditionPage.vue'), 'utf8');
  it('pulse (coffre/piège/salle secrète), rebond du 🎒 et éclats « drop »/« familier »', () => {
    const body = (name: string) => {
      const i = src.indexOf(name);
      expect(i).toBeGreaterThan(-1);
      return src.slice(i, i + 400);
    };
    expect(body('function pulse(')).toContain('lootFxOff.value');
    expect(body('function bumpLoot(')).toContain('lootFxOff.value');
    expect(body("kind: 'drop'")).toBeTruthy();
    // chaque celebrate() du Labyrinthe est précédé d'un garde lootFxOff
    const calls = [...src.matchAll(/gameFx\.celebrate\(/g)].map((m) => m.index!);
    expect(calls.length).toBe(2);
    for (const c of calls) expect(src.slice(c - 60, c)).toContain('!lootFxOff.value');
  });
});
