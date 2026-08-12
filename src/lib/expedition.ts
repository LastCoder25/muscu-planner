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
  town: { x: 50, y: 50 }, // ville de départ (CENTRE de la carte)
  poiCap: 6,
  minDistPoi: 17, // écart mini entre POI (placement espacé)
  distMin: 16, // distance mini ville↔POI (coord ; la ville est au centre)
  distMax: 40, // distance maxi (rayon → POI tout autour, 360°)
  spawnMinMs: 2 * 3600_000, // intervalle de spawn : 2 h..4 h (jitter)
  spawnJitterMs: 2 * 3600_000,
  lifespanMs: { mine: 24 * 3600_000, camp: 12 * 3600_000, lair: 30 * 3600_000 },
  travelOneWayMinMin: 8, // trajet aller (min) : 8 min (proche) → 150 min (loin) × niveau
  travelOneWayMaxMin: 150,
  goldCostBase: { mine: 40, camp: 120, lair: 500 },
  failRefund: 0.35, // échec : fraction de l'or remboursée (< coût → jamais un profit)
} as const;

/** Fenêtre de niveaux de spawn autour du joueur : [niveau−5, niveau+3] (min 1). */
export function spawnWindow(playerLevel: number): { min: number; max: number } {
  return { min: Math.max(1, playerLevel - 5), max: Math.max(1, playerLevel + 3) };
}

/** Coût en OR pour envoyer une expédition (∝ type × niveau). */
export function goldCost(type: PoiType, level: number): number {
  return Math.round(EXPE.goldCostBase[type] * (1 + Math.max(0, level) * 0.12));
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
  const { town, distMin, distMax } = EXPE;
  for (let tries = 0; tries < 40; tries++) {
    const ang = rng() * Math.PI * 2; // angle libre → POI dans tous les sens
    const dd = distMin + rng() * (distMax - distMin);
    const x = Math.round(town.x + Math.cos(ang) * dd);
    const y = Math.round(town.y + Math.sin(ang) * dd);
    if (x < 8 || x > 92 || y < 8 || y > 92) continue; // reste dans la carte
    return { x, y, distNorm: clamp01((dd - distMin) / (distMax - distMin)) };
  }
  // Repli : à l'est de la ville.
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

// ── Fond de carte : TERRAIN procédural déterministe (biomes + décor) ──
export type BiomeType = 'forest' | 'desert' | 'mountains' | 'water' | 'plains' | 'swamp';
export interface Biome {
  type: BiomeType;
  path: string; // blob SVG (coord 0..100)
}
export interface TerrainGlyph {
  emoji: string;
  x: number;
  y: number;
}
export interface Terrain {
  biomes: Biome[];
  glyphs: TerrainGlyph[];
}

const BIOME_GLYPHS: Record<BiomeType, string[]> = {
  forest: ['🌲', '🌳'],
  desert: ['🌵', '🏜️'],
  mountains: ['⛰️', '🏔️', '🪨'],
  water: ['🌊'],
  plains: ['🌾'],
  swamp: ['🌿', '🍄'],
};
const BIOME_POOL: BiomeType[] = ['forest', 'mountains', 'desert', 'water', 'plains', 'swamp', 'forest', 'mountains'];

// Blob organique fermé (lissé) autour de (cx,cy).
function blobPath(rng: () => number, cx: number, cy: number, r: number, n = 9): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.7 + rng() * 0.55);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const mid = (i: number): [number, number] => {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  let d = `M ${mid(n - 1)[0].toFixed(1)} ${mid(n - 1)[1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(i);
    d += ` Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return d + ' Z';
}

/** Terrain de la carte (déterministe pour un `seed`) : biomes + décor. */
export function expeditionTerrain(seed: number): Terrain {
  const rng = mulberry32((seed >>> 0) || 1);
  const biomes: Biome[] = [];
  const glyphs: TerrainGlyph[] = [];
  // ~6 biomes sur une grille 3×2 jitterée couvrant toute la carte.
  const cols = 3;
  const rows = 2;
  for (let gy = 0; gy < rows; gy++)
    for (let gx = 0; gx < cols; gx++) {
      const cx = ((gx + 0.5) / cols) * 100 + (rng() - 0.5) * 18;
      const cy = ((gy + 0.5) / rows) * 100 + (rng() - 0.5) * 18;
      const type = BIOME_POOL[Math.floor(rng() * BIOME_POOL.length)]!;
      const r = 20 + rng() * 12;
      biomes.push({ type, path: blobPath(rng, cx, cy, r) });
      // Quelques glyphes de décor dans le biome.
      const gl = BIOME_GLYPHS[type];
      const nG = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < nG; k++) {
        const a = rng() * Math.PI * 2;
        const rr = rng() * r * 0.55;
        glyphs.push({
          emoji: gl[Math.floor(rng() * gl.length)]!,
          x: Math.round(cx + Math.cos(a) * rr),
          y: Math.round(cy + Math.sin(a) * rr),
        });
      }
    }
  return { biomes, glyphs };
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
