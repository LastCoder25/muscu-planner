import { describe, expect, it } from 'vitest';
import { rollRaid, siegeAttackers, battleLootPills, type Raid } from '@/lib/raid';
import { RIFT, riftClearMana, riftMana, siegeMana } from '@/lib/rift';

// Un journal où ces assaillants-là sont tombés — le reste du combat ne compte pas ici.
const logOf = (ids: string[]) => ({
  log: ids.map((to) => ({ round: 1, kind: 'down' as const, to })),
});
const raidAt = (L: number, s = 7) => rollRaid(s * 7919, L, 0, 0);
const ids = (r: Raid) => siegeAttackers(r).map((u) => u.id);

describe('💠 le mana d’un siège de la base', () => {
  it('aucun monstre abattu, aucun mana', () => {
    expect(siegeMana(raidAt(30), logOf([]))).toBe(0);
  });

  it('une armée entière vaut `siegeManaFoes` monstres de faille, et reste sous une faille refermée', () => {
    for (const L of [5, 12, 30, 60, 100]) {
      const r = raidAt(L);
      const m = siegeMana(r, logOf(ids(r)));
      expect(m).toBe(riftMana(RIFT.siegeManaFoes, r.level));
      expect(m).toBeLessThan(riftClearMana({ level: r.level }));
    }
  });

  it('payé MÊME EN DÉFAITE : des corps abattus sans qu’aucun groupe soit tombé en entier', () => {
    const r = raidAt(30);
    // Chaque groupe perd tous ses corps SAUF UN : aucun n'est repoussé en entier
    // (`report.defeated` vaudrait 0), et pourtant il y a eu du monde d'abattu.
    const all = ids(r);
    const slain: string[] = [];
    let i = 0;
    for (const g of r.groups) {
      slain.push(...all.slice(i, i + g.count - 1));
      i += g.count;
    }
    expect(slain.length).toBeGreaterThan(0);
    expect(siegeMana(r, logOf(slain))).toBeGreaterThan(0);
  });

  it('au prorata des PV abattus : la moitié des PV rend la moitié du mana', () => {
    const r = raidAt(60);
    const units = siegeAttackers(r);
    const total = units.reduce((a, u) => a + u.pv, 0);
    const half: string[] = [];
    let acc = 0;
    for (const u of units) {
      if (acc >= total / 2) break;
      half.push(u.id);
      acc += u.pv;
    }
    const full = siegeMana(r, logOf(ids(r)));
    const part = siegeMana(r, logOf(half));
    expect(part / full).toBeCloseTo(acc / total, 1);
  });

  it('un monstre BLESSÉ n’est pas un monstre abattu', () => {
    const r = raidAt(30);
    const log = ids(r).map((to) => ({ round: 1, kind: 'hit' as const, to }));
    expect(siegeMana(r, { log })).toBe(0);
  });

  it('les défenseurs tombés ne rapportent rien', () => {
    const r = raidAt(30);
    expect(siegeMana(r, logOf(['d0', 'd1', 'hero']))).toBe(0);
  });

  it('iso-menace : les trois factions paient pareil pour une armée entière', () => {
    const byF: Record<string, number[]> = {};
    for (let s = 1; s < 120; s++) {
      const r = raidAt(60, s);
      (byF[r.faction] ??= []).push(siegeMana(r, logOf(ids(r))));
    }
    const avgs = Object.values(byF).map((a) => a.reduce((x, y) => x + y, 0) / a.length);
    expect(avgs.length).toBe(3);
    expect(Math.max(...avgs) / Math.min(...avgs)).toBeLessThan(1.1);
  });

  it('le butin affiché du siège annonce le mana', () => {
    expect(
      battleLootPills({ corpses: 0, gold: 0, mana: 42, keys: 0, summonStones: 0, items: 0 }),
    ).toContain('+42 💠');
  });
});
