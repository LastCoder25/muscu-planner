import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { mulberry32 } from '@/lib/combat';
import { PULL_GRADES } from '@/data/champions';
import { GACHA_RATES } from '@/lib/gacha';
import {
  ADV_GEAR_MODELS,
  ADV_GEAR_NO_ART,
  advGearArt,
  advGearModelName,
} from '@/data/advGearModels';
import {
  ADV_GEAR_SLOTS,
  GEAR_GRADE_SHARE,
  LINEAGE_GEAR,
  advGearModel,
  advGearSellValue,
  advGearValue,
  normalizeAdvGearState,
  rollAdvGear,
  rollGearGrade,
  type AdvGear,
  type Lineage,
} from '@/lib/advGear';
import { refAdvGear } from '@/lib/caravan';

const LINEAGES = Object.keys(LINEAGE_GEAR) as Lineage[];

describe('🗡️ le roster de l’équipement des champions', () => {
  it('72 modèles : chaque lignée × emplacement × lettre, ids et noms uniques', () => {
    expect(ADV_GEAR_MODELS).toHaveLength(LINEAGES.length * ADV_GEAR_SLOTS.length * 3);
    expect(new Set(ADV_GEAR_MODELS.map((m) => m.id)).size).toBe(ADV_GEAR_MODELS.length);
    expect(new Set(ADV_GEAR_MODELS.map((m) => m.name)).size).toBe(ADV_GEAR_MODELS.length);
    for (const l of LINEAGES)
      for (const s of ADV_GEAR_SLOTS)
        for (const g of PULL_GRADES)
          expect(
            ADV_GEAR_MODELS.some((m) => m.lineage === l && m.slot === s && m.grade === g),
          ).toBe(true);
  });

  it('un modèle sans illustration n’en a AUCUNE — pas un fichier oublié qui s’afficherait', () => {
    expect(ADV_GEAR_NO_ART.size).toBeLessThan(ADV_GEAR_MODELS.length / 5);
    for (const id of ADV_GEAR_NO_ART) {
      expect(
        ADV_GEAR_MODELS.some((m) => m.id === id),
        id,
      ).toBe(true);
      expect(advGearArt(id), id).toBeNull();
      expect(existsSync(resolve(__dirname, '../public/advgear', `${id}.webp`)), id).toBe(false);
    }
  });

  it('chaque autre modèle a son illustration sur le disque (un nom sans image rougit ici)', () => {
    for (const m of ADV_GEAR_MODELS.filter((x) => !ADV_GEAR_NO_ART.has(x.id))) {
      const src = advGearArt(m.id);
      expect(src, m.id).toBe(`/advgear/${m.id}.webp`);
      const file = resolve(__dirname, '../public', src!.slice(1));
      expect(existsSync(file), file).toBe(true);
      // Une image, pas une page d'erreur du service, et pas un poids qui plomberait l'app.
      const size = statSync(file).size;
      expect(size, m.id).toBeGreaterThan(800);
      expect(size, m.id).toBeLessThan(40_000);
    }
  });

  it('un id inconnu n’a pas d’illustration (le repli emoji prend le relais)', () => {
    expect(advGearArt('guerrier-weapon-z')).toBeNull();
    expect(advGearArt(null)).toBeNull();
  });

  it('une pièce tirée porte le NOM du modèle de sa lettre', () => {
    for (let s = 1; s <= 200; s++) {
      const g = rollAdvGear(mulberry32(s), { lineage: 'mage', level: 30, playerLevel: 30 });
      expect(g.name).toBe(advGearModelName('mage', g.slot, g.grade));
      expect(g.name).toBe(advGearModel('mage', g.slot, g.grade).name);
    }
  });
});

describe('🎰 la lettre d’une pièce', () => {
  it('B = 1 : l’étalon des routes porte des B, donc la calibration ne bouge pas', () => {
    expect(GEAR_GRADE_SHARE.B).toBe(1);
    for (const g of refAdvGear(40)) expect(g.grade).toBe('B');
    expect(advGearValue('damage_pct', 'rare', 0.4)).toBe(
      advGearValue('damage_pct', 'rare', 0.4, 'B'),
    );
  });

  it('S > A > B, du même pas que chez les champions', () => {
    const v = (g: 'B' | 'A' | 'S') => advGearValue('damage_pct', 'epique', 0.5, g);
    expect(v('A')).toBeGreaterThan(v('B'));
    expect(v('S')).toBeGreaterThan(v('A'));
    expect(GEAR_GRADE_SHARE.S / GEAR_GRADE_SHARE.A).toBeCloseTo(GEAR_GRADE_SHARE.A, 5);
  });

  it('une lettre IMPOSÉE est respectée (un tirage B du gacha rend une pièce B)', () => {
    for (let s = 1; s <= 50; s++)
      expect(
        rollAdvGear(mulberry32(s), { lineage: 'archer', level: 20, playerLevel: 20, grade: 'B' })
          .grade,
      ).toBe('B');
  });

  it('hors gacha, la lettre suit les taux du tirage (une seule table pour « combien de S »)', () => {
    const rng = mulberry32(99);
    const n = 200_000;
    const c = { B: 0, A: 0, S: 0 };
    for (let i = 0; i < n; i++) c[rollGearGrade(rng)]++;
    for (const g of PULL_GRADES) expect(c[g] / n).toBeCloseTo(GACHA_RATES[g], 2);
  });

  it('la lettre ne dope PAS les rôles civils (trajet, cargaison)', () => {
    const B = rollAdvGear(mulberry32(5), {
      lineage: 'caravanier',
      slot: 'accessory',
      level: 20,
      playerLevel: 20,
      grade: 'B',
    });
    const S = rollAdvGear(mulberry32(5), {
      lineage: 'caravanier',
      slot: 'accessory',
      level: 20,
      playerLevel: 20,
      grade: 'S',
    });
    expect(S.role!.value).toBe(B.role!.value);
    expect(S.effect.value).toBeGreaterThan(B.effect.value);
  });

  it('une pièce S se revend plus cher qu’une B identique', () => {
    const base = rollAdvGear(mulberry32(3), {
      lineage: 'guerrier',
      level: 30,
      playerLevel: 30,
      grade: 'B',
    });
    const b = { ...base, id: 'b' } as AdvGear;
    const s = { ...base, id: 's', grade: 'S' } as AdvGear;
    expect(advGearSellValue(s)).toBeGreaterThan(advGearSellValue(b));
  });
});

describe('♻️ les pièces d’avant les lettres', () => {
  it('sont relues en B, renommées sur leur modèle, valeurs INCHANGÉES', () => {
    const legacy = {
      id: 'old',
      lineage: 'archer',
      slot: 'weapon',
      name: 'Arc',
      emoji: '🏹',
      rarity: 'rare',
      roll: 0.6,
      level: 25,
      effect: { type: 'damage_pct', value: 12.3 },
    };
    const [g] = normalizeAdvGearState({ stock: [legacy] }).stock;
    expect(g!.grade).toBe('B');
    expect(g!.name).toBe(advGearModelName('archer', 'weapon', 'B'));
    expect(g!.effect.value).toBe(12.3);
    // Idempotente : relire une pièce déjà à jour ne change rien.
    expect(normalizeAdvGearState({ stock: [g] }).stock[0]).toEqual(g);
  });

  it('une lettre existante est conservée', () => {
    const s = {
      id: 's',
      lineage: 'mage',
      slot: 'relic',
      name: 'x',
      emoji: '🔮',
      rarity: 'commun',
      grade: 'S',
      roll: 0.2,
      level: 5,
      effect: { type: 'damage_pct', value: 3 },
    };
    const [g] = normalizeAdvGearState({ stock: [s] }).stock;
    expect(g!.grade).toBe('S');
    expect(g!.name).toBe(advGearModelName('mage', 'relic', 'S'));
  });
});
