import { describe, it, expect } from 'vitest';
import {
  playerCombatant,
  combatPower,
  simulateCombat,
  simulateDungeon,
  mulberry32,
  fmtPow,
  fmtDelta,
} from '@/lib/combat';

const strong = playerCombatant('Fort', { puissance: 80, endurance: 60, agilite: 40 }, 10);
const weak = playerCombatant('Faible', { puissance: 3, endurance: 1, agilite: 1 }, 1);

describe('épines (thorns)', () => {
  const monster = { name: 'M', pv: 400, damage: 40, crit: 0, dodge: 0, initiative: 1, strikes: 1 };
  const base = playerCombatant('Tank', { puissance: 10, endurance: 60, agilite: 5 }, 6);
  it('un défenseur avec épines renvoie des dégâts → gagne au moins aussi souvent', () => {
    const win = (thorns: number) => {
      let w = 0;
      for (let s = 0; s < 40; s++)
        if (simulateCombat({ ...base, thorns }, monster, { seed: s * 53 + 1, goldOnWin: 0 }).win) w++;
      return w;
    };
    expect(win(0.5)).toBeGreaterThanOrEqual(win(0));
  });
  it('combatPower croît avec les épines', () => {
    expect(combatPower({ ...base, thorns: 0.5 })).toBeGreaterThan(combatPower({ ...base, thorns: 0 }));
  });
});

describe('fmtPow / fmtDelta', () => {
  it('format compact k/M (1 déc. k, 2 déc. M)', () => {
    expect(fmtPow(950)).toBe('950');
    expect(fmtPow(1500)).toBe('1,5k');
    expect(fmtPow(35324)).toBe('35,3k');
    expect(fmtPow(1_234_567)).toBe('1,23M');
  });
  it('delta signé précis, même quand fmtPow arrondirait pareil', () => {
    // 35300 et 35320 s'affichent tous deux « 35,3k » → le delta reste visible.
    expect(fmtPow(35300)).toBe(fmtPow(35320));
    expect(fmtDelta(35300, 35320)).toBe('+20');
    expect(fmtDelta(35320, 35300)).toBe('−20');
  });
});

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
  it('dérive PV/dégâts/crit/esquive/vitesse/défense des stats ET du niveau', () => {
    const c = playerCombatant('X', { puissance: 20, endurance: 30, agilite: 50 }, 3);
    expect(c.pv).toBe(100 + 15 * 3 + 30 * 10); // plancher niveau + endurance
    expect(c.damage).toBe(Math.round(6 + 10 * 3 + 20 * 1.2)); // plancher niveau + puissance
    expect(c.crit).toBeCloseTo(50 * 0.002); // agilité
    expect(c.dodge).toBeCloseTo(50 * 0.003);
    expect(c.strikes).toBeCloseTo(1 + 50 * 0.004); // Vitesse (multi-frappe)
    expect(c.dmgReduction).toBeCloseTo(20 * 0.002); // Défense (puissance)
  });
  it('un profil sans Puissance frappe quand même (planchers de niveau)', () => {
    const cardio = playerCombatant('Cardio', { puissance: 0, endurance: 40, agilite: 60 }, 10);
    expect(cardio.damage).toBeGreaterThan(1);
    expect(cardio.strikes!).toBeGreaterThan(1); // il compense par le volume de frappes
  });
  it('crit, esquive et défense sont plafonnés', () => {
    const c = playerCombatant('X', { puissance: 100000, endurance: 1, agilite: 100000 }, 1);
    expect(c.crit).toBeLessThanOrEqual(0.5);
    expect(c.dodge).toBeLessThanOrEqual(0.4);
    expect(c.dmgReduction!).toBeLessThanOrEqual(0.45);
  });
});

describe('le combat récompense l’ÉQUILIBRE', () => {
  it('à budget de stats égal, l’équilibré a la plus haute puissance de combat', () => {
    const L = 15;
    const budget = 800;
    const mk = (p: number, e: number, a: number) =>
      combatPower(
        playerCombatant(
          'x',
          {
            puissance: Math.round(budget * p),
            endurance: Math.round(budget * e),
            agilite: Math.round(budget * a),
          },
          L,
        ),
      );
    const equilibre = mk(0.35, 0.46, 0.19);
    const muscu = mk(0.6, 0.3, 0.1);
    const coureur = mk(0.1, 0.62, 0.28);
    expect(equilibre).toBeGreaterThan(muscu);
    expect(equilibre).toBeGreaterThan(coureur);
    // …mais les extrêmes restent viables (pas écrasés) : ≥ 55 % de l’équilibré.
    expect(muscu).toBeGreaterThan(equilibre * 0.55);
    expect(coureur).toBeGreaterThan(equilibre * 0.55);
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

describe('effets signature (execute / rage / momentum)', () => {
  const base = playerCombatant('Héros', { puissance: 50, endurance: 40, agilite: 20 }, 8);
  const foe = { name: 'Cible', pv: 900, damage: 40, crit: 0.05, dodge: 0.05, initiative: 5 };

  it('combatPower augmente avec chaque effet signature', () => {
    const p0 = combatPower(base);
    expect(combatPower({ ...base, execute: 0.5 })).toBeGreaterThan(p0);
    expect(combatPower({ ...base, rage: 0.5 })).toBeGreaterThan(p0);
    expect(combatPower({ ...base, momentum: 0.1 })).toBeGreaterThan(p0);
  });

  it('Exécution ne ralentit jamais et achève plus vite (l’ennemi passe sous 25% PV)', () => {
    const ref = simulateCombat(base, foe, { seed: 7, goldOnWin: 0 });
    const withExec = simulateCombat({ ...base, execute: 0.6 }, foe, { seed: 7, goldOnWin: 0 });
    expect(ref.win).toBe(true);
    expect(withExec.win).toBe(true);
    expect(withExec.rounds).toBeLessThanOrEqual(ref.rounds);
  });

  it('Déferlante (momentum) accélère la victoire (dégâts cumulés par coup)', () => {
    const ref = simulateCombat(base, foe, { seed: 11, goldOnWin: 0 });
    const withMom = simulateCombat({ ...base, momentum: 0.15 }, foe, { seed: 11, goldOnWin: 0 });
    expect(ref.win).toBe(true);
    expect(withMom.win).toBe(true);
    expect(withMom.rounds).toBeLessThanOrEqual(ref.rounds);
  });

  it('Rage aide quand le joueur démarre bas (< 30% PV)', () => {
    const lowPv = Math.round(base.pv * 0.2);
    const ref = simulateCombat(base, foe, { seed: 3, goldOnWin: 0, startPlayerPv: lowPv });
    const withRage = simulateCombat({ ...base, rage: 0.8 }, foe, {
      seed: 3,
      goldOnWin: 0,
      startPlayerPv: lowPv,
    });
    // La rage n'enlève jamais de dégâts : au pire égalité, sinon meilleur.
    if (ref.win && withRage.win) expect(withRage.rounds).toBeLessThanOrEqual(ref.rounds);
    expect(withRage.win || !ref.win).toBe(true);
  });

  it('sans effet signature, le combat est inchangé (rétro-compat)', () => {
    const a = simulateCombat(base, foe, { seed: 99, goldOnWin: 5 });
    const b = simulateCombat({ ...base }, foe, { seed: 99, goldOnWin: 5 });
    expect(a.rounds).toBe(b.rounds);
    expect(a.win).toBe(b.win);
  });
});
