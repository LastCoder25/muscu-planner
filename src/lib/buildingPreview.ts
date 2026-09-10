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
  bossSummonDiscount,
  labyrinthLuckBonus,
  storageMult,
  travelTimeMult,
  type Building,
} from './buildings';
import { caravanSlots, caravanSlowFor, trainMsFor } from './caravan';
import { guildRoster } from './adventurers';
import { characterRank } from './characterRank';

export interface LevelPreview {
  level: number;
  /** Ce que le bâtiment vaut À CE NIVEAU. */
  text: string;
  /** Ce niveau apporte-t-il un PALIER, et non une simple continuation ? */
  milestone?: boolean;
}

const one = (typeId: string, level: number): Building[] => [{ typeId, level, slot: 0 } as Building];
const pct = (x: number) => `${Math.round(x * 100)} %`;
const h = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

/** Le texte d'un niveau donné, par type. `null` = ce bâtiment n'a rien à prévisualiser. */
function textAt(typeId: string, level: number): string | null {
  const t = BUILDING_TYPES.find((b) => b.id === typeId);
  if (!t) return null;
  switch (typeId) {
    case 'caravanserail': {
      // Les DEUX leviers, parce que l'un est un palier et l'autre une courbe :
      // le nombre saute d'un cran tous les 9 niveaux, la vitesse gratte en continu.
      const lent = caravanSlowFor(level);
      return `${caravanSlots(level)} convoi${caravanSlots(level) > 1 ? 's' : ''} · ×${lent.toFixed(2)} le temps du héros`;
    }
    case 'guild': {
      const r = characterRank(Math.max(1, level));
      return `${guildRoster(level)} aventuriers · rang max ${r.name} ${'★'.repeat(r.star)}`;
    }
    case 'training':
      return `formation en ${h(trainMsFor(level))}`;
    case 'outpost':
      return `−${pct(1 - travelTimeMult(one(typeId, level)))} de temps de trajet`;
    case 'labyrinth_gate':
      return `+${pct(labyrinthLuckBonus(one(typeId, level)))} de chance dans les coffres`;
    case 'boss_altar':
      return `plancher de jet ${pct(bossAltarRollFloor(one(typeId, level)))} · −${pct(
        bossSummonDiscount(one(typeId, level)),
      )} de pierres`;
    case 'warehouse':
      return `stockage ×${storageMult(one(typeId, level)).toFixed(2)}`;
    default: {
      // Producteurs : le débit horaire et ce que la réserve peut contenir.
      const parH = (t.prodPerHrPerLvl ?? 0) * level;
      if (!parH) return null;
      const arr = Math.round(parH * 10) / 10;
      return `${arr}/h · réserve ${Math.round(buildingStorageCap(one(typeId, level)[0]!))}`;
    }
  }
}

/** Un niveau marque-t-il un PALIER (un saut, pas une continuation) ? */
function isMilestone(typeId: string, level: number): boolean {
  if (typeId === 'caravanserail') return caravanSlots(level) > caravanSlots(level - 1);
  if (typeId === 'guild') return guildRoster(level) > guildRoster(level - 1);
  return false;
}

/**
 * Les `count` prochains niveaux, à partir du niveau ACTUEL (inclus, marqué « maintenant »
 * par l'appelant via `level === current`).
 *
 * ⚠️ On ne s'arrête PAS au niveau du joueur : voir l'horizon est précisément l'intérêt —
 * savoir qu'un convoi de plus arrive au niveau 18 aide à décider aujourd'hui.
 */
export function buildingPreview(typeId: string, current: number, count = 6): LevelPreview[] {
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
export function nextMilestone(typeId: string, current: number, horizon = 40): LevelPreview | null {
  for (let l = current + 1; l <= current + horizon; l++) {
    if (!isMilestone(typeId, l)) continue;
    const text = textAt(typeId, l);
    if (text) return { level: l, text, milestone: true };
  }
  return null;
}
