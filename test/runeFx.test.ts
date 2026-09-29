import { describe, expect, it } from 'vitest';
import { RUNE_FX_INTENSITY, runeApplyFx } from '@/lib/runeFx';
import { RUNE_COLOR, RUNE_TIERS, SKILLS, skillValue, type SkillId } from '@/lib/skillRunes';

const ids = Object.keys(SKILLS) as SkillId[];
const ofTier = (t: string) => ids.find((id) => SKILLS[id].tier === t)!;

describe('🔮 animation de rune posée', () => {
  it('la couleur et l’intensité suivent la rareté de la COMPÉTENCE tirée', () => {
    for (const id of ids) {
      const fx = runeApplyFx('new', id, 'Nyx', 1);
      expect(fx.tier).toBe(SKILLS[id].tier);
      expect(fx.color).toBe(RUNE_COLOR[SKILLS[id].tier]);
      expect(fx.intensity).toBe(RUNE_FX_INTENSITY[SKILLS[id].tier]);
      expect(fx.emoji).toBe(SKILLS[id].emoji);
    }
  });

  it('chaque couleur a sa teinte, et l’intensité monte strictement avec la rareté', () => {
    const colors = RUNE_TIERS.map((t) => RUNE_COLOR[t]);
    expect(new Set(colors).size).toBe(RUNE_TIERS.length);
    for (let i = 1; i < RUNE_TIERS.length; i++)
      expect(RUNE_FX_INTENSITY[RUNE_TIERS[i]!]).toBeGreaterThan(
        RUNE_FX_INTENSITY[RUNE_TIERS[i - 1]!],
      );
    // Seule la plus rare déclenche l'éclair (tier ≥ 3 dans l'overlay).
    expect(RUNE_TIERS.filter((t) => RUNE_FX_INTENSITY[t] >= 3)).toEqual(['gold']);
  });

  it('dit ce qui s’est passé : compétence apprise, niveau gagné, ou place à faire', () => {
    const id = ofTier('violet');
    const k = SKILLS[id];
    expect(runeApplyFx('new', id, 'Nyx', 1).title).toBe(`Nyx apprend ${k.name}`);
    expect(runeApplyFx('stack', id, 'Nyx', 3).title).toBe(`${k.name} · Nv 3`);
    const full = runeApplyFx('full', id, 'Nyx', 4);
    expect(full.title).toBe(`${k.name} tirée`);
    expect(full.subtitle).toContain('à toi de choisir');
  });

  it('l’effet annoncé est celui du niveau atteint (nouvelle compétence = niveau 1)', () => {
    const id = ofTier('blue');
    const v3 = String(skillValue(id, 3)).replace('.', ',');
    const v1 = String(skillValue(id, 1)).replace('.', ',');
    expect(runeApplyFx('stack', id, 'Nyx', 3).subtitle).toContain(v3);
    expect(runeApplyFx('new', id, 'Nyx', 3).subtitle).toContain(v1);
    expect(runeApplyFx('stack', id, 'Nyx', 3).subtitle).not.toContain('{v}');
  });
});
