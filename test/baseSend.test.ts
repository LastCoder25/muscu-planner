// 🏠 Envoyer depuis la base : champions ET miliciens vers un même point tenu.
import { describe, expect, it } from 'vitest';
import { MILITIA } from '@/lib/militia';
import { baseSendBlocker, controlFreeSeats, seatsOf } from '@/lib/controlPoints';
import type { ControlState } from '@/lib/expedition';

const held = (garrison: string[] = []): ControlState =>
  ({
    kind: 'mine',
    owner: 'player',
    garrison,
    retakes: 0,
    faction: 'bandits',
    size: 1,
  }) as unknown as ControlState;

describe('🏠 départ depuis la base', () => {
  it('rien de choisi : on le dit', () => {
    expect(baseSendBlocker(held(), 0, 0)).toBe('empty');
  });
  it('un point ennemi ne reçoit rien', () => {
    const c = { ...held(), owner: 'enemy' } as unknown as ControlState;
    expect(baseSendBlocker(c, 1, 0)).toBe('notHeld');
    expect(baseSendBlocker(null, 0, 1)).toBe('notHeld');
  });
  it('les champions gardent la limite de places du point', () => {
    const c = held();
    const seats = controlFreeSeats(c);
    expect(seats).toBe(seatsOf('mine'));
    expect(baseSendBlocker(c, seats, 0)).toBeNull();
    expect(baseSendBlocker(c, seats + 1, 0)).toBe('full');
  });
  it('les miliciens prennent ce que les champions laissent des 5', () => {
    const c = held();
    const champs = controlFreeSeats(c);
    const left = MILITIA.perPoint - champs;
    expect(baseSendBlocker(c, champs, left)).toBeNull();
    // ⚠️ Chaque groupe tiendrait SEUL : c'est ensemble qu'ils débordent.
    expect(baseSendBlocker(c, 0, left + 1)).toBeNull();
    expect(baseSendBlocker(c, champs, left + 1)).toBe('full');
  });
  it('des miliciens seuls, sans champion', () => {
    expect(baseSendBlocker(held(), 0, MILITIA.perPoint)).toBeNull();
    expect(baseSendBlocker(held(), 0, MILITIA.perPoint + 1)).toBe('full');
  });
});
