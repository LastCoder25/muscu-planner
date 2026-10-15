import { describe, expect, it } from 'vitest';
import { planStations, type DeploySpot, type DeployUnit } from '@/lib/mapDeployment';
import { deployAnchors } from '@/lib/controlRoutes';
import { advHealCost, healableForDeploy } from '@/lib/raid';
import { buildDeployment } from '@/lib/deployPlan';
import type { ExpeditionMap } from '@/lib/expedition';
import { CHAMPIONS } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';
import { gearedFighter } from './helpers/gearedFighter';

/**
 * ⏳ « Répartir » quand tout l'effectif n'est pas rentré (2026-10-15, demandé) : ceux qu'on ne
 * peut pas bouger restent où ils seront, y comptent, y prennent leur place ; on place les autres.
 */
const PTS = Array.from({ length: 11 }, (_, i) => i);
const XS: Record<string, number> = { base: 0, A: 3, B: 10 };
const deps = { trip: (s: string, p: number) => 10 * Math.abs(XS[s]! - PTS[p]!) };
const spots: DeploySpot[] = [
  { id: 'base', seats: Infinity, heroOk: true },
  { id: 'A', seats: 1, heroOk: true },
  { id: 'B', seats: 1, heroOk: true },
];
const unit = (id: string, loc: string, fixed = false): DeployUnit => ({
  id,
  hero: false,
  loc,
  power: 10,
  ...(fixed ? { fixed } : {}),
});
const plan = (units: DeployUnit[]) =>
  planStations(units, spots, PTS.length, { force: 10 / 0.6, deps });

describe('répartition avec des immobiles', () => {
  it('un immobile reste à sa place et la prend : le libre va ailleurs', () => {
    const r = plan([unit('f', 'A', true), unit('m', 'base')]);
    expect(r.spotOf.get('f')).toBe('A');
    expect(r.spotOf.get('m')).toBe('B');
    expect(r.moves.map((m) => m.unit.id)).toEqual(['m']);
  });

  it('l’immobile COMPTE : sans lui, le libre ne serait pas allé au bout de l’île', () => {
    const alone = plan([unit('m', 'base')]);
    expect(alone.spotOf.get('m')).toBe('A');
  });

  it('un immobile hors des endroits de la répartition est ignoré, sans déplacement', () => {
    const r = plan([unit('f', 'ailleurs', true), unit('m', 'base')]);
    expect(r.moves.some((m) => m.unit.id === 'f')).toBe(false);
    expect(r.spotOf.has('f')).toBe(false);
  });
});

const champ = (id: string, more: Partial<Adventurer> = {}): Adventurer => ({
  id,
  name: id,
  seed: 1,
  path: [],
  level: 30,
  xp: 0,
  championId: CHAMPIONS[0]!.id,
  copies: 1,
  ...more,
});

describe('deployAnchors — où seront ceux qu’on ne peut pas bouger', () => {
  const map = {
    pois: [
      {
        id: 'P',
        control: {
          owner: 'player',
          garrison: ['g', 'mil:1'],
          reinforcing: [{ id: 'r', at: 0 }],
          away: ['s'],
        },
      },
      { id: 'Q', control: { owner: 'enemy', garrison: ['e'] } },
    ],
  } as unknown as ExpeditionMap;
  it('garnison, renfort et sortie : leur point ; les autres : la base', () => {
    const advs = ['g', 'r', 's', 'b', 'e', 'ok'].map((id) => champ(id));
    const out = deployAnchors(map, advs, new Set(['ok']));
    expect(Object.fromEntries(out.map((x) => [x.adv.id, x.loc]))).toEqual({
      g: 'P',
      r: 'P',
      s: 'P',
      b: 'base',
      e: 'base',
    });
  });
  it('les champions d’une autre île ne comptent pas', () => {
    expect(deployAnchors(map, [champ('x', { elsewhere: 2 })], new Set())).toEqual([]);
  });
});

describe('buildDeployment avec des immobiles', () => {
  const hero = { name: 'H', level: 30, combatant: gearedFighter(30) };
  const input = (atBase: Adventurer[], fixed: Adventurer[], heroFixed: boolean) => ({
    map: null,
    atBase,
    garrisons: new Map<string, Adventurer[]>(),
    fixed: fixed.map((adv) => ({ adv, loc: 'base' })),
    hero: { party: hero, loc: 'base', ...(heroFixed ? { fixed: true } : {}) },
    road: { advGear: [] },
    heroLevel: 30,
    travelMult: 1,
    outpostLevel: 1,
  });
  it('les immobiles sont dans le plan mais jamais déplacés', () => {
    const out = buildDeployment(input([champ('a')], [champ('f')], true))!;
    expect(out.units.find((u) => u.id === 'f')!.fixed).toBe(true);
    expect(out.plan.moves.every((m) => !m.unit.fixed)).toBe(true);
  });
  it('personne de libre : rien à proposer', () => {
    expect(buildDeployment(input([], [champ('f')], true))).toBeNull();
  });
});

describe('healableForDeploy — qui un soin rendrait disponible', () => {
  const now = 1_000_000;
  it('blessés libres seulement, avec le prix de l’Infirmerie', () => {
    const advs = [
      champ('blesse', { hurtUntil: now + 3_600_000 }),
      champ('enRoute', { hurtUntil: now + 3_600_000, busyUntil: now + 60_000 }),
      champ('ailleurs', { hurtUntil: now + 3_600_000, elsewhere: 2 }),
      champ('sain'),
    ];
    const h = healableForDeploy(advs, now, 30);
    expect(h.advs.map((a) => a.id)).toEqual(['blesse']);
    expect(h.cost).toBe(advHealCost(advs[0]!, now, 30));
    expect(h.cost).toBeGreaterThan(0);
  });
});
