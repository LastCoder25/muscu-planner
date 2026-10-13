/**
 * 🏰 LA FRISE DES PLACES D'UNE GARNISON (2026-10-09, demandé : « les tuiles de garnison me
 * gênent, intègre-les au nouveau système ») — le langage des frises de voyage : UNE ligne de
 * cases, une case par place. Plein = présent, pointillé = en route ou en sortie, ＋ = libre. Le héros prend deux cases (il vaut deux places).
 *
 * ⚠️ AUCUNE RÈGLE DE PLACES ICI : le nombre de cases libres vient de la fiche
 * (`controlFreeSeats`, `militiaFreeSeats`), cette fonction ne fait que les
 * RANGER. Deux règles pour « combien de places reste-t-il ? » finiraient par se contredire.
 */

/** Où en est un occupant : sur place, en route vers le lieu, parti en sortie (il revient), ou
 *  en RÉCOLTE sur un lieu sans garnison (filon, ruines… : il fouille, puis repart). */
export type StripState = 'here' | 'coming' | 'away' | 'search';

export interface StripMember {
  id: string;
  state: StripState;
  /** Temps avant son arrivée (`coming`) ou son retour (`away`), en ms. */
  inMs?: number;
  /** Une attaque combinée l'attend : on ne peut plus le choisir (le libellé dit pourquoi). */
  reserved?: string | null;
  /** Ce que la tenue perdrait sans lui, en points (`occupantLoss`). */
  loss?: number | null;
}

export type StripCell =
  | { key: string; kind: 'hero'; span: 2; state: StripState; inMs: number }
  | {
      key: string;
      kind: 'member';
      span: 1;
      id: string;
      state: StripState;
      inMs: number;
      reserved: string | null;
      loss: number | null;
      selected: boolean;
      /** Peut-on le toucher pour le ramener / le remplacer ? (pas en sortie, pas réservé). */
      selectable: boolean;
    }
  | { key: string; kind: 'free'; span: 1; unlimited: boolean };

export interface StripInput {
  hero?: { state: StripState; inMs?: number } | null;
  members: readonly StripMember[];
  free: number;
  selected: readonly string[];
  /** Rien à toucher (fiche de la base, lieu en récolte) : aucun occupant n'est choisissable. */
  readonly?: boolean;
  /** La forteresse prise : pas de limite, une seule case « ＋ » qui le dit. */
  unlimited?: boolean;
}

const ORDER: Record<StripState, number> = { here: 0, search: 1, coming: 2, away: 3 };

/** Ce que `crewOnSite` lit d'un voyage (héros ou équipe) — types STRUCTURELS. */
export interface SiteVoyage {
  poi: { id: string };
  midAt: number;
  dwellMs?: number;
  returnAt: number;
  turnBack?: number;
  recalled?: true;
  crew?: string[];
  outcome: { party?: { escort: string[] } };
  /** Le héros est du voyage (son expédition). */
  hero?: boolean;
}

/**
 * 🔍 QUI EST SUR CE LIEU, EN RÉCOLTE OU EN CHEMIN (demandé : « sur les lieux où les champions
 * restent récolter, voir en cliquant dessus les champions et/ou le héros qui y sont »). Les
 * voyages qui visent `poiId` : `coming` jusqu'à l'arrivée (`midAt − dwellMs`), `search`
 * pendant la récolte (jusqu'à `midAt`). Après, ils ont quitté le lieu ; un demi-tour ou un
 * rappel n'y arrive jamais.
 */
export function crewOnSite(
  voyages: readonly SiteVoyage[],
  poiId: string,
  now: number,
): { hero: { state: StripState; inMs: number } | null; members: StripMember[] } {
  let hero: { state: StripState; inMs: number } | null = null;
  const members: StripMember[] = [];
  for (const v of voyages) {
    if (v.poi.id !== poiId || v.turnBack !== undefined || v.recalled || now >= v.midAt) continue;
    const arriveAt = v.midAt - Math.max(0, v.dwellMs ?? 0);
    const at =
      now < arriveAt
        ? { state: 'coming' as const, inMs: arriveAt - now }
        : { state: 'search' as const, inMs: v.midAt - now };
    if (v.hero) hero = at;
    for (const id of v.crew ?? v.outcome.party?.escort ?? []) members.push({ id, ...at });
  }
  return { hero, members };
}

/** Les cases d'une rangée, dans l'ordre de lecture : le héros, les présents, ceux qui
 *  arrivent (le plus proche d'abord), ceux en sortie, puis les places libres. */
export function garrisonStrip(input: StripInput): StripCell[] {
  const cells: StripCell[] = [];
  if (input.hero)
    cells.push({
      key: 'hero',
      kind: 'hero',
      span: 2,
      state: input.hero.state,
      inMs: Math.max(0, input.hero.inMs ?? 0),
    });
  const sel = new Set(input.selected);
  const members = [...input.members].sort(
    (a, b) => ORDER[a.state] - ORDER[b.state] || (a.inMs ?? 0) - (b.inMs ?? 0),
  );
  for (const m of members) {
    const reserved = m.reserved ?? null;
    cells.push({
      key: 'm' + m.id,
      kind: 'member',
      span: 1,
      id: m.id,
      state: m.state,
      inMs: Math.max(0, m.inMs ?? 0),
      reserved,
      loss: m.loss ?? null,
      selected: sel.has(m.id),
      selectable: !input.readonly && m.state !== 'away' && m.state !== 'search' && !reserved,
    });
  }
  if (input.unlimited) cells.push({ key: 'f0', kind: 'free', span: 1, unlimited: true });
  else
    for (let k = 0; k < input.free; k++)
      cells.push({ key: 'f' + k, kind: 'free', span: 1, unlimited: false });
  return cells;
}

/** Le nombre de colonnes de la frise : les places du lieu, ou ce que la rangée occupe quand
 *  elle déborde (forteresse sans limite) — jamais moins de 1. */
export const stripColumns = (cells: readonly StripCell[]): number =>
  Math.max(
    1,
    cells.reduce((n, c) => n + c.span, 0),
  );
