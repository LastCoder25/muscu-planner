import { describe, it, expect } from 'vitest';
import { CHAMPIONS, CHAMPION_BY_ID, championsOf, type Champion } from '@/data/champions';
import { AWAKEN, awakenLevel, awakenMult, awakenOverflow } from '@/lib/adventurers';
import { SKILL_SLOTS } from '@/lib/skillRunes';

describe('la grille du roster', () => {
  it('34 champions : 16 S et 16 A, 2 ADAMANTIUM', () => {
    expect(CHAMPIONS).toHaveLength(34);
    expect(championsOf('X')).toHaveLength(2);
    expect(championsOf('S')).toHaveLength(16);
    expect(championsOf('A')).toHaveLength(16);
  });

  it('ids et noms UNIQUES — l’id EST l’identité des doublons, donc de l’Éveil', () => {
    expect(new Set(CHAMPIONS.map((c) => c.id)).size).toBe(CHAMPIONS.length);
    expect(new Set(CHAMPIONS.map((c) => c.name)).size).toBe(CHAMPIONS.length);
    expect(CHAMPION_BY_ID.size).toBe(CHAMPIONS.length);
  });

  it('🔮 aucune compétence n’est écrite : la LETTRE ne dit que le nombre d’emplacements', () => {
    // Les compétences viennent des RUNES posées par le joueur (skillRunes.ts).
    for (const c of CHAMPIONS) {
      expect(Object.keys(c).sort(), c.name).toEqual(
        ['emoji', 'form', 'grade', 'id', 'lineage', 'name'].sort(),
      );
      expect(SKILL_SLOTS[c.grade]).toBeGreaterThan(0);
    }
    expect(SKILL_SLOTS.X).toBeGreaterThan(SKILL_SLOTS.S);
    expect(SKILL_SLOTS.S).toBeGreaterThan(SKILL_SLOTS.A);
  });
});

describe('⚠️ LA COUVERTURE LIGNÉE × RARETÉ — la contrainte d’écriture à ne pas rater', () => {
  const parLignee = (cs: Champion[]) => {
    const m = new Map<string, number>();
    for (const c of cs) m.set(c.lineage, (m.get(c.lineage) ?? 0) + 1);
    return m;
  };

  it('les 6 lignées sont toutes servies, et aucune n’est marginale', () => {
    const m = parLignee(CHAMPIONS);
    expect(m.size).toBe(6);
    for (const [l, n] of m) expect(n, l).toBeGreaterThanOrEqual(4);
  });

  it('⚠️ AUCUNE LIGNÉE N’EST ABSENTE DES S', () => {
    // Sinon `capAdvGearToWearable` plafonnerait ses pièces très bas POUR TOUJOURS, et une
    // part du stock d'équipement (105 pièces, rangées par lignée) deviendrait morte.
    const hautes = championsOf('S');
    expect(parLignee(hautes).size).toBe(6);
  });

  it('la répartition reste équilibrée : aucune lignée ne rafle plus du quart du roster', () => {
    for (const [l, n] of parLignee(CHAMPIONS)) expect(n / CHAMPIONS.length, l).toBeLessThan(0.25);
  });
});

describe('la forme et les stats', () => {
  it('chaque champion a une forme NON NULLE — sinon son budget n’irait nulle part', () => {
    for (const c of CHAMPIONS) {
      const s = c.form.p + c.form.e + c.form.a;
      expect(s, c.name).toBeGreaterThan(0);
      for (const v of [c.form.p, c.form.e, c.form.a]) expect(v, c.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('les formes VARIENT : le roster n’est pas 32 fois le même archétype', () => {
    const formes = new Set(CHAMPIONS.map((c) => `${c.form.p}/${c.form.e}/${c.form.a}`));
    expect(formes.size).toBeGreaterThan(10);
  });
});

describe('✨ l’Éveil', () => {
  it('la PREMIÈRE copie est le champion : elle ne réveille rien', () => {
    expect(awakenLevel(1)).toBe(0);
    expect(awakenLevel(2)).toBe(1);
    expect(awakenLevel(7)).toBe(AWAKEN.max);
  });

  it('⚠️ EST PLAFONNÉ, et un doublon au-delà se CONVERTIT — jamais de tirage perdu', () => {
    expect(awakenLevel(50)).toBe(AWAKEN.max);
    expect(awakenOverflow(7)).toBe(false);
    expect(awakenOverflow(8)).toBe(true);
  });

  it('la magnitude monte à chaque cran, sans jamais s’emballer', () => {
    expect(awakenMult(0)).toBe(1);
    let prev = 0;
    for (let l = 0; l <= AWAKEN.max; l++) {
      expect(awakenMult(l)).toBeGreaterThanOrEqual(prev);
      prev = awakenMult(l);
    }
    // ⚠️ MESURÉ : un Éveil complet (×1,48) vaut UN cran de rareté (le pas entre raretés
    // voisines vaut ×1,25 à ×1,28), jamais deux. Le contrat du genre — un 4★ C6 vaut un
    // 5★ C0. Les deux bornes vivent dans `gacha.test.ts`, qui les compare aux VRAIS
    // budgets ; ici on ne garde que le garde-fou grossier.
    expect(awakenMult(AWAKEN.max)).toBeLessThan(1.6);
  });
});
