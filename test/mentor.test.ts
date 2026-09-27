import { describe, expect, it } from 'vitest';
import { CHAMPIONS, CHAMPION_BY_ID } from '@/data/champions';
import { advBadges, type Adventurer } from '@/lib/adventurers';
import { CARAVAN, mentorXpMult, missionXpFor } from '@/lib/caravan';
import { siegeXp, siegeXpFor, type RaidReport } from '@/lib/raid';
import type { Poi } from '@/lib/expedition';

/** 🎓 LE MENTOR — une compétence qui fait apprendre toute l'équipe (demandé par l'utilisateur). */

const champ = (id: string, n: string, level = 20): Adventurer => ({
  id: n,
  name: n,
  seed: 1,
  path: [],
  level,
  xp: 0,
  championId: id,
  copies: 1,
});
const mentor = (n: string) => champ('anselme', n);
const autre = (n: string) => champ('orsene', n);

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

describe('🎓 le rôle Mentor', () => {
  it('un champion A et un champion S le portent', () => {
    const porteurs = CHAMPIONS.filter((c) => c.role === 'mentor');
    expect(porteurs.map((c) => c.grade).sort()).toEqual(['A', 'S']);
    expect(CHAMPION_BY_ID.get('anselme')!.role).toBe('mentor');
    expect(CHAMPION_BY_ID.get('ferrand')!.role).toBe('mentor');
  });

  it('il se voit dans les compétences du champion', () => {
    expect(advBadges(mentor('m')).some((b) => b.role && b.emoji === '🎓')).toBe(true);
  });

  it('+15 % par Mentor, plafond +30 %', () => {
    expect(mentorXpMult([autre('a')])).toBe(1);
    expect(mentorXpMult([mentor('m'), autre('a')])).toBeCloseTo(1 + CARAVAN.mentorPerRole);
    expect(mentorXpMult([mentor('m'), mentor('n')])).toBeCloseTo(1.3);
    expect(mentorXpMult([mentor('m'), mentor('n'), mentor('o')])).toBeCloseTo(
      1 + CARAVAN.mentorMax,
    );
  });

  it('en mission, TOUTE l’équipe apprend plus vite — lui compris', () => {
    const sans = missionXpFor([autre('a'), autre('b')], poi, true, {}, 20, true);
    const avec = missionXpFor([mentor('a'), autre('b')], poi, true, {}, 20, true);
    expect(avec.b! / sans.b!).toBeCloseTo(1.15, 1);
    expect(avec.a! / sans.a!).toBeCloseTo(1.15, 1);
  });

  it('il porte AUSSI sur la part des abattus', () => {
    const avec = missionXpFor([mentor('m'), autre('b')], poi, true, { b: 100 }, 20, true);
    const socle = missionXpFor([mentor('m'), autre('b')], poi, true, {}, 20, true);
    expect(Math.abs(avec.b! - socle.b! - 115)).toBeLessThanOrEqual(1);
  });

  it('au siège, les défenseurs apprennent avec lui', () => {
    const report = {
      groups: [{ count: 8, level: 20 }],
      defeated: 1,
      total: 1,
    } as unknown as RaidReport;
    const seul = siegeXp(autre('b'), report);
    const xp = siegeXpFor([mentor('m'), autre('b')], report);
    expect(xp.b).toBe(Math.round(seul * 1.15));
    expect(siegeXpFor([autre('b')], report).b).toBe(seul);
  });
});
