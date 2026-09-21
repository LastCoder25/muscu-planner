import { describe, expect, it } from 'vitest';
import { resolveHarvestParty } from '@/lib/harvestParty';
import { refAdvGear, refChampionAdv, resolveCaravan, type PartyHero } from '@/lib/caravan';
import { resolveOutcome, type Poi } from '@/lib/expedition';
import { refFighter } from '@/lib/proceduralContent';
import type { Adventurer } from '@/lib/adventurers';

const poi = (type: Poi['type'], over: Partial<Poi> = {}): Poi => ({
  id: 'p_' + type,
  type,
  level: 26,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const team = (n: number, L = 26): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(L, i),
    id: `a${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const road = { advGear: refAdvGear(26, 3) };
const hero: PartyHero = { name: 'H', level: 26, combatant: refFighter(26) };

describe('🧺 une équipe sur un lieu de récolte', () => {
  it('SANS le héros : c’est le convoi — même cargaison, même route, même XP', () => {
    for (const t of ['well', 'mine', 'shrine', 'archive'] as const)
      for (const seed of [1, 7, 42]) {
        const p = poi(t);
        const c = resolveCaravan(p, team(3), seed, road);
        const o = resolveHarvestParty({
          poi: p,
          escort: team(3),
          road,
          hero: null,
          seed,
          playerLevel: 26,
        });
        expect(o.gold, t).toBe(c.gold);
        expect(o.energy, t).toBe(c.energy);
        expect(o.summonStones, t).toBe(c.summonStones);
        expect(o.key, t).toBe(c.keys);
        expect(o.party!.xp).toEqual(c.xp);
        expect(o.party!.hurt).toEqual(c.hurt);
        expect(o.party!.wages).toBe(c.wages);
        expect(o.party!.hero).toBe(false);
      }
  });

  it('⚠️ 💠 une mine de mana rapporte ENFIN du mana en équipe — le convoi n’en rendait pas', () => {
    const o = resolveHarvestParty({
      poi: poi('mana_mine'),
      escort: team(3),
      road,
      hero: null,
      seed: 3,
      playerLevel: 26,
    });
    expect(o.mana).toBeGreaterThan(0);
  });

  it('la victoire = aucune embuscade PERDUE', () => {
    // Un champion seul sur une route dangereuse perd ses embuscades (0 % mesuré).
    let perdu = false;
    for (let s = 1; s < 40 && !perdu; s++) {
      const o = resolveHarvestParty({
        poi: poi('well', { perilous: true }),
        escort: team(1),
        road,
        hero: null,
        seed: s,
        playerLevel: 26,
      });
      if (!o.party!.win) perdu = true;
    }
    expect(perdu).toBe(true);
  });

  it('AVEC le héros : son expédition, et le champion qui l’accompagne apprend', () => {
    const p = poi('mine');
    const o = resolveHarvestParty({
      poi: p,
      escort: team(1),
      road,
      hero,
      seed: 9,
      playerLevel: 26,
    });
    const solo = resolveOutcome(hero.combatant, p, 9, 26);
    expect(o.gold).toBe(solo.gold);
    expect(o.energy).toBe(solo.energy);
    expect(o.party!.hero).toBe(true);
    expect(o.party!.xp.a0).toBeGreaterThan(0);
    expect(o.party!.wages).toBeGreaterThan(0);
    expect(o.party!.hurt).toEqual([]);
  });
});
