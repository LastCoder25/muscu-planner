import { describe, expect, it } from 'vitest';
import {
  LEVEL_CURVE,
  RUNE_INFO,
  RUNE_TIERS,
  SKILLS,
  SKILL_IDS,
  SKILL_MAX_LEVEL,
  SKILL_SLOTS,
  applyRuneSkill,
  canUseRune,
  replaceSkill,
  rollRuneSkill,
  skillValue,
  skillsOfTier,
  type ChampSkill,
  ARCHIVE_RUNE,
  FRIEND_BOSS_RUNE,
  RUNE_SOURCES,
  ascensionRuneOdds,
  comboRune,
  riftRune,
  rollAscensionRune,
  rollAwakenRune,
} from '@/lib/skillRunes';
import { mulberry32 } from '@/lib/combat';
import { BOSS_TIERS } from '@/lib/friendBoss';
import { CHEST_MAX_MULT, CHEST_MIN_MULT } from '@/lib/comboChest';

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

  it('⚠️ garde-fou de rang : violet dès Argent, doré dès Or', () => {
    expect(canUseRune('green', 0)).toBe(true);
    expect(canUseRune('blue', 0)).toBe(true);
    expect(canUseRune('violet', 0)).toBe(false);
    expect(canUseRune('violet', 1)).toBe(true);
    expect(canUseRune('gold', 1)).toBe(false);
    expect(canUseRune('gold', 2)).toBe(true);
  });

  it('le tirage reste dans le cran de la rune', () => {
    const rng = mulberry32(7);
    for (const tier of RUNE_TIERS)
      for (let i = 0; i < 200; i++) expect(SKILLS[rollRuneSkill(rng, tier, [])!].tier).toBe(tier);
  });

  it('le tirage couvre tout le cran', () => {
    const rng = mulberry32(11);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(rollRuneSkill(rng, 'violet', [])!);
    expect(seen.size).toBe(skillsOfTier('violet').length);
  });

  it('⚠️ une compétence au niveau 5 n’est jamais tirée — on relance (décision de l’utilisateur)', () => {
    const rng = mulberry32(3);
    const skills: ChampSkill[] = [{ id: 'speed', level: 5 }];
    for (let i = 0; i < 300; i++) expect(rollRuneSkill(rng, 'green', skills)).not.toBe('speed');
  });

  it('tout le cran au maximum : la rune ne peut pas être posée', () => {
    const skills = skillsOfTier('green').map((id) => ({ id, level: 5 }));
    expect(rollRuneSkill(mulberry32(1), 'green', skills)).toBeNull();
    // Un autre cran, lui, reste tirable.
    expect(rollRuneSkill(mulberry32(1), 'blue', skills)).not.toBeNull();
  });

  it('déjà portée : +1 niveau, sans prendre d’emplacement', () => {
    const skills: ChampSkill[] = [
      { id: 'speed', level: 2 },
      { id: 'pv', level: 1 },
    ];
    const o = applyRuneSkill(skills, 'speed', 2);
    expect(o.kind).toBe('stack');
    if (o.kind !== 'stack') return;
    expect(o.skills).toEqual([
      { id: 'speed', level: 3 },
      { id: 'pv', level: 1 },
    ]);
    // L'original n'est pas muté.
    expect(skills[0]!.level).toBe(2);
  });

  it('⚠️ la pose ne dépasse jamais le niveau 5, même appelée sans passer par le tirage', () => {
    const o = applyRuneSkill([{ id: 'speed', level: SKILL_MAX_LEVEL }], 'speed', 2);
    expect(o.kind === 'stack' && o.skills[0]!.level).toBe(SKILL_MAX_LEVEL);
  });

  it('nouvelle avec un emplacement libre : elle s’installe au niveau 1', () => {
    const o = applyRuneSkill([{ id: 'speed', level: 2 }], 'pv', 2);
    expect(o).toEqual({
      kind: 'new',
      skills: [
        { id: 'speed', level: 2 },
        { id: 'pv', level: 1 },
      ],
    });
  });

  it('nouvelle et emplacements pleins : c’est au joueur de choisir', () => {
    const skills: ChampSkill[] = [
      { id: 'speed', level: 2 },
      { id: 'pv', level: 4 },
    ];
    expect(applyRuneSkill(skills, 'crit', 2)).toEqual({ kind: 'full', drawn: 'crit' });
  });

  it('remplacer : la nouvelle arrive AU NIVEAU 1, l’ancienne et ses niveaux sont perdus', () => {
    const skills: ChampSkill[] = [
      { id: 'speed', level: 2 },
      { id: 'pv', level: 4 },
    ];
    expect(replaceSkill(skills, 'crit', 1)).toEqual([
      { id: 'speed', level: 2 },
      { id: 'crit', level: 1 },
    ]);
  });

  it('⚠️ refuser : les compétences ne bougent pas, la rune est perdue (décision de l’utilisateur)', () => {
    const skills: ChampSkill[] = [
      { id: 'speed', level: 2 },
      { id: 'pv', level: 4 },
    ];
    expect(replaceSkill(skills, 'crit', null)).toEqual(skills);
  });
});

describe('🎁 les sources de runes', () => {
  it('les chances d’ascension somment à 1 à chaque rang, et montent avec le rang', () => {
    for (let r = 0; r <= 9; r++) {
      const o = ascensionRuneOdds(r);
      expect(
        RUNE_TIERS.reduce((s, t) => s + o[t], 0),
        `rang ${r}`,
      ).toBeCloseTo(1);
    }
    for (let r = 2; r <= 9; r++) {
      const a = ascensionRuneOdds(r - 1);
      const b = ascensionRuneOdds(r);
      expect(b.gold + b.violet, `rang ${r}`).toBeGreaterThan(a.gold + a.violet);
    }
  });

  it('passer Argent ne donne jamais de violet ni de doré ; le haut de l’échelle en donne', () => {
    expect(ascensionRuneOdds(1).violet + ascensionRuneOdds(1).gold).toBe(0);
    expect(ascensionRuneOdds(9).gold).toBeGreaterThan(0.2);
  });

  it('le tirage suit les chances', () => {
    const rng = mulberry32(5);
    const n = 20000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const t = rollAscensionRune(rng, 5);
      count[t] = (count[t] ?? 0) + 1;
    }
    const o = ascensionRuneOdds(5);
    for (const t of RUNE_TIERS) expect(count[t]! / n, t).toBeCloseTo(o[t], 1);
  });

  it('l’Éveil tire comme une ascension au rang actuel', () => {
    for (const r of [1, 5, 9]) {
      const a = mulberry32(r);
      const b = mulberry32(r);
      for (let i = 0; i < 50; i++) expect(rollAwakenRune(a, r)).toBe(rollAscensionRune(b, r));
    }
  });

  it('les archives donnent une rune verte', () => {
    expect(ARCHIVE_RUNE).toBe('green');
  });

  it('⚠️ faille : en dessous verte, ton rang bleue, au-dessus violette jeune et dorée mûre', () => {
    expect(riftRune(2, 3, 1)).toBe('green');
    expect(riftRune(3, 3, 1)).toBe('blue');
    expect(riftRune(4, 3, 0)).toBe('violet');
    expect(riftRune(4, 3, RUNE_SOURCES.riftMatureAt - 0.01)).toBe('violet');
    expect(riftRune(4, 3, RUNE_SOURCES.riftMatureAt)).toBe('gold');
  });

  it('boss entre amis : chaque cran a sa rune, l’Échauffement aucune', () => {
    for (const t of BOSS_TIERS) expect(t.id in FRIEND_BOSS_RUNE, t.id).toBe(true);
    expect(FRIEND_BOSS_RUNE.echauffement).toBeNull();
    expect(FRIEND_BOSS_RUNE.inhumain).toBe('gold');
    // Plus le cran est dur, plus la rune est haute (jamais en recul).
    const idx = BOSS_TIERS.map((t) => {
      const r = FRIEND_BOSS_RUNE[t.id];
      return r ? RUNE_TIERS.indexOf(r) : -1;
    });
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]!);
  });

  it('Défi 360 : verte, bleue quand il est intense', () => {
    expect(comboRune(CHEST_MIN_MULT)).toBe('green');
    expect(comboRune(1)).toBe('green');
    expect(comboRune(CHEST_MAX_MULT)).toBe('blue');
  });
});
