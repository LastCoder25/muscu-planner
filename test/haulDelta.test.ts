import { describe, expect, it } from 'vitest';
import { formatHaulDelta, haulDelta, poiTeamHaul, type PoiHaul } from '@/lib/poiYield';
import { refAdvGear, refChampionAdv } from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';
import type { SupplyId } from '@/lib/supplies';
import type { Poi } from '@/lib/expedition';

const h = (o: Partial<PoiHaul>): PoiHaul => ({
  gold: 0,
  energy: 0,
  summonStones: 0,
  keys: 0,
  mana: 0,
  ...o,
});

describe('haulDelta / formatHaulDelta', () => {
  it('la différence champ par champ', () => {
    expect(haulDelta(h({ gold: 150, mana: 3 }), h({ gold: 100, mana: 5 }))).toEqual(
      h({ gold: 50, mana: -2 }),
    );
  });
  it('signé, seulement ce qui bouge', () => {
    expect(formatHaulDelta(h({ gold: 1200, mana: -2 }))).toBe('+1 200 🪙 · −2 💠');
    expect(formatHaulDelta(h({}))).toBe('');
  });
});

describe('sur une vraie mine : la règle de la récolte', () => {
  const adv = (i: number): Adventurer => ({
    ...refChampionAdv(26, i),
    id: `t${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  });
  const advGear = refAdvGear(26, 3);
  const mine = { id: 'm', type: 'mine', level: 26, x: 120, y: 100, distNorm: 0.5 } as Poi;
  const total = (escort: Adventurer[], supplies: SupplyId[]) =>
    poiTeamHaul(mine, { playerLevel: 26, heroGoes: false, escort, kit: { advGear, supplies } })
      .total;

  it('les bâts 🧺 ajoutent de l’or', () => {
    const d = haulDelta(total([adv(2)], ['bats']), total([adv(2)], []));
    expect(d.gold).toBeGreaterThan(0);
    expect(formatHaulDelta(d)).toMatch(/^\+.* 🪙/);
  });
  it('un porteur 🐫 ajoute de l’or ; un champion sans rôle n’ajoute rien', () => {
    expect(haulDelta(total([adv(0)], []), total([], [])).gold).toBeGreaterThan(0);
    expect(formatHaulDelta(haulDelta(total([adv(2)], []), total([], [])))).toBe('');
  });
});
