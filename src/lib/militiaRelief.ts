/**
 * 🛡️ LA RELÈVE DES MILICIENS (demandé : « où sont les miliciens qui remplacent les morts ? » —
 * puis « oui » au départ automatique, puis « ils doivent se refaire sur l'île en cours pour
 * retourner en garnison là où il y a eu les pertes »). Un milicien tombé en DÉFENDANT un point
 * tenu laisse une place que la base rebouche d'elle-même : le point note combien lui sont dus
 * (`ControlState.militiaOwed`), la Caserne les refait même au-dessus de son plafond
 * (`produceMilitia`, `owed`), et dès qu'elle en a à la base, ils partent seuls vers ce point, au
 * trajet d'un envoi manuel (`sendMilitiaToControl`).
 *
 * 📜 La dette se lit dans le rapport de la DERNIÈRE défense gardé sur le lieu (`lastAttack`),
 * une seule fois par rapport (`reliefSeen`) : une seule source, qui rattrape aussi les pertes
 * d'avant cette règle. Le tick règle la relève AVANT toute nouvelle reprise, donc aucun rapport
 * n'est recouvert avant d'avoir été lu.
 *
 * ⚠️ Seules les places PERDUES au combat sont reprises : un point qu'on a vidé exprès ne
 * rappelle personne. Une place reprise à la main entre-temps n'est plus due ; un point perdu
 * efface sa dette (`loseControl` repart d'un état neuf).
 *
 * ⚠️ PUR : rend un nouvel état, le store écrit.
 */
import { militiaFreeSeats, reinforceControl } from './controlPoints';
import { CROSSING, nextCrossingDeparture } from './crossing';
import type { ControlState, Crossing, ExpeditionMap, Poi } from './expedition';
import { takeMilitia, type MilitiaState } from './militia';
import { militiaSailingToPoint } from './militiaSea';

/** Les miliciens tombés dans la dernière défense TENUE du point, pas encore comptés. Un
 *  rapport d'avant la prise du lieu (`since`) n'est pas le nôtre. */
function freshLosses(c: ControlState): { n: number; id: string } | null {
  const r = c.lastAttack;
  if (!r || r.id === c.reliefSeen || !r.win || !r.party?.defense) return null;
  if ((r.resolvedAt ?? 0) < (c.since ?? 0)) return null;
  const n = r.party.militiaLost?.length ?? 0;
  return n > 0 ? { n, id: r.id } : null;
}

/** Écrit la dette d'un point (clé ABSENTE à zéro : la carte se compare par JSON). */
function withOwed(map: ExpeditionMap, id: string, owed: number, seen?: string): ExpeditionMap {
  return {
    ...map,
    pois: map.pois.map((p) => {
      if (p.id !== id || !p.control) return p;
      const c = { ...p.control };
      if (owed > 0) c.militiaOwed = owed;
      else delete c.militiaOwed;
      if (seen) c.reliefSeen = seen;
      return { ...p, control: c };
    }),
  };
}

/** 🏭 Les miliciens dus aux points tenus de la carte : ce que la Caserne doit refaire, plafond
 *  ou non. ⛵ Les dettes des îles RANGÉES comptent aussi : leurs morts sont refaits à la base de
 *  l'île en cours, puis traversent (`sailRelief`). */
export function militiaOwedOn(
  map: Pick<ExpeditionMap, 'pois' | 'islands'> | null | undefined,
): number {
  let n = 0;
  for (const p of map?.pois ?? [])
    if (p.control?.owner === 'player') n += p.control.militiaOwed ?? 0;
  for (const im of Object.values(map?.islands ?? {})) n += militiaOwedOn({ pois: im.pois });
  return n;
}

/** ⛵ Note `n` miliciens tombés sur un lieu tenu d'une île RANGÉE (aucun tick ne la lit comme
 *  l'île active) : ils sont dus, et le rapport est marqué vu pour que le retour sur l'île ne les
 *  compte pas une seconde fois. Rend la MÊME carte si le lieu n'est plus à nous. */
export function noteStoredLosses(
  map: ExpeditionMap,
  id: string,
  n: number,
  reportId: string,
): ExpeditionMap {
  const c = map.pois.find((p) => p.id === id)?.control;
  if (!c || c.owner !== 'player' || n <= 0) return map;
  return withOwed(map, id, (c.militiaOwed ?? 0) + n, reportId);
}

/** ⛵ La relève des îles rangées : de la base de l'île en cours, vers chaque lieu tenu qui doit
 *  des miliciens (autant que la dette, les places libres — celles gardées pour ceux déjà en mer
 *  comprises — et la base le permettent). Même mer que `shipMilitiaToPoint` : 2 h, ils entrent
 *  dans le lieu à l'accostage. */
function sailRelief(
  map: ExpeditionMap,
  militia: MilitiaState,
  now: number,
): { map: ExpeditionMap; militia: MilitiaState; sent: { id: string; n: number }[] } | null {
  const active = map.archipel?.island;
  if (active === undefined || !map.islands) return null;
  let out = map;
  let state = militia;
  let changed = false;
  const sent: { id: string; n: number }[] = [];
  for (const [k, im] of Object.entries(map.islands)) {
    const island = Number(k);
    if (island === active) continue;
    let cur = im;
    for (const p of im.pois) {
      const c = p.control;
      if (c?.owner !== 'player' || !c.militiaOwed) continue;
      const free = Math.max(0, militiaFreeSeats(c) - militiaSailingToPoint(out, island, p.id));
      const n = Math.min(c.militiaOwed, free, state.home);
      const took = n > 0 ? takeMilitia(state, n) : null;
      if (took) {
        state = took.state;
        const departAt = nextCrossingDeparture(now);
        const sail: Crossing = {
          from: active,
          to: island,
          bookedAt: now,
          departAt,
          arriveAt: departAt + CROSSING.travelMs,
          ids: [],
          militia: n,
          militiaTo: p.id,
        };
        out = { ...out, sailings: [...(out.sailings ?? []), sail] };
        sent.push({ id: p.id, n });
      }
      const left = Math.max(0, Math.min(c.militiaOwed, free) - n);
      if (left !== c.militiaOwed) {
        cur = withOwed(cur, p.id, left);
        changed = true;
      }
    }
    if (cur !== im) out = { ...out, islands: { ...out.islands, [k]: cur } };
  }
  return changed ? { map: out, militia: state, sent } : null;
}

/**
 * 🚶 Note les pertes des derniers rapports, puis fait partir de la base les miliciens dus,
 * point par point dans l'ordre de la carte : autant que la dette, les places de milice encore
 * libres et la base le permettent. La dette ne dépasse jamais les places libres (une place
 * reprise à la main n'est plus due). `null` si rien ne change.
 */
export function militiaRelief(
  map: ExpeditionMap,
  militia: MilitiaState,
  now: number,
  /** Durée du trajet base → point (ms). */
  legMs: (p: Poi) => number,
): { map: ExpeditionMap; militia: MilitiaState; sent: { id: string; n: number }[] } | null {
  let out = map;
  let state = militia;
  let changed = false;
  const sent: { id: string; n: number }[] = [];
  for (const p of map.pois) {
    const c = p.control;
    if (c?.owner !== 'player') continue;
    const fresh = freshLosses(c);
    const owed = (c.militiaOwed ?? 0) + (fresh?.n ?? 0);
    if (owed <= 0 && !fresh) continue;
    const free = militiaFreeSeats(c);
    const n = Math.min(owed, free, state.home);
    const took = takeMilitia(state, n);
    if (took) {
      state = took.state;
      out = reinforceControl(out, p.id, took.ids, now + legMs(p), now);
      sent.push({ id: p.id, n });
    }
    const left = Math.max(0, Math.min(owed, free) - n);
    if (left !== (c.militiaOwed ?? 0) || took || fresh) {
      out = withOwed(out, p.id, left, fresh?.id);
      changed = true;
    }
  }
  const sea = sailRelief(out, state, now);
  if (sea) return { map: sea.map, militia: sea.militia, sent: [...sent, ...sea.sent] };
  return changed ? { map: out, militia: state, sent } : null;
}
