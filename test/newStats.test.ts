import { describe, expect, it } from 'vitest';
import { COMBAT, combatPowerRaw, simulateCombat, type Combatant } from '@/lib/combat';
import {
  effectBase,
  effectLabelFor,
  playerWithGear,
  RATING_CAPS,
  ratingChance,
  trainingMult,
  type Equipped,
  type Item,
} from '@/lib/items';

// Refonte de l'équipement du héros, étape 3 : les stats nouvelles.
const hero = (x: Partial<Combatant> = {}): Combatant => ({
  name: 'H',
  pv: 10_000,
  damage: 100,
  crit: 0,
  dodge: 0,
  initiative: 100,
  ...x,
});
const foe = (x: Partial<Combatant> = {}): Combatant => ({
  name: 'F',
  pv: 1_000_000,
  damage: 100,
  crit: 0,
  dodge: 0,
  initiative: 0,
  ...x,
});
const run = (p: Combatant, m: Combatant, seed = 5) =>
  simulateCombat(p, m, { seed, goldOnWin: 0 }).log;
const mine = (log: ReturnType<typeof run>) => log.filter((e) => e.who === 'player');
const theirs = (log: ReturnType<typeof run>) => log.filter((e) => e.who === 'monster');

describe('chaque stat nouvelle fait ce qu’elle annonce', () => {
  it('dégâts critiques : un critique fait ×(2 + dégâts critiques)', () => {
    const a = mine(run(hero({ crit: 1 }), foe()));
    const b = mine(run(hero({ crit: 1, critDmg: 0.5 }), foe()));
    // Même graine, même variance : seul le multiplicateur change.
    expect(b[0]!.damage / a[0]!.damage).toBeCloseTo(2.5 / 2, 1);
  });

  it('précision : elle annule l’esquive ennemie en proportion', () => {
    const slippery = foe({ dodge: 1 });
    expect(mine(run(hero(), slippery)).every((e) => e.type === 'dodge')).toBe(true);
    const hits = mine(run(hero({ accuracy: 1 }), slippery)).filter((e) => e.type !== 'dodge');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('précision : elle ajoute des dégâts tant que l’ennemi a plus de 75 % de ses PV', () => {
    const a = mine(run(hero(), foe()));
    const b = mine(run(hero({ accuracy: 0.4 }), foe()));
    expect(b[0]!.damage / a[0]!.damage).toBeCloseTo(1.4, 1);
    // Plus d'effet sous le seuil : un ennemi fragile passe vite sous 75 %.
    const low = foe({ pv: 1000 });
    const la = mine(run(hero(), low));
    const lb = mine(run(hero({ accuracy: 0.4 }), low));
    const i = la.findIndex((e) => e.monsterPv / 1000 < COMBAT.accuracyOpenAbove);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(lb[i + 1]!.damage).toBe(la[i + 1]!.damage);
  });

  it('saignement : une réserve qui tombe sur les tours ennemis', () => {
    const log = run(hero({ bleed: 0.5 }), foe());
    // Les tombées du saignement se jouent pendant les tours de l'ENNEMI.
    const enemyRounds = new Set(theirs(log).map((e) => e.round));
    const ticks = mine(log).filter((e) => enemyRounds.has(e.round));
    const hits = mine(log).filter((e) => !enemyRounds.has(e.round));
    expect(ticks.length).toBeGreaterThan(0);
    const tickSum = ticks.reduce((s, e) => s + e.damage, 0);
    const hitSum = hits.reduce((s, e) => s + e.damage, 0);
    // Tout ce qui saigne finit par tomber (à la réserve restante près) : ~50 % des coups.
    expect(tickSum / hitSum).toBeGreaterThan(0.4);
    expect(tickSum / hitSum).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('blocage : un coup bloqué ne fait que 25 %', () => {
    const a = theirs(run(hero(), foe()));
    const b = theirs(run(hero({ block: 1 }), foe()));
    // La valeur ANNONCÉE (25 %), pas la constante relue : sinon le test ne voit rien bouger.
    expect(b[0]!.damage / a[0]!.damage).toBeCloseTo(0.25, 1);
    expect(b[0]!.skills).toContain('block');
  });

  it('parade : le coup est évité et l’ennemi saute un tour, jamais deux de suite', () => {
    const log = run(hero({ parry: 1 }), foe());
    const t = theirs(log);
    expect(t.every((e) => e.type === 'dodge' && e.skills?.includes('parry'))).toBe(true);
    // Un tour ennemi sur deux seulement : l'étourdissement ne s'enchaîne pas.
    const rounds = [...new Set(t.map((e) => e.round))];
    expect(rounds.length).toBeGreaterThan(3);
    for (let i = 1; i < rounds.length; i++) expect(rounds[i]! - rounds[i - 1]!).toBe(4);
  });

  it('riposte : après un coup reçu, une volée du héros', () => {
    const log = run(hero({ riposte: 1, strikes: 3 }), foe());
    const r = mine(log).filter((e) => e.skills?.includes('riposte'));
    // Chaque coup reçu dont on se relève déclenche une riposte (pas le coup fatal).
    expect(r.length).toBe(theirs(log).filter((e) => e.type !== 'dodge' && e.playerPv > 0).length);
    expect(r[0]!.damage).toBe(300); // 100 × 3 coups, sans critique ni réduction
  });

  it('résistance aux critiques : un critique ennemi résisté en entier frappe comme un coup normal', () => {
    const a = theirs(run(hero(), foe({ crit: 1 })));
    const b = theirs(run(hero({ critResist: 1 }), foe({ crit: 1 })));
    expect(b[0]!.damage / a[0]!.damage).toBeCloseTo(0.5, 1);
  });

  it('bouclier de départ : la barrière encaisse avant les PV', () => {
    const log = run(hero({ startShield: 0.5 }), foe({ damage: 1000 }));
    const t = theirs(log);
    expect(t[0]!.playerPv).toBe(10_000);
    expect(t[0]!.skills).toContain('start_shield');
    // 5 000 de barrière : après ~5 coups de ~1 000, les PV baissent.
    expect(t.at(-1)!.playerPv).toBeLessThan(10_000);
  });

  it('dressage : le familier porté apprend plus vite', () => {
    const ring = {
      id: 'r',
      slot: 'accessory',
      name: 'Anneau',
      emoji: '💍',
      rarity: 'commun',
      level: 1,
      baseLevel: 1,
      effect: { type: 'training_pct', value: 20 },
      desc: '',
    } as unknown as Item;
    const eq: Equipped = { accessory: ring };
    expect(trainingMult({})).toBe(1);
    expect(trainingMult(eq)).toBeCloseTo(1.2, 5);
  });
});

describe('garde-fous', () => {
  it('un héros SANS stat nouvelle n’en porte aucun champ (combat identique au bit près)', () => {
    const c = playerWithGear('h', { puissance: 100, endurance: 100, agilite: 100 }, {}, {}, 20);
    for (const k of [
      'critDmg',
      'accuracy',
      'bleed',
      'block',
      'parry',
      'riposte',
      'critResist',
      'startShield',
    ])
      expect(k in c).toBe(false);
  });

  it('les notes deviennent des chances à rendement décroissant, sans jamais le plafond', () => {
    for (const cap of Object.values(RATING_CAPS)) {
      expect((ratingChance(cap, 1e-6) - 0) / 1e-6).toBeCloseTo(1, 3); // le premier point vaut 1
      expect(ratingChance(cap, 50)).toBeLessThan(cap);
      expect(ratingChance(cap, 0.2)).toBeGreaterThan(ratingChance(cap, 0.1));
    }
  });

  it('chaque stat de combat nouvelle compte dans la puissance affichée', () => {
    const base = hero({ crit: 0.5, dodge: 0.1, dmgReduction: 0.2 });
    const p0 = combatPowerRaw(base);
    for (const k of [
      'critDmg',
      'accuracy',
      'bleed',
      'block',
      'parry',
      'riposte',
      'critResist',
      'startShield',
    ] as const)
      expect(combatPowerRaw({ ...base, [k]: 0.2 })).toBeGreaterThan(p0);
  });

  it('les 13 bases d’effets d’avant la refonte sont inchangées', () => {
    const avant = {
      damage_pct: 8,
      crit_pct: 4,
      lifesteal_pct: 6,
      execute_pct: 12,
      momentum_pct: 3,
      dmg_reduction_pct: 6,
      max_pv_pct: 10,
      thorns_pct: 12,
      rage_pct: 12,
      gold_pct: 14,
      magic_find_pct: 6,
      regen_pct: 8,
      initiative_pct: 10,
    } as const;
    for (const [t, v] of Object.entries(avant)) expect(effectBase(t as keyof typeof avant)).toBe(v);
  });

  it('chaque stat nouvelle a un libellé', () => {
    for (const t of [
      'crit_dmg_pct',
      'accuracy_pct',
      'bleed_pct',
      'block_pct',
      'parry_pct',
      'riposte_pct',
      'crit_resist_pct',
      'start_shield_pct',
      'dodge_pct',
      'training_pct',
    ] as const)
      expect(effectLabelFor(t, 5)).toMatch(/5/);
  });
});
