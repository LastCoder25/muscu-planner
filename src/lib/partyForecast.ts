import { campWinPct } from './camp';
import { partyAllies, resolveCaravan, type EscortKit, type PartyHero } from './caravan';
import { HARVEST_TYPES, isRiftPoi, isWarbandPoi, poiForceOf, type Poi } from './expedition';
import { partyForecastSeed } from './party';
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
  /** 🛣️ Compter la ROUTE d'une récolte sans héros (défaut). `false` = les gardes seuls :
   *  c'est ce que lit le refus « perdu d'avance » — une route dangereuse coûte une part de la
   *  cargaison, elle ne rend jamais un lieu imprenable. */
  withRoad = true,
): number | null {
  const allies = partyAllies(escort, road, hero);
  if (!allies.length) return null;
  const fx = supplyFx(road.supplies);
  if (isRiftPoi(poi))
    return incursionWinPct(poi, allies, now, samples, fx.riftFoeMult, fx.riftBossMult);
  // ⚔️ L'interception prend l'escorte BRUTE : elle refond le groupe elle-même.
  if (isWarbandPoi(poi)) return estimateInterception(poi, escort, road, hero, samples);
  // 🛡️ Un lieu de récolte GARDÉ se bat comme un petit camp — même estimateur.
  const spec = poiForceOf(poi);
  const guards = spec ? campWinPct(poi, spec, allies, samples, fx.guardMult) : null;
  // 🛣️ UNE RÉCOLTE SANS LE HÉROS VOYAGE COMME UN CONVOI (`resolveHarvestParty`) : sa
  // « réussite » = les gardes abattus ET aucune embuscade PERDUE sur la route. Ne compter que
  // les gardes annonçait 100 % à deux champions pour ~65 % de rapports gagnés (11-17 % sur
  // une route dangereuse) — mesuré, v0.1283. Les deux combats sont indépendants (générateurs
  // séparés) : on multiplie.
  if (!withRoad || hero || !escort.length || !HARVEST_TYPES.has(poi.type)) return guards;
  return (guards ?? 1) * roadClearChance(poi, escort, road, samples);
}

/**
 * 🛣️ La part des voyages qui ne perdent AUCUNE embuscade — le VRAI trajet (`resolveCaravan`),
 * rejoué sur les graines de PRONOSTIC (impaires). ⚠️ La graine du départ d'un groupe est
 * toujours PAIRE (store `sendParty`) : on ne rejoue jamais la route qui aura lieu.
 * Le Panthéon et le niveau du joueur ne jouent que sur l'XP et l'or, jamais sur l'issue.
 */
function roadClearChance(
  poi: Poi,
  escort: Adventurer[],
  road: EscortKit,
  samples = 40,
): number {
  const n = Math.max(1, samples);
  let clear = 0;
  for (let s = 0; s < n; s++) {
    const o = resolveCaravan(poi, escort, partyForecastSeed(s), road, 1, undefined);
    if (!o.events.some((e) => e.kind === 'bandits' && !e.won)) clear++;
  }
  return clear / n;
}
