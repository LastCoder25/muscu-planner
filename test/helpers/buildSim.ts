// La SIMULATION D'UN AN de construction — l'étalon du puits d'or.
//
// ⚠️ EXTRAITE de `goldSink.test.ts` (elle y vivait en ligne) pour que la mesure du roster
// FUTUR (9 bâtiments, après la fusion du Panthéon) se fasse avec LE MÊME simulateur. Deux
// copies auraient divergé au premier réglage — et c'est très exactement par un dénominateur
// divergent que ce projet a déjà laissé passer un puits qui débordait (v0.684) puis un puits
// devenu mur (v0.733).
//
// ⚠️ LE REVENU EST LE REVENU COMPLET (`fullGoldPerDay`, v0.996), et l'ENCEINTE dépense
// aussi : mesurer le puits contre les seuls donjons + mines laissait passer la revente du
// butin, les convois, les camps, les boss et les sièges — ~+50 % de revenu au niveau 30.
import { BUILDING_TYPES, buildingUpgradeCost, plotsForLevel } from '@/lib/buildings';
import { DEFENSE_TYPES, defenseUpgradeCost } from '@/lib/raid';
import { computeLevel } from '@/lib/levels';
import { fullGoldPerDay } from './goldModel';

/** Les trois profils de joueur, en XP par jour (mesurés sur des comptes réels). */
export const PROFILS: [string, number][] = [
  ['tranquille', 400],
  ['régulier', 700],
  ['très actif', 1066],
];

export interface YearOfPlay {
  /** Part du plafond des bâtiments atteinte (niveaux bâtis ÷ (emplacements × niveau)). */
  part: number;
  /** Or qui dort en fin d'année, en JOURS de revenu. */
  bankDays: number;
  /** Part de l'or gagné sur l'année effectivement dépensée. */
  spentShare: number;
}

/**
 * Un an de jeu : le joueur achète ce qu'il peut, du moins cher au plus cher (il rattrape
 * d'abord ce qui est le plus en retard), bâtiments ET enceinte, jamais au-dessus de son
 * niveau.
 *
 * @param nbTypes nombre de bâtiments du roster — par défaut celui d'aujourd'hui.
 */
export function yearOfPlay(xpParJour: number, nbTypes = BUILDING_TYPES.length): YearOfPlay {
  const types = BUILDING_TYPES.slice(0, nbTypes);
  const niv = types.map(() => 0);
  const def = DEFENSE_TYPES.map(() => 0);
  const outpost = types.findIndex((t) => t.id === 'outpost');
  // Rythme des sièges : ~1 par jour pour un joueur très actif, ~1 tous les 3 jours sinon.
  const siegesPerDay = Math.min(1, xpParJour / 1066);
  let or = 0;
  let xp = 0;
  let earned = 0;
  let spent = 0;
  let last = 0;
  for (let j = 0; j < 365; j++) {
    xp += xpParJour;
    const L = computeLevel(xp).level;
    last = fullGoldPerDay(L, outpost < 0 ? 0 : niv[outpost]!, siegesPerDay);
    or += last;
    earned += last;
    const plots = Math.min(plotsForLevel(L), types.length);
    for (;;) {
      let best = -1;
      let wall = false;
      let bestC = Infinity;
      for (let i = 0; i < plots; i++) {
        if (niv[i]! >= L) continue;
        const c = niv[i] === 0 ? (types[i]!.buildGold ?? 500) : buildingUpgradeCost(niv[i]!);
        if (c < bestC) [bestC, best, wall] = [c, i, false];
      }
      for (let i = 0; i < def.length; i++) {
        if (def[i]! >= L) continue;
        const c = def[i] === 0 ? DEFENSE_TYPES[i]!.buildGold : defenseUpgradeCost(def[i]!);
        if (c < bestC) [bestC, best, wall] = [c, i, true];
      }
      if (best < 0 || bestC > or) break;
      or -= bestC;
      spent += bestC;
      if (wall) def[best]!++;
      else niv[best]!++;
    }
  }
  const L = computeLevel(xp).level;
  const plots = Math.min(plotsForLevel(L), types.length);
  // ⚠️ L'ENCEINTE COMPTE (v0.998) : elle est sur la même courbe d'or que la cour, donc la
  // part du plafond se mesure sur les DEUX — sinon un joueur qui néglige ses murs aurait
  // l'air « au plafond » alors que la moitié du puits dort.
  const bati = niv.slice(0, plots).reduce((a, b) => a + b, 0) + def.reduce((a, b) => a + b, 0);
  return {
    part: bati / ((plots + def.length) * L),
    bankDays: or / last,
    spentShare: spent / earned,
  };
}

/** Raccourci : la part du plafond seule. */
export function partDuPlafond(xpParJour: number, nbTypes = BUILDING_TYPES.length) {
  return yearOfPlay(xpParJour, nbTypes).part;
}
