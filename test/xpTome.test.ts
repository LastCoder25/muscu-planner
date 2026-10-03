import { describe, expect, it } from 'vitest';
import { advXpToNext, grantAdvXp, type Adventurer } from '../src/lib/adventurers';
import { rankStartLevel } from '../src/lib/characterRank';
import { CHAMPIONS } from '../src/data/champions';
import {
  SUPPLIES,
  SUPPLY_WEIGHT,
  TOME_IDS,
  TOME_XP,
  isTomeId,
  pickSupply,
  supplyUselessWhy,
} from '../src/lib/supplies';
import { openTome, tomeChoices } from '../src/lib/xpTome';

const champ = (level: number, xp = 0, ascended?: number): Adventurer => ({
  id: 'a1',
  name: 'Test',
  seed: 7,
  path: [],
  championId: CHAMPIONS[0]!.id,
  level,
  xp,
  ...(ascended !== undefined ? { ascended } : {}),
});

/** Niveaux qu'un tome ferait gagner à un champion sans plafond qui morde. */
function levelsFrom(level: number, xp: number): number {
  let l = level;
  let pool = xp;
  while (pool >= advXpToNext(l)) {
    pool -= advXpToNext(l);
    l++;
  }
  return l - level;
}

describe('📘 tomes d’expérience', () => {
  it('plusieurs tailles, du plus petit au plus gros, et les gros plus rares', () => {
    expect(TOME_IDS.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < TOME_IDS.length; i++) {
      expect(TOME_XP[TOME_IDS[i]!]).toBeGreaterThan(TOME_XP[TOME_IDS[i - 1]!]);
      expect(SUPPLY_WEIGHT[TOME_IDS[i]!]).toBeLessThan(SUPPLY_WEIGHT[TOME_IDS[i - 1]!]);
    }
  });

  it('chaque rang a un tome qui le fait monter d’au moins un niveau, sans tout offrir', () => {
    for (let r = 0; r < 10; r++) {
      const L = rankStartLevel(r);
      const gains = TOME_IDS.map((id) => levelsFrom(L, TOME_XP[id]));
      // Il en existe un utile (≥ 1 niveau) et pas un qui saute un rang entier (10 niveaux).
      expect(
        gains.some((g) => g >= 1 && g <= 5),
        `rang ${r}`,
      ).toBe(true);
    }
    // Le plus petit compte pour un Bronze, le plus gros pour le haut de l'échelle.
    expect(levelsFrom(1, TOME_XP[TOME_IDS[0]!])).toBeGreaterThanOrEqual(1);
    expect(levelsFrom(91, TOME_XP[TOME_IDS[TOME_IDS.length - 1]!])).toBeGreaterThanOrEqual(1);
  });

  it('ouvrir un tome = l’XP d’une mission (`grantAdvXp`), plafonds compris', () => {
    const a = champ(3, 10);
    expect(openTome(a, 'tome600', 50).after).toEqual(grantAdvXp(a, 600, 50));
  });

  it('au plafond, l’XP est gardée et le tome le dit', () => {
    const capped = openTome(champ(5), 'tome4000', 5);
    expect(capped.after.level).toBe(5);
    expect(capped.after.xp).toBe(4000);
    expect(capped.banked).toBe(true);
    expect(openTome(champ(3), 'tome100', 50).banked).toBe(false);
  });

  it('les choix ne listent que les tomes possédés, avec les étoiles gagnées', () => {
    const c = tomeChoices({ tome100: 2, tome1500: 1 }, champ(1), 50);
    expect(c.map((x) => x.id)).toEqual(['tome100', 'tome1500']);
    expect(c[0]!.count).toBe(2);
    expect(c[1]!.stars).toBeGreaterThan(0);
    expect(c[1]!.levels).toBeGreaterThan(c[0]!.levels);
  });

  it('un tome ne part pas en voyage et sort du butin', () => {
    for (const id of TOME_IDS) {
      expect(SUPPLIES[id].voyage).toBe(false);
      expect(
        supplyUselessWhy(id, { type: 'camp', fights: true, harvest: false, hero: true, escort: 2 }),
      ).not.toBeNull();
    }
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(pickSupply(i / 2000));
    expect([...seen].filter(isTomeId).length).toBe(TOME_IDS.length);
  });
});
