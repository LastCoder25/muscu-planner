// 🎯 LE RANG TIRÉ EST CELUI DE LA DIFFICULTÉ (v0.1108) — cf. `placePoiOfType` et
// `levelForDifficulty`.
//
// ⚠️ CE QUE CES TESTS GARDENT. Depuis que le rang affiché dit la DIFFICULTÉ (v0.1106) et non
// le seul niveau des ennemis, tirer un rang de NIVEAU faisait glisser toute la carte vers le
// bas : mesuré, un joueur Argent ne voyait plus que 18 % de lieux à son rang au lieu de 64 %.
// Le spawn tire donc le rang de DIFFICULTÉ et en DÉRIVE le niveau des ennemis — ce qui rend
// « peu d'ennemis très forts » et « beaucoup de faibles » interchangeables à rang égal.
import { describe, it, expect } from 'vitest';
import { difficultyLevel, levelForDifficulty, DIFFICULTY_MAX_LEVEL } from '@/lib/poiDifficulty';
import { poiRank, poiDifficultyLevel } from '@/lib/poiRank';
import { characterRank } from '@/lib/characterRank';
import { advanceWorld, campSpecOf, createMap, harvestGuardOf, type Poi } from '@/lib/expedition';

/** Les lieux qui portent une force (camps, repaires, récoltes gardées) d'une carte vécue. */
function lieux(playerLevel: number, seed: number): Poi[] {
  const out = Math.min(playerLevel, 20);
  let map = createMap(seed, 0, playerLevel, out);
  for (let d = 0; d < 20; d++) map = advanceWorld(map, d * 3600_000 * 6, playerLevel, out);
  return (map.pois as Poi[]).filter((p) => campSpecOf(p) || harvestGuardOf(p));
}

describe('levelForDifficulty — l’inverse de la difficulté', () => {
  it('rend le PLUS PETIT niveau qui atteint la cible', () => {
    for (const cible of [3, 8, 15, 30, 55, 80]) {
      for (const size of [1, 1.5, 2, 2.5, 3]) {
        const L = levelForDifficulty(cible, size);
        expect(difficultyLevel(L, size), `cible ${cible}, taille ${size}`).toBeGreaterThanOrEqual(
          Math.min(cible, difficultyLevel(DIFFICULTY_MAX_LEVEL, size)),
        );
        // …et un niveau de moins ne suffit pas (sauf au plancher).
        if (L > 1) expect(difficultyLevel(L - 1, size)).toBeLessThan(cible);
      }
    }
  });

  it('MOINS d’ennemis demande un niveau PLUS ÉLEVÉ, à rang égal', () => {
    // C'est la traduction directe de « soit la qualité, soit la quantité », côté ennemi.
    for (const cible of [10, 25, 50]) {
      const un = levelForDifficulty(cible, 1);
      const trois = levelForDifficulty(cible, 3);
      expect(un, `cible ${cible}`).toBeGreaterThan(trois);
      expect(trois).toBe(cible); // une force pleine EST une équipe de son niveau
    }
  });

  it('est borné : aux plus hauts rangs, « un seul ennemi » n’existe pas', () => {
    // Il faudrait un ennemi plus fort que ce que le plafond du jeu produit. On rend alors le
    // niveau maximal — et le rang affiché, qui est CALCULÉ, dira la difficulté réelle plutôt
    // que la cible manquée.
    const L = levelForDifficulty(DIFFICULTY_MAX_LEVEL, 1);
    expect(L).toBe(DIFFICULTY_MAX_LEVEL);
    expect(difficultyLevel(L, 1)).toBeLessThan(DIFFICULTY_MAX_LEVEL);
  });
});

describe('le spawn tire un rang de DIFFICULTÉ', () => {
  it('la carte couvre les rangs JUSQU’À celui du joueur', () => {
    // ⚠️ LE TEST QUI ATTRAPE LA RÉGRESSION : sans dérivation, la difficulté des lieux glisse
    // sous le rang tiré et le haut de la carte se vide. On exige donc une part réelle de
    // lieux au rang du joueur, et pas seulement leur existence.
    for (const PL of [15, 30, 60]) {
      const top = characterRank(PL).rankIndex;
      let auRang = 0;
      let total = 0;
      for (let s = 1; s <= 6; s++)
        for (const p of lieux(PL, s * 977)) {
          total++;
          if (poiRank(p).rankIndex >= top) auRang++;
        }
      expect(total, `joueur ${PL}`).toBeGreaterThan(50);
      expect(auRang / total, `joueur ${PL}`).toBeGreaterThan(0.15);
    }
  });

  it('…et garde du BAS pour les champions en retard', () => {
    // L'autre moitié de la promesse (v0.1028) : un joueur avancé doit encore trouver du
    // Bronze où envoyer ses recrues.
    for (const PL of [30, 60]) {
      const bas = lieux(PL, 4242).filter((p) => poiRank(p).rankIndex === 0);
      expect(bas.length, `joueur ${PL}`).toBeGreaterThan(0);
    }
  });

  it('le NIVEAU des ennemis est dérivé, pas tiré : il monte quand ils sont peu', () => {
    // À rang de difficulté comparable, un lieu qui n'aligne qu'un ennemi lui donne un niveau
    // plus élevé. Sans la dérivation, les deux porteraient le même.
    const petits: number[] = [];
    const gros: number[] = [];
    for (let s = 1; s <= 6; s++)
      for (const p of lieux(30, s * 977)) {
        const spec = campSpecOf(p) ?? harvestGuardOf(p)!;
        (spec.size <= 1.2 ? petits : spec.size >= 2.5 ? gros : []).push(p.level);
      }
    expect(petits.length).toBeGreaterThan(5);
    expect(gros.length).toBeGreaterThan(5);
    const med = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
    expect(med(petits)).toBeGreaterThan(med(gros));
  });

  it('le rang AFFICHÉ reste dans la fenêtre des rangs tirés', () => {
    // La difficulté, elle, est bornée — c'est le niveau des ennemis qui ne l'est plus.
    for (const PL of [15, 30, 60])
      for (const p of lieux(PL, 4242))
        expect(poiDifficultyLevel(p), `${p.id} (niv ${p.level})`).toBeLessThanOrEqual(
          Math.round(PL * 1.3),
        );
  });
});
