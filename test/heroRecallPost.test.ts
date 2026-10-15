// 🧝🔙 Signalé (2026-10-15) : « j'ai envoyé le héros en interception depuis son poste, je lui ai
// fait faire demi-tour, il a fini à la base au lieu de son point de départ ». Le voyage
// reconstruit par le demi-tour d'une attaque combinée en préparation n'avait pas `homeHero` :
// sa place gardée était libérée et, à son retour, il « se téléportait » à la base.
import { describe, expect, it } from 'vitest';
import { recallAttack } from '@/lib/combinedRecall';
import type { AttackWing, CombinedAttack } from '@/lib/combinedAttack';
import {
  heroBackToPost,
  heroHomePostId,
  heroPostOf,
  syncHeroAway,
  unpostHero,
} from '@/lib/islandConquest';
import { EXPE, type ExpeditionMap, type Poi } from '@/lib/expedition';

const M = 60_000;
const T = EXPE.town;
const unit = { name: 'Last', level: 30, combatant: { name: 'Last' } } as never;
const post = (extra: object = {}): Poi =>
  ({
    id: 'ctl',
    type: 'control',
    level: 20,
    x: T.x + 40,
    y: T.y,
    distNorm: 0.4,
    spawnedAt: 0,
    expiresAt: 9e15,
    control: { kind: 'mine', owner: 'player', garrison: [], ...extra },
  }) as unknown as Poi;
const band = { ...post(), id: 'band', type: 'warband', control: undefined } as unknown as Poi;
const mapOf = (p: Poi) => ({ pois: [p, band] }) as unknown as ExpeditionMap;

describe('🧝 la place gardée garde aussi le héros', () => {
  it('unpostHero(…, keepSeat) garde son instantané ; son retour le reprend et le lève', () => {
    const away = unpostHero(mapOf(post({ hero: true, heroUnit: unit })), 0, true);
    const c = away.pois[0]!.control!;
    expect(c.heroAway).toBe(true);
    expect(c.heroAwayUnit).toBe(unit);
    // Retour sans instantané (voyage reconstruit) : il reprend son poste, avec le sien.
    const back = heroBackToPost(away, 'ctl', undefined, 10 * M, 20);
    expect(heroPostOf(back)?.id).toBe('ctl');
    expect(back.pois[0]!.control!.heroUnit).toBe(unit);
    expect(back.pois[0]!.control!.heroAway).toBeUndefined();
    expect(back.pois[0]!.control!.heroAwayUnit).toBeUndefined();
    expect(back.heroReturnAt).toBeUndefined();
  });
  it('sans sortie (keepSeat faux), rien n’est gardé', () => {
    const left = unpostHero(mapOf(post({ hero: true, heroUnit: unit })), 0);
    expect(left.pois[0]!.control!.heroAwayUnit).toBeUndefined();
  });
  it('syncHeroAway lève la place ET l’instantané', () => {
    const m = mapOf(post({ heroAway: true, heroAwayUnit: unit }));
    const c = syncHeroAway(m, null).pois[0]!.control!;
    expect(c.heroAway).toBeUndefined();
    expect(c.heroAwayUnit).toBeUndefined();
  });
});

describe('🔙 demi-tour d’une attaque combinée en préparation', () => {
  const wing = (over: Partial<AttackWing>): AttackWing => ({
    originId: null,
    members: [],
    hero: false,
    legMin: 60,
    departAt: 0,
    returnAt: 120 * M,
    state: 'waiting',
    ...over,
  });
  const attack: CombinedAttack = {
    id: 'atk',
    poi: band,
    seed: 7,
    createdAt: 0,
    arriveAt: 60 * M,
    midAt: 60 * M,
    playerLevel: 30,
    supplies: [],
    wings: [
      wing({ originId: 'ctl', hero: true, state: 'gone', gone: [], heroGone: true }),
      wing({ originId: null, members: ['a'], departAt: 50 * M }),
    ],
  };
  it('le voyage du héros reprend son poste : homeId ET homeHero', () => {
    const map = unpostHero(mapOf(post({ hero: true, heroUnit: unit })), 0, true);
    const r = recallAttack(attack, map, 30 * M);
    if (r === 'arrived') throw new Error('arrivé');
    expect(r.heroTrip?.homeId).toBe('ctl');
    expect(r.heroTrip?.homeHero).toBe(unit);
    // Sa place reste gardée pendant le retour…
    expect(heroHomePostId(r.heroTrip)).toBe('ctl');
    expect(syncHeroAway(map, heroHomePostId(r.heroTrip)).pois[0]!.control!.heroAway).toBe(true);
    // …et il la reprend en rentrant, au lieu de finir à la base.
    const back = heroBackToPost(map, 'ctl', r.heroTrip!.homeHero, r.heroTrip!.returnAt, 20);
    expect(heroPostOf(back)?.id).toBe('ctl');
  });
});

describe('🏰 homeId suffit à dire où revient le héros', () => {
  it('un voyage du héros parti d’un poste, même sans homeHero, y revient', () => {
    const exp = { homeId: 'ctl', reported: true, outcome: { party: { hero: true } } } as never;
    expect(heroHomePostId(exp)).toBe('ctl');
  });
});
