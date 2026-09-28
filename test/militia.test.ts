import { describe, it, expect } from 'vitest';
import {
  MILITIA,
  emptyMilitia,
  isMilitiaId,
  militiaCap,
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
import { garrisonHoldChance } from '@/lib/controlPoints';
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

describe('la Caserne : cadence et effectif', () => {
  it('chaque niveau accélère la production, sans jamais descendre sous le plancher', () => {
    for (let l = 1; l <= 100; l++) {
      expect(militiaIntervalH(l)).toBeLessThan(militiaIntervalH(l - 1));
      expect(militiaIntervalH(l)).toBeGreaterThan(MILITIA.fastH);
    }
  });
  it('l’effectif monte d’un milicien tous les 3 niveaux, et vaut 0 sans Caserne', () => {
    expect(militiaCap(0)).toBe(0);
    expect(militiaCap(1)).toBe(3);
    expect(militiaCap(3)).toBe(4);
    expect(militiaCap(30)).toBe(13);
  });
});

describe('la production', () => {
  it('produit un milicien par intervalle, et garde la fraction entamée', () => {
    const step = militiaIntervalH(10) * H;
    const s = produceMilitia(emptyMilitia(0), 10, 0, step * 2.5);
    expect(s.home).toBe(2);
    expect(s.producedAt).toBe(step * 2);
  });
  it('s’arrête au plafond, en comptant ceux partis sur la carte', () => {
    const step = militiaIntervalH(1) * H;
    const s = produceMilitia(emptyMilitia(0), 1, 2, step * 50);
    expect(s.home).toBe(militiaCap(1) - 2);
  });
  it('au plafond l’horloge avance : vider un point ne relance pas une rafale', () => {
    const step = militiaIntervalH(1) * H;
    const full = produceMilitia(emptyMilitia(0), 1, 0, step * 50);
    expect(full.home).toBe(militiaCap(1));
    const out = takeMilitia(full, 3)!.state;
    const next = produceMilitia(out, 1, 3, step * 50 + step * 0.5);
    expect(next.home).toBe(0);
  });
  it('rend le MÊME objet quand rien ne change (pas d’écriture à vide)', () => {
    const s = emptyMilitia(0);
    expect(produceMilitia(s, 10, 0, 1000)).toBe(s);
    expect(produceMilitia(s, 0, 0, 1e12)).toBe(s);
  });
  it('annonce le prochain milicien, et rien quand l’effectif est complet', () => {
    const step = militiaIntervalH(10) * H;
    expect(nextMilitiaMs(emptyMilitia(0), 10, 0, step / 4)).toBeCloseTo(step * 0.75);
    expect(nextMilitiaMs({ home: militiaCap(10), producedAt: 0, seq: 0 }, 10, 0, 5)).toBe(0);
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
  it('un seul milicien tient un point à une place (jardin) comme trois en tiennent trois', () => {
    for (const L of [10, 60]) {
      const one = garrisonHoldChance(point(L, 'garden'), militiaUnits(['mil:1'], L), 1, 60);
      expect(one).toBeGreaterThan(0.3);
      expect(one).toBeLessThan(0.65);
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
