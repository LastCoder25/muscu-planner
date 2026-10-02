import { describe, expect, it } from 'vitest';
import { underAttackKey } from '@/lib/expedition';

const poi = (id: string, assault?: boolean) =>
  assault === undefined ? { id } : { id, control: { assault } as never };

describe('underAttackKey — les lieux sur lesquels une troupe marche', () => {
  const pois = [poi('a'), poi('b'), poi('c'), poi('fort', true), poi('fort2', false)];

  it('marque un lieu visé par un voyage pas encore arrivé', () => {
    expect(underAttackKey(pois, [{ poi: { id: 'b' }, midAt: 100 }], [], 50)).toBe('b|fort');
  });

  it("oublie le lieu dès que la bataille a eu lieu, ou si l'équipe a fait demi-tour", () => {
    expect(underAttackKey(pois, [{ poi: { id: 'b' }, midAt: 100 }], [], 100)).toBe('fort');
    expect(underAttackKey(pois, [{ poi: { id: 'b' }, midAt: 100, reported: true }], [], 50)).toBe(
      'fort',
    );
    expect(underAttackKey(pois, [{ poi: { id: 'b' }, midAt: 100, turnBack: 0.4 }], [], 50)).toBe(
      'fort',
    );
  });

  it('compte une attaque combinée avant son arrivée commune', () => {
    expect(underAttackKey(pois, [], [{ poi: { id: 'c' }, arriveAt: 100 }], 50)).toBe('c|fort');
    expect(underAttackKey(pois, [], [{ poi: { id: 'c' }, arriveAt: 100 }], 120)).toBe('fort');
  });

  it('ne rend que les lieux présents sur la carte, triés', () => {
    expect(
      underAttackKey(
        pois,
        [
          { poi: { id: 'zz' }, midAt: 100 },
          { poi: { id: 'c' }, midAt: 100 },
          { poi: { id: 'a' }, midAt: 100 },
        ],
        [],
        50,
      ),
    ).toBe('a|c|fort');
  });
});
