import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import {
  RANK_ORDER,
  rankCeilingForLevel,
  maxGradeCran,
  enchantMult,
  ENCHANT_MAX,
} from '@/lib/items';
import {
  talentsEarned,
  talentEffects,
  TALENTS,
  talentTier,
  talentTierFloor,
  talentRank,
  talentQuality,
  talentRankOf,
  tierOf,
  talentValue,
  talentByCode,
  normalizeTalents,
  rollTalentDrop,
  type TalentInstance,
} from '@/lib/talents';

describe('talentsEarned', () => {
  it('1 emplacement tous les 5 niveaux JOUEUR', () => {
    expect(talentsEarned(4)).toBe(0);
    expect(talentsEarned(5)).toBe(1);
    expect(talentsEarned(20)).toBe(4);
  });
});

describe('catalogue élargi', () => {
  it('au moins 11 talents, codes uniques', () => {
    expect(TALENTS.length).toBeGreaterThanOrEqual(11);
    expect(new Set(TALENTS.map((t) => t.code)).size).toBe(TALENTS.length);
  });
});

describe('GRADE (rang + qualité, fixé au drop)', () => {
  it('le tier encodé par l’xp donne le grade', () => {
    expect(talentTier(0)).toBe(0);
    expect(talentTier(talentTierFloor(5))).toBe(5);
    expect(talentTier(talentTierFloor(20))).toBe(20);
    expect(talentTier(1e9)).toBe(39); // plafonné (8 raretés × 5 − 1)
  });
  it('rareté Commun→Primordial dérivée du tier (mêmes raretés que les objets)', () => {
    expect(talentRank(0)).toBe('commun');
    expect(talentRank(4)).toBe('commun');
    expect(talentRank(5)).toBe('inhabituel');
    expect(talentRank(39)).toBe('primordial');
  });
});

describe('magnitude = grade × enchant (uniforme avec les objets)', () => {
  it('talentValue grandit avec le TIER (grade) ET l’ENCHANT', () => {
    const def = talentByCode('t_dmg')!;
    expect(talentValue(def, 10, 0)).toBeGreaterThan(talentValue(def, 0, 0)); // grade ↑
    expect(talentValue(def, 0, 6)).toBeGreaterThan(talentValue(def, 0, 0)); // enchant ↑
  });
  it('enchant partage le mult des objets (enchantMult), à grade égal', () => {
    const def = talentByCode('t_dmg')!;
    expect(talentValue(def, 12, 4) / talentValue(def, 12, 0)).toBeCloseTo(enchantMult(4));
  });
  it('MAX (SSS, jet 100 %, +12) ≈ ancien plafond → équilibrage préservé', () => {
    const def = talentByCode('t_dmg')!;
    // (base/2) × rankRollMult(SSS, jet 1) × enchantMult(12) ≈ ×10,5
    const ratio = talentValue(def, 49, ENCHANT_MAX, 1) / def.base;
    expect(ratio).toBeGreaterThan(9.5);
    expect(ratio).toBeLessThan(11);
  });
  it('raretés NETTEMENT séparées — Rare > Magique (jet 0 = plancher du rang)', () => {
    const def = talentByCode('t_armor')!; // Cuirasse : base petite → cas du bug
    const tierAt = (rank: string) => RANK_ORDER.indexOf(rank as never) * 5;
    const higher = talentValue(def, tierAt('rare'), 0, 0);
    const lower = talentValue(def, tierAt('magique'), 0, 0);
    expect(higher).toBeGreaterThan(lower);
    expect(higher / lower).toBeGreaterThan(1.05); // écart de rareté net
  });
});

describe('plafond de grade de drop', () => {
  it('maxGradeCran = plafond de drop du niveau (rang √ × qualité 5)', () => {
    expect(maxGradeCran(1)).toBe(rankCeilingForLevel(1) * 5 + 4);
    expect(maxGradeCran(4)).toBe(rankCeilingForLevel(4) * 5 + 4);
    expect(maxGradeCran(25)).toBe(rankCeilingForLevel(25) * 5 + 4);
    expect(maxGradeCran(1)).toBeLessThan(maxGradeCran(100)); // monte avec le niveau
  });
});

describe('normalizeTalents (rétro-compat)', () => {
  it('convertit un ancien string[] en instances équipées (+0)', () => {
    const n = normalizeTalents(['t_dmg', 't_pv']);
    expect(n).toHaveLength(2);
    expect(n[0]!.equipped).toBe(true);
    expect(n[0]!.enchant).toBe(0);
  });
  it('préserve le niveau d’objet (ilvl) ; enchant reste 0 (vestige)', () => {
    expect(normalizeTalents([{ id: 'a', code: 't_dmg', xp: 0, level: 1 }])[0]!.level).toBe(1);
    const n = normalizeTalents([{ id: 'b', code: 't_dmg', xp: 0, level: 50 }])[0]!;
    expect(n.level).toBe(50); // ilvl conservé (v0.592)
    expect(n.enchant).toBe(0);
  });
  it('filtre les codes inconnus et tolère le non-tableau', () => {
    expect(normalizeTalents(['nope', 't_crit'])).toHaveLength(1);
    expect(normalizeTalents({})).toEqual([]);
  });
});

describe('talentEffects (équipés uniquement)', () => {
  it('legacy string[] : tous comptent (grade G1 +0)', () => {
    const e = talentEffects(['t_dmg', 't_dmg', 't_pv']);
    expect(e.damagePct).toBeCloseTo(2 * talentValue(talentByCode('t_dmg')!, 0, 0));
    expect(e.maxPvPct).toBeCloseTo(talentValue(talentByCode('t_pv')!, 0, 0));
  });
  it('instances : seuls les ÉQUIPÉS comptent', () => {
    const insts: TalentInstance[] = [
      { id: 'a', code: 't_dmg', xp: 0, enchant: 0, equipped: true },
      { id: 'b', code: 't_crit', xp: 0, enchant: 0, equipped: false },
    ];
    const e = talentEffects(insts);
    expect(e.damagePct).toBeCloseTo(talentValue(talentByCode('t_dmg')!, 0, 0));
    expect(e.critAdd).toBe(0); // non équipé
  });
  it('l’enchant augmente la magnitude', () => {
    const base: TalentInstance = { id: 'a', code: 't_dmg', xp: 0, enchant: 0, equipped: true };
    const ench: TalentInstance = { id: 'b', code: 't_dmg', xp: 0, enchant: 6, equipped: true };
    expect(talentEffects([ench]).damagePct).toBeGreaterThan(talentEffects([base]).damagePct);
  });
});

describe('drop', () => {
  it('rollTalentDrop : code valide, +0, non équipé', () => {
    const t = rollTalentDrop(mulberry32(3), { level: 4, luck: 0.5, idSeed: 1 });
    expect(TALENTS.some((d) => d.code === t.code)).toBe(true);
    expect(t.enchant).toBe(0);
    expect(t.equipped).toBeFalsy();
  });

  it('rollTalentDrop : pyramide centrée niveau + cap anti-runaway (playerLevel)', () => {
    // joueur bas niveau en contenu profond → rang centré sur le joueur, plafonné ceiling(4)+2
    const cap = Math.min(9, rankCeilingForLevel(4) + 2);
    for (let s = 0; s < 80; s++) {
      const t = rollTalentDrop(mulberry32(s * 7 + 1), {
        level: 40,
        luck: 1,
        idSeed: s,
        playerLevel: 4,
      });
      expect(RANK_ORDER.indexOf(talentRankOf(t))).toBeLessThanOrEqual(cap);
    }
    // niveau haut + luck → dépasse le rang G (progression réelle)
    const highMax = Math.max(
      ...Array.from({ length: 60 }, (_, s) =>
        RANK_ORDER.indexOf(
          talentRankOf(rollTalentDrop(mulberry32(s * 13 + 5), { level: 80, luck: 1, idSeed: s })),
        ),
      ),
    );
    expect(highMax).toBeGreaterThan(0);
  });
});
