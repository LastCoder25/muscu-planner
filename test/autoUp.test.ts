import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  anyAutoUp,
  nextChampionToAscend,
  nextGearToAscend,
  parseAutoUp,
  type AutoUpSettings,
} from '@/lib/autoUp';
import { addSeals, ascensionCost, emptySeals } from '@/lib/ascension';
import { advXpToNext, type Adventurer } from '@/lib/adventurers';

const adv = (id: string, level: number, xp = 0): Adventurer => ({
  id,
  name: id,
  seed: 1,
  path: ['guerrier'],
  level,
  xp,
});
/** Au plafond ET ★5 plein : l'ascension vers le rang 1 est structurellement permise. */
const pret = (id: string): Adventurer => adv(id, 10, advXpToNext(10));

const riche = () => {
  const c = ascensionCost(1);
  return {
    pantheonLevel: 100,
    seals: addSeals(emptySeals(), 'champion', 1, c.seals),
    gold: c.gold,
  };
};

describe('parseAutoUp — relecture défensive', () => {
  it('absent, vide ou illisible : tout éteint (jamais de dépense sur un JSON douteux)', () => {
    const off: AutoUpSettings = { champions: false, gear: false, merge: false };
    expect(parseAutoUp(null)).toEqual(off);
    expect(parseAutoUp('')).toEqual(off);
    expect(parseAutoUp('{pas du json')).toEqual(off);
    expect(parseAutoUp('{"champions":"oui"}')).toEqual(off);
  });
  it('ne lit que les vrais booléens', () => {
    expect(parseAutoUp('{"champions":true,"merge":true}')).toEqual({
      champions: true,
      gear: false,
      merge: true,
    });
  });
  it('anyAutoUp dit si quelque chose tourne', () => {
    expect(anyAutoUp(parseAutoUp(null))).toBe(false);
    expect(anyAutoUp(parseAutoUp('{"gear":true}'))).toBe(true);
  });
});

describe('nextChampionToAscend', () => {
  it('prend le premier champion prêt, en ignorant ceux qui ne sont pas ★5', () => {
    const got = nextChampionToAscend([adv('a', 4), pret('b'), pret('c')], riche());
    expect(got?.id).toBe('b');
  });
  it('rien si les sceaux ou l’or manquent', () => {
    const r = riche();
    expect(nextChampionToAscend([pret('b')], { ...r, gold: r.gold - 1 })).toBeNull();
    expect(nextChampionToAscend([pret('b')], { ...r, seals: emptySeals() })).toBeNull();
  });
  it('rien si le Panthéon ne laisse pas monter', () => {
    expect(nextChampionToAscend([pret('b')], { ...riche(), pantheonLevel: 1 })).toBeNull();
  });
  it('rien sans champion', () => {
    expect(nextChampionToAscend([], riche())).toBeNull();
  });
});

describe('nextGearToAscend', () => {
  it('rien sur un stock vide', () => {
    expect(nextGearToAscend([], { advs: [], seals: emptySeals(), gold: 1e9 })).toBeNull();
  });
});

describe('🔕 animations en mode automatique', () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  it("l'ascension de pièce de l'automatisation est silencieuse, celle des champions garde son éclat", () => {
    const engine = read('src/composables/useAutoUp.ts');
    expect(engine).toMatch(/char\.ascendGear\(uid, g\.id, undefined, true\)/);
    expect(engine).toMatch(/char\.ascendChampion\(uid, a\.id\)/);
    const store = read('src/stores/character.ts');
    expect(store).toMatch(/if \(!silent\)\s+useGameFx\(\)\.celebrate\(\{\s+kind: 'rankup',\s+emoji: g\.emoji/);
  });
});
