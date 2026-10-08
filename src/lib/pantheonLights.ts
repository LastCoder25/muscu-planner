// 🛕 Les 4 voyants du Panthéon sur la Base (demandé : « 4 boules verticales à gauche du
// Panthéon, chacune s'allume si sa condition est dispo, une couleur par boule »).
// ⚠️ Aucune règle nouvelle : chaque voyant lit la fonction qui décide déjà du bouton
// correspondant (ascensions, ouverture d'un lot de runes, invocation ×10). Un voyant
// allumé promet donc exactement ce que le bouton permet.
import { readyAscensionIds } from '@/lib/ascension';
import type { Adventurer } from '@/lib/adventurers';
import type { AdvGear } from '@/lib/advGear';
import type { Seals } from '@/lib/ascension';
import { openBlocker, RUNE_LOT, type RuneBank } from '@/lib/runeBank';
import { pullPayment } from '@/lib/sportTickets';
import { GACHA } from '@/lib/gacha';

type PantheonLightId = 'champion' | 'gear' | 'runes' | 'summon';

export interface PantheonLight {
  id: PantheonLightId;
  on: boolean;
  color: string;
  label: string;
}

/** Une couleur par voyant, hors de l'accent (jaune = « à faire » ailleurs sur l'écran). */
const LIGHTS: Record<PantheonLightId, { color: string; label: string }> = {
  champion: { color: '#ffb23f', label: 'Ascension de champion possible' },
  gear: { color: '#4fd1e8', label: "Ascension d'objet possible" },
  runes: { color: '#b57bff', label: 'Ouverture de 10 runes possible' },
  summon: { color: '#7bc86c', label: 'Invocation ×10 possible' },
};

export function pantheonLights(input: {
  advs: Adventurer[];
  stock: AdvGear[];
  pantheonLevel: number;
  seals: Seals;
  gold: number;
  runes: RuneBank;
  tickets: number;
  mana: number;
}): PantheonLight[] {
  const asc = readyAscensionIds(input.advs, input.stock, {
    pantheonLevel: input.pantheonLevel,
    seals: input.seals,
    gold: input.gold,
  });
  const on: Record<PantheonLightId, boolean> = {
    champion: asc.champions.size > 0,
    gear: asc.gear.size > 0,
    runes: openBlocker(input.runes, RUNE_LOT.size) == null,
    summon: pullPayment(GACHA.multiCount, { tickets: input.tickets, mana: input.mana }) != null,
  };
  return (Object.keys(LIGHTS) as PantheonLightId[]).map((id) => ({
    id,
    on: on[id],
    ...LIGHTS[id],
  }));
}
