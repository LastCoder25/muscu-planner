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
import type { ControlState, ExpeditionMap, Poi } from './expedition';
import { takeMilitia, type MilitiaState } from './militia';

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
 *  ou non. */
export function militiaOwedOn(map: Pick<ExpeditionMap, 'pois'> | null | undefined): number {
  let n = 0;
  for (const p of map?.pois ?? [])
    if (p.control?.owner === 'player') n += p.control.militiaOwed ?? 0;
  return n;
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
  return changed ? { map: out, militia: state, sent } : null;
}
