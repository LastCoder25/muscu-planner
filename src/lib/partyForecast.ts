import { campWinPct } from './camp';
import {
  firstAidChance,
  partyAllies,
  resolveCaravan,
  type EscortKit,
  type PartyHero,
} from './caravan';
import {
  HARVEST_TYPES,
  isFieldArmyPoi,
  isRiftPoi,
  isWarbandPoi,
  poiForceOf,
  type Poi,
} from './expedition';
import { partyForecastSeed } from './party';
import { estimateInterception, incursionWinPct } from './rift';
import type { Adventurer } from './adventurers';
import { supplyFx } from './supplies';
import { fieldArmySpec } from './fieldArmy';

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
/** 🎯 Combien de combats simulés pour un 🎯 % affiché. ⚠️ UNE seule valeur pour le % de
 *  l'équipe ET l'apport de chaque membre (`winGain`) : avec 20 d'un côté et 40 de l'autre,
 *  le héros annonçait « +45 % » quand le % de l'équipe passait de 0 à 53 % (signalé). */
export const FORECAST_SAMPLES = 40;

/**
 * 🎲 UN COMBAT DE CAMP COÛTE ~0,3 MS : on en simule `CAMP_SAMPLE_MULT` fois plus (2026-10-01, signalé :
 * « j'attaque à 98 % et je rate souvent »). À 40 graines fixes, l'écart au vrai taux allait
 * jusqu'à ~6 points au-dessus (mesuré sur 390 lieux de 85 % et plus ; un cas réel : 98 %
 * affiché pour ~88 % de vrais combats gagnés), et le joueur choisit justement les équipes qui
 * affichent le plus — il récoltait les surestimations. À ×6 : pire écart 2,6 points, 0,75 ms.
 * ⚠️ Les deux côtés de `winGain` passent ici : l'apport reste la différence de deux % affichés.
 * Les failles (jusqu'à 13 combats) et l'interception gardent leur nombre.
 */
export const CAMP_SAMPLE_MULT = 6;

export function partyWinChance(
  poi: Poi,
  escort: Adventurer[],
  road: EscortKit,
  hero: PartyHero | null,
  now: number,
  samples = FORECAST_SAMPLES,
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
  // ⚔️🗼 Une armée en campagne se bat comme un camp de SA force de campagne — la MÊME spec
  // que la résolution (`fieldArmySpec`, `resolveFieldArmy`).
  const army = isFieldArmyPoi(poi) ? fieldArmySpec(poi) : null;
  if (army) return campWinPct(poi, army, allies, samples * CAMP_SAMPLE_MULT, fx.guardMult);
  // ⚔️ L'interception prend l'escorte BRUTE : elle refond le groupe elle-même.
  if (isWarbandPoi(poi)) return estimateInterception(poi, escort, road, hero, samples);
  // 🛡️ Un lieu de récolte GARDÉ se bat comme un petit camp — même estimateur.
  // 🐺 Une tanière : la bête garde SA force, quel que soit le nombre envoyé.
  const spec = poiForceOf(poi);
  const guards = spec
    ? campWinPct(poi, spec, allies, samples * CAMP_SAMPLE_MULT, fx.guardMult)
    : null;
  // 🛣️ UNE RÉCOLTE SANS LE HÉROS VOYAGE COMME UN CONVOI (`resolveHarvestParty`) : sa
  // « réussite » = les gardes abattus ET aucune embuscade PERDUE sur la route. Ne compter que
  // les gardes annonçait 100 % à deux champions pour ~65 % de rapports gagnés (11-17 % sur
  // une route dangereuse) — mesuré, v0.1283. Les deux combats sont indépendants (générateurs
  // séparés) : on multiplie.
  if (!withRoad || hero || !escort.length || !HARVEST_TYPES.has(poi.type)) return guards;
  return (guards ?? 1) * roadClearChance(poi, escort, road, samples);
}

/**
 * 🛣️ LA ROUTE, À PART DES GARDES (2026-09-29, décision de l'utilisateur) : un seul % mêlait
 * les deux et trompait — une archive Argent ★1 affichait 7 % pour un champion Or ★1 qui y
 * bat les gardes 85 fois sur 100 ; c'est la route dangereuse qui coûtait. Rend `null` quand
 * le trajet ne se joue pas (héros du groupe, lieu hors récolte, équipe vide).
 * - `clear` : aucune embuscade perdue ;
 * - `turnBack` : embuscade perdue à l'ALLER — demi-tour, le lieu n'est pas atteint.
 * ⚠️ Le VRAI trajet (`resolveCaravan`), sur les graines de PRONOSTIC — comme `roadClearChance`.
 */
export function partyRoadOdds(
  poi: Poi,
  escort: Adventurer[],
  road: EscortKit,
  hero: PartyHero | null,
  samples = 40,
  /** 🔙⚔️ Attaque combinée : aucun demi-tour (la règle de la résolution, `noTurnBack`). */
  combined = false,
): { clear: number; turnBack: number } | null {
  if (hero || !escort.length || !HARVEST_TYPES.has(poi.type)) return null;
  const n = Math.max(1, samples);
  let clear = 0;
  let back = 0;
  for (let s = 0; s < n; s++) {
    const o = resolveCaravan(poi, escort, partyForecastSeed(s), road, 1, undefined, {
      noTurnBack: combined,
    });
    if (o.turnBack !== undefined) back++;
    if (!o.events.some((e) => e.kind === 'bandits' && !e.won)) clear++;
  }
  return { clear: clear / n, turnBack: back / n };
}

/**
 * 🛣️ La part des voyages qui ne perdent AUCUNE embuscade — le VRAI trajet (`resolveCaravan`),
 * rejoué sur les graines de PRONOSTIC (impaires). ⚠️ La graine du départ d'un groupe est
 * toujours PAIRE (store `sendParty`) : on ne rejoue jamais la route qui aura lieu.
 * Le Panthéon et le niveau du joueur ne jouent que sur l'XP et l'or, jamais sur l'issue.
 */
function roadClearChance(poi: Poi, escort: Adventurer[], road: EscortKit, samples = 40): number {
  const n = Math.max(1, samples);
  let clear = 0;
  for (let s = 0; s < n; s++) {
    const o = resolveCaravan(poi, escort, partyForecastSeed(s), road, 1, undefined);
    if (!o.events.some((e) => e.kind === 'bandits' && !e.won)) clear++;
  }
  return clear / n;
}

/** Une équipe pour `winGain` : ses champions et, s'il en est, le héros. */
export interface GainTeam {
  escort: Adventurer[];
  hero: PartyHero | null;
}
/**
 * 🎯➕ CE QU'UN MEMBRE APPORTE À LA RÉUSSITE, en points de % (demandé par l'utilisateur :
 * « sur chaque tuile, le +% qu'il apporte sur le lieu sélectionné, en tenant compte des
 * autres sélectionnés »). C'est la réussite AVEC lui moins la réussite SANS lui, l'équipe
 * cochée restant la même : un champion NON coché s'ajoute à l'équipe, un champion COCHÉ en
 * est retiré. L'apport dépend donc de qui est déjà là — un cinquième champion sur un lieu
 * déjà gagné à 100 % n'apporte rien.
 *
 * ⚠️ `partyWinChance` des deux côtés, jamais une formule à part : l'apport doit se lire comme
 * la différence entre deux 🎯 % que l'écran pourrait afficher. Les graines de pronostic sont
 * les mêmes des deux côtés, donc l'écart ne mesure pas du bruit mais le membre.
 * Une équipe VIDE vaut 0 % (elle ne part pas). `null` quand rien ne se combat sur ce lieu
 * (le côté qui a du monde ne se simule pas) : il n'y a alors aucun apport à annoncer.
 */
export function winGain(
  poi: Poi,
  withMember: GainTeam,
  withoutMember: GainTeam,
  road: EscortKit,
  now: number,
  samples = FORECAST_SAMPLES,
  /** 🛣️ Compter la route (défaut, comme `partyWinChance`). ⚠️ L'équipe de récolte affiche
   *  « 🎯 Gardes » et « 🛣️ Route » À PART : sa tuile passe `false` et lit la route avec
   *  `roadGain` — un apport « gardes × route » n'était affiché nulle part (signalé : la tuile
   *  annonçait +2 % quand la pastille des gardes bougeait de 6 points). */
  withRoad = true,
): number | null {
  return pctGain(
    teamWinPct(poi, withMember, road, now, samples, withRoad),
    teamWinPct(poi, withoutMember, road, now, samples, withRoad),
  );
}

/** Le 🎯 % d'une équipe TEL QUE L'ÉCRAN L'AFFICHE (arrondi) ; `'empty'` si personne ne part
 *  (elle vaut 0 %), `null` si rien ne se combat. ⚠️ Calculé UNE fois pour l'équipe cochée,
 *  il sert de base à l'apport de toutes les tuiles (`pctGain`). */
export type TeamPct = number | null | 'empty';
export function teamWinPct(
  poi: Poi,
  t: GainTeam,
  road: EscortKit,
  now: number,
  samples = FORECAST_SAMPLES,
  withRoad = true,
): TeamPct {
  if (!t.escort.length && !t.hero) return 'empty';
  const w = partyWinChance(poi, t.escort, road, t.hero, now, samples, withRoad);
  return w === null ? null : Math.round(w * 100);
}
/** Avec lui moins sans lui. Rien ne se simule du côté qui a du monde : pas d'apport à annoncer
 *  (`null`, pas « 0 % »). */
export function pctGain(withPct: TeamPct, withoutPct: TeamPct): number | null {
  if (withPct === null || withoutPct === null) return null;
  return (withPct === 'empty' ? 0 : withPct) - (withoutPct === 'empty' ? 0 : withoutPct);
}

/**
 * 🛣️ La pastille « 🛣️ Route … % sûre » d'une équipe, arrondie comme l'écran
 * (`partyRoadOdds().clear`, le même appel) ; `null` quand la route ne se joue pas (héros du
 * groupe, lieu hors récolte, escorte vide) — la règle de la pastille, pas une copie.
 */
export function roadSurePct(
  poi: Poi,
  escort: Adventurer[],
  road: EscortKit,
  hero: PartyHero | null,
  combined = false,
  samples = FORECAST_SAMPLES,
): number | null {
  const o = partyRoadOdds(poi, escort, road, hero, samples, combined);
  return o ? Math.round(o.clear * 100) : null;
}
/** 🛣️➕ Ce qu'un champion apporte à la route (deux `roadSurePct`) : `null` quand elle ne se
 *  joue pas AVEC lui ; sans lui, une escorte vide vaut 0 % (elle ne part pas). */
export function roadPctGain(withPct: number | null, withoutPct: number | null): number | null {
  return withPct === null ? null : withPct - (withoutPct ?? 0);
}
/** 🛣️➕ CE QU'UN CHAMPION APPORTE À LA ROUTE d'une récolte sans le héros, en points. */
export function roadGain(
  poi: Poi,
  withEscort: Adventurer[],
  withoutEscort: Adventurer[],
  road: EscortKit,
  hero: PartyHero | null = null,
  combined = false,
): number | null {
  return roadPctGain(
    roadSurePct(poi, withEscort, road, hero, combined),
    roadSurePct(poi, withoutEscort, road, hero, combined),
  );
}

/**
 * ⛑️➕ CE QU'UN CHAMPION APPORTE AUX PREMIERS SECOURS de la troupe, en points : la chance
 * qu'un membre tombé évite l'infirmerie (`firstAidChance`, la règle de `spareInjured`), avec
 * lui moins sans lui. Le soin ne change PAS le 🎯 % : il ne joue qu'après le combat.
 */
export function firstAidGain(withEscort: Adventurer[], withoutEscort: Adventurer[]): number {
  return (
    Math.round(firstAidChance(withEscort) * 100) - Math.round(firstAidChance(withoutEscort) * 100)
  );
}
