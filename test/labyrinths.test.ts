import { describe, it, expect } from 'vitest';
import {
  LABYRINTHS,
  labyClearId,
  labyrinthUnlockedTier,
  labyrinthCleared,
  frontierLabyrinth,
  deathKeepFraction,
  labyKeyCost,
  keysAfterPaying,
  replayKeysInfo,
  normalizeLabyStats,
  labyRunStarted,
  labyRunCleared,
  labySuccessPct,
  labyIdOfClear,
  type LabyStats,
} from '@/data/labyrinths';
import { buildingProdPerHour, buildingStorageCap } from '@/lib/buildings';
import { RANK_ORDER, RARITY_RANK, rankCeilingForLevel } from '@/lib/items';

describe('labyrinths — ladder de paliers', () => {
  it('paliers ordonnés (recoLevel + étages croissants)', () => {
    for (let i = 1; i < LABYRINTHS.length; i++) {
      expect(LABYRINTHS[i]!.recoLevel).toBeGreaterThan(LABYRINTHS[i - 1]!.recoLevel);
      expect(LABYRINTHS[i]!.floors).toBeGreaterThanOrEqual(LABYRINTHS[i - 1]!.floors);
      expect(LABYRINTHS[i]!.dropLevel).toBeGreaterThan(LABYRINTHS[i - 1]!.dropLevel);
      expect(LABYRINTHS[i]!.luck).toBeGreaterThanOrEqual(LABYRINTHS[i - 1]!.luck);
    }
  });

  it('paliers : raretés valides, croissantes (10 paliers)', () => {
    expect(LABYRINTHS).toHaveLength(10);
    let prev = -1;
    for (const l of LABYRINTHS) {
      expect(RANK_ORDER).toContain(l.rank); // rareté valide
      expect(RARITY_RANK[l.rank]).toBeGreaterThanOrEqual(prev); // croissant
      prev = RARITY_RANK[l.rank];
    }
  });

  it('le premier palier est toujours débloqué, les autres non', () => {
    expect(labyrinthUnlockedTier(LABYRINTHS[0]!.id, [])).toBe(true);
    expect(labyrinthUnlockedTier(LABYRINTHS[1]!.id, [])).toBe(false);
  });

  it('un palier se débloque en nettoyant le précédent', () => {
    const cleared = [labyClearId(LABYRINTHS[0]!.id)];
    expect(labyrinthUnlockedTier(LABYRINTHS[1]!.id, cleared)).toBe(true);
    expect(labyrinthUnlockedTier(LABYRINTHS[2]!.id, cleared)).toBe(false); // pas encore
    expect(labyrinthCleared(LABYRINTHS[0]!.id, cleared)).toBe(true);
    expect(labyrinthCleared(LABYRINTHS[1]!.id, cleared)).toBe(false);
  });

  it('frontierLabyrinth = premier palier non nettoyé', () => {
    expect(frontierLabyrinth([]).id).toBe(LABYRINTHS[0]!.id);
    expect(frontierLabyrinth([labyClearId(LABYRINTHS[0]!.id)]).id).toBe(LABYRINTHS[1]!.id);
  });

  it('id inconnu → verrouillé', () => {
    expect(labyrinthUnlockedTier('inconnu', [])).toBe(false);
  });

  it('perte à la mort liée à la profondeur : premier palier pardonne le plus, décroissant', () => {
    expect(deathKeepFraction(LABYRINTHS[0]!.id)).toBe(1);
    expect(deathKeepFraction(LABYRINTHS[LABYRINTHS.length - 1]!.id)).toBeLessThan(
      deathKeepFraction(LABYRINTHS[0]!.id),
    );
    for (let i = 1; i < LABYRINTHS.length; i++) {
      expect(deathKeepFraction(LABYRINTHS[i]!.id)).toBeLessThanOrEqual(
        deathKeepFraction(LABYRINTHS[i - 1]!.id),
      );
    }
    expect(deathKeepFraction(LABYRINTHS[LABYRINTHS.length - 1]!.id)).toBeGreaterThanOrEqual(0.4);
  });
});

describe('🗝️ UNE CLÉ EST UNE MONNAIE : le prix suit la profondeur', () => {
  /** Clés gagnées par jour au niveau L : la Porte du Labyrinthe au niveau du joueur (deux
   *  récoltes), plus ~2,7 venant de tout le reste — mesuré en v0.794 (donjons 2 %, boss 6 %,
   *  archives, convois). */
  const clesParJour = (L: number) => {
    const b = { id: 'g', typeId: 'labyrinth_gate', level: L, collectedAt: 0 };
    return Math.min(buildingProdPerHour(b) * 12, buildingStorageCap(b)) * 2 + 2.7;
  };
  /** Le palier le plus profond dont le niveau conseillé est atteint. */
  const pointe = (L: number) => {
    let t = LABYRINTHS[0]!;
    for (const l of LABYRINTHS) if (l.recoLevel <= L) t = l;
    return t;
  };

  it('les trois premiers paliers restent à UNE clé — le début de partie ne bouge pas', () => {
    for (const l of LABYRINTHS.slice(0, 3)) expect(labyKeyCost(l.id)).toBe(1);
  });

  it('le prix ne baisse jamais en descendant, et le fond coûte plus cher que la surface', () => {
    for (let i = 1; i < LABYRINTHS.length; i++) {
      expect(labyKeyCost(LABYRINTHS[i]!.id)).toBeGreaterThanOrEqual(
        labyKeyCost(LABYRINTHS[i - 1]!.id),
      );
    }
    expect(labyKeyCost(LABYRINTHS[LABYRINTHS.length - 1]!.id)).toBeGreaterThan(2);
  });

  it('⚠️ LE PALIER DE POINTE RESTE FINANÇABLE 2 À 5 FOIS PAR JOUR, du niveau 3 au niveau 100', () => {
    // Mesuré à une clé par run : 3 runs/jour au niveau 3, **17 au niveau 100** — le robinet de
    // la Porte grandit avec le niveau, et le Labyrinthe (seule source de familiers) devenait
    // une boucle de farm. La propriété est une courbe PLATE, pas une valeur.
    for (let L = 3; L <= 100; L++) {
      const runs = clesParJour(L) / labyKeyCost(pointe(L).id);
      expect(runs, `niveau ${L}`).toBeGreaterThanOrEqual(2);
      expect(runs, `niveau ${L}`).toBeLessThanOrEqual(5);
    }
  });
});

describe('🗝️ EN FIN DE RUN, ON SAIT SI L’ON PEUT REJOUER', () => {
  it('compte les runs du même palier que les clés paient', () => {
    expect(replayKeysInfo(7, 3)).toMatchObject({ keys: 7, runs: 2, missing: 0 });
    expect(replayKeysInfo(3, 3)).toMatchObject({ runs: 1, missing: 0 });
    expect(replayKeysInfo(7, 3).label).toContain('2 fois');
  });

  it('dit combien il en manque quand on ne peut pas rejouer', () => {
    expect(replayKeysInfo(1, 3)).toMatchObject({ runs: 0, missing: 2 });
    expect(replayKeysInfo(0, 2).label).toContain('il en manque 2');
    expect(replayKeysInfo(1, 3).label).toContain('1 clé ');
  });

  it('parle comme `keysAfterPaying` : rejouer une fois ⇔ le paiement passe', () => {
    for (let keys = 0; keys <= 12; keys++)
      for (const cost of [0, 0.5, 1, 2, 3, 4])
        expect(replayKeysInfo(keys, cost).runs > 0, `${keys} clés, prix ${cost}`).toBe(
          keysAfterPaying(keys, cost) !== null,
        );
  });
});

describe('🗝️ ON PAIE LE PRIX ENTIER', () => {
  // ⚠️ Relevé non traité de la v0.799 : la vérification vivait dans le store, hors des tests.
  it('le compte exact passe, et il ne reste rien', () => {
    expect(keysAfterPaying(3, 3)).toBe(0);
    expect(keysAfterPaying(7, 2)).toBe(5);
  });

  it('⚠️ une clé pour trois ne fait PAS entrer', () => {
    expect(keysAfterPaying(1, 3)).toBeNull();
    expect(keysAfterPaying(2, 3)).toBeNull();
    expect(keysAfterPaying(0, 1)).toBeNull();
  });

  it('à chaque palier : une clé de moins que le prix est refusée, le prix passe', () => {
    for (const l of LABYRINTHS) {
      const prix = labyKeyCost(l.id);
      expect(keysAfterPaying(prix - 1, prix), l.id).toBeNull();
      expect(keysAfterPaying(prix, prix), l.id).toBe(0);
    }
  });

  it('un coût nul ou fractionnaire coûte au moins une clé', () => {
    expect(keysAfterPaying(0, 0)).toBeNull();
    expect(keysAfterPaying(1, 0)).toBe(0);
    expect(keysAfterPaying(1, 0.5)).toBe(0);
    expect(keysAfterPaying(5, 2.9)).toBe(3);
  });
});

describe('labyrinths — % de réussite RÉEL du joueur', () => {
  it('un run compte au lancement, un nettoyage au clear, et le % en découle', () => {
    let s = normalizeLabyStats(null);
    expect(labySuccessPct(s, 'novice')).toBeNull(); // jamais lancé
    s = labyRunStarted(s, 'novice');
    expect(labySuccessPct(s, 'novice')).toBe(0);
    s = labyRunCleared(s, 'novice');
    expect(labySuccessPct(s, 'novice')).toBe(100);
    s = labyRunStarted(labyRunStarted(s, 'novice'), 'novice'); // 2 morts
    expect(s.novice).toEqual({ runs: 3, clears: 1 });
    expect(labySuccessPct(s, 'novice')).toBe(33);
    expect(labySuccessPct(s, 'sentiers')).toBeNull(); // un autre palier reste vierge
  });

  it('un nettoyage sans lancement enregistré ne fait jamais dépasser 100 %', () => {
    const s = labyRunCleared({}, 'novice');
    expect(s.novice).toEqual({ runs: 1, clears: 1 });
    expect(labySuccessPct({ novice: { runs: 2, clears: 5 } }, 'novice')).toBe(100);
  });

  it('les fonctions ne modifient pas les compteurs reçus', () => {
    const s: LabyStats = { novice: { runs: 1, clears: 0 } };
    labyRunStarted(s, 'novice');
    labyRunCleared(s, 'novice');
    expect(s).toEqual({ novice: { runs: 1, clears: 0 } });
  });

  it('relecture défensive du JSONB', () => {
    expect(normalizeLabyStats([])).toEqual({});
    expect(
      normalizeLabyStats({
        novice: { runs: 4.7, clears: 9 },
        sentiers: { runs: -2, clears: 1 },
        cryptes: 'x',
        abysse: { runs: 3 },
      }),
    ).toEqual({ novice: { runs: 4, clears: 4 }, abysse: { runs: 3, clears: 0 } });
  });

  it('retrouve le palier d’un id nettoyé', () => {
    expect(labyIdOfClear(labyClearId('gouffre'))).toBe('gouffre');
    expect(labyIdOfClear('caverne')).toBeNull();
    expect(labyIdOfClear(undefined)).toBeNull();
  });
});
