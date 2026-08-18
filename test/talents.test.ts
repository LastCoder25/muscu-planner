import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
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
  talentLevelUpCost,
  talentByCode,
  normalizeTalents,
  rollTalentDrop,
  talentInfuseXp,
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

describe('axe TIER (infusion) : rang + qualité', () => {
  it('le tier croît avec l’XP d’infusion', () => {
    expect(talentTier(0)).toBe(0);
    expect(talentTier(talentTierFloor(5))).toBe(5);
    expect(talentTier(talentTierFloor(20))).toBe(20);
    expect(talentTier(1e9)).toBe(49); // plafonné à SSS5
  });
  it('rang G→SSS + qualité 1→5 dérivés du tier (mêmes rangs que les objets)', () => {
    expect(talentRank(0)).toBe('G');
    expect(talentQuality(0)).toBe(1);
    expect(talentRank(4)).toBe('G');
    expect(talentQuality(4)).toBe(5);
    expect(talentRank(5)).toBe('F');
    expect(talentRank(49)).toBe('SSS');
    expect(talentQuality(49)).toBe(5);
  });
  it('talentInfuseXp ∝ tier (un talent de haut tier nourrit plus)', () => {
    const low: TalentInstance = { id: 'l', code: 't_dmg', xp: 0 };
    const high: TalentInstance = { id: 'h', code: 't_dmg', xp: talentTierFloor(20) };
    expect(talentInfuseXp(low)).toBe(1); // tier 0 → 1
    expect(talentInfuseXp(high)).toBeGreaterThan(talentInfuseXp(low));
    expect(tierOf(high)).toBe(20);
  });
});

describe('axe NIVEAU (parchemins) + magnitude', () => {
  it('talentValue grandit avec le TIER ET le NIVEAU', () => {
    const def = talentByCode('t_dmg')!;
    expect(talentValue(def, 10, 1)).toBeGreaterThan(talentValue(def, 0, 1)); // tier ↑
    expect(talentValue(def, 0, 10)).toBeGreaterThan(talentValue(def, 0, 1)); // niveau ↑
  });
  it('MAX (SSS5, niveau élevé) ≈ ancien plafond (~×4,9 la base) → équilibrage préservé', () => {
    const def = talentByCode('t_dmg')!;
    const ratio = talentValue(def, 49, 50) / def.base;
    expect(ratio).toBeGreaterThan(4);
    expect(ratio).toBeLessThan(5.5);
  });
  it('talentLevelUpCost croît avec le niveau', () => {
    expect(talentLevelUpCost(1)).toBeLessThan(talentLevelUpCost(10));
  });
});

describe('normalizeTalents (rétro-compat)', () => {
  it('convertit un ancien string[] en instances équipées (niveau 1)', () => {
    const n = normalizeTalents(['t_dmg', 't_pv']);
    expect(n).toHaveLength(2);
    expect(n[0]!.equipped).toBe(true);
    expect(n[0]!.level).toBe(1);
  });
  it('filtre les codes inconnus et tolère le non-tableau', () => {
    expect(normalizeTalents(['nope', 't_crit'])).toHaveLength(1);
    expect(normalizeTalents({})).toEqual([]);
  });
});

describe('talentEffects (équipés uniquement)', () => {
  it('legacy string[] : tous comptent (tier 0, niveau 1 = base)', () => {
    const e = talentEffects(['t_dmg', 't_dmg', 't_pv']);
    expect(e.damagePct).toBeCloseTo(0.16); // 2 × base 0.08
    expect(e.maxPvPct).toBeCloseTo(0.08);
  });
  it('instances : seuls les ÉQUIPÉS comptent', () => {
    const insts: TalentInstance[] = [
      { id: 'a', code: 't_dmg', xp: 0, level: 1, equipped: true },
      { id: 'b', code: 't_crit', xp: 0, level: 1, equipped: false },
    ];
    const e = talentEffects(insts);
    expect(e.damagePct).toBeCloseTo(0.08);
    expect(e.critAdd).toBe(0); // non équipé
  });
  it('niveau PLAFONNÉ au niveau joueur', () => {
    const inst: TalentInstance = { id: 'a', code: 't_dmg', xp: 0, level: 50, equipped: true };
    const atCap = talentEffects([inst], 5).damagePct; // joueur niv.5 → niveau bridé à 5
    const full = talentEffects([inst], 100).damagePct;
    expect(atCap).toBeLessThan(full);
  });
});

describe('drop', () => {
  it('rollTalentDrop : code valide, TIER 0 (xp 0) + niveau 1, non équipé', () => {
    const t = rollTalentDrop(mulberry32(3), { luck: 0.5, idSeed: 1 });
    expect(TALENTS.some((d) => d.code === t.code)).toBe(true);
    expect(t.xp).toBe(0);
    expect(t.level).toBe(1);
    expect(talentRankOf(t)).toBe('G');
    expect(t.equipped).toBeFalsy();
  });
});
