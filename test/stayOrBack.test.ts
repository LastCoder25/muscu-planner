import { describe, expect, it } from 'vitest';
import { stayOrBackAdvice, type StayOrBackInput } from '@/lib/crossingAdvice';
import { dangerMult, missionXpSplit, refAdvGear, refChampionAdv } from '@/lib/caravan';
import { trialXpBase } from '@/lib/skirmish';

/** 🧭 Rester ou reculer : une île non pacifiée comparée à celle d'avant. */
function input(
  current: number,
  hero: number,
  n: number,
  lag = 0,
  over: Partial<StayOrBackInput> = {},
): StayOrBackInput {
  const champions = Array.from({ length: n }, (_, k) => ({
    ...refChampionAdv(Math.max(1, hero - lag), k),
    id: `c${k}`,
  }));
  return {
    current,
    heroLevel: hero,
    champions,
    kit: { advGear: champions.flatMap((c) => refAdvGear(c.level)) },
    engage: n,
    fort: 1.3,
    pointsHeld: 3,
    militiaPosted: 15,
    objectivesDown: 1,
    ...over,
  };
}

describe('🧭 rester ou reculer', () => {
  it('pas d’île d’avant sur la première', () => {
    expect(stayOrBackAdvice(input(1, 15, 6))).toBeNull();
  });

  it('un vivier à niveau RESTE : la mission y paie davantage par champion (prime de danger)', () => {
    const a = stayOrBackAdvice(input(3, 41, 17))!;
    expect(a.verdict).toBe('stay');
    expect(a.here.need).not.toBeNull();
    expect(a.here.xpPerChamp).toBeGreaterThan(a.back.xpPerChamp);
    expect(a.here.mineGold).toBeGreaterThan(a.back.mineGold);
    expect(a.back.island.id).toBe(2);
  });

  it('la vague compte les équipes que le vivier peut lancer à la fois', () => {
    const a = stayOrBackAdvice(input(3, 41, 17))!;
    for (const y of [a.here, a.back]) {
      expect(y.teams).toBe(Math.floor(17 / y.need!));
      expect(y.waveXp).toBeCloseTo(y.teams * y.need! * y.xpPerChamp, -2);
      expect(y.waveGold).toBe(y.teams * y.mineGold);
    }
  });

  it('un vivier très en retard RECULE : il ne prend aucun lieu ici', () => {
    const a = stayOrBackAdvice(input(3, 41, 2, 25))!;
    expect(a.here.need).toBeNull();
    expect(a.verdict).toBe('back');
    expect(a.reasons[0]).toMatch(/ne prennent pas/);
  });

  it('ce que reculer abandonne est dit, et seulement s’il y a quelque chose', () => {
    expect(stayOrBackAdvice(input(3, 41, 17))!.reasons.join(' ')).toMatch(
      /abandonne 3 lieux fixes et 15 miliciens/,
    );
    const none = stayOrBackAdvice(input(3, 41, 17, 0, { pointsHeld: 0, militiaPosted: 0 }))!;
    expect(none.reasons.join(' ')).not.toMatch(/abandonne/);
    expect(none.lose).toEqual({ points: 0, militia: 0 });
  });

  it('la forteresse se juge OUVERTE même verrouillée, et le verrou suit les objectifs', () => {
    const locked = stayOrBackAdvice(input(3, 50, 30, 0, { objectivesDown: 0 }))!;
    const open = stayOrBackAdvice(input(3, 50, 30, 0, { objectivesDown: 2 }))!;
    expect(locked.objective.locked).toBe(true);
    expect(open.objective.locked).toBe(false);
    expect(open.objective.fortress).not.toBeNull();
    // Même forteresse jugée dans les deux cas (deux objectifs abattus).
    expect(locked.objective.fortress).toBe(open.objective.fortress);
  });

  it('l’XP par champion est celle de missionXp, prime de danger comprise', () => {
    const a = stayOrBackAdvice(input(3, 41, 17, 8))!;
    const L = 33;
    const mid = Math.round((a.here.levels.lo + a.here.levels.hi) / 2);
    const want =
      trialXpBase(mid) *
      Math.min(1, mid / L) ** 1.5 *
      dangerMult(L, mid) *
      missionXpSplit(a.here.need!);
    expect(a.here.xpPerChamp).toBe(Math.round(want));
  });
});
