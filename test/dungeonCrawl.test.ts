import { describe, it, expect } from 'vitest';
import {
  generateFloor,
  generateDungeon,
  startRun,
  canMove,
  enterRoom,
  applyDamage,
  descend,
  frontier,
  isNewRoom,
  type Floor,
} from '@/lib/dungeonCrawl';

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
    for (const r of f.rooms) for (const nb of r.links) expect(f.rooms[nb]!.links).toContain(r.id);
  });

  it('salle secrète (vault) : RARE, ≤1/étage, sur une salle atteignable (jamais start/sortie)', () => {
    let floorsWithVault = 0;
    const N = 400;
    for (let s = 1; s <= N; s++) {
      const f = generateFloor(s, 1, 4);
      const vaults = f.rooms.filter((r) => r.type === 'vault');
      expect(vaults.length).toBeLessThanOrEqual(1); // au plus une par étage
      for (const v of vaults) {
        expect(v.id).not.toBe(f.startId);
        expect(v.id).not.toBe(f.exitId);
        expect(v.links.length).toBeGreaterThanOrEqual(1); // reliée au reste
      }
      if (vaults.length) floorsWithVault++;
    }
    // Rare mais bien présente (proba de base ~12 % + profondeur).
    expect(floorsWithVault).toBeGreaterThan(0);
    expect(floorsWithVault).toBeLessThan(N * 0.4);
  });
});

describe('dungeonCrawl — exploration (état)', () => {
  const floor = generateFloor(5, 0, 3);

  it('startRun : au départ, salle de départ visitée, PV pleins', () => {
    const s = startRun(3, floor, 140);
    expect(s.current).toBe(floor.startId);
    expect(s.visited).toEqual([floor.startId]);
    expect(s.pv).toBe(140);
    expect(s.status).toBe('exploring');
  });

  it('canMove : seulement vers une salle reliée à la courante', () => {
    const s = startRun(3, floor, 140);
    const link = floor.rooms[floor.startId]!.links[0]!;
    const notLinked = floor.rooms.find(
      (r) => r.id !== floor.startId && !floor.rooms[floor.startId]!.links.includes(r.id),
    );
    expect(canMove(s, floor, link)).toBe(true);
    if (notLinked) expect(canMove(s, floor, notLinked.id)).toBe(false);
  });

  it('enterRoom : déplace + marque visitée ; isNewRoom bascule', () => {
    const s = startRun(3, floor, 140);
    const link = floor.rooms[floor.startId]!.links[0]!;
    expect(isNewRoom(s, link)).toBe(true);
    const s2 = enterRoom(s, floor, link);
    expect(s2.current).toBe(link);
    expect(s2.visited).toContain(link);
    expect(isNewRoom(s2, link)).toBe(false);
  });

  it('applyDamage : PV plancher 0 → status dead', () => {
    const s = startRun(3, floor, 30);
    expect(applyDamage(s, 10).pv).toBe(20);
    const dead = applyDamage(s, 999);
    expect(dead.pv).toBe(0);
    expect(dead.status).toBe('dead');
  });

  it('descend : étage suivant (PV reportés) ; null = donjon nettoyé', () => {
    const s = { ...startRun(3, floor, 100), pv: 55 };
    const next = generateFloor(5, 1, 3);
    const d = descend(s, next);
    expect(d.floor).toBe(1);
    expect(d.current).toBe(next.startId);
    expect(d.pv).toBe(55); // reportés
    expect(descend(s, null).status).toBe('cleared');
  });

  it('frontier : salles adjacentes aux visitées, non visitées', () => {
    const s = startRun(3, floor, 140);
    const fr = frontier(floor, s);
    expect(fr.length).toBeGreaterThan(0);
    for (const id of fr) expect(s.visited).not.toContain(id);
    // La frontière initiale = les voisins directs du départ.
    expect(new Set(fr)).toEqual(new Set(floor.rooms[floor.startId]!.links));
  });
});
