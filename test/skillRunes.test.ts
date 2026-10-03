import { describe, expect, it } from 'vitest';
import {
  LEVEL_CURVE,
  RUNE_INFO,
  RUNE_TIERS,
  SKILLS,
  SKILL_IDS,
  SKILL_MAX_LEVEL,
  SKILL_SLOTS,
  skillValue,
  skillsOfTier,
  RUNE_PLACE,
  SKILL_COMBAT_EFFECT,
  runeCombatEffects,
  RUNE_PLACE_OK,
  placeRuneChance,
} from '@/lib/skillRunes';
import { rollPlaceRunes } from '@/lib/runeBank';
import { mulberry32 } from '@/lib/combat';

describe('🔮 le catalogue', () => {
  it('4 crans, chacun sa couleur et son nom', () => {
    expect(RUNE_TIERS).toHaveLength(4);
    expect(new Set(RUNE_TIERS.map((t) => RUNE_INFO[t].emoji)).size).toBe(4);
    expect(new Set(RUNE_TIERS.map((t) => RUNE_INFO[t].label)).size).toBe(4);
  });

  it('18 compétences : 4 vertes, 4 bleues, 6 violettes, 4 dorées', () => {
    expect(SKILL_IDS).toHaveLength(18);
    expect(skillsOfTier('green')).toHaveLength(4);
    expect(skillsOfTier('blue')).toHaveLength(4);
    expect(skillsOfTier('violet')).toHaveLength(6);
    expect(skillsOfTier('gold')).toHaveLength(4);
  });

  it('chaque compétence appartient à UN SEUL cran — décision de l’utilisateur', () => {
    const all = RUNE_TIERS.flatMap(skillsOfTier);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(SKILL_IDS.length);
  });

  it('utilitaire en bas, combat en haut : la Vitesse est verte, les 4 dorées sont les uniques', () => {
    expect(SKILLS.speed.tier).toBe('green');
    expect(SKILLS.mentor.tier).toBe('blue');
    expect(SKILLS.rage.tier).toBe('violet');
    expect(skillsOfTier('gold').sort()).toEqual(
      ['firstBlood', 'plunder', 'riftSealer', 'secondWind'].sort(),
    );
  });

  it('emojis et noms distincts — une compétence se reconnaît dans une tuile étroite', () => {
    expect(new Set(SKILL_IDS.map((id) => SKILLS[id].emoji)).size).toBe(SKILL_IDS.length);
    expect(new Set(SKILL_IDS.map((id) => SKILLS[id].name)).size).toBe(SKILL_IDS.length);
  });
});

describe('📈 le cumul', () => {
  it('niveau maximum 5, et au-delà la valeur ne monte plus', () => {
    expect(SKILL_MAX_LEVEL).toBe(5);
    for (const id of SKILL_IDS) expect(skillValue(id, 9)).toBe(skillValue(id, 5));
  });

  it('⚠️ RENDEMENT DÉCROISSANT : chaque niveau apporte moins que le précédent', () => {
    const steps = LEVEL_CURVE.map((v, i) => v - (i ? LEVEL_CURVE[i - 1]! : 0));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]!);
  });

  it('la valeur monte à chaque niveau, pour toutes les compétences', () => {
    for (const id of SKILL_IDS)
      for (let l = 2; l <= SKILL_MAX_LEVEL; l++)
        expect(skillValue(id, l), `${id} ${l}`).toBeGreaterThan(skillValue(id, l - 1));
  });

  it('⚠️ la Vitesse au maximum reste sous le plafond d’équipe actuel (−30 %)', () => {
    // La durée des trajets est le plus gros levier économique du jeu (v0.935).
    expect(skillValue('speed', SKILL_MAX_LEVEL)).toBeLessThan(30);
  });
});

describe('🎟️ poser une rune', () => {
  it('emplacements : A 2 · S 3 · X 4', () => {
    expect(SKILL_SLOTS).toEqual({ A: 2, S: 3, X: 4 });
  });
});

describe('🎁 les sources de runes', () => {
  it('⚠️ seuls les LIEUX de la carte donnent des runes — ni l’arène (héros seul), ni l’épave', () => {
    expect(RUNE_PLACE_OK.arena).toBe(false);
    expect(RUNE_PLACE_OK.wreck).toBe(false);
    for (const p of ['camp', 'lair', 'mine', 'archive', 'rift', 'warband'] as const)
      expect(RUNE_PLACE_OK[p], p).toBe(true);
    const base = { placeRankIndex: 3, playerRankIndex: 3 };
    expect(placeRuneChance({ ...base, place: 'arena' })).toBe(0);
    expect(rollPlaceRunes(mulberry32(1), { ...base, place: 'arena' })).toBe(0);
  });

  it('plus le lieu est dur, plus il lâche de runes', () => {
    const at = (placeRankIndex: number) =>
      placeRuneChance({ place: 'camp', placeRankIndex, playerRankIndex: 3 });
    expect(at(2)).toBeLessThan(at(3));
    expect(at(3)).toBeLessThan(at(4));
  });

  it('une faille refermée compte double', () => {
    const p = { placeRankIndex: 3, playerRankIndex: 3 };
    expect(placeRuneChance({ ...p, place: 'rift' })).toBeCloseTo(
      placeRuneChance({ ...p, place: 'camp' }) * RUNE_PLACE.riftChanceMult,
    );
  });

  it('le tirage d’un lieu suit sa chance', () => {
    const rng = mulberry32(21);
    const p = { place: 'camp' as const, placeRankIndex: 4, playerRankIndex: 3 };
    const n = 40000;
    let drops = 0;
    for (let i = 0; i < n; i++) if (rollPlaceRunes(rng, p)) drops++;
    expect(drops / n).toBeCloseTo(placeRuneChance(p), 2);
  });
});

describe('⚔️ les compétences en combat', () => {
  it('une compétence de combat donne son effet à la valeur de son niveau', () => {
    const e = runeCombatEffects([{ id: 'pv', level: 3 }]);
    expect(e.maxPvPct).toBeCloseTo(skillValue('pv', 3) / 100);
  });

  it('les compétences s’additionnent, les utilitaires ne touchent pas au combat', () => {
    const e = runeCombatEffects([
      { id: 'damage', level: 1 },
      { id: 'crit', level: 2 },
      { id: 'speed', level: 5 },
    ]);
    expect(e.damagePct).toBeCloseTo(skillValue('damage', 1) / 100);
    expect(e.critAdd).toBeCloseTo(skillValue('crit', 2) / 100);
    expect(runeCombatEffects([{ id: 'speed', level: 5 }])).toEqual(runeCombatEffects([]));
  });

  it('chaque compétence 🔵 et 🟣 a un effet de combat', () => {
    for (const id of [...skillsOfTier('blue'), ...skillsOfTier('violet')])
      if (id !== 'mentor') expect(SKILL_COMBAT_EFFECT[id], id).toBeDefined();
  });
});
