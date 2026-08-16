import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import {
  talentsEarned,
  talentEffects,
  TALENTS,
  talentLevel,
  talentRarity,
  talentValue,
  talentByCode,
  talentXpFloor,
  startLevelForRarity,
  normalizeTalents,
  rollTalentDrop,
  talentInfuseXp,
  type TalentInstance,
} from '@/lib/talents';

describe('talentsEarned', () => {
  it('1 emplacement tous les 5 niveaux', () => {
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

describe('niveau / rareté / valeur', () => {
  it('le niveau croît avec l’XP', () => {
    expect(talentLevel(0)).toBe(1);
    expect(talentLevel(talentXpFloor(5))).toBe(5);
    expect(talentLevel(talentXpFloor(10))).toBe(10);
  });
  it('la rareté = palier de 5 niveaux', () => {
    expect(talentRarity(1)).toBe('common');
    expect(talentRarity(6)).toBe('rare');
    expect(talentRarity(11)).toBe('epic');
    expect(talentRarity(16)).toBe('legendary');
    expect(talentRarity(21)).toBe('divin');
  });
  it('l’effet grandit avec le niveau', () => {
    const def = talentByCode('t_dmg')!;
    expect(talentValue(def, 10)).toBeGreaterThan(talentValue(def, 1));
  });
  it('startLevelForRarity : commun→1, épique→11', () => {
    expect(startLevelForRarity('common')).toBe(1);
    expect(startLevelForRarity('epic')).toBe(11);
  });
});

describe('normalizeTalents (rétro-compat)', () => {
  it('convertit un ancien string[] en instances équipées', () => {
    const n = normalizeTalents(['t_dmg', 't_pv']);
    expect(n).toHaveLength(2);
    expect(n[0]!.equipped).toBe(true);
    expect(n[0]!.code).toBe('t_dmg');
  });
  it('filtre les codes inconnus et tolère le non-tableau', () => {
    expect(normalizeTalents(['nope', 't_crit'])).toHaveLength(1);
    expect(normalizeTalents({})).toEqual([]);
  });
});

describe('talentEffects (équipés uniquement)', () => {
  it('legacy string[] : tous comptent (niveau 1)', () => {
    const e = talentEffects(['t_dmg', 't_dmg', 't_pv']);
    expect(e.damagePct).toBeCloseTo(0.16); // 2 × base 0.08
    expect(e.maxPvPct).toBeCloseTo(0.08);
  });
  it('instances : seuls les ÉQUIPÉS comptent', () => {
    const insts: TalentInstance[] = [
      { id: 'a', code: 't_dmg', xp: 0, equipped: true },
      { id: 'b', code: 't_crit', xp: 0, equipped: false },
    ];
    const e = talentEffects(insts);
    expect(e.damagePct).toBeCloseTo(0.08);
    expect(e.critAdd).toBe(0); // non équipé
  });
});

describe('drop & infusion', () => {
  it('rollTalentDrop : code valide, xp cohérente avec la rareté', () => {
    const t = rollTalentDrop(mulberry32(3), { luck: 0.5, idSeed: 1 });
    expect(TALENTS.some((d) => d.code === t.code)).toBe(true);
    expect(t.xp).toBeGreaterThanOrEqual(0);
    expect(t.equipped).toBeFalsy();
  });
  it('infuser un fourrage de plus haut niveau rend plus d’XP', () => {
    const low: TalentInstance = { id: 'l', code: 't_dmg', xp: 0 };
    const high: TalentInstance = { id: 'h', code: 't_dmg', xp: talentXpFloor(10) };
    expect(talentInfuseXp(high)).toBeGreaterThan(talentInfuseXp(low));
  });
});
