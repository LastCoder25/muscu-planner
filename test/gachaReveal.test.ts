import { describe, it, expect } from 'vitest';
import { buildReveal, revealCrans, revealSpinMs, REVEAL } from '@/lib/gachaReveal';
import { CHAMPIONS } from '@/data/champions';
import { RANK_ORDER, RARITY_RANK, type Rarity } from '@/lib/items';
import { mulberry32 } from '@/lib/combat';

const champOf = (r: Rarity) => CHAMPIONS.find((c) => c.rarity === r)!;
const commun = champOf('commun');
const primordial = champOf('primordial');

describe('🎰 LA ROULETTE — elle MET EN SCÈNE, elle ne décide rien', () => {
  it('⚠️ LE TIRÉ EST SUR stopIndex, et LA BANDE CONTINUE APRÈS LUI', () => {
    // ⚠️ RÉÉCRIT (v0.962, demandé : « sans que le tirage soit en bout de ligne »). Il était
    // en DERNIER : sa case arrivait dans le champ de vision et **on voyait la fin venir**,
    // donc la roulette cessait d'en être une. Elle s'arrête désormais en plein élan.
    for (const r of RANK_ORDER) {
      const c = champOf(r);
      const p = buildReveal(c, mulberry32(7));
      expect(p.strip[p.stopIndex]!.id, r).toBe(c.id);
      expect(p.strip.length - 1 - p.stopIndex, `queue après le tiré (${r})`).toBe(REVEAL.tail);
      expect(REVEAL.tail).toBeGreaterThan(2);
    }
  });

  it('⚠️ LES LEURRES COUVRENT TOUTE L’ÉCHELLE — sinon on lit le résultat avant l’arrêt', () => {
    // LA propriété centrale : une bande qui ne montrerait que des communs pour un commun
    // trahirait le tirage dès la première seconde, et il n'y aurait plus rien à attendre.
    const p = buildReveal(commun, mulberry32(3));
    const leurres = p.strip.filter((_, i) => i !== p.stopIndex);
    const max = Math.max(...leurres.map((c) => RARITY_RANK[c.rarity]));
    expect(max).toBeGreaterThanOrEqual(RARITY_RANK.rare);
    // …et réciproquement pour un primordial : on doit voir passer du bas de gamme.
    const q = buildReveal(primordial, mulberry32(3));
    const min = Math.min(
      ...q.strip.filter((_, i) => i !== q.stopIndex).map((c) => RARITY_RANK[c.rarity]),
    );
    expect(min).toBeLessThanOrEqual(RARITY_RANK.magique);
  });

  it('⚠️ JAMAIS DEUX FOIS LE MÊME D’AFFILÉE — un doublon se lit comme un arrêt', () => {
    for (const s of [1, 2, 3, 11, 42]) {
      const p = buildReveal(primordial, mulberry32(s));
      for (let i = 1; i < p.strip.length; i++)
        expect(p.strip[i]!.id, `graine ${s}, cran ${i}`).not.toBe(p.strip[i - 1]!.id);
    }
  });

  it('plus la rareté est haute, plus ça dure — le teasing du genre', () => {
    for (let i = 1; i < RANK_ORDER.length; i++) {
      const bas = RANK_ORDER[i - 1]!;
      const haut = RANK_ORDER[i]!;
      expect(revealSpinMs(haut)).toBeGreaterThan(revealSpinMs(bas));
      expect(revealCrans(haut)).toBeGreaterThan(revealCrans(bas));
    }
  });

  it('la bande a de quoi défiler, et l’aura ne se colore que sur la fin', () => {
    const p = buildReveal(commun, mulberry32(5));
    expect(p.strip.length).toBeGreaterThanOrEqual(REVEAL.cransMin);
    // ⚠️ Trop tôt, on saurait dès le début ; à 1, il n'y a pas de crescendo.
    expect(p.glowFrom).toBeGreaterThan(0.4);
    expect(p.glowFrom).toBeLessThan(1);
  });

  it('déterministe à graine égale — la mise en scène est rejouable', () => {
    const a = buildReveal(primordial, mulberry32(9)).strip.map((c) => c.id);
    const b = buildReveal(primordial, mulberry32(9)).strip.map((c) => c.id);
    expect(a).toEqual(b);
    const c = buildReveal(primordial, mulberry32(10)).strip.map((x) => x.id);
    expect(c).not.toEqual(a);
  });

  it('⚠️ `prefers-reduced-motion` : l’état FINAL, pas une animation raccourcie', () => {
    const p = buildReveal(primordial, mulberry32(1), { reduced: true });
    expect(p.strip).toHaveLength(1);
    expect(p.strip[0]!.id).toBe(primordial.id);
    expect(p.stopIndex).toBe(0);
    expect(p.spinMs).toBe(0);
  });

  it('un pool d’un seul champion ne rend pas une bande vide', () => {
    // Le jeu n'en produit jamais, mais une bande vide ferait tomber l'écran.
    const p = buildReveal(commun, mulberry32(1), { pool: [commun] });
    expect(p.strip.length).toBeGreaterThan(1);
    expect(p.strip[p.stopIndex]!.id).toBe(commun.id);
  });
});
