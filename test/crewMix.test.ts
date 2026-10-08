import { describe, expect, it } from 'vitest';
import { CREW_EMO, CREW_WHO, MILITIA_EMO, MILITIA_PREFIX, crewMix } from '@/lib/militia';

const mil = (n: number) => `${MILITIA_PREFIX}${n}`;

describe('crewMix — qui part en renfort', () => {
  it('des champions seuls', () => {
    expect(crewMix(['adv_a', 'adv_b'])).toBe('champions');
  });
  it('des miliciens seuls', () => {
    expect(crewMix([mil(1), mil(2)])).toBe('militia');
  });
  it('les deux', () => {
    expect(crewMix(['adv_a', mil(3)])).toBe('mixed');
  });
  it('chaque composition a son icône, et le milicien garde la sienne', () => {
    expect(CREW_EMO.militia).toBe(MILITIA_EMO);
    expect(CREW_EMO.champions).not.toBe(CREW_EMO.militia);
    expect(CREW_WHO.mixed).toContain(MILITIA_EMO);
    expect(CREW_WHO.mixed).toContain(CREW_EMO.champions);
  });
});
