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
  refPowerAt,
} from '@/lib/poiDifficulty';
import { campFoe, campWinPct } from '@/lib/camp';
import { partyAllies, refChampionAdv, refEscortUnits, CARAVAN } from '@/lib/caravan';
import { fuseUnits } from '@/lib/skirmish';
import { combatPowerRaw } from '@/lib/combat';
import { characterRank } from '@/lib/characterRank';
import type { CampSpec, Poi } from '@/lib/expedition';

const poiAt = (level: number): Poi =>
  ({ id: 'd', type: 'camp', level, distNorm: 0.5 }) as unknown as Poi;

/** Une équipe de `n` champions de référence du niveau `lvl`, comme la carte la construit. */
function team(n: number, lvl: number) {
  const escort = Array.from({ length: n }, (_, i) => ({ ...refChampionAdv(lvl, i), id: 'a' + i }));
  return partyAllies(escort, { advGear: [] }, null);
}

describe('la courbe de référence', () => {
  it('EST celle de l’équipe de référence, au niveau près', () => {
    // ⚠️ TEST DE FIDÉLITÉ. `REF_POWER` est tabulée pour que `poiDifficulty` n'ait aucune
    // dépendance (sinon `caravan.ts`, qui doit lire la difficulté pour l'XP, ferait un
    // cycle). Une table figée finit par mentir : celle-ci est comparée à la vraie fonction.
    for (let L = 1; L <= REF_POWER.length; L++) {
      const vrai = combatPowerRaw(fuseUnits(refEscortUnits(L), 'R'));
      expect(refPowerAt(L)).toBeCloseTo(vrai, 1);
    }
  });

  it('compte le MÊME nombre de champions que l’étalon des combats', () => {
    // Une seconde valeur ferait diverger « la force d'un lieu » de l'équipe sur laquelle
    // les combats sont calibrés.
    expect(REF_TEAM).toBe(CARAVAN.refEscort);
    expect(refEscortUnits(20)).toHaveLength(REF_TEAM);
  });

  it('est STRICTEMENT croissante — c’est ce qui autorise la recherche binaire', () => {
    for (let L = 2; L <= 120; L++) expect(refPowerAt(L)).toBeGreaterThan(refPowerAt(L - 1));
  });
});

describe('le niveau équivalent', () => {
  it('rend le niveau du lieu quand la force vaut une équipe PLEINE', () => {
    // La référence EST `CARAVAN.refEscort` champions : une force de cette taille vaut,
    // par construction, une équipe pleine du même niveau. Jamais un nombre écrit à la main.
    for (const L of [5, 12, 20, 35, 60, 90]) expect(difficultyLevel(L, CARAVAN.refEscort)).toBe(L);
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
      let solo = L;
      while (solo < DIFFICULTY_MAX_LEVEL && difficultyLevel(solo, 1) < cible) solo++;
      expect(difficultyLevel(solo, 1)).toBeGreaterThanOrEqual(cible);
      expect(solo).toBeGreaterThan(L);
    }
  });

  it('est borné des deux côtés', () => {
    expect(difficultyLevel(1, 0.1)).toBe(1);
    expect(difficultyLevel(DIFFICULTY_MAX_LEVEL, 3)).toBeLessThanOrEqual(DIFFICULTY_MAX_LEVEL);
    expect(difficultyLevel(150, 3)).toBeLessThanOrEqual(DIFFICULTY_MAX_LEVEL);
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
    expect(characterRank(15).tier).toBe(characterRank(15).tier); // même étiquette aujourd’hui
    // Alors que le rang de DIFFICULTÉ les sépare franchement.
    expect(characterRank(difficultyLevel(15, 3)).tier).toBeGreaterThan(
      characterRank(difficultyLevel(15, 1)).tier,
    );

    // Et à rang de difficulté ÉGAL, les taux se rejoignent : on cherche le niveau auquel
    // un lieu à 1 ennemi vaut le lieu de niveau 15 à 3 ennemis.
    const cible = difficultyLevel(15, 3);
    let solo = 15;
    while (solo < 120 && difficultyLevel(solo, 1) < cible) solo++;
    const equiv = Math.round(
      campWinPct(poiAt(solo), { faction: 'bandits', size: 1 }, allies, 200) * 100,
    );
    expect(Math.abs(equiv - dur)).toBeLessThan(35);
  });
});
