import { describe, expect, it } from 'vitest';
import {
  RUNE_GLYPHS,
  RUNE_REVEAL,
  bestTier,
  glyphAt,
  holdMs,
  litGlyphs,
  lotCascadeStart,
  lotCells,
  runeOmen,
} from '@/lib/runeReveal';
import { RUNE_TIERS, SKILLS, type SkillId } from '@/lib/skillRunes';

const ofTier = (t: string): SkillId =>
  (Object.keys(SKILLS) as SkillId[]).find((id) => SKILLS[id].tier === t)!;
const G = ofTier('green');
const B = ofTier('blue');
const V = ofTier('violet');
const O = ofTier('gold');

describe('🪬 mise en scène de l’ouverture d’une rune', () => {
  it('le mur a autant de glyphes dessinés que de glyphes comptés', () => {
    expect(RUNE_GLYPHS.length).toBe(RUNE_REVEAL.glyphs);
  });

  it('plus la couleur est rare, plus de glyphes s’allument — la dorée allume tout le mur', () => {
    const lit = RUNE_TIERS.map(litGlyphs);
    for (let i = 1; i < lit.length; i++) expect(lit[i]).toBeGreaterThan(lit[i - 1]!);
    expect(litGlyphs('gold')).toBe(RUNE_REVEAL.glyphs);
    expect(litGlyphs('green')).toBeGreaterThan(0);
  });

  it('le suspense dure plus longtemps pour une couleur rare', () => {
    const total = (t: (typeof RUNE_TIERS)[number]) => glyphAt(t, litGlyphs(t)) + holdMs(t);
    for (let i = 1; i < RUNE_TIERS.length; i++)
      expect(total(RUNE_TIERS[i]!)).toBeGreaterThan(total(RUNE_TIERS[i - 1]!));
  });

  it('le souffle retenu avant l’éclat, à lui seul, s’allonge avec la rareté', () => {
    for (let i = 1; i < RUNE_TIERS.length; i++)
      expect(holdMs(RUNE_TIERS[i]!)).toBeGreaterThan(holdMs(RUNE_TIERS[i - 1]!));
  });

  it('les glyphes s’allument dans l’ordre, et ralentissent à la fin pour une rare', () => {
    for (const t of RUNE_TIERS)
      for (let i = 1; i <= litGlyphs(t); i++)
        expect(glyphAt(t, i)).toBeGreaterThan(glyphAt(t, i - 1));
    const n = litGlyphs('gold');
    const last = glyphAt('gold', n) - glyphAt('gold', n - 1);
    const first = glyphAt('gold', 1) - glyphAt('gold', 0);
    expect(last).toBeGreaterThan(first);
    // Une verte ne ralentit jamais : pas de fausse tension.
    const ng = litGlyphs('green');
    expect(glyphAt('green', ng) - glyphAt('green', ng - 1)).toBe(glyphAt('green', 1));
  });

  it('présage honnête : rien sur une verte ni une bleue, plus fort sur une dorée', () => {
    expect(runeOmen('green')).toBe(0);
    expect(runeOmen('blue')).toBe(0);
    expect(runeOmen('violet')).toBeGreaterThan(0);
    expect(runeOmen('gold')).toBeGreaterThan(runeOmen('violet'));
  });

  it('un rejeu à l’unité reste court (sous 6 s même pour une dorée)', () => {
    const t = 'gold';
    const ms = RUNE_REVEAL.dropMs + glyphAt(t, litGlyphs(t)) + holdMs(t) + RUNE_REVEAL.floodMs;
    expect(ms).toBeLessThan(6000);
  });
});

describe('🪬 le lot ×10', () => {
  const ids = [G, B, V, G, O, B, G, G, B, G];
  const cells = lotCells(ids);

  it('garde l’ordre du tirage, et chaque alcôve porte SA couleur', () => {
    expect(cells.map((c) => c.id)).toEqual(ids);
    cells.forEach((c) => expect(c.tier).toBe(SKILLS[c.id].tier));
  });

  it('les violettes et dorées attendent qu’on les touche, les autres s’ouvrent seules', () => {
    for (const c of cells) {
      const rare = c.tier === 'violet' || c.tier === 'gold';
      expect(c.hot).toBe(rare);
      expect(c.autoAt === null).toBe(rare);
    }
  });

  it('la cascade commence après la chute et la scrutation, dans l’ordre, sans trou', () => {
    const auto = cells.filter((c) => c.autoAt !== null).map((c) => c.autoAt!);
    expect(auto[0]).toBe(lotCascadeStart(ids.length));
    for (let i = 1; i < auto.length; i++)
      expect(auto[i]! - auto[i - 1]!).toBe(RUNE_REVEAL.lotCascadeMs);
    expect(lotCascadeStart(10)).toBeGreaterThan(RUNE_REVEAL.dropMs + 9 * RUNE_REVEAL.lotDropGapMs);
  });

  it('la couleur finale du mur est la plus rare du lot', () => {
    expect(bestTier(ids)).toBe('gold');
    expect(bestTier([G, G, B])).toBe('blue');
    expect(bestTier([G])).toBe('green');
  });
});
