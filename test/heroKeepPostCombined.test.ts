import { describe, expect, it } from 'vitest';
import { heroPostBlocker } from '@/lib/controlPoints';
import { heroKeepPostId, syncHeroAway, unpostHero } from '@/lib/islandConquest';
import { EXPE, type ActiveExpedition, type ExpeditionMap, type Poi } from '@/lib/expedition';

// 🧝⚔️ Signalé (2026-10-08) : le héros parti de l'Ossuaire avec une ATTAQUE COMBINÉE perdait la
// place qui lui était gardée au tick suivant, parce que son voyage vivait encore dans l'attaque.
const NOW = 5_000_000;
const unit = { name: 'Last', level: 30, combatant: {} } as never;
const ossuary = {
  id: 'ctl_ossuary',
  type: 'control',
  level: 30,
  x: EXPE.town.x + 30,
  y: EXPE.town.y,
  control: {
    kind: 'ossuary',
    owner: 'player',
    hero: true,
    heroUnit: unit,
    garrison: ['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'],
  },
} as unknown as Poi;
const gone = { originId: 'ctl_ossuary', state: 'gone', heroGone: true };

describe('la place du héros parti avec une attaque combinée', () => {
  it('reste gardée tant que l’attaque n’est pas résolue (pas encore d’expédition)', () => {
    const left = unpostHero({ pois: [ossuary] } as unknown as ExpeditionMap, NOW, true);
    expect(left.pois[0]!.control!.heroAway).toBe(true);
    const synced = syncHeroAway(left, heroKeepPostId(null, [gone]));
    expect(synced.pois[0]!.control!.heroAway).toBe(true);
    // …donc personne d'autre ne peut la prendre : il la retrouvera à son retour.
    expect(heroPostBlocker(synced.pois[0]!.control)).toBe('here');
  });

  it('un groupe encore en attente, parti de la base ou sans le héros ne garde rien', () => {
    expect(heroKeepPostId(null, [{ ...gone, state: 'waiting' }])).toBeNull();
    expect(heroKeepPostId(null, [{ ...gone, originId: null }])).toBeNull();
    expect(heroKeepPostId(null, [{ ...gone, heroGone: false }])).toBeNull();
  });

  it('une fois l’attaque résolue, son voyage décide (blessé : plus de place gardée)', () => {
    const exp = {
      homeId: 'ctl_ossuary',
      homeHero: unit,
      reported: true,
      outcome: { party: { heroHurt: true } },
    } as unknown as ActiveExpedition;
    expect(heroKeepPostId(exp, [])).toBeNull();
    expect(heroKeepPostId({ ...exp, outcome: { party: {} } } as never, [])).toBe('ctl_ossuary');
  });
});
