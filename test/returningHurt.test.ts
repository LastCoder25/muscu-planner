import { describe, expect, it } from 'vitest';
import { returningHurt } from '@/lib/party';
import type { ActiveExpedition } from '@/lib/expedition';

const trip = (hurt: string[], lightHurt: string[] = []) =>
  ({ midAt: 1000, outcome: { party: { hurt, lightHurt } } }) as unknown as Pick<
    ActiveExpedition,
    'midAt' | 'outcome'
  >;

describe('returningHurt — qui rentre blessé', () => {
  it("rien avant le rapport : l'issue ne se dévoile pas à l'aller", () => {
    expect(returningHurt(trip(['a']), 999)).toEqual([]);
  });
  it('les blessés et les blessés légers, une fois le rapport tombé', () => {
    expect(returningHurt(trip(['a'], ['b', 'a']), 1000).sort()).toEqual(['a', 'b']);
  });
  it('sans rapport de groupe, personne', () => {
    const p = { midAt: 0, outcome: {} } as unknown as Pick<ActiveExpedition, 'midAt' | 'outcome'>;
    expect(returningHurt(p, 5)).toEqual([]);
  });
});
