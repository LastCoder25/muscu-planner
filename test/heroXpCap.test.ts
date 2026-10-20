import { describe, expect, it } from 'vitest';
import {
  advAscensionReady,
  advLevelCapFor,
  advXpCapped,
  advXpRoom,
  advXpToNext,
  ascendAdventurer,
  grantAdvXp,
  type Adventurer,
} from '@/lib/adventurers';
import { characterRank } from '@/lib/characterRank';
import { EXPE, type Poi } from '@/lib/expedition';
import { missionXpFor, missionXpPreview, refChampionAdv, XP_TEAM_REF } from '@/lib/caravan';
import { openTome } from '@/lib/xpTome';
import { TOME_IDS, TOME_XP } from '@/lib/supplies';

/**
 * 🧑‍✈️ UN CHAMPION NE DÉPASSE JAMAIS LE RANG ET LES ÉTOILES DU HÉROS (2026-10-13, puis
 * 2026-10-20, décisions de l'utilisateur : « les champions peuvent up jusqu'au même rang et
 * étoiles que le héros. Si un champion est au max, il ne prend plus d'XP sur les expéditions.
 * L'XP est répartie parmi ceux qui peuvent en gagner »).
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

describe('XP des champions bornée au rang et aux étoiles du héros', () => {
  it('le plafond est le dernier niveau de l’étoile du héros', () => {
    expect(advLevelCapFor(9)).toBe(10);
    expect(advLevelCapFor(10)).toBe(10);
    expect(advLevelCapFor(11)).toBe(12);
    expect(advLevelCapFor(12)).toBe(12);
    expect(advLevelCapFor(100)).toBe(100);
    expect(advLevelCapFor(140)).toBe(100);
    for (let h = 1; h <= 100; h++) {
      const c = characterRank(advLevelCapFor(h));
      const r = characterRank(h);
      expect([c.rankIndex, c.star]).toEqual([r.rankIndex, r.star]);
      // …et c'est bien le DERNIER niveau de l'étoile : un de plus la change.
      if (advLevelCapFor(h) < 100)
        expect(characterRank(advLevelCapFor(h) + 1).tier).toBe(r.tier + 1);
    }
  });

  it('héros Argent ★1 (niveau 11) : le champion monte jusqu’au niveau 12, pas plus', () => {
    const b = grantAdvXp(adv(11, 1), 50_000, 100, 11);
    expect(b.level).toBe(12);
    expect(b.xp).toBe(0);
    expect(advXpCapped(b, 11)).toBe(true);
    expect(advXpCapped(adv(11, 1), 11)).toBe(false);
  });

  it('au maximum, il ne gagne ni ne stocke RIEN', () => {
    const a = adv(16, 1);
    const b = grantAdvXp(a, 50_000, 100, 15);
    expect(b.level).toBe(16);
    expect(b.xp).toBe(0);
    expect(advXpRoom(a, 15)).toBe(0);
  });

  it('bloqué par le Panthéon, il stocke JUSTE ce qui mène au plafond, pas plus', () => {
    const b = grantAdvXp(adv(12, 1), 50_000, 12, 15);
    expect(b.level).toBe(12);
    expect(b.xp).toBe(span(12, 16));
    // Le Panthéon monte : il rejoint le plafond, sans reste.
    const c = grantAdvXp(b, 0, 16, 15);
    expect(c.level).toBe(16);
    expect(c.xp).toBe(0);
  });

  it('⚠️ une réserve accumulée avant l’ascension ne fait jamais dépasser le héros', () => {
    // Bloqué à la fin du rang Bronze (niveau 10), héros niveau 15 (Argent ★3), Panthéon large.
    const bloque = grantAdvXp(adv(9, 0), 50_000, 100, 15);
    expect(bloque.level).toBe(10);
    expect(bloque.xp).toBe(span(10, 16));
    expect(advAscensionReady(bloque)).toBe(true);
    const monte = ascendAdventurer(bloque, 100, 15);
    expect(monte.level).toBe(16);
    expect(monte.xp).toBe(0);
  });

  it('⚠️ héros au ★5 d’un rang : le champion ne devient jamais « prêt » à le dépasser', () => {
    const b = grantAdvXp(adv(9, 0), 50_000, 100, 10);
    expect(b.level).toBe(10);
    expect(b.xp).toBe(0);
    expect(advAscensionReady(b)).toBe(false);
  });

  it('jamais au-delà du rang et des étoiles du héros, quels que soient gain et départ', () => {
    for (const hero of [5, 12, 23, 40, 77])
      for (const start of [1, 3, 9, 20])
        for (const gain of [0, 37, 5_000, 1_000_000]) {
          if (start > hero) continue;
          const b = grantAdvXp(adv(start, 9), gain, 100, hero);
          expect(characterRank(b.level).tier).toBeLessThanOrEqual(characterRank(hero).tier);
          expect(b.xp).toBeLessThanOrEqual(span(b.level, advLevelCapFor(hero)));
        }
  });

  it('une réserve d’AVANT la règle est purgée au versement suivant', () => {
    const b = grantAdvXp(adv(16, 1, 99_999), 0, 16, 15);
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

describe('XP d’expédition partagée entre ceux qui peuvent apprendre', () => {
  const T0 = 1_700_000_000_000;
  const camp: Poi = {
    id: 'camp_20',
    type: 'camp',
    level: 20,
    travelLevel: 20,
    x: EXPE.town.x,
    y: EXPE.town.y - 30,
    distNorm: 0.5,
    spawnedAt: T0,
    expiresAt: T0 + EXPE.lifespanMs.camp,
  };
  const HERO = 15; // Argent ★3 : plafond des champions au niveau 16
  const c = (id: string, level: number): Adventurer => ({ ...refChampionAdv(level), id });
  // Assez d'apprentis pour que le partage dilue (au-delà de l'équipe de référence).
  const apprentis = Array.from({ length: XP_TEAM_REF + 1 }, (_, i) => c(`l${i}`, 12));
  const auMax = c('max', 16);

  it('un champion au maximum ne prend rien', () => {
    const xp = missionXpFor([...apprentis, auMax], camp, true, {}, 30, false, null, HERO);
    expect(xp.max).toBe(0);
  });

  it('il ne dilue pas le partage : les autres touchent comme s’il n’était pas là', () => {
    const avec = missionXpFor([...apprentis, auMax], camp, true, {}, 30, false, null, HERO);
    const sans = missionXpFor(apprentis, camp, true, {}, 30, false, null, HERO);
    for (const a of apprentis) expect(avec[a.id]).toBe(sans[a.id]);
    // …alors qu'un apprenti de plus, lui, dilue.
    const dilue = missionXpFor([...apprentis, c('l9', 12)], camp, true, {}, 30, false, null, HERO);
    expect(dilue.l0!).toBeLessThan(avec.l0!);
  });

  it('même sur une défaite d’attaque, il ne prend rien', () => {
    const xp = missionXpFor([apprentis[0]!, auMax], camp, false, { max: 40 }, 30, false, 0.6, HERO);
    expect(xp.max).toBe(0);
    expect(xp.l0!).toBeGreaterThan(0);
  });

  it('niveau du héros inconnu (0) : personne n’est écarté', () => {
    const xp = missionXpFor([apprentis[0]!, auMax], camp, true, {}, 30, false, null, 0);
    expect(xp.max!).toBeGreaterThan(0);
  });

  it('l’aperçu de l’envoi le marque « au max » et l’annonce à 0', () => {
    const all = [...apprentis, auMax];
    const prev = missionXpPreview(all, ['l0', 'max'], camp, 30, HERO, false);
    expect(prev.max!.capped).toBe(true);
    expect(prev.max!.xp).toBe(0);
    expect(prev.l0!.capped).toBe(false);
    expect(prev.l0!.xp).toBeGreaterThan(0);
  });
});

describe('Tome d’expérience', () => {
  it('au maximum, tout le tome serait perdu', () => {
    for (const id of TOME_IDS) {
      const u = openTome(adv(16, 1), id, 100, 15);
      expect(u.lost).toBe(TOME_XP[id]);
      expect(u.after.xp).toBe(0);
    }
  });

  it('sous le maximum, il ne perd que ce qui dépasse', () => {
    const id = TOME_IDS[TOME_IDS.length - 1]!;
    const a = adv(14, 1);
    const u = openTome(a, id, 100, 15);
    expect(u.lost).toBe(Math.max(0, TOME_XP[id] - span(14, 16)));
  });
});
