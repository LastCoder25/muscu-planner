// 🧝 Le héros en garnison sur un lieu fixe prend 2 places sur les 5 (2026-10-05, demandé :
// « permettre au héros d'être en garnison sur les lieux fixes. il prend 2 places sur les 5 »).
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  champSeatsWithHero,
  controlFreeSeats,
  controlIdOf,
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
import { createMap, type ControlKind, type ExpeditionMap, type PostedHero } from '@/lib/expedition';
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
