import { describe, expect, it } from 'vitest';
import {
  FUSION_SIZE,
  familiarFusionBlock,
  fuseFamiliars,
  fuseTalents,
  fusionResultRank,
  talentFusionBlock,
} from '@/lib/companionFusion';
import { mulberry32 } from '@/lib/combat';
import { FAMILIAR_SLOT, RANK_ORDER, prestigeRankIndex, type Item, type Rarity } from '@/lib/items';
import { talentRankOf, talentTierFloor, type TalentInstance } from '@/lib/talents';
import { FAMILIAR_SPECIES } from '@/data/familiars';

const fam = (id: string, rarity: Rarity, species = 'wolf', extra: Partial<Item> = {}): Item => ({
  id,
  slot: FAMILIAR_SLOT,
  name: 'Loup',
  emoji: '🐺',
  rarity,
  level: 10,
  effect: { type: 'damage_pct', value: 5 },
  species,
  roll: 0.5,
  ...extra,
});
const tal = (id: string, rank: number, extra: Partial<TalentInstance> = {}): TalentInstance => ({
  id,
  code: 't_dmg',
  xp: talentTierFloor(rank * 5),
  roll: 0.5,
  level: 10,
  equipped: false,
  ...extra,
});

// Niveau 35 = rang Or noir (index 3) sur l'échelle de prestige.
const L = 35;
const CAP = prestigeRankIndex(L);

describe('fusionResultRank — la rareté juste au-dessus, plafonnée au rang du joueur', () => {
  it('monte d’un cran sous le rang du joueur', () => {
    expect(CAP).toBe(3);
    expect(fusionResultRank(RANK_ORDER[0]!, L)).toBe(RANK_ORDER[1]);
    expect(fusionResultRank(RANK_ORDER[2]!, L)).toBe(RANK_ORDER[3]);
  });
  it('au rang du joueur, reste à son rang (jamais au-dessus)', () => {
    expect(fusionResultRank(RANK_ORDER[CAP]!, L)).toBe(RANK_ORDER[CAP]);
  });
  it('au-dessus du rang du joueur : refusé (ne descend jamais)', () => {
    expect(fusionResultRank(RANK_ORDER[CAP + 1]!, L)).toBeNull();
  });
  it('le plafond suit le niveau : au rang maximal du jeu, le primordial reste primordial', () => {
    const top = RANK_ORDER.length - 1;
    expect(fusionResultRank(RANK_ORDER[top]!, 200)).toBe(RANK_ORDER[top]);
  });
});

describe('ce qui se fusionne', () => {
  const r = RANK_ORDER[1]!;
  it('trois de la même rareté', () => {
    expect(FUSION_SIZE).toBe(3);
    expect(familiarFusionBlock([fam('a', r), fam('b', r, 'deer'), fam('c', r)], L)).toBeNull();
  });
  it('ni deux, ni quatre', () => {
    expect(familiarFusionBlock([fam('a', r), fam('b', r)], L)).toBe('count');
    expect(familiarFusionBlock([fam('a', r), fam('b', r), fam('c', r), fam('d', r)], L)).toBe(
      'count',
    );
  });
  it('pas de mélange de raretés', () => {
    expect(familiarFusionBlock([fam('a', r), fam('b', r), fam('c', RANK_ORDER[0]!)], L)).toBe(
      'mixed',
    );
  });
  it('jamais un 🔒', () => {
    expect(
      familiarFusionBlock([fam('a', r), fam('b', r), fam('c', r, 'wolf', { locked: true })], L),
    ).toBe('locked');
  });
  it('jamais le même exemplaire deux fois', () => {
    const a = fam('a', r);
    expect(familiarFusionBlock([a, a, fam('c', r)], L)).toBe('duplicate');
  });
  it('jamais un objet qui n’est pas un familier', () => {
    expect(
      familiarFusionBlock([fam('a', r), fam('b', r), fam('c', r, 'wolf', { slot: 'weapon' })], L),
    ).toBe('mixed');
  });
  it('au-dessus du rang du joueur : refusé', () => {
    const hi = RANK_ORDER[CAP + 1]!;
    expect(familiarFusionBlock([fam('a', hi), fam('b', hi), fam('c', hi)], L)).toBe('aboveRank');
  });
  it('un talent porté ne se fusionne pas', () => {
    expect(talentFusionBlock([tal('a', 1), tal('b', 1), tal('c', 1, { equipped: true })], L)).toBe(
      'worn',
    );
    expect(talentFusionBlock([tal('a', 1), tal('b', 1), tal('c', 1)], L)).toBeNull();
    expect(talentFusionBlock([tal('a', 1), tal('b', 1), tal('c', 2)], L)).toBe('mixed');
  });
});

describe('le résultat', () => {
  it('familier : rareté du cran au-dessus, race tirée au hasard parmi TOUTES', () => {
    const r = RANK_ORDER[1]!;
    const seen = new Set<string>();
    for (let s = 1; s <= 300; s++) {
      const out = fuseFamiliars(mulberry32(s), [fam('a', r), fam('b', r), fam('c', r)], L);
      expect(out.rarity).toBe(RANK_ORDER[2]);
      expect(out.slot).toBe(FAMILIAR_SLOT);
      seen.add(out.species!);
    }
    expect(seen.size).toBe(FAMILIAR_SPECIES.length);
  });
  it('au rang du joueur, le jet n’est pas garanti meilleur (tirage ordinaire)', () => {
    const top = RANK_ORDER[CAP]!;
    const rolls: number[] = [];
    for (let s = 1; s <= 300; s++) {
      const out = fuseFamiliars(
        mulberry32(s),
        [
          fam('a', top, 'wolf', { roll: 0.95 }),
          fam('b', top, 'wolf', { roll: 0.95 }),
          fam('c', top, 'wolf', { roll: 0.95 }),
        ],
        L,
      );
      expect(out.rarity).toBe(top);
      rolls.push(out.roll!);
    }
    expect(rolls.some((x) => x < 0.5)).toBe(true);
  });
  it('niveau d’objet centré sur le niveau du joueur', () => {
    const r = RANK_ORDER[1]!;
    for (let s = 1; s <= 100; s++) {
      const out = fuseFamiliars(mulberry32(s), [fam('a', r), fam('b', r), fam('c', r)], L);
      expect(Math.abs(out.level - L)).toBeLessThanOrEqual(9);
    }
  });
  it('talent : rareté du cran au-dessus, non équipé, code tiré au hasard', () => {
    const codes = new Set<string>();
    for (let s = 1; s <= 300; s++) {
      const out = fuseTalents(mulberry32(s), [tal('a', 1), tal('b', 1), tal('c', 1)], L, `t${s}`);
      expect(talentRankOf(out)).toBe(RANK_ORDER[2]);
      expect(out.equipped).toBe(false);
      expect(out.id).toBe(`t${s}`);
      codes.add(out.code);
    }
    expect(codes.size).toBeGreaterThan(5);
  });
  it('talent au rang du joueur : reste à son rang', () => {
    const out = fuseTalents(mulberry32(3), [tal('a', CAP), tal('b', CAP), tal('c', CAP)], L, 'x');
    expect(talentRankOf(out)).toBe(RANK_ORDER[CAP]);
  });
  it('une fusion impossible lève au lieu de rendre un résultat', () => {
    const r = RANK_ORDER[1]!;
    expect(() => fuseFamiliars(mulberry32(1), [fam('a', r), fam('b', r)], L)).toThrow();
    expect(() =>
      fuseTalents(mulberry32(1), [tal('a', 1), tal('b', 2), tal('c', 1)], L, 'x'),
    ).toThrow();
  });
});
