/**
 * 🔙 RAPPELER À LA BASE (2026-10-07, demandé : « depuis la base je dois pouvoir rappeler des
 * champions ou le héros, pour la défense par exemple »).
 *
 * Qui est DEHORS, où, quand il rentrerait sans rien faire, et quand il serait là si on le
 * rappelle maintenant — avec, quand une armée est en vue, s'il arriverait AVANT elle.
 *
 * ⚠️ AUCUNE RÈGLE NOUVELLE : un voyage rebrousse chemin par `recallBlocker` / `recallVoyage`
 * (la règle du demi-tour de la carte), un poste se quitte par les fonctions du store
 * (`releaseControlChampions`, `recallHeroFromPost`). Les heures d'arrivée de ces deux-là
 * viennent de l'appelant (`arrivals`), qui les calcule avec les MÊMES fonctions que le
 * rappel : l'écran ne peut pas annoncer une heure que le rappel ne tiendrait pas.
 */
import type { ActiveExpedition, ExpeditionMap, Poi } from './expedition';
import type { Adventurer } from './adventurers';
import {
  recallBlocker,
  recallVoyage,
  tripCrew,
  RECALL_BLOCK_LABEL,
  type ActiveParty,
  type RecallTarget,
} from './party';
import { heroPostOf } from './islandConquest';
import { heroDefends } from './raid';

/** Ce que le bouton « Rappeler » déclenche. */
type HomeRecallAction =
  | { kind: 'trip'; target: RecallTarget }
  | { kind: 'post'; pointId: string; advId: string }
  | { kind: 'heroPost' };

export interface HomeRecallLine {
  key: string;
  hero: boolean;
  /** Les champions concernés (les compagnons du héros compris). */
  advIds: string[];
  /** Le lieu où il est ou vers lequel il va (`null` : rappelé d'un poste, déjà en chemin). */
  poi: Poi | null;
  /** `going` : en route vers le lieu · `there` : sur place (poste) · `returning` : rentre. */
  state: 'going' | 'there' | 'returning';
  /** À la base sans rien faire (`null` : il y reste, posté ou en sortie). */
  homeAt: number | null;
  /** À la base si on le rappelle maintenant (`null` : le rappel n'est pas possible). */
  backAt: number | null;
  /** Pourquoi on ne peut pas le rappeler (absent si on peut, ou s'il rentre déjà). */
  why?: string;
  action: HomeRecallAction | null;
  /** Une armée en vue : sera-t-il là à temps si on le rappelle ? (`null` sans armée). */
  inTime: boolean | null;
  /** …et sans rien faire ? */
  inTimeAnyway: boolean | null;
}

export interface HomeRecallInput {
  now: number;
  /** L'heure de l'assaut en approche, s'il y en a un. */
  raidAt: number | null;
  expedition: ActiveExpedition | null | undefined;
  parties: readonly ActiveParty[];
  map: ExpeditionMap | null | undefined;
  advs: readonly Adventurer[];
  /** L'arrivée à la base d'un champion rappelé de son poste (ou de sa route vers lui) ;
   *  `toBase: false` = un transfert qui retournerait sur son point d'origine. */
  postArrival: (pointId: string, advId: string) => { at: number; toBase: boolean } | null;
  /** L'arrivée à la base du héros rappelé de son poste (ou de sa route vers lui). */
  heroPostArrival: () => number | null;
}

const verdict = (at: number | null, raidAt: number | null): boolean | null =>
  raidAt === null ? null : at !== null && heroDefends(false, at, raidAt);

function line(
  base: Omit<HomeRecallLine, 'inTime' | 'inTimeAnyway'>,
  raidAt: number | null,
): HomeRecallLine {
  return {
    ...base,
    inTime: verdict(base.backAt, raidAt),
    inTimeAnyway: verdict(base.homeAt, raidAt),
  };
}

/** Un voyage (le héros ou une équipe) : demi-tour par la règle de la carte. */
function tripLine(
  v: ActiveExpedition,
  key: string,
  hero: boolean,
  target: RecallTarget,
  now: number,
  raidAt: number | null,
): HomeRecallLine {
  const returning = now >= v.midAt;
  // Une SORTIE d'un lieu fixe rentre sur son poste, pas à la base.
  const toPost = !!v.homeId;
  // ⚔️🧭 Un voyage d'une attaque combinée lancée se rappelle avec tout son groupe (`recallTrip`).
  const group = { group: !!(v.crew || v.wingOf) };
  const block = recallBlocker(v, now, group);
  const back = !returning && !block && !toPost ? recallVoyage(v, now, group) : null;
  return line(
    {
      key,
      hero,
      advIds: tripCrew(v),
      poi: v.poi,
      state: returning ? 'returning' : 'going',
      homeAt: toPost ? null : v.returnAt,
      backAt: back ? back.returnAt : null,
      ...(returning
        ? {}
        : toPost
          ? { why: 'sortie d’un lieu fixe : elle rentre sur son poste' }
          : block
            ? { why: RECALL_BLOCK_LABEL[block] }
            : {}),
      action: back ? { kind: 'trip', target } : null,
    },
    raidAt,
  );
}

/** 🔙 Tous ceux qui sont DEHORS, le héros d'abord, puis du plus vite rentré au plus lent. */
export function homeRecallLines(i: HomeRecallInput): HomeRecallLine[] {
  const { now, raidAt } = i;
  const out: HomeRecallLine[] = [];
  const e = i.expedition;
  if (e && now < e.returnAt) out.push(tripLine(e, 'hero', true, { kind: 'hero' }, now, raidAt));
  for (const g of i.parties) {
    if (now >= g.returnAt) continue;
    out.push(tripLine(g, 'g' + g.id, false, { kind: 'party', id: g.id }, now, raidAt));
  }
  const map = i.map;
  if (map) {
    // 🧝 Le héros posté, en route vers son poste, ou déjà rappelé.
    const post = heroPostOf(map);
    const coming = map.pois.find((p) => p.control?.owner === 'player' && !!p.control.heroComing);
    if (post || coming) {
      const at = i.heroPostArrival();
      out.push(
        line(
          {
            key: 'heroPost',
            hero: true,
            advIds: [],
            poi: (post ?? coming)!,
            state: post ? 'there' : 'going',
            homeAt: null,
            backAt: at,
            action: at !== null ? { kind: 'heroPost' } : null,
          },
          raidAt,
        ),
      );
    } else if (map.heroReturnAt !== undefined && map.heroReturnAt > now && !e) {
      out.push(
        line(
          {
            key: 'heroBack',
            hero: true,
            advIds: [],
            poi: null,
            state: 'returning',
            homeAt: map.heroReturnAt,
            backAt: null,
            action: null,
          },
          raidAt,
        ),
      );
    }
    // 🏰 Les champions postés (ou en route vers leur poste), un par ligne : chacun se rappelle
    // seul, au pas qu'on lui annonce.
    for (const p of map.pois) {
      const c = p.control;
      if (!c || c.owner !== 'player') continue;
      for (const a of i.advs) {
        if (a.posted !== p.id) continue;
        const going = (c.reinforcing ?? []).some((r) => r.id === a.id);
        const arr = i.postArrival(p.id, a.id);
        const home = arr && arr.toBase ? arr.at : null;
        out.push(
          line(
            {
              key: `p${p.id}:${a.id}`,
              hero: false,
              advIds: [a.id],
              poi: p,
              state: going ? 'going' : 'there',
              homeAt: null,
              backAt: home,
              ...(arr && !arr.toBase
                ? { why: 'transfert : il repartirait vers son lieu d’origine' }
                : !arr
                  ? { why: 'il arrive à son poste' }
                  : {}),
              action: home !== null ? { kind: 'post', pointId: p.id, advId: a.id } : null,
            },
            raidAt,
          ),
        );
      }
      // 🏠 Ceux déjà rappelés de ce point, en chemin vers la base.
      for (const r of c.returning ?? []) {
        if (r.at <= now || !i.advs.some((a) => a.id === r.id)) continue;
        out.push(
          line(
            {
              key: `r${p.id}:${r.id}`,
              hero: false,
              advIds: [r.id],
              poi: p,
              state: 'returning',
              homeAt: r.at,
              backAt: null,
              action: null,
            },
            raidAt,
          ),
        );
      }
    }
  }
  const when = (l: HomeRecallLine) => l.backAt ?? l.homeAt ?? Infinity;
  return out.sort((a, b) => Number(b.hero) - Number(a.hero) || when(a) - when(b));
}

/** ⚔️ Les rappels qui ramènent quelqu'un AVANT l'assaut alors qu'il ne le serait pas sinon :
 *  ce que fait « Rappeler tous ceux qui arrivent à temps ». */
export function usefulRecalls(lines: readonly HomeRecallLine[]): HomeRecallLine[] {
  return lines.filter((l) => l.action && l.inTime === true && l.inTimeAnyway !== true);
}
