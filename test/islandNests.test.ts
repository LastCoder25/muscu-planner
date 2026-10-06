import { describe, expect, it } from 'vitest';
import { archipelOn, islandPacified, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, routePerilous, type ExpeditionMap, type Poi } from '@/lib/expedition';
import { controlRoster, ensureControls, garrisonDots, holdSeats } from '@/lib/controlPoints';
import { heroCanStay } from '@/lib/party';
import {
  FORTRESS_ID,
  NEST,
  nestLevel,
  nestThreshold,
  heldNests,
  takeObjective,
  nestSpot,
  ensureIslandConquest,
  islandConquest,
  razeIslandTarget,
  takeFortress,
} from '@/lib/islandConquest';
import { onIsland } from '@/lib/islandTerrain';
import { FIELD_ARMY, syncFieldArmies } from '@/lib/fieldArmy';
import { islandView } from '@/lib/islandShape';

const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 86_400_000;
const LV = 30;

function islandMap(id: number, seed = 5): ExpeditionMap {
  const m = createMap(seed, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, LV, ISLAND_OUTPOST_LEVEL), NOW, LV);
}
const tick = (m: ExpeditionMap, t: number) => ensureIslandConquest(m, t, LV);
const nests = (m: ExpeditionMap): Poi[] =>
  m.pois.filter((p) => p.control?.kind === 'objective' && p.control.owner === 'enemy');

/** `n` sorties sur la carte, une seconde d'écart, à partir de `t0`, puis un tick. */
function sorties(m: ExpeditionMap, n: number, t0 = NOW + 1000): ExpeditionMap {
  const dep = Array.from({ length: n }, (_, k) => t0 + k * 1000);
  return tick({ ...m, departures: [...(m.departures ?? []), ...dep] }, t0 + n * 1000);
}

describe('🪺 un nid apparaît toutes les 5 à 10 sorties sur la carte', () => {
  it('le seuil est tiré entre 5 et 10, et toutes les valeurs sortent', () => {
    const seen = new Set<number>();
    for (let n = 0; n < 200; n++) {
      const k = nestThreshold(5, n);
      expect(k).toBeGreaterThanOrEqual(NEST.departuresMin);
      expect(k).toBeLessThanOrEqual(NEST.departuresMax);
      seen.add(k);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
  });
  it('jamais avant le seuil, toujours dès qu’il est atteint', () => {
    const m = islandMap(2);
    expect(nests(m)).toHaveLength(3);
    const k = nestThreshold(m.seed, 0);
    expect(nests(sorties(m, k - 1))).toHaveLength(3);
    expect(nests(sorties(m, k))).toHaveLength(4);
    // Au moins un nid par paquet de 5, au plus un par paquet de 3.
    const born = nests(sorties(m, 30)).length - 3;
    expect(born).toBeGreaterThanOrEqual(30 / NEST.departuresMax);
    expect(born).toBeLessThanOrEqual(30 / NEST.departuresMin);
  });
  it('le compteur se garde d’un tick à l’autre', () => {
    let m = islandMap(2);
    const k = nestThreshold(m.seed, 0);
    m = sorties(m, k - 1);
    m = sorties(m, 1, NOW + DAY);
    expect(nests(m)).toHaveLength(4);
  });
  it('les sorties d’avant la règle ne comptent pas', () => {
    const fresh = createMap(5, NOW, LV, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(2));
    const past = [NOW - 5000, NOW - 4000, NOW - 3000, NOW - 2000, NOW - 1000];
    const m = ensureIslandConquest(
      { ...ensureControls(fresh, NOW, LV, ISLAND_OUTPOST_LEVEL), departures: past },
      NOW,
      LV,
    );
    // Deux ticks : le premier pose le point de départ, le second compterait les sorties.
    expect(nests(tick(m, NOW + 1000))).toHaveLength(3);
  });
  it('6 nids nés au plus ; la même carte au tick suivant', () => {
    const m = sorties(islandMap(2), 40 * NEST.departuresMax);
    expect(nests(m)).toHaveLength(3 + NEST.cap);
    expect(tick(m, NOW + 999 * 1000)).toBe(m);
  });
  it('les nids naissent sur la terre, à 10 unités au moins des autres lieux fixes', () => {
    for (const seed of [1, 5, 9, 13]) {
      const m = sorties(islandMap(2, seed), 40 * NEST.departuresMax);
      const fixed = m.pois.filter((p) => p.control);
      for (const n of nests(m)) {
        expect(onIsland(2, n.x, n.y, 6), n.id).toBe(true);
        for (const o of fixed)
          if (o.id !== n.id)
            expect(Math.hypot(n.x - o.x, n.y - o.y), `${n.id}/${o.id}`).toBeGreaterThanOrEqual(10);
      }
    }
  });
  it('rien hors de l’île 2', () => {
    const m = sorties(islandMap(1), 40 * NEST.departuresMax);
    expect(m.archipel!.nests ?? []).toEqual([]);
  });
});

describe('🪺 un nid qui apparaît envoie son armée sur le lieu tenu le plus proche', () => {
  /** L'île 2 avec un lieu fixe tenu, attaqué dans 10 jours. */
  function heldMap(): { m: ExpeditionMap; id: string } {
    const m = islandMap(2);
    const p = m.pois.find((q) => q.control && !q.id.startsWith('isl_'))!;
    const held: ExpeditionMap = {
      ...m,
      pois: m.pois.map((q) =>
        q.id === p.id
          ? {
              ...q,
              control: {
                ...q.control!,
                owner: 'player',
                garrison: ['a'],
                attackAt: NOW + 10 * DAY,
              },
            }
          : q,
      ),
    };
    return { m: held, id: p.id };
  }
  /** Le nid né sur la k-ième sortie, et le point visé. */
  function strike() {
    const { m, id } = heldMap();
    const t0 = NOW + 1000;
    const k = nestThreshold(m.seed, 0);
    const after = sorties(m, k, t0);
    const born = t0 + (k - 1) * 1000;
    const nest = after.archipel!.nests![0]!;
    const p = after.pois.find((q) => q.id === id)!;
    const march = (Math.hypot(p.x - nest.x, p.y - nest.y) / FIELD_ARMY.speedPerHour) * 3_600_000;
    return { after, id, born, nest, p, march };
  }
  it('l’armée part du nid après une attente tirée au hasard, puis marche jusqu’au lieu', () => {
    const { born, nest, p, march } = strike();
    const at = p.control!.attackAt!;
    expect(at).toBeGreaterThanOrEqual(born + NEST.strikeWaitMinMs + march - 1);
    expect(at).toBeLessThanOrEqual(born + NEST.strikeWaitMaxMs + march + 1);
    expect(p.control!.raidFrom).toEqual({ x: nest.x, y: nest.y, at });
  });
  it('l’attente change d’un nid à l’autre', () => {
    const waits = new Set<number>();
    for (const seed of [1, 5, 9, 13, 21]) {
      const m = islandMap(2, seed);
      const p = m.pois.find((q) => q.control && !q.id.startsWith('isl_'))!;
      const held = {
        ...m,
        pois: m.pois.map((q) =>
          q.id === p.id
            ? {
                ...q,
                control: {
                  ...q.control!,
                  owner: 'player' as const,
                  garrison: ['a'],
                  attackAt: NOW + 10 * DAY,
                },
              }
            : q,
        ),
      };
      const after = sorties(held, NEST.departuresMax);
      const nest = after.archipel!.nests![0]!;
      const q = after.pois.find((x) => x.id === p.id)!;
      const march = (Math.hypot(q.x - nest.x, q.y - nest.y) / FIELD_ARMY.speedPerHour) * 3_600_000;
      waits.add(Math.round((q.control!.attackAt! - nest.at - march) / 60_000));
    }
    expect(waits.size).toBeGreaterThan(1);
  });
  it('on la voit venir DU NID dans le rayon de détection, interceptable', () => {
    const { after, id, nest, p } = strike();
    const at = p.control!.attackAt!;
    const map = syncFieldArmies(after, {
      raid: null,
      detectR: 1000,
      reach: 1000,
      now: at - 60_000,
      playerLevel: LV,
    });
    const army = map.pois.find((q) => q.type === 'warband' && q.army?.targetId === id)!;
    expect(army).toBeTruthy();
    expect(army.from).toEqual({ x: nest.x, y: nest.y });
  });
  it('l’attaque suivante, ordinaire, ne part plus du nid', () => {
    const { after, id, nest } = strike();
    const later = NOW + 20 * DAY;
    const next: ExpeditionMap = {
      ...after,
      pois: after.pois.map((q) =>
        q.id === id ? { ...q, control: { ...q.control!, attackAt: later } } : q,
      ),
    };
    const map = syncFieldArmies(next, {
      raid: null,
      detectR: 1000,
      reach: 1000,
      now: later - 60_000,
      playerLevel: LV,
    });
    const army = map.pois.find((q) => q.type === 'warband' && q.army?.targetId === id)!;
    expect(army.from).not.toEqual({ x: nest.x, y: nest.y });
  });
  it('une attaque déjà plus proche n’est jamais retardée', () => {
    const { m, id } = heldMap();
    const soon: ExpeditionMap = {
      ...m,
      pois: m.pois.map((q) =>
        q.id === id ? { ...q, control: { ...q.control!, attackAt: NOW + 2000 } } : q,
      ),
    };
    const after = sorties(soon, NEST.departuresMax);
    const c = after.pois.find((p) => p.id === id)!.control!;
    expect(c.attackAt).toBe(NOW + 2000);
    expect(c.raidFrom).toBeUndefined();
  });
});

describe('🪺 seuls les nids d’origine et la forteresse comptent pour pacifier', () => {
  it('pacifiée malgré les nids nés : ils disparaissent et n’apparaissent plus', () => {
    let m = sorties(islandMap(2), 3 * NEST.departuresMax);
    expect(nests(m).length).toBeGreaterThanOrEqual(6);
    expect(islandConquest(m)!.objectivesTotal).toBe(3);
    for (const id of ['isl_obj_0', 'isl_obj_1', 'isl_obj_2'])
      m = razeIslandTarget(m, id, NOW + DAY);
    m = takeFortress(m, ['a'], false, NOW + DAY);
    expect(islandPacified(m)).toBe(true);
    expect(nests(m)).toHaveLength(0);
    const born = m.archipel!.nests!.length;
    m = sorties(m, 3 * NEST.departuresMax, NOW + 2 * DAY);
    expect(nests(m)).toHaveLength(0);
    // Plus aucune apparition, même invisible.
    expect(m.archipel!.nests!).toHaveLength(born);
    expect(m.pois.find((p) => p.id === FORTRESS_ID)!.control!.owner).toBe('player');
  });
});

describe('🪺 routes dangereuses autour des nids', () => {
  it('les lieux à portée d’un nid sont périlleux ; le nid abattu, la marque tombe', () => {
    let m = islandMap(2, 9);
    for (let d = 1; d <= 2; d++) m = tick(m, NOW + d * 3600_000);
    const near = (x: ExpeditionMap) =>
      x.pois.filter(
        (p) =>
          !p.id.startsWith('isl_') &&
          nests(x).some((n) => Math.hypot(p.x - n.x, p.y - n.y) <= NEST.radius),
      );
    expect(near(m).length).toBeGreaterThan(0);
    for (const p of near(m)) expect(routePerilous(p)).toBe(true);
    for (const p of m.pois.filter((q) => !near(m).includes(q))) expect(!!p.nestPeril).toBe(false);
    for (const n of nests(m)) m = razeIslandTarget(m, n.id, NOW + DAY);
    m = tick(m, NOW + DAY);
    expect(m.pois.some((p) => p.nestPeril)).toBe(false);
  });
  it('rien sur l’île 1', () => {
    const m = tick(islandMap(1), NOW + 3600_000);
    expect(m.pois.some((p) => p.nestPeril)).toBe(false);
  });
});

// 🪺 Demandé (2026-10-06) : « les nids qui apparaissent sur l'île 2 : un niveau qui varie du
// minimum de la carte au maximum de la carte ».
describe('🪺 le niveau des nids couvre toute l’île', () => {
  const isl = { minLevel: 21, maxLevel: 40 };
  it('tiré entre le minimum et le maximum de l’île, sur toute la plage', () => {
    const all = Array.from({ length: 400 }, (_, i) => nestLevel(i, 7, isl));
    expect(Math.min(...all)).toBe(21);
    expect(Math.max(...all)).toBe(40);
    // Chaque niveau de la plage sort (pas de tirage collé à un bout).
    expect(new Set(all).size).toBe(20);
  });
  it('déterministe : le même nid garde son niveau, une autre carte en tire d’autres', () => {
    expect(nestLevel(4, 7, isl)).toBe(nestLevel(4, 7, isl));
    const a = Array.from({ length: 12 }, (_, i) => nestLevel(i, 7, isl));
    const b = Array.from({ length: 12 }, (_, i) => nestLevel(i, 8, isl));
    expect(a).not.toEqual(b);
  });
  it('sur la carte, le niveau du joueur n’y change rien', () => {
    const lv = (m: ExpeditionMap) =>
      nests(m)
        .map((p) => p.level)
        .sort((a, b) => a - b);
    const m21 = ensureIslandConquest(islandMap(2), NOW, 21);
    for (const l of lv(m21)) expect(l).toBeGreaterThanOrEqual(21);
    for (const l of lv(m21)) expect(l).toBeLessThanOrEqual(40);
    expect(lv(ensureIslandConquest(m21, NOW, 35))).toEqual(lv(m21));
  });
});

describe('🪺 un nid pris est abattu, jamais tenu', () => {
  it('il quitte la carte, personne n’y reste, et il ne revient pas', () => {
    const m = islandMap(2);
    const nest = nests(m)[0]!;
    expect(nest.control!.razes).toBe(true);
    expect(holdSeats(nest.control!)).toBe(0);
    expect(heroCanStay(nest)).toBe(false);
    const taken = takeObjective(m, nest.id, ['a', 'b'], NOW + DAY);
    expect(taken.pois.some((p) => p.id === nest.id)).toBe(false);
    expect(tick(taken, NOW + DAY + 1).pois.some((p) => p.id === nest.id)).toBe(false);
  });
  it('aucun point de garnison sous un nid, même quand on l’attaque', () => {
    const m = islandMap(2);
    const all = nests(m);
    const rows = controlRoster(
      m,
      all.map((n) => ({ poiId: n.id, midAt: NOW + DAY, ids: ['a', 'b', 'c'] })),
      NOW,
      LV,
    ).filter((r) => r.kind === 'objective');
    expect(rows).toHaveLength(all.length);
    for (const r of rows) {
      expect(r.status, r.poi.id).toBe('assault');
      expect(r.seats, r.poi.id).toBe(0);
      expect(garrisonDots(r), r.poi.id).toBe('');
    }
  });
  it('ailleurs, un objectif pris se tient toujours', () => {
    const m = islandMap(1);
    const obj = nests(m)[0]!;
    expect(obj.control!.razes).toBeUndefined();
    expect(holdSeats(obj.control!)).toBeGreaterThan(0);
    const taken = takeObjective(m, obj.id, ['a'], NOW + DAY);
    expect(taken.pois.find((p) => p.id === obj.id)?.control?.owner).toBe('player');
  });
  it('un nid TENU d’avant la règle : sa garnison est rappelée, puis il quitte la carte', () => {
    const m = islandMap(2);
    const nest = nests(m)[0]!;
    // L'ancienne règle : pris, il se tenait (on rejoue la prise d'avant).
    const held: ExpeditionMap = {
      ...razeIslandTarget(m, nest.id, NOW),
      pois: [
        ...razeIslandTarget(m, nest.id, NOW).pois,
        {
          ...nest,
          control: { ...nest.control!, razes: undefined, owner: 'player', garrison: ['a'] },
        },
      ],
    };
    expect(heldNests(held).map((p) => p.id)).toEqual([nest.id]);
    // Garnison encore là : il reste (le store la rappelle d'abord).
    expect(tick(held, NOW + 1).pois.some((p) => p.id === nest.id)).toBe(true);
    const empty: ExpeditionMap = {
      ...held,
      pois: held.pois.map((p) =>
        p.id === nest.id ? { ...p, control: { ...p.control!, garrison: [] } } : p,
      ),
    };
    expect(heldNests(empty)).toEqual([]);
    expect(tick(empty, NOW + 1).pois.some((p) => p.id === nest.id)).toBe(false);
  });
});

describe('🪺 la place d’un nid', () => {
  it('aucune place à 10 unités des autres : pas de nid (jamais posé sur un autre)', () => {
    const m = islandMap(2);
    const crowd: Poi[] = [];
    // Toute la fenêtre de l'île : elle s'étend devant le village du port (v1.29.0).
    const v = islandView(2, 110);
    for (let x = v.x; x <= v.x + v.size; x += 6)
      for (let y = v.y; y <= v.y + v.size; y += 6)
        crowd.push({ ...m.pois.find((p) => p.control)!, id: `c${x}_${y}`, x, y });
    expect(nestSpot({ pois: crowd }, 2, [])).toBeNull();
    expect(nestSpot(m, 2, [])).not.toBeNull();
  });
});
