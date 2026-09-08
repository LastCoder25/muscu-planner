import { describe, it, expect } from 'vitest';
import { buildingUpgradeCost } from '@/lib/buildings';
import { goldCost, travelOneWayMin } from '@/lib/expedition';

/** Net d'une mine à distance moyenne : la meilleure source d'or RÉGULIÈRE du jeu.
 *  (Les donjons en donnent autant, mais l'expédition est l'unité de référence ici.) */
function mineNet(level: number): number {
  const rth = (2 * travelOneWayMin(level, 0.5)) / 60; // heures aller-retour
  const cost = goldCost('mine', level);
  return Math.round(cost * (1.8 + rth)) - cost;
}

const LEVELS = [5, 10, 15, 20, 26, 35, 50, 70, 100];

describe("puits d'or : le coût des bâtiments reste EN PHASE avec le revenu", () => {
  // Le vrai invariant du système économique. Il a été violé une fois (upExp monté à 2,6
  // pour « créer un puits ») : le coût divergeait en L^2.6 face à un revenu en L^1.6, et
  // à haut niveau plus aucune amélioration n'était payable. Ce test rend la régression
  // impossible à réintroduire en silence.
  it('un niveau de bâtiment coûte un nombre BORNÉ d’expéditions, à tout niveau', () => {
    for (const L of LEVELS) {
      const ratio = buildingUpgradeCost(L) / mineNet(L);
      expect(ratio, `niveau ${L} : ${ratio.toFixed(1)} expéditions`).toBeGreaterThan(2);
      expect(ratio, `niveau ${L} : ${ratio.toFixed(1)} expéditions`).toBeLessThan(9);
    }
  });

  it('le ratio ne DÉRIVE pas avec le niveau (pas d’emballement)', () => {
    const ratios = LEVELS.map((L) => buildingUpgradeCost(L) / mineNet(L));
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    // Avec l'ancien exposant l'écart était de ~8,5× entre le niveau 5 et 100.
    expect(max / min, `écart ${min.toFixed(1)} → ${max.toFixed(1)}`).toBeLessThan(2);
  });

  it('reste un vrai puits : améliorer coûte toujours plusieurs expéditions', () => {
    for (const L of LEVELS) {
      expect(buildingUpgradeCost(L)).toBeGreaterThan(mineNet(L) * 2);
    }
  });

  it('le coût reste strictement croissant avec le niveau', () => {
    for (let L = 2; L <= 100; L++) {
      expect(buildingUpgradeCost(L)).toBeGreaterThan(buildingUpgradeCost(L - 1));
    }
  });
});
