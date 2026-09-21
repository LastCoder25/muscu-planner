import { describe, it, expect } from 'vitest';
import {
  CHAMPIONS,
  CHAMPION_BY_ID,
  REF_CHAMPIONS_BY_RANK,
  type Champion,
} from '@/data/champions';
import { RANK_ORDER, prestigeRankIndex } from '@/lib/items';
import { advChampion, advRarity, advStats, championStats } from '@/lib/adventurers';
import { refAdvGear, refAdventurer, refChampionAdv, refChampions } from '@/lib/caravan';

const part = (c: Champion, axe: 'p' | 'e' | 'a') => c.form[axe] / (c.form.p + c.form.e + c.form.a);
const base = (c: Champion) => CHAMPION_BY_ID.get(c.id.replace(/^ref:/, ''))!;

describe('📏 l’étalon des combats, FIGÉ à la refonte S/A (2026-09-21)', () => {
  it('un trio par RANG, huit rangs couverts — ni plus, ni moins', () => {
    expect(REF_CHAMPIONS_BY_RANK).toHaveLength(RANK_ORDER.length);
    for (const trio of REF_CHAMPIONS_BY_RANK) expect(trio).toHaveLength(3);
  });

  it('⚠️ CE SONT LES MÊMES FORMES QU’AVANT — c’est ce qui garde la calibration intacte', () => {
    // Les choisir parmi les 16 S déplaçait la route et les failles de 5 à 40 points au
    // niveau 12 (mesuré). On fige donc les champions d'avant, forme comprise.
    for (const trio of REF_CHAMPIONS_BY_RANK)
      for (const c of trio) {
        const b = base(c);
        expect(b, c.id).toBeDefined();
        expect(c.form).toEqual(b.form);
        expect(c.lineage).toBe(b.lineage);
      }
  });

  it('⚠️ TOUS NOTÉS S : leur budget est EXACTEMENT celui du rang du joueur', () => {
    for (const L of [1, 12, 30, 60, 100])
      for (let s = 0; s < 3; s++) {
        const a = refChampionAdv(L, s);
        expect(advChampion(a)!.grade).toBe('S');
        expect(advStats(a)).toEqual(championStats(advChampion(a)!, L, 1));
      }
  });

  it('rend TROIS orientations — une escorte monochrome effondre le multi-frappe', () => {
    for (const L of [1, 12, 30, 60, 100]) {
      const cs = refChampions(L);
      expect(cs).toHaveLength(3);
      // Chacun domine l'axe qu'on lui attribue, au moins autant que les deux autres.
      (['p', 'a', 'e'] as const).forEach((axe, i) => {
        const autres = cs.filter((_, j) => j !== i).map((c) => part(c, axe));
        expect(part(cs[i]!, axe), `niveau ${L}, axe ${axe}`).toBeGreaterThanOrEqual(
          Math.max(...autres),
        );
      });
    }
  });

  it('sa RARETÉ D’ÉQUIPEMENT est celle du rang du joueur, jamais plus', () => {
    for (const L of [1, 12, 30, 60, 100]) {
      const attendu = RANK_ORDER[prestigeRankIndex(L)]!;
      for (let slot = 0; slot < 4; slot++) expect(advRarity(refChampionAdv(L, slot))).toBe(attendu);
    }
  });

  it('⚠️ SANS ÉVEIL — il se mérite, il ne doit pas être une attente', () => {
    for (const L of [12, 60]) expect(refChampionAdv(L).copies).toBe(1);
  });

  it('les orientations BOUCLENT au-delà de 3, comme `refAdventurer`', () => {
    const ids = [0, 1, 2, 3, 4].map((s) => refChampionAdv(30, s).championId);
    expect(ids[3]).toBe(ids[0]);
    expect(ids[4]).toBe(ids[1]);
  });

  it('⚠️ SA FORME N’EST PAS PLATE : les trois membres ne sont pas interchangeables', () => {
    for (const L of [12, 45, 100]) {
      const st = [0, 1, 2].map((s) => advStats(refChampionAdv(L, s)));
      const domines = new Set(
        st.map((x) =>
          x.puissance >= x.endurance && x.puissance >= x.agilite
            ? 'p'
            : x.agilite >= x.endurance
              ? 'a'
              : 'e',
        ),
      );
      expect(domines.size, `niveau ${L}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('⚠️ SYNTHÉTIQUES : jamais au roster, donc jamais tirables — mais le combat les lit', () => {
    for (const L of [1, 50, 100])
      for (let s = 0; s < 3; s++) {
        const a = refChampionAdv(L, s);
        expect(a.championId!.startsWith('ref:')).toBe(true);
        expect(CHAMPIONS.some((c) => c.id === a.championId)).toBe(false);
        expect(advChampion(a)).toBeDefined();
      }
  });
});

describe('la route se calibre sur les champions (bascule v0.952)', () => {
  it('⚠️ L’ÉTALON RÉELLEMENT EMPLOYÉ porte les lignées des champions de référence', () => {
    // ⚠️ On observe `refAdvGear` (qui dérive de `refEscortBare`), jamais `refAdventurer` :
    // la bascule ne touche pas ce dernier, un test sur lui ne verrait rien.
    const lignees = [...new Set(refAdvGear(30, 3).map((g) => g.lineage))].sort();
    const champs = [...new Set(refChampions(30).map((c) => c.lineage))].sort();
    expect(lignees).toEqual(champs);
    const avant = [...new Set([0, 1, 2].map((i) => refAdventurer(30, i).path[0]))].sort();
    expect(lignees).not.toEqual(avant);
  });
});
