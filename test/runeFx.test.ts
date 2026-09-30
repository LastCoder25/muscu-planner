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

  it('dit ce qui s’est passé : rune ouverte, compétence apprise, niveau gagné, remplacement', () => {
    const id = ofTier('violet');
    const k = SKILLS[id];
    const open = runeApplyFx('open', id, '', 1);
    expect(open.title).toBe(`${k.name} · Nv 1`);
    expect(open.subtitle).toContain('stock');
    expect(runeApplyFx('new', id, 'Nyx', 1).title).toBe(`Nyx apprend ${k.name}`);
    expect(runeApplyFx('replace', id, 'Nyx', 1).title).toBe(`Nyx apprend ${k.name}`);
    expect(runeApplyFx('stack', id, 'Nyx', 3).title).toBe(`Nyx : ${k.name} · Nv 3`);
  });

  it('l’effet annoncé est celui du niveau ATTEINT, y compris une compétence fusionnée neuve', () => {
    const id = ofTier('blue');
    const v3 = String(skillValue(id, 3)).replace('.', ',');
    expect(runeApplyFx('stack', id, 'Nyx', 3).subtitle).toContain(v3);
    // Fusionnée au stock jusqu'au niveau 3, elle entre à SON niveau chez le champion.
    expect(runeApplyFx('new', id, 'Nyx', 3).subtitle).toContain(v3);
    expect(runeApplyFx('stack', id, 'Nyx', 3).subtitle).not.toContain('{v}');
  });
});
