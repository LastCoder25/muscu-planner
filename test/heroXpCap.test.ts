import { describe, expect, it } from 'vitest';
import {
  advAscensionReady,
  advXpRoom,
  advXpToNext,
  ascendAdventurer,
  grantAdvXp,
  type Adventurer,
} from '@/lib/adventurers';
import { openTome } from '@/lib/xpTome';
import { TOME_IDS, TOME_XP } from '@/lib/supplies';

/**
 * 🧑‍✈️ UN CHAMPION NE DÉPASSE JAMAIS LE HÉROS (2026-10-13, décision de l'utilisateur : « les
 * champions ne gagnent ni ne stockent d'XP une fois qu'ils ont rattrapé le héros ; l'XP
 * accumulée avant une ascension ne doit pas leur permettre de dépasser le héros »).
 */
const adv = (level: number, ascended?: number, xp = 0): Adventurer => ({
  id: 'a',
  name: 'A',
  seed: 1,
  path: ['guerrier'],
  level,
  xp,
  ...(ascended != null ? { ascended } : {}),
});

/** L'XP qui sépare le niveau `from` du niveau `to`. */
const span = (from: number, to: number) => {
  let s = 0;
  for (let l = from; l < to; l++) s += advXpToNext(l);
  return s;
};

describe('XP des champions bornée au niveau du héros', () => {
  it('au niveau du héros, il ne gagne ni ne stocke RIEN', () => {
    const a = adv(15, 1);
    const b = grantAdvXp(a, 50_000, 100, 15);
    expect(b.level).toBe(15);
    expect(b.xp).toBe(0);
    expect(advXpRoom(a, 15)).toBe(0);
  });

  it('bloqué par le Panthéon, il stocke JUSTE ce qui mène au héros, pas plus', () => {
    const b = grantAdvXp(adv(12, 1), 50_000, 12, 15);
    expect(b.level).toBe(12);
    expect(b.xp).toBe(span(12, 15));
    // Le Panthéon monte au niveau du héros : il le rejoint, sans reste.
    const c = grantAdvXp(b, 0, 15, 15);
    expect(c.level).toBe(15);
    expect(c.xp).toBe(0);
  });

  it('⚠️ une réserve accumulée avant l’ascension ne fait jamais dépasser le héros', () => {
    // Bloqué à la fin du rang Bronze (niveau 10), héros niveau 15, Panthéon large.
    const bloque = grantAdvXp(adv(9, 0), 50_000, 100, 15);
    expect(bloque.level).toBe(10);
    expect(bloque.xp).toBe(span(10, 15));
    // …il reste « prêt » pour l'ascension : son ★5 se remplit.
    expect(advAscensionReady(bloque)).toBe(true);
    const monte = ascendAdventurer(bloque, 100, 15);
    expect(monte.level).toBe(15);
    expect(monte.xp).toBe(0);
  });

  it('jamais au-delà du héros, quels que soient le gain et le point de départ', () => {
    for (const hero of [5, 12, 23, 40, 77])
      for (const start of [1, 3, 9, 20])
        for (const gain of [0, 37, 5_000, 1_000_000]) {
          if (start > hero) continue;
          const b = grantAdvXp(adv(start, 9), gain, 100, hero);
          expect(b.level).toBeLessThanOrEqual(hero);
          expect(b.xp).toBeLessThanOrEqual(span(b.level, hero));
        }
  });

  it('une réserve d’AVANT la règle est purgée au versement suivant', () => {
    const b = grantAdvXp(adv(15, 1, 99_999), 0, 15, 15);
    expect(b.xp).toBe(0);
  });

  it('niveau du héros inconnu (0) : rien n’est jeté, la réserve garde tout', () => {
    const b = grantAdvXp(adv(3), 10_000, 3, 0);
    expect(b.level).toBe(3);
    expect(b.xp).toBe(10_000);
  });

  it('sous le héros et sous tous les plafonds, rien ne change', () => {
    const b = grantAdvXp(adv(4, 9), 37, 100, 50);
    expect(b.level).toBe(4);
    expect(b.xp).toBe(37);
  });
});

describe('Tome d’expérience', () => {
  it('au niveau du héros, tout le tome serait perdu', () => {
    for (const id of TOME_IDS) {
      const u = openTome(adv(15, 1), id, 100, 15);
      expect(u.lost).toBe(TOME_XP[id]);
      expect(u.after.xp).toBe(0);
    }
  });

  it('sous le héros, il ne perd que ce qui dépasse', () => {
    const id = TOME_IDS[TOME_IDS.length - 1]!;
    const a = adv(14, 1);
    const u = openTome(a, id, 100, 15);
    expect(u.lost).toBe(Math.max(0, TOME_XP[id] - advXpToNext(14)));
  });
});
