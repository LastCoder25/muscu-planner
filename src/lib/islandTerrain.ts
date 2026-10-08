/**
 * 🏝️ LE DESSIN DES ÎLES DE L'ARCHIPEL (demandé par l'utilisateur : « chaque île est entourée de
 * mer, la forme des îles est différente pour chaque île », un décor par île, le port et la
 * forteresse portuaire dessinés, une vraie carte de l'archipel).
 *
 * ⚠️ PUR ET DÉCORATIF : rien ici ne décide du jeu. La forme et le décor d'une île ne dépendent
 * QUE de son numéro — l'île 2 a la même silhouette pour tout le monde, c'est ce qui en fait un
 * LIEU qu'on reconnaît. Les lieux à prendre restent posés par `expedition.ts` dans le disque de
 * l'île (`ISLAND_REACH`) : la côte est tenue de ne JAMAIS passer en deçà (`ISLAND_MIN_R`), sinon
 * un lieu se poserait dans la mer. (v1.28.0 : la silhouette vit dans `islandShape.ts`, et
 * les lieux se posent désormais sur TOUTE la terre ferme, à `LAND_MARGIN` de la côte.)
 */
import { mulberry32 } from './combat';
import { EXPE, MAP_VIEW } from './expedition';
import {
  angDiff,
  islandCenter,
  islandRadiusAt,
  islandShape,
  islandView,
  PORT_DOCK,
  onIsland,
  ISLAND_MAX_R,
} from './islandShape';

// La silhouette vit dans `islandShape.ts` (la carte en a besoin pour poser les lieux, et
// `expedition.ts` ne peut pas importer ce fichier-ci sans cycle).
export { islandRadiusAt, onIsland, ISLAND_MAX_R, ISLAND_MIN_R } from './islandShape';

/** Les couleurs d'une île (une ambiance par menace). */
export interface IslandStyle {
  sea0: string;
  sea1: string;
  shoal: string;
  sand: string;
  land0: string;
  land1: string;
  patch: string;
  tuft: string;
}

type DecorKind =
  | 'mountain'
  | 'hill'
  | 'tree'
  | 'pine'
  | 'deadtree'
  | 'rock'
  | 'tent'
  | 'stake'
  | 'tomb'
  | 'banner'
  | 'crystal'
  | 'crack'
  | 'bones'
  | 'dune'
  | 'house'
  | 'field'
  | 'ruin';

interface Decor {
  kind: DecorKind;
  d: string;
  x: number;
  y: number;
}

/** Une ancre posée sur la côte : sa position et l'angle vers la mer (radians). */
interface CoastAnchor {
  x: number;
  y: number;
  angle: number;
}

export interface IslandTerrainData {
  island: number;
  style: IslandStyle;
  /** Le contour de l'île (path fermé). */
  coast: string;
  decor: Decor[];
  rivers: string[];
  tufts: string[];
  patches: { cx: number; cy: number; rx: number; ry: number }[];
  /** Mares (île des Morts) : ellipses d'eau stagnante. */
  pools: { cx: number; cy: number; rx: number; ry: number }[];
  /** Vaguelettes en mer. */
  waves: string[];
  /** Le port d'arrivée (au fond de la baie). ⚓ Aucun sur l'île 1 (demandé) : on y part de la
   *  base, pas d'un port. */
  port: CoastAnchor | null;
  /** La forteresse portuaire (sur le cap opposé). */
  fortress: CoastAnchor;
}

export const ISLAND_STYLES: Record<number, IslandStyle> = {
  1: {
    sea0: '#2c6f8f',
    sea1: '#173d55',
    shoal: '#5fa6b8',
    sand: '#d8c48a',
    land0: '#64793a',
    land1: '#43552a',
    patch: '#3b4c23',
    tuft: '#86a34b',
  },
  2: {
    sea0: '#26607a',
    sea1: '#123246',
    shoal: '#4d8f9c',
    sand: '#c9b37a',
    land0: '#3f6131',
    land1: '#26401f',
    patch: '#1f3418',
    tuft: '#5f8a3e',
  },
  3: {
    sea0: '#2e4d57',
    sea1: '#152830',
    shoal: '#5d7b7e',
    sand: '#a69d84',
    land0: '#566056',
    land1: '#363d39',
    patch: '#2b322e',
    tuft: '#7d8a7a',
  },
  4: {
    sea0: '#3a5f78',
    sea1: '#1d3447',
    shoal: '#7898a6',
    sand: '#dcc28c',
    land0: '#9a8146',
    land1: '#6e5a30',
    patch: '#5a4826',
    tuft: '#b8a160',
  },
  5: {
    sea0: '#33294a',
    sea1: '#160f24',
    shoal: '#5c4a78',
    sand: '#6e6476',
    land0: '#4a3d55',
    land1: '#2a2133',
    patch: '#1d1626',
    tuft: '#7a6390',
  },
};

/** Le point de départ : la base (île 1) ou le village de pêcheurs (îles 2 à 5). */
const C = EXPE.town.x;
const f1 = (v: number) => +v.toFixed(1);

const COAST_STEPS = 144;

/** Le contour lissé d'une île centrée en (cx, cy), à l'échelle `scale`. */
function islandOutline(
  id: number,
  cx: number = islandCenter(id).x,
  cy: number = islandCenter(id).y,
  scale = 1,
): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < COAST_STEPS; i++) {
    const t = (i / COAST_STEPS) * Math.PI * 2;
    const r = islandRadiusAt(id, t) * scale;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  // Lissage : on passe par les milieux, chaque sommet sert de point de contrôle.
  const mid = (a: [number, number], b: [number, number]) => [
    f1((a[0] + b[0]) / 2),
    f1((a[1] + b[1]) / 2),
  ];
  const n = pts.length;
  const m0 = mid(pts[n - 1]!, pts[0]!);
  let d = `M${m0[0]} ${m0[1]}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(p, pts[(i + 1) % n]!);
    d += `Q${f1(p[0])} ${f1(p[1])} ${m[0]} ${m[1]}`;
  }
  return d + 'Z';
}

// ── Motifs ────────────────────────────────────────────────────────────────────────────────
function motif(kind: DecorKind, x: number, y: number, s: number, r: () => number): string {
  switch (kind) {
    case 'mountain':
      return `M${f1(x - 3.4 * s)} ${f1(y + 1.6 * s)}L${f1(x)} ${f1(y - 3.6 * s)}L${f1(x + 3.4 * s)} ${f1(y + 1.6 * s)}ZM${f1(x)} ${f1(y - 3.6 * s)}L${f1(x - 1.1 * s)} ${f1(y - 0.3 * s)}`;
    case 'hill':
      return `M${f1(x - 4.2 * s)} ${f1(y)}Q${f1(x)} ${f1(y - 3.4 * s)} ${f1(x + 4.2 * s)} ${f1(y)}Z`;
    case 'tree':
      return `M${f1(x)} ${f1(y - 3 * s)}L${f1(x - 1.7 * s)} ${f1(y + s)}L${f1(x + 1.7 * s)} ${f1(y + s)}ZM${f1(x)} ${f1(y + s)}L${f1(x)} ${f1(y + 2.2 * s)}`;
    case 'pine':
      return `M${f1(x)} ${f1(y - 4.2 * s)}L${f1(x - 1.3 * s)} ${f1(y - 1.4 * s)}L${f1(x - 0.6 * s)} ${f1(y - 1.4 * s)}L${f1(x - 1.8 * s)} ${f1(y + 1 * s)}L${f1(x + 1.8 * s)} ${f1(y + s)}L${f1(x + 0.6 * s)} ${f1(y - 1.4 * s)}L${f1(x + 1.3 * s)} ${f1(y - 1.4 * s)}ZM${f1(x)} ${f1(y + s)}L${f1(x)} ${f1(y + 2.2 * s)}`;
    case 'deadtree': {
      const b = r() < 0.5 ? -1 : 1;
      return `M${f1(x)} ${f1(y + 2 * s)}L${f1(x)} ${f1(y - 3 * s)}M${f1(x)} ${f1(y - 1 * s)}L${f1(x + 1.6 * b * s)} ${f1(y - 2.6 * s)}M${f1(x)} ${f1(y - 2 * s)}L${f1(x - 1.3 * b * s)} ${f1(y - 3.2 * s)}`;
    }
    case 'rock':
      return `M${f1(x - 2 * s)} ${f1(y + 0.8 * s)}L${f1(x - 1.4 * s)} ${f1(y - 0.9 * s)}L${f1(x + 0.2 * s)} ${f1(y - 1.5 * s)}L${f1(x + 1.9 * s)} ${f1(y - 0.3 * s)}L${f1(x + 1.6 * s)} ${f1(y + 0.8 * s)}Z`;
    case 'tent':
      return `M${f1(x - 2.2 * s)} ${f1(y + 1.2 * s)}L${f1(x)} ${f1(y - 2 * s)}L${f1(x + 2.2 * s)} ${f1(y + 1.2 * s)}ZM${f1(x)} ${f1(y - 2 * s)}L${f1(x)} ${f1(y + 1.2 * s)}`;
    case 'stake':
      return `M${f1(x)} ${f1(y + 0.8 * s)}L${f1(x)} ${f1(y - 1.6 * s)}`;
    case 'tomb':
      return `M${f1(x - 0.9 * s)} ${f1(y + 1 * s)}L${f1(x - 0.9 * s)} ${f1(y - 0.8 * s)}Q${f1(x)} ${f1(y - 2 * s)} ${f1(x + 0.9 * s)} ${f1(y - 0.8 * s)}L${f1(x + 0.9 * s)} ${f1(y + 1 * s)}Z`;
    case 'banner':
      return `M${f1(x)} ${f1(y + 1.5 * s)}L${f1(x)} ${f1(y - 3.5 * s)}M${f1(x)} ${f1(y - 3.5 * s)}L${f1(x + 2.2 * s)} ${f1(y - 2.8 * s)}L${f1(x)} ${f1(y - 2 * s)}`;
    case 'crystal':
      return `M${f1(x)} ${f1(y - 3.4 * s)}L${f1(x + 0.9 * s)} ${f1(y - 0.4 * s)}L${f1(x)} ${f1(y + 1 * s)}L${f1(x - 0.9 * s)} ${f1(y - 0.4 * s)}ZM${f1(x + 1.3 * s)} ${f1(y - 1.6 * s)}L${f1(x + 1.9 * s)} ${f1(y)}L${f1(x + 1.3 * s)} ${f1(y + 1 * s)}L${f1(x + 0.8 * s)} ${f1(y)}Z`;
    case 'crack': {
      let d = `M${f1(x)} ${f1(y)}`;
      let px = x;
      let py = y;
      const a = r() * Math.PI;
      for (let i = 0; i < 4; i++) {
        px += Math.cos(a + (r() - 0.5) * 1.4) * 2.2 * s;
        py += Math.sin(a + (r() - 0.5) * 1.4) * 2.2 * s;
        d += `L${f1(px)} ${f1(py)}`;
      }
      return d;
    }
    case 'bones':
      return `M${f1(x - 1.4 * s)} ${f1(y - 1 * s)}L${f1(x + 1.4 * s)} ${f1(y + 1 * s)}M${f1(x - 1.4 * s)} ${f1(y + 1 * s)}L${f1(x + 1.4 * s)} ${f1(y - 1 * s)}`;
    case 'dune':
      return `M${f1(x - 4 * s)} ${f1(y)}Q${f1(x)} ${f1(y - 2.2 * s)} ${f1(x + 4 * s)} ${f1(y)}`;
    case 'house':
      // Une maison : murs, toit à deux pans.
      return `M${f1(x - 1.6 * s)} ${f1(y + 1.2 * s)}L${f1(x - 1.6 * s)} ${f1(y - 0.4 * s)}L${f1(x)} ${f1(y - 1.9 * s)}L${f1(x + 1.6 * s)} ${f1(y - 0.4 * s)}L${f1(x + 1.6 * s)} ${f1(y + 1.2 * s)}Z`;
    case 'field': {
      // Un champ : une parcelle et ses sillons.
      const w = 3.4 * s;
      const h = 2.2 * s;
      let d = `M${f1(x - w)} ${f1(y - h)}L${f1(x + w)} ${f1(y - h)}L${f1(x + w)} ${f1(y + h)}L${f1(x - w)} ${f1(y + h)}Z`;
      for (let i = -1; i <= 1; i++)
        d += `M${f1(x - w + 0.5)} ${f1(y + i * h * 0.55)}L${f1(x + w - 0.5)} ${f1(y + i * h * 0.55)}`;
      return d;
    }
    case 'ruin':
      // Un pan de mur effondré.
      return `M${f1(x - 2.2 * s)} ${f1(y + 1 * s)}L${f1(x - 2.2 * s)} ${f1(y - 1.6 * s)}L${f1(x - 1 * s)} ${f1(y - 1.6 * s)}L${f1(x - 1 * s)} ${f1(y - 0.6 * s)}L${f1(x + 0.4 * s)} ${f1(y - 0.9 * s)}L${f1(x + 0.4 * s)} ${f1(y + 0.1 * s)}L${f1(x + 2.2 * s)} ${f1(y + 0.1 * s)}L${f1(x + 2.2 * s)} ${f1(y + 1 * s)}Z`;
  }
}

/** Les recettes de décor : des AMAS (chaîne, forêt, camp…) répartis sur l'île. */
type Cluster =
  | 'range'
  | 'hills'
  | 'forest'
  | 'pines'
  | 'deadwood'
  | 'rocks'
  | 'camp'
  | 'graveyard'
  | 'warcamp'
  | 'crystals'
  | 'scorched'
  | 'bones'
  | 'dunes'
  | 'village'
  | 'fields'
  | 'ruins';

// 🌿 v1.28.0 (« habille la carte ») : les lieux couvrent désormais toute l'île, le décor aussi
// — deux fois plus d'amas par île, des villages, des champs et des ruines.
const BIOMES: Record<number, { clusters: Cluster[]; rivers: number; pools: number }> = {
  1: {
    clusters: [
      'range',
      'hills',
      'hills',
      'forest',
      'forest',
      'forest',
      'camp',
      'camp',
      'rocks',
      'village',
      'village',
      'fields',
      'fields',
      'forest',
      'pines',
      'hills',
      'range',
      'ruins',
    ],
    rivers: 3,
    pools: 0,
  },
  2: {
    clusters: [
      'pines',
      'pines',
      'pines',
      'forest',
      'forest',
      'range',
      'rocks',
      'bones',
      'bones',
      'pines',
      'pines',
      'forest',
      'range',
      'hills',
      'rocks',
      'village',
      'fields',
    ],
    rivers: 3,
    pools: 0,
  },
  3: {
    clusters: [
      'deadwood',
      'deadwood',
      'graveyard',
      'graveyard',
      'graveyard',
      'rocks',
      'hills',
      'deadwood',
      'ruins',
      'ruins',
      'ruins',
      'deadwood',
      'deadwood',
      'hills',
      'rocks',
      'graveyard',
    ],
    rivers: 1,
    pools: 9,
  },
  4: {
    clusters: [
      'range',
      'range',
      'warcamp',
      'warcamp',
      'warcamp',
      'dunes',
      'dunes',
      'scorched',
      'rocks',
      'range',
      'warcamp',
      'dunes',
      'dunes',
      'ruins',
      'ruins',
      'rocks',
      'hills',
    ],
    rivers: 1,
    pools: 0,
  },
  5: {
    clusters: [
      'crystals',
      'crystals',
      'crystals',
      'scorched',
      'scorched',
      'deadwood',
      'range',
      'rocks',
      'crystals',
      'crystals',
      'scorched',
      'ruins',
      'ruins',
      'deadwood',
      'range',
      'rocks',
    ],
    rivers: 0,
    pools: 0,
  },
};

const cache = new Map<number, IslandTerrainData>();

/** Le terrain complet de l'île `id` (mis en cache : il ne dépend que de l'id). */
export function islandTerrain(id: number): IslandTerrainData {
  const hit = cache.get(id);
  if (hit) return hit;
  const shape = islandShape(id);
  const style = ISLAND_STYLES[id] ?? ISLAND_STYLES[1]!;
  const biome = BIOMES[id] ?? BIOMES[1]!;
  const rng = mulberry32((id * 2654435761) >>> 0 || 1);
  // ⚠️ Le CENTRE de l'île n'est la ville que sur l'île 1 : ailleurs le point de départ est le
  // village du port, et l'île s'étend devant lui (`islandCenter`).
  const { x: ox, y: oy } = islandCenter(id);

  // ⚓ Le port au fond de la baie, la forteresse sur le cap.
  const anchor = (t: number, inset: number): CoastAnchor => {
    const r = islandRadiusAt(id, t) - inset;
    return { x: f1(ox + Math.cos(t) * r), y: f1(oy + Math.sin(t) * r), angle: t };
  };
  const port = anchor(shape.bay, PORT_DOCK);
  const fortress = anchor(shape.cape, 9);
  // 🛤️ Plus de route dessinée (demandé) : elle filait de la base vers le bord de l'île et ne
  // menait nulle part. ⚠️ Le tirage qui la courbait est conservé : le retirer décalerait tout
  // le décor de chaque île.
  rng();
  // Ce qui reste dégagé : la base, le port et la forteresse.
  const free = (x: number, y: number, pad = 0) =>
    onIsland(id, x, y, 3) &&
    Math.hypot(x - C, y - C) > 16 + pad &&
    Math.hypot(x - port.x, y - port.y) > 9 + pad &&
    Math.hypot(x - fortress.x, y - fortress.y) > 11 + pad;

  const decor: Decor[] = [];
  const put = (kind: DecorKind, x: number, y: number, s: number) => {
    if (!free(x, y)) return;
    decor.push({ kind, d: motif(kind, x, y, s, rng), x: f1(x), y: f1(y) });
  };
  const rivers: string[] = [];
  const centers: [number, number][] = [];
  const pickCenter = (): [number, number] => {
    let best: [number, number] = [ox, oy];
    let bestGap = -1;
    for (let k = 0; k < 40; k++) {
      const t = rng() * Math.PI * 2;
      const rr = 20 + rng() * (islandRadiusAt(id, t) - 30);
      const p: [number, number] = [ox + Math.cos(t) * rr, oy + Math.sin(t) * rr];
      if (!free(p[0], p[1], 2)) continue;
      const gap = centers.length
        ? Math.min(...centers.map(([a, b]) => Math.hypot(a - p[0], b - p[1])))
        : 99;
      if (gap > bestGap) {
        bestGap = gap;
        best = p;
      }
    }
    centers.push(best);
    return best;
  };
  const ring = (cx: number, cy: number, n: number, rad: number, kind: DecorKind, s: number) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * rad;
      put(kind, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, s * (0.8 + rng() * 0.5));
    }
  };

  for (const cl of biome.clusters) {
    const [cx, cy] = pickCenter();
    switch (cl) {
      case 'range': {
        const dir = rng() * Math.PI;
        const n = 5 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * (3.6 + rng());
          put(
            'mountain',
            cx + Math.cos(dir) * t + (rng() - 0.5) * 2.4,
            cy + Math.sin(dir) * t + (rng() - 0.5) * 2.4,
            0.9 + rng() * 0.8,
          );
        }
        break;
      }
      case 'hills':
        ring(cx, cy, 6, 11, 'hill', 1);
        break;
      case 'forest':
        ring(cx, cy, 16, 11, 'tree', 1);
        break;
      case 'pines':
        ring(cx, cy, 20, 13, 'pine', 1);
        break;
      case 'deadwood':
        ring(cx, cy, 10, 11, 'deadtree', 1);
        break;
      case 'rocks':
        ring(cx, cy, 6, 9, 'rock', 0.9);
        break;
      case 'bones':
        ring(cx, cy, 5, 6, 'bones', 0.8);
        ring(cx, cy, 3, 6, 'rock', 1);
        break;
      case 'dunes':
        ring(cx, cy, 6, 10, 'dune', 1);
        break;
      case 'village':
        // 🏘️ Un hameau : quelques maisons serrées, ses champs autour.
        ring(cx, cy, 6, 5, 'house', 0.9);
        ring(cx, cy, 3, 11, 'field', 1);
        break;
      case 'fields':
        ring(cx, cy, 5, 10, 'field', 1);
        break;
      case 'ruins':
        ring(cx, cy, 4, 7, 'ruin', 1);
        ring(cx, cy, 3, 8, 'rock', 0.8);
        break;
      case 'crystals':
        ring(cx, cy, 8, 8, 'crystal', 1);
        break;
      case 'scorched':
        ring(cx, cy, 6, 10, 'crack', 1);
        break;
      case 'camp': {
        // 🗡️ Un camp de brigands : trois tentes dans une palissade.
        for (let i = 0; i < 3; i++) put('tent', cx + (i - 1) * 3.6, cy + (rng() - 0.5) * 2, 0.9);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          put('stake', cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 5.5, 1);
        }
        break;
      }
      case 'warcamp': {
        // ⚔️ Un camp de guerre : tentes alignées et étendards.
        for (let i = 0; i < 4; i++) put('tent', cx + (i - 1.5) * 3.8, cy + (i % 2) * 2.4, 1);
        put('banner', cx - 8, cy - 2, 1.1);
        put('banner', cx + 8, cy - 2, 1.1);
        break;
      }
      case 'graveyard': {
        // 💀 Un cimetière : rangées de tombes.
        for (let row = 0; row < 3; row++)
          for (let col = 0; col < 4; col++)
            put('tomb', cx + (col - 1.5) * 3 + (rng() - 0.5), cy + row * 3.2 - 3, 0.9);
        break;
      }
    }
  }
  // Rivières : d'un relief jusqu'à la mer.
  for (let i = 0; i < biome.rivers; i++) {
    const t0 = rng() * Math.PI * 2;
    let px = ox + Math.cos(t0) * 26;
    let py = oy + Math.sin(t0) * 26;
    let a = t0 + (rng() - 0.5) * 0.6;
    let d = `M${f1(px)} ${f1(py)}`;
    for (let k = 0; k < 40; k++) {
      a += (rng() - 0.5) * 0.7;
      // Toujours vers le large : on ne remonte pas vers la base.
      a += angDiff(Math.atan2(py - oy, px - ox), a) * 0.25;
      const nx = px + Math.cos(a) * 4;
      const ny = py + Math.sin(a) * 4;
      d += `Q${f1(px + Math.cos(a) * 2)} ${f1(py + Math.sin(a) * 2)} ${f1(nx)} ${f1(ny)}`;
      px = nx;
      py = ny;
      if (!onIsland(id, px, py, -1)) break; // l'embouchure touche la mer
    }
    rivers.push(d);
  }
  // Prairie : taches et touffes, sur la terre ferme seulement.
  const dec = mulberry32((id * 0x5bd1e995) >>> 0 || 7);
  const span = ISLAND_MAX_R;
  const rpx = () => ox + (dec() * 2 - 1) * span;
  const rpy = () => oy + (dec() * 2 - 1) * span;
  const tufts: string[] = [];
  for (let i = 0; i < 1600 && tufts.length < 240; i++) {
    const x = rpx();
    const y = rpy();
    if (!onIsland(id, x, y, 2) || Math.hypot(x - C, y - C) < 14) continue;
    const h = 1.6 + dec() * 1.2;
    tufts.push(
      `M${f1(x)} ${f1(y)}l-0.9 -${f1(h * 0.8)}M${f1(x)} ${f1(y)}l0 -${f1(h)}M${f1(x)} ${f1(y)}l0.9 -${f1(h * 0.8)}`,
    );
  }
  const patches: IslandTerrainData['patches'] = [];
  for (let i = 0; i < 500 && patches.length < 40; i++) {
    const cx = rpx();
    const cy = rpy();
    if (!onIsland(id, cx, cy, 8) || Math.hypot(cx - C, cy - C) < 16) continue;
    patches.push({ cx: f1(cx), cy: f1(cy), rx: f1(5 + dec() * 8), ry: f1(2.5 + dec() * 3.5) });
  }
  const pools: IslandTerrainData['pools'] = [];
  for (let i = 0; i < 200 && pools.length < biome.pools; i++) {
    const cx = rpx();
    const cy = rpy();
    if (!onIsland(id, cx, cy, 8) || !free(cx, cy, 2)) continue;
    pools.push({ cx: f1(cx), cy: f1(cy), rx: f1(3 + dec() * 4), ry: f1(1.6 + dec() * 2) });
  }
  // Vaguelettes : en mer, dans la fenêtre dessinée.
  const waves: string[] = [];
  const view = islandView(id, MAP_VIEW.size / 2);
  for (let i = 0; i < 600 && waves.length < 60; i++) {
    const x = view.x + 4 + dec() * (view.size - 8);
    const y = view.y + 4 + dec() * (view.size - 8);
    const dx = x - ox;
    const dy = y - oy;
    if (Math.hypot(dx, dy) < islandRadiusAt(id, Math.atan2(dy, dx)) + 6) continue;
    waves.push(`M${f1(x - 2.4)} ${f1(y)}q1.2 -1.1 2.4 0q1.2 1.1 2.4 0`);
  }
  decor.sort((a, b) => a.y - b.y);
  const out: IslandTerrainData = {
    island: id,
    style,
    coast: islandOutline(id),
    decor,
    rivers,
    tufts,
    patches,
    pools,
    waves,
    port: id <= 1 ? null : port,
    fortress,
  };
  cache.set(id, out);
  return out;
}
