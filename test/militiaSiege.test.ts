// 🛡️ LES MILICIENS DE LA BASE DÉFENDENT AUSSI (2026-09-30, demandé par l'utilisateur).
import { describe, it, expect } from 'vitest';
import {
  RAID,
  guardUnits,
  militiaGuard,
  resolveRaid,
  rollRaid,
  type DefenseStructure,
} from '@/lib/raid';
import { MILITIA, isMilitiaId, militiaCap } from '@/lib/militia';
import { engageCap, type Adventurer } from '@/lib/adventurers';
import { refChampionAdv } from '@/lib/caravan';

const defs = (l: number): DefenseStructure[] => [
  { typeId: 'wall', level: l },
  { typeId: 'turret', level: l },
];
const kit = { now: 0, kennelLevel: 0, familiars: [], talents: [], advGear: [] };
const roster = (L: number, n: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(Math.max(1, L - (i % 6)), i),
    id: `a${i}`,
    name: `A${i}`,
    seed: i + 1,
  }));

function siege(L: number, part: number, mil: number, n: number) {
  let held = 0;
  const reports = [];
  for (let i = 0; i < n; i++) {
    const r = resolveRaid(
      {
        defenses: defs(Math.round(L * part)),
        playerLevel: L,
        hero: null,
        guard: guardUnits(L, [], 99, kit, mil),
      },
      rollRaid(i * 7919 + 13, L, 0, 0),
      false,
    );
    if (r.held) held++;
    reports.push(r);
  }
  return { hold: (held / n) * 100, reports };
}

describe('🛡️ la milice au rempart', () => {
  it('des hommes d’armes de la cour, un par milicien, jamais comptés dans le Panthéon', () => {
    const g = militiaGuard(30, 4);
    expect(g).toHaveLength(4);
    expect(new Set(g.map((x) => x.id)).size).toBe(4);
    expect(g.every((x) => isMilitiaId(x.id) && x.militia && !x.ranged)).toBe(true);
    // Le plafond du Panthéon borne les CHAMPIONS seulement.
    const L = 30;
    const cap = engageCap(L);
    expect(guardUnits(L, roster(L, cap + 5), cap, kit, 7)).toHaveLength(cap + 7);
  });
  it('aucun milicien, aucune unité (et un nombre illisible n’en invente pas)', () => {
    expect(militiaGuard(30, 0)).toEqual([]);
    expect(militiaGuard(30, -3)).toEqual([]);
    expect(militiaGuard(30, Number.NaN)).toEqual([]);
  });
  it('ils valent la part mesurée d’un milicien de carte : plus forts si elle monte', () => {
    const a = militiaGuard(30, 1)[0]!;
    const old = MILITIA.siegeShare;
    try {
      (MILITIA as { siegeShare: number }).siegeShare = old * 2;
      const b = militiaGuard(30, 1)[0]!;
      expect(b.pv).toBeGreaterThan(a.pv * 1.8);
      expect(b.damage).toBeGreaterThan(a.damage * 1.8);
    } finally {
      (MILITIA as { siegeShare: number }).siegeShare = old;
    }
  });

  // ⚠️ MESURÉ (150 sièges, enceinte à niveau, sans héros ni champion, milice au complet) :
  // 29 → 68 % au niveau 12, 72 → 84 % au 30, 74 → 82 % au 60, 70 → 83 % au 100. À une valeur
  // double (1), la milice devenait le rempart à elle seule (88-94 %) ; avec héros et champions
  // présents, elle ne change presque rien (déjà 95-100 %).
  // ⚠️ RÉÉCRIT (v0.1370, la garnison porte un tiers de la défense — demandé : « que les
  // miliciens et les champions aient un intérêt dans la défense »). Le plafond était « < 90 % »
  // quand la milice pesait peu ; mesuré depuis (200 sièges, enceinte pleine, SANS héros) : sans
  // milice 26/38/37/35 %, Caserne pleine 71/91/89/91 % aux niveaux 12/30/50/80. Ce qui reste
  // vrai, et qu'on épingle : la milice pèse NETTEMENT (+30 points une fois la bascule faite),
  // et une base sans héros ni champion n'est JAMAIS certaine.
  it('une enceinte seule tient nettement mieux avec sa milice, sans devenir imprenable', () => {
    for (const L of [12, 30]) {
      const without = siege(L, 1, 0, 80).hold;
      const withMil = siege(L, 1, militiaCap(L, 0), 80).hold;
      expect(withMil).toBeGreaterThan(without + (L >= RAID.enceinteTo ? 30 : 8));
      expect(withMil).toBeLessThan(97);
    }
  }, 120_000);

  it('💀 un milicien tombé MEURT — défaite : tous ceux engagés ; il ne va jamais à l’infirmerie', () => {
    const { reports } = siege(30, 0.5, 6, 40);
    const lost = reports.filter((r) => !r.held);
    const won = reports.filter((r) => r.held);
    expect(lost.length).toBeGreaterThan(0);
    for (const r of lost) expect(r.militiaLost).toBe(6);
    for (const r of won) expect(r.militiaLost ?? 0).toBeLessThanOrEqual(6);
    for (const r of reports) expect((r.wounded ?? []).some(isMilitiaId)).toBe(false);
    // Sans milice, le rapport n'en parle pas.
    expect(siege(30, 1, 0, 3).reports.every((r) => r.militiaLost === undefined)).toBe(true);
  }, 120_000);
});
