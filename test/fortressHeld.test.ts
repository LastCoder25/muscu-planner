import { describe, expect, it } from 'vitest';
import { ISLAND_OUTPOST_LEVEL, archipelOn, islandPacified } from '@/lib/archipelago';
import { createMap, type ExpeditionMap, type Poi } from '@/lib/expedition';
import {
  controlFreeSeats,
  controlYieldCard,
  ensureControls,
  militiaFreeSeats,
  reinforceBlocker,
  seatsOf,
} from '@/lib/controlPoints';
import {
  FORTRESS_ID,
  boardFromFortress,
  ensureIslandConquest,
  heroPosted,
  heroHeldOnMap,
  islandConquest,
  objectiveIdOf,
  razeIslandTarget,
  recallPostedHero,
  takeFortress,
} from '@/lib/islandConquest';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const LV = 18;

function island1(): ExpeditionMap {
  const m = createMap(7, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
const fort = (m: ExpeditionMap): Poi | undefined => m.pois.find((p) => p.id === FORTRESS_ID);
const TEAM = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

describe('🏰 la forteresse prise se tient', () => {
  it('toute l’équipe y reste (garnison sans limite), le héros aussi', () => {
    const m = takeFortress(island1(), TEAM, true, NOW);
    const c = fort(m)!.control!;
    expect(c.owner).toBe('player');
    expect(c.garrison).toEqual(TEAM);
    expect(c.hero).toBe(true);
    expect(heroPosted(m)).toBe(true);
    expect(seatsOf('fortress')).toBe(Infinity);
    expect(controlFreeSeats(c)).toBe(Infinity);
    // 🛡️ Pas de milicien dans la forteresse : elle se tient avec des champions.
    expect(militiaFreeSeats(c)).toBe(0);
    expect(reinforceBlocker(c, 40)).toBeNull();
    expect(reinforceBlocker(c, 1, true)).toBe('noMilitia');
  });
  it('sans le héros, il n’est pas posté', () => {
    const m = takeFortress(island1(), TEAM, false, NOW);
    expect(fort(m)!.control!.hero).toBeUndefined();
    expect(heroPosted(m)).toBe(false);
  });
  it('elle compte comme abattue, n’est jamais reprise et ne produit rien', () => {
    let m = island1();
    m = razeIslandTarget(m, objectiveIdOf(0), NOW);
    m = razeIslandTarget(m, objectiveIdOf(1), NOW);
    m = takeFortress(m, TEAM, true, NOW);
    expect(islandPacified(m)).toBe(true);
    expect(islandConquest(m)!.fortressDown).toBe(true);
    // Même avant la pacification, aucune reprise n’est posée sur elle.
    const half = takeFortress(island1(), TEAM, false, NOW);
    const later = ensureControls(half, NOW + 5 * H, LV, ISLAND_OUTPOST_LEVEL);
    expect(fort(later)!.control!.attackAt).toBeUndefined();
    expect(controlYieldCard(fort(m)!, NOW + 5 * H, LV)).toBeNull();
  });
  it('le tick de la carte la garde, sans la reposer ennemie', () => {
    const m = takeFortress(island1(), TEAM, true, NOW);
    const t = ensureIslandConquest(m, NOW + H, LV);
    const f = t.pois.filter((p) => p.id === FORTRESS_ID);
    expect(f).toHaveLength(1);
    expect(f[0]!.control!.owner).toBe('player');
    expect(f[0]!.control!.garrison).toEqual(TEAM);
    // Hors archipel, elle part comme le reste.
    const off = { ...t };
    delete off.archipel;
    expect(fort(ensureIslandConquest(off, NOW + H, LV))).toBeUndefined();
  });
});

describe('🦸 le héros posté', () => {
  it('rappelé, il quitte la forteresse et marche jusqu’à la base', () => {
    const m = recallPostedHero(takeFortress(island1(), TEAM, true, NOW), NOW, 90);
    expect(heroPosted(m)).toBe(false);
    expect(m.heroReturnAt).toBe(NOW + 90 * 60_000);
    expect(heroHeldOnMap(m, NOW + 89 * 60_000)).toBe(true);
    expect(heroHeldOnMap(m, NOW + 90 * 60_000)).toBe(false);
    // La garnison, elle, reste.
    expect(fort(m)!.control!.garrison).toEqual(TEAM);
  });
  it('la traversée part de la forteresse : champions et héros embarquent, les miliciens restent', () => {
    const m = takeFortress(island1(), [...TEAM, 'mil:1', 'mil:2'], true, NOW);
    const b = boardFromFortress(m);
    expect(b.ids).toEqual(TEAM);
    const c = fort(b.map)!.control!;
    expect(c.garrison).toEqual(['mil:1', 'mil:2']);
    expect(c.hero).toBeUndefined();
    expect(heroPosted(b.map)).toBe(false);
  });
});
