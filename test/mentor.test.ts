import { describe, expect, it } from 'vitest';
import { CHAMPIONS } from '@/data/champions';
import { advBadges, type Adventurer } from '@/lib/adventurers';
import { CARAVAN, mentorXpMult, missionXpFor } from '@/lib/caravan';
import { siegeXp, siegeXpFor, type RaidReport } from '@/lib/raid';
import { skillValue } from '@/lib/skillRunes';
import type { Poi } from '@/lib/expedition';

/** 🎓 LE MENTOR — une compétence de rune (bleue) qui fait apprendre toute l'équipe. */

const C0 = CHAMPIONS[0]!.id;
const champ = (n: string, mentorLevel = 0, level = 20): Adventurer => ({
  id: n,
  name: n,
  seed: 1,
  path: [],
  level,
  xp: 0,
  championId: C0,
  copies: 1,
  skills: mentorLevel ? [{ id: 'mentor', level: mentorLevel }] : [],
});
const mentor = (n: string, lvl = 1) => champ(n, lvl);
const autre = (n: string) => champ(n);
const m1 = skillValue('mentor', 1) / 100;

const poi: Poi = {
  id: 'p',
  type: 'well',
  level: 20,
  x: 50,
  y: 50,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
};

describe('🎓 la compétence Mentor', () => {
  it('elle se voit dans les compétences du champion', () => {
    expect(advBadges(mentor('m')).some((b) => b.emoji === '🎓')).toBe(true);
    expect(advBadges(autre('a')).some((b) => b.emoji === '🎓')).toBe(false);
  });

  it('elle suit le barème des runes, sous le plafond d’équipe', () => {
    expect(mentorXpMult([autre('a')])).toBe(1);
    expect(mentorXpMult([mentor('m'), autre('a')])).toBeCloseTo(1 + m1);
    expect(mentorXpMult([mentor('m', 3)])).toBeCloseTo(1 + skillValue('mentor', 3) / 100);
    expect(mentorXpMult([mentor('m', 5), mentor('n', 5), mentor('o', 5)])).toBeCloseTo(
      1 + CARAVAN.mentorMax,
    );
  });

  it('en mission, TOUTE l’équipe apprend plus vite — lui compris', () => {
    const sans = missionXpFor([autre('a'), autre('b')], poi, true, {}, 20, true);
    const avec = missionXpFor([mentor('a'), autre('b')], poi, true, {}, 20, true);
    expect(avec.b! / sans.b!).toBeCloseTo(1 + m1, 1);
    expect(avec.a! / sans.a!).toBeCloseTo(1 + m1, 1);
  });

  it('elle porte AUSSI sur la part des abattus', () => {
    const avec = missionXpFor([mentor('m'), autre('b')], poi, true, { b: 100 }, 20, true);
    const socle = missionXpFor([mentor('m'), autre('b')], poi, true, {}, 20, true);
    expect(Math.abs(avec.b! - socle.b! - 100 * (1 + m1))).toBeLessThanOrEqual(1);
  });

  it('au siège, les défenseurs apprennent avec lui', () => {
    const report = {
      groups: [{ count: 8, level: 20 }],
      defeated: 1,
      total: 1,
    } as unknown as RaidReport;
    const seul = siegeXp(autre('b'), report);
    const xp = siegeXpFor([mentor('m'), autre('b')], report);
    expect(xp.b).toBe(Math.round(seul * (1 + m1)));
    expect(siegeXpFor([autre('b')], report).b).toBe(seul);
  });
});
