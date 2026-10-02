import { describe, expect, it } from 'vitest';
import { ISLANDS, ISLAND_OUTPOST_LEVEL, archipelOn } from '@/lib/archipelago';
import {
  EXPE,
  ISLAND_DENSITY,
  advanceWorld,
  createMap,
  isQuotaPoi,
  mapQuota,
  revealRadius,
  type ExpeditionMap,
} from '@/lib/expedition';
import { CONTROL, ensureControls } from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';

/**
 * 🏝️ ÉTAPE 2 QUATER (question de l'utilisateur, 2026-10-02 : « vu la taille de l'île et le temps
 * de trajet max, il faut adapter le nombre de lieux pour que ce ne soit pas surchargé ? »).
 * Une île vise la densité de la carte ordinaire, LIEUX FIXES COMPRIS : avant, elle portait
 * 22 lieux sur ~60 % de la surface d'une carte ordinaire qui en porte 28.
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const OUT = ISLAND_OUTPOST_LEVEL;
const annulus = (r: number) => Math.PI * (r * r - EXPE.distMin * EXPE.distMin);
/** Le total visé sur une île. */
const target = Math.round(ISLAND_DENSITY * annulus(revealRadius(OUT)));

function islandAt(id: number, L: number, seed: number): ExpeditionMap[] {
  let m = ensureIslandConquest(
    ensureControls(createMap(seed, NOW, L, OUT, undefined, archipelOn(id)), NOW, L, OUT),
    NOW,
    L,
  );
  const seen: ExpeditionMap[] = [];
  for (let t = NOW; t <= NOW + 10 * 24 * H; t += 2 * H) {
    m = ensureIslandConquest(ensureControls(advanceWorld(m, t, L, OUT), t, L, OUT), t, L);
    seen.push(m);
  }
  return seen;
}

/** Ce qui occupe la carte : lieux tirés, failles et lieux fixes (hors mines résiduelles et
 *  armées, qui sont des conséquences et non des spawns). */
/** 🪺 Les nids nés en route (île 2) n’en font pas partie : une conséquence de la menace. */
const occupied = (m: ExpeditionMap) =>
  m.pois.filter(
    (p) =>
      (isQuotaPoi(p) || p.type === 'rift' || p.type === 'control') &&
      !(m.archipel?.nests ?? []).some((n) => p.id === `isl_obj_${n.i}`),
  ).length;

describe('🏝️ densité des lieux sur une île', () => {
  it('les points de contrôle de référence sont ceux du jeu', () => {
    expect(EXPE.refControls).toBe(CONTROL.kinds.length);
  });

  it('une île porte la densité de la carte ordinaire, lieux fixes compris', () => {
    // La carte ordinaire de référence : 16 lieux + 6 failles + 6 points fixes sur l'anneau 18 → 64.
    const refTotal = EXPE.poiRef + EXPE.riftRef + EXPE.refControls;
    expect(target).toBeLessThan(refTotal);
    expect(target).toBe(17);
  });

  for (const isl of ISLANDS)
    it(`île ${isl.id} : jamais plus que la densité visée, et jamais vide`, () => {
      for (const seed of [1, 7, 42]) {
        for (const m of islandAt(isl.id, isl.maxLevel, seed).slice(12)) {
          expect(occupied(m), `île ${isl.id} graine ${seed}`).toBeLessThanOrEqual(target);
          // Au moins le plancher de failles et quelques lieux à prendre.
          expect(m.pois.filter(isQuotaPoi).length).toBeGreaterThanOrEqual(4);
          expect(m.pois.filter((p) => p.type === 'rift').length).toBeGreaterThanOrEqual(
            EXPE.riftFloor,
          );
        }
      }
    });

  it('les lieux fixes prennent leur place : une île pacifiée rend des lieux à prendre', () => {
    const conquest = mapQuota(OUT, 9);
    const pacified = mapQuota(OUT, 6);
    expect(conquest.pois + conquest.rifts).toBe(target - 9);
    expect(pacified.pois + pacified.rifts).toBe(target - 6);
    expect(pacified.pois).toBeGreaterThan(conquest.pois);
  });

  it('la carte ordinaire ne bouge pas', () => {
    expect(mapQuota(7)).toEqual({ pois: 16, rifts: 6, econ: 11, extra: 5 });
    expect(mapQuota(3)).toEqual({ pois: 12, rifts: 4, econ: 8, extra: 4 });
  });
});
