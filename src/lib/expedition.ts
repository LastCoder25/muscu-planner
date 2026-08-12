// expedition.ts — mode IDLE « Expédition » (pur/testable). Tu envoies ton héros
// explorer un POI d'une carte ; ça prend du TEMPS RÉEL (aller → objectif → retour) ;
// tu reviens chercher le rapport puis le butin. 100 % déterministe (seed + timestamps
// → carte/issue reproductibles, hors-ligne, aucun cron). Distinct du Labyrinthe
// (mode grille actif). Cf. mémoire expedition-idle-design.
//
// NB Date.now() n'est PAS utilisé ici : le `now` (ms epoch) est TOUJOURS passé par
// l'appelant → fonctions pures, testables.
import { mulberry32, simulateCombat, type Combatant } from './combat';
import { rollDrop, rollSetPiece, ITEM_SETS, type Item } from './items';

// ── Types ──
export type PoiType = 'mine' | 'camp' | 'lair';

export interface Poi {
  id: string;
  type: PoiType;
  setId?: string; // 'lair' uniquement : set ciblé
  level: number;
  x: number; // coord carte (0..100)
  y: number;
  distNorm: number; // distance normalisée ville↔POI (0..1) → temps de trajet
  spawnedAt: number; // ms epoch
  expiresAt: number; // ms epoch (le POI disparaît si non fait)
}

export interface ExpeditionMap {
  seed: number;
  spawnCount: number; // compteur de spawns → rng déterministe par spawn
  pois: Poi[];
  nextSpawnAt: number; // ms epoch du prochain spawn possible
}

export interface ExpeditionOutcome {
  win: boolean;
  gold: number; // crédité au RETOUR
  dust: number;
  item: Omit<Item, 'id'> | null; // la « prise » (pièce de set / objet) ou null
  key: number; // clé de Labyrinthe (consolation rare)
  reconBonus: number; // +fraction de réussite au prochain essai (échec)
  text: string; // texte du rapport
}

export interface ActiveExpedition {
  poi: Poi;
  sentAt: number;
  midAt: number; // arrivée à l'objectif (résolution + rapport)
  returnAt: number; // retour en ville (butin crédité)
  goldCost: number;
  seed: number;
  outcome: ExpeditionOutcome; // calculé au DÉPART, révélé/crédité aux timestamps
  reported?: boolean; // le rapport a-t-il déjà été déposé dans la boîte (à midAt) ?
}

// Rapport déposé dans la boîte à messages 📬 à l'arrivée à l'objectif.
export interface ExpeditionMessage {
  id: string;
  poiType: PoiType;
  setId?: string;
  level: number;
  win: boolean;
  text: string;
  gold: number;
  dust: number;
  itemName?: string;
  key: number;
  resolvedAt: number; // ms epoch (midAt)
  read: boolean;
}

/** Construit le message de rapport d'une expédition (déposé à l'arrivée à l'objectif). */
export function buildMessage(exp: ActiveExpedition): ExpeditionMessage {
  const o = exp.outcome;
  return {
    id: `msg_${exp.poi.id}_${exp.sentAt}`,
    poiType: exp.poi.type,
    ...(exp.poi.setId ? { setId: exp.poi.setId } : {}),
    level: exp.poi.level,
    win: o.win,
    text: o.text,
    gold: o.gold,
    dust: o.dust,
    ...(o.item ? { itemName: o.item.name } : {}),
    key: o.key,
    resolvedAt: exp.midAt,
    read: false,
  };
}

// ── Constantes (tunables ; éco chiffrée affinée par simulation en phase 6) ──
export const EXPE = {
  mapSize: 140, // côté de la carte (coord 0..mapSize) — grande, on pan/zoom dessus
  town: { x: 70, y: 70 }, // ville de départ (CENTRE de la carte)
  poiCap: 6,
  minDistPoi: 24, // écart mini entre POI (placement espacé)
  distMin: 24, // distance mini ville↔POI (coord ; la ville est au centre)
  distMax: 58, // distance maxi (rayon → POI tout autour, 360°)
  spawnMinMs: 2 * 3600_000, // intervalle de spawn : 2 h..4 h (jitter)
  spawnJitterMs: 2 * 3600_000,
  lifespanMs: { mine: 24 * 3600_000, camp: 12 * 3600_000, lair: 30 * 3600_000 },
  travelOneWayMinMin: 8, // trajet aller (min) : 8 min (proche) → 150 min (loin) × niveau
  travelOneWayMaxMin: 150,
  // Coût = base × niveau^1.6 → VRAI puits d'or (2026‑08‑12). Repère : un donjon
  // rapporte ~1600 or à reco10, ~4920 à reco20 ; un repaire coûte ~6k (niv10) → ~20k
  // (niv20) = plusieurs runs de donjon pour une pièce de set (l'or s'écoule).
  goldCostBase: { mine: 22, camp: 65, lair: 155 },
  goldCostExp: 1.6,
  failRefund: 0.3, // échec : fraction de l'or remboursée (< coût → jamais un profit)
} as const;

/** Fenêtre de niveaux de spawn autour du joueur : [niveau−5, niveau+3] (min 1). */
export function spawnWindow(playerLevel: number): { min: number; max: number } {
  return { min: Math.max(1, playerLevel - 5), max: Math.max(1, playerLevel + 3) };
}

/** Coût en OR pour envoyer une expédition = base × niveau^1.6 (vrai puits d'or). */
export function goldCost(type: PoiType, level: number): number {
  return Math.round(EXPE.goldCostBase[type] * Math.pow(Math.max(1, level), EXPE.goldCostExp));
}

/** Trajet ALLER (minutes) selon distance + niveau. Round-trip = 2×. */
export function travelOneWayMin(level: number, distNorm: number): number {
  const base =
    EXPE.travelOneWayMinMin + (EXPE.travelOneWayMaxMin - EXPE.travelOneWayMinMin) * clamp01(distNorm);
  return Math.round(base * (1 + Math.max(0, level) * 0.02));
}

/** Adversaire d'un POI (Combatant) pour la résolution auto — scalé au niveau.
 *  Calibrage provisoire (affiné par simulation en phase 6). */
export function poiCombatant(level: number, type: PoiType): Combatant {
  const t = type === 'lair' ? 1.35 : 1; // le repaire est plus coriace
  const L = Math.max(1, level);
  // Échelle niveau² : la puissance du joueur croît ~niveau² (stats = XP/15, XP
  // quadratique). Un adversaire LINÉAIRE devenait trivial dès le niveau 10 → on
  // scale en L² (calibré sur le gradient sain du niveau 5, cf. simulation 2026‑08‑12).
  const name = type === 'lair' ? 'Gardien du repaire' : type === 'camp' ? 'Chef de camp' : 'Éboulement';
  return {
    name,
    // PV ~L³ (le multi-frappe fait croître l'offense du joueur ~L⁴ → un L² devenait
    // trivial en fin de jeu). Dégâts ~L² (check de survie constant relatif aux PV joueur).
    pv: Math.round((2.9 * L * L * L + 40) * t),
    damage: Math.round((5.5 * L * L + 12) * t),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
    strikes: 1,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// Placement espacé (reject-sampling) d'un POI TOUT AUTOUR de la ville (360°).
function placePoi(rng: () => number): { x: number; y: number; distNorm: number } {
  const { town, distMin, distMax, mapSize } = EXPE;
  const pad = 10;
  for (let tries = 0; tries < 40; tries++) {
    const ang = rng() * Math.PI * 2; // angle libre → POI dans tous les sens
    const dd = distMin + rng() * (distMax - distMin);
    const x = Math.round(town.x + Math.cos(ang) * dd);
    const y = Math.round(town.y + Math.sin(ang) * dd);
    if (x < pad || x > mapSize - pad || y < pad || y > mapSize - pad) continue;
    return { x, y, distNorm: clamp01((dd - distMin) / (distMax - distMin)) };
  }
  return { x: town.x + distMin, y: town.y, distNorm: 0 };
}

/** Crée une carte neuve avec `seedPois` POI d'entrée (à la 1re visite). */
export function createMap(seed: number, now: number, playerLevel: number, seedPois = 3): ExpeditionMap {
  const map: ExpeditionMap = { seed: seed >>> 0 || 1, spawnCount: 0, pois: [], nextSpawnAt: now };
  for (let i = 0; i < seedPois; i++) spawnOne(map, now, playerLevel);
  map.nextSpawnAt = now + EXPE.spawnMinMs;
  return map;
}

// Fait apparaître 1 POI (déterministe via seed + spawnCount), placé espacé.
function spawnOne(map: ExpeditionMap, now: number, playerLevel: number): void {
  const rng = mulberry32((map.seed + map.spawnCount * 2654435761) >>> 0);
  map.spawnCount++;
  const type = pick(rng, ['mine', 'mine', 'camp', 'camp', 'camp', 'lair'] as const); // pondéré
  const win = spawnWindow(playerLevel);
  const level = win.min + Math.floor(rng() * (win.max - win.min + 1));
  let pos = placePoi(rng);
  // Espacement : re-tire si trop proche d'un POI existant (quelques essais).
  for (let k = 0; k < 6; k++) {
    const tooClose = map.pois.some((p) => dist(p.x, p.y, pos.x, pos.y) < EXPE.minDistPoi);
    if (!tooClose) break;
    pos = placePoi(rng);
  }
  const poi: Poi = {
    id: `poi_${map.seed}_${map.spawnCount}`,
    type,
    ...(type === 'lair' && ITEM_SETS.length
      ? { setId: pick(rng, ITEM_SETS).id }
      : {}),
    level,
    x: pos.x,
    y: pos.y,
    distNorm: pos.distNorm,
    spawnedAt: now,
    expiresAt: now + EXPE.lifespanMs[type],
  };
  map.pois.push(poi);
}

/** Fait avancer le monde jusqu'à `now` : expire les POI périmés (sauf la cible d'une
 *  expédition en cours) et fait apparaître au plus 1 POI si l'heure est venue. Pur. */
export function advanceWorld(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
  protectedPoiId?: string,
): ExpeditionMap {
  const next: ExpeditionMap = {
    seed: map.seed,
    spawnCount: map.spawnCount,
    nextSpawnAt: map.nextSpawnAt,
    pois: map.pois.filter((p) => p.id === protectedPoiId || p.expiresAt > now),
  };
  if (now >= next.nextSpawnAt) {
    if (next.pois.length < EXPE.poiCap) spawnOne(next, now, playerLevel);
    const rng = mulberry32((next.seed + next.spawnCount * 40503) >>> 0);
    next.nextSpawnAt = now + EXPE.spawnMinMs + Math.floor(rng() * EXPE.spawnJitterMs);
  }
  return next;
}

/** Position interpolée du héros + compteurs, selon la phase (aller/retour). */
export function heroPosition(
  exp: ActiveExpedition,
  now: number,
): {
  x: number;
  y: number;
  phase: 'outbound' | 'return' | 'done';
  frac: number; // avancement de la phase courante (0..1)
  remainToObjectiveMs: number;
  remainTotalMs: number;
} {
  const { town } = EXPE;
  const p = exp.poi;
  const remainTotalMs = Math.max(0, exp.returnAt - now);
  if (now < exp.midAt) {
    const frac = clamp01((now - exp.sentAt) / Math.max(1, exp.midAt - exp.sentAt));
    return {
      x: town.x + (p.x - town.x) * frac,
      y: town.y + (p.y - town.y) * frac,
      phase: 'outbound',
      frac,
      remainToObjectiveMs: Math.max(0, exp.midAt - now),
      remainTotalMs,
    };
  }
  if (now < exp.returnAt) {
    const frac = clamp01((now - exp.midAt) / Math.max(1, exp.returnAt - exp.midAt));
    return {
      x: p.x + (town.x - p.x) * frac,
      y: p.y + (town.y - p.y) * frac,
      phase: 'return',
      frac,
      remainToObjectiveMs: 0,
      remainTotalMs,
    };
  }
  return { x: town.x, y: town.y, phase: 'done', frac: 1, remainToObjectiveMs: 0, remainTotalMs: 0 };
}

// ── Résolution (au DÉPART, seedée → révélée/créditée aux timestamps) ──
const FAIL_TEXT: Record<PoiType, string[]> = {
  lair: [
    'Le gardien était trop coriace. En battant en retraite, ton héros a détaché une clé rouillée d’un cadavre.',
    'Repli sous le feu. Dans la fuite, il a raflé une poignée de poussière et un peu d’or.',
    'Vaincu mais vivant : il ressort couvert de blessures… et de notes sur les défenses du repaire.',
  ],
  camp: [
    'Le camp était mieux gardé que prévu. Retraite en bon ordre, quelques piécettes récupérées.',
    'Embuscade évitée de justesse : bredouille côté butin, mais une faille repérée dans leur garde.',
  ],
  mine: ['Le filon s’est effondré avant l’extraction complète. Ton héros remonte les mains presque vides.'],
};
const WIN_TEXT: Record<PoiType, string[]> = {
  lair: ['🏆 Repaire nettoyé ! Le trésor du set est à toi.', '🏆 Le gardien tombe — la relique est récupérée.'],
  camp: ['🏆 Camp dispersé ! Butin ramassé.', '🏆 Victoire nette au camp.'],
  mine: ['⛏️ Filon exploité — ressources chargées.', '⛏️ Extraction réussie.'],
};

/** Calcule l'issue d'une expédition (seedée). Le butin est crédité au RETOUR. */
export function resolveOutcome(
  hero: Combatant,
  poi: Poi,
  seed: number,
): ExpeditionOutcome {
  const rng = mulberry32((seed >>> 0) || 1);
  const cost = goldCost(poi.type, poi.level);
  // Mine = récolte (pas de combat) ; camp/repaire = combat auto seedé.
  const win =
    poi.type === 'mine'
      ? true
      : simulateCombat(hero, poiCombatant(poi.level, poi.type), { seed: seed + 7, goldOnWin: 0 }).win;

  if (!win) {
    const key = rng() < 0.12 ? 1 : 0;
    return {
      win: false,
      gold: Math.round(cost * EXPE.failRefund), // < coût → jamais un profit
      dust: Math.round(poi.level * 1.5),
      item: null,
      key,
      reconBonus: 0.08,
      text: pick(rng, FAIL_TEXT[poi.type]),
    };
  }

  // Réussite : HAUL (or + poussière, coloré par type) + PRISE éventuelle.
  const goldHaul =
    poi.type === 'mine'
      ? Math.round(cost * 1.4 + poi.level * 8) // mine = léger gain net d'or
      : Math.round(poi.level * 6);
  const dustHaul = Math.round((poi.type === 'mine' ? 8 : 4) + poi.level * 2);
  let item: Omit<Item, 'id'> | null = null;
  if (poi.type === 'lair' && poi.setId) {
    item = rollSetPiece(rng, { setId: poi.setId, level: poi.level, luck: 0.6 });
  } else if (poi.type === 'camp') {
    item = rollDrop(rng, { cleared: true, defeated: 1, level: poi.level, luck: 0.4, spread: 1 });
  }
  return {
    win: true,
    gold: goldHaul,
    dust: dustHaul,
    item,
    key: 0,
    reconBonus: 0,
    text: pick(rng, WIN_TEXT[poi.type]),
  };
}

// ── Fond de carte : PARCHEMIN dessiné à l'encre (style « livre d'aventure ») ──
export type MotifKind = 'mountain' | 'tree' | 'dune';
export interface Motif {
  kind: MotifKind;
  d: string; // path prêt à rendre (encre)
  x: number; // pour l'ordre de rendu (peintre : du fond vers l'avant)
  y: number;
}
export interface Terrain {
  coast: string; // contour de la CÔTE (continent) — path fermé
  features: Motif[]; // reliefs dessinés (chaînes de montagnes, forêts, dunes)
  rivers: string[]; // rivières serpentant depuis les reliefs
}

const f1 = (v: number) => v.toFixed(1);

// Blob organique fermé (lissé) autour de (cx,cy).
function blobPath(rng: () => number, cx: number, cy: number, r: number, n: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.74 + rng() * 0.46);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const mid = (i: number): [number, number] => {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  let d = `M ${f1(mid(n - 1)[0])} ${f1(mid(n - 1)[1])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(i);
    d += ` Q ${f1(p[0])} ${f1(p[1])} ${f1(m[0])} ${f1(m[1])}`;
  }
  return d + ' Z';
}

// Un pic de montagne dessiné à l'encre (contour + versant hachuré).
function peakPath(x: number, y: number, s: number): string {
  const bx = x - 3.4 * s;
  const cx = x + 3.4 * s;
  const py = y - 3.6 * s;
  return `M ${f1(bx)} ${f1(y + 1.6 * s)} L ${f1(x)} ${f1(py)} L ${f1(cx)} ${f1(y + 1.6 * s)} M ${f1(x)} ${f1(py)} L ${f1(x - 1.1 * s)} ${f1(y - 0.3 * s)}`;
}
// Un conifère (encre).
function treePath(x: number, y: number, s: number): string {
  return `M ${f1(x)} ${f1(y - 3 * s)} L ${f1(x - 1.7 * s)} ${f1(y + 1 * s)} L ${f1(x + 1.7 * s)} ${f1(y + 1 * s)} Z M ${f1(x)} ${f1(y + 1 * s)} L ${f1(x)} ${f1(y + 2.2 * s)}`;
}
// Une dune (arc d'encre).
function dunePath(x: number, y: number, s: number): string {
  return `M ${f1(x - 4 * s)} ${f1(y)} Q ${f1(x)} ${f1(y - 2.2 * s)} ${f1(x + 4 * s)} ${f1(y)}`;
}
// Une rivière serpentant depuis (x,y) vers l'extérieur (path lissé).
function riverPath(rng: () => number, x: number, y: number, dir: number, len: number): string {
  let px = x;
  let py = y;
  let d = `M ${f1(px)} ${f1(py)}`;
  const steps = 5 + Math.floor(len / 10);
  let a = dir;
  for (let i = 0; i < steps; i++) {
    a += (rng() - 0.5) * 1.1; // serpente
    const seg = len / steps;
    const mx = px + Math.cos(a) * seg * 0.5;
    const my = py + Math.sin(a) * seg * 0.5;
    px += Math.cos(a) * seg;
    py += Math.sin(a) * seg;
    d += ` Q ${f1(mx)} ${f1(my)} ${f1(px)} ${f1(py)}`;
  }
  return d;
}

/** Terrain de la carte (déterministe pour un `seed`) : côte + reliefs + rivières (encre). */
export function expeditionTerrain(seed: number): Terrain {
  const rng = mulberry32((seed >>> 0) || 1);
  const C = EXPE.mapSize / 2; // centre de la carte
  // Continent : grand contour irrégulier, très découpé (détaillé).
  const coast = blobPath(rng, C, C, EXPE.mapSize * 0.44, 20);
  const features: Motif[] = [];
  const rivers: string[] = [];
  const push = (kind: MotifKind, x: number, y: number, s: number) => {
    const d = kind === 'mountain' ? peakPath(x, y, s) : kind === 'tree' ? treePath(x, y, s) : dunePath(x, y, s);
    features.push({ kind, d, x, y });
  };
  // 5-7 amas de relief (chaîne / forêt / désert) répartis dans le continent.
  const clusters = 5 + Math.floor(rng() * 3);
  const centers: [number, number][] = [];
  for (let c = 0; c < clusters; c++) {
    let cx = C;
    let cy = C;
    for (let tries = 0; tries < 24; tries++) {
      const a = rng() * Math.PI * 2;
      const rr = 14 + rng() * 40;
      cx = C + Math.cos(a) * rr;
      cy = C + Math.sin(a) * rr;
      if (centers.every(([px, py]) => Math.hypot(px - cx, py - cy) > 22)) break;
    }
    centers.push([cx, cy]);
    const kind: MotifKind = (['mountain', 'tree', 'dune', 'mountain', 'tree'] as const)[Math.floor(rng() * 5)]!;
    if (kind === 'mountain') {
      const dir = rng() * Math.PI;
      const n = 5 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) {
        const t = (i - (n - 1) / 2) * (3.4 + rng());
        push('mountain', cx + Math.cos(dir) * t + (rng() - 0.5) * 2.5, cy + Math.sin(dir) * t + (rng() - 0.5) * 2.5, 0.9 + rng() * 0.8);
      }
      // Une rivière descend souvent de la montagne.
      if (rng() < 0.7) rivers.push(riverPath(rng, cx, cy, rng() * Math.PI * 2, 30 + rng() * 30));
    } else if (kind === 'tree') {
      const n = 12 + Math.floor(rng() * 9);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const rr = rng() * 12;
        push('tree', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.8 + rng() * 0.6);
      }
    } else {
      const n = 4 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) push('dune', cx + (rng() - 0.5) * 16, cy + (rng() - 0.5) * 12, 0.9 + rng() * 0.7);
    }
  }
  // Ordre peintre : du fond (haut) vers l'avant (bas).
  features.sort((a, b) => a.y - b.y);
  return { coast, features, rivers };
}

/** Construit une expédition (au moment de l'envoi). `now` = ms epoch. */
export function startExpedition(
  hero: Combatant,
  poi: Poi,
  now: number,
  seed: number,
): ActiveExpedition {
  const oneWayMs = travelOneWayMin(poi.level, poi.distNorm) * 60_000;
  return {
    poi,
    sentAt: now,
    midAt: now + oneWayMs,
    returnAt: now + oneWayMs * 2,
    goldCost: goldCost(poi.type, poi.level),
    seed: seed >>> 0 || 1,
    outcome: resolveOutcome(hero, poi, seed),
  };
}
