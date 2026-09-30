import { describe, expect, it } from 'vitest';
import {
  AWAKEN_RUNE_COUNT,
  REFUND_PER_LEVEL,
  RUNE_LOT,
  RUNE_ODDS,
  ascensionRuneCount,
  emptyBank,
  fuseBlocker,
  fuseSkills,
  giveBlocker,
  giveKind,
  giveSkill,
  legacyRefund,
  normalizeRuneBank,
  openBlocker,
  openRune,
  openRunes,
  placeRuneCount,
  type GiveKind,
  type RuneBank,
  type StockSkill,
} from '@/lib/runeBank';
import { RUNE_TIERS, SKILLS, placeRuneOdds, skillsOfTier } from '@/lib/skillRunes';

const bank = (runes: number, skills: StockSkill[] = []): RuneBank => ({
  runes,
  skills,
  opened: skills.length,
});
const sk = (uid: string, id: StockSkill['id'], level = 1): StockSkill => ({ uid, id, level });

describe('table unique', () => {
  it('somme 1, et vaut la table d’un lieu à ton rang', () => {
    const sum = RUNE_TIERS.reduce((n, t) => n + RUNE_ODDS[t], 0);
    expect(sum).toBeCloseTo(1, 9);
    const equal = placeRuneOdds({ place: 'camp', placeRankIndex: 3, playerRankIndex: 3 });
    for (const t of RUNE_TIERS) expect(RUNE_ODDS[t]).toBeCloseTo(equal[t], 9);
  });

  it('l’ouverture suit la table (20 000 tirages)', () => {
    const count = { green: 0, blue: 0, violet: 0, gold: 0 };
    for (let i = 1; i <= 20000; i++) count[SKILLS[openRune('j', i).id].tier]++;
    for (const t of RUNE_TIERS) expect(count[t] / 20000).toBeCloseTo(RUNE_ODDS[t], 1);
    expect(count.gold).toBeGreaterThan(100);
  });

  it('toutes les compétences d’une couleur sortent', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 4000; i++) seen.add(openRune('j', i).id);
    for (const t of ['green', 'blue', 'violet'] as const)
      for (const id of skillsOfTier(t)) expect(seen.has(id)).toBe(true);
  });

  it('déterministe : même joueur et même numéro, même compétence ; niveau 1', () => {
    expect(openRune('a', 7)).toEqual(openRune('a', 7));
    expect(openRune('a', 7).level).toBe(1);
    const differ = [1, 2, 3, 4, 5, 6, 7, 8].some(
      (n) => openRune('a', n).id !== openRune('b', n).id,
    );
    expect(differ).toBe(true);
  });
});

describe('ouvrir', () => {
  it('une rune : −1 rune, +1 compétence, compteur avancé', () => {
    const r = openRunes(bank(3), 'j', 1)!;
    expect(r.bank.runes).toBe(2);
    expect(r.bank.skills).toHaveLength(1);
    expect(r.bank.opened).toBe(1);
    expect(r.opened[0]).toEqual(openRune('j', 1));
  });

  it('un lot : 9 runes pour 10 compétences', () => {
    expect(RUNE_LOT).toEqual({ size: 10, cost: 9 });
    const r = openRunes(bank(9), 'j', 10)!;
    expect(r.bank.runes).toBe(0);
    expect(r.opened).toHaveLength(10);
    expect(new Set(r.bank.skills.map((s) => s.uid)).size).toBe(10);
  });

  it('refuse sans assez de runes, et toute autre taille qu’1 ou 10', () => {
    expect(openBlocker(bank(0), 1)).toBe('none');
    expect(openBlocker(bank(8), 10)).toBe('none');
    expect(openBlocker(bank(9), 10)).toBeNull();
    expect(openBlocker(bank(50), 5)).toBe('lot');
    expect(openRunes(bank(8), 'j', 10)).toBeNull();
  });

  it('deux ouvertures successives ne rejouent pas le même tirage', () => {
    const a = openRunes(bank(2), 'j', 1)!;
    const b = openRunes(a.bank, 'j', 1)!;
    expect(b.opened[0]!.uid).not.toBe(a.opened[0]!.uid);
    expect(b.opened[0]).toEqual(openRune('j', 2));
  });
});

describe('fusionner', () => {
  it('les niveaux s’additionnent, l’exemplaire absorbé disparaît', () => {
    const b = fuseSkills(
      bank(0, [sk('a', 'crit', 2), sk('b', 'crit', 1), sk('c', 'pv')]),
      'a',
      'b',
    )!;
    expect(b.skills).toEqual([sk('a', 'crit', 3), sk('c', 'pv')]);
  });

  it('refuse au-delà de 5, deux compétences différentes, le même exemplaire, un absent', () => {
    const b = bank(0, [sk('a', 'crit', 3), sk('b', 'crit', 3), sk('c', 'pv'), sk('d', 'crit', 2)]);
    expect(fuseBlocker(b, 'a', 'b')).toBe('over');
    expect(fuseBlocker(b, 'a', 'd')).toBeNull();
    expect(fuseBlocker(b, 'a', 'c')).toBe('different');
    expect(fuseBlocker(b, 'a', 'a')).toBe('same');
    expect(fuseBlocker(b, 'a', 'z')).toBe('missing');
    expect(fuseSkills(b, 'a', 'b')).toBeNull();
  });
});

describe('donner à un champion', () => {
  const c = (skills: { id: StockSkill['id']; level: number }[], slots = 3, rankIndex = 3) => ({
    skills,
    slots,
    rankIndex,
  });

  it('nouvelle compétence dans une place libre, à son niveau', () => {
    const r = giveSkill(bank(0, [sk('a', 'crit', 2)]), 'a', c([{ id: 'pv', level: 1 }]))!;
    expect(r.skills).toEqual([
      { id: 'pv', level: 1 },
      { id: 'crit', level: 2 },
    ]);
    expect(r.bank.skills).toEqual([]);
  });

  it('compétence déjà portée : les niveaux s’additionnent, refus au-delà de 5', () => {
    const b = bank(0, [sk('a', 'crit', 2)]);
    expect(giveSkill(b, 'a', c([{ id: 'crit', level: 3 }]))!.skills).toEqual([
      { id: 'crit', level: 5 },
    ]);
    expect(giveBlocker(b, 'a', c([{ id: 'crit', level: 4 }]))).toBe('over');
  });

  it('champion plein : il faut choisir quoi remplacer, l’ancienne est perdue', () => {
    const b = bank(0, [sk('a', 'crit', 2)]);
    const full = c(
      [
        { id: 'pv', level: 3 },
        { id: 'damage', level: 1 },
      ],
      2,
    );
    expect(giveBlocker(b, 'a', full)).toBe('full');
    expect(giveBlocker(b, 'a', full, 5)).toBe('full');
    expect(giveSkill(b, 'a', full, 0)!.skills).toEqual([
      { id: 'crit', level: 2 },
      { id: 'damage', level: 1 },
    ]);
  });

  it('annonce ce que le don ferait (pastille de l’écran)', () => {
    expect(giveKind(c([]), 'crit')).toBe('new');
    expect(giveKind(c([{ id: 'crit', level: 1 }]), 'crit')).toBe('stack');
    const full = c(
      [
        { id: 'pv', level: 1 },
        { id: 'damage', level: 1 },
      ],
      2,
    );
    const kind: GiveKind = giveKind(full, 'crit');
    expect(kind).toBe('replace');
  });

  it('respecte le rang de la couleur, et refuse hors champion', () => {
    const b = bank(0, [sk('a', 'crit'), sk('g', 'plunder')]);
    expect(giveBlocker(b, 'a', c([], 3, 0))).toBe('rank');
    expect(giveBlocker(b, 'a', c([], 3, 1))).toBeNull();
    expect(giveBlocker(b, 'g', c([], 3, 1))).toBe('rank');
    expect(giveBlocker(b, 'a', c([], 0, 3))).toBe('missing');
  });
});

describe('quantités par source', () => {
  it('lieux : 1 à ton rang ou dessous, 2 au-dessus, 3 pour une faille mûre au-dessus', () => {
    expect(placeRuneCount({ placeRankIndex: 2, playerRankIndex: 3 })).toBe(1);
    expect(placeRuneCount({ placeRankIndex: 3, playerRankIndex: 3 })).toBe(1);
    expect(placeRuneCount({ placeRankIndex: 4, playerRankIndex: 3 })).toBe(2);
    expect(placeRuneCount({ placeRankIndex: 4, playerRankIndex: 3, riftMature: true })).toBe(3);
    expect(placeRuneCount({ placeRankIndex: 3, playerRankIndex: 3, riftMature: true })).toBe(1);
  });

  it('ascension : 1 jusqu’à l’Or noir, 2 de Légendaire à Divin, 3 au-delà ; Éveil par lettre', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(ascensionRuneCount)).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3,
    ]);
    expect(AWAKEN_RUNE_COUNT).toEqual({ A: 1, S: 2, X: 3 });
  });
});

describe('relecture et migration', () => {
  it('relecture défensive : ids inconnus, doublons, niveaux hors bornes', () => {
    const b = normalizeRuneBank({
      runes: 3.7,
      opened: -2,
      skills: [
        sk('a', 'crit', 9),
        sk('a', 'pv'),
        { uid: 'x', id: 'nope', level: 1 },
        sk('b', 'pv', 0),
      ],
    });
    expect(b).toEqual({ runes: 3, opened: 0, skills: [sk('a', 'crit', 5), sk('b', 'pv', 1)] });
    expect(normalizeRuneBank(null)).toEqual(emptyBank());
  });

  it('rembourse chaque niveau selon sa couleur, le stock coloré et la rune en attente', () => {
    expect(REFUND_PER_LEVEL).toEqual({ green: 1, blue: 2, violet: 3, gold: 5 });
    const n = legacyRefund(
      [
        [
          { id: 'speed', level: 3 },
          { id: 'crit', level: 2 },
        ],
        [{ id: 'plunder', level: 1 }],
      ],
      { green: 2, blue: 1, violet: 0, gold: 1 },
      'blue',
    );
    // 3×1 + 2×3 + 1×5 = 14 · stock 2 + 2 + 5 = 9 · attente 2
    expect(n).toBe(25);
  });
});
