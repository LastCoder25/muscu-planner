// expedition.ts — mode IDLE « Expédition » (pur/testable). Tu envoies ton héros
// explorer un POI d'une carte ; ça prend du TEMPS RÉEL (aller → objectif → retour) ;
// tu reviens chercher le rapport puis le butin. 100 % déterministe (seed + timestamps
// → carte/issue reproductibles, hors-ligne, aucun cron). Distinct du Labyrinthe
// (mode grille actif). Cf. mémoire expedition-idle-design.
//
// NB Date.now() n'est PAS utilisé ici : le `now` (ms epoch) est TOUJOURS passé par
// l'appelant → fonctions pures, testables.
import { mulberry32, simulateCombat, type Combatant, type CombatEvent } from './combat';
import { rollDrop, rollSetPiece, ITEM_SETS, type Item } from './items';

// ── Types ──
// 'arena' = survie par VAGUES : le héros tient le plus longtemps possible contre des
// vagues de plus en plus fortes (PV reportés) → récompense ∝ vagues tenues.
// 'well'/'shrine'/'archive' = POI de RESSOURCES (v0.658). Pourquoi : mesure faite, le
// butin de la carte n'améliore plus un joueur bien équipé (0 % d'upgrade) car la rareté
// d'un drop est plafonnée par le NIVEAU du joueur — et ce plafond, c'est l'anti-runaway,
// on n'y touche pas. Les ressources, elles, ne se périment JAMAIS : elles se consomment
// à tout niveau. La carte cesse donc d'être une loterie à butin pour devenir une source
// de ressources en temps réel, complémentaire des donjons qui, eux, donnent le stuff.
export type PoiType =
  | 'mine'
  | 'camp'
  | 'lair'
  | 'arena'
  | 'well'
  | 'shrine'
  | 'archive'
  // 🔩 ÉPAVE : la SEULE source de ferraille (réparation de l'enceinte, cf. raid.ts).
  // Le butin d'un siège paie dans la devise de la faction, jamais en ferraille : en
  // trouver sur un loup ou un revenant n'aurait aucun sens.
  | 'wreck';

/** POI de récolte pure : aucun combat, on ramasse et on rentre (comme la mine). */
export const HARVEST_TYPES: ReadonlySet<PoiType> = new Set<PoiType>([
  'mine',
  'well',
  'shrine',
  'archive',
  'wreck',
]);

export interface Poi {
  id: string;
  type: PoiType;
  /** Route dangereuse, TÉLÉGRAPHIÉE dans l'UI avant l'envoi : plus d'embuscades, mais
   *  une récompense renforcée quand on les repousse. Le choix du POI cesse d'être
   *  « le plus proche » pour devenir un vrai arbitrage risque/gain. */
  perilous?: boolean;
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
  enchantScrolls: number; // 📜 legacy : devise MORTE (plus aucun site de dépense) — conservé pour ne pas casser les anciens messages
  summonStones: number; // 🔮 pierres d'invocation → coût des boss de palier
  fragments: number; // 🧩 infusion de grade des familiers
  inkDust: number; // 🖋️ infusion de grade des talents
  scrap: number; // 🔩 ferraille : répare l'enceinte (épaves uniquement)
  item: Omit<Item, 'id'> | null; // la « prise » principale (pièce de set / objet) ou null
  items?: Omit<Item, 'id'>[]; // ARÈNE : plusieurs objets (1 par palier de vagues) ; `item` = le 1er
  key: number; // clé de Labyrinthe (consolation rare)
  reconBonus: number; // +fraction de réussite au prochain essai (échec)
  /** Multiplicateur sur la jambe RETOUR (1 = normal). Un passage découvert ou un
   *  contretemps ramènent le héros plus tôt — le seul effet qui joue sur le TEMPS. */
  returnMult: number;
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
  enchantScrolls: number; // legacy (devise morte) — conservé pour les anciens messages
  summonStones?: number; // 🔮
  fragments?: number; // 🧩
  inkDust?: number; // 🖋️
  scrap?: number; // 🔩 ferraille
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
    enchantScrolls: o.enchantScrolls,
    ...(o.summonStones ? { summonStones: o.summonStones } : {}),
    ...(o.fragments ? { fragments: o.fragments } : {}),
    ...(o.inkDust ? { inkDust: o.inkDust } : {}),
    ...(o.scrap ? { scrap: o.scrap } : {}),
    ...(o.item ? { itemName: o.item.name, item: o.item } : {}),
    ...(o.items && o.items.length > 1 ? { itemCount: o.items.length } : {}),
    key: o.key,
    ...(o.waves !== undefined ? { waves: o.waves } : {}),
    resolvedAt: exp.midAt,
    read: false,
  };
}

// ── Constantes (tunables ; éco chiffrée affinée par simulation en phase 6) ──
/** Réglages des POI de RÉCOLTE (devises vivantes). Premier calage : à ajuster à l'usage. */
export const HARVEST = {
  wellEnergyMax: 200, // ~5 runs de donjon : un complément net, pas une séance de sport
  keyChance: 0.12, // clé de Labyrinthe en prime occasionnelle
  // Ferraille d'une épave. Dimensionnée pour qu'UNE visite couvre largement la remise
  // en service d'une enceinte de son niveau (cf. repairCost, raid.ts) : réparer doit
  // être une formalité qu’on accomplit, jamais un mur qui enferme dans la défaite.
  scrapBase: 18,
  scrapPerLevel: 1.6,
} as const;

export const EXPE = {
  mapSize: 200, // côté de la carte (coord 0..mapSize) — GRANDE, on pan/zoom dessus
  town: { x: 100, y: 100 }, // ville de départ (CENTRE de la carte)
  // Rythme, deux fois recalibré. v0.658 : avec 10 POI au plancher et des durées de vie de
  // 12→48 h, la carte était TOUJOURS pleine — aucune rareté, aucun arbitrage — d'où une
  // forte réduction (bande 3-6, moyenne 4,2). v0.665 : la carte ayant perdu son anneau de
  // bâtiments (déménagé sur l'écran « Ma base »), elle paraissait vide ; on remonte donc
  // la densité à une bande **5-9, moyenne 6,4**, mesurée sur 14 jours simulés à tous les
  // niveaux. Elle ne colle JAMAIS au plafond (0 % du temps) : des POI expirent encore
  // avant qu'on les fasse, donc choisir reste un vrai arbitrage.
  poiCap: 11,
  poiFloor: 5,
  perilousChance: 0.18, // ~1 POI sur 5 signalé « route dangereuse » avant l'envoi
  minDistPoi: 20, // écart mini entre POI (placement espacé)
  distBands: 3, // bandes de distance parcourues à tour de rôle (cf. placePoi)
  // 30 → 18 (v0.667) : l'anneau de bâtiments occupait cette couronne, son départ pour
  // l'écran « Ma base » y a laissé un trou et la ville avait l'air isolée.
  distMin: 18, // distance mini ville↔POI (coord ; la ville est au centre)
  // ⚠️ Le maxi est BORNÉ PAR LA CÔTE, pas choisi librement : à 88 il valait le rayon
  // NOMINAL du littoral, qui pince par endroits — les POI d'un renfoncement se
  // retrouvaient donc dessinés en pleine mer. Cf. `landRadius()`, qui donne le rayon
  // garanti de terre ferme, et le test qui vérifie que distMax reste dessous.
  distMax: 64, // distance maxi (rayon → POI tout autour, 360°)
  spawnMinMs: 2 * 3600_000, // intervalle de spawn : 2 h..4 h (jitter)
  spawnJitterMs: 2 * 3600_000,
  lifespanMs: {
    mine: 20 * 3600_000,
    camp: 10 * 3600_000,
    lair: 26 * 3600_000,
    arena: 48 * 3600_000, // l'arène reste l'événement long (fait pour la nuit)
    well: 14 * 3600_000,
    shrine: 16 * 3600_000,
    archive: 14 * 3600_000,
    wreck: 18 * 3600_000,
  },
  travelOneWayMinMin: 8, // trajet aller (min) : 8 min (proche) → 150 min (loin) × niveau
  travelOneWayMaxMin: 150,
  // Coût = base × niveau^1.6 → VRAI puits d'or (2026‑08‑12). Repère : un donjon
  // rapporte ~1600 or à reco10, ~4920 à reco20 ; un repaire coûte ~6k (niv10) → ~20k
  // (niv20) = plusieurs runs de donjon pour une pièce de set (l'or s'écoule).
  // ARÈNE (ticket 2d616665) : événement RARE fait pour la nuit → coût d'or ÉLEVÉ
  // (le plus cher), placée LOIN (trajet long) et récompense grasse (∝ vagues).
  // Les POI de ressources coûtent peu d'or : leur intérêt est ce qu'ils RAPPORTENT en
  // devises vivantes, pas un pari sur du butin.
  goldCostBase: {
    mine: 22,
    camp: 65,
    lair: 155,
    arena: 240,
    well: 30,
    shrine: 48,
    archive: 34,
    wreck: 26,
  },
  goldCostExp: 1.6,
  failRefund: 0.4, // échec : fraction de l'or remboursée (< coût → jamais un profit ; adouci 0,3→0,4 pour un pari raté moins punitif, ticket 86331df3)
  // ÉNERGIE des mines : BORNÉE (ticket a0d16472). Le facteur temps `tf` n'est pas
  // plafonné (un trajet long × haut niveau donnait ~1300 ⚡ pour une seule expé, ce qui
  // contredit « l'énergie est un complément, jamais un substitut au sport »). On limite
  // le tf pris en compte ET on cape la valeur finale à ~1 run.
  mineEnergyTfCap: 2.5, // l'énergie ne profite pas des longs trajets comme le loot
  mineEnergyMax: 60, // plafond dur par expédition (≈ 1 run)
  arenaMaxItems: 8, // garde-fou d'inventaire : une run très longue ne noie pas le sac
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

/** Fenêtre de niveaux de spawn : **[niveau, niveau+10]** (v0.658).
 *
 *  L'ancienne fenêtre `[niveau−5, niveau+3]` remplissait la carte de POI qu'un joueur
 *  équipé écrase sans y penser. Mesuré : le taux de victoire est de **100 % à TOUS les
 *  écarts, jusqu'à +10** — le combat de POI n'est pas un risque, donc rien ne justifiait
 *  de brider vers le bas. Monter le plancher et le plafond augmente le RENDEMENT (or,
 *  poussière, ressources suivent `poi.level`) sans rendre quoi que ce soit inatteignable.
 *  ⚠️ Ça n'améliore PAS la rareté du butin : elle reste centrée sur `min(contenu, joueur)`
 *  — c'est l'anti-runaway, et il est intentionnel. */
export function spawnWindow(playerLevel: number): { min: number; max: number } {
  const base = Math.max(1, playerLevel);
  return { min: base, max: base + 10 };
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
/** Une vague livrée, avec de quoi la REJOUER (log seedé). */
export interface ArenaFight {
  wave: number; // 1-based
  monster: string;
  maxPv: number;
  win: boolean;
  rounds: number;
  startPv: number; // PV du héros au DÉBUT de la vague (attrition)
  log: CombatEvent[];
}
export interface ArenaRun {
  waves: number; // vagues TENUES (gagnées)
  fights: ArenaFight[]; // toutes les vagues livrées, la dernière étant perdue
  finalPv: number;
}

/** Enchaîne les vagues jusqu'à la mort, en CONSERVANT chaque combat (pour le rejeu).
 *  PV reportés d'une vague à l'autre + régén partielle : l'Endurance compte. La rampe
 *  géométrique garantit que la mort finit toujours par arriver. */
export function runArena(hero: Combatant, level: number, seed: number): ArenaRun {
  let pv = hero.pv;
  let waves = 0;
  const fights: ArenaFight[] = [];
  for (let w = 0; w < ARENA.maxWaves; w++) {
    const foe = arenaWaveCombatant(level, w);
    const startPv = pv;
    const r = simulateCombat(hero, foe, {
      seed: seed + w * 1009,
      goldOnWin: 0,
      startPlayerPv: pv,
    });
    pv = r.log.length ? r.log[r.log.length - 1]!.playerPv : pv;
    fights.push({
      wave: w + 1,
      monster: foe.name,
      maxPv: foe.pv,
      win: r.win,
      rounds: r.rounds,
      startPv,
      log: r.log,
    });
    if (!r.win) break;
    waves++;
    pv = Math.min(hero.pv, pv + Math.round(hero.pv * ARENA.healPct));
  }
  return { waves, fights, finalPv: Math.max(0, pv) };
}

/** Compte de vagues seul (POI d'expédition idle) — même simulation, pas de copie. */
export function simulateArena(hero: Combatant, level: number, seed: number): number {
  return runArena(hero, level, seed).waves;
}

// ── Arène JOUABLE (mode direct d'Aventure) : coût en énergie et récompenses ──
export const ARENA_PLAY = {
  energyBase: 12, // coût d'entrée à bas niveau
  energyPerLevel: 0.6,
  energyCap: 30, // plafonné comme les donjons : le jeu ne rationne pas l'effort sportif
  goldPerWave: 14, // or par vague tenue, mis à l'échelle du niveau
  dropEvery: 3, // un tirage de butin tous les N paliers de vagues
} as const;

/** Coût d'entrée dans l'arène (plafonné). */
export function arenaEnergyCost(level: number): number {
  return Math.min(
    ARENA_PLAY.energyCap,
    Math.round(ARENA_PLAY.energyBase + Math.max(0, level) * ARENA_PLAY.energyPerLevel),
  );
}
/** Récompenses d'une run : or ∝ vagues×niveau, et un tirage de butin tous les
 *  `dropEvery` paliers — la `luck` monte avec les vagues (aller loin paie). */
export function arenaRewards(
  waves: number,
  level: number,
): { gold: number; drops: number; luck: number } {
  const w = Math.max(0, waves);
  return {
    gold: Math.round(w * ARENA_PLAY.goldPerWave * (1 + Math.max(0, level) * 0.12)),
    drops: Math.floor(w / ARENA_PLAY.dropEvery),
    luck: Math.min(1, w * 0.05),
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
// `minFrac` (0..1) force une distance MINIMALE (l'arène spawn loin → trajet de nuit).
/** Place un POI autour de la ville.
 *
 *  `band` (0 = proche, 1 = intermédiaire, 2 = lointain) STRATIFIE le tirage : les spawns
 *  parcourent les trois tiers à tour de rôle au lieu de tirer une distance au hasard.
 *  Pourquoi : un tirage uniforme ne GARANTIT aucune répartition — avec 6 POI à l'écran on
 *  pouvait n'avoir que du lointain (mesuré : 7 % seulement à moins de 35 de la ville, un
 *  aller-retour médian de 4 h 42). Comme les bandes se succèdent, la moyenne reste celle
 *  d'un tirage uniforme : la carte se répartit visiblement, **sans que les temps de trajet
 *  ni l'économie ne bougent**. `minFrac` (l'arène, qu'on veut loin) prime sur la bande. */
function placePoi(
  rng: () => number,
  minFrac = 0,
  band?: number,
): { x: number; y: number; distNorm: number } {
  const { town, distMin, distMax, mapSize } = EXPE;
  const pad = 10;
  const lo = distMin + clamp01(minFrac) * (distMax - distMin);
  // Tiers visé (ignoré si un plancher explicite a déjà resserré la fenêtre).
  const nb = EXPE.distBands;
  const b = band === undefined || minFrac > 0 ? null : ((band % nb) + nb) % nb;
  for (let tries = 0; tries < 40; tries++) {
    const ang = rng() * Math.PI * 2; // angle libre → POI dans tous les sens
    const span = distMax - lo;
    const dd = b === null ? lo + rng() * span : lo + ((b + rng()) / nb) * span;
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
  // Pondération : la MOITIÉ des spawns sont des POI de RESSOURCES (v0.658). C'est le
  // cœur du correctif : à haut niveau la carte ne peut plus produire de butin utile,
  // mais elle peut toujours produire des devises qui, elles, ne se périment pas.
  let type = pick(rng, [
    'mine',
    'mine',
    'camp',
    'camp',
    'lair',
    'arena',
    'well',
    'well',
    'shrine',
    'shrine',
    'archive',
    'archive',
    // 🔩 ÉPAVE : bien représentée, car c'est l'UNIQUE source de ferraille et qu'une
    // enceinte endommagée ne doit jamais rester bloquée faute de matière.
    'wreck',
    'wreck',
  ] as const);
  // UNE SEULE arène à la fois sur la carte (ticket 2d616665) → sinon on rabat sur camp.
  if (type === 'arena' && map.pois.some((p) => p.type === 'arena')) type = 'camp';
  const win = spawnWindow(playerLevel);
  // Tirage BIAISÉ vers le bas de la fenêtre (rng², moyenne ≈ +1/3 de la plage) et non
  // uniforme. Mesuré : un héros peu équipé gagne 42 % d'un repaire à son niveau mais
  // 0 % à +5 — une fenêtre [niveau, niveau+10] tirée uniformément ne lui proposerait
  // presque que des POI perdus d'avance. Le haut de la fenêtre reste atteignable, mais
  // devient l'exception qu'on vise, pas la norme qu'on subit.
  const span = win.max - win.min + 1;
  const level = win.min + Math.min(span - 1, Math.floor(rng() * rng() * span));
  // L'arène spawn LOIN (trajet long, fait pour la nuit) ; les autres, n'importe où.
  const minFrac = type === 'arena' ? 0.8 : 0;
  // La bande tourne avec le compteur de spawns → proche, moyen, lointain à tour de rôle.
  const band = map.spawnCount;
  let pos = placePoi(rng, minFrac, band);
  // Espacement : re-tire si trop proche d'un POI existant (quelques essais).
  for (let k = 0; k < 6; k++) {
    const tooClose = map.pois.some((p) => dist(p.x, p.y, pos.x, pos.y) < EXPE.minDistPoi);
    if (!tooClose) break;
    pos = placePoi(rng, minFrac, band);
  }
  // Route dangereuse : tirée AU SPAWN pour être annoncée avant l'envoi (télégraphiée).
  const perilous = rng() < EXPE.perilousChance;
  const poi: Poi = {
    id: `poi_${map.seed}_${map.spawnCount}`,
    type,
    ...(perilous ? { perilous: true } : {}),
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

/** Réglages des rencontres de TRAJET (aller / retour). */
export const TRAVEL = {
  // Probabilités PAR JAMBE de trajet. Calibrées pour qu'une rencontre reste une ÉPICE :
  // au premier réglage, 91 % des expéditions en portaient une et le butin moyen montait
  // à ×1,23 — autrement dit un bonus permanent de 23 % déguisé en aléa. Ici ~45 % des
  // voyages se passent sans rien, et la moyenne des gains retombe près de 1 : ce sont
  // les écarts qui font l'intérêt, pas un cadeau systématique.
  ambushChance: 0.14,
  cacheChance: 0.05, // trouvaille pacifique (pas de combat)
  merchantChance: 0.05, // marchand errant : troque ton or contre des vivres
  shortcutChance: 0.04, // passage découvert : retour raccourci, sans perte
  setbackChance: 0.05, // contretemps : demi-cargaison, mais retour bien plus tôt
  winMult: 1.2, // butin renforcé si l'embuscade est repoussée
  loseMult: 0.7, // butin écorné si elle est subie
  cacheMult: 1.15,
  merchantGoldMult: 0.55, // il achète ton or…
  merchantResMult: 1.4, // …et paie en ressources (puits d'or supplémentaire)
  shortcutReturnMult: 0.7, // jambe RETOUR raccourcie
  setbackReturnMult: 0.5,
  setbackHaulMult: 0.5, // on rentre vite, mais à moitié chargé
  // Route dangereuse (télégraphiée au départ) : deux fois plus d'embuscades, et une
  // récompense doublée quand on les repousse → le choix du POI redevient un arbitrage.
  perilAmbushMult: 2,
  perilRewardBonus: 0.5, // +50 % sur le gain d'une embuscade repoussée
  // Le rôdeur est calibré RELATIVEMENT au héros (même principe que le Labyrinthe), et
  // non en échelle absolue. Avec un `poiCombatant` (PV ~L³), l'embuscade était
  // ARITHMÉTIQUEMENT imbattable sans équipement — mesuré : 0 % de victoire nu, 100 %
  // équipé. Un héros peu équipé rentrait donc la cargaison écornée à TOUS les coups, et
  // deux fois depuis qu'il y a deux jambes de trajet. Une rencontre de route est un
  // ralentisseur, pas un mur : le vrai risque vit dans le POI lui-même.
  foePvTurns: 2.4, // PV du rôdeur ≈ 2,4 tours de dégâts du héros
  foeDmgPctPv: 0.07, // il mord ~7 % des PV max du héros par coup
} as const;

/** Assaillant de trajet, calibré sur le HÉROS : toujours un vrai obstacle, jamais un mur.
 *  Un build franchement bancal peut encore perdre — mais ce n'est plus mécanique. */
export function ambushCombatant(hero: Combatant, level: number): Combatant {
  const base = poiCombatant(Math.max(1, level - 1), 'camp');
  const perTurn = Math.max(1, hero.damage * (hero.strikes ?? 1));
  return {
    ...base,
    name: 'Rôdeur embusqué',
    pv: Math.max(1, Math.round(perTurn * TRAVEL.foePvTurns)),
    damage: Math.max(1, Math.round(hero.pv * TRAVEL.foeDmgPctPv)),
  };
}

export type TravelLeg = 'out' | 'back';
export type TravelKind = 'ambush' | 'cache' | 'merchant' | 'shortcut' | 'setback';
export interface TravelEncounter {
  leg: TravelLeg;
  kind: TravelKind;
  won: boolean; // hors 'ambush' → toujours true
}

/** Rencontres sur la route, tirées au DÉPART comme le reste (déterministe, hors-ligne).
 *
 *  Une expédition sans aléa n'est qu'un distributeur : c'est ce qui rendait les POI de
 *  récolte plats. Ces rencontres redonnent de la variance ET la seule voie par laquelle
 *  une récolte peut lâcher un objet — sans toucher à la récompense de base.
 *
 *  Le multiplicateur s'applique à TOUT le butin (or comme ressources) : une jambe de
 *  trajet ratée écorne la cargaison, une embuscade repoussée l'enrichit. */
export function rollTravelEncounters(
  rng: () => number,
  hero: Combatant,
  poi: Poi,
  seed: number,
  playerLevel?: number,
  legs: TravelLeg[] = ['out', 'back'],
): {
  encounters: TravelEncounter[];
  goldMult: number;
  resMult: number;
  returnMult: number;
  drops: Omit<Item, 'id'>[];
  keys: number;
  text: string;
} {
  const encounters: TravelEncounter[] = [];
  const drops: Omit<Item, 'id'>[] = [];
  let goldMult = 1;
  let resMult = 1;
  let returnMult = 1;
  let keys = 0;
  let text = '';
  const LEG_FR: Record<TravelLeg, string> = { out: "à l'aller", back: 'au retour' };
  const peril = !!poi.perilous;
  const ambushP = TRAVEL.ambushChance * (peril ? TRAVEL.perilAmbushMult : 1);
  const both = (k: number) => {
    goldMult *= k;
    resMult *= k;
  };

  legs.forEach((leg, i) => {
    const roll = rng();
    if (roll < ambushP) {
      const won = simulateCombat(hero, ambushCombatant(hero, poi.level), {
        seed: seed + 31 + i * 17,
        goldOnWin: 0,
      }).win;
      encounters.push({ leg, kind: 'ambush', won });
      if (won) {
        both(TRAVEL.winMult + (peril ? TRAVEL.perilRewardBonus : 0));
        // Un assaillant vaincu = un tirage d'objet, comme un monstre de donjon. Au niveau
        // de l'embuscade (poi.level − 1) : la dépouille vaut ce que valait l'adversaire.
        const spoil = rollDrop(rng, {
          cleared: true,
          defeated: 1,
          level: Math.max(1, poi.level - 1),
          luck: 0.35,
          spread: 1,
          playerLevel,
        });
        text += ` ⚔️ Embuscade repoussée ${LEG_FR[leg]}`;
        if (spoil) {
          drops.push(spoil);
          text += ` (+ ${spoil.name} sur la dépouille)`;
        }
        text += ' !';
      } else {
        both(TRAVEL.loseMult);
        text += ` 🩸 Embuscade subie ${LEG_FR[leg]} — cargaison écornée.`;
      }
      return;
    }
    // Les autres rencontres se partagent la probabilité restante, en cascade.
    let acc = ambushP;
    if (roll < (acc += TRAVEL.cacheChance)) {
      // Trouvaille pacifique : pas de combat, juste une bonne surprise.
      encounters.push({ leg, kind: 'cache', won: true });
      both(TRAVEL.cacheMult);
      keys += 1;
      text += ` 🗝️ Cache oubliée repérée ${LEG_FR[leg]} — clé et vivres récupérés.`;
    } else if (roll < (acc += TRAVEL.merchantChance)) {
      // Marchand errant : convertit de l'or en ressources → puits d'or de plus.
      encounters.push({ leg, kind: 'merchant', won: true });
      goldMult *= TRAVEL.merchantGoldMult;
      resMult *= TRAVEL.merchantResMult;
      text += ` 🧺 Marchand errant croisé ${LEG_FR[leg]} — de l'or troqué contre des vivres.`;
    } else if (roll < (acc += TRAVEL.shortcutChance)) {
      // Passage découvert : pur gain de TEMPS, sans contrepartie.
      encounters.push({ leg, kind: 'shortcut', won: true });
      returnMult *= TRAVEL.shortcutReturnMult;
      text += ` 🧭 Passage découvert ${LEG_FR[leg]} — le retour sera plus court.`;
    } else if (roll < acc + TRAVEL.setbackChance) {
      // Contretemps : on écourte le voyage. Moitié moins de cargaison, mais le héros
      // est de nouveau disponible bien plus tôt — un mal pour un bien quand on enchaîne.
      encounters.push({ leg, kind: 'setback', won: false });
      both(TRAVEL.setbackHaulMult);
      returnMult *= TRAVEL.setbackReturnMult;
      text += ` ⛈️ Contretemps ${LEG_FR[leg]} — demi-cargaison, mais retour anticipé.`;
    }
  });

  return { encounters, goldMult, resMult, returnMult, drops, keys, text };
}

// ── Résolution (au DÉPART, seedée → révélée/créditée aux timestamps) ──
const FAIL_TEXT: Record<PoiType, string[]> = {
  lair: [
    'Le gardien était trop coriace. En battant en retraite, ton héros a détaché une clé rouillée d’un cadavre.',
    'Repli sous le feu. Dans la fuite, il a raflé un peu d’or et une babiole.',
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
  // Récolte : pas de combat, donc jamais d'échec — entrées présentes pour l'exhaustivité.
  well: ['La faille s’est refermée avant l’extraction.'],
  shrine: ['Le sanctuaire est resté muet.'],
  archive: ['Les galeries se sont effondrées avant la salle de lecture.'],
  wreck: ['L’épave s’est enfoncée avant qu’on ait pu la démonter.'],
};
const WIN_TEXT: Record<PoiType, string[]> = {
  lair: [
    '🏆 Repaire nettoyé ! Le trésor du set est à toi.',
    '🏆 Le gardien tombe — la relique est récupérée.',
  ],
  camp: ['🏆 Camp dispersé ! Butin ramassé.', '🏆 Victoire nette au camp.'],
  mine: ['⛏️ Filon exploité — ressources chargées.', '⛏️ Extraction réussie.'],
  well: ['💧 Faille canalisée — énergie siphonnée.', '💧 La source a rendu sa charge.'],
  shrine: [
    '🔮 Sanctuaire honoré — pierres d’invocation récupérées.',
    '🔮 Les runes ont cédé leurs pierres.',
  ],
  archive: [
    '📖 Archives fouillées — fragments et encre rapportés.',
    '📖 Les rayonnages ont livré leurs restes.',
  ],
  wreck: [
    '🔩 Épave démontée — ferraille chargée sur la carriole.',
    '🔩 La carcasse a rendu tout son métal.',
  ],
  arena: ['🏟️ L’arène acclame ton champion !'],
};

/** Calcule l'issue d'une expédition (seedée). Le butin est crédité au RETOUR. */
export function resolveOutcome(
  hero: Combatant,
  poi: Poi,
  seed: number,
  playerLevel?: number, // cap anti-runaway : rang des drops plafonné à min(contenu, joueur)
): ExpeditionOutcome {
  const rng = mulberry32(seed >>> 0 || 1);
  const cost = goldCost(poi.type, poi.level);

  // ── RÉCOLTE DE RESSOURCES (well / shrine / archive) : aucun combat, jamais d'échec. ──
  // Ces POI paient en devises VIVANTES — celles qui se consomment encore à tout niveau
  // (énergie, pierres d'invocation, fragments, encre) — et JAMAIS en butin, que la carte
  // ne peut structurellement plus produire au-dessus d'un joueur bien équipé.
  if (HARVEST_TYPES.has(poi.type) && poi.type !== 'mine') {
    const rthH = (2 * travelOneWayMin(poi.level, poi.distNorm)) / 60;
    const tfH = Math.min(0.5 + rthH, 6); // borné : un trajet interminable ne doit pas tout multiplier
    const L = poi.level;
    let energy = 0;
    let summonStones = 0;
    let fragments = 0;
    let inkDust = 0;
    let scrap = 0;
    if (poi.type === 'well') {
      // Complément d'énergie, jamais un substitut au sport : borné à ~5 runs de donjon.
      energy = Math.min(HARVEST.wellEnergyMax, Math.round((8 + L * 2) * tfH));
    } else if (poi.type === 'shrine') {
      // Calé sur le coût d'un boss (`1 + ⌊niv/5⌋`) → une visite ≈ une tentative et demie.
      summonStones = Math.max(2, Math.round((1 + L / 5) * (0.8 + tfH * 0.25)));
    } else if (poi.type === 'wreck') {
      scrap = Math.round((HARVEST.scrapBase + L * HARVEST.scrapPerLevel) * tfH);
    } else {
      fragments = Math.round((6 + L * 1.2) * tfH);
      inkDust = Math.round((5 + L) * tfH);
    }
    // Une récolte sans aléa n'est qu'un distributeur : les rencontres de trajet lui
    // rendent de la variance, et sont la SEULE voie par laquelle elle peut lâcher un objet.
    const tr = rollTravelEncounters(rng, hero, poi, seed, playerLevel);
    const k = tr.resMult;
    return {
      win: true,
      gold: Math.round(cost * 0.35 * tr.goldMult), // symbolique : la paie est en ressources
      dust: 0,
      // Le plafond s'applique APRÈS le bonus de trajet : « complément, jamais
      // substitut au sport » est un invariant, pas une valeur de base qu'un bon
      // voyage pourrait dépasser.
      energy: Math.min(HARVEST.wellEnergyMax, Math.round(energy * k)),
      enchantScrolls: 0,
      summonStones: Math.round(summonStones * k),
      fragments: Math.round(fragments * k),
      inkDust: Math.round(inkDust * k),
      scrap: Math.round(scrap * k),
      item: tr.drops[0] ?? null,
      items: tr.drops,
      key: (rng() < HARVEST.keyChance ? 1 : 0) + tr.keys,
      reconBonus: 0,
      returnMult: tr.returnMult,
      text: pick(rng, WIN_TEXT[poi.type]) + tr.text,
    };
  }

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
    // Parchemins d'enchant : faucet SECONDAIRE et modeste (le donjon reste la source
    // principale) — ∝ vagues tenues, sans le multiplicateur de trajet (déjà encodé par
    // les vagues). NB : quantités ex-« pierres » (rares) volontairement réduites.
    const enchantScrolls = 2 + Math.floor(waves / 2);
    // BUTIN : un TIRAGE PAR VAGUE TENUE (même principe qu'un donjon, qui tire une fois
    // par monstre vaincu). `cleared: false` → ~30 %/vague : tenir 10 vagues rapporte ~3
    // objets, 20 vagues ~6 — plus généreux que l'ancien palier de 5 vagues (1 objet/5),
    // sans inonder le sac. La luck monte avec les vagues → tenir longtemps paie en QUALITÉ
    // autant qu'en quantité. Plafond dur = garde-fou d'inventaire sur les très longues runs.
    const items: Omit<Item, 'id'>[] = [];
    for (let w = 0; w < waves && items.length < EXPE.arenaMaxItems; w++) {
      const d = rollDrop(rng, {
        cleared: false, // ≈ 30 % par vague
        defeated: 1,
        level: poi.level,
        luck: Math.min(0.95, 0.35 + w * 0.05),
        spread: 0,
        playerLevel,
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
      scrap: 0,
      energy: 0,
      enchantScrolls,
      summonStones: 3 + Math.floor(waves * 0.8),
      fragments: Math.round(waves * 3 * tfA),
      inkDust: Math.round(waves * 2.5 * tfA),
      item: items[0] ?? null,
      items,
      key,
      reconBonus: 0,
      returnMult: 1,
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
      scrap: 0,
      summonStones: 0,
      fragments: 0,
      inkDust: 0,
      dust: Math.round(poi.level * 1.5),
      energy: 0,
      enchantScrolls: 1 + Math.floor(poi.level / 15), // consolation modeste sur un échec
      item: null,
      key,
      reconBonus: 0.08,
      returnMult: 1, // un échec ne raccourcit rien : le héros rentre au pas
      text: pick(rng, FAIL_TEXT[poi.type]),
    };
  }

  // Décalage de la jambe RETOUR, posé par une rencontre de trajet (passage / contretemps).
  let returnMult = 1;
  // Réussite : HAUL (or + poussière + pierres) + PRISE éventuelle.
  // MINE = INVESTISSEMENT D'OR (+ temps réel) → doit rapporter nettement plus que le coût.
  // Rendement = coût × (1,8 + heures A/R) : ~2,3× pour un trajet court, ~3,3× pour ~1,5 h,
  // jusqu'à ~5× pour un long trajet (avant : ~2× seulement → trop léger pour l'attente).
  // MINE = reine de l'or (coût × 1,8..~5). CAMP/REPAIRE = butin (item/set) ; leur or doit
  // au moins ÉQUILIBRER le coût (l'item = profit pur) au lieu d'être net négatif sur un
  // trajet court → on ne se sent plus « volé ». Reste sous la mine en or/coût.
  const goldHaul =
    poi.type === 'mine'
      ? Math.round(cost * (1.8 + rth)) // reine de l'or : ~2,3×..~5× le coût
      : Math.round(cost * (1.0 + rth * 0.1)); // camp/repaire : ≥ équilibre (+3..+65 %), item = le vrai gain, reste SOUS la mine
  const dustHaul = Math.round((poi.type === 'mine' ? 14 + poi.level * 4 : 9 + poi.level * 3) * tf);
  // Parchemins d'enchant : faucet SECONDAIRE (le donjon reste la source principale).
  // Coefficients FORTEMENT réduits vs l'ex-« pierres » (~×10) → une expédition rend
  // une poignée de parchemins, pas des dizaines.
  const scrollHaul = Math.round(
    (poi.type === 'lair'
      ? 2 + poi.level * 0.12
      : poi.type === 'mine'
        ? 1.5 + poi.level * 0.1
        : 1 + poi.level * 0.08) * tf,
  );
  // `items` porte TOUT le butin (prise principale + éventuel butin d'embuscade) ;
  // `item` reste la prise principale, pour l'affichage du rapport.
  const items: Omit<Item, 'id'>[] = [];
  let item: Omit<Item, 'id'> | null = null;
  let key = 0;
  if (poi.type === 'lair' && poi.setId) {
    item = rollSetPiece(rng, { setId: poi.setId, level: poi.level, luck: 0.6, playerLevel });
    key = rng() < 0.2 ? 1 : 0;
  } else if (poi.type === 'camp') {
    item = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: poi.level,
      luck: 0.4,
      spread: 1,
      playerLevel,
    });
    key = rng() < 0.1 ? 1 : 0;
  }
  if (item) items.push(item);
  let gold = goldHaul;
  let dust = dustHaul;
  let enchantScrolls = scrollHaul;
  // ÉNERGIE : les MINES rendent un peu d'énergie de jeu (∝ niveau × temps de trajet)
  // → un revenu d'énergie passif, complément du sport, qui adoucit le pincement de
  // fin de partie (le coût des runs monte plus vite que l'énergie/séance). Mines seules.
  const energy =
    poi.type === 'mine'
      ? Math.min(
          EXPE.mineEnergyMax,
          Math.round((4 + poi.level * 1.5) * Math.min(tf, EXPE.mineEnergyTfCap)),
        )
      : 0;
  let text = pick(rng, WIN_TEXT[poi.type]);
  // Rencontres de trajet — MÊME helper que les récoltes (aller ET retour), pour ne pas
  // maintenir deux fois la même règle.
  const tr = rollTravelEncounters(rng, hero, poi, seed, playerLevel);
  gold = Math.round(gold * tr.goldMult);
  dust = Math.round(dust * tr.resMult);
  enchantScrolls = Math.round(enchantScrolls * tr.resMult);
  returnMult = tr.returnMult;
  items.push(...tr.drops);
  key += tr.keys;
  text += tr.text;
  return {
    win: true,
    gold,
    dust,
    scrap: 0,
    energy,
    enchantScrolls,
    // Les devises vivantes viennent surtout des POI DÉDIÉS (well/shrine/archive) : ici
    // un simple filet, pour que ces sorties ne soient pas totalement muettes.
    summonStones: poi.type === 'lair' ? 1 + Math.floor(poi.level / 12) : 0,
    fragments: poi.type === 'mine' ? Math.round((3 + poi.level * 0.4) * tf) : 0,
    inkDust: 0,
    item: items[0] ?? null,
    items,
    key,
    reconBonus: 0,
    returnMult,
    text,
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
/** Contour irrégulier fermé. ⚠️ Son rayon ne descend JAMAIS sous `r × COAST.min` : c'est
 *  ce plancher qui garantit que les POI restent sur la terre ferme (cf. `landRadius`).
 *  Avant, le rayon variait de 0,74 à 1,20 × r — la côte pinçait donc jusqu'à ~65 alors
 *  que les POI allaient jusqu'à 88 : ceux tombés dans un renfoncement flottaient en mer. */
function blobPath(rng: () => number, cx: number, cy: number, r: number, n: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (COAST.min + rng() * COAST.span);
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

/** Réglages du littoral. `min`/`span` = fraction du rayon nominal : le contour va donc de
 *  `min` à `min + span`. Le PLANCHER est ce qui compte — c'est lui qui garantit la terre
 *  ferme sous les POI. */
export const COAST = { r: 0.44, min: 0.86, span: 0.28, pinch: 0.988 } as const;

/** Rayon de terre ferme GARANTI autour de la ville. La courbe de côte étant tracée en
 *  Bézier par les milieux des points de contrôle, elle passe légèrement en deçà du
 *  plancher entre deux points bas : `pinch` l'encaisse. Tout POI doit tenir là-dedans. */
export function landRadius(): number {
  return EXPE.mapSize * COAST.r * COAST.min * COAST.pinch;
}

/** Terrain de la carte (déterministe pour un `seed`) : côte + reliefs + rivières (encre). */
export function expeditionTerrain(seed: number): Terrain {
  const rng = mulberry32(seed >>> 0 || 1);
  const C = EXPE.mapSize / 2; // centre de la carte
  // Continent : grand contour irrégulier, très découpé (détaillé).
  const coast = blobPath(rng, C, C, EXPE.mapSize * COAST.r, 20);
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
  playerLevel?: number, // cap anti-runaway sur le rang des drops
): ActiveExpedition {
  const oneWayMs = Math.round(travelOneWayMin(poi.level, poi.distNorm) * 60_000 * travelMult);
  const outcome = resolveOutcome(hero, poi, seed, playerLevel);
  // Seule la jambe RETOUR bouge : l'aller et le dépôt du rapport (midAt) restent intacts,
  // le héros a bien atteint l'objectif avant que la route ne décide de sa vitesse.
  const backMs = Math.round(oneWayMs * (outcome.returnMult || 1));
  return {
    poi,
    sentAt: now,
    midAt: now + oneWayMs,
    returnAt: now + oneWayMs + backMs,
    goldCost: goldCost(poi.type, poi.level),
    seed: seed >>> 0 || 1,
    outcome,
  };
}
