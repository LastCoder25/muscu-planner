import { describe, expect, it } from 'vitest';
import {
  BLESSED_ODDS,
  EXALTED_ODDS,
  RUNE_LOT,
  RUNE_ODDS,
  addRuneCount,
  emptyBank,
  normalizeRuneBank,
  openRune,
  openRunes,
} from '@/lib/runeBank';
import { SKILLS } from '@/lib/skillRunes';

// ⚗️ Le laboratoire de l'île 5 : ses runes s'ouvrent « à partir du violet ».
describe('runes du laboratoire « à partir du violet »', () => {
  it('la table sans vert ni bleu est la table commune renormalisée', () => {
    expect(EXALTED_ODDS.green).toBe(0);
    expect(EXALTED_ODDS.blue).toBe(0);
    const sum = Object.values(EXALTED_ODDS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(EXALTED_ODDS.violet / EXALTED_ODDS.gold).toBeCloseTo(
      RUNE_ODDS.violet / RUNE_ODDS.gold,
      9,
    );
    // Strictement mieux qu'une rune de l'autel.
    expect(EXALTED_ODDS.gold).toBeGreaterThan(BLESSED_ODDS.gold);
  });

  it('ne s’ouvre JAMAIS verte ni bleue (balayage), et sort des dorées', () => {
    let gold = 0;
    for (let n = 1; n <= 3000; n++) {
      const t = SKILLS[openRune('j', n, 'exalted').id].tier;
      expect(t === 'violet' || t === 'gold').toBe(true);
      if (t === 'gold') gold++;
    }
    // ~12,5 % attendus : ni zéro, ni la majorité.
    expect(gold).toBeGreaterThan(200);
    expect(gold).toBeLessThan(600);
  });

  it('reste déterministe, et le drapeau `true` garde le sens « bénie »', () => {
    expect(openRune('a', 7, 'exalted')).toEqual(openRune('a', 7, 'exalted'));
    expect(openRune('a', 7, true)).toEqual(openRune('a', 7, 'blessed'));
    expect(openRune('a', 7)).toEqual(openRune('a', 7, 'base'));
  });

  it('crédit : comptées dans le total, bornées, jamais plus que les runes', () => {
    const b = addRuneCount(emptyBank(), 5, 1, 2);
    expect(b).toMatchObject({ runes: 5, blessed: 1, exalted: 2 });
    // L'ancien appel à trois arguments ne touche pas aux violettes.
    expect(addRuneCount(emptyBank(), 3, 1).exalted).toBe(0);
    // Plus de violettes que de runes : bornées au total, et les bénies au reste.
    const over = addRuneCount(emptyBank(), 2, 5, 9);
    expect(over).toMatchObject({ runes: 2, exalted: 2, blessed: 0 });
    expect(addRuneCount(emptyBank(), 4, 3, 2)).toMatchObject({ exalted: 2, blessed: 2 });
  });

  it('normalisation : absent = 0, borné aux runes, bénies + violettes ≤ runes', () => {
    expect(normalizeRuneBank({ runes: 3 }).exalted).toBe(0);
    expect(normalizeRuneBank({ runes: 2, exalted: 9 }).exalted).toBe(2);
    const n = normalizeRuneBank({ runes: 4, blessed: 3, exalted: 3 });
    expect(n.exalted).toBe(3);
    expect(n.blessed).toBe(1);
    expect(n.blessed + n.exalted).toBeLessThanOrEqual(n.runes);
    expect(emptyBank().exalted).toBe(0);
  });

  it('consommées AVANT les bénies, puis les bénies avant les ordinaires', () => {
    const b = addRuneCount(addRuneCount(emptyBank(), 2), 3, 1, 2);
    const a = openRunes(b, 'j', 1)!;
    expect(a.bank).toMatchObject({ runes: 4, exalted: 1, blessed: 1 });
    expect(a.opened[0]).toEqual(openRune('j', 1, 'exalted'));
    const c = openRunes(openRunes(a.bank, 'j', 1)!.bank, 'j', 1)!;
    expect(c.bank).toMatchObject({ runes: 2, exalted: 0, blessed: 0 });
    expect(c.opened[0]).toEqual(openRune('j', 3, 'blessed'));
    const d = openRunes(c.bank, 'j', 1)!;
    expect(d.opened[0]).toEqual(openRune('j', 4, 'base'));
  });

  it('dans un lot : violettes, puis bénies, la gratuite reste ordinaire', () => {
    const bank = addRuneCount(emptyBank(), RUNE_LOT.cost, 4, 3);
    const lot = openRunes(bank, 'j', RUNE_LOT.size)!;
    expect(lot.bank).toMatchObject({ runes: 0, exalted: 0, blessed: 0 });
    lot.opened.forEach((s, i) => {
      const grade = i < 3 ? 'exalted' : i < 7 ? 'blessed' : 'base';
      expect(s).toEqual(openRune('j', i + 1, grade));
    });
  });
});
