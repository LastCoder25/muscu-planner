import { describe, it, expect } from 'vitest';
import { playerCombatant, simulateCombat, simulateDungeon, mulberry32 } from '@/lib/combat';

const strong = playerCombatant('Fort', { puissance: 80, endurance: 60, agilite: 40 });
const weak = playerCombatant('Faible', { puissance: 3, endurance: 1, agilite: 1 });

const dummy = {
  name: 'Mannequin',
  pv: 80,
  damage: 10,
  crit: 0.05,
  dodge: 0.05,
  initiative: 5,
};
const boss = { name: 'Boss', pv: 2000, damage: 200, crit: 0.2, dodge: 0.3, initiative: 99 };

describe('playerCombatant', () => {
  it('dérive PV/dégâts/crit/esquive des stats', () => {
    const c = playerCombatant('X', { puissance: 20, endurance: 30, agilite: 50 });
    expect(c.pv).toBe(100 + 30 * 10); // 400
    expect(c.damage).toBe(Math.round(20 * 1.5)); // 30
    expect(c.crit).toBeCloseTo(0.25); // 50 × 0.005
    expect(c.dodge).toBeCloseTo(0.15); // 50 × 0.003
  });
  it('crit et esquive sont plafonnés', () => {
    const c = playerCombatant('X', { puissance: 1, endurance: 1, agilite: 100000 });
    expect(c.crit).toBeLessThanOrEqual(0.6);
    expect(c.dodge).toBeLessThanOrEqual(0.4);
  });
});

describe('simulateCombat', () => {
  it('déterministe : même seed → même résultat', () => {
    const a = simulateCombat(strong, dummy, { seed: 42, goldOnWin: 50 });
    const b = simulateCombat(strong, dummy, { seed: 42, goldOnWin: 50 });
    expect(a.win).toBe(b.win);
    expect(a.rounds).toBe(b.rounds);
    expect(a.log.length).toBe(b.log.length);
  });
  it('un perso fort bat un mannequin faible et gagne l’or', () => {
    const r = simulateCombat(strong, dummy, { seed: 7, goldOnWin: 50 });
    expect(r.win).toBe(true);
    expect(r.gold).toBe(50);
  });
  it('un perso faible perd contre un boss et ne gagne rien', () => {
    const r = simulateCombat(weak, boss, { seed: 7, goldOnWin: 50 });
    expect(r.win).toBe(false);
    expect(r.gold).toBe(0);
  });
  it('le journal se termine avec un camp à 0 PV', () => {
    const r = simulateCombat(strong, dummy, { seed: 1, goldOnWin: 10 });
    const last = r.log[r.log.length - 1]!;
    expect(last.playerPv === 0 || last.monsterPv === 0).toBe(true);
  });
});

describe('simulateDungeon', () => {
  const foes = [
    { combatant: { ...dummy, name: 'M1' }, gold: 10 },
    { combatant: { ...dummy, name: 'M2' }, gold: 15 },
  ];
  it('un perso fort nettoie le donjon et cumule l’or', () => {
    const r = simulateDungeon(strong, foes, { seed: 3 });
    expect(r.cleared).toBe(true);
    expect(r.defeated).toBe(2);
    expect(r.gold).toBe(25);
    expect(r.fights).toHaveLength(2);
  });
  it('un perso faible échoue et ne garde que l’or des monstres vaincus', () => {
    const tough = [
      {
        combatant: { name: 'B1', pv: 5000, damage: 300, crit: 0.3, dodge: 0.3, initiative: 99 },
        gold: 50,
      },
      {
        combatant: { name: 'B2', pv: 5000, damage: 300, crit: 0.3, dodge: 0.3, initiative: 99 },
        gold: 50,
      },
    ];
    const r = simulateDungeon(weak, tough, { seed: 3 });
    expect(r.cleared).toBe(false);
    expect(r.gold).toBeLessThan(100);
  });
  it('les PV se reportent : PV final ≤ PV max', () => {
    const r = simulateDungeon(strong, foes, { seed: 9 });
    expect(r.finalPv).toBeLessThanOrEqual(strong.pv);
    expect(r.finalPv).toBeGreaterThan(0);
  });
});

describe('mulberry32', () => {
  it('renvoie des nombres dans [0,1[', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
