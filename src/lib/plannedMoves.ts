/**
 * ⏳ LES RENFORTS PROGRAMMÉS (2026-09-30, demandé : « programmer un renfort ou un déplacement,
 * en déterminant dans combien de temps il part — si une attaque arrive dans 1 h 30, on les
 * envoie dans 1 h 25 »). Décisions de l'utilisateur :
 * - on programme ce que la feuille de renfort envoie : champions et miliciens de la base,
 *   membres d'autres lieux tenus (transferts) ;
 * - en attendant, ils sont RÉSERVÉS mais restent en poste — ceux de la base défendent la base,
 *   ceux d'un lieu défendent leur lieu — et on peut annuler ;
 * - à l'heure dite, ceux qui PEUVENT partir partent ; les autres sont annulés, et un message
 *   dit qui et pourquoi.
 *
 * ⚠️ Cette lib ne décide que du CALENDRIER et des RÉSERVATIONS. Le départ lui-même passe par
 * les actions ordinaires du store (`reinforceControlPoint`, `sendMilitiaToControl`,
 * `transferControlGarrison`), appelées à l'HEURE DU DÉPART : trajet, places et refus sont
 * donc exactement ceux d'un renfort parti à la main à cet instant.
 */
import { MILITIA_PREFIX } from '@/lib/militia';
import type { ReinfSelection } from '@/lib/reinforceSelection';
import type { Outing } from '@/lib/siegePresence';

export interface PlannedMove {
  id: string;
  /** Le lieu fixe visé. */
  toId: string;
  createdAt: number;
  departAt: number;
  /** Champions de la base. */
  champs: string[];
  /** Miliciens de la base (anonymes). */
  militia: number;
  /** Membres d'autres lieux tenus. */
  transfers: { fromId: string; id: string }[];
  /** 🏠 UN RETOUR PROGRAMMÉ (2026-09-30, demandé : « quand je fais rappel depuis le lieu fixe,
   *  il faut que je puisse le programmer ») : ces membres de la garnison de `toId` rentrent à
   *  la base à `departAt`. Absent = un renfort. En attendant ils restent en poste. */
  recall?: string[];
  /** 🏠 Le rappel de TOUTE la garnison (la réserve est récoltée au départ). */
  whole?: boolean;
}

/** On ne programme pas au-delà de ce délai : un départ si lointain ne veut plus rien dire
 *  face à des attaques tirées à 1-3 jours. */
export const PLAN_MAX_DELAY_MS = 48 * 3600_000;

/** Relit la colonne (JSONB) : absent ou malformé → rien ; une entrée incomplète est écartée. */
export function normalizePlanned(raw: unknown): PlannedMove[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m): PlannedMove[] => {
    if (!m || typeof m !== 'object') return [];
    const o = m as Partial<PlannedMove>;
    if (typeof o.id !== 'string' || typeof o.toId !== 'string') return [];
    if (typeof o.departAt !== 'number' || !Number.isFinite(o.departAt)) return [];
    return [
      {
        id: o.id,
        toId: o.toId,
        createdAt: typeof o.createdAt === 'number' ? o.createdAt : o.departAt,
        departAt: o.departAt,
        champs: Array.isArray(o.champs) ? o.champs.filter((x) => typeof x === 'string') : [],
        militia: Math.max(0, Math.floor(Number(o.militia) || 0)),
        transfers: Array.isArray(o.transfers)
          ? o.transfers.filter(
              (t): t is { fromId: string; id: string } =>
                !!t && typeof t.fromId === 'string' && typeof t.id === 'string',
            )
          : [],
        ...(Array.isArray(o.recall)
          ? { recall: o.recall.filter((x): x is string => typeof x === 'string') }
          : {}),
        ...(o.whole === true ? { whole: true } : {}),
      },
    ];
  });
}

/** Un départ programmé depuis une sélection de la feuille de renfort. */
export function makePlannedMove(
  sel: ReinfSelection,
  toId: string,
  now: number,
  delayMs: number,
): PlannedMove {
  const d = Math.max(0, Math.min(PLAN_MAX_DELAY_MS, Math.round(delayMs)));
  return {
    id: `plan_${now}_${toId}`,
    toId,
    createdAt: now,
    departAt: now + d,
    champs: [...sel.champs],
    militia: sel.militia,
    transfers: sel.transfers.map((t) => ({ ...t })),
  };
}

/** 🏠 Un retour programmé : `ids` quittent la garnison de `pointId` dans `delayMs`. */
export function makePlannedRecall(
  pointId: string,
  ids: readonly string[],
  whole: boolean,
  now: number,
  delayMs: number,
): PlannedMove {
  const d = Math.max(0, Math.min(PLAN_MAX_DELAY_MS, Math.round(delayMs)));
  return {
    id: `plan_${now}_back_${pointId}`,
    toId: pointId,
    createdAt: now,
    departAt: now + d,
    champs: [],
    militia: 0,
    transfers: [],
    recall: [...ids],
    ...(whole ? { whole: true } : {}),
  };
}

/** Est-ce un retour programmé (et non un renfort) ? */
export const isPlannedRecall = (m: PlannedMove): boolean => !!m.recall;

/** Les départs échus (le plus ancien d'abord) et ceux qui attendent encore. */
export function planDue(
  list: readonly PlannedMove[],
  now: number,
): { due: PlannedMove[]; rest: PlannedMove[] } {
  const due = list.filter((m) => m.departAt <= now).sort((a, b) => a.departAt - b.departAt);
  return { due, rest: list.filter((m) => m.departAt > now) };
}

/** Les miliciens de la base réservés par des départs programmés. */
export const plannedMilitia = (list: readonly PlannedMove[]): number =>
  list.reduce((n, m) => n + m.militia, 0);

/** Les champions de la base réservés. */
export const plannedChamps = (list: readonly PlannedMove[]): Set<string> =>
  new Set(list.flatMap((m) => m.champs));

/** Les membres de lieux tenus réservés (champions ou miliciens postés) : ceux qu'un renfort
 *  programmé transférera, et ceux qu'un retour programmé ramènera. */
export const plannedTransferIds = (list: readonly PlannedMove[]): Set<string> =>
  new Set(list.flatMap((m) => [...m.transfers.map((t) => t.id), ...(m.recall ?? [])]));

/** Les places qu'occupent, sur le lieu `toId`, les départs programmés vers lui. */
export function plannedSeatsTo(
  list: readonly PlannedMove[],
  toId: string,
): { champ: number; total: number } {
  let champ = 0;
  let total = 0;
  for (const m of list) {
    if (m.toId !== toId) continue;
    const tChamps = m.transfers.filter((t) => !t.id.startsWith(MILITIA_PREFIX)).length;
    champ += m.champs.length + tChamps;
    total += m.champs.length + m.militia + m.transfers.length;
  }
  return { champ, total };
}

/** Le nombre de membres d'un départ programmé. */
export const plannedCount = (m: PlannedMove): number =>
  m.champs.length + m.militia + m.transfers.length + (m.recall?.length ?? 0);

/**
 * 🏰 La présence au siège : un champion de la base réservé est À LA MAISON jusqu'à son départ
 * (il défend) — le patron des attaques combinées (`attackOutings`). Sa réservation pose
 * `busyUntil = departAt` ; ce voyage « parti à departAt » dit à `advsHomeAt` d'ignorer ce
 * `busyUntil` pour un siège d'AVANT le départ.
 */
export function plannedOutings(list: readonly PlannedMove[]): Outing[] {
  return list
    .filter((m) => m.champs.length)
    .map((m) => ({ sentAt: m.departAt, returnAt: m.departAt, escort: m.champs, hero: false }));
}
