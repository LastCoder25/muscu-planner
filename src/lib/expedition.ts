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
// 'arena' = survie par VAGUES : le héros tient le plus longtemps possible contre des
// vagues de plus en plus fortes (PV reportés) → récompense ∝ vagues tenues.
export type PoiType = 'mine' | 'camp' | 'lair' | 'arena';

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
  energy: number; // ⚡ énergie de jeu (mines uniquement) → crédite login_energy
  stones: number; // pierres magiques 💎 (ressource rare des familiers)
  item: Omit<Item, 'id'> | null; // la « prise » principale (pièce de set / objet) ou null
  items?: Omit<Item, 'id'>[]; // ARÈNE : plusieurs objets (1 par palier de vagues) ; `item` = le 1er
  key: number; // clé de Labyrinthe (consolation rare)
  reconBonus: number; // +fraction de réussite au prochain essai (échec)
  waves?: number; // 'arena' uniquement : nombre de vagues tenues
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
  energy: number; // ⚡ énergie gagnée (mines)
  stones: number;
  itemName?: string; // legacy : nom seul (anciens messages) — repli d'affichage
  item?: Omit<Item, 'id'>; // objet gagné COMPLET (rareté/effet/niveau) → détail dans la boîte
  itemCount?: number; // ARÈNE : nombre total d'objets ramenés (> 1) — le reste va au sac
  key: number;
  waves?: number; // 'arena' : vagues tenues
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
    energy: o.energy,
    stones: o.stones,
    ...(o.item ? { itemName: o.item.name, item: o.item } : {}),
    ...(o.items && o.items.length > 1 ? { itemCount: o.items.length } : {}),
    key: o.key,
    ...(o.waves !== undefined ? { waves: o.waves } : {}),
    resolvedAt: exp.midAt,
    read: false,
  };
}

// ── Constantes (tunables ; éco chiffrée affinée par simulation en phase 6) ──
export const EXPE = {
  mapSize: 200, // côté de la carte (coord 0..mapSize) — GRANDE, on pan/zoom dessus
  town: { x: 100, y: 100 }, // ville de départ (CENTRE de la carte)
  poiCap: 12,
  poiFloor: 10, // PLANCHER : ~une dizaine d'activités en permanence (jamais vide)
  minDistPoi: 20, // écart mini entre POI (placement espacé)
  distMin: 30, // distance mini ville↔POI (coord ; la ville est au centre)
  distMax: 88, // distance maxi (rayon → POI tout autour, 360°)
  spawnMinMs: 2 * 3600_000, // intervalle de spawn : 2 h..4 h (jitter)
  spawnJitterMs: 2 * 3600_000,
  lifespanMs: {
    mine: 24 * 3600_000,
    camp: 12 * 3600_000,
    lair: 30 * 3600_000,
    arena: 48 * 3600_000,
  },
  travelOneWayMinMin: 8, // trajet aller (min) : 8 min (proche) → 150 min (loin) × niveau
  travelOneWayMaxMin: 150,
  // Coût = base × niveau^1.6 → VRAI puits d'or (2026‑08‑12). Repère : un donjon
  // rapporte ~1600 or à reco10, ~4920 à reco20 ; un repaire coûte ~6k (niv10) → ~20k
  // (niv20) = plusieurs runs de donjon pour une pièce de set (l'or s'écoule).
  // ARÈNE (ticket 2d616665) : événement RARE fait pour la nuit → coût d'or ÉLEVÉ
  // (le plus cher), placée LOIN (trajet long) et récompense grasse (∝ vagues).
  goldCostBase: { mine: 22, camp: 65, lair: 155, arena: 240 },
  goldCostExp: 1.6,
  failRefund: 0.4, // échec : fraction de l'or remboursée (< coût → jamais un profit ; adouci 0,3→0,4 pour un pari raté moins punitif, ticket 86331df3)
} as const;

// Arène : survie par vagues, SANS fin fixe. La difficulté croît de façon
// EXPONENTIELLE (×/vague) → les dégâts de l'assaillant finissent TOUJOURS par
// dépasser les PV+soin du héros, quel que soit son build (le multi-frappe et le vol
// de vie, bornés par des stats fixes, ne peuvent pas suivre une croissance
// géométrique) → la run se termine forcément par la mort. `maxWaves` n'est plus qu'un
// GARDE-FOU anti-boucle (jamais atteint en pratique). Ramp calibré par simulation
// (2026‑08‑15) : un build de référence tient ~5-9 vagues nu, ~15-30 bien équipé.
export const ARENA = {
  maxWaves: 500, // garde-fou anti-boucle infinie (la mort arrive bien avant)
  healPct: 0.16, // régén entre deux vagues (l'Endurance compte)
  pvBase: 0.42, // vague 0 = 42 % d'un camp de même niveau (démarrage doux)
  pvGrow: 1.15, // ×1,15 de PV par vague (croissance géométrique)
  dmgBase: 0.5,
  dmgGrow: 1.14, // ×1,14 de dégâts par vague → attrition qui accélère → fin garantie
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
    EXPE.travelOneWayMinMin +
    (EXPE.travelOneWayMaxMin - EXPE.travelOneWayMinMin) * clamp01(distNorm);
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
  const name =
    type === 'lair' ? 'Gardien du repaire' : type === 'camp' ? 'Chef de camp' : 'Éboulement';
  return {
    name,
    // PV ~L³ (le multi-frappe fait croître l'offense du joueur ~L⁴ → un L² devenait
    // trivial en fin de jeu). Dégâts ~L² (check de survie constant relatif aux PV joueur).
    // RECALIBRÉ (2026‑08‑15, ticket 86331df3) : coefs 2,9/5,5 → 2,0/3,9 — un héros
    // de niveau approprié gagnait ~28-53 % des camps et ~2-26 % des repaires (net
    // négatif, pas rentable). Désormais camp ~90 % (option fiable), repaire ~45-88 %
    // (le pari, meilleur si sur-niveau) ; le winPct affiché prévient avant l'envoi.
    pv: Math.round((2.0 * L * L * L + 40) * t),
    damage: Math.round((3.9 * L * L + 12) * t),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
    strikes: 1,
  };
}

/** Adversaire de la vague `wave` d'une arène de niveau `level` — dérivé d'un camp,
 *  démarrage doux puis rampe de PV/dégâts par vague (attrition croissante). */
export function arenaWaveCombatant(level: number, wave: number): Combatant {
  const base = poiCombatant(level, 'camp');
  return {
    ...base,
    name: `Assaillant · vague ${wave + 1}`,
    pv: Math.max(1, Math.round(base.pv * ARENA.pvBase * Math.pow(ARENA.pvGrow, wave))),
    damage: Math.max(1, Math.round(base.damage * ARENA.dmgBase * Math.pow(ARENA.dmgGrow, wave))),
  };
}

/** Simule une arène : vagues consécutives (difficulté exponentielle), PV reportés
 *  (+ petite régén), jusqu'à la MORT (le cap n'est qu'un garde-fou anti-boucle).
 *  Renvoie le nombre de vagues TENUES (vaincues). Seedé/pur. */
export function simulateArena(hero: Combatant, level: number, seed: number): number {
  let pv = hero.pv;
  let waves = 0;
  for (let w = 0; w < ARENA.maxWaves; w++) {
    const r = simulateCombat(hero, arenaWaveCombatant(level, w), {
      seed: seed + w * 1009,
      goldOnWin: 0,
      startPlayerPv: pv,
    });
    pv = r.log.length ? r.log[r.log.length - 1]!.playerPv : pv;
    if (!r.win) break;
    waves++;
    pv = Math.min(hero.pv, pv + Math.round(hero.pv * ARENA.healPct));
  }
  return waves;
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
// `minFrac` (0..1) force une distance MINIMALE (l'arène spawn loin → trajet de nuit).
function placePoi(rng: () => number, minFrac = 0): { x: number; y: number; distNorm: number } {
  const { town, distMin, distMax, mapSize } = EXPE;
  const pad = 10;
  const lo = distMin + clamp01(minFrac) * (distMax - distMin);
  for (let tries = 0; tries < 40; tries++) {
    const ang = rng() * Math.PI * 2; // angle libre → POI dans tous les sens
    const dd = lo + rng() * (distMax - lo);
    const x = Math.round(town.x + Math.cos(ang) * dd);
    const y = Math.round(town.y + Math.sin(ang) * dd);
    if (x < pad || x > mapSize - pad || y < pad || y > mapSize - pad) continue;
    return { x, y, distNorm: clamp01((dd - distMin) / (distMax - distMin)) };
  }
  return { x: town.x + lo, y: town.y, distNorm: clamp01((lo - distMin) / (distMax - distMin)) };
}

/** Crée une carte neuve avec `seedPois` POI d'entrée (à la 1re visite). Par défaut,
 *  on démarre AU PLANCHER (`poiFloor`) → la carte n'est jamais quasi-vide au début. */
export function createMap(
  seed: number,
  now: number,
  playerLevel: number,
  seedPois = EXPE.poiFloor,
): ExpeditionMap {
  const map: ExpeditionMap = { seed: seed >>> 0 || 1, spawnCount: 0, pois: [], nextSpawnAt: now };
  for (let i = 0; i < seedPois; i++) spawnOne(map, now, playerLevel);
  map.nextSpawnAt = now + EXPE.spawnMinMs;
  return map;
}

// Fait apparaître 1 POI (déterministe via seed + spawnCount), placé espacé.
function spawnOne(map: ExpeditionMap, now: number, playerLevel: number): void {
  const rng = mulberry32((map.seed + map.spawnCount * 2654435761) >>> 0);
  map.spawnCount++;
  let type = pick(rng, ['mine', 'mine', 'camp', 'camp', 'camp', 'lair', 'arena'] as const); // pondéré (arène rare)
  // UNE SEULE arène à la fois sur la carte (ticket 2d616665) → sinon on rabat sur camp.
  if (type === 'arena' && map.pois.some((p) => p.type === 'arena')) type = 'camp';
  const win = spawnWindow(playerLevel);
  const level = win.min + Math.floor(rng() * (win.max - win.min + 1));
  // L'arène spawn LOIN (trajet long, fait pour la nuit) ; les autres, n'importe où.
  const minFrac = type === 'arena' ? 0.8 : 0;
  let pos = placePoi(rng, minFrac);
  // Espacement : re-tire si trop proche d'un POI existant (quelques essais).
  for (let k = 0; k < 6; k++) {
    const tooClose = map.pois.some((p) => dist(p.x, p.y, pos.x, pos.y) < EXPE.minDistPoi);
    if (!tooClose) break;
    pos = placePoi(rng, minFrac);
  }
  const poi: Poi = {
    id: `poi_${map.seed}_${map.spawnCount}`,
    type,
    ...(type === 'lair' && ITEM_SETS.length ? { setId: pick(rng, ITEM_SETS).id } : {}),
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
  // Rattrapage : après une longue absence, l'heure de spawn a pu être dépassée
  // PLUSIEURS fois → on fait apparaître autant de POI que d'intervalles écoulés
  // (jusqu'au cap), sinon la carte restait à 1 spawn/ouverture et se vidait.
  let guard = 0;
  while (now >= next.nextSpawnAt && next.pois.length < EXPE.poiCap && guard++ < EXPE.poiCap) {
    spawnOne(next, now, playerLevel);
    const rng = mulberry32((next.seed + next.spawnCount * 40503) >>> 0);
    next.nextSpawnAt = next.nextSpawnAt + EXPE.spawnMinMs + Math.floor(rng() * EXPE.spawnJitterMs);
  }
  // PLANCHER : la carte ne descend jamais sous `poiFloor` activités → on complète
  // immédiatement (les activités de base sont toujours dispo ; la rareté/churn ne
  // joue qu'entre le plancher et le cap).
  while (next.pois.length < EXPE.poiFloor) spawnOne(next, now, playerLevel);
  if (next.nextSpawnAt <= now) next.nextSpawnAt = now + EXPE.spawnMinMs;
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
  mine: [
    'Le filon s’est effondré avant l’extraction complète. Ton héros remonte les mains presque vides.',
  ],
  arena: ['La foule gronde : ton héros est tombé dès les premières vagues.'],
};
const WIN_TEXT: Record<PoiType, string[]> = {
  lair: [
    '🏆 Repaire nettoyé ! Le trésor du set est à toi.',
    '🏆 Le gardien tombe — la relique est récupérée.',
  ],
  camp: ['🏆 Camp dispersé ! Butin ramassé.', '🏆 Victoire nette au camp.'],
  mine: ['⛏️ Filon exploité — ressources chargées.', '⛏️ Extraction réussie.'],
  arena: ['🏟️ L’arène acclame ton champion !'],
};

/** Calcule l'issue d'une expédition (seedée). Le butin est crédité au RETOUR. */
export function resolveOutcome(hero: Combatant, poi: Poi, seed: number): ExpeditionOutcome {
  const rng = mulberry32(seed >>> 0 || 1);
  const cost = goldCost(poi.type, poi.level);

  // ── ARÈNE : gauntlet de survie par vagues (nuit) → RÉCOMPENSE GRASSE ∝ vagues. ──
  // Chère en or (puits) + trajet long, mais paie beaucoup en poussière/pierres/gear.
  if (poi.type === 'arena') {
    const rthA = (2 * travelOneWayMin(poi.level, poi.distNorm)) / 60;
    const tfA = 0.5 + rthA;
    const waves = simulateArena(hero, poi.level, seed + 17);
    const good = waves >= 6; // « belle performance » (pour le ton du rapport / notif)
    // Or : on rend une part du coût (sink net) mais la vraie paie est en ressources.
    const gold =
      Math.round((poi.level * 12 + waves * poi.level * 7) * (1 + rthA * 0.4)) +
      Math.round(cost * 0.25);
    // Récompense par vague RELEVÉE (2026‑08‑18, ticket arène) : l'arène était strictement
    // dominée par un camp (moins de poussière pour un coût d'or 4× plus élevé). Tenir
    // longtemps devient une VRAIE grosse paie de ressources → justifie la dépense d'or.
    const dust = Math.round((20 + waves * 15) * tfA);
    const stones = Math.round((8 + waves * 5) * tfA);
    // BUTIN MULTIPLE (2026‑08‑18) : l'arène (gauntlet de survie) lâche PLUSIEURS objets
    // — 1 par palier de 5 vagues (3-9 vagues → 1, 10-14 → 2, … plafonné à 5) — la
    // qualité montant avec les vagues + le rang de l'objet. Seule source de « tas de loot ».
    const nItems = waves >= 3 ? Math.min(5, Math.max(1, Math.floor(waves / 5))) : 0;
    const items: Omit<Item, 'id'>[] = [];
    for (let i = 0; i < nItems; i++) {
      const d = rollDrop(rng, {
        cleared: true,
        defeated: 1,
        level: poi.level,
        luck: Math.min(0.95, 0.35 + waves * 0.05 + i * 0.04),
        spread: 0,
      });
      if (d) items.push(d);
    }
    const key = rng() < Math.min(0.4, waves * 0.03) ? 1 : 0;
    const text =
      waves === 0
        ? pick(rng, FAIL_TEXT.arena)
        : `🏟️ ${waves} vague${waves > 1 ? 's' : ''} tenue${waves > 1 ? 's' : ''} !${good ? ' La foule est en délire.' : ''}`;
    return {
      win: good,
      gold,
      dust,
      energy: 0,
      stones,
      item: items[0] ?? null,
      items,
      key,
      reconBonus: 0,
      waves,
      text,
    };
  }

  // Mine = récolte (pas de combat) ; camp/repaire = combat auto seedé.
  const win =
    poi.type === 'mine'
      ? true
      : simulateCombat(hero, poiCombatant(poi.level, poi.type), { seed: seed + 7, goldOnWin: 0 })
          .win;

  // HAUL SCALÉ AU TEMPS DE TRAJET (aller-retour) : une expédition de plusieurs
  // heures doit VALOIR le coup (avant : reward ∝ niveau seul → dérisoire vs un
  // donjon actif). Facteur temps `(0.5 + rth)` : un trajet court rend un peu, un
  // long rend beaucoup. On mise sur les ressources RARES (poussière/pierres/gear) —
  // l'or déborde déjà (filons = le puits) mais reste un bonus net correct.
  const rth = (2 * travelOneWayMin(poi.level, poi.distNorm)) / 60; // heures A/R
  const tf = 0.5 + rth;

  if (!win) {
    const key = rng() < 0.12 ? 1 : 0;
    return {
      win: false,
      gold: Math.round(cost * EXPE.failRefund), // < coût → jamais un profit
      dust: Math.round(poi.level * 1.5),
      energy: 0,
      stones: Math.round(poi.level * 0.4),
      item: null,
      key,
      reconBonus: 0.08,
      text: pick(rng, FAIL_TEXT[poi.type]),
    };
  }

  // Réussite : HAUL (or + poussière + pierres) + PRISE éventuelle.
  // MINE = INVESTISSEMENT D'OR (+ temps réel) → doit rapporter nettement plus que le coût.
  // Rendement = coût × (1,8 + heures A/R) : ~2,3× pour un trajet court, ~3,3× pour ~1,5 h,
  // jusqu'à ~5× pour un long trajet (avant : ~2× seulement → trop léger pour l'attente).
  const goldHaul =
    poi.type === 'mine'
      ? Math.round(cost * (1.8 + rth))
      : Math.round((cost * 0.4 + poi.level * 10) * (1 + rth * 0.4));
  const dustHaul = Math.round((poi.type === 'mine' ? 14 + poi.level * 4 : 9 + poi.level * 3) * tf);
  const stoneHaul = Math.round(
    (poi.type === 'lair'
      ? 4 + poi.level * 1.4
      : poi.type === 'mine'
        ? 3 + poi.level * 1.1
        : 2 + poi.level * 0.7) * tf,
  );
  let item: Omit<Item, 'id'> | null = null;
  let key = 0;
  if (poi.type === 'lair' && poi.setId) {
    item = rollSetPiece(rng, { setId: poi.setId, level: poi.level, luck: 0.6 });
    key = rng() < 0.2 ? 1 : 0;
  } else if (poi.type === 'camp') {
    item = rollDrop(rng, { cleared: true, defeated: 1, level: poi.level, luck: 0.4, spread: 1 });
    key = rng() < 0.1 ? 1 : 0;
  }
  let gold = goldHaul;
  let dust = dustHaul;
  let stones = stoneHaul;
  // ÉNERGIE : les MINES rendent un peu d'énergie de jeu (∝ niveau × temps de trajet)
  // → un revenu d'énergie passif, complément du sport, qui adoucit le pincement de
  // fin de partie (le coût des runs monte plus vite que l'énergie/séance). Mines seules.
  const energy = poi.type === 'mine' ? Math.round((4 + poi.level * 1.5) * tf) : 0;
  let text = pick(rng, WIN_TEXT[poi.type]);
  // EMBUSCADE sur le trajet (seedée) : ~35 % de chance d'un combat rapide en chemin.
  // Gagné → butin renforcé ; subi (héros trop faible) → butin écorné. Risque/reward.
  if (rng() < 0.35) {
    const ambushWon = simulateCombat(hero, poiCombatant(Math.max(1, poi.level - 1), 'camp'), {
      seed: seed + 31,
      goldOnWin: 0,
    }).win;
    if (ambushWon) {
      gold = Math.round(gold * 1.25);
      dust = Math.round(dust * 1.3);
      stones = Math.round(stones * 1.3);
      text += ' ⚔️ Embuscade repoussée en chemin — butin renforcé !';
    } else {
      gold = Math.round(gold * 0.7);
      dust = Math.round(dust * 0.7);
      text += ' 🩸 Embuscade subie sur le trajet — butin écorné.';
    }
  }
  return { win: true, gold, dust, energy, stones, item, key, reconBonus: 0, text };
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
  const rng = mulberry32(seed >>> 0 || 1);
  const C = EXPE.mapSize / 2; // centre de la carte
  // Continent : grand contour irrégulier, très découpé (détaillé).
  const coast = blobPath(rng, C, C, EXPE.mapSize * 0.44, 20);
  const features: Motif[] = [];
  const rivers: string[] = [];
  const push = (kind: MotifKind, x: number, y: number, s: number) => {
    const d =
      kind === 'mountain'
        ? peakPath(x, y, s)
        : kind === 'tree'
          ? treePath(x, y, s)
          : dunePath(x, y, s);
    features.push({ kind, d, x, y });
  };
  // Amas de relief (chaîne / forêt / désert) répartis dans le continent — nombre
  // et étalement mis à l'échelle de la carte (plus grande = plus de reliefs, étalés).
  const clusters = 8 + Math.floor(rng() * 4);
  const spread = EXPE.mapSize * 0.3; // rayon d'étalement des amas (reste dans la côte)
  const centers: [number, number][] = [];
  for (let c = 0; c < clusters; c++) {
    let cx = C;
    let cy = C;
    for (let tries = 0; tries < 24; tries++) {
      const a = rng() * Math.PI * 2;
      const rr = EXPE.mapSize * 0.1 + rng() * spread;
      cx = C + Math.cos(a) * rr;
      cy = C + Math.sin(a) * rr;
      if (centers.every(([px, py]) => Math.hypot(px - cx, py - cy) > 24)) break;
    }
    centers.push([cx, cy]);
    const kind: MotifKind = (['mountain', 'tree', 'dune', 'mountain', 'tree'] as const)[
      Math.floor(rng() * 5)
    ]!;
    if (kind === 'mountain') {
      const dir = rng() * Math.PI;
      const n = 5 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) {
        const t = (i - (n - 1) / 2) * (3.4 + rng());
        push(
          'mountain',
          cx + Math.cos(dir) * t + (rng() - 0.5) * 2.5,
          cy + Math.sin(dir) * t + (rng() - 0.5) * 2.5,
          0.9 + rng() * 0.8,
        );
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
      for (let i = 0; i < n; i++)
        push('dune', cx + (rng() - 0.5) * 16, cy + (rng() - 0.5) * 12, 0.9 + rng() * 0.7);
    }
  }
  // Ordre peintre : du fond (haut) vers l'avant (bas).
  features.sort((a, b) => a.y - b.y);
  return { coast, features, rivers };
}

/** Construit une expédition (au moment de l'envoi). `now` = ms epoch. `travelMult`
 *  (< 1 = plus rapide) applique la réduction de trajet de l'avant-poste. */
export function startExpedition(
  hero: Combatant,
  poi: Poi,
  now: number,
  seed: number,
  travelMult = 1,
): ActiveExpedition {
  const oneWayMs = Math.round(travelOneWayMin(poi.level, poi.distNorm) * 60_000 * travelMult);
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
