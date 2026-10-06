/**
 * 🗺️ LES MOUVEMENTS ENNEMIS CALÉS SUR TES SORTIES (v1.66.0 pour l'île 4, étendu en v1.67.0 ;
 * décision de l'utilisateur : « caler les événements d'attaque ou autres mouvements ennemis sur
 * le nombre d'expéditions, comme les nids, avec un nombre un peu aléatoire »). Le patron de
 * `spawnNests` :
 * - chaque sortie sur la carte, comptée À SON ARRIVÉE (`map.departures` ; un demi-tour est
 *   retiré, `forgetDeparture`), charge le compteur de l'événement ; au seuil, tiré entre `min`
 *   et `max`, l'événement part à l'arrivée de CETTE sortie. Qui ne sort pas ne voit rien venir
 *   de ce côté : on ne punit pas l'absence (règle 1 des sièges) ;
 * - `scale` multiplie le seuil ET l'écart minimal : moins d'ennemis debout, citadelle cachée,
 *   lieu d'île « attaqué de temps en temps »… (chaque appelant dit le sien) ;
 * - ⚠️ PLAFOND : jamais deux départs à moins de `minGapMs` × `scale`. C'est le rythme le PLUS
 *   SOUTENU de l'ancienne horloge : un joueur très actif n'en voit jamais plus qu'avant, le
 *   compteur ne fait que ralentir celui qui sort peu. La charge attend la sortie suivante ;
 * - les sorties d'avant la première lecture ne comptent pas (l'horloge part de maintenant).
 *
 * Module à part : `controlPoints` (reprises, citadelles) et `islandConquest` (îles) le lisent,
 * et le second importe déjà le premier.
 */
import { mulberry32, seedOf } from './combat';
import type { ExpeditionMap, SortieClock } from './expedition';

export const SORTIE_EVENTS = {
  /** 🚩 Île 4 : l'armée du seigneur de guerre (avant : 36 h / camps debout). */
  warlord: { min: 3, max: 5, minGapMs: 12 * 3600_000 },
  /** 🐫 Île 4 : un convoi de ravitaillement (avant : 24 h / camps debout). */
  convoy: { min: 2, max: 4, minGapMs: 8 * 3600_000 },
  /** 🔮 Île 5 : une invasion combinée, sur TOUS les lieux tenus (avant : 72 h / sanctuaires). */
  invasion: { min: 6, max: 10, minGapMs: 24 * 3600_000 },
  /** ⚔️ Une reprise rapprochée sur un lieu tenu (avant : 1 à 3 j selon les sorties de la
   *  semaine). Le délai calme de fond (`retakeCalmMs`) reste, c'est le plancher. */
  retake: { min: 2, max: 4, minGapMs: 24 * 3600_000 },
  /** 🏯 Un raid de citadelle découverte (avant : 1 à 4 j selon les sorties de la semaine). */
  raid: { min: 2, max: 4, minGapMs: 24 * 3600_000 },
} as const;
export type SortieKind = keyof typeof SORTIE_EVENTS;

/** L'attente d'une armée entre sa sortie et le début de sa marche (ou de son assaut). */
const ENEMY_WAIT = { minMs: 3600_000, maxMs: 3 * 3600_000 } as const;

/** Combien de sorties avant le `n`-ième événement `kind` (graine : la carte et `key`). */
export function sortieThreshold(
  seed: number,
  kind: SortieKind,
  n: number,
  scale = 1,
  key: string = kind,
): number {
  const c = SORTIE_EVENTS[kind];
  const r = mulberry32((seedOf(`${seed}:sortie:${key}:${n}`) ^ 0x4b1d7a3f) >>> 0 || 1)();
  const span = c.max - c.min + 1;
  const drawn = c.min + Math.min(span - 1, Math.floor(r * span));
  return Math.max(1, Math.round(drawn * Math.max(0.1, scale)));
}

/** L'écart minimal entre deux départs de `kind`. */
export function sortieMinGapMs(kind: SortieKind, scale = 1): number {
  return SORTIE_EVENTS[kind].minGapMs * Math.max(0.1, scale);
}

/** Une horloge neuve, qui part de `now` (les sorties passées ne comptent pas). */
export function freshSortieClock(now: number, last?: number): SortieClock {
  return { from: now, charge: 0, fired: 0, ...(last !== undefined ? { last } : {}) };
}

/**
 * 🗺️ Les instants où `kind` part entre la dernière sortie lue et `now`, et l'horloge à garder.
 * Sans horloge (première lecture) : aucun, et l'horloge part de `now`. Rend la MÊME horloge
 * quand aucune sortie n'est arrivée.
 */
export function sortieFires(
  map: Pick<ExpeditionMap, 'departures' | 'seed'>,
  clock: SortieClock | undefined,
  kind: SortieKind,
  now: number,
  scale = 1,
  key: string = kind,
): { times: number[]; clock: SortieClock } {
  if (!clock) return { times: [], clock: freshSortieClock(now) };
  const fresh = (map.departures ?? [])
    .filter((t) => t > clock.from && t <= now)
    .sort((x, y) => x - y);
  if (!fresh.length) return { times: [], clock };
  const gap = sortieMinGapMs(kind, scale);
  let { charge, fired, last } = clock;
  const times: number[] = [];
  for (const t of fresh) {
    charge++;
    if (charge < sortieThreshold(map.seed, kind, fired, scale, key)) continue;
    if (last !== undefined && t < last + gap) continue;
    times.push(t);
    charge = 0;
    fired++;
    last = t;
  }
  return {
    times,
    clock: {
      from: fresh[fresh.length - 1]!,
      charge,
      fired,
      ...(last !== undefined ? { last } : {}),
    },
  };
}

/** L'attente tirée d'une armée sortie à `at` (graine : `key`). */
export function enemyWaitMs(key: string, at: number): number {
  const r = mulberry32((seedOf(`${key}:wait:${at}`) ^ 0x51c3e2d7) >>> 0 || 1)();
  return ENEMY_WAIT.minMs + r * (ENEMY_WAIT.maxMs - ENEMY_WAIT.minMs);
}
