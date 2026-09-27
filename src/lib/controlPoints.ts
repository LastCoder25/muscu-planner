/**
 * 🏰 LES POINTS DE CONTRÔLE — des lieux FIXES qu'on prend à l'ennemi et qu'il vient reprendre
 * (2026-09-27, décisions de l'utilisateur, cf. mémoire `carte-lieux-controle`).
 *
 * - **Fixes** : toujours au même endroit (dérivé de la graine de la carte), dans le disque
 *   révélé dès le départ. ⚠️ Leur RANG est TIRÉ, jamais lié à la distance (la carte n'a plus
 *   de « faible près, fort loin »), et RE-TIRÉ à chaque reprise ennemie.
 * - **Prise** : une équipe de 1 à 3 champions, SANS le héros, livre le combat d'un camp
 *   (`resolveCamp`). Gagnée, l'équipe RESTE : elle devient la garnison, et ses champions
 *   sont indisponibles (missions, défense de la base) tant qu'ils y sont postés.
 * - **Production** : tant qu'elle est tenue, la mine produit de l'or (plus la garnison est
 *   nombreuse, plus elle produit), dans une réserve plafonnée qu'on vient récolter.
 * - **Reprise** : l'ennemi attaque à un instant ALÉATOIRE entre 1 et 3 jours après la prise
 *   (ou la dernière défense), avec une force ALÉATOIRE — il ne gagne pas toujours. Repoussé :
 *   XP pour la garnison, et une nouvelle attaque se prépare. Vainqueur : la garnison part à
 *   l'infirmerie, le lieu redevient ennemi, son rang est re-tiré.
 *
 * ⚠️ PUR : toutes les fonctions rendent un nouvel état, le store écrit.
 */
import { mulberry32, seedOf } from './combat';
import {
  CAMP_FACTIONS,
  CONTROL_MAX_GARRISON,
  EXPE,
  distNormAt,
  harvestGold,
  revealRadius,
  riftLevelFor,
  type ControlKind,
  type ControlState,
  type ExpeditionMap,
  type Poi,
} from './expedition';

export const CONTROL = {
  /** Les points de contrôle de la carte (étape 1 : la mine d'or). */
  kinds: ['mine'] as readonly ControlKind[],
  /** Où ils se posent : cette fraction du rayon révélé SANS Avant-poste — visible dès le
   *  début, quel que soit l'Avant-poste. */
  distFrac: 0.62,
  /** Délai avant une reprise ennemie : entre 1 et 3 jours (décision de l'utilisateur). */
  retakeMinMs: 24 * 3600_000,
  retakeMaxMs: 72 * 3600_000,
  /** Force de la troupe ennemie, en champions de référence : tirée à chaque attaque.
   *  ⚠️ MESURÉE (`controlPoints.test`, niveau 30, 600 combats) : une garnison de 1, 2 ou 3
   *  champions de référence repousse **10 %, 58 % et 85 %** des attaques. Avec [1,5 → 3], 1
   *  champion ne tenait JAMAIS et 3 tenaient 94 % : poster un seul champion n'était pas un
   *  pari, et en poster trois n'avait plus de risque. */
  sizes: [1, 1.5, 2.5, 3.5] as readonly number[],
  /** Une garnison : 1 à 3 champions. */
  maxGarrison: CONTROL_MAX_GARRISON,
  /** ⛏️ Une garnison complète produit l'or d'une mission de mine de son rang toutes les
   *  `mineHoursPerHaul` heures. ⚠️ Ces champions ne font pas de missions pendant ce temps :
   *  le débit est calé pour valoir à peu près ce qu'ils auraient ramené en allant et venant. */
  mineHoursPerHaul: 8,
  /** Part de production selon l'effectif posté (index = nombre de champions). */
  garrisonShare: [0, 0.5, 0.8, 1] as readonly number[],
  /** Réserve plafonnée : au-delà de 24 h sans récolte, la mine ne produit plus. */
  storageMs: 24 * 3600_000,
  /** Préavis de la notification d'attaque. */
  warnMs: 2 * 3600_000,
} as const;

export const CONTROL_EMO: Record<ControlKind, string> = { mine: '⛏️' };

export const controlIdOf = (kind: ControlKind): string => `ctl_${kind}`;

/** La troupe ennemie d'un point — faction et force, TIRÉES sur une graine qui change à
 *  chaque reprise (sinon on affronterait toujours la même). */
function enemyForce(id: string, retakes: number): Pick<ControlState, 'faction' | 'size'> {
  const rng = mulberry32((seedOf(`${id}:${retakes}`) ^ 0x4f1bbcdc) >>> 0 || 1);
  return {
    faction: CAMP_FACTIONS[Math.floor(rng() * CAMP_FACTIONS.length)]!,
    size: CONTROL.sizes[Math.floor(rng() * CONTROL.sizes.length)]!,
  };
}

/** Le niveau (donc le rang) d'un point : tiré comme celui d'une faille — entre Bronze et le
 *  rang du joueur, jamais lié à la distance. Re-tiré à chaque reprise. */
function controlLevel(id: string, retakes: number, playerLevel: number): number {
  const rng = mulberry32((seedOf(`${id}:lv:${retakes}`) ^ 0x7a3d91c3) >>> 0 || 1);
  return riftLevelFor(rng, playerLevel, []);
}

/** Où se pose un point : FIXE, dérivé de la graine de la carte et du type. */
function controlSpot(map: ExpeditionMap, kind: ControlKind): Pick<Poi, 'x' | 'y' | 'distNorm'> {
  const i = CONTROL.kinds.indexOf(kind);
  const rng = mulberry32((map.seed ^ seedOf(`ctl:${kind}:${i}`)) >>> 0 || 1);
  const ang = rng() * Math.PI * 2;
  const d = EXPE.distMin + CONTROL.distFrac * (revealRadius(1) - EXPE.distMin);
  return {
    x: Math.round(EXPE.town.x + Math.cos(ang) * d),
    y: Math.round(EXPE.town.y + Math.sin(ang) * d),
    distNorm: distNormAt(d),
  };
}

/** Pose les points de contrôle MANQUANTS sur la carte (tenus par l'ennemi). Rend la même
 *  carte quand il ne manque rien : le store n'écrit pas à vide. */
export function ensureControls(
  map: ExpeditionMap,
  now: number,
  playerLevel: number,
): ExpeditionMap {
  const add: Poi[] = [];
  for (const kind of CONTROL.kinds) {
    const id = controlIdOf(kind);
    if (map.pois.some((p) => p.id === id)) continue;
    add.push({
      id,
      type: 'control',
      level: controlLevel(`${map.seed}:${id}`, 0, playerLevel),
      // Le trajet suit la DISTANCE (le lieu est fixe), pas le rang tiré.
      travelLevel: Math.max(1, playerLevel),
      ...controlSpot(map, kind),
      spawnedAt: now,
      expiresAt: EXPE.lifespanMs.control,
      control: {
        kind,
        owner: 'enemy',
        garrison: [],
        retakes: 0,
        ...enemyForce(`${map.seed}:${id}`, 0),
      },
    });
  }
  return add.length ? { ...map, pois: [...map.pois, ...add] } : map;
}

/** Délai avant la prochaine attaque, TIRÉ entre 1 et 3 jours (graine : le lieu et l'instant). */
export function retakeDelayMs(id: string, from: number): number {
  const r = mulberry32((seedOf(`${id}:atk:${from}`) ^ 0x2c1b3c6d) >>> 0 || 1)();
  return CONTROL.retakeMinMs + r * (CONTROL.retakeMaxMs - CONTROL.retakeMinMs);
}

/** Remplace un point dans la carte. */
function withControl(map: ExpeditionMap, id: string, f: (p: Poi) => Poi): ExpeditionMap {
  return { ...map, pois: map.pois.map((p) => (p.id === id && p.control ? f(p) : p)) };
}

/** 🏰 Une équipe part à l'assaut : on ne l'attaque pas deux fois. */
export function markAssault(map: ExpeditionMap, id: string, on: boolean): ExpeditionMap {
  return withControl(map, id, (p) => ({ ...p, control: { ...p.control!, assault: on } }));
}

/** 🏰 Pris ! L'équipe devient la garnison ; la production court ; la reprise se prépare. */
export function captureControl(
  map: ExpeditionMap,
  id: string,
  garrison: readonly string[],
  at: number,
): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: {
      ...p.control!,
      owner: 'player',
      garrison: garrison.slice(0, CONTROL.maxGarrison),
      since: at,
      collectedAt: at,
      attackAt: at + retakeDelayMs(id, at),
      assault: false,
    },
  }));
}

/** 🏰 Perdu (reprise ennemie ou abandon) : le lieu redevient ennemi, rang et troupe
 *  re-tirés. */
export function loseControl(map: ExpeditionMap, id: string, playerLevel: number): ExpeditionMap {
  return withControl(map, id, (p) => {
    const retakes = p.control!.retakes + 1;
    const next: ControlState = {
      kind: p.control!.kind,
      owner: 'enemy',
      garrison: [],
      retakes,
      ...enemyForce(`${map.seed}:${id}`, retakes),
    };
    return { ...p, level: controlLevel(`${map.seed}:${id}`, retakes, playerLevel), control: next };
  });
}

/** 🏰 Une attaque repoussée : la garnison reste, une nouvelle attaque se prépare. */
export function holdControl(map: ExpeditionMap, id: string, at: number): ExpeditionMap {
  return withControl(map, id, (p) => ({
    ...p,
    control: { ...p.control!, attackAt: at + retakeDelayMs(id, at) },
  }));
}

/** La troupe qui vient REPRENDRE le point — tirée sur l'instant de l'attaque. */
export function retakeForce(p: Poi): Pick<ControlState, 'faction' | 'size'> {
  return enemyForce(p.id, (p.control?.attackAt ?? 0) % 1_000_003);
}

/** ⛏️ L'or produit par heure pour une garnison de `n` champions. */
export function controlGoldPerHour(
  p: Pick<Poi, 'id' | 'level'>,
  n: number,
  playerLevel: number,
): number {
  const share = CONTROL.garrisonShare[Math.min(CONTROL.maxGarrison, Math.max(0, n))] ?? 0;
  const haul = harvestGold({ id: p.id, type: 'mine', level: p.level }, playerLevel);
  return (haul * share) / CONTROL.mineHoursPerHaul;
}

/** ⛏️ L'or en réserve à `now` (plafonné à `storageMs` de production). 0 si non tenu. */
export function controlStock(p: Poi, now: number, playerLevel: number): number {
  const c = p.control;
  if (!c || c.owner !== 'player' || c.collectedAt === undefined) return 0;
  const until = Math.min(now, c.attackAt ?? now);
  const ms = Math.min(CONTROL.storageMs, Math.max(0, until - c.collectedAt));
  return Math.floor((controlGoldPerHour(p, c.garrison.length, playerLevel) * ms) / 3600_000);
}

/** ⛏️ Récolte : l'or part, la réserve repart de l'instant de la récolte. */
export function collectControl(
  map: ExpeditionMap,
  id: string,
  now: number,
  playerLevel: number,
): { map: ExpeditionMap; gold: number } {
  const p = map.pois.find((x) => x.id === id);
  const gold = p ? controlStock(p, now, playerLevel) : 0;
  if (!p || gold <= 0) return { map, gold: 0 };
  return {
    map: withControl(map, id, (q) => ({ ...q, control: { ...q.control!, collectedAt: now } })),
    gold,
  };
}

/** Les points tenus dont l'attaque est DUE à `now`, de la plus ancienne à la plus récente. */
export function dueRetakes(map: ExpeditionMap | null, now: number): Poi[] {
  if (!map) return [];
  return map.pois
    .filter(
      (p) =>
        p.control?.owner === 'player' &&
        p.control.attackAt !== undefined &&
        p.control.attackAt <= now,
    )
    .sort((a, b) => a.control!.attackAt! - b.control!.attackAt!);
}

/** Les points tenus (pour les notifications et l'affichage). */
export function heldControls(map: ExpeditionMap | null): Poi[] {
  return map ? map.pois.filter((p) => p.control?.owner === 'player') : [];
}
