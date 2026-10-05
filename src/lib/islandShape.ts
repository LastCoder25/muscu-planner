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

/** ⛵ Les îles sont EN LIGNE, d'ouest en est (décisions de l'utilisateur, 2026-10-02) : on
 *  débarque côté OUEST — au sud-ouest par défaut — au port d'arrivée, et la forteresse portuaire
 *  ennemie, d'où part la traversée vers l'île suivante, est à l'OPPOSÉ exact, côté EST (nord-est
 *  par défaut). L'angle varie d'une île à l'autre pour changer, sans jamais quitter son côté. */
const PORT_ANGLE: Record<number, number> = {
  1: (3 * Math.PI) / 4, // sud-ouest → forteresse au nord-est
  2: Math.PI - 0.25, // ouest, un peu au sud → est, un peu au nord
  3: -(3 * Math.PI) / 4, // nord-ouest → sud-est
  4: (3 * Math.PI) / 4 + 0.3, // sud-sud-ouest → nord-nord-est
  5: Math.PI + 0.35, // ouest, un peu au nord → est, un peu au sud
};
const port = (id: number) => PORT_ANGLE[id]!;
const fort = (id: number) => PORT_ANGLE[id]! - Math.PI;

const SHAPES: Record<number, Shape> = {
  // 🗡️ Brigands : une île ronde et bonhomme, une large baie.
  1: {
    base: 76,
    harm: [
      [2, 0.06, 0.4],
      [3, 0.05, 1.9],
      [5, 0.03, 0.7],
    ],
    bay: port(1),
    bayDepth: 0.2,
    bayWidth: 0.45,
    cape: fort(1),
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
    bay: port(2),
    bayDepth: 0.18,
    bayWidth: 0.35,
    cape: fort(2),
    capeHeight: 0.1,
  },
  // 💀 Morts : un croissant — un grand golfe à l'ouest, le port au fond.
  3: {
    base: 80,
    harm: [
      [1, 0.12, 2.6],
      [4, 0.04, 0.9],
      [6, 0.025, 2.1],
    ],
    bay: port(3),
    bayDepth: 0.24,
    bayWidth: 0.7,
    cape: fort(3),
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
    bay: port(4),
    bayDepth: 0.16,
    bayWidth: 0.3,
    cape: fort(4),
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
    bay: port(5),
    bayDepth: 0.2,
    bayWidth: 0.32,
    cape: fort(5),
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

/** Le village de pêcheurs est à cette distance de la côte, au fond de la baie. */
export const PORT_INSET = 6;

const centers = new Map<number, { x: number; y: number }>();
/**
 * 🏝️ Le CENTRE de l'île `id`. ⚠️ Le point de départ (la ville, en (100, 100)) ne bouge jamais :
 * c'est l'île qui se place autour. L'île 1 est la CAPITALE — la base est en son centre. Sur les
 * îles 2 à 5 on DÉBARQUE (décision de l'utilisateur, étape 6 bis) : le point de départ est le
 * VILLAGE DE PÊCHEURS au fond de la baie, et l'île s'étend DEVANT lui.
 */
export function islandCenter(id: number): { x: number; y: number } {
  if (id <= 1) return { x: TOWN, y: TOWN };
  const hit = centers.get(id);
  if (hit) return hit;
  const bay = islandShape(id).bay;
  const r = islandRadiusAt(id, bay) - PORT_INSET;
  const c = { x: TOWN - Math.cos(bay) * r, y: TOWN - Math.sin(bay) * r };
  centers.set(id, c);
  return c;
}

/** 🧭 La marge qu'une armée garde avec la côte en marchant tout droit : son glyphe (3 unités)
 *  doit tenir sur la terre. À 1, une marche qui longeait la baie passait à 1,8 de la côte et
 *  son glyphe tombait à la mer (île 5). Les deux rayons par le centre restent au-dessus : un
 *  lieu est posé à `LAND_MARGIN` (8) de la côte, la ville à 6. */
const MARCH_MARGIN = 3;

/** 🧭 Le point de passage d'une armée qui marche de `from` à `to` sur l'île `id`. Les
 *  attaques vont TOUT DROIT (décision de l'utilisateur : « les cartes d'îles sont assez simples
 *  pour des trajets directs ») ; seulement si la ligne droite coupe la mer — une faille de
 *  l'autre côté de la baie du port — elle passe par le CENTRE de l'île. ⚠️ Une île est tracée
 *  en RAYONS depuis son centre : deux lignes droites par lui restent toujours sur la terre. */
export function islandVia(
  id: number | undefined,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } | undefined {
  if (id === undefined) return undefined;
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(d));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (!onIsland(id, x, y, MARCH_MARGIN)) return islandCenter(id);
  }
  return undefined;
}

/** Le point (x, y) est-il sur l'île, à `margin` au moins de la côte ? */
export function onIsland(id: number, x: number, y: number, margin = 0): boolean {
  const c = islandCenter(id);
  const dx = x - c.x;
  const dy = y - c.y;
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

/** Un lieu FIXE posé à la part `frac` (0..1) de la terre utile, dans la direction `t` vue du
 *  CENTRE de l'île (depuis `NEAR` du centre). Suit la côte : un lieu sur un lobe va plus loin.
 *  Sur l'île 1, le centre est la ville : rien ne change. */
export function islandPoint(id: number, t: number, frac: number): { x: number; y: number } {
  const c = islandCenter(id);
  const d = NEAR + frac * (islandUsable(id, t) - NEAR);
  return { x: c.x + Math.cos(t) * d, y: c.y + Math.sin(t) * d };
}

const spans = new Map<number, number>();
/** La plus grande distance entre le point de départ et la terre utile (la zone où l'on tire les
 *  lieux). Sur l'île 1, c'est le rayon utile ; ailleurs, jusqu'à l'autre bout de l'île. */
export function islandSpan(id: number): number {
  const hit = spans.get(id);
  if (hit !== undefined) return hit;
  const c = islandCenter(id);
  let m = 0;
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const r = islandUsable(id, t);
    m = Math.max(m, Math.hypot(c.x + Math.cos(t) * r - TOWN, c.y + Math.sin(t) * r - TOWN));
  }
  spans.set(id, m);
  return m;
}

/** ⚓ Le PORT D'ARRIVÉE de l'île `id` : au fond de sa baie, à `PORT_DOCK` de la côte. Sur les
 *  îles 2 à 5, c'est le village (le point de départ, à 3 unités près). */
export const PORT_DOCK = 3;
export function islandPort(id: number): { x: number; y: number } {
  const c = islandCenter(id);
  const bay = islandShape(id).bay;
  const r = islandRadiusAt(id, bay) - PORT_DOCK;
  return { x: c.x + Math.cos(bay) * r, y: c.y + Math.sin(bay) * r };
}

const portSpans = new Map<number, number>();
/** La plus grande distance entre le port d'arrivée et la terre utile de l'île. */
export function islandPortSpan(id: number): number {
  const hit = portSpans.get(id);
  if (hit !== undefined) return hit;
  const c = islandCenter(id);
  const p = islandPort(id);
  let m = 0;
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const r = islandUsable(id, t);
    m = Math.max(m, Math.hypot(c.x + Math.cos(t) * r - p.x, c.y + Math.sin(t) * r - p.y));
  }
  portSpans.set(id, m);
  return m;
}

/** 🗺️ La fenêtre dessinée d'une île : un carré de demi-côté `half` autour de son centre. */
export function islandView(id: number, half: number): { x: number; y: number; size: number } {
  const c = islandCenter(id);
  return { x: c.x - half, y: c.y - half, size: 2 * half };
}

/** 🏰 La forteresse de l'île `id` : sur le cap, à `FORTRESS_INSET` de la côte. ⚠️ MÊME règle
 *  que `islandTerrain` (qui la dessine) : le placement des lieux la lit ici sans importer le
 *  décor. */
export const FORTRESS_INSET = 9;
export function islandFortressAt(id: number): { x: number; y: number } {
  const c = islandCenter(id);
  const t = islandShape(id).cape;
  const r = islandRadiusAt(id, t) - FORTRESS_INSET;
  return { x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r };
}

/** 🛡️ La LIGNE DE DÉFENSE (2026-10-04 : « une ligne qui sépare la partie de l'île où le joueur
 *  accoste et la partie avec la forteresse » ; 2026-10-05 : « chaque lieu fixe à égale distance
 *  du village portuaire et de la forteresse, donc en diagonale ») : la MÉDIATRICE du segment
 *  départ → forteresse. Elle passe par son milieu (`DEFENSE_LINE_T`)… */
export const DEFENSE_LINE_T = 0.5;
/** …et s'étale sur cette part de la terre le long de la médiatrice. */
export const DEFENSE_LINE_SPREAD = 0.75;
/** 〰️ Décalage le long de l'axe départ → forteresse (« pas totalement droit ») : alterné, en
 *  unités de carte. Petit devant la longueur de l'axe : l'écart des distances reste ≤ 2× cela. */
export const DEFENSE_LINE_WOBBLE = 3;
/** 📐 Réglages PAR ÎLE de la ligne (2026-10-05, île 2 : « les archives un peu plus haut et à
 *  droite, le scriptorium un peu plus bas et à gauche, les trois alignés, la droite passant
 *  entre la forteresse et le village ») : `tilt` fait pivoter la ligne autour de son milieu
 *  (radians, sens horaire à l'écran si négatif), `wobble` remplace le décalage alterné,
 *  `spread` la part de terre couverte. ⚠️ Pivotée, la ligne passe TOUJOURS entre le village
 *  et la forteresse (le lieu du milieu reste à égale distance), mais ses extrémités ne le sont
 *  plus. Sur l'île 2 la forteresse est presque à la hauteur du village : sans pivot, la ligne
 *  restait quasi verticale. */
export const DEFENSE_LINE_SHAPE: Record<number, { tilt: number; wobble: number; spread: number }> =
  {
    2: { tilt: -0.42, wobble: 0, spread: 0.6 },
  };

/** Les `n` places de la ligne de défense de l'île `id` : sur la médiatrice du départ (la
 *  ville) et de la forteresse — donc à peu près à égale distance des deux —, régulièrement
 *  espacées d'une côte à l'autre, et légèrement décalées une sur deux pour ne pas tracer une
 *  règle. */
export function islandDefenseLine(id: number, n: number): { x: number; y: number }[] {
  if (n <= 0) return [];
  const f = islandFortressAt(id);
  const ax = f.x - TOWN;
  const ay = f.y - TOWN;
  const len = Math.hypot(ax, ay) || 1;
  // u : le long de l'axe ; v : la médiatrice (perpendiculaire).
  const ux = ax / len;
  const uy = ay / len;
  const shape = DEFENSE_LINE_SHAPE[id];
  const tilt = shape?.tilt ?? 0;
  const vx = -uy * Math.cos(tilt) - ux * Math.sin(tilt);
  const vy = -uy * Math.sin(tilt) + ux * Math.cos(tilt);
  const mx = TOWN + ax * DEFENSE_LINE_T;
  const my = TOWN + ay * DEFENSE_LINE_T;
  // Jusqu'où la terre s'étend de part et d'autre du milieu, le long de la médiatrice.
  const reach = (sign: number) => {
    let d = 0;
    while (d < 200 && onIsland(id, mx + sign * vx * (d + 1), my + sign * vy * (d + 1), LAND_MARGIN))
      d += 1;
    return d;
  };
  const lo = -reach(-1);
  const hi = reach(1);
  const mid = (lo + hi) / 2;
  const half = ((hi - lo) / 2) * (shape?.spread ?? DEFENSE_LINE_SPREAD);
  const wobble = shape?.wobble ?? DEFENSE_LINE_WOBBLE;
  const at = (t: number, w: number) => ({
    x: mx + vx * t + ux * w,
    y: my + vy * t + uy * w,
  });
  if (n === 1) return [at(mid, 0)];
  return Array.from({ length: n }, (_, i) => {
    const t = mid - half + (2 * half * i) / (n - 1);
    // Une place sur deux vers le départ, l'autre vers la forteresse ; le sens dépend de l'île.
    const w = (i % 2 === 0 ? 1 : -1) * (id % 2 === 0 ? 1 : -1) * wobble;
    return at(t, w);
  });
}

/** 🎯 Pas angulaire des places candidates d'`islandScatter`. */
const SCATTER_STEP = Math.PI / 72;
const scatterCache = new Map<string, { x: number; y: number }[]>();
/**
 * 🎯 `n` places DISPERSÉES sur l'île (demandé : « les objectifs répartis sur l'île pour
 * attaquer de partout ») : à la part `frac` de la terre utile, chacune la plus éloignée possible
 * de tout ce qui est déjà posé (`taken` : la ville, la forteresse, la ligne de défense) et des
 * précédentes — un tirage glouton du plus grand écart. Déterministe, en cache.
 */
export function islandScatter(
  id: number,
  n: number,
  frac: number,
  taken: readonly { x: number; y: number }[],
): { x: number; y: number }[] {
  const key = `${id}:${n}:${frac}:${taken.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(';')}`;
  const hit = scatterCache.get(key);
  if (hit) return hit;
  const cands: { x: number; y: number }[] = [];
  for (let t = 0; t < Math.PI * 2; t += SCATTER_STEP) cands.push(islandPoint(id, t, frac));
  const placed: { x: number; y: number }[] = [];
  const others = [...taken];
  for (let i = 0; i < n; i++) {
    let best = cands[0]!;
    let bestGap = -1;
    for (const c of cands) {
      const g = Math.min(...others.map((p) => Math.hypot(c.x - p.x, c.y - p.y)));
      if (g > bestGap) {
        bestGap = g;
        best = c;
      }
    }
    placed.push(best);
    others.push(best);
  }
  scatterCache.set(key, placed);
  return placed;
}
