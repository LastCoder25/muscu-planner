import { describe, expect, it } from 'vitest';
import { partyCarriesHero } from '@/lib/party';
import type { ActiveExpedition } from '@/lib/expedition';

// 🐞 Signalé : « après une attaque combinée, deux retours de troupes, le héros dans les deux ».
// Le rapport est partagé par les groupes : il dit que le héros a COMBATTU, pas avec qui il rentre.
const trip = (
  hero: boolean,
  extra: Partial<Pick<ActiveExpedition, 'crew' | 'wingOf'>> = {},
): Pick<ActiveExpedition, 'crew' | 'wingOf' | 'outcome'> => ({
  outcome: { party: { hero } } as unknown as ActiveExpedition['outcome'],
  ...extra,
});

describe('partyCarriesHero — avec quel groupe le héros rentre', () => {
  it('un groupe ordinaire dit ce que dit son rapport', () => {
    expect(partyCarriesHero(trip(true))).toBe(true);
    expect(partyCarriesHero(trip(false))).toBe(false);
  });

  it('un groupe d’attaque combinée ne ramène jamais le héros, même si le rapport partagé le cite', () => {
    expect(partyCarriesHero(trip(true, { crew: ['a1'] }))).toBe(false);
    expect(partyCarriesHero(trip(true, { crew: ['a2'], wingOf: 'atk1' }))).toBe(false);
    expect(partyCarriesHero(trip(true, { wingOf: 'atk1' }))).toBe(false);
  });
});
