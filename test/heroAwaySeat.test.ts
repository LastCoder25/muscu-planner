import { describe, expect, it } from 'vitest';
import { controlFreeSeats, heroPostBlocker, militiaFreeSeats } from '@/lib/controlPoints';
import { MILITIA } from '@/lib/militia';
import { heroBackToPost, heroHomePostId, syncHeroAway, unpostHero } from '@/lib/islandConquest';
import { EXPE, type ActiveExpedition, type ExpeditionMap, type Poi } from '@/lib/expedition';

// 🧝⚔️ Demandé (2026-10-07) : en sortie, le héros garde ses 2 places sur son poste, comme un
// champion (`away`).
const NOW = 5_000_000;
const T = EXPE.town;
const unit = { name: 'Last', level: 30, combatant: {} } as never;

function post(extra: object = {}): Poi {
  return {
    id: 'p',
    type: 'control',
    level: 20,
    x: T.x + 40,
    y: T.y,
    control: { kind: 'mine', owner: 'player', garrison: [], ...extra },
  } as unknown as Poi;
}
const map = (p: Poi) => ({ pois: [p] }) as unknown as ExpeditionMap;
const ctl = (m: ExpeditionMap) => m.pois[0]!.control!;

describe('en sortie, ses places lui sont gardées', () => {
  it('unpostHero(…, keepSeat) garde 2 places ; sans, il les libère', () => {
    const p = post({ hero: true, heroUnit: unit, garrison: ['a', 'b'] });
    const kept = ctl(unpostHero(map(p), NOW, true));
    const freed = ctl(unpostHero(map(p), NOW));
    expect(kept.heroAway).toBe(true);
    expect(freed.heroAway).toBeUndefined();
    expect(controlFreeSeats(kept)).toBe(controlFreeSeats(freed) - 2);
  });
  // 🛡️ Plus d'intérim (2026-10-08) : les miliciens ont leurs places à part, ses places gardées
  // ne sont pas des places de milice — et la réserve de milice reste entière.
  it('un autre champion ne peut pas prendre ces places ; la milice garde toutes les siennes', () => {
    const c = ctl(
      unpostHero(map(post({ hero: true, heroUnit: unit, garrison: ['a', 'b', 'c'] })), NOW, true),
    );
    expect(controlFreeSeats(c)).toBe(0);
    expect(militiaFreeSeats(c)).toBe(MILITIA.perPoint);
    expect(heroPostBlocker(c)).toBe('here');
  });
  it('à son retour il reprend sa place, même si le lieu s’est rempli entre-temps', () => {
    const away = unpostHero(
      map(post({ hero: true, heroUnit: unit, garrison: ['a', 'b', 'c'] })),
      NOW,
      true,
    );
    const back = ctl(heroBackToPost(away, 'p', unit, NOW + 1, 20));
    expect(back.hero).toBe(true);
    expect(back.heroAway).toBeUndefined();
  });
});

describe('la place ne reste gardée que là où il revient', () => {
  const exp = (over: object) =>
    ({
      homeId: 'p',
      homeHero: unit,
      reported: false,
      outcome: { party: { hero: true } },
      ...over,
    }) as unknown as ActiveExpedition;
  it('heroHomePostId : son poste, sauf blessé une fois le rapport déposé', () => {
    expect(heroHomePostId(exp({}))).toBe('p');
    expect(heroHomePostId(exp({ outcome: { party: { heroHurt: true } } }))).toBe('p');
    expect(
      heroHomePostId(exp({ reported: true, outcome: { party: { heroHurt: true } } })),
    ).toBeNull();
    expect(heroHomePostId(exp({ homeHero: undefined }))).toBeNull();
    expect(heroHomePostId(null)).toBeNull();
  });
  it('syncHeroAway libère ailleurs et sur un lieu perdu, garde sur son poste', () => {
    const m = map(post({ heroAway: true }));
    expect(syncHeroAway(m, 'p')).toBe(m);
    expect(ctl(syncHeroAway(m, null)).heroAway).toBeUndefined();
    const lost = map(post({ heroAway: true, owner: 'enemy' }));
    expect(ctl(syncHeroAway(lost, 'p')).heroAway).toBeUndefined();
  });
});
