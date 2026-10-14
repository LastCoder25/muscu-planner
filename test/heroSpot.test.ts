import { describe, expect, it } from 'vitest';
import { heroSpotOf } from '@/lib/islandConquest';
import { EXPE, type ActiveExpedition, type ExpeditionMap, type Poi } from '@/lib/expedition';

// 🧝 Signalé (2026-10-14) : parti en sortie depuis l'Arsenal, le héros n'est plus « posté » et
// l'écran d'envoi le rangeait sous la base. `heroSpotOf` dit SOUS QUEL LIEU le montrer.
const unit = { name: 'Last', level: 30, combatant: {} } as never;
const point = (id: string, control: Record<string, unknown>) =>
  ({
    id,
    type: 'control',
    level: 30,
    x: EXPE.town.x + 30,
    y: EXPE.town.y,
    control: { kind: 'mine', owner: 'player', garrison: [], ...control },
  }) as unknown as Poi;
const map = (...pois: Poi[]) => ({ pois }) as unknown as ExpeditionMap;
const sortie = (homeId: string, extra: Record<string, unknown> = {}) =>
  ({
    homeId,
    homeHero: unit,
    reported: false,
    outcome: {},
    ...extra,
  }) as unknown as ActiveExpedition;

describe('heroSpotOf — le lieu fixe du héros, qu’il y soit ou non', () => {
  it('posté : le lieu où il est', () => {
    expect(heroSpotOf(map(point('a', {}), point('b', { hero: true })), null, [])?.id).toBe('b');
  });

  it('en sortie depuis son poste : le lieu où il revient, pas la base', () => {
    expect(heroSpotOf(map(point('arsenal', {})), sortie('arsenal'), [])?.id).toBe('arsenal');
  });

  it('parti avec une attaque combinée depuis son poste : ce poste', () => {
    const wings = [{ originId: 'arsenal', state: 'gone', heroGone: true }];
    expect(heroSpotOf(map(point('arsenal', {})), null, wings)?.id).toBe('arsenal');
  });

  it('en marche vers un poste : ce poste', () => {
    expect(heroSpotOf(map(point('mine', { heroComing: true })), null, [])?.id).toBe('mine');
  });

  it('blessé au retour, parti de la base ou lieu perdu : la base', () => {
    const hurt = sortie('arsenal', { reported: true, outcome: { party: { heroHurt: true } } });
    expect(heroSpotOf(map(point('arsenal', {})), hurt, [])).toBeUndefined();
    expect(heroSpotOf(map(point('arsenal', {})), sortie(''), [])).toBeUndefined();
    expect(
      heroSpotOf(map(point('arsenal', { owner: 'enemy' })), sortie('arsenal'), []),
    ).toBeUndefined();
    expect(heroSpotOf(map(point('arsenal', {})), null, [])).toBeUndefined();
  });
});
