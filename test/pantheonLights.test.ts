import { describe, expect, it } from 'vitest';
import { pantheonLights } from '@/lib/pantheonLights';
import { normalizeRuneBank, RUNE_LOT } from '@/lib/runeBank';
import { GACHA } from '@/lib/gacha';
import { emptySeals } from '@/lib/ascension';

const base = {
  advs: [],
  stock: [],
  pantheonLevel: 30,
  seals: emptySeals(),
  gold: 0,
  runes: normalizeRuneBank(null),
  tickets: 0,
  mana: 0,
};
const lit = (o: Partial<typeof base>) =>
  Object.fromEntries(pantheonLights({ ...base, ...o }).map((l) => [l.id, l.on]));

describe('pantheonLights — les 4 voyants du Panthéon', () => {
  it('rend 4 voyants dans l’ordre, chacun sa couleur', () => {
    const l = pantheonLights(base);
    expect(l.map((x) => x.id)).toEqual(['champion', 'gear', 'runes', 'summon']);
    expect(new Set(l.map((x) => x.color)).size).toBe(4);
    expect(l.every((x) => !x.on)).toBe(true);
  });
  it('10 runes : allumé dès le prix d’un lot (9), pas avant', () => {
    expect(lit({ runes: normalizeRuneBank({ runes: RUNE_LOT.cost }) }).runes).toBe(true);
    expect(lit({ runes: normalizeRuneBank({ runes: RUNE_LOT.cost - 1 }) }).runes).toBe(false);
  });
  it('invocation ×10 : tickets seuls, mana seule, ou les deux combinés', () => {
    expect(lit({ tickets: GACHA.multiPaid }).summon).toBe(true);
    expect(lit({ tickets: GACHA.multiPaid - 1 }).summon).toBe(false);
    expect(lit({ mana: GACHA.multiPaid * GACHA.pullCost }).summon).toBe(true);
    expect(lit({ tickets: GACHA.multiPaid - 1, mana: GACHA.pullCost }).summon).toBe(true);
    // Les deux autres voyants ne s’allument pas pour autant.
    const o = lit({ tickets: 99, mana: 1e6, runes: normalizeRuneBank({ runes: 99 }) });
    expect(o.champion).toBe(false);
    expect(o.gear).toBe(false);
  });
});
