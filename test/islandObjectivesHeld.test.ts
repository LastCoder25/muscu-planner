import { describe, expect, it } from 'vitest';
import { ISLAND_OUTPOST_LEVEL, archipelOn } from '@/lib/archipelago';
import { createMap, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { controlYieldCard, dueRetakes, ensureControls, seatsOf } from '@/lib/controlPoints';
import {
  ensureIslandConquest,
  FORTRESS_ID,
  islandConquest,
  objectiveIdOf,
  raiseDead,
  RISE,
  redirectIslandAttacks,
  regainIslandTarget,
  takeObjective,
} from '@/lib/islandConquest';

/**
 * 🏳️ ÉTAPE 6 BIS (décisions de l'utilisateur, 2026-10-02) : les objectifs d'une île SE
 * TIENNENT une fois pris, la forteresse vient les récupérer EN PRIORITÉ, puis les lieux fixes.
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;

function island(id: number): ExpeditionMap {
  const lv = archipelOn(id).levelCap;
  const m = createMap(7, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, lv, ISLAND_OUTPOST_LEVEL), NOW, lv);
}
const poi = (m: ExpeditionMap, id: string): Poi | undefined => m.pois.find((p) => p.id === id);
const OBJ = objectiveIdOf(0);

describe('🏳️ un objectif pris se tient', () => {
  it('il reste sur la carte, à nous, avec sa garnison ; il compte comme pris', () => {
    const m = takeObjective(island(1), OBJ, ['a', 'b', 'c', 'd', 'e', 'f'], NOW);
    const o = poi(m, OBJ)!;
    expect(o.control!.owner).toBe('player');
    expect(o.control!.garrison).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(seatsOf('objective')).toBe(5);
    expect(islandConquest(m)!.objectivesDown).toBe(1);
    expect(controlYieldCard(o, NOW + H, 20)).toBeNull();
    // Le tick de la carte le garde, à nous.
    const t = ensureIslandConquest(m, NOW + H, 20);
    expect(t.pois.filter((p) => p.id === OBJ)).toHaveLength(1);
    expect(poi(t, OBJ)!.control!.owner).toBe('player');
    // Et il reçoit une attaque prévue, comme tout lieu tenu.
    const g = ensureControls(t, NOW + H, 20, ISLAND_OUTPOST_LEVEL);
    expect(poi(g, OBJ)!.control!.attackAt).toBeGreaterThan(NOW);
  });
  it('repris par l’ennemi, il recompte comme debout (la forteresse se reverrouille)', () => {
    const m = takeObjective(island(1), OBJ, ['a'], NOW);
    const back = regainIslandTarget(m, OBJ);
    expect(islandConquest(back)!.objectivesDown).toBe(0);
    expect(regainIslandTarget(back, OBJ)).toBe(back);
    expect(regainIslandTarget(m, FORTRESS_ID)).toBe(m);
  });
});

describe('🎯 la forteresse vise d’abord les objectifs qu’on tient', () => {
  /** Un lieu fixe tenu, son attaque échue maintenant ; l'objectif 0 tenu, attaque lointaine. */
  function setup(): ExpeditionMap {
    const m0 = takeObjective(island(1), OBJ, ['a'], NOW);
    const fixed = m0.pois.find((p) => p.control && !p.id.startsWith('isl_'))!;
    return {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === fixed.id
          ? {
              ...p,
              control: { ...p.control!, owner: 'player', garrison: ['b'], attackAt: NOW - 1 },
            }
          : p.id === OBJ
            ? { ...p, control: { ...p.control!, attackAt: NOW + 48 * H } }
            : p,
      ),
    };
  }
  it('l’attaque échue d’un lieu fixe se reporte sur l’objectif tenu', () => {
    const m = setup();
    const fixedId = dueRetakes(m, NOW).find((p) => !p.id.startsWith('isl_'))!.id;
    const r = redirectIslandAttacks(m, NOW);
    expect(poi(r, OBJ)!.control!.attackAt).toBe(NOW - 1);
    expect(poi(r, fixedId)!.control!.attackAt).toBeGreaterThan(NOW);
    expect(dueRetakes(r, NOW).map((p) => p.id)).toEqual([OBJ]);
  });
  it('sans objectif tenu, ou île pacifiée, rien ne change', () => {
    const m = setup();
    const noObj = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === OBJ ? { ...p, control: { ...p.control!, owner: 'enemy' as const } } : p,
      ),
    };
    expect(redirectIslandAttacks(noObj, NOW)).toBe(noObj);
    const pac = { ...m, archipel: { ...m.archipel!, pacifiedAt: NOW - H } };
    expect(redirectIslandAttacks(pac, NOW)).toBe(pac);
  });
});

describe('🪦 un cimetière tenu ne se relève pas : ses morts l’attaquent', () => {
  it('il reste à nous, son attaque tombe à l’heure où il se serait relevé', () => {
    const m0 = takeObjective(island(3), OBJ, ['a'], NOW);
    const due = NOW + RISE.riseMs;
    const m = raiseDead(m0, due + 1);
    expect(poi(m, OBJ)!.control!.owner).toBe('player');
    expect(islandConquest(m)!.objectivesDown).toBe(1);
    expect(poi(m, OBJ)!.control!.attackAt).toBe(due);
    expect(m.archipel!.razedAt?.[OBJ]).toBeUndefined();
  });
});
