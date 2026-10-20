import { describe, expect, it } from 'vitest';
import { EXPE, type Poi } from '@/lib/expedition';
import { missionXpFor, poiXpOffer, refChampionAdv, SOLO_XP_MULT, XP_TEAM_REF } from '@/lib/caravan';

/**
 * 🎓 L'XP QU'UN LIEU RAPPORTE, sur sa fiche (2026-10-20, demandé par l'utilisateur : « quand on
 * clique sur un lieu on doit pouvoir voir l'XP qu'il rapporte »). Elle n'a aucune formule à
 * elle : c'est ce que `missionXpFor` verse à une équipe de référence qui prend le lieu.
 */
const T0 = 1_700_000_000_000;
const camp = (level: number): Poi => ({
  id: `camp_${level}`,
  type: 'camp',
  level,
  travelLevel: level,
  x: EXPE.town.x,
  y: EXPE.town.y - 30,
  distNorm: 0.5,
  spawnedAt: T0,
  expiresAt: T0 + EXPE.lifespanMs.camp,
});
const team = (L: number) => Array.from({ length: XP_TEAM_REF }, (_, i) => refChampionAdv(L, i));

describe('🎓 poiXpOffer', () => {
  it('égale ce que verse une victoire à une équipe de référence', () => {
    for (const [lieu, L] of [
      [20, 20],
      [40, 30],
      [15, 30],
    ] as const) {
      const verse = missionXpFor(team(L), camp(lieu), true, {}, L, false, null, 0);
      expect(poiXpOffer(camp(lieu), L, L, false)).toBe(verse.ref0);
    }
  });

  it('sans le héros, ils apprennent plus', () => {
    const avec = poiXpOffer(camp(30), 30, 30, true);
    const seuls = poiXpOffer(camp(30), 30, 30, false);
    expect(seuls).toBeGreaterThan(avec);
    expect(seuls / avec).toBeCloseTo(SOLO_XP_MULT, 1);
  });

  it('jamais divisé : une équipe de référence touche le socle plein', () => {
    const seul = missionXpFor([refChampionAdv(30, 0)], camp(30), true, {}, 30, true, null, 0);
    expect(poiXpOffer(camp(30), 30, 30, true)).toBeLessThanOrEqual(seul.ref0!);
    expect(poiXpOffer(camp(30), 30, 30, true)).toBeGreaterThan(0);
  });
});
