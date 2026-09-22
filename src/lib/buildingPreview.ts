// 🔭 « QU'EST-CE QUE ÇA ME DONNE AUX PROCHAINS NIVEAUX ? »
//
// ⚠️ La fiche d'un bâtiment disait ce qu'un niveau change (`perLevelNote`, v0.683) mais
// jamais COMBIEN, ni à quel palier. Or plusieurs effets ne sont pas linéaires — les
// convois arrivent tous les 9 niveaux, la vitesse suit une courbe asymptotique — donc
// « convois plus rapides à chaque niveau » ne permet pas de décider d'un investissement
// qui se compte en centaines de milliers d'or.
//
// ⚠️ CHAQUE LIGNE EST CALCULÉE PAR LA FONCTION DU JEU, jamais par une formule recopiée.
// C'est la seule façon qu'elle ne mente jamais : si l'équilibrage bouge, l'aperçu suit.
// (Le projet s'est déjà fait avoir deux fois par une règle dupliquée — libellés de POI,
// budget de ferraille.)
//
// ⚠️ Ce module vit à part de `buildings.ts` pour éviter un CYCLE : il a besoin de
// `caravan.ts` et `adventurers.ts`, qui dépendent déjà d'autres briques du domaine.

import {
  BUILDING_TYPES,
  buildingStorageCap,
  bossAltarRollFloor,
  labyrinthLuckBonus,
  travelTimeMult,
  type Building,
  type BuildingTypeId,
} from './buildings';
import { caravanSlots } from './caravan';
import { altarLuckBonus } from './items';

export interface LevelPreview {
  level: number;
  /** Ce que le bâtiment vaut À CE NIVEAU. */
  text: string;
  /** Ce niveau apporte-t-il un PALIER, et non une simple continuation ? */
  milestone?: boolean;
}

const one = (typeId: BuildingTypeId, level: number): Building[] => [
  { typeId, level, slot: 0 } as Building,
];
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Le texte d'un niveau donné, par type. `null` = ce bâtiment n'a rien à prévisualiser. */
function textAt(typeId: BuildingTypeId, level: number): string | null {
  const t = BUILDING_TYPES.find((b) => b.id === typeId);
  if (!t) return null;
  // ⚠️ CHAQUE BÂTIMENT GÈRE SA PRODUCTION ET SA RÉSERVE (plus d'Entrepôt) : un producteur
  // — Dynamo, mais aussi la Porte (🗝️) et l'Autel (🔮) — annonce son débit ET le maximum
  // qu'il peut stocker, les deux montant avec SON niveau. Calculés par les fonctions du
  // jeu, jamais recopiés.
  const parH = (t.prodPerHrPerLvl ?? 0) * level;
  const prod = parH
    ? `${Math.round(parH * 10) / 10}/h · réserve ${Math.round(buildingStorageCap(one(typeId, level)[0]!))}`
    : '';
  const withProd = (s: string) => (prod ? `${s} · ${prod}` : s);
  switch (typeId) {
    case 'pantheon':
      // ⚠️ SON VRAI LEVIER, et le plus fort des trois (demandé — « enlève le nombre
      // d'engagés et le temps de forge ») : le NIVEAU MAXIMAL d'un champion, qui vaut
      // exactement le niveau du Panthéon (`grantAdvXp`). Le niveau DOMINE la rareté (×4,3
      // au niveau 23), donc c'est lui qui décide de ce que vaut un champion — les deux
      // autres chiffres encombraient la ligne sans rien dire d’aussi décisif.
      return `champions jusqu'au niveau ${Math.max(1, level)}`;
    case 'outpost': {
      // ⚠️ DEUX LEVIERS (v0.1033) : le TRAJET DU HÉROS, qui gratte à chaque cran, et un PALIER
      // (une équipe de plus tous les 9 niveaux). Le troisième — la vitesse des convois — a
      // disparu avec eux : les champions vont au pas du héros sans Avant-poste.
      const n = caravanSlots(level);
      return `−${pct(1 - travelTimeMult(one(typeId, level)))} de trajet (héros) · ${n} équipe${n > 1 ? 's' : ''} en parallèle`;
    }
    case 'labyrinth_gate':
      return withProd(`+${pct(labyrinthLuckBonus(one(typeId, level)))} de chance dans les coffres`);
    case 'boss_altar':
      // ⚠️ Depuis la v0.875 (objets au rang du joueur) : de la CHANCE, qui améliore le jet et
      // resserre la traîne basse — jamais un rang au-dessus (v0.876).
      return withProd(
        `pièces de boss : +${pct(altarLuckBonus(bossAltarRollFloor(one(typeId, level))))} de chance`,
      );
    default:
      // Producteurs purs : le débit horaire et ce que la réserve peut contenir.
      return prod || null;
  }
}

/** Un niveau marque-t-il un PALIER (un saut, pas une continuation) ? */
function isMilestone(typeId: BuildingTypeId, level: number): boolean {
  if (typeId === 'outpost') return caravanSlots(level) > caravanSlots(level - 1);
  return false;
}

/**
 * Les `count` prochains niveaux, à partir du niveau ACTUEL (inclus, marqué « maintenant »
 * par l'appelant via `level === current`).
 *
 * ⚠️ On ne s'arrête PAS au niveau du joueur : voir l'horizon est précisément l'intérêt —
 * savoir qu'un convoi de plus arrive au niveau 18 aide à décider aujourd'hui.
 */
export function buildingPreview(
  typeId: BuildingTypeId,
  current: number,
  count = 6,
): LevelPreview[] {
  const out: LevelPreview[] = [];
  for (let l = current; l <= current + count; l++) {
    const text = textAt(typeId, l);
    if (text === null) return [];
    // On n'affiche pas deux fois la même ligne : un palier qui ne change rien n'apprend
    // rien. (Impossible depuis « aucun niveau mort » (v0.731), mais si un jour un effet
    // se remet à stagner, l'aperçu ne le déguisera pas en progression.)
    if (out.length && out[out.length - 1]!.text === text) continue;
    out.push({ level: l, text, milestone: isMilestone(typeId, l) });
  }
  return out;
}

/** Le PROCHAIN palier notable, quand il est plus loin que l'aperçu ne va.
 *  ⚠️ Sans ça, un Comptoir de niveau 10 montre six lignes de vitesse et laisse croire
 *  que le convoi suivant n'arrivera jamais. */
export function nextMilestone(
  typeId: BuildingTypeId,
  current: number,
  horizon = 40,
): LevelPreview | null {
  for (let l = current + 1; l <= current + horizon; l++) {
    if (!isMilestone(typeId, l)) continue;
    const text = textAt(typeId, l);
    if (text) return { level: l, text, milestone: true };
  }
  return null;
}
