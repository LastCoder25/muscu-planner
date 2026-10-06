import { describe, it, expect } from 'vitest';
import {
  MILITIA,
  emptyMilitia,
  isMilitiaId,
  militiaCap,
  militiaCount,
  militiaIntervalH,
  militiaLost,
  militiaOfControl,
  militiaOnMap,
  militiaUnits,
  nextMilitiaMs,
  produceMilitia,
  returnMilitia,
  takeMilitia,
} from '@/lib/militia';
import {
  controlFreeSeats,
  garrisonHold,
  garrisonHoldChance,
  militiaFreeSeats,
  reinforceBlocker,
  settleReinforcements,
} from '@/lib/controlPoints';
import { refEscortUnits } from '@/lib/caravan';
import { offenseOf, survivalOf } from '@/lib/combat';
import type { ExpeditionMap, Poi } from '@/lib/expedition';

const H = 3_600_000;

const point = (L: number, kind: 'mine' | 'garden' = 'mine'): Poi =>
  ({
    id: `ctl_${kind}`,
    type: 'control',
    level: L,
    x: 0,
    y: 0,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 0,
    control: { kind, owner: 'player', garrison: [], retakes: 0, faction: 'bandits', size: 1 },
  }) as unknown as Poi;

describe('une garnison de 5 au plus, champions et miliciens compris', () => {
  it('pas de milicien dans les objectifs, la forteresse ni la citadelle — seulement les lieux de production', () => {
    for (const kind of ['objective', 'fortress', 'citadel'] as const) {
      const p = point(30, kind as 'mine');
      expect(militiaFreeSeats(p.control)).toBe(0);
      expect(reinforceBlocker(p.control, 1, true)).toBe('noMilitia');
    }
    expect(militiaFreeSeats(point(30).control)).toBe(MILITIA.perPoint);
  });
  it('les miliciens prennent ce qui reste des 5, champions compris', () => {
    const p = point(30);
    p.control!.garrison = ['adv_a', 'adv_b', 'mil:1'];
    p.control!.reinforcing = [{ id: 'mil:2', at: 1 }];
    expect(militiaFreeSeats(p.control)).toBe(MILITIA.perPoint - 4);
    expect(reinforceBlocker(p.control, 1, true)).toBeNull();
    expect(reinforceBlocker(p.control, 2, true)).toBeNull(); // 🛡️ v1.70 : au-delà des places, ils partent quand même (demi-tour à l'arrivée)
  });
  it('un champion n’a pas de place quand la garnison est pleine, même sous sa limite', () => {
    const p = point(30);
    p.control!.garrison = ['adv_a', 'mil:1', 'mil:2', 'mil:3', 'mil:4'];
    expect(controlFreeSeats(p.control)).toBe(0);
    expect(reinforceBlocker(p.control, 1)).toBe('full');
  });
  it('les champions gardent aussi la limite du point (3 au camp d’entraînement)', () => {
    const p = point(30, 'training' as 'mine');
    p.control!.garrison = ['adv_a', 'adv_b', 'adv_c'];
    expect(controlFreeSeats(p.control)).toBe(0);
    expect(militiaFreeSeats(p.control)).toBe(MILITIA.perPoint - 3);
  });
  it('à l’arrivée des renforts, la garnison est coupée à 5 dans l’ordre d’arrivée', () => {
    const p = point(30);
    p.control!.garrison = ['adv_a', 'adv_b', 'mil:1'];
    p.control!.reinforcing = [
      { id: 'mil:2', at: 1 },
      { id: 'adv_c', at: 2 },
      { id: 'mil:3', at: 3 },
    ];
    const map = { pois: [p] } as unknown as ExpeditionMap;
    const g = settleReinforcements(map, 10, 30).pois[0]!.control!.garrison;
    expect(g).toEqual(['adv_a', 'adv_b', 'mil:1', 'mil:2', 'adv_c']);
  });
  // ⚠️ MESURÉ (60 combats) : 5 miliciens tiennent mieux que 3 (ils valent 2,5 champions),
  // mais la tenue reste plafonnée à `CONTROL.maxHold` : jamais un point sans risque.
  it('5 miliciens tiennent mieux que 3, sans dépasser le plafond de suspense', () => {
    for (const L of [10, 60]) {
      const ids = (n: number) => Array.from({ length: n }, (_, i) => `mil:${i}`);
      const trois = garrisonHoldChance(point(L), militiaUnits(ids(3), L), 1, 60);
      const cinq = garrisonHoldChance(point(L), militiaUnits(ids(5), L), 1, 60);
      expect(cinq).toBeGreaterThan(trois);
      expect(garrisonHold(point(L, 'garden'), militiaUnits(ids(5), L), 1)).toBeLessThanOrEqual(0.9);
    }
  });
});

describe('la Caserne : cadence et effectif', () => {
  it('chaque niveau accélère la production, sans jamais descendre sous le plancher', () => {
    for (let l = 1; l <= 100; l++) {
      expect(militiaIntervalH(l)).toBeLessThan(militiaIntervalH(l - 1));
      expect(militiaIntervalH(l)).toBeGreaterThan(MILITIA.fastH);
    }
  });
  it('la Caserne débloque UN milicien par niveau, et 0 sans Caserne', () => {
    expect(militiaCap(0, null)).toBe(0);
    for (let l = 1; l <= 100; l++) expect(militiaCap(l, null)).toBe(militiaCap(l - 1, null) + 1);
    expect(militiaCap(20, null)).toBe(20);
  });
  it('une garnison pleine (5) se forme en une demi-journée au plus, dès la Caserne 5', () => {
    expect(militiaCap(4, null)).toBeLessThan(MILITIA.perPoint);
    expect(militiaCap(5, null)).toBe(MILITIA.perPoint);
    expect(militiaIntervalH(1) * MILITIA.perPoint).toBeLessThanOrEqual(12.5);
    expect(militiaIntervalH(10) * MILITIA.perPoint).toBeLessThanOrEqual(9.5);
    expect(militiaIntervalH(30) * MILITIA.perPoint).toBeLessThanOrEqual(7);
  });
});

describe('la production', () => {
  it('produit un milicien par intervalle, et garde la fraction entamée', () => {
    const step = militiaIntervalH(10) * H;
    const s = produceMilitia(emptyMilitia(0), 10, 0, step * 2.5, null);
    expect(s.home).toBe(2);
    expect(s.producedAt).toBe(step * 2);
  });
  it('s’arrête au plafond, en comptant ceux partis sur la carte', () => {
    const step = militiaIntervalH(5) * H;
    const s = produceMilitia(emptyMilitia(0), 5, 2, step * 50, null);
    expect(s.home).toBe(militiaCap(5, null) - 2);
  });
  it('au plafond l’horloge avance : vider un point ne relance pas une rafale', () => {
    const step = militiaIntervalH(5) * H;
    const full = produceMilitia(emptyMilitia(0), 5, 0, step * 50, null);
    expect(full.home).toBe(militiaCap(5, null));
    const out = takeMilitia(full, militiaCap(5, null))!.state;
    const next = produceMilitia(out, 5, militiaCap(5, null), step * 50 + step * 0.5, null);
    expect(next.home).toBe(0);
  });
  it('rend le MÊME objet quand rien ne change (pas d’écriture à vide)', () => {
    const s = emptyMilitia(0);
    expect(produceMilitia(s, 10, 0, 1000, null)).toBe(s);
    expect(produceMilitia(s, 0, 0, 1e12, null)).toBe(s);
  });
  it('annonce le prochain milicien, et rien quand l’effectif est complet', () => {
    const step = militiaIntervalH(10) * H;
    expect(nextMilitiaMs(emptyMilitia(0), 10, 0, step / 4, null)).toBeCloseTo(step * 0.75);
    expect(
      nextMilitiaMs({ home: militiaCap(10, null), producedAt: 0, seq: 0 }, 10, 0, 5, null),
    ).toBe(0);
  });
});

describe('envoyer, rappeler', () => {
  it('prendre des miliciens leur donne des ids NEUFS et distincts', () => {
    const a = takeMilitia({ home: 5, producedAt: 0, seq: 0 }, 2)!;
    const b = takeMilitia(a.state, 2)!;
    expect(a.state.home).toBe(3);
    expect(new Set([...a.ids, ...b.ids]).size).toBe(4);
    expect(a.ids.every(isMilitiaId)).toBe(true);
  });
  it('refuse d’en prendre plus qu’il n’y en a', () => {
    expect(takeMilitia({ home: 1, producedAt: 0, seq: 0 }, 2)).toBeNull();
    expect(takeMilitia({ home: 1, producedAt: 0, seq: 0 }, 0)).toBeNull();
  });
  it('les miliciens rappelés rentrent à la base', () => {
    expect(returnMilitia({ home: 1, producedAt: 0, seq: 3 }, 2).home).toBe(3);
  });
  it('compte ceux de la carte, postés ET en route, jamais les champions', () => {
    const p = point(10);
    p.control!.garrison = ['mil:1', 'adv_x'];
    p.control!.reinforcing = [
      { id: 'mil:2', at: 1 },
      { id: 'adv_y', at: 1 },
    ];
    const map = { pois: [p, point(10, 'garden')] } as unknown as ExpeditionMap;
    expect(militiaOnMap(map)).toBe(2);
    expect(militiaOfControl(p.control)).toEqual(['mil:1', 'mil:2']);
    // 🛡️ La ligne des disponibilités : postés (ou en route) / total, base comprise / plafond.
    expect(militiaCount({ home: 3, producedAt: 0, seq: 5 }, map, 6, null)).toEqual({
      posted: 2,
      home: 3,
      total: 5,
      cap: militiaCap(6, null),
    });
    expect(militiaCap(6, null)).toBe(6);
    expect(militiaCount(null, null, 0, null)).toEqual({ posted: 0, home: 0, total: 0, cap: 0 });
  });
});

describe('le combat', () => {
  it('un milicien vaut la part fixée d’un champion de référence, en offense ET en survie', () => {
    for (const L of [10, 40, 90]) {
      const ref = refEscortUnits(L);
      const off = ref.reduce((s, u) => s + offenseOf(u.combatant), 0) / ref.length;
      const surv = ref.reduce((s, u) => s + survivalOf(u.combatant), 0) / ref.length;
      const m = militiaUnits(['mil:1'], L)[0]!.combatant;
      expect(offenseOf(m) / off).toBeCloseTo(MILITIA.unitShare, 1);
      expect(survivalOf(m) / surv).toBeCloseTo(MILITIA.unitShare, 1);
    }
  });
  it('les ids de champions ne deviennent jamais des miliciens', () => {
    expect(militiaUnits(['adv_a', 'mil:3'], 10).map((u) => u.id)).toEqual(['mil:3']);
  });
  // ⚠️ MESURÉ (60 combats par tenue, niveaux 10/30/60/90) : une garnison PLEINE de miliciens
  // tient ~44-50 % des reprises, contre ~75-88 % pour des champions — c'est l'arbitrage
  // voulu : le milicien libère un champion, au prix d'un lieu moins sûr.
  it('une garnison de miliciens tient, mais nettement moins bien que des champions', () => {
    for (const L of [10, 30, 60, 90]) {
      const ids = ['mil:1', 'mil:2', 'mil:3'];
      const mil = garrisonHoldChance(point(L), militiaUnits(ids, L), 1, 60);
      const ch = garrisonHoldChance(point(L), refEscortUnits(L), 1, 60);
      expect(mil).toBeGreaterThan(0.3);
      expect(mil).toBeLessThan(0.65);
      expect(ch - mil).toBeGreaterThan(0.15);
    }
  });
  it('au jardin comme ailleurs, plus de miliciens tiennent mieux (5 places partout)', () => {
    for (const L of [10, 60]) {
      const n = (k: number) =>
        garrisonHoldChance(
          point(L, 'garden'),
          militiaUnits(['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'].slice(0, k), L),
          1,
          60,
        );
      expect(n(5)).toBeGreaterThan(n(3));
      expect(n(3)).toBeGreaterThan(n(1));
    }
  });
});

describe('les pertes', () => {
  it('défaite : tous les miliciens engagés meurent ; victoire : seulement ceux tombés', () => {
    const engaged = ['mil:1', 'mil:2', 'adv_a'];
    expect(militiaLost(engaged, { win: false, down: [] })).toEqual(['mil:1', 'mil:2']);
    expect(militiaLost(engaged, { win: true, down: ['mil:2', 'adv_a'] })).toEqual(['mil:2']);
    expect(militiaLost(engaged, { win: true, down: [] })).toEqual([]);
  });
});
