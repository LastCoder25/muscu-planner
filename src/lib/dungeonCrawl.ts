// dungeonCrawl.ts — génération d'étages de donjon « façon manga » (pur, testé).
// Un étage = une grille de SALLES reliées par des COULOIRS. Connexité garantie
// par un arbre couvrant (DFS randomisé), + quelques boucles pour des embranchements.
// Types de salle : départ, monstre, coffre, piège, vide, escalier (sortie), boss
// (sortie du DERNIER étage). Déterministe via mulberry32(seed) → rejouable/testable.
// L'état d'exploration (salles vues/nettoyées, PV reportés) et l'UI de carte
// viennent par-dessus (store + page), ce module ne fait que la STRUCTURE.
import { mulberry32 } from './combat';

export type RoomType = 'start' | 'monster' | 'chest' | 'trap' | 'empty' | 'stairs' | 'boss';

export interface Room {
  id: number;
  x: number;
  y: number;
  type: RoomType;
  links: number[]; // ids des salles reliées (couloirs)
}

export interface Floor {
  index: number; // 0-based
  cols: number;
  rows: number;
  rooms: Room[];
  startId: number;
  exitId: number; // escalier (ou boss au dernier étage)
}

// Grille selon l'étage : petite (carte lisible sur mobile), croît un peu en profondeur.
function gridFor(floorIndex: number): { cols: number; rows: number } {
  const n = Math.min(4, 3 + Math.floor(floorIndex / 2)); // 3 → 4
  return { cols: n, rows: n };
}

// Distance BFS max depuis `from` (via les couloirs) → salle la plus éloignée = sortie.
function farthestRoom(rooms: Room[], from: number): number {
  const dist = new Map<number, number>([[from, 0]]);
  const queue = [from];
  let far = from;
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    for (const nb of rooms[cur]!.links) {
      if (!dist.has(nb)) {
        dist.set(nb, d + 1);
        if (d + 1 > dist.get(far)!) far = nb;
        queue.push(nb);
      }
    }
  }
  return far;
}

// Type d'une salle « libre » selon la profondeur (0..1) : plus profond = plus de
// monstres/pièges. Coffres constants (récompense), vide en complément.
function pickType(rng: () => number, depth: number): RoomType {
  const monster = 0.4 + 0.16 * depth;
  const trap = 0.1 + 0.1 * depth;
  const chest = 0.18;
  const r = rng();
  if (r < monster) return 'monster';
  if (r < monster + trap) return 'trap';
  if (r < monster + trap + chest) return 'chest';
  return 'empty';
}

/** Génère un étage déterministe. `floors` = nb total d'étages du donjon (pour
 *  savoir si c'est le dernier → salle boss au lieu d'escalier). */
export function generateFloor(seed: number, floorIndex: number, floors: number): Floor {
  const rng = mulberry32((seed | 0) + floorIndex * 1013 + 7);
  const { cols, rows } = gridFor(floorIndex);
  const idAt = (x: number, y: number) => y * cols + x;
  const rooms: Room[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) rooms.push({ id: idAt(x, y), x, y, type: 'empty', links: [] });
  const at = (i: number) => rooms[i]!;
  const link = (a: number, b: number) => {
    if (!at(a).links.includes(b)) {
      at(a).links.push(b);
      at(b).links.push(a);
    }
  };
  const neighborsGrid = (id: number): number[] => {
    const x = id % cols;
    const y = Math.floor(id / cols);
    return (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const
    )
      .map(([dx, dy]) => [x + dx, y + dy] as const)
      .filter(([nx, ny]) => nx >= 0 && nx < cols && ny >= 0 && ny < rows)
      .map(([nx, ny]) => idAt(nx, ny));
  };

  // Arbre couvrant (DFS randomisé) depuis le coin haut-gauche → toutes les salles reliées.
  const startId = 0;
  const visited = new Set<number>([startId]);
  const stack = [startId];
  while (stack.length) {
    const cur = stack[stack.length - 1]!;
    const unvisited = neighborsGrid(cur).filter((id) => !visited.has(id));
    if (!unvisited.length) {
      stack.pop();
      continue;
    }
    const next = unvisited[Math.floor(rng() * unvisited.length)]!;
    link(cur, next);
    visited.add(next);
    stack.push(next);
  }
  // Quelques boucles (embranchements) — le donjon n'est pas un simple couloir.
  const loops = Math.floor(cols * rows * 0.15);
  for (let k = 0; k < loops; k++) {
    const a = Math.floor(rng() * rooms.length);
    const cand = neighborsGrid(a);
    if (cand.length) link(a, cand[Math.floor(rng() * cand.length)]!);
  }

  // Sortie = salle la plus éloignée du départ.
  const exitId = farthestRoom(rooms, startId);
  const isLast = floorIndex === floors - 1;
  at(startId).type = 'start';
  at(exitId).type = isLast ? 'boss' : 'stairs';

  // Types des salles restantes selon la profondeur.
  const depth = floors > 1 ? floorIndex / (floors - 1) : 0;
  for (const r of rooms) if (r.type === 'empty') r.type = pickType(rng, depth);

  // Garantir au moins 1 coffre par étage (récompense d'exploration).
  if (!rooms.some((r) => r.type === 'chest')) {
    const cand = rooms.find((r) => r.type === 'empty') ?? rooms.find((r) => r.type === 'monster');
    if (cand) cand.type = 'chest';
  }
  return { index: floorIndex, cols, rows, rooms, startId, exitId };
}

/** Tous les étages d'un donjon (même seed → même donjon). */
export function generateDungeon(seed: number, floors: number): Floor[] {
  return Array.from({ length: Math.max(1, floors) }, (_, i) => generateFloor(seed, i, floors));
}

/** Salles adjacentes (par couloir) d'une salle — pour révéler le « brouillard ». */
export function adjacentRooms(floor: Floor, roomId: number): number[] {
  return floor.rooms[roomId]?.links ?? [];
}

export const ROOM_EMOJI: Record<RoomType, string> = {
  start: '🚪',
  monster: '👾',
  chest: '🎁',
  trap: '⚠️',
  empty: '·',
  stairs: '🔽',
  boss: '👑',
};
