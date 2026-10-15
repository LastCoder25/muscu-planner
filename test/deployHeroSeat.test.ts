import { describe, expect, it } from 'vitest';
import { heroSeatOf } from '@/lib/islandConquest';
import { planStations, type DeploySpot, type DeployUnit } from '@/lib/mapDeployment';
import type { ExpeditionMap } from '@/lib/expedition';

/**
 * 🧝 « Répartir » et la place du héros (2026-10-15, signalé : un champion proposé vers
 * l'Arsenal alors qu'il était plein — 3 champions en route + le héros parti en sortie, ses
 * 2 places gardées). La répartition doit compter le héros là où il a SA PLACE.
 */
const mapWith = (control: Record<string, unknown>) =>
  ({
    pois: [
      { id: 'A', control: { owner: 'player', garrison: [], ...control } },
      { id: 'E', control: { owner: 'enemy', garrison: [], hero: true } },
    ],
  }) as unknown as ExpeditionMap;

describe('heroSeatOf — où le héros a sa place', () => {
  it('posté, en route pour l’être, ou en sortie avec sa place gardée', () => {
    expect(heroSeatOf(mapWith({ hero: true }))?.id).toBe('A');
    expect(heroSeatOf(mapWith({ heroComing: { at: 0 } }))?.id).toBe('A');
    expect(heroSeatOf(mapWith({ heroAway: true }))?.id).toBe('A');
  });
  it('nulle part ailleurs, et jamais sur un lieu ennemi', () => {
    expect(heroSeatOf(mapWith({}))).toBeUndefined();
  });
});

describe('répartition : la place gardée du héros remplit le lieu', () => {
  const PTS = Array.from({ length: 11 }, (_, i) => i);
  // La base est loin de tout : sans la place gardée du héros, l'Arsenal attirerait Selven.
  const XS: Record<string, number> = { base: 40, arsenal: 5 };
  const deps = { trip: (s: string, p: number) => 10 * Math.abs(XS[s]! - PTS[p]!) };
  const spots: DeploySpot[] = [
    { id: 'base', seats: Infinity, heroOk: true },
    { id: 'arsenal', seats: 5, heroOk: true },
  ];
  const fixedChamp = (id: string): DeployUnit => ({
    id,
    hero: false,
    loc: 'arsenal',
    // Faibles : sans renfort, l'Arsenal ne réunit pas la force voulue — il attire Selven.
    power: 1,
    fixed: true,
  });
  it('3 champions en route + le héros en sortie : personne d’autre n’y va', () => {
    const units: DeployUnit[] = [
      fixedChamp('sybille'),
      fixedChamp('roan'),
      fixedChamp('erebe'),
      // Le héros, compté là où sa place est gardée (heroSeatOf), immobile.
      { id: '__hero', hero: true, loc: 'arsenal', power: 1, fixed: true },
      { id: 'selven', hero: false, loc: 'base', power: 10 },
    ];
    const r = planStations(units, spots, PTS.length, { force: 10 / 0.6, deps });
    expect(r.spotOf.get('selven')).not.toBe('arsenal');
  });
});
