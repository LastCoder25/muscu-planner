/**
 * 🛡️ LA RELÈVE DES MILICIENS (demandé : « où sont les miliciens qui remplacent les morts ? » —
 * puis « oui » au départ automatique). Un milicien tombé en DÉFENDANT un point tenu laisse une
 * place que la base rebouche d’elle-même : le point note combien lui sont dus
 * (`ControlState.militiaOwed`), et dès que la Caserne en a à la base, ils partent seuls vers ce
 * point, au trajet d'un envoi manuel (`sendMilitiaToControl`).
 *
 * ⚠️ Seules les places PERDUES au combat sont reprises : un point qu'on a vidé exprès ne
 * rappelle personne. Une place reprise à la main entre-temps n'est plus due ; un point perdu
 * efface sa dette (`loseControl` repart d'un état neuf).
 *
 * ⚠️ PUR : rend un nouvel état, le store écrit.
 */
import { militiaFreeSeats, reinforceControl } from './controlPoints';
import type { ExpeditionMap, Poi } from './expedition';
import { takeMilitia, type MilitiaState } from './militia';

/** Écrit la dette d'un point (clé ABSENTE à zéro : la carte se compare par JSON). */
function withOwed(map: ExpeditionMap, id: string, owed: number): ExpeditionMap {
  return {
    ...map,
    pois: map.pois.map((p) => {
      if (p.id !== id || !p.control) return p;
      const c = { ...p.control };
      if (owed > 0) c.militiaOwed = owed;
      else delete c.militiaOwed;
      return { ...p, control: c };
    }),
  };
}

/** 💀 `n` miliciens sont tombés en défendant le point `id` : il les attend. Rien sur un point
 *  qui n'est pas à nous (rend la MÊME carte). */
export function oweMilitia(map: ExpeditionMap, id: string, n: number): ExpeditionMap {
  const c = map.pois.find((p) => p.id === id)?.control;
  if (n <= 0 || c?.owner !== 'player') return map;
  return withOwed(map, id, (c.militiaOwed ?? 0) + n);
}

/**
 * 🚶 Fait partir de la base les miliciens dus, point par point dans l'ordre de la carte :
 * autant que la dette, les places de milice encore libres et la base le permettent. La dette
 * ne dépasse jamais les places libres (une place reprise à la main n'est plus due). `null` si
 * rien ne change.
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
    const owed = p.control?.militiaOwed ?? 0;
    if (owed <= 0) continue;
    const free = militiaFreeSeats(p.control);
    const n = Math.min(owed, free, state.home);
    const took = takeMilitia(state, n);
    if (took) {
      state = took.state;
      out = reinforceControl(out, p.id, took.ids, now + legMs(p), now);
      sent.push({ id: p.id, n });
    }
    const left = Math.max(0, Math.min(owed, free) - n);
    if (left !== owed || took) {
      out = withOwed(out, p.id, left);
      changed = true;
    }
  }
  return changed ? { map: out, militia: state, sent } : null;
}
