// 🏅 LE FILTRE DE DIFFICULTÉ DE LA CARTE — cf. `poiRankCounts` (poiDifficulty.ts).
//
// ⚠️ RÉÉCRIT le 2026-09-23. Il épinglait « le rang d'un lieu = `characterRank(p.level)` »,
// c'est-à-dire précisément ce qui a changé : le rang affiché dit maintenant la DIFFICULTÉ
// (niveau × nombre d'ennemis) et non plus le seul niveau. Ce qui reste vrai, et qui compte
// davantage, c'est l'ACCORD : le filtre doit ranger les lieux exactement là où la pastille
// les affiche — sinon filtrer « Argent » cesse de montrer les lieux marqués Argent.
import { describe, it, expect } from 'vitest';
import { poiRank, poiRankCounts } from '@/lib/poiDifficulty';
import { characterRank } from '@/lib/characterRank';
import { campSpecOf, harvestGuardOf, type Poi } from '@/lib/expedition';

const lieu = (id: string, level: number, type: Poi['type'] = 'camp') =>
  ({ id, level, type }) as Pick<Poi, 'id' | 'type' | 'level'>;

describe('poiRankCounts — les options du filtre de difficulté de la carte', () => {
  it('range chaque lieu là où sa PASTILLE l’affiche', () => {
    // Test d'ACCORD : une seconde définition du rang ferait mentir le filtre.
    const pois = [
      lieu('a', 35),
      lieu('b', 3),
      lieu('c', 8, 'lair'),
      lieu('d', 15, 'mine'),
      lieu('e', 60, 'arena'),
    ];
    const attendu = new Map<number, number>();
    for (const p of pois) {
      const r = poiRank(p).rankIndex;
      attendu.set(r, (attendu.get(r) ?? 0) + 1);
    }
    for (const { rankIndex, count } of poiRankCounts(pois))
      expect(count).toBe(attendu.get(rankIndex));
  });

  it('rend les rangs du plus bas au plus haut, et aucun rang vide', () => {
    const pois = [lieu('a', 35), lieu('b', 3), lieu('c', 8), lieu('d', 90)];
    const out = poiRankCounts(pois);
    expect(out.every((o) => o.count > 0)).toBe(true);
    for (let i = 1; i < out.length; i++)
      expect(out[i]!.rankIndex).toBeGreaterThan(out[i - 1]!.rankIndex);
    expect(out.reduce((s, o) => s + o.count, 0)).toBe(pois.length);
  });

  it('ne propose rien sur une carte vide', () => {
    expect(poiRankCounts([])).toEqual([]);
  });

  it('un lieu SANS ennemis à compter garde le rang de son niveau', () => {
    // L'arène se joue au héros seul, la faille affiche son effectif à côté : leur rang
    // reste celui de leur niveau (décision v0.928 pour les failles).
    for (const lvl of [5, 22, 61])
      expect(poiRank(lieu('x', lvl, 'arena')).rankIndex).toBe(characterRank(lvl).rankIndex);
  });

  it('classe PLUS HAUT le lieu qui aligne le plus d’ennemis, à niveau égal', () => {
    // Le défaut d'origine : deux lieux du même niveau mais de tailles différentes
    // portaient la MÊME étiquette. On cherche deux vrais ids (la taille est dérivée de
    // l'id) et on vérifie que le rang les sépare enfin.
    const L = 15;
    let petit: string | null = null;
    let gros: string | null = null;
    for (let i = 0; i < 500 && (!petit || !gros); i++) {
      const id = 'poi_' + i.toString(36);
      const spec = campSpecOf({ id, type: 'camp' });
      if (!spec) continue;
      if (spec.size === 1) petit ??= id;
      if (spec.size === 2) gros ??= id;
    }
    expect(petit).not.toBeNull();
    expect(gros).not.toBeNull();
    expect(poiRank(lieu(gros!, L)).tier).toBeGreaterThan(poiRank(lieu(petit!, L)).tier);
  });

  it('compte AUSSI les gardes d’un lieu de récolte', () => {
    // ⚠️ Ce cas manquait, et c'est celui qui a été signalé : une mine gardée affichait le
    // rang de son niveau alors que ses gardes ne pèsent jamais une équipe pleine
    // (`HARVEST_GUARD_SIZES` s'arrête à 2,5). Son rang doit donc descendre.
    const L = 30;
    for (const type of ['mine', 'well', 'shrine', 'archive', 'mana_mine'] as const) {
      let vu = 0;
      for (let i = 0; i < 40; i++) {
        const id = 'h_' + i.toString(36);
        const g = harvestGuardOf({ id, type, level: L });
        if (!g) continue;
        vu++;
        expect(g.size).toBeLessThan(3);
        expect(poiRank(lieu(id, L, type)).tier).toBeLessThan(characterRank(L).tier);
      }
      expect(vu).toBeGreaterThan(0);
    }
  });
});
