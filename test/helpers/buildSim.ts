// La SIMULATION D'UN AN de construction — l'étalon du puits d'or.
//
// ⚠️ EXTRAITE de `goldSink.test.ts` (elle y vivait en ligne) pour que la mesure du roster
// FUTUR (9 bâtiments, après la fusion du Panthéon) se fasse avec LE MÊME simulateur. Deux
// copies auraient divergé au premier réglage — et c'est très exactement par un dénominateur
// divergent que ce projet a déjà laissé passer un puits qui débordait (v0.684) puis un puits
// devenu mur (v0.733).
import { BUILDING_TYPES, buildingUpgradeCost, plotsForLevel } from '@/lib/buildings';
import { computeLevel } from '@/lib/levels';
import { goldPerDay } from './goldModel';

/** Les trois profils de joueur, en XP par jour (mesurés sur des comptes réels). */
export const PROFILS: [string, number][] = [
  ['tranquille', 400],
  ['régulier', 700],
  ['très actif', 1066],
];

/**
 * Un an de jeu : le joueur achète ce qu'il peut, du moins cher au plus cher (il rattrape
 * d'abord ce qui est le plus en retard), jamais au-dessus de son niveau.
 *
 * @param nbTypes nombre de bâtiments du roster — par défaut celui d'aujourd'hui.
 * @returns la PART du plafond atteinte (niveaux bâtis ÷ (emplacements × niveau)).
 */
export function partDuPlafond(xpParJour: number, nbTypes = BUILDING_TYPES.length) {
  const types = BUILDING_TYPES.slice(0, nbTypes);
  const niv = types.map(() => 0);
  let or = 0;
  let xp = 0;
  for (let j = 0; j < 365; j++) {
    xp += xpParJour;
    const L = computeLevel(xp).level;
    or += goldPerDay(L);
    const plots = Math.min(plotsForLevel(L), types.length);
    for (;;) {
      let best = -1;
      let bestC = Infinity;
      for (let i = 0; i < plots; i++) {
        if (niv[i]! >= L) continue;
        const c = niv[i] === 0 ? (types[i]!.buildGold ?? 500) : buildingUpgradeCost(niv[i]!);
        if (c < bestC) {
          bestC = c;
          best = i;
        }
      }
      if (best < 0 || bestC > or) break;
      or -= bestC;
      niv[best]!++;
    }
  }
  const L = computeLevel(xp).level;
  const plots = Math.min(plotsForLevel(L), types.length);
  return niv.slice(0, plots).reduce((a, b) => a + b, 0) / (plots * L);
}
