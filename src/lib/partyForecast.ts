import { campWinPct } from './camp';
import { partyAllies, type EscortKit, type PartyHero } from './caravan';
import { isRiftPoi, isWarbandPoi, poiForceOf, type Poi } from './expedition';
import { estimateInterception, incursionWinPct } from './rift';
import type { Adventurer } from './adventurers';
import { supplyFx } from './supplies';

/**
 * 🎯 LA CHANCE QU'UN GROUPE REVIENNE VAINQUEUR, pour les QUATRE natures de lieu.
 *
 * ⚠️ **UNE SEULE DISPATCH.** Elle vivait en double — l'écran pour afficher son 🎯 %, le store
 * pour résoudre le voyage — et une troisième copie allait naître avec le refus d'un départ
 * perdu d'avance. Un lieu qui se résoudrait comme un camp mais s'estimerait comme une faille
 * annoncerait un pronostic que le combat dément : le défaut que ce projet documente partout.
 *
 * ⚠️ **AUCUNE FORMULE À ELLE** : elle appelle les estimateurs existants, qui rejouent tous le
 * VRAI combat sur des graines de PRONOSTIC (`partyForecastSeed`, disjointes par parité de
 * celles du choc réel — on ne rejoue jamais la graine qui décidera).
 *
 * Rend `null` quand il n'y a RIEN à simuler : une récolte sans gardes ne se combat pas, et un
 * groupe vide ne part pas. ⚠️ `null` ne vaut donc PAS « zéro » — c'est « la question ne se
 * pose pas », et un appelant qui confondrait les deux interdirait la récolte.
 *
 * ⚠️ Ce module vit À PART : `camp.ts` et `rift.ts` importent `party.ts`, donc la règle ne
 * pouvait pas y descendre sans cycle.
 */
export function partyWinChance(
  poi: Poi,
  escort: Adventurer[],
  road: EscortKit,
  hero: PartyHero | null,
  now: number,
  samples = 40,
): number | null {
  const allies = partyAllies(escort, road, hero);
  if (!allies.length) return null;
  const fx = supplyFx(road.supplies);
  if (isRiftPoi(poi)) return incursionWinPct(poi, allies, now, samples, fx.riftFoeMult);
  // ⚔️ L'interception prend l'escorte BRUTE : elle refond le groupe elle-même.
  if (isWarbandPoi(poi)) return estimateInterception(poi, escort, road, hero, samples);
  // 🛡️ Un lieu de récolte GARDÉ se bat comme un petit camp — même estimateur.
  const spec = poiForceOf(poi);
  return spec ? campWinPct(poi, spec, allies, samples, fx.guardMult) : null;
}
