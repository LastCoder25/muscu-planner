import { describe, it, expect } from 'vitest';
import {
  buildReveal,
  buildLotReveal,
  cellOf,
  cellOfChampion,
  igniteOrder,
  bestRank,
  finalRank,
  singleSequenceMs,
  lotSequenceMs,
  apexMs,
  silhouetteMs,
  INVOKE,
  SURPRISE,
  GRADE_RANK,
  RANK_GRADE,
  bestOfLot,
  lotOrder,
  omenOf,
  OMEN_STRENGTH,
  type LotItem,
  type RevealCell,
  type RevealPlan,
} from '@/lib/gachaReveal';
import { CHAMPIONS, PULL_GRADES, type PullGrade } from '@/data/champions';
import { mulberry32 } from '@/lib/combat';

const champS = CHAMPIONS.find((c) => c.grade === 'S')!;
const champA = CHAMPIONS.find((c) => c.grade === 'A')!;
const S = cellOfChampion(champS);
const A = cellOfChampion(champA);
const B: RevealCell = { grade: 'B', emoji: '🗡️', name: 'Épée', championId: null };
const CELL: Record<PullGrade, RevealCell> = { B, A, S };

const it0 = (g: PullGrade, extra: Partial<LotItem> = {}): LotItem => ({
  grade: g,
  champion: g === 'S' ? champS : g === 'A' ? champA : null,
  gear: g === 'B' ? { name: 'Épée', emoji: '🗡️' } : null,
  duplicate: false,
  copies: g === 'B' ? 0 : 1,
  manaBack: 0,
  ...extra,
});

/** Le présage d'une orbe est honnête : croissant, et il finit sur la vraie lettre. */
function honest(plan: RevealPlan, grades: PullGrade[]) {
  plan.items.forEach((it, i) => {
    expect(finalRank(it), `orbe ${i}`).toBe(GRADE_RANK[grades[i]!]);
    for (let k = 1; k < it.path.length; k++)
      expect(it.path[k]!, `orbe ${i}, cran ${k}`).toBeGreaterThan(it.path[k - 1]!);
  });
}

describe('🎰 L’INVOCATION ×1 — elle MET EN SCÈNE, elle ne décide rien', () => {
  it('⚠️ LE PRÉSAGE NE MENT JAMAIS : il finit sur la vraie lettre et ne descend jamais', () => {
    for (let s = 1; s <= 400; s++)
      for (const g of PULL_GRADES) {
        const p = buildReveal(CELL[g], mulberry32(s));
        expect(p.items).toHaveLength(1);
        expect(p.items[0]!.cell).toBe(CELL[g]);
        honest(p, [g]);
      }
  });

  it('⚠️ UN B NE CONNAÎT AUCUNE SURPRISE — une fausse montée serait une promesse trahie', () => {
    for (let s = 1; s <= 400; s++)
      expect(buildReveal(B, mulberry32(s)).items[0]!.path).toEqual([0]);
  });

  it('la surprise est rare sur un A, fréquente sur un S — mesurée sur 4 000 graines', () => {
    const part = (c: RevealCell) => {
      let n = 0;
      for (let s = 1; s <= 4000; s++)
        if (buildReveal(c, mulberry32(s)).items[0]!.path.length > 1) n++;
      return n / 4000;
    };
    expect(Math.abs(part(A) - SURPRISE.A)).toBeLessThan(0.03);
    expect(Math.abs(part(S) - SURPRISE.S)).toBeLessThan(0.03);
    expect(SURPRISE.S).toBeGreaterThan(SURPRISE.A);
  });

  it('un S surpris peut monter en deux fois (bleu → violet → or)', () => {
    const vus = new Set<string>();
    for (let s = 1; s <= 2000; s++) vus.add(buildReveal(S, mulberry32(s)).items[0]!.path.join('>'));
    expect(vus).toContain('0>1>2');
    expect(vus).toContain('2');
  });

  it('déterministe à graine égale — la mise en scène est rejouable', () => {
    const a = Array.from({ length: 50 }, (_, s) =>
      buildReveal(S, mulberry32(s)).items[0]!.path.join(),
    );
    const b = Array.from({ length: 50 }, (_, s) =>
      buildReveal(S, mulberry32(s)).items[0]!.path.join(),
    );
    expect(a).toEqual(b);
  });

  it('⚠️ `prefers-reduced-motion` : l’état FINAL, sans surprise ni durée', () => {
    for (const g of PULL_GRADES) {
      const p = buildReveal(CELL[g], () => 0, { reduced: true });
      expect(p.reduced).toBe(true);
      expect(p.items[0]!.path).toEqual([GRADE_RANK[g]]);
      expect(singleSequenceMs(p)).toBe(0);
    }
  });

  it('plus la lettre est haute, plus on attend — à l’apogée ET sur la silhouette', () => {
    for (let r = 1; r < RANK_GRADE.length; r++) {
      expect(apexMs(r)).toBeGreaterThan(apexMs(r - 1));
      expect(silhouetteMs(r)).toBeGreaterThan(silhouetteMs(r - 1));
    }
  });

  it('⚠️ LA SÉQUENCE EST BORNÉE : même un S à double surprise tient sous 10 s', () => {
    const p: RevealPlan = { items: [{ cell: S, path: [0, 1, 2] }], reduced: false };
    expect(singleSequenceMs(p)).toBeLessThan(10_000);
    expect(singleSequenceMs(buildReveal(B, () => 0.9))).toBeLessThan(4_000);
  });

  /**
   * ⚠️ RÉÉCRIT (v0.1101) : il gardait « le MAINTIEN du ×10 est plus long ». Le maintien a
   * disparu — le choix du tirage lance tout — mais la propriété qui compte survit : le
   * grand cercle du ×10 a plus de couches à allumer. Ce qui change, c'est qu'une CHARGE
   * n'est plus un geste : personne ne doit attendre une seconde pour rien.
   */
  it('la charge du ×10 est plus longue que celle du ×1, et aucune des deux ne fait attendre', () => {
    expect(INVOKE.chargeMsLot).toBeGreaterThan(INVOKE.chargeMs);
    expect(INVOKE.chargeMsLot).toBeLessThanOrEqual(1200);
  });
});

/**
 * 🔮 LE PRÉSAGE DE LA SCÈNE (v0.1101, demandé : « un effet subtil mais visible avec la
 * rareté max du tirage, pour les A et S uniquement »).
 */
describe('🔮 LE PRÉSAGE — le sanctuaire réagit aux A et aux S, jamais aux B', () => {
  const plan = (grades: PullGrade[], seed = 1): RevealPlan =>
    buildLotReveal(
      grades.map((g) => it0(g)),
      mulberry32(seed),
    );

  it('⚠️ RIEN SUR UN B — c’est la ligne de base, et c’est elle qui fait le signal', () => {
    expect(omenOf(buildReveal(B, mulberry32(1)))).toBeNull();
    expect(omenOf(plan(['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B']))).toBeNull();
  });

  it('il porte la MEILLEURE lettre du tirage, pas la première ni la dernière', () => {
    expect(omenOf(plan(['B', 'A', 'B', 'S', 'B', 'B', 'A', 'B', 'B', 'B']))?.grade).toBe('S');
    expect(omenOf(plan(['B', 'A', 'B', 'B', 'B', 'B', 'A', 'B', 'B', 'B']))?.grade).toBe('A');
    expect(omenOf(plan(['S', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'A']))?.grade).toBe('S');
  });

  it('un S en met plus qu’un A — sinon les deux lettres se liraient pareil', () => {
    const a = omenOf(buildReveal(A, mulberry32(1)))!;
    const s = omenOf(buildReveal(S, mulberry32(1)))!;
    expect(s.strength).toBeGreaterThan(a.strength);
    expect(s.strength).toBe(OMEN_STRENGTH.S);
    expect(a.strength).toBe(OMEN_STRENGTH.A);
    // Bornée : une ambiance qui déborde cesse d'être « subtile ».
    expect(s.strength).toBeLessThanOrEqual(1);
    expect(a.strength).toBeGreaterThan(0);
  });

  it('⚠️ AUCUN PRÉSAGE EN MOUVEMENT RÉDUIT : il n’y a pas d’animation à teinter', () => {
    for (const g of PULL_GRADES) {
      expect(omenOf(buildReveal(CELL[g], mulberry32(1), { reduced: true }))).toBeNull();
    }
  });

  it('il ne dépend PAS du présage de l’orbe : une surprise ne le change pas', () => {
    // Le même S, annoncé bleu (surprise) ou or d'emblée : le sanctuaire dit la même chose.
    const surprise: RevealPlan = { items: [{ cell: S, path: [0, 1, 2] }], reduced: false };
    const franc: RevealPlan = { items: [{ cell: S, path: [2] }], reduced: false };
    expect(omenOf(surprise)).toEqual(omenOf(franc));
  });
});

describe('🎰 LE ×10 — dix orbes bleues qui s’allument', () => {
  const grades: PullGrade[] = ['B', 'A', 'B', 'S', 'B', 'B', 'A', 'B', 'B', 'B'];
  const lot = grades.map((g) => it0(g));

  it('UNE orbe par tirage, dans l’ORDRE DU TIRAGE, chacune portant SA case', () => {
    const p = buildLotReveal(lot, mulberry32(3));
    expect(p.items).toHaveLength(lot.length);
    p.items.forEach((it, i) => expect(it.cell).toEqual(cellOf(lot[i]!)));
  });

  it('⚠️ TOUTES PARTENT BLEUES, et le présage finit sur la vraie lettre', () => {
    for (let s = 1; s <= 200; s++) {
      const p = buildLotReveal(lot, mulberry32(s));
      honest(p, grades);
      for (const it of p.items) expect(it.path[0]).toBe(0);
    }
  });

  it('⚠️ UN B NE S’ALLUME JAMAIS ; un A s’allume en violet ; un S monte à l’or', () => {
    const p = buildLotReveal(lot, mulberry32(7));
    p.items.forEach((it, i) => {
      if (grades[i] === 'B') expect(it.path).toEqual([0]);
      if (grades[i] === 'A') expect(it.path).toEqual([0, 1]);
      if (grades[i] === 'S')
        expect([
          [0, 2],
          [0, 1, 2],
        ]).toContainEqual(it.path);
    });
  });

  it('⚠️ LES A S’ALLUMENT D’ABORD, LES S EN DERNIER — le meilleur ferme la marche', () => {
    const p = buildLotReveal(lot, mulberry32(4));
    expect(igniteOrder(p)).toEqual([1, 6, 3]);
    expect(bestRank(p)).toBe(2);
    expect(igniteOrder(buildLotReveal([it0('B'), it0('B')], mulberry32(1)))).toEqual([]);
  });

  it('⚠️ prefers-reduced-motion : rien ne s’allume, rien n’anime', () => {
    const p = buildLotReveal(lot, mulberry32(2), { reduced: true });
    p.items.forEach((it, i) => expect(it.path).toEqual([GRADE_RANK[grades[i]!]]));
    expect(igniteOrder(p)).toEqual([]);
    expect(lotSequenceMs(p)).toBe(0);
  });

  it('⚠️ JUSQU’AUX CARTES, UN ×10 TIENT SOUS 9 S — même avec deux S à double allumage', () => {
    const pire: RevealPlan = {
      items: ['S', 'S', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B'].map((g) => ({
        cell: CELL[g as PullGrade],
        path: g === 'S' ? [0, 1, 2] : g === 'A' ? [0, 1] : [0],
      })),
      reduced: false,
    };
    expect(lotSequenceMs(pire)).toBeLessThan(9_000);
  });
});

describe('🎰 LE LOT — la grille et le meilleur', () => {
  it('⚠️ LE MEILLEUR EST LA MEILLEURE LETTRE', () => {
    expect(bestOfLot([it0('B'), it0('S'), it0('A')])!.grade).toBe('S');
  });

  it('⚠️ À LETTRE ÉGALE, LE PREMIER TIRÉ — sinon la mise en scène varierait pour un même lot', () => {
    const a = it0('A');
    const b = it0('A');
    expect(bestOfLot([a, b])).toBe(a);
    expect(bestOfLot([b, a])).toBe(b);
  });

  it('un lot vide ne fait pas tomber l’écran', () => {
    expect(bestOfLot([])).toBeNull();
    expect(lotOrder([])).toEqual([]);
    expect(bestRank({ items: [], reduced: false })).toBe(0);
  });

  it('la grille va de la meilleure lettre à la plus basse, puis dans l’ordre du tirage', () => {
    const lot = [it0('B'), it0('A'), it0('B'), it0('S'), it0('A')];
    const o = lotOrder(lot);
    expect(o.map((x) => x.grade)).toEqual(['S', 'A', 'A', 'B', 'B']);
    expect(o[1]).toBe(lot[1]);
    expect(o[2]).toBe(lot[4]);
  });

  it('⚠️ ON COPIE : trier la grille ne réordonne pas ce que le store a persisté', () => {
    const lot = [it0('B'), it0('S')];
    const avant = [...lot];
    lotOrder(lot);
    expect(lot).toEqual(avant);
  });

  it('⚠️ UN B N’A PAS DE PORTRAIT : sa case dit la pièce, jamais un champion', () => {
    const c = cellOf(it0('B'));
    expect(c.championId).toBeNull();
    expect(c.name).toBe('Épée');
    expect(cellOf(it0('S')).championId).toBe(champS.id);
  });
});
