// ⚡ Boost d'un renfort en route ou d'un retour d'un point fixe (depuis la tuile de voyage).
import { describe, expect, it } from 'vitest';
import {
  boostControlTrip,
  captureControl,
  controlIdOf,
  ensureControls,
  reinforceControl,
  reinforcementsEnRoute,
  returnsEnRoute,
  sendHomeFromControl,
} from '@/lib/controlPoints';
import { createMap } from '@/lib/expedition';

const H = 3600_000;
const ID = controlIdOf('mine');
const held = () =>
  captureControl(ensureControls(createMap(3, 0, 30, 1), 0, 30, 100), ID, ['a'], 0, 7);

describe('⚡ boost d’un trajet de point fixe', () => {
  it('un renfort arrive plus tôt, seul CE convoi bouge', () => {
    let m = reinforceControl(held(), ID, ['b'], 5 * H, H);
    m = reinforceControl(m, ID, ['c'], 5 * H, H);
    m = reinforceControl(m, ID, ['d'], 8 * H, H);
    const out = boostControlTrip(m, ID, 'reinf', ['b', 'c'], 5 * H, H);
    const r = out.pois.find((p) => p.id === ID)!.control!.reinforcing!;
    expect(r.find((x) => x.id === 'b')!.at).toBe(4 * H);
    expect(r.find((x) => x.id === 'c')!.at).toBe(4 * H);
    expect(r.find((x) => x.id === 'd')!.at).toBe(8 * H);
    // Le départ avance de même : la durée du trajet ne change pas, le pion saute (v1.295.0).
    expect(r.find((x) => x.id === 'b')!.from).toBe(0);
    expect(r.find((x) => x.id === 'd')!.from).toBe(H);
    const trip = reinforcementsEnRoute(out, 2 * H).find((t) => t.members.includes('b'))!;
    expect(trip.midAt).toBe(4 * H);
  });

  it('un retour rentre plus tôt', () => {
    const m = sendHomeFromControl(held(), ID, ['a'], H, 6 * H);
    const out = boostControlTrip(m, ID, 'return', ['a'], 6 * H, 30 * 60_000);
    const back = returnsEnRoute(out, 2 * H)[0]!;
    expect(back.returnAt).toBe(6 * H - 30 * 60_000);
    // Parti à H, le départ avance aussi : le trajet (5 h) garde sa durée.
    expect(back.sentAt).toBe(H - 30 * 60_000);
  });

  it('mauvaise échéance, autre sorte ou gain nul : même carte', () => {
    const m = reinforceControl(held(), ID, ['b'], 5 * H, H);
    expect(boostControlTrip(m, ID, 'reinf', ['b'], 4 * H, H)).toBe(m);
    expect(boostControlTrip(m, ID, 'return', ['b'], 5 * H, H)).toBe(m);
    expect(boostControlTrip(m, ID, 'reinf', ['b'], 5 * H, 0)).toBe(m);
  });
});
