// 🧩 RANGEMENT DES PIÈCES DE SET — une seule règle, un seul barème (v0.839).
//
// ⚠️ POURQUOI CE MODULE. La règle « quelle pièce reste dans le set, laquelle s'en va »
// vivait en CINQ copies (butin de boss, récompense au choix, rangement manuel, optimiseur,
// application du plan) avec TROIS barèmes différents : la valeur brute du 1er affixe, la
// somme des affixes, la puissance. Deux copies pouvaient donc garder deux pièces
// différentes pour le même emplacement — et la perdante partait à la FORGE, sans que le
// joueur ait rien décidé (signalé : « ça force un remplacement sans l'avis du joueur »).
//
// Désormais : la meilleure pièce occupe l'emplacement du set, l'autre devient un DOUBLON
// rangé à côté (`Loadout.spares`). Rien ne part plus à la forge tout seul ; le joueur
// vend ses doublons (automatiquement depuis la v0.890). Le sac, lui, ne garde que les
// objets hors set.
//
// Module à part (comme `buildingPreview.ts`) : le barème a besoin du passif de voie, que
// `items.ts` ne peut pas importer sans cycle.
import type { Equipped, Item, Loadout, AggregatedEffects } from './items';
import { SLOTS, MAX_LOADOUTS, canSell, playerWithGear, mergeEffects } from './items';
import { combatPowerRaw } from './combat';
import { VOIES } from './voies';

/** Index du set (donc de la voie) d'une pièce de set de voie, −1 sinon. Loadout i ↔ VOIES[i]. */
export function voieSetIndex(it: Item): number {
  if (!it.setId?.startsWith('voie:')) return -1;
  const i = VOIES.findIndex((v) => v.id === it.setId!.slice('voie:'.length));
  return i >= 0 && i < MAX_LOADOUTS ? i : -1;
}

/** Les réserves, toujours au complet (une par voie), sans muter l'entrée. */
export function normalizeLoadouts(loadouts: readonly (Loadout | undefined)[]): Loadout[] {
  return Array.from({ length: MAX_LOADOUTS }, (_, k) => {
    const lo = loadouts[k];
    return { items: { ...(lo?.items ?? {}) }, spares: [...(lo?.spares ?? [])] };
  });
}

/** Tout ce que les réserves contiennent : pièces du set ET doublons.
 *  ⚠️ Source unique de « ce qu'on possède en réserve » : l'optimiseur, l'aperçu « Porter ce
 *  set » et l'application du plan la lisent. Un doublon oublié par l'un d'eux serait une
 *  pièce invisible — ou, pire, perdue au prochain rangement. */
export function ownedInLoadouts(loadouts: readonly (Loadout | undefined)[]): Item[] {
  return loadouts.flatMap((lo) => [
    ...SLOTS.map((s) => lo?.items?.[s]).filter((it): it is Item => !!it),
    ...(lo?.spares ?? []),
  ]);
}

type FiledOutcome = 'added' | 'upgraded' | 'spare';
export interface FiledPiece {
  item: Item;
  setIndex: number;
  outcome: FiledOutcome;
  /** La pièce qui occupait l'emplacement, passée en doublon (`upgraded` seulement). */
  displaced?: Item;
}

/**
 * Range des pièces dans leurs sets. Pour chaque pièce de set de voie : emplacement libre →
 * elle l'occupe ; occupé → la MEILLEURE (au barème `score`) l'occupe et l'autre devient un
 * doublon. Les objets hors set reviennent dans `rest`, dans l'ordre.
 *
 * ⚠️ Jamais destructeur : aucune pièce ne disparaît, quel que soit le barème. C'est ce qui
 * rend le rangement automatique acceptable — il range, il ne jette pas.
 * ⚠️ À égalité, la pièce en place reste : un rangement ne doit pas faire tourner deux
 * pièces équivalentes à chaque passage.
 */
export function fileSetPieces(
  loadouts: readonly (Loadout | undefined)[],
  pieces: readonly Item[],
  score: (it: Item) => number,
): { loadouts: Loadout[]; rest: Item[]; filed: FiledPiece[] } {
  const out = normalizeLoadouts(loadouts);
  const rest: Item[] = [];
  const filed: FiledPiece[] = [];
  for (const it of pieces) {
    const i = voieSetIndex(it);
    if (i < 0 || !SLOTS.includes(it.slot)) {
      rest.push(it);
      continue;
    }
    const lo = out[i]!;
    const held = lo.items[it.slot];
    if (!held) {
      lo.items[it.slot] = it;
      filed.push({ item: it, setIndex: i, outcome: 'added' });
    } else if (score(it) > score(held)) {
      lo.items[it.slot] = it;
      lo.spares = [...(lo.spares ?? []), held];
      filed.push({ item: it, setIndex: i, outcome: 'upgraded', displaced: held });
    } else {
      lo.spares = [...(lo.spares ?? []), it];
      filed.push({ item: it, setIndex: i, outcome: 'spare' });
    }
  }
  return { loadouts: out, rest, filed };
}

/** Met un doublon dans le set à la place de la pièce en place, qui devient doublon à son
 *  tour. Rend `null` si le doublon n'existe pas. */
export function promoteSpare(
  loadouts: readonly (Loadout | undefined)[],
  setIndex: number,
  spareId: string,
): Loadout[] | null {
  const out = normalizeLoadouts(loadouts);
  const lo = out[setIndex];
  const spare = lo?.spares?.find((s) => s.id === spareId);
  if (!lo || !spare) return null;
  const held = lo.items[spare.slot];
  lo.items[spare.slot] = spare;
  lo.spares = [...(lo.spares ?? []).filter((s) => s.id !== spareId), ...(held ? [held] : [])];
  return out;
}

/**
 * Retire UNE pièce rangée (pour la vendre) — un doublon, ou la pièce en place d'un emplacement. Rend `null`
 * si elle n'est pas dans les réserves (une pièce PORTÉE vit dans `equipped` : hors
 * d'atteinte par construction) ou si elle est 🔒.
 *
 * ⚠️ Vendre la pièce EN PLACE ne laisse pas un trou quand un doublon attend : le meilleur
 * doublon de cet emplacement (au barème du set) prend sa place. Sans ça, le set perdrait
 * une pièce qu'on possède encore, et l'emplacement se lirait vide.
 */
export function takeSetPiece(
  loadouts: readonly (Loadout | undefined)[],
  itemId: string,
  score: (it: Item) => number,
): { loadouts: Loadout[]; taken: Item } | null {
  const out = normalizeLoadouts(loadouts);
  for (const lo of out) {
    const spare = lo.spares?.find((s) => s.id === itemId);
    if (spare) {
      if (!canSell(spare)) return null;
      lo.spares = lo.spares!.filter((s) => s.id !== itemId);
      return { loadouts: out, taken: spare };
    }
    const slot = SLOTS.find((s) => lo.items[s]?.id === itemId);
    if (slot) {
      const held = lo.items[slot]!;
      if (!canSell(held)) return null;
      delete lo.items[slot];
      const sameSlot = (lo.spares ?? []).filter((s) => s.slot === slot);
      lo.spares = (lo.spares ?? []).filter((s) => s.slot !== slot);
      const best = [...sameSlot].sort((a, b) => score(b) - score(a))[0];
      if (best) {
        lo.items[slot] = best;
        lo.spares = [...lo.spares, ...sameSlot.filter((s) => s !== best)];
      }
      return { loadouts: out, taken: held };
    }
  }
  return null;
}

/** Ce que « Vendre les doublons » vend : les doublons d'un set (ou de tous si `setIndex`
 *  est omis). Les 🔒 restent — le verrou protège de toutes les sorties. */
export function sparesLot(
  loadouts: readonly (Loadout | undefined)[],
  setIndex?: number,
): { sold: Item[]; keep: Item[] } {
  const spares = loadouts
    .filter((_, k) => setIndex === undefined || k === setIndex)
    .flatMap((lo) => lo?.spares ?? []);
  return { sold: spares.filter(canSell), keep: spares.filter((it) => !canSell(it)) };
}

/**
 * LE BARÈME : ce que vaut une pièce POUR SON SET — le héros portant ce set (les autres
 * pièces rangées, ce qu'il porte ailleurs pour les emplacements vides), dans la VOIE du set.
 *
 * ⚠️ Pas la puissance du build actuel : une pièce de set sert au set. Jugée dans une autre
 * voie, le capstone et le passif ne s'appliquent pas, et deux pièces du même emplacement
 * se départagent sur des effets qui ne comptent pas pour ce set.
 * ⚠️ Symétrique par construction : deux candidates au même emplacement sont évaluées avec
 * EXACTEMENT le même reste d'équipement.
 * ⚠️ Valeur BRUTE (`combatPowerRaw`) : l'arrondi efface les petits écarts entre deux jets.
 */
export function setPieceScorer(ctx: {
  name: string;
  stats: { puissance: number; endurance: number; agilite: number };
  level: number;
  /** Effets hors voie (talents équipés). Le passif de la voie du set est ajouté ici. */
  fx: Partial<AggregatedEffects>;
  equipped: Equipped;
  loadouts: readonly (Loadout | undefined)[];
}): (it: Item) => number {
  return (it) => {
    const i = voieSetIndex(it);
    if (i < 0) return 0;
    const voie = VOIES[i]!.id;
    const eq: Equipped = { ...ctx.equipped };
    for (const s of SLOTS) {
      const stored = ctx.loadouts[i]?.items?.[s];
      if (stored) eq[s] = stored;
    }
    eq[it.slot] = it;
    const fx = { ...emptyFx(), ...ctx.fx };
    return combatPowerRaw(playerWithGear(ctx.name, ctx.stats, eq, fx, ctx.level, voie));
  };
}

// `mergeEffects` attend des effets complets ; `fx` peut être partiel.
function emptyFx(): AggregatedEffects {
  return mergeEffects();
}
