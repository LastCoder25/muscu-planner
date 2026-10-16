import { describe, expect, it } from 'vitest';
import {
  DEPLOY_STOCK_SHARE,
  DEPLOY_TARGET_SHARE,
  planStations,
  type DeploySpot,
  type DeployTune,
  type DeployUnit,
} from '@/lib/mapDeployment';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { ensureControls } from '@/lib/controlPoints';
import {
  deployTargetsOf,
  ensureIslandConquest,
  FORTRESS_ID,
  razeIslandTarget,
  takeObjective,
} from '@/lib/islandConquest';
import { buildDeployment, waitingWeights } from '@/lib/deployPlan';
import { CHAMPIONS } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';

/**
 * 🗺️🎯 « RÉPARTIR » : LES LIEUX QUI ATTENDENT ET LES OBJECTIFS ENNEMIS (2026-10-16, demandé :
 * « la priorité, c'est de prendre des lieux sur la carte ; entre mes lieux fixes et la base
 * presque plus rien, entre la forteresse et mes lieux fixes beaucoup » et « des effectifs pas
 * trop loin des objectifs ennemis »).
 */
const PTS = Array.from({ length: 11 }, (_, i) => i);
const u = (id: string, power: number): DeployUnit => ({ id, power, loc: 'base', hero: false });
const spot = (id: string, seats: number): DeploySpot => ({ id, seats, heroOk: true });
const SPOTS = [spot('base', Infinity), spot('ouest', 5), spot('est', 5)];
const XS: Record<string, number> = { base: -10, ouest: 1, est: 9 };
const trip = (s: string, p: number) => 10 * Math.abs(XS[s]! - PTS[p]!);
const RAW: DeployTune = { easyK: 1, hardK: 1, guard: null };
const team = Array.from({ length: 4 }, (_, i) => u(`c${i}`, 5));

/** La force postée à chaque endroit. */
const powerAt = (r: ReturnType<typeof planStations>) => {
  const m = new Map<string, number>();
  for (const x of team) m.set(r.spotOf.get(x.id)!, (m.get(r.spotOf.get(x.id)!) ?? 0) + x.power);
  return m;
};

describe('🗺️ les lieux qui attendent tirent les garnisons vers eux', () => {
  // Tous les lieux à prendre sont à l'est (les plus proches de la ville ont été pris).
  const east = PTS.map((p) => (p >= 8 ? 3 : 0));
  const go = (pointWeights?: number[], tune: DeployTune = {}) =>
    planStations(team, SPOTS, PTS.length, {
      force: 20,
      easyForce: 5,
      ...(pointWeights ? { pointWeights } : {}),
      deps: { trip },
      tune: { ...RAW, ...tune },
    });

  it('plus de force à l’est quand les lieux y attendent', () => {
    const flat = powerAt(go()).get('est') ?? 0;
    const pulled = powerAt(go(east)).get('est') ?? 0;
    expect(pulled).toBeGreaterThan(flat);
  });

  it('le temps rendu pour les lieux qui attendent baisse, sans eux il vaut celui de l’île', () => {
    const flat = go();
    expect(flat.stockReach).toBe(flat.reach);
    const pulled = go(east);
    // Mesuré avec les MÊMES lieux : la répartition qui les vise les atteint plus vite.
    const blind = go(east, { stockShare: 0 });
    expect(pulled.stockReach).toBeLessThan(blind.stockReach);
  });

  it('aucun lieu en attente : la répartition est celle d’avant', () => {
    expect([...go(PTS.map(() => 0)).spotOf]).toEqual([...go().spotOf]);
  });

  it('le réglage mesuré', () => {
    expect(DEPLOY_STOCK_SHARE).toBe(0.7);
    expect(DEPLOY_TARGET_SHARE).toBe(0.15);
  });
});

describe('🎯 une garnison pas trop loin des objectifs ennemis', () => {
  // Un lieu tenu ÉCARTÉ (x = 30), loin de toute la carte, à côté d'un objectif (x = 32) : la
  // couverture seule n'y poste personne.
  const xs: Record<string, number> = { ...XS, poste: 30 };
  const spots = [...SPOTS, spot('poste', 5)];
  const go = (tune: DeployTune = {}) =>
    planStations(team, spots, PTS.length, {
      force: 20,
      easyForce: 5,
      targets: 1,
      deps: {
        trip: (s, p) => 10 * Math.abs(xs[s]! - PTS[p]!),
        targetTrip: (s) => 10 * Math.abs(xs[s]! - 32),
      },
      tune: { ...RAW, ...tune },
    });

  it('une garnison va près de l’objectif', () => {
    expect(powerAt(go({ targetShare: 0 })).get('poste') ?? 0).toBe(0);
    expect(powerAt(go()).get('poste') ?? 0).toBeGreaterThan(0);
    expect(go().targetReach[0]!).toBeLessThan(go({ targetShare: 0 }).targetReach[0]!);
  });

  it('une garnison suffit : le reste du vivier couvre la carte', () => {
    expect(powerAt(go()).get('poste')!).toBe(5);
  });
});

describe('🎯 deployTargetsOf — les objectifs ennemis, présents ou éteints', () => {
  const NOW = Date.UTC(2026, 9, 16, 12);
  const LV = 50;
  function island3(): ExpeditionMap {
    const m = createMap(5, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(3));
    return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
  }

  it('les objectifs sur la carte, pas la forteresse', () => {
    const ids = deployTargetsOf(island3()).map((t) => t.id);
    expect(ids.sort()).toEqual(['isl_obj_0', 'isl_obj_1', 'isl_obj_2']);
    expect(ids).not.toContain(FORTRESS_ID);
  });

  it('un objectif éteint compte toujours, à sa place', () => {
    const m = ensureIslandConquest(razeIslandTarget(island3(), 'isl_obj_0', NOW), NOW, LV);
    expect(m.pois.some((p) => p.id === 'isl_obj_0')).toBe(false);
    const t = deployTargetsOf(m).find((x) => x.id === 'isl_obj_0')!;
    expect(t).toBeDefined();
    expect(t.x).toBe(m.archipel!.embers!['isl_obj_0']!.x);
  });

  it('waitingWeights : chaque lieu à prendre sur son point le plus proche, ni lieu fixe ni armée', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const w = waitingWeights(
      [
        { type: 'camp', x: 1, y: 1 },
        { type: 'mine', x: 9, y: 0 },
        { type: 'lair', x: 12, y: 0 },
        { type: 'control', x: 20, y: 0 },
        { type: 'warband', army: { kind: 'raid' }, x: 20, y: 0 },
      ] as Parameters<typeof waitingWeights>[0],
      pts,
    );
    expect(w).toEqual([1, 2, 0]);
    expect(waitingWeights([{ type: 'camp', x: 0, y: 0 }], [])).toEqual([]);
  });

  it('« Répartir » compte les lieux qui attendent sur la vraie carte', () => {
    const champ = (n: string): Adventurer => ({
      id: n,
      name: n,
      seed: 1,
      path: [],
      level: 45,
      xp: 0,
      championId: CHAMPIONS[0]!.id,
      copies: 1,
      skills: [],
    });
    const m = island3();
    const free = m.pois.filter((p) => p.type !== 'control');
    expect(free.length).toBeGreaterThan(0);
    const out = buildDeployment({
      map: m,
      atBase: ['a', 'b', 'c'].map(champ),
      garrisons: new Map<string, Adventurer[]>(),
      hero: null,
      road: { advGear: [] },
      heroLevel: LV,
      travelMult: 1,
      outpostLevel: ISLAND_OUTPOST_LEVEL,
    })!;
    // Pesé par ces lieux-là, le temps n'est plus celui de l'île entière.
    expect(out.plan.stockReach).not.toBe(out.plan.reach);
    expect(out.plan.targetReach).toHaveLength(3);
  });

  it('un objectif tenu n’en est pas un ; hors archipel, aucun', () => {
    // Île 4 : un objectif pris se tient.
    const m0 = createMap(5, NOW, 70, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(4));
    const m = ensureIslandConquest(ensureControls(m0, NOW, 70, ISLAND_OUTPOST_LEVEL), NOW, 70);
    const held = takeObjective(m, 'isl_obj_0', ['a'], NOW);
    expect(deployTargetsOf(held).map((t) => t.id)).not.toContain('isl_obj_0');
    expect(deployTargetsOf(createMap(5, NOW, 30, 1))).toEqual([]);
  });
});
