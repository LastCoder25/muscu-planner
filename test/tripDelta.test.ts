import { describe, expect, it } from 'vitest';
import type { Adventurer } from '@/lib/adventurers';
import { memberTripDelta } from '@/lib/tripDelta';

const adv = (id: string) => ({ id }) as Adventurer;
// Trajet fictif, comme la vraie règle : le groupe va au pas du plus lent, et la vitesse d'un
// éclaireur ne se cumule pas (100 min, 80 avec au moins un éclaireur, 130 avec un traînard).
const legOf = (m: Adventurer[]) =>
  m.some((a) => a.id === 'slow') ? 130 : m.some((a) => a.id.startsWith('scout')) ? 80 : 100;

describe('memberTripDelta', () => {
  it('un éclaireur NON coché raccourcit l’aller-retour du groupe coché', () => {
    expect(memberTripDelta([adv('a')], adv('scout1'), legOf)).toBe(-40);
  });
  it('un éclaireur COCHÉ : ce que le groupe perdrait sans lui (même chiffre)', () => {
    const scout = adv('scout1');
    expect(memberTripDelta([adv('a'), scout], scout, legOf)).toBe(-40);
  });
  it('un traînard rallonge le trajet', () => {
    expect(memberTripDelta([adv('a')], adv('slow'), legOf)).toBe(60);
  });
  it('un second éclaireur n’apporte rien : la vitesse ne se cumule pas', () => {
    expect(memberTripDelta([adv('scout1')], adv('scout2'), legOf)).toBe(0);
  });
  it('un champion sans effet vaut 0', () => {
    expect(memberTripDelta([adv('a')], adv('b'), legOf)).toBe(0);
  });
});
