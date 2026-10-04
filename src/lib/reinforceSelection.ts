/**
 * ➕ LE RENFORT GROUPÉ d'un lieu fixe (demandé : « sélectionner plusieurs renforts d'un coup
 * en voyant le % de défense qu'ils donnent »). La sélection mêle trois sources : des
 * champions de la base, des miliciens de la base, et des membres d'AUTRES lieux tenus.
 *
 * ⚠️ Cette lib ne décide que des PLACES — ce que la sélection occupe et ce qu'on peut encore
 * y ajouter. Qui peut partir, et le calcul de la tenue, restent à la page et au store
 * (`reinforceControlPoint`, `sendMilitiaToControl`, `transferControlGarrison`), qui refusent
 * ce qui ne passe pas.
 */
import { MILITIA_PREFIX } from '@/lib/militia';

export interface ReinfSelection {
  /** Champions de la base. */
  champs: string[];
  /** Nombre de miliciens de la base (ils sont anonymes). */
  militia: number;
  /** Membres d'autres lieux tenus (champions ou miliciens). */
  transfers: { fromId: string; id: string }[];
}

/** Les places libres du lieu visé : de champion (`champ`), et au total, miliciens compris. */
export interface ReinfFree {
  champ: number;
  total: number;
  /** 🛡️ Places ouvertes aux MILICIENS (absent = autant que `total`). Un objectif ou une
   *  forteresse en refuse : 0, alors que ses places restent ouvertes aux champions. */
  mil?: number;
}

export const emptyReinfSelection = (): ReinfSelection => ({
  champs: [],
  militia: 0,
  transfers: [],
});

const isMil = (id: string) => id.startsWith(MILITIA_PREFIX);

/** Ce que la sélection occupe : places de champion, et places au total. */
export function reinfSeats(sel: ReinfSelection): ReinfFree {
  const transChamps = sel.transfers.filter((t) => !isMil(t.id)).length;
  const champ = sel.champs.length + transChamps;
  return { champ, total: champ + sel.militia + (sel.transfers.length - transChamps) };
}

/** Peut-on ajouter un champion (`'champ'`) ou un milicien (`'mil'`) de plus ? */
export function reinfCanAdd(sel: ReinfSelection, kind: 'champ' | 'mil', free: ReinfFree): boolean {
  const used = reinfSeats(sel);
  if (used.total >= free.total) return false;
  if (kind === 'mil' && free.mil !== undefined && used.total - used.champ >= free.mil) return false;
  return kind === 'mil' || used.champ < free.champ;
}

export const reinfCount = (sel: ReinfSelection) => reinfSeats(sel).total;

/** Coche ou décoche un champion de la base — jamais au-delà des places. */
export function toggleReinfChamp(sel: ReinfSelection, id: string, free: ReinfFree): ReinfSelection {
  if (sel.champs.includes(id)) return { ...sel, champs: sel.champs.filter((x) => x !== id) };
  return reinfCanAdd(sel, 'champ', free) ? { ...sel, champs: [...sel.champs, id] } : sel;
}

/** Le nombre de miliciens de la base, borné par ceux présents et par les places. */
export function setReinfMilitia(
  sel: ReinfSelection,
  n: number,
  home: number,
  free: ReinfFree,
): ReinfSelection {
  const used = reinfSeats(sel);
  const others = used.total - sel.militia;
  const room = Math.min(
    free.total - others,
    free.mil === undefined ? Infinity : free.mil - (others - used.champ),
  );
  return { ...sel, militia: Math.max(0, Math.min(Math.floor(n), home, room)) };
}

/** Coche ou décoche un membre d'un autre lieu. */
export function toggleReinfTransfer(
  sel: ReinfSelection,
  fromId: string,
  id: string,
  free: ReinfFree,
): ReinfSelection {
  if (sel.transfers.some((t) => t.id === id))
    return { ...sel, transfers: sel.transfers.filter((t) => t.id !== id) };
  return reinfCanAdd(sel, isMil(id) ? 'mil' : 'champ', free)
    ? { ...sel, transfers: [...sel.transfers, { fromId, id }] }
    : sel;
}

/** Les transferts regroupés par lieu de départ (un envoi par lieu, comme le store). */
export function transfersByOrigin(sel: ReinfSelection): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const t of sel.transfers) out.set(t.fromId, [...(out.get(t.fromId) ?? []), t.id]);
  return out;
}
