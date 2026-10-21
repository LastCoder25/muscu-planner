import { describe, expect, it } from 'vitest';
import {
  LEVEL_CURVE,
  OVERCLOCK_MULT,
  RUNE_TIERS,
  SKILLS,
  SKILL_IDS,
  SKILL_MAX_LEVEL,
  SKILL_OVERCLOCK_LEVEL,
  maxRise,
  normalizeChampSkills,
  riseBlocker,
  riseGain,
  riseSkill,
  riseTier,
  skillTier,
  skillValue,
} from '@/lib/skillRunes';
import {
  fuseAllSkills,
  fuseBlocker,
  giveBlocker,
  giveKind,
  giveSkill,
  normalizeRuneBank,
  riseStockSkill,
  stackSkills,
  stockRiseBlocker,
  type RuneBank,
  type StockSkill,
} from '@/lib/runeBank';
import { runeApplyFx } from '@/lib/runeFx';

const bank = (skills: StockSkill[]): RuneBank => ({
  runes: 0,
  blessed: 0,
  exalted: 0,
  skills,
  opened: skills.length,
  comp: 2,
});
const sk = (uid: string, id: StockSkill['id'], level = 1, up = 0): StockSkill =>
  up ? { uid, id, level, up } : { uid, id, level };

describe('🌈 la valeur sur toute l’échelle des couleurs', () => {
  it('une compétence NON élevée vaut exactement comme avant (étalons des combats inchangés)', () => {
    for (const id of SKILL_IDS)
      for (let l = 1; l <= SKILL_MAX_LEVEL; l++) {
        const old = Math.round(SKILLS[id].base * LEVEL_CURVE[l - 1]! * 10) / 10;
        expect(skillValue({ id, level: l }), `${id} ${l}`).toBe(
          Math.min(SKILLS[id].cap ?? 1e9, old),
        );
        expect(skillValue({ id, level: l, up: 0 })).toBe(skillValue({ id, level: l }));
      }
    expect(skillValue({ id: 'crit', level: 5 })).toBe(32.4);
    expect(skillValue({ id: 'crit', level: SKILL_OVERCLOCK_LEVEL })).toBe(48.6);
  });

  it('élever ne fait jamais rien perdre : le Nv 1 d’une couleur vaut plus que le Nv 5 de la précédente', () => {
    for (const id of SKILL_IDS)
      for (let u = 0; u < maxRise(id); u++)
        expect(skillValue({ id, level: 1, up: u + 1 }), `${id} ↑${u + 1}`).toBeGreaterThan(
          skillValue({ id, level: 5, up: u }),
        );
  });

  it('la valeur monte à chaque niveau de chaque couleur', () => {
    for (const id of SKILL_IDS.filter((x) => !SKILLS[x].cap))
      for (let u = 0; u <= maxRise(id); u++)
        for (let l = 2; l <= SKILL_MAX_LEVEL; l++)
          expect(skillValue({ id, level: l, up: u }), `${id} ↑${u} ${l}`).toBeGreaterThan(
            skillValue({ id, level: l - 1, up: u }),
          );
  });

  it('chaque couleur rapporte MOINS que la précédente : une verte montée au doré plafonne à ×5', () => {
    const id = 'scout';
    const top = (u: number) => skillValue({ id, level: 5, up: u });
    const gains = [1, 2, 3].map((u) => top(u) - top(u - 1));
    expect(gains[1]!).toBeLessThan(gains[0]!);
    expect(gains[2]!).toBeLessThan(gains[1]!);
    expect(top(3)).toBe(SKILLS[id].base * 5);
  });

  it('⛑️ une chance ne dépasse jamais son plafond, même verte montée au doré et surchargée', () => {
    expect(SKILLS.care.cap).toBe(90);
    expect(skillValue({ id: 'care', level: SKILL_OVERCLOCK_LEVEL, up: 3 })).toBe(90);
    expect(skillValue({ id: 'care', level: 5, up: 2 })).toBeLessThan(90);
  });

  it('la surcharge vaut toujours +50 % du niveau 5 de SA couleur', () => {
    const v5 = skillValue({ id: 'crit', level: 5, up: 1 });
    expect(skillValue({ id: 'crit', level: SKILL_OVERCLOCK_LEVEL, up: 1 })).toBeCloseTo(
      v5 * OVERCLOCK_MULT,
      0,
    );
  });
});

describe('🌈 élever', () => {
  it('la couleur est celle de l’exemplaire', () => {
    expect(skillTier({ id: 'speed' })).toBe('green');
    expect(skillTier({ id: 'speed', up: 2 })).toBe('violet');
    expect(skillTier({ id: 'crit', up: 1 })).toBe('gold');
    // Lecture défensive : on ne monte jamais au-dessus du doré.
    expect(skillTier({ id: 'crit', up: 9 })).toBe('gold');
    expect(maxRise('speed')).toBe(3);
    expect(maxRise('plunder')).toBe(0);
  });

  it('au niveau 5 seulement, et jamais au-delà du doré', () => {
    expect(riseBlocker({ id: 'speed', level: 4 })).toBe('level');
    expect(riseBlocker({ id: 'speed', level: 5 })).toBeNull();
    expect(riseBlocker({ id: 'speed', level: 5, up: 3 })).toBe('top');
    expect(riseBlocker({ id: 'plunder', level: 5 })).toBe('top');
  });

  it('elle passe à la couleur au-dessus, niveau 1 ; une surcharge est perdue', () => {
    expect(riseSkill({ id: 'speed', level: 5 })).toEqual({ id: 'speed', level: 1, up: 1 });
    expect(riseSkill({ id: 'pv', level: SKILL_OVERCLOCK_LEVEL, up: 1 })).toEqual({
      id: 'pv',
      level: 1,
      up: 2,
    });
    expect(riseSkill({ id: 'speed', level: 4 })).toBeNull();
    expect(riseGain({ id: 'crit', level: 5 })).toBe('32,4 % → 36 %');
    // La couleur visée, source unique des deux écrans.
    expect(riseTier({ id: 'speed' })).toBe('blue');
    expect(riseTier({ id: 'speed', up: 2 })).toBe('gold');
    expect(riseTier({ id: 'plunder' })).toBe('gold');
  });

  it('au stock : même uid, même place, niveau 1 de la couleur au-dessus', () => {
    const b = bank([sk('a', 'haul', 2), sk('b', 'haul', 5), sk('c', 'pv', 5)]);
    expect(stockRiseBlocker(b, 'a')).toBe('level');
    expect(stockRiseBlocker(b, 'zz')).toBe('missing');
    const r = riseStockSkill(b, 'b')!;
    expect(r.skill).toEqual(sk('b', 'haul', 1, 1));
    expect(r.bank.skills).toEqual([sk('a', 'haul', 2), sk('b', 'haul', 1, 1), sk('c', 'pv', 5)]);
    expect(riseStockSkill(b, 'a')).toBeNull();
  });
});

describe('🌈 une couleur fusionne avec la même couleur', () => {
  const b = bank([
    sk('a', 'speed', 1),
    sk('b', 'speed', 1, 1),
    sk('c', 'speed', 2),
    sk('d', 'speed', 1, 1),
  ]);

  it('deux couleurs ne fusionnent pas', () => {
    expect(fuseBlocker(b, ['a', 'b'])).toBe('different');
    expect(fuseBlocker(b, ['b', 'd'])).toBeNull();
  });

  it('« Tout fusionner » range chaque couleur à part, et peut viser une seule couleur', () => {
    const all = fuseAllSkills(b);
    expect(all.groups).toEqual([
      { id: 'speed', up: 0, before: [2, 1], after: [3] },
      { id: 'speed', up: 1, before: [1, 1], after: [2] },
    ]);
    const blue = fuseAllSkills(b, { id: 'speed', up: 1 });
    expect(blue.groups).toEqual([{ id: 'speed', up: 1, before: [1, 1], after: [2] }]);
    expect(blue.bank.skills).toEqual([
      sk('a', 'speed', 1),
      sk('b', 'speed', 2, 1),
      sk('c', 'speed', 2),
    ]);
  });

  it('les piles « ×N » séparent les couleurs', () => {
    const st = stackSkills([sk('a', 'speed', 1), sk('b', 'speed', 1, 1), sk('c', 'speed', 1)]);
    expect(st.map((s) => [s.up ?? 0, s.count])).toEqual([
      [0, 2],
      [1, 1],
    ]);
  });
});

describe('🌈 donner une compétence élevée', () => {
  const c = (skills: { id: StockSkill['id']; level: number; up?: number }[], slots = 2) => ({
    skills,
    slots,
  });

  it('même couleur : les niveaux s’additionnent ; autre couleur : elle PREND SA PLACE', () => {
    const b = bank([sk('a', 'crit', 2, 1)]);
    expect(giveKind(c([{ id: 'crit', level: 1, up: 1 }]), b.skills[0]!)).toBe('stack');
    expect(giveKind(c([{ id: 'crit', level: 4 }]), b.skills[0]!)).toBe('swap');
    expect(giveBlocker(b, 'a', c([{ id: 'crit', level: 5 }]))).toBeNull();
    expect(
      giveSkill(
        b,
        'a',
        c([
          { id: 'pv', level: 1 },
          { id: 'crit', level: 5 },
        ]),
      )!.skills,
    ).toEqual([
      { id: 'pv', level: 1 },
      { id: 'crit', level: 2, up: 1 },
    ]);
  });

  it('nouvelle ou en remplacement : elle arrive avec sa couleur', () => {
    const b = bank([sk('a', 'haul', 3, 2)]);
    expect(giveSkill(b, 'a', c([]))!.skills).toEqual([{ id: 'haul', level: 3, up: 2 }]);
    const full = c([
      { id: 'pv', level: 1 },
      { id: 'damage', level: 1 },
    ]);
    expect(giveSkill(b, 'a', full, 1)!.skills).toEqual([
      { id: 'pv', level: 1 },
      { id: 'haul', level: 3, up: 2 },
    ]);
  });
});

describe('🌈 relecture, lapidaire, mise en scène', () => {
  it('l’élévation est relue bornée, et ABSENTE quand elle vaut 0', () => {
    expect(
      normalizeChampSkills([
        { id: 'speed', level: 2, up: 2 },
        { id: 'crit', level: 5, up: 7 },
        { id: 'pv', level: 1, up: 0 },
      ]),
    ).toEqual([
      { id: 'speed', level: 2, up: 2 },
      { id: 'crit', level: 5, up: 1 },
      { id: 'pv', level: 1 },
    ]);
    const nb = normalizeRuneBank({
      skills: [
        { uid: 'a', id: 'scout', level: 3, up: 1 },
        { uid: 'b', id: 'scout', level: 1 },
      ],
    });
    expect(nb.skills).toEqual([sk('a', 'scout', 3, 1), sk('b', 'scout', 1)]);
  });

  it('l’animation d’élévation prend la couleur nouvelle et annonce le niveau 1', () => {
    const fx = runeApplyFx('rise', 'speed', 'Nyx', 1, 2);
    expect(fx.tier).toBe('violet');
    expect(fx.title).toBe('Vitesse devient violette');
    expect(fx.subtitle).toContain('Nyx · Nv 1');
    expect(fx.subtitle).toContain(
      String(skillValue({ id: 'speed', level: 1, up: 2 })).replace('.', ','),
    );
    expect(RUNE_TIERS).toContain(fx.tier);
  });
});
