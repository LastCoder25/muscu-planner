import { describe, expect, it } from 'vitest';
import {
  restoreUnvanquished,
  voyageTargetShown,
  type ExpeditionMap,
  type Poi,
} from '@/lib/expedition';

const poi = (id: string, type = 'camp', extra: Partial<Poi> = {}) =>
  ({ id, type, x: 10, y: 10, level: 5, expiresAt: 10_000, ...extra }) as unknown as Poi;
const map = (pois: Poi[]) => ({ pois }) as unknown as ExpeditionMap;
const trip = (
  p: Poi,
  win: boolean,
  extra: { turnBack?: number; outTurn?: number; midAt?: number; returnAt?: number } = {},
) => ({
  poi: p,
  midAt: extra.midAt ?? 1000,
  returnAt: extra.returnAt ?? 2000,
  ...(extra.turnBack !== undefined ? { turnBack: extra.turnBack } : {}),
  outcome: { win, ...(extra.outTurn !== undefined ? { turnBack: extra.outTurn } : {}) },
});

describe('restoreUnvanquished — un lieu non terrassé reste sur la carte', () => {
  it('une défaite rend le lieu à la carte', () => {
    const m = restoreUnvanquished(map([]), [trip(poi('a'), false)], 2000);
    expect(m!.pois.map((p) => p.id)).toEqual(['a']);
  });
  it('⚠️ DÈS LE RAPPORT, pas au retour de l’équipe : réattaquable pendant son trajet retour', () => {
    // Demandé : « un lieu non abattu est réattaquable avant que l'armée revienne ».
    const m = restoreUnvanquished(map([]), [trip(poi('a'), false)], 1500);
    expect(m!.pois.map((p) => p.id)).toEqual(['a']);
  });
  it('pas AVANT le rapport : son sort n’est pas encore connu', () => {
    const m0 = map([]);
    expect(restoreUnvanquished(m0, [trip(poi('a'), false)], 999)).toBe(m0);
  });
  it('une victoire l’efface (même carte rendue)', () => {
    const m0 = map([]);
    expect(restoreUnvanquished(m0, [trip(poi('a'), true)], 2000)).toBe(m0);
    expect(restoreUnvanquished(m0, [trip(poi('a'), true)], 1500)).toBe(m0);
  });
  it('un demi-tour forcé sur la route (lieu jamais atteint) le rend aussi', () => {
    const m = restoreUnvanquished(map([]), [trip(poi('a'), true, { outTurn: 0.4 })], 2000);
    expect(m!.pois).toHaveLength(1);
  });
  it('pas tant qu’un autre voyage le vise sans avoir tranché (nouvel assaut en route)', () => {
    const p = poi('a');
    const m0 = map([]);
    const perdu = trip(p, false);
    const neuf = trip(p, true, { midAt: 3000, returnAt: 4000 });
    expect(restoreUnvanquished(m0, [perdu, neuf], 1500)).toBe(m0);
  });
  it('⚠️ jamais derrière une victoire, même si l’ancienne équipe rentre encore', () => {
    // Sans ce garde, l'équipe battue, encore sur le chemin du retour, ferait réapparaître le
    // lieu que la nouvelle vient d'abattre.
    const p = poi('a');
    const m0 = map([]);
    const perdu = trip(p, false, { midAt: 1000, returnAt: 5000 });
    const gagné = trip(p, true, { midAt: 2000, returnAt: 3000 });
    expect(restoreUnvanquished(m0, [perdu, gagné], 2500)).toBe(m0);
  });
  it('ni une arène, ni un point fixe, ni un lieu expiré, ni un doublon', () => {
    const here = poi('d');
    const m0 = map([here]);
    const out = restoreUnvanquished(
      m0,
      [
        trip(poi('ar', 'arena'), false),
        trip(poi('c', 'control'), false),
        trip(poi('e', 'camp', { expiresAt: 1500 }), false),
        trip(here, false),
      ],
      2000,
    );
    expect(out).toBe(m0);
  });
});

describe('voyageTargetShown — la carte ne dessine pas deux fois un lieu revenu', () => {
  it('cible dessinée tant que son sort n’est pas connu', () => {
    expect(voyageTargetShown(trip(poi('a'), false), 999)).toBe(true);
  });
  it('plus dessinée dès qu’un lieu non terrassé est revenu', () => {
    expect(voyageTargetShown(trip(poi('a'), false), 1000)).toBe(false);
    expect(voyageTargetShown(trip(poi('a'), true, { outTurn: 0.4 }), 1500)).toBe(false);
  });
  it('terrassé : grisé jusqu’au retour', () => {
    expect(voyageTargetShown(trip(poi('a'), true), 1500)).toBe(true);
  });
  it('arène et point fixe : inchangés (ils ne reviennent pas par ce chemin)', () => {
    expect(voyageTargetShown(trip(poi('ar', 'arena'), false), 1500)).toBe(true);
    expect(voyageTargetShown(trip(poi('c', 'control'), false), 1500)).toBe(true);
  });
});
