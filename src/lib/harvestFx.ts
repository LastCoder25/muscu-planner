// 🧺 L'ANIMATION DE RÉCOLTE D'UNE PLACE FORTE (2026-09-29, demandé : « une animation à la
// récolte de consommable ou de rune »). Ce module dit QUOI montrer ; l'overlay central
// (`GameFxOverlay`) le fait jaillir d'un panier, une pièce après l'autre.
//
// ⚠️ Rien n'est recalculé : on met en scène ce que la récolte A RENDU (`collectControlPoint`,
// `recallControl`), jamais une estimation. Une animation n'annonce jamais un gain qui n'a pas
// eu lieu.
import { SUPPLIES, SUPPLY_IDS, type SupplyStock } from './supplies';
import { RUNE_TIERS, type RuneTier } from './skillRunes';
import { runeCount } from './runeBank';

/** Une pièce qui sort du panier : un consommable (emoji) ou une rune (pierre dessinée). */
export interface HaulPiece {
  key: string;
  label: string;
  count: number;
  /** Consommable : son emoji. */
  emoji?: string;
  /** Rune : sa couleur, ou `'multi'` pour une rune multicolore (la pierre est dessinée par
   *  `RuneIcon`, aux quatre teintes quand elle est multicolore). */
  rune?: RuneTier | 'multi';
  /** Le halo derrière la pièce. */
  color: string;
}

/** Le halo d'un consommable : neutre, le panier ne doit pas voler la vedette aux runes. */
const SUPPLY_HALO = '#e8d9b5';

/** Les pièces d'une récolte, dans l'ordre du jeu : les consommables d'abord (ordre de
 *  l'écran, `SUPPLY_IDS`), puis les runes de la plus commune à la plus rare — la plus
 *  précieuse sort EN DERNIER, c'est elle qu'on attend. Une pièce par sorte, avec son nombre. */
export function harvestPieces(
  supplies: SupplyStock | undefined,
  runes: number | readonly RuneTier[] | undefined,
): HaulPiece[] {
  const out: HaulPiece[] = [];
  for (const id of SUPPLY_IDS) {
    const n = Math.round(supplies?.[id] ?? 0);
    if (n > 0)
      out.push({
        key: id,
        label: SUPPLIES[id].name,
        count: n,
        emoji: SUPPLIES[id].emoji,
        color: SUPPLY_HALO,
      });
  }
  // 🪬 Des runes MULTICOLORES : leur couleur se révèle à l'ouverture, pas à la récolte.
  const n = runeCount(runes);
  if (n > 0)
    out.push({ key: 'rune', label: 'Rune multicolore', count: n, rune: 'multi', color: '#c9a6ff' });
  return out;
}

/** L'éclat de l'animation : celui de la rune la plus rare, sinon le bleu d'une récolte
 *  ordinaire. Une rune dorée doit éclater plus fort qu'une ration. */
export function harvestRarity(pieces: readonly HaulPiece[]): 'rare' | 'epic' | 'legendary' {
  const best = pieces.reduce(
    (m, p) => (p.rune ? Math.max(m, p.rune === 'multi' ? 2 : RUNE_TIERS.indexOf(p.rune)) : m),
    -1,
  );
  return best >= 3 ? 'legendary' : best >= 2 ? 'epic' : 'rare';
}

/** Le titre : ce qu'on reçoit, en une ligne. */
export function harvestTitle(pieces: readonly HaulPiece[]): string {
  const sup = pieces.filter((p) => !p.rune).reduce((s, p) => s + p.count, 0);
  const run = pieces.filter((p) => p.rune).reduce((s, p) => s + p.count, 0);
  const parts: string[] = [];
  if (run) parts.push(`${run} rune${run > 1 ? 's' : ''}`);
  if (sup) parts.push(`${sup} consommable${sup > 1 ? 's' : ''}`);
  return parts.length ? `+${parts.join(' · +')}` : '';
}
