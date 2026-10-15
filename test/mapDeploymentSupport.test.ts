import { describe, expect, it } from 'vitest';
import { CHAMPIONS } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';
import { attackSupport } from '@/lib/caravan';
import { skillValue, type SkillId } from '@/lib/skillRunes';
import {
  deployEasyLevel,
  planStations,
  type DeployDeps,
  type DeploySpot,
  type DeployUnit,
} from '@/lib/mapDeployment';

/** 🧭 « RÉPARTIR » AVEC LES SOUTIENS (2026-10-15, demandé : « des garnisons les plus efficaces et
 *  fortes possibles pour couvrir le plus de carte, attaquer le plus de lieux et avec la meilleure
 *  vitesse »). Vitesse par garnison, objectif mixte, soutiens d'attaque étalés. */

// Une île en ligne : points 0..10, 10 min par unité de distance.
const PTS = Array.from({ length: 11 }, (_, i) => i);
const u = (id: string, power: number): DeployUnit => ({ id, power, loc: 'base', hero: false });
const spot = (id: string, seats: number): DeploySpot => ({ id, seats, heroOk: true });
const SPOTS = [spot('base', Infinity), spot('ouest', 2), spot('est', 2)];
const XS: Record<string, number> = { base: -30, ouest: 2, est: 8 };
const trip = (s: string, p: number) => 10 * Math.abs(XS[s]! - PTS[p]!);
const run = (units: DeployUnit[], deps: Partial<DeployDeps>, easyForce?: number, force = 10) =>
  planStations(units, SPOTS, PTS.length, {
    force,
    ...(easyForce ? { easyForce } : {}),
    deps: { trip, ...deps },
  });

describe('🧭 la vitesse est propre à chaque garnison', () => {
  // Deux porteurs 🧭 parmi quatre champions de même force, et un lieu dur qui demande les DEUX
  // garnisons (l'attaque combinée part avec la plus lente) : un porteur dans chacune.
  const team = [u('v1', 5), u('v2', 5), u('a1', 5), u('a2', 5)];
  const fast = new Set(['v1', 'v2']);
  const keep = (m: readonly DeployUnit[]) => m.reduce((k, x) => k * (fast.has(x.id) ? 0.7 : 1), 1);

  it('les porteurs de vitesse sont étalés sur les garnisons', () => {
    const r = run(team, { keep }, undefined, 20);
    expect(r.spotOf.get('v1')).not.toBe(r.spotOf.get('v2'));
    expect(new Set([r.spotOf.get('v1'), r.spotOf.get('v2')])).toEqual(new Set(['ouest', 'est']));
  });

  it('le temps rendu tient compte de la vitesse', () => {
    const slow = run(team, {});
    const quick = run(team, { keep });
    expect(quick.reach).toBeLessThan(slow.reach);
  });
});

describe('⛑️🎓🐫 les soutiens d’attaque sont étalés', () => {
  const team = [u('s1', 5), u('s2', 5), u('a1', 5), u('a2', 5)];
  const helpers = new Set(['s1', 's2']);
  // Rendement décroissant, comme `attackSupport`.
  const support = (m: readonly DeployUnit[]) => {
    const n = m.filter((x) => helpers.has(x.id)).length;
    return n / (n + 1);
  };
  it('un soutien par garnison plutôt que deux au même endroit', () => {
    const r = run(team, { support }, 10);
    expect(r.spotOf.get('s1')).not.toBe(r.spotOf.get('s2'));
  });
});

describe('🌱 objectif mixte : chaque garnison peut prendre seule un lieu facile', () => {
  // Quatre champions de force 3 : sans objectif mixte, la force (10) se réunit depuis plusieurs
  // garnisons ; avec un lieu facile à 6, chaque garnison occupée doit pouvoir le prendre seule.
  const team = [u('a', 3), u('b', 3), u('c', 3), u('d', 3)];
  const spots = [spot('base', Infinity), spot('ouest', 3), spot('centre', 3), spot('est', 3)];
  const xs: Record<string, number> = { base: -30, ouest: 1, centre: 5, est: 9 };
  const go = (easyForce?: number) =>
    planStations(team, spots, PTS.length, {
      force: 10,
      ...(easyForce ? { easyForce } : {}),
      deps: { trip: (s, p) => 10 * Math.abs(xs[s]! - PTS[p]!) },
    });
  const powerBySpot = (r: ReturnType<typeof go>) => {
    const m = new Map<string, number>();
    for (const x of team) m.set(r.spotOf.get(x.id)!, (m.get(r.spotOf.get(x.id)!) ?? 0) + x.power);
    return m;
  };

  it('avec un lieu facile, aucune garnison n’est trop faible pour partir seule', () => {
    for (const pw of powerBySpot(go(6)).values()) expect(pw).toBeGreaterThanOrEqual(6);
  });

  it('sans objectif mixte, on éparpille davantage (la règle change bien quelque chose)', () => {
    const counts = [...powerBySpot(go()).values()];
    expect(counts.some((pw) => pw < 6)).toBe(true);
  });
});

describe('🌱 deployEasyLevel — le bas du rang du joueur, borné par l’île', () => {
  it('le début du rang', () => {
    expect(deployEasyLevel(33, 21, 40)).toBe(31); // Or noir : à partir du niveau 31
    expect(deployEasyLevel(33, 35, 40)).toBe(35); // plancher de l'île
    expect(deployEasyLevel(45, 1, 38)).toBe(38); // plafond de l'île
  });
});

describe('⛑️🎓🐫 attackSupport — la règle des missions, à rendement décroissant', () => {
  const champ = (n: string, skills: { id: SkillId; level: number }[] = []): Adventurer => ({
    id: n,
    name: n,
    seed: 1,
    path: [],
    level: 20,
    xp: 0,
    championId: CHAMPIONS[0]!.id,
    copies: 1,
    skills,
  });
  it('aucun soutien, zéro', () => {
    expect(attackSupport([champ('a'), champ('b')])).toBe(0);
    expect(attackSupport([])).toBe(0);
  });
  it('chaque soutien compte, lu sur la valeur de sa rune', () => {
    const heal = attackSupport([champ('a', [{ id: 'care', level: 5 }])]);
    expect(heal).toBeCloseTo(skillValue('care', 5) / 100 / 3, 9);
    expect(attackSupport([champ('a', [{ id: 'mentor', level: 3 }])])).toBeGreaterThan(0);
    expect(attackSupport([champ('a', [{ id: 'haul', level: 3 }])])).toBeGreaterThan(0);
  });
  it('un second porteur au même endroit ajoute moins qu’un premier', () => {
    const one = attackSupport([champ('a', [{ id: 'mentor', level: 3 }]), champ('b')]);
    const two = attackSupport([
      champ('a', [{ id: 'mentor', level: 3 }]),
      champ('b', [{ id: 'mentor', level: 3 }]),
    ]);
    expect(two - one).toBeLessThan(one);
  });
});
