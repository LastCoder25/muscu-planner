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
import { MILITIA, MILITIA_PREFIX } from '@/lib/militia';

export interface ReinfSelection {
  /** Champions de la base. */
  champs: string[];
  /** Nombre de miliciens de la base (ils sont anonymes). */
  militia: number;
  /** Membres d'autres lieux tenus (champions ou miliciens). */
  transfers: { fromId: string; id: string }[];
  /** 🦸 Le héros part AVEC la sélection (2026-10-08, demandé : il partait seul et tout de
   *  suite, par son propre bouton) : il prend 2 places de champion (`MILITIA.heroSeats`), et
   *  se programme comme les autres. */
  hero?: boolean;
}

/** Les places libres du lieu visé : de champion (`champ`), et au total, miliciens compris. */
export interface ReinfFree {
  champ: number;
  total: number;
  /** 🛡️ Places ouvertes aux MILICIENS (absent = autant que `total`). Un objectif ou une
   *  forteresse en refuse : 0, alors que ses places restent ouvertes aux champions. */
  mil?: number;
  /** 🛡️ Les miliciens de la BASE partent même si le lieu est plein (2026-10-06, demandé) : ils
   *  ne prennent la place de personne dans la sélection, bornés seulement par ceux présents à
   *  la base. À l'arrivée, ils s'installent s'il y a de la place, sinon ils font demi-tour.
   *  Les miliciens venus d'un AUTRE lieu (transferts) aussi (2026-10-06, demandé : « depuis la
   *  garnison du lieu aussi ») : seuls les champions restent bornés par les places. */
  milAnyway?: boolean;
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
  const champ = sel.champs.length + transChamps + (sel.hero ? MILITIA.heroSeats : 0);
  return { champ, total: champ + sel.militia + (sel.transfers.length - transChamps) };
}

/** Peut-on ajouter un champion (`'champ'`) ou un milicien (`'mil'`) de plus ? */
export function reinfCanAdd(sel: ReinfSelection, kind: 'champ' | 'mil', free: ReinfFree): boolean {
  // 🛡️ `milAnyway` : un milicien (base ou transfert) part toujours, il ne prend la place de
  // personne dans la sélection — demi-tour à l'arrivée s'il n'y a pas de place.
  if (kind === 'mil' && free.milAnyway) return true;
  const all = reinfSeats(sel);
  // 🏰 Un champion déloge les miliciens à son arrivée (2026-10-08) : seules les places de
  // champion (`controlFreeSeats`, miliciens non comptés) le bornent.
  if (kind === 'champ') return all.champ < free.champ;
  const used = free.milAnyway ? { ...all, total: all.champ } : all;
  if (used.total >= free.total) return false;
  if (kind === 'mil' && free.mil !== undefined && used.total - used.champ >= free.mil) return false;
  return kind === 'mil' || used.champ < free.champ;
}

/** Combien de MEMBRES partent (le héros compte pour un, même s'il prend deux places). */
export const reinfCount = (sel: ReinfSelection) =>
  sel.champs.length + sel.militia + sel.transfers.length + (sel.hero ? 1 : 0);

/** 🦸 Coche ou décoche le héros — jamais au-delà des places de champion (il en prend 2). */
export function toggleReinfHero(sel: ReinfSelection, free: ReinfFree): ReinfSelection {
  if (sel.hero) {
    const rest = { ...sel };
    delete rest.hero;
    return rest;
  }
  return reinfSeats(sel).champ + MILITIA.heroSeats <= free.champ ? { ...sel, hero: true } : sel;
}

/** Les miliciens de la sélection, base et transferts compris. */
const militiaOf = (sel: ReinfSelection) =>
  sel.militia + sel.transfers.filter((t) => isMil(t.id)).length;

/** Les places que les miliciens de la sélection (base et transferts) peuvent prendre
 *  aujourd'hui, une fois servis les champions. */
function militiaRoom(sel: ReinfSelection, free: ReinfFree): number {
  const champs = reinfSeats(sel).champ;
  return Math.min(free.total - champs, free.mil === undefined ? Infinity : free.mil);
}

/** 🛡️ Combien de miliciens (base et transferts) partent AU-DELÀ des places libres
 *  d’aujourd’hui : ils ne s'installeront que si des places se libèrent d'ici leur arrivée (une
 *  sortie qui part), sinon ils font demi-tour. */
export function reinfMilitiaOver(sel: ReinfSelection, free: ReinfFree): number {
  return Math.max(0, militiaOf(sel) - Math.max(0, militiaRoom(sel, free)));
}

/**
 * 🏠 Combien de miliciens DÉJÀ EN POSTE rentreront à la base pour faire place aux champions
 * de la sélection (revue du 2026-10-08) : un champion déloge un milicien à son arrivée
 * (`bumpMilitiaToFit`), donc ceux qui dépassent les places VIDES en chassent autant.
 * `extraChamp` = des places de champion en plus (le héros en prend 2). Borné par les places de
 * champion : au-delà, l'envoi est refusé, il ne déloge personne.
 */
export function reinfBumped(sel: ReinfSelection, free: ReinfFree, extraChamp = 0): number {
  const champ = Math.min(free.champ, reinfSeats(sel).champ + extraChamp);
  return Math.max(0, champ - Math.max(0, free.total));
}

/** Coche ou décoche un champion de la base — jamais au-delà des places. */
export function toggleReinfChamp(sel: ReinfSelection, id: string, free: ReinfFree): ReinfSelection {
  if (sel.champs.includes(id)) return { ...sel, champs: sel.champs.filter((x) => x !== id) };
  return reinfCanAdd(sel, 'champ', free) ? { ...sel, champs: [...sel.champs, id] } : sel;
}

/** Le nombre de miliciens de la base, borné par ceux présents et par les places (sauf
 *  `milAnyway` : par ceux présents seulement). */
export function setReinfMilitia(
  sel: ReinfSelection,
  n: number,
  home: number,
  free: ReinfFree,
): ReinfSelection {
  const room = free.milAnyway ? Infinity : militiaRoom(sel, free) - (militiaOf(sel) - sel.militia);
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
