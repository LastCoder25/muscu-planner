// 🧝 Le héros SEUL (expédition solo : arène) posté sur un lieu tenu part de son POSTE et y
// revient (signalé : « le temps de trajet du héros est calculé depuis la base »).
import { describe, expect, it } from 'vitest';
import { controlIdOf, ensureControls } from '@/lib/controlPoints';
import { legFromSpot } from '@/lib/controlRoutes';
import {
  createMap,
  expeditionFromPost,
  poiTravelLevel,
  startExpedition,
  travelOneWayMin,
  travelPosition,
  type Poi,
} from '@/lib/expedition';
import { refFighter } from '@/lib/proceduralContent';

const L = 30;
const map = ensureControls(createMap(3, 0, L, 1), 0, L);
const post = map.pois.find((p) => p.id === controlIdOf('mine'))!;
const camp = map.pois.find((p) => p.id === controlIdOf('training'))!;
const target: Poi = { ...camp, type: 'arena', control: undefined };
const legOf = (p: Poi) => travelOneWayMin(poiTravelLevel(p), p.distNorm);
const hero = refFighter(L);
const unit = { name: 'Toi', level: L, combatant: hero };

describe('🧝 expédition solo depuis le poste', () => {
  const fromTown = startExpedition(hero, target, 0, 7, 1, L);
  const oneWay = legFromSpot(target, post, legOf);
  const trip = expeditionFromPost(fromTown, post, oneWay, unit);

  it("l'aller vaut le trajet depuis le poste, pas depuis la base", () => {
    expect(trip.midAt - trip.sentAt).toBe(Math.round(oneWay) * 60_000);
  });
  it('le retour garde le multiplicateur de la route (raccourci, contretemps)', () => {
    const r = { ...fromTown, outcome: { ...fromTown.outcome, returnMult: 0.5 } };
    const t = expeditionFromPost(r, post, oneWay, unit);
    expect(t.returnAt - t.midAt).toBe(Math.round(Math.round(oneWay) * 60_000 * 0.5));
  });
  it('il part de son poste et y reprend sa place au retour', () => {
    expect(trip.homeId).toBe(post.id);
    expect(trip.homeHero).toEqual(unit);
    const a = travelPosition(trip, trip.sentAt);
    expect(a.x).toBeCloseTo(post.x);
    expect(a.y).toBeCloseTo(post.y);
  });
  it('sur son propre poste, le trajet est bien plus court que depuis la base', () => {
    expect(legFromSpot(post, post, legOf)).toBeLessThan(legOf(post));
  });
});
