/**
 * 🏝️ LA SILHOUETTE DES ÎLES DE L'ARCHIPEL, et la terre où se posent les lieux.
 *
 * ⚠️ MODULE FEUILLE (aucun import) : `expedition.ts` le lit pour poser les lieux sur TOUTE la
 * terre ferme (décision de l'utilisateur, 2026-10-02 : « utilise tout l'espace de la carte
 * disponible même si ça dépasse 4 h »), et `islandTerrain.ts` pour la dessiner. Les deux ne
 * peuvent donc pas passer l'un par l'autre. Les quelques valeurs de la carte dont il a besoin
 * (la ville, la distance mini) sont recopiées ici et VÉRIFIÉES par un test.
 */

/** La ville (`EXPE.town`), au centre de chaque île. */
export const TOWN = 100;
/** La distance mini ville ↔ lieu (`EXPE.distMin`). */
export const NEAR = 18;
/** La côte ne descend jamais sous ce rayon… */
export const ISLAND_MIN_R = 60;
/** …ni ne monte au-dessus de celui-ci : il reste de la mer tout autour de la fenêtre dessinée
 *  (`MAP_VIEW.size / 2 - 22`, vérifié par un test). */
export const ISLAND_MAX_R = 99.8;
/** Les lieux restent à cette distance de la côte (la plage, et l'icône qui ne déborde pas). */
export const LAND_MARGIN = 8;

/** La silhouette d'une île : rayon de base, harmoniques [k, amplitude, phase], une baie (le
 *  port) et un cap (la forteresse). ⚠️ Écrites à la main, une par île : c'est ce qui les rend
 *  RECONNAISSABLES — un tirage seul donnerait cinq patatoïdes cousins. */
export interface Shape {
  base: number;
  harm: [k: number, amp: number, phase: number][];
  bay: number; // angle de la baie (radians)
  bayDepth: number; // part du rayon retirée au fond de la baie
  bayWidth: number; // largeur angulaire de la baie
  cape: number; // angle du cap
  capeHeight: number;
}

const SHAPES: Record<number, Shape> = {
  // 🗡️ Brigands : une île ronde et bonhomme, une large baie au sud.
  1: {
    base: 76,
    harm: [
      [2, 0.06, 0.4],
      [3, 0.05, 1.9],
      [5, 0.03, 0.7],
    ],
    bay: Math.PI / 2,
    bayDepth: 0.2,
    bayWidth: 0.45,
    cape: -Math.PI / 2 + 0.6,
    capeHeight: 0.14,
  },
  // 🐺 Bêtes : longue, couchée d'est en ouest, côte déchiquetée.
  2: {
    base: 78,
    harm: [
      [2, 0.2, 0],
      [3, 0.04, 2.4],
      [7, 0.035, 0.3],
      [11, 0.02, 1.1],
    ],
    bay: Math.PI / 2 + 0.5,
    bayDepth: 0.18,
    bayWidth: 0.35,
    cape: 0.15,
    capeHeight: 0.1,
  },
  // 💀 Morts : un croissant — un grand golfe mangé au nord-est.
  3: {
    base: 80,
    harm: [
      [1, 0.12, 2.6],
      [4, 0.04, 0.9],
      [6, 0.025, 2.1],
    ],
    bay: -Math.PI / 4,
    bayDepth: 0.24,
    bayWidth: 0.7,
    cape: Math.PI - 0.4,
    capeHeight: 0.16,
  },
  // ⚔️ Seigneur de guerre : trois lobes anguleux, comme une place forte.
  4: {
    base: 78,
    harm: [
      [3, 0.16, 0.5],
      [6, 0.04, 1.3],
      [9, 0.02, 0.2],
    ],
    bay: Math.PI / 2 + 0.52,
    bayDepth: 0.16,
    bayWidth: 0.3,
    cape: -Math.PI / 2 - 0.5,
    capeHeight: 0.12,
  },
  // 🌑 Maudite : hérissée de pointes, comme brisée.
  5: {
    base: 79,
    harm: [
      [5, 0.11, 0.1],
      [8, 0.04, 1.7],
      [13, 0.03, 0.6],
    ],
    bay: Math.PI / 2 - 0.3,
    bayDepth: 0.2,
    bayWidth: 0.32,
    cape: -Math.PI / 2 + 0.3,
    capeHeight: 0.15,
  },
};

/** Écart angulaire signé ramené dans [−π, π]. */
export function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Le rayon de la côte de l'île `id` à l'angle `t`. ⚠️ SOURCE UNIQUE de la silhouette : le
 *  dessin de l'île, son décor (tout dedans) et sa miniature de l'archipel la lisent. */
export function islandRadiusAt(id: number, t: number): number {
  const s = islandShape(id);
  let k = 0;
  for (const [n, amp, ph] of s.harm) k += amp * Math.sin(n * t + ph);
  const bay = angDiff(t, s.bay) / s.bayWidth;
  k -= s.bayDepth * Math.exp(-bay * bay);
  const cape = angDiff(t, s.cape) / 0.25;
  k += s.capeHeight * Math.exp(-cape * cape);
  return Math.min(ISLAND_MAX_R, Math.max(ISLAND_MIN_R, s.base * (1 + k)));
}

/** Le point (x, y) est-il sur l'île, à `margin` au moins de la côte ? */
export function onIsland(id: number, x: number, y: number, margin = 0): boolean {
  const dx = x - TOWN;
  const dy = y - TOWN;
  return Math.hypot(dx, dy) <= islandRadiusAt(id, Math.atan2(dy, dx)) - margin;
}

/** L'île `id` (repli sur l'île 1). */
export function islandShape(id: number): Shape {
  return SHAPES[id] ?? SHAPES[1]!;
}

/** Le rayon UTILE à l'angle `t` : jusqu'où un lieu peut se poser (la côte moins la marge). */
function islandUsable(id: number, t: number): number {
  return islandRadiusAt(id, t) - LAND_MARGIN;
}

/** La distance d'un lieu fixe posé à la part `frac` (0..1) de la terre utile à l'angle `t`,
 *  depuis la distance mini de la ville. Suit la côte : un lieu sur un lobe va plus loin. */
export function islandRing(id: number, t: number, frac: number): number {
  return NEAR + frac * (islandUsable(id, t) - NEAR);
}

const spans = new Map<number, number>();
/** Le rayon utile le plus grand de l'île (la zone où l'on tire les lieux). */
export function islandSpan(id: number): number {
  const hit = spans.get(id);
  if (hit !== undefined) return hit;
  let m = 0;
  for (let i = 0; i < 360; i++) m = Math.max(m, islandUsable(id, (i / 360) * Math.PI * 2));
  spans.set(id, m);
  return m;
}
