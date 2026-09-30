import { describe, it, expect } from 'vitest';
import { CHAMPIONS } from '@/data/champions';
import { normalizeChampSkills, SKILL_MAX_LEVEL } from '@/lib/skillRunes';
import {
  AWAKEN_RUNE_COUNT,
  REFUND_PER_LEVEL,
  RUNE_BANK_VERSION,
  addRuneCount,
  ascensionRuneCount,
  emptyBank,
  migrateLegacyRunes,
  rollPlaceRunes,
  runeCount,
  type LegacyChampion,
} from '@/lib/runeBank';
import { buildMessage } from '@/lib/expedition';
import { advChampionSlots, advSkillCells, type Adventurer } from '@/lib/adventurers';

/** 🔁 La bascule vers les runes multicolores, et les compétences d'un champion. */

const A = CHAMPIONS.find((c) => c.grade === 'A')!;
const champ = (over: Partial<Adventurer> = {}): Adventurer => ({
  id: 'c1',
  name: A.name,
  seed: 1,
  path: [],
  level: 25,
  xp: 0,
  championId: A.id,
  copies: 1,
  ...over,
});
const legacy = (over: Partial<LegacyChampion> = {}): LegacyChampion => ({
  skills: [],
  grade: 'A',
  ascended: 0,
  awaken: 0,
  ...over,
});

describe('🔁 la bascule, une fois', () => {
  it('rembourse chaque NIVEAU selon sa couleur, le stock coloré et la rune en attente', () => {
    const out = migrateLegacyRunes(
      {
        stock: { green: 2, blue: 1, violet: 0, gold: 1 },
        pending: { advId: 'c1', tier: 'violet', drawn: 'crit' },
        comp: 1,
      },
      [
        legacy({
          skills: [
            { id: 'speed', level: 3 },
            { id: 'crit', level: 2 },
          ],
        }),
        legacy({ skills: [{ id: 'plunder', level: 1 }] }),
      ],
    )!;
    // Compétences 3×1 + 2×3 + 1×5 = 14 · stock 2 + 2 + 5 = 9 · attente (violette) 3.
    expect(out.refunded).toBe(26);
    expect(out.bank).toEqual({ runes: 26, skills: [], opened: 0, comp: RUNE_BANK_VERSION });
  });

  it('⚠️ idempotente : une banque déjà basculée ne rend plus rien', () => {
    const once = migrateLegacyRunes({ stock: { green: 3 }, comp: 1 }, [])!;
    expect(
      migrateLegacyRunes(once.bank, [legacy({ skills: [{ id: 'pv', level: 5 }] })]),
    ).toBeNull();
  });

  it('⚠️ la compensation déjà versée (comp 1) n’est PAS reversée', () => {
    const out = migrateLegacyRunes({ comp: 1 }, [legacy({ ascended: 3, awaken: 2 })])!;
    expect(out.refunded).toBe(0);
  });

  it('un compte jamais compensé (comp 0) reçoit la compensation aux QUANTITÉS du nouveau modèle', () => {
    const out = migrateLegacyRunes(null, [
      legacy({ grade: 'S', ascended: 5, awaken: 2 }),
      legacy({ grade: null, ascended: 4, awaken: 3 }), // un legacy : rien
    ])!;
    const asc = [1, 2, 3, 4, 5].reduce((n, r) => n + ascensionRuneCount(r), 0);
    expect(out.refunded).toBe(asc + 2 * AWAKEN_RUNE_COUNT.S);
  });

  it('le barème : plus la couleur est rare, mieux elle est remboursée', () => {
    expect(REFUND_PER_LEVEL.green).toBeLessThan(REFUND_PER_LEVEL.blue);
    expect(REFUND_PER_LEVEL.blue).toBeLessThan(REFUND_PER_LEVEL.violet);
    expect(REFUND_PER_LEVEL.violet).toBeLessThan(REFUND_PER_LEVEL.gold);
  });
});

describe('🪬 compter et ajouter des runes', () => {
  it('⚠️ un ancien rapport porte un TABLEAU de couleurs : une rune multicolore par entrée', () => {
    expect(runeCount(['green', 'gold'])).toBe(2);
    expect(runeCount(3)).toBe(3);
    expect(runeCount(undefined)).toBe(0);
    expect(runeCount(-2)).toBe(0);
    expect(runeCount(2.9)).toBe(2);
  });

  it('un lieu réussi : 1 à ton rang, 2 au-dessus, 3 pour une faille MÛRE au-dessus', () => {
    const drop = () => 0; // la chance tombe toujours
    const at = (placeRankIndex: number, place: 'camp' | 'rift' = 'camp', maturity = 0) =>
      rollPlaceRunes(drop, { place, placeRankIndex, playerRankIndex: 3, maturity });
    expect(at(3)).toBe(1);
    expect(at(4)).toBe(2);
    expect(at(4, 'rift', 0)).toBe(2);
    expect(at(4, 'rift', 1)).toBe(3);
    expect(at(4, 'camp', 1)).toBe(2); // « mûr » ne veut rien dire pour un camp
    expect(
      rollPlaceRunes(() => 0.999, { place: 'camp', placeRankIndex: 3, playerRankIndex: 3 }),
    ).toBe(0);
  });

  it('le rapport d’un voyage porte ses runes — un tableau d’avant la bascule compte aussi', () => {
    const exp = (runes: unknown) =>
      ({
        poi: { id: 'p', type: 'camp', level: 3 },
        sentAt: 1,
        midAt: 2,
        returnAt: 3,
        outcome: { win: true, text: '', gold: 0, energy: 0, key: 0, runes },
      }) as never;
    expect(buildMessage(exp(2)).runes).toBe(2);
    expect(buildMessage(exp(['green', 'gold', 'blue'])).runes).toBe(3);
    expect(buildMessage(exp(undefined)).runes).toBeUndefined();
  });

  it('ajouter ne touche pas l’état d’origine, et zéro rend le même objet', () => {
    const b = emptyBank();
    const c = addRuneCount(b, 4);
    expect(c.runes).toBe(4);
    expect(b.runes).toBe(0);
    expect(addRuneCount(b, 0)).toBe(b);
  });
});

describe('🪬 les compétences d’un champion', () => {
  it('inconnues et doublons écartés, niveaux bornés', () => {
    expect(
      normalizeChampSkills([
        { id: 'pv', level: 9 },
        { id: 'pv', level: 1 },
        { id: 'zz', level: 1 },
        { id: 'crit', level: 0 },
      ]),
    ).toEqual([
      { id: 'pv', level: SKILL_MAX_LEVEL },
      { id: 'crit', level: 1 },
    ]);
    expect(normalizeChampSkills('x')).toEqual([]);
  });

  it('la miniature : ses compétences puis un null par emplacement libre', () => {
    const a = champ({ skills: [{ id: 'haul', level: 2 }] });
    expect(advSkillCells(a)).toEqual([{ id: 'haul', level: 2 }, null]);
    expect(advSkillCells({ ...a, championId: undefined })).toEqual([]);
    const trop = champ({
      skills: [
        { id: 'haul', level: 1 },
        { id: 'speed', level: 1 },
        { id: 'care', level: 1 },
      ],
    });
    expect(advSkillCells(trop)).toHaveLength(3);
  });

  it('ce que le don lit d’un champion : compétences, emplacements, rang', () => {
    const c = advChampionSlots(champ({ skills: [{ id: 'pv', level: 2 }] }));
    expect(c.skills).toEqual([{ id: 'pv', level: 2 }]);
    expect(c.slots).toBe(2);
    expect(advChampionSlots(champ({ championId: undefined })).slots).toBe(0);
  });
});
