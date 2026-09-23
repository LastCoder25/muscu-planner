// 🎯 LA DIFFICULTÉ D'UN LIEU EN UN SEUL NOMBRE (2026-09-23) — cf. `poiDifficulty.ts`.
//
// ⚠️ CE QUE CES TESTS GARDENT : qu'un rang affiché veuille dire la même chose d'un lieu à
// l'autre. Le défaut d'origine : deux lieux « Argent ★3 », l'un pris à 93 % par trois
// champions, l'autre à 0 % avec les mêmes.
import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY_MAX_LEVEL,
  REF_POWER,
  REF_TEAM,
  difficultyLevel,
  forceShare,
  levelForDifficulty,
  refPowerAt,
} from '@/lib/poiDifficulty';
import { campFoe, campWinPct } from '@/lib/camp';
import { missionXpSplit, partyAllies, refChampionAdv, refEscortUnits } from '@/lib/caravan';
import { fuseUnits } from '@/lib/skirmish';
import { combatPowerRaw } from '@/lib/combat';
import { characterRank } from '@/lib/characterRank';
import type { CampSpec, Poi } from '@/lib/expedition';

const poiAt = (level: number): Poi =>
  ({ id: 'd', type: 'camp', level, distNorm: 0.5 }) as unknown as Poi;

/** Une équipe de `n` champions de référence du niveau `lvl`, SANS équipement.
 *  ⚠️ Les seuils de taux de victoire de ce fichier sont calés sur CE groupe : l'équiper (comme
 *  `refEscortUnits`, donc comme l'étalon de `campFoe`) le rendrait plus fort et demanderait de
 *  les re-mesurer. */
function team(n: number, lvl: number) {
  const escort = Array.from({ length: n }, (_, i) => ({ ...refChampionAdv(lvl, i), id: 'a' + i }));
  return partyAllies(escort, { advGear: [] }, null);
}

describe('la courbe de référence', () => {
  it('EST celle de l’équipe de référence, au niveau près', () => {
    // ⚠️ TEST DE FIDÉLITÉ. `REF_POWER` est tabulée pour que `poiDifficulty` n'ait aucune
    // dépendance (sinon `caravan.ts`, qui doit lire la difficulté pour l'XP, ferait un
    // cycle). Une table figée finit par mentir : celle-ci est comparée à la vraie fonction.
    // ⚠️ ET IL DONNE LA TABLE À COLLER : « régénérer depuis `refEscortUnits` » n'est outillé
    //    nulle part, donc un test qui se contente de rougir laisse une dette au suivant.
    const vrais = Array.from(
      { length: REF_POWER.length },
      (_, i) => Math.round(combatPowerRaw(fuseUnits(refEscortUnits(i + 1), 'R')) * 100) / 100,
    );
    const derive = vrais.some((v, i) => Math.abs(v - refPowerAt(i + 1)) > 0.05);
    const table = Array.from(
      { length: Math.ceil(vrais.length / 10) },
      (_, i) => '  ' + vrais.slice(i * 10, i * 10 + 10).join(', ') + ',',
    ).join('\n');
    expect(derive, `REF_POWER a dérivé — coller à la place :\n${table}`).toBe(false);
  });

  it('compte le MÊME nombre de champions que l’étalon des combats', () => {
    // Une seconde valeur ferait diverger « la force d'un lieu » de l'équipe sur laquelle
    // les combats sont calibrés.
    expect(refEscortUnits(20)).toHaveLength(REF_TEAM);
    // ⚠️ Et l'ENVELOPPE d'XP se compte dans la même unité : une équipe pleine de référence
    //    encaisse exactement le socle d'un lieu calibré sur elle.
    expect(missionXpSplit(REF_TEAM, false)).toBe(1);
  });

  it('est STRICTEMENT croissante — c’est ce qui autorise la recherche binaire', () => {
    for (let L = 2; L <= 120; L++) expect(refPowerAt(L)).toBeGreaterThan(refPowerAt(L - 1));
  });
});

describe('le niveau équivalent', () => {
  it('rend le niveau du lieu quand la force vaut une équipe PLEINE', () => {
    // La référence EST `REF_TEAM` champions : une force de cette taille vaut,
    // par construction, une équipe pleine du même niveau. Jamais un nombre écrit à la main.
    for (const L of [5, 12, 20, 35, 60, 90]) expect(difficultyLevel(L, REF_TEAM)).toBe(L);
  });

  it('DESCEND quand il y a moins d’ennemis — le nombre compte autant que le niveau', () => {
    for (const L of [15, 30, 60]) {
      const un = difficultyLevel(L, 1);
      const deux = difficultyLevel(L, 2);
      const trois = difficultyLevel(L, 3);
      expect(un).toBeLessThan(deux);
      expect(deux).toBeLessThan(trois);
      // Et l’écart est GRAND : c’est tout le défaut signalé. Au niveau 15, « 1 ennemi »
      // vaut Bronze ★2 quand « 3 ennemis » vaut Argent ★3.
      expect(characterRank(trois).tier - characterRank(un).tier).toBeGreaterThanOrEqual(3);
    }
  });

  it('rend la MÊME difficulté pour « peu de forts » et « beaucoup de faibles »', () => {
    // Qualité ↔ quantité : `fuseUnits` somme offense et survie, donc les deux sont
    // substituables. Un lieu de 3 ennemis de niveau L doit valoir un lieu d’1 ennemi d’un
    // niveau plus élevé — et c’est ce que le rang doit dire.
    for (const L of [10, 25, 50]) {
      const cible = difficultyLevel(L, 3);
      // Le niveau qu’il faut à UN seul ennemi pour valoir autant.
      const solo = levelForDifficulty(cible, 1);
      expect(difficultyLevel(solo, 1)).toBeGreaterThanOrEqual(cible);
      // Et c'est bien le PLUS PETIT : un cran en dessous n'y suffit pas.
      expect(difficultyLevel(solo - 1, 1)).toBeLessThan(cible);
      expect(solo).toBeGreaterThan(L);
    }
  });

  it('est borné des deux côtés', () => {
    expect(difficultyLevel(1, 0.1)).toBe(1);
    // ⚠️ SATURATION, pas « ≤ plafond » : une force énorme au plafond y reste, et une cible
    //    hors de portée ne fait pas déborder l'inverse non plus.
    expect(difficultyLevel(DIFFICULTY_MAX_LEVEL, 40)).toBe(DIFFICULTY_MAX_LEVEL);
    expect(difficultyLevel(150, 3)).toBe(150);
    expect(levelForDifficulty(DIFFICULTY_MAX_LEVEL, 1)).toBe(DIFFICULTY_MAX_LEVEL);
    expect(levelForDifficulty(0, 3)).toBe(1);
    // ⚠️ Une force NULLE ne porte jamais rien : sans son garde, l'inverse partirait au
    //    plafond là où le niveau 1 suffit à « atteindre » la difficulté 1.
    expect(levelForDifficulty(1, 0)).toBe(1);
  });
});

describe('la force annoncée est celle du combat', () => {
  it('`forceShare` EST le multiplicateur que `campFoe` applique', () => {
    // ⚠️ Test d’ACCORD : si les deux divergent, l’écran annonce une difficulté que le
    // combat n’applique pas. Les PV du combattant sont proportionnels à la force.
    for (const L of [8, 20, 45]) {
      const base = campFoe(poiAt(L), { faction: 'bandits', size: 3 } as CampSpec);
      for (const size of [1, 1.5, 2, 2.5]) {
        const f = campFoe(poiAt(L), { faction: 'bandits', size } as CampSpec);
        const attendu = forceShare(L, size) / forceShare(L, 3);
        expect(f.pv / base.pv).toBeCloseTo(attendu, 2);
      }
    }
  });
});

describe('deux lieux du même rang de difficulté se valent', () => {
  it('donnent des taux de victoire proches, là où le rang du NIVEAU les opposait', () => {
    // Le cas signalé : un lieu de niveau 15 à 3 ennemis et un lieu de niveau 15 à 1 ennemi
    // affichent tous deux « Argent ★3 » aujourd’hui.
    const allies = team(3, 10);
    const dur = Math.round(
      campWinPct(poiAt(15), { faction: 'bandits', size: 3 }, allies, 200) * 100,
    );
    const doux = Math.round(
      campWinPct(poiAt(15), { faction: 'bandits', size: 1 }, allies, 200) * 100,
    );
    expect(doux - dur).toBeGreaterThan(50); // l’écart que le joueur a subi
    // Alors que le rang de DIFFICULTÉ les sépare franchement.
    expect(characterRank(difficultyLevel(15, 3)).tier).toBeGreaterThan(
      characterRank(difficultyLevel(15, 1)).tier,
    );

    // Et à rang de difficulté ÉGAL, les taux se rejoignent : on cherche le niveau auquel
    // un lieu à 1 ennemi vaut le lieu de niveau 15 à 3 ennemis.
    const cible = difficultyLevel(15, 3);
    const solo = levelForDifficulty(cible, 1);
    const equiv = Math.round(
      campWinPct(poiAt(solo), { faction: 'bandits', size: 1 }, allies, 200) * 100,
    );
    expect(Math.abs(equiv - dur)).toBeLessThan(35);
  });
});
