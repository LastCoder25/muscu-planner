import { describe, expect, it } from 'vitest';
import {
  BLESSED_ODDS,
  RUNE_ODDS,
  RUNE_LOT,
  addRuneCount,
  emptyBank,
  normalizeRuneBank,
  openRune,
  openRunes,
} from '@/lib/runeBank';
import { SKILLS } from '@/lib/skillRunes';

// 🪬 L'autel des runes de l'île 5 : ses runes s'ouvrent « à partir du bleu ».
describe('runes de l’autel « à partir du bleu »', () => {
  it('la table sans vert est la table commune renormalisée', () => {
    expect(BLESSED_ODDS.green).toBe(0);
    const sum = Object.values(BLESSED_ODDS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(BLESSED_ODDS.blue / BLESSED_ODDS.violet).toBeCloseTo(
      RUNE_ODDS.blue / RUNE_ODDS.violet,
      9,
    );
  });

  it('une rune de l’autel ne s’ouvre jamais verte ; une rune ordinaire, souvent', () => {
    let green = 0;
    for (let n = 1; n <= 500; n++) {
      expect(SKILLS[openRune('j', n, true).id].tier).not.toBe('green');
      if (SKILLS[openRune('j', n).id].tier === 'green') green++;
    }
    expect(green).toBeGreaterThan(250);
  });

  it('elles comptent dans le stock et ne dépassent jamais le total', () => {
    const b = addRuneCount(addRuneCount(emptyBank(), 3), 2, 2);
    expect(b.runes).toBe(5);
    expect(b.blessed).toBe(2);
    expect(addRuneCount(emptyBank(), 1, 5).blessed).toBe(1);
    expect(normalizeRuneBank({ runes: 2, blessed: 9 }).blessed).toBe(2);
    expect(normalizeRuneBank({ runes: 2 }).blessed).toBe(0);
  });

  it('elles s’ouvrent en premier', () => {
    const b = addRuneCount(addRuneCount(emptyBank(), 4), 2, 2);
    const one = openRunes(b, 'j', 1)!;
    expect(one.bank.blessed).toBe(1);
    expect(one.bank.runes).toBe(5);
    expect(SKILLS[one.opened[0]!.id].tier).not.toBe('green');
    const plain = openRunes({ ...b, blessed: 0 }, 'j', 1)!;
    expect(plain.bank.blessed).toBe(0);
  });

  it('dans un lot, les runes payées de l’autel s’ouvrent bleues ou mieux, la gratuite reste ordinaire', () => {
    const b = addRuneCount(emptyBank(), RUNE_LOT.cost, RUNE_LOT.cost);
    const lot = openRunes(b, 'j', RUNE_LOT.size)!;
    expect(lot.bank.blessed).toBe(0);
    expect(lot.bank.runes).toBe(0);
    for (const s of lot.opened.slice(0, RUNE_LOT.cost)) expect(SKILLS[s.id].tier).not.toBe('green');
    // La 10ᵉ suit la table ordinaire : même tirage qu'une rune ordinaire de même numéro.
    expect(lot.opened[RUNE_LOT.size - 1]).toEqual(openRune('j', RUNE_LOT.size));
    // Avec plus de runes de l’autel qu’un lot n’en paie, la gratuite ne consomme pas la sienne.
    const more = openRunes(
      addRuneCount(emptyBank(), RUNE_LOT.size, RUNE_LOT.size),
      'j',
      RUNE_LOT.size,
    )!;
    expect(more.bank.blessed).toBe(RUNE_LOT.size - RUNE_LOT.cost);
    expect(more.opened[RUNE_LOT.size - 1]).toEqual(openRune('j', RUNE_LOT.size));
  });
});
