// 🏰👥 La carte ne grise plus un lieu qu'une garnison peut attaquer (signalé par l'utilisateur :
// « les lieux sont grisés alors que j'ai des champions dispos sur les lieux fixes »).
import { describe, expect, it } from 'vitest';
import { captureControl, controlIdOf, ensureControls } from '@/lib/controlPoints';
import { championsAbleToGo, readyGarrisons } from '@/lib/controlRoutes';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { poiOffers } from '@/lib/caravan';

const L = 30;
const MINE = controlIdOf('mine');
const CAMP = controlIdOf('training');
const world = (mine: string[], camp: string[] = []): ExpeditionMap => {
  let m = ensureControls(createMap(3, 0, L, 1), 0, L);
  if (mine.length) m = captureControl(m, MINE, mine, 0, 7);
  if (camp.length) m = captureControl(m, CAMP, camp, 0, 7);
  return m;
};
const adv = (id: string, extra: { hurtUntil?: number; busyUntil?: number } = {}) => ({
  id,
  ...extra,
});

describe('🏰 garnisons prêtes à sortir', () => {
  it('les champions postés sur un point tenu, ni blessés ni en route', () => {
    const m = world(['a', 'b', 'c']);
    const advs = [adv('a'), adv('b', { hurtUntil: 100 }), adv('c', { busyUntil: 100 }), adv('z')];
    const r = readyGarrisons(m, advs, 50);
    expect(r.get(MINE)?.map((a) => a.id)).toEqual(['a']);
    // Plus tard, blessé soigné et arrivé : tous prêts.
    expect(readyGarrisons(m, advs, 200).get(MINE)?.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    // Un champion hors garnison n'y figure jamais.
    expect([...readyGarrisons(m, advs, 200).values()].flat().some((a) => a.id === 'z')).toBe(false);
  });
  it('les miliciens ne sortent pas', () => {
    const m = world(['a', 'mil:1']);
    expect(readyGarrisons(m, [adv('a'), adv('mil:1')], 0).get(MINE)?.map((a) => a.id)).toEqual([
      'a',
    ]);
  });
  it('aucun point tenu : rien', () => {
    expect(readyGarrisons(world([]), [adv('a')], 0).size).toBe(0);
  });
});

describe('👥 qui peut partir vers un lieu', () => {
  const ready = new Map([
    ['p1', [adv('a'), adv('b')]],
    ['p2', [adv('c')]],
  ]);
  it('la base + les garnisons des AUTRES points', () => {
    expect(championsAbleToGo(0, ready, 'ailleurs')).toBe(3);
    expect(championsAbleToGo(2, ready, 'ailleurs')).toBe(5);
    // On ne sort pas d'un point pour l'attaquer lui-même.
    expect(championsAbleToGo(0, ready, 'p1')).toBe(1);
  });
  it('⚠️ base vide mais garnison prête : le point ennemi reste proposé (non grisé)', () => {
    const m = world(['a']);
    const target = m.pois.find((p) => p.control?.owner === 'enemy' && !p.control.assault)!;
    expect(target).toBeTruthy();
    const n = championsAbleToGo(0, readyGarrisons(m, [adv('a')], 0), target.id);
    expect(poiOffers(target, { heroAway: true, comptoirLevel: 0, advsAvailable: n }).party).toBe(
      true,
    );
    // Sans garnison ni base : grisé.
    expect(poiOffers(target, { heroAway: true, comptoirLevel: 0, advsAvailable: 0 }).party).toBe(
      false,
    );
  });
});
