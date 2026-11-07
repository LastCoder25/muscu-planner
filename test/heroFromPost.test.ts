import { describe, expect, it } from 'vitest';
import { combinedBlocker, wingDeparture, type AttackWing } from '@/lib/combinedAttack';
import { heroBackToPost, heroWalkVoyage } from '@/lib/islandConquest';
import { EXPE, type ExpeditionMap, type Poi } from '@/lib/expedition';

// 🧝 Signalé : « le héros est sur l'Ossuaire mais quand je l'envoie il part de la base ».
// Il part désormais de son poste (seul, avec la garnison, ou dans une attaque combinée) et y
// revient.
const NOW = 5_000_000;
const MIN = 60_000;
const T = EXPE.town;
const unit = { name: 'Last', level: 38, combatant: {} } as never;

function ossuary(extra: object = {}): Poi {
  return {
    id: 'ctl_ossuary',
    type: 'control',
    x: T.x + 40,
    y: T.y,
    control: { kind: 'ossuary', owner: 'player', garrison: [], ...extra },
  } as unknown as Poi;
}
const map = (pois: Poi[]) => ({ pois }) as unknown as ExpeditionMap;
const target = { type: 'camp' } as const;
const w = (originId: string | null, members: string[], hero = false) => ({ originId, members, hero });

describe('attaque combinée : le héros part de son poste', () => {
  it('posté, son groupe est celui de son lieu, pas celui de la base', () => {
    const post = 'ctl_ossuary';
    expect(combinedBlocker(target, [w(post, [], true), w(null, ['a'])], post)).toBeNull();
    expect(combinedBlocker(target, [w(post, [], false), w(null, ['a'], true)], post)).toBe(
      'heroFar',
    );
    // À la base, le héros reste au groupe de la base.
    expect(combinedBlocker(target, [w(null, ['a'], true), w(post, ['b'])], null)).toBeNull();
  });

  it('au départ, le groupe de son poste l’emmène — s’il y est toujours', () => {
    const wing: AttackWing = {
      originId: 'ctl_ossuary',
      members: [],
      hero: true,
      legMin: 30,
      departAt: NOW,
      returnAt: NOW + 90 * MIN,
      state: 'waiting',
    };
    const ctx = (m: ExpeditionMap) => ({
      now: NOW,
      map: m,
      advs: [],
      raidAt: null,
      heroWoundedAt: () => false,
    });
    expect(wingDeparture(wing, ctx(map([ossuary({ hero: true, heroUnit: unit })])))).toEqual({
      members: [],
      hero: true,
    });
    expect(wingDeparture(wing, ctx(map([ossuary()])))).toEqual({ members: [], hero: false });
  });
});

describe('au retour, il reprend son poste', () => {
  it('le lieu est à nous et a la place : il y est de nouveau posté', () => {
    const m = heroBackToPost(map([ossuary()]), 'ctl_ossuary', unit, NOW, 20);
    const c = m.pois[0]!.control!;
    expect(c.hero).toBe(true);
    expect(c.heroUnit).toBe(unit);
    expect(m.heroReturnAt).toBeUndefined();
  });

  it('le lieu est perdu : il rentre à pied à la base depuis le lieu', () => {
    const lost = ossuary();
    lost.control!.owner = 'enemy';
    const m = heroBackToPost(map([lost]), 'ctl_ossuary', unit, NOW, 20);
    expect(m.pois[0]!.control!.hero).toBeUndefined();
    expect(m.heroReturnAt).toBe(NOW + 20 * MIN);
    expect(heroWalkVoyage(m, NOW + MIN)?.back).toBe(true);
  });

  it('plus de place pour lui : il rentre à la base', () => {
    const full = ossuary({ garrison: ['a', 'b', 'c', 'd'] });
    const m = heroBackToPost(map([full]), 'ctl_ossuary', unit, NOW, 20);
    expect(m.pois[0]!.control!.hero).toBeUndefined();
    expect(m.heroReturnAt).toBe(NOW + 20 * MIN);
  });

  it('déjà posté ailleurs (resté sur le point qu’il a pris) : rien ne change', () => {
    const other = { ...ossuary({ hero: true, heroUnit: unit }), id: 'ctl_mine' } as Poi;
    const m0 = map([ossuary(), other]);
    expect(heroBackToPost(m0, 'ctl_ossuary', unit, NOW, 20)).toBe(m0);
  });
});
