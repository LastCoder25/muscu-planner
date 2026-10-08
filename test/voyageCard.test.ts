import { describe, expect, it } from 'vitest';
import { troopTimes } from '@/lib/voyageCard';

const H = 3_600_000;
const leg = { sentAt: 10 * H, midAt: 14 * H, returnAt: 18 * H, dwellMs: H };

describe('🧭 troopTimes : les heures d’une troupe, lues sur son voyage', () => {
  it('l’arrivée est la résolution moins le temps sur place, le retour est le retour', () => {
    const t = troopTimes(leg, 11 * H);
    expect(t).toEqual({ state: 'going', departAt: null, arriveAt: 13 * H, returnAt: 18 * H });
  });
  it('suit chaque étape : en attente, en route, sur place, retour, rentrée', () => {
    expect(troopTimes(leg, 9 * H).state).toBe('waiting');
    expect(troopTimes(leg, 9 * H).departAt).toBe(10 * H);
    expect(troopTimes(leg, 12 * H).state).toBe('going');
    expect(troopTimes(leg, 13.5 * H).state).toBe('there');
    expect(troopTimes(leg, 15 * H).state).toBe('back');
    expect(troopTimes(leg, 18 * H).state).toBe('done');
  });
  it('un demi-tour n’arrive jamais sur le lieu', () => {
    const t = troopTimes({ ...leg, turnBack: 0.4 }, 12 * H);
    expect(t.state).toBe('turned');
    expect(t.arriveAt).toBeNull();
    expect(t.returnAt).toBe(18 * H);
  });
  it('un aller simple (renfort) n’a pas de retour et finit à son arrivée', () => {
    const t = troopTimes({ sentAt: 10 * H, midAt: 12 * H, returnAt: 12 * H, oneWay: true }, 11 * H);
    expect(t).toEqual({ state: 'going', departAt: null, arriveAt: 12 * H, returnAt: null });
    expect(
      troopTimes({ sentAt: 10 * H, midAt: 12 * H, returnAt: 12 * H, oneWay: true }, 12 * H).state,
    ).toBe('done');
  });
  it('sans temps sur place, l’arrivée est la résolution', () => {
    expect(troopTimes({ sentAt: 0, midAt: 5 * H, returnAt: 9 * H }, H).arriveAt).toBe(5 * H);
  });
});
