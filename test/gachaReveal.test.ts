import { describe, it, expect } from 'vitest';
import {
  buildReveal,
  cellOf,
  cellOfChampion,
  revealCrans,
  revealSpinMs,
  REVEAL,
  GRADE_RANK,
  bestOfLot,
  lotOrder,
  buildLotReveal,
  type LotItem,
  type RevealCell,
} from '@/lib/gachaReveal';
import { CHAMPIONS, PULL_GRADES, type PullGrade } from '@/data/champions';
import { mulberry32 } from '@/lib/combat';

const champS = CHAMPIONS.find((c) => c.grade === 'S')!;
const champA = CHAMPIONS.find((c) => c.grade === 'A')!;
const S = cellOfChampion(champS);
const A = cellOfChampion(champA);
const B: RevealCell = { grade: 'B', emoji: '🗡️', name: 'Épée', championId: null };
const cle = (c: RevealCell) => `${c.grade}|${c.championId}|${c.emoji}`;

describe('🎰 LA ROULETTE — elle MET EN SCÈNE, elle ne décide rien', () => {
  it('⚠️ LE TIRÉ EST SUR stopIndex, et LA BANDE CONTINUE APRÈS LUI', () => {
    for (const t of [S, A, B]) {
      const p = buildReveal(t, mulberry32(7));
      expect(p.strip[p.stopIndex], t.grade).toBe(t);
      expect(p.strip.length - 1 - p.stopIndex, `queue après le tiré (${t.grade})`).toBe(
        REVEAL.tail,
      );
      expect(REVEAL.tail).toBeGreaterThan(2);
    }
  });

  it('⚠️ LES LEURRES COUVRENT TOUTES LES LETTRES — sinon on lit le résultat avant l’arrêt', () => {
    // Une bande qui ne montrerait que des B pour un B trahirait le tirage dès la première
    // seconde. Et réciproquement : un S doit voir passer du fond de tirage.
    for (const t of [B, S]) {
      const p = buildReveal(t, mulberry32(3));
      const lettres = new Set(p.strip.filter((_, i) => i !== p.stopIndex).map((c) => c.grade));
      expect(lettres.has('B'), t.grade).toBe(true);
      expect(lettres.has('A') || lettres.has('S'), t.grade).toBe(true);
    }
  });

  it('⚠️ JAMAIS DEUX FOIS LA MÊME CASE D’AFFILÉE — un doublon se lit comme un arrêt', () => {
    for (const s of [1, 2, 3, 11, 42])
      for (const t of [S, B]) {
        const p = buildReveal(t, mulberry32(s));
        for (let i = 1; i < p.strip.length; i++)
          expect(cle(p.strip[i]!), `graine ${s}, cran ${i}`).not.toBe(cle(p.strip[i - 1]!));
      }
  });

  it('plus la lettre est haute, plus ça dure — le teasing du genre', () => {
    for (let i = 1; i < PULL_GRADES.length; i++) {
      const bas = PULL_GRADES[i - 1]!;
      const haut = PULL_GRADES[i]!;
      expect(revealSpinMs(haut)).toBeGreaterThan(revealSpinMs(bas));
      expect(revealCrans(haut)).toBeGreaterThan(revealCrans(bas));
    }
  });

  it('la bande a de quoi défiler, et l’aura ne se colore que sur la fin', () => {
    const p = buildReveal(B, mulberry32(5));
    expect(p.strip.length).toBeGreaterThanOrEqual(REVEAL.cransMin);
    expect(p.glowFrom).toBeGreaterThan(0.4);
    expect(p.glowFrom).toBeLessThan(1);
  });

  it('déterministe à graine égale — la mise en scène est rejouable', () => {
    const a = buildReveal(S, mulberry32(9)).strip.map(cle);
    const b = buildReveal(S, mulberry32(9)).strip.map(cle);
    expect(a).toEqual(b);
    const c = buildReveal(S, mulberry32(10)).strip.map(cle);
    expect(c).not.toEqual(a);
  });

  it('⚠️ `prefers-reduced-motion` : l’état FINAL, pas une animation raccourcie', () => {
    const p = buildReveal(S, mulberry32(1), { reduced: true });
    expect(p.strip).toEqual([S]);
    expect(p.stopIndex).toBe(0);
    expect(p.spinMs).toBe(0);
  });

  it('un pool d’un seul champion ne rend pas une bande vide', () => {
    const p = buildReveal(A, mulberry32(1), { pool: [champA] });
    expect(p.strip.length).toBeGreaterThan(1);
    expect(p.strip[p.stopIndex]).toBe(A);
  });
});

const it0 = (g: PullGrade, extra: Partial<LotItem> = {}): LotItem => ({
  grade: g,
  champion: g === 'S' ? champS : g === 'A' ? champA : null,
  gear: g === 'B' ? { name: 'Épée', emoji: '🗡️' } : null,
  duplicate: false,
  copies: g === 'B' ? 0 : 1,
  manaBack: 0,
  ...extra,
});

describe('🎰 LE LOT DE 10 — la révélation porte le meilleur (v0.968)', () => {
  it('⚠️ LA RÉVÉLATION PORTE LA MEILLEURE LETTRE', () => {
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

describe('🎰 LE LOT DE 10 — dix lignes qui défilent ensemble (v0.980)', () => {
  it('UNE ligne par tirage, dans l’ORDRE DU TIRAGE, chacune arrêtée sur SA case', () => {
    const lot = [it0('A'), it0('B'), it0('S'), it0('B')];
    const plans = buildLotReveal(lot, mulberry32(3));
    expect(plans).toHaveLength(lot.length);
    plans.forEach((p, i) => expect(cle(p.strip[p.stopIndex]!)).toBe(cle(cellOf(lot[i]!))));
  });

  it('⚠️ LES ARRÊTS TOMBENT EN CASCADE : même lettre, chaque ligne s’arrête après celle du dessus', () => {
    const plans = buildLotReveal(
      Array.from({ length: 10 }, () => it0('B')),
      mulberry32(5),
    );
    for (let i = 1; i < plans.length; i++)
      expect(plans[i]!.spinMs - plans[i - 1]!.spinMs).toBe(REVEAL.lotStagger);
  });

  it('la durée garde sa part de lettre — une ligne qui traîne reste un bon présage', () => {
    const [p] = buildLotReveal([it0('S')], mulberry32(1));
    expect(p!.spinMs).toBe(revealSpinMs('S'));
    expect(GRADE_RANK.S).toBeGreaterThan(GRADE_RANK.A);
  });

  it('⚠️ prefers-reduced-motion : aucune ligne n’anime, cascade comprise', () => {
    const plans = buildLotReveal([it0('A'), it0('B'), it0('S')], mulberry32(2), {
      reduced: true,
    });
    expect(plans.every((p) => p.spinMs === 0)).toBe(true);
  });
});
