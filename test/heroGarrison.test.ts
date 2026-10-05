// 🧝 Le héros en garnison sur un lieu fixe prend 2 places sur les 5 (2026-10-05, demandé :
// « permettre au héros d'être en garnison sur les lieux fixes. il prend 2 places sur les 5 »).
import { describe, expect, it } from 'vitest';
import {
  baseSendBlocker,
  captureControl,
  collectControl,
  controlTravelMult,
  tierRate,
  champSeatsWithHero,
  controlFreeSeats,
  controlIdOf,
  controlRoster,
  garrisonDots,
  ensureControls,
  heroPostBlocker,
  heroSeatsIn,
  loseControl,
  militiaFreeSeats,
  reinforceControl,
  seatsOf,
  sendHeroToControl,
  settleReinforcements,
} from '@/lib/controlPoints';
import {
  createMap,
  controlWorkforce,
  HERO_GARRISON_SEATS,
  type ControlKind,
  type ExpeditionMap,
  type PostedHero,
} from '@/lib/expedition';
import { heroCanStay } from '@/lib/party';
import { heroComing, heroHeldOnMap, takeObjective, turnBackComingHero } from '@/lib/islandConquest';
import { MILITIA } from '@/lib/militia';
import { refFighter } from '@/lib/proceduralContent';

const unit: PostedHero = { name: 'Toi', level: 30, combatant: refFighter(30) };
const H = 3600_000;
const id = controlIdOf('mine');
const base = (): ExpeditionMap => ensureControls(createMap(3, 0, 30, 1), 0, 30, 1);
const held = (ids: string[], hero = false): ExpeditionMap =>
  captureControl(base(), id, ids, 0, 7, hero ? unit : undefined);
const ctl = (m: ExpeditionMap) => m.pois.find((p) => p.id === id)!.control!;

describe('🧝 le héros prend 2 places sur les 5', () => {
  it('posté, il compte comme deux champions et deux places de garnison', () => {
    expect(MILITIA.heroSeats).toBe(2);
    const m = held(['a'], true);
    expect(heroSeatsIn(ctl(m))).toBe(2);
    expect(controlFreeSeats(ctl(m))).toBe(seatsOf('mine') - 3);
    expect(militiaFreeSeats(ctl(m))).toBe(MILITIA.perPoint - 3);
    expect(heroSeatsIn(ctl(held(['a'])))).toBe(0);
  });
  it('pris avec lui, le lieu garde 3 champions au plus (5 sans lui)', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    expect(ctl(held(five, true)).garrison).toEqual(['a', 'b', 'c']);
    expect(ctl(held(five)).garrison).toHaveLength(5);
    expect(champSeatsWithHero({ kind: 'mine' }, true)).toBe(3);
    expect(champSeatsWithHero({ kind: 'training' }, true)).toBe(1);
    // 🪺 Un nid s'abat : personne n'y reste, avec ou sans le héros.
    expect(champSeatsWithHero({ kind: 'objective', razes: true }, false)).toBe(0);
  });
  it('un objectif d’île pris avec lui garde 3 champions au plus', () => {
    const at = 0;
    const before = ensureControls(createMap(3, 0, 30, 1), 0, 30, 1);
    const enemy = before.pois.find((p) => p.type === 'control')!;
    const obj = {
      ...enemy,
      id: 'isl_obj_0',
      control: { ...enemy.control!, kind: 'objective' as const },
    };
    const m = takeObjective(
      {
        ...before,
        pois: [...before.pois, obj],
        archipel: { island: 1, levelCap: 20 },
      } as ExpeditionMap,
      'isl_obj_0',
      ['a', 'b', 'c', 'd', 'e'],
      at,
      unit,
    );
    const held = m.pois.find((p) => p.id === 'isl_obj_0')?.control;
    expect(held?.hero).toBe(true);
    expect(held?.garrison).toEqual(['a', 'b', 'c']);
  });
  it('il ne reste pas là où il n’y a pas 2 places (exactement « seatsOf < 2 »)', () => {
    const kinds: ControlKind[] = ['mine', 'garden', 'training', 'lapidary', 'tower', 'fortress'];
    for (const kind of kinds) {
      const poi = {
        id: 'x',
        type: 'control' as const,
        control: {
          kind,
          owner: 'enemy' as const,
          garrison: [],
          retakes: 0,
          faction: 'bandits' as const,
          size: 1,
        },
      };
      expect(heroCanStay(poi as never)).toBe(seatsOf(kind) >= MILITIA.heroSeats);
    }
  });
});

describe('🧝 envoyer le héros en garnison sur un lieu tenu', () => {
  it('refusé sans 2 places libres, accepté sinon', () => {
    expect(heroPostBlocker(ctl(held(['a', 'b', 'c', 'd'])))).toBe('full');
    expect(heroPostBlocker(ctl(held(['a', 'b', 'c'])))).toBeNull();
    expect(heroPostBlocker(ctl(held(['a'], true)))).toBe('here');
    expect(heroPostBlocker(ctl(base()))).toBe('notHeld');
  });
  it('ses places sont réservées dès le départ : un renfort ne peut plus les prendre', () => {
    const m = sendHeroToControl(held(['a', 'b', 'c']), id, 0, 2 * H, unit);
    expect(controlFreeSeats(ctl(m))).toBe(0);
    expect(heroPostBlocker(ctl(m))).toBe('here');
    expect(heroComing(m)).toBe(true);
    expect(heroHeldOnMap(m, H)).toBe(true);
  });
  it('il devient défenseur à son arrivée, pas avant', () => {
    const m = sendHeroToControl(held(['a']), id, 0, 2 * H, unit);
    expect(ctl(settleReinforcements(m, H, 30)).hero).toBeFalsy();
    const done = ctl(settleReinforcements(m, 3 * H, 30));
    expect(done.hero).toBe(true);
    expect(done.heroUnit?.name).toBe('Toi');
    expect(done.heroComing).toBeUndefined();
    expect(heroSeatsIn(done)).toBe(2);
  });
  it('un renfort arrivé ne dépasse jamais les places, héros compris', () => {
    let m = held(['a', 'b'], true);
    m = reinforceControl(m, id, ['c', 'd'], H, 0);
    expect(ctl(settleReinforcements(m, 2 * H, 30)).garrison).toEqual(['a', 'b', 'c']);
  });
  it('demi-tour : il rentre en autant de temps qu’il a marché, ses places se libèrent', () => {
    const m = sendHeroToControl(held(['a']), id, 0, 4 * H, unit);
    const back = turnBackComingHero(m, H);
    expect(back.heroReturnAt).toBe(2 * H);
    expect(heroComing(back)).toBe(false);
    expect(controlFreeSeats(ctl(back))).toBe(seatsOf('mine') - 1);
  });
  it('le lieu perdu avant son arrivée : il fait demi-tour au lieu de disparaître', () => {
    const m = sendHeroToControl(held(['a']), id, 0, 4 * H, unit);
    const lost = loseControl(m, id, 30, H);
    expect(lost.heroReturnAt).toBe(2 * H);
    expect(heroComing(lost)).toBe(false);
  });
});

describe('🧝 le héros posté vaut 2 champions pour la production', () => {
  // ⚠️ Mesuré sur l'or RÉELLEMENT récolté, pas sur une formule recopiée.
  const goldAfter = (m: ExpeditionMap) => collectControl(m, id, 8 * H, 30).gold;
  it('héros + 1 champion produit comme 3 champions, plus qu’1 seul', () => {
    const withHero = goldAfter(held(['a'], true));
    expect(withHero).toBeGreaterThan(0);
    expect(withHero).toBe(goldAfter(held(['a', 'b', 'c'])));
    expect(withHero).toBeGreaterThan(goldAfter(held(['a'])));
  });
  it('le héros seul fait tourner le lieu comme 2 champions', () => {
    expect(goldAfter(held([], true))).toBe(goldAfter(held(['a', 'b'])));
  });
  it('en route, il ne produit rien encore (comme un renfort)', () => {
    const m = sendHeroToControl(held(['a']), id, 0, 100 * H, unit);
    expect(goldAfter(m)).toBe(goldAfter(held(['a'])));
  });
  it('l’effectif compte le héros pour 2, la garnison seule sinon', () => {
    expect(controlWorkforce({ garrison: ['a'], hero: true })).toBe(3);
    expect(controlWorkforce({ garrison: ['a', 'mil:1'] })).toBe(2);
    expect(HERO_GARRISON_SEATS).toBe(MILITIA.heroSeats);
  });
  it('la charge des crans suit aussi le héros', () => {
    expect(tierRate(ctl(held(['a'], true)))).toBe(tierRate(ctl(held(['a', 'b', 'c']))));
  });
  it('🗼 une tour tenue par le héros raccourcit les trajets comme 2 champions', () => {
    // La tour n'est plus posée d'office : on fait du point une tour.
    const tower = (ids: string[], hero: boolean): ExpeditionMap => {
      const m = held(ids, hero);
      return {
        ...m,
        pois: m.pois.map((p) =>
          p.id === id ? { ...p, control: { ...p.control!, kind: 'tower' as const } } : p,
        ),
      };
    };
    expect(controlTravelMult(tower([], true), H)).toBe(
      controlTravelMult(tower(['a', 'b'], false), H),
    );
    expect(controlTravelMult(tower([], true), H)).toBeLessThan(1);
  });
});

describe('🏠 envoyer le héros depuis la base (avec champions et miliciens)', () => {
  it('le héros seul part sur un lieu qui a 2 places libres', () => {
    expect(baseSendBlocker(ctl(held(['a', 'b', 'c'])), 0, 0, true)).toBeNull();
  });
  it('il compte pour 2 places, servies avant les champions puis les miliciens', () => {
    const c = ctl(held(['a', 'b']));
    expect(baseSendBlocker(c, 1, 0, true)).toBeNull(); // 2 + 2 + 1 = 5
    expect(baseSendBlocker(c, 2, 0, true)).toBe('full');
    expect(baseSendBlocker(c, 0, 1, true)).toBeNull();
    expect(baseSendBlocker(c, 1, 1, true)).toBe('full');
  });
  it('refusé s’il y est déjà, ou au lapidaire', () => {
    expect(baseSendBlocker(ctl(held(['a'], true)), 0, 0, true)).toBe('heroHere');
    const lap = { ...ctl(held([])), kind: 'lapidary' as const };
    expect(baseSendBlocker(lap, 0, 0, true)).toBe('heroNoSeat');
  });
  it('sans le héros, rien ne change', () => {
    expect(baseSendBlocker(ctl(held(['a', 'b'])), 3, 0)).toBeNull();
    expect(baseSendBlocker(ctl(held(['a', 'b'])), 0, 0)).toBe('empty');
  });
});

describe('⚫ les points sous le fort comptent le héros pour 2 places', () => {
  const dotsAt = (m: ExpeditionMap, now: number) =>
    garrisonDots(controlRoster(m, [], now, 30, new Set()).find((r) => r.poi.id === id)!);
  it('posté : 2 points héros, et le total reste celui des places', () => {
    const dots = dotsAt(held(['a'], true), 0);
    expect(dots).toBe('hhc' + 'f'.repeat(MILITIA.perPoint - 3));
    expect(dots).toHaveLength(MILITIA.perPoint);
  });
  it('en route : 2 points « en route »', () => {
    const m = sendHeroToControl(held(['a']), id, 0, 2 * H, unit);
    expect(dotsAt(m, H)).toBe('crr' + 'f'.repeat(MILITIA.perPoint - 3));
  });
});
