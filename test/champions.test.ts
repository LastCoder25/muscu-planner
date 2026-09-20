import { describe, it, expect } from 'vitest';
import { CHAMPIONS, CHAMPION_BY_ID, championsOf, type Champion } from '@/data/champions';
import { RANK_ORDER, type Rarity } from '@/lib/items';
import { ADV_ROLE_LABEL, ADV_SIGNATURE_LABEL, type AdvRole } from '@/lib/adventurers';
import { AWAKEN, awakenLevel, awakenMult, awakenOverflow, championSkillLevel } from '@/lib/gacha';

/** Le nombre de signatures attendu par rareté (1·1·2·2·2·3·3·3). */
const SIG_PAR_RARETE = [1, 1, 2, 2, 2, 3, 3, 3];
/** Les 3 raretés les plus hautes — celles qui décident du plafond d'équipement. */
const HAUTES: Rarity[] = RANK_ORDER.slice(-3);

describe('la grille du roster', () => {
  it('32 champions, 4 par rareté — une version de chaque rôle à chaque rareté', () => {
    expect(CHAMPIONS).toHaveLength(RANK_ORDER.length * 4);
    for (const r of RANK_ORDER) {
      const pool = championsOf(r);
      expect(pool, r).toHaveLength(4);
      const roles = pool.map((c) => c.role);
      expect(new Set(roles).size, r).toBe(4);
      for (const role of ['heal', 'haul', 'speed', 'scout'] as AdvRole[])
        expect(roles, `${r} manque ${role}`).toContain(role);
    }
  });

  it('ids et noms UNIQUES — l’id EST l’identité des doublons, donc de l’Éveil', () => {
    expect(new Set(CHAMPIONS.map((c) => c.id)).size).toBe(CHAMPIONS.length);
    expect(new Set(CHAMPIONS.map((c) => c.name)).size).toBe(CHAMPIONS.length);
    expect(CHAMPION_BY_ID.size).toBe(CHAMPIONS.length);
  });

  it('le nombre de SIGNATURES suit la rareté (1·1·2·2·2·3·3·3)', () => {
    RANK_ORDER.forEach((r, i) => {
      for (const c of championsOf(r)) expect(c.skills.length, c.name).toBe(SIG_PAR_RARETE[i]);
    });
  });

  it('⚠️ MÊME LA PLUS BASSE RARETÉ PORTE UNE SIGNATURE — dans un gacha, même un 1★ a un kit', () => {
    for (const c of championsOf('commun')) expect(c.skills.length).toBeGreaterThan(0);
  });

  it('aucune signature en double chez un même champion', () => {
    for (const c of CHAMPIONS) expect(new Set(c.skills).size, c.name).toBe(c.skills.length);
  });

  it('les signatures sont celles que le COMBAT sait déjà jouer — rien d’inventé', () => {
    for (const c of CHAMPIONS)
      for (const s of c.skills) expect(ADV_SIGNATURE_LABEL[s], `${c.name}: ${s}`).toBeTruthy();
  });

  it('les rôles sont ceux que les CARAVANES appliquent déjà', () => {
    for (const c of CHAMPIONS) if (c.role) expect(ADV_ROLE_LABEL[c.role]).toBeTruthy();
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

  it('⚠️ AUCUNE LIGNÉE N’EST ABSENTE DES 3 PLUS HAUTES RARETÉS', () => {
    // Sinon `capAdvGearToWearable` plafonnerait ses pièces très bas POUR TOUJOURS, et une
    // part du stock d'équipement (105 pièces, rangées par lignée) deviendrait morte.
    const hautes = CHAMPIONS.filter((c) => HAUTES.includes(c.rarity));
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
    // Un Éveil complet reste un BONUS, pas un second axe de rareté (×5,3 entre raretés).
    expect(awakenMult(AWAKEN.max)).toBeLessThan(1.6);
  });

  it('⚠️ CHAQUE CRAN ÉCRIT PORTE SUR UNE SIGNATURE QUE LE CHAMPION A VRAIMENT', () => {
    // Offrir un niveau à une compétence qu'il ne possède pas ne se verrait nulle part.
    for (const c of CHAMPIONS)
      for (const a of c.awaken) expect(c.skills, `${c.name}: ${a.skill}`).toContain(a.skill);
  });

  it('1 ou 2 crans écrits par champion — le reste est le barème commun', () => {
    for (const c of CHAMPIONS) {
      expect(c.awaken.length, c.name).toBeGreaterThanOrEqual(1);
      expect(c.awaken.length, c.name).toBeLessThanOrEqual(2);
      for (const a of c.awaken) {
        expect(a.at, c.name).toBeGreaterThanOrEqual(1);
        expect(a.at, c.name).toBeLessThanOrEqual(AWAKEN.max);
      }
      // Deux crans ne tombent jamais au même rang.
      expect(new Set(c.awaken.map((a) => a.at)).size, c.name).toBe(c.awaken.length);
    }
  });

  it('un cran écrit MONTE le niveau de sa signature, et seulement à partir de son rang', () => {
    const c = CHAMPION_BY_ID.get('miren')!; // crit au cran 2, execute au cran 5
    expect(championSkillLevel(c, 'crit_pct', 0)).toBe(1);
    expect(championSkillLevel(c, 'crit_pct', 1)).toBe(1);
    expect(championSkillLevel(c, 'crit_pct', 2)).toBe(2);
    expect(championSkillLevel(c, 'execute_pct', 4)).toBe(1);
    expect(championSkillLevel(c, 'execute_pct', 5)).toBe(2);
    // Une signature qu'il n'a pas reste à zéro.
    expect(championSkillLevel(c, 'thorns_pct', 6)).toBe(0);
  });
});
