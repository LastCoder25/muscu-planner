import { describe, expect, it } from 'vitest';
import { voyageFailure, type PartyResult } from '@/lib/expedition';

const v = (win: boolean, extra: Record<string, unknown> = {}) => ({
  midAt: 100,
  outcome: { win, ...extra } as { win: boolean; turnBack?: number; party?: PartyResult },
});

describe('voyageFailure — les expéditions à refaire', () => {
  it("rien avant le rapport : l'issue est tirée au départ, la montrer la trahirait", () => {
    expect(voyageFailure(v(false), 99)).toBeNull();
    expect(voyageFailure(v(false), 100)).toBe('lost');
  });
  it('une victoire ne se marque pas', () => {
    expect(voyageFailure(v(true), 500)).toBeNull();
  });
  it('un demi-tour forcé en route est un échec, distingué de la défaite', () => {
    expect(voyageFailure(v(false, { turnBack: 0.4 }), 500)).toBe('turned');
  });
  it('un rappel du joueur et une arrivée trop tard ne sont pas à refaire', () => {
    expect(voyageFailure({ ...v(false), recalled: true }, 500)).toBeNull();
    expect(
      voyageFailure(v(false, { party: { late: true } as unknown as PartyResult }), 500),
    ).toBeNull();
  });
});
