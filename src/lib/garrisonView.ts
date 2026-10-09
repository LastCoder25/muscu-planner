/**
 * 🏰 LES CASES D'UNE GARNISON, EN DEUX GROUPES (2026-10-08, demandé : « séparer la partie
 * champions/héros des miliciens qui sont là en remplacement ou en bouche-trou »).
 *
 * Les TITULAIRES (héros, champions arrivés, en route ou en sortie, et les places de champion
 * libres) d'abord ; les REMPLAÇANTS (miliciens arrivés ou en route, et les places qu'un
 * milicien seul peut prendre) ensuite. Rien n'est calculé ici sur les règles de places : on
 * reçoit le nombre de places libres et la part ouverte aux champions (`controlFreeSeats`),
 * on ne fait que RANGER. Pure, testée.
 */
import { isMilitiaId } from './militia';

type ChampCell =
  | { kind: 'hero'; coming: boolean; away: boolean; engaged: boolean }
  | { kind: 'adv'; id: string }
  | { kind: 'route'; id: string }
  | { kind: 'away'; id: string }
  | { kind: 'free' };
type MilCell = { kind: 'mil'; id: string } | { kind: 'route'; id: string } | { kind: 'free' };

export interface GarrisonCells {
  champ: ChampCell[];
  mil: MilCell[];
}

export interface GarrisonCellInput {
  hero: 'posted' | 'coming' | 'away' | 'engaged' | null;
  /** Les places que prend le héros (2). */
  heroSeats: number;
  garrison: readonly string[];
  reinforcing: readonly { id: string }[];
  away: readonly string[];
  /** La garnison entière : places de champion PLUS places de milice (`garrisonCap`) ;
   *  `Infinity` = sans limite (la forteresse). */
  cap: number;
  /** Les places encore ouvertes à un CHAMPION (`controlFreeSeats`, miliciens non comptés). */
  champFree: number;
}

export function garrisonCells(i: GarrisonCellInput): GarrisonCells {
  const champ: ChampCell[] = [];
  const mil: MilCell[] = [];
  if (i.hero)
    champ.push({
      kind: 'hero',
      coming: i.hero === 'coming',
      away: i.hero === 'away',
      engaged: i.hero === 'engaged',
    });
  for (const id of i.garrison) {
    if (isMilitiaId(id)) mil.push({ kind: 'mil', id });
    else champ.push({ kind: 'adv', id });
  }
  for (const r of i.reinforcing) {
    if (isMilitiaId(r.id)) mil.push({ kind: 'route', id: r.id });
    else champ.push({ kind: 'route', id: r.id });
  }
  for (const id of i.away) champ.push({ kind: 'away', id });

  // 🏰 Sans limite (la forteresse) : une seule case libre, de champion.
  if (!Number.isFinite(i.cap)) {
    champ.push({ kind: 'free' });
    return { champ, mil };
  }
  const used = champ.length + mil.length + (i.hero ? i.heroSeats - 1 : 0);
  const free = Math.max(0, i.cap - used);
  const champFree = Math.min(free, Math.max(0, i.champFree));
  for (let k = 0; k < champFree; k++) champ.push({ kind: 'free' });
  for (let k = champFree; k < free; k++) mil.push({ kind: 'free' });
  return { champ, mil };
}
