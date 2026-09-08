import { describe, it, expect } from 'vitest';
import { buildingUpgradeCost } from '@/lib/buildings';
import { goldCost, travelOneWayMin } from '@/lib/expedition';
import { DUNGEONS, dungeonGold } from '@/data/dungeons';

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

/** Le donjon le plus profond clairable à ce niveau, et ce qu'il rend. */
function bestDungeonGold(level: number): number {
  const d = [...DUNGEONS]
    .filter((x) => x.recoLevel <= level)
    .sort((a, b) => b.recoLevel - a.recoLevel)[0];
  return d ? dungeonGold(d) : 0;
}

describe("puits d'or : pas de FALAISE à la jointure écrit → procédural", () => {
  // ⚠️ Le test précédent ne mesurait le revenu qu'en EXPÉDITIONS de mine. Or les donjons
  // paient aussi, et bien davantage : c'est là qu'était le trou. Le contenu procédural
  // repartait sur un socle plat (2500 + reco×180) qui n'avait aucun rapport avec le
  // dernier donjon écrit → ×2,97 d'or en un pas, et une économie 2,3× plus lâche à partir
  // du niveau 25 (juste là où le joueur arrive).
  const sorted = [...DUNGEONS].sort((a, b) => a.recoLevel - b.recoLevel);

  it('aucun donjon ne rend brutalement plus du double du précédent', () => {
    // On démarre au 2e : la clairière d'introduction (reco 1, 40 or) est un tutoriel, son
    // écart avec le donjon suivant ne dit rien de l'économie.
    for (let i = 2; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      const step = dungeonGold(cur) / dungeonGold(prev);
      expect(step, `reco ${prev.recoLevel} → ${cur.recoLevel} : ×${step.toFixed(2)}`).toBeLessThan(
        2,
      );
    }
  });

  it("l'or d'un donjon reste EN PHASE avec le coût d'un niveau de bâtiment, sans plateau", () => {
    // Le vrai garde-fou : le rapport « ce que rend une descente » / « ce que coûte un
    // niveau » doit rester dans une bande étroite, sinon une tranche de niveaux devient
    // une pompe à or (ce qu'était la tranche 25-50).
    const ratios = sorted
      .filter((d) => d.recoLevel >= 5)
      .map((d) => dungeonGold(d) / buildingUpgradeCost(d.recoLevel));
    for (const r of ratios) expect(r).toBeLessThan(0.13);
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(2.5);
  });

  it('une séance de donjons ne paie jamais plusieurs niveaux de bâtiment', () => {
    // ~340 ⚡ par séance de sport, ~40 ⚡ par descente → 8 descentes. Si cela payait
    // plusieurs niveaux d'un coup, le puits d'or n'absorberait plus rien.
    for (const L of LEVELS) {
      const perSession = bestDungeonGold(L) * 8;
      const levels = perSession / buildingUpgradeCost(L);
      expect(levels, `niveau ${L} : ${levels.toFixed(2)} niveau(x) par séance`).toBeLessThan(1);
    }
  });
});
