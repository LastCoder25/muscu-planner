import { describe, it, expect } from 'vitest';
import { simulateCombat, combatPowerRaw, type Combatant } from '@/lib/combat';
import { fuseUnits, type SkirmishUnit } from '@/lib/skirmish';
import { refChampionAdv, escortCombatant, type EscortKit } from '@/lib/caravan';
import { teamRuneValue, type Adventurer } from '@/lib/adventurers';
import { resolveIncursion, simulateIncursion, SECOND_WIND_LINE } from '@/lib/rift';
import { withPlunder } from '@/lib/harvestParty';
import { EXPE, type ExpeditionOutcome, type Poi } from '@/lib/expedition';
import { skillValue, referenceRuneBuild, SKILLS, type ChampSkill } from '@/lib/skillRunes';

/** 🔮 LES QUATRE RUNES DORÉES — ce qu'elles font vraiment. */

const hero = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'h', pv: 500, damage: 40, crit: 0, dodge: 0, initiative: 10, ...over,
});
const foe = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'm', pv: 800, damage: 60, crit: 0, dodge: 0, initiative: 1, ...over,
});
const withSkills = (a: Adventurer, skills: ChampSkill[]): Adventurer => ({ ...a, skills });
const NUS: EscortKit = { advGear: [] };

describe('⚡ Premier sang', () => {
  it('le premier tour frappe plus fort, et seulement lui', () => {
    const sans = simulateCombat(hero(), foe(), { seed: 3, goldOnWin: 0 });
    const avec = simulateCombat(hero({ openingDmg: 0.5 }), foe(), { seed: 3, goldOnWin: 0 });
    const coups = (r: typeof sans) => r.log.filter((e) => e.who === 'player' && e.damage > 0).map((e) => e.damage);
    expect(coups(avec)[0]).toBeGreaterThan(coups(sans)[0]!);
    expect(coups(avec)[1]).toBe(coups(sans)[1]);
    // Un combat sans la rune ne bouge pas d'un iota.
    expect(simulateCombat(hero({ openingDmg: 0 }), foe(), { seed: 3, goldOnWin: 0 })).toEqual(sans);
  });
});

describe('✨ Second souffle', () => {
  it('amortit le coup fatal, une fois, et le dit', () => {
    const faible = hero({ pv: 60, damage: 1 });
    const brute = foe({ damage: 100, pv: 9999 });
    const sans = simulateCombat(faible, brute, { seed: 1, goldOnWin: 0 });
    const avec = simulateCombat({ ...faible, lastStand: 0.5 }, brute, { seed: 1, goldOnWin: 0 });
    expect(sans.lastStandUsed).toBeUndefined();
    expect(avec.lastStandUsed).toBe(true);
    expect(avec.rounds).toBeGreaterThan(sans.rounds);
  });

  it('suit sa valeur : plus il amortit, plus on tient', () => {
    const faible = hero({ pv: 90, damage: 1 });
    const brute = foe({ damage: 100, pv: 9999 });
    const r = (v: number) => simulateCombat({ ...faible, lastStand: v }, brute, { seed: 1, goldOnWin: 0 }).rounds;
    expect(r(0.8)).toBeGreaterThanOrEqual(r(0.2));
  });

  it('une fois par MISSION : une faille enchaîne des combats sans le recharger', () => {
    const esc = [0, 1, 2].map((i) => withSkills(refChampionAdv(20, i), [{ id: 'secondWind', level: 5 }]));
    const poi: Poi = { id: 'rift_x', type: 'rift', level: 30, x: 60, y: 60, distNorm: 0.5, spawnedAt: 0, expiresAt: EXPE.lifespanMs.rift };
    const g = escortCombatant(esc);
    let vu = 0;
    for (let s = 1; s < 60; s++) {
      const n = simulateIncursion(g, poi, EXPE.lifespanMs.rift - 1, s).journal.filter((l) => l === SECOND_WIND_LINE).length;
      expect(n).toBeLessThanOrEqual(1);
      vu += n;
    }
    expect(vu, 'le Second souffle n’a jamais servi : le test ne prouve rien').toBeGreaterThan(0);
  });
});

describe('🔮 la puissance et la fusion voient les dorées', () => {
  it('la puissance les compte', () => {
    expect(combatPowerRaw(hero({ openingDmg: 0.4 }))).toBeGreaterThan(combatPowerRaw(hero()));
    expect(combatPowerRaw(hero({ lastStand: 0.4 }))).toBeGreaterThan(combatPowerRaw(hero()));
  });

  it('une escorte : Premier sang en MOYENNE, Second souffle du meilleur porteur', () => {
    const a = withSkills(refChampionAdv(30, 0), [{ id: 'firstBlood', level: 1 }]);
    const b = withSkills(refChampionAdv(30, 1), []);
    const c = withSkills(refChampionAdv(30, 2), [{ id: 'secondWind', level: 3 }]);
    const e = escortCombatant([a, b, c]);
    expect(e.openingDmg).toBeCloseTo(skillValue('firstBlood', 1) / 100 / 3);
    expect(e.lastStand).toBeCloseTo(skillValue('secondWind', 3) / 100);
    expect(escortCombatant([b]).openingDmg).toBeUndefined();
  });

  it('fuseUnits ne recopie pas les dorées du seul modèle', () => {
    const u = (id: string, c: Combatant): SkirmishUnit => ({ id, level: 30, combatant: c });
    const f = fuseUnits([u('a', hero({ damage: 100 })), u('b', hero({ damage: 10, lastStand: 0.3, openingDmg: 1 }))], 'g');
    expect(f.lastStand).toBe(0.3);
    expect(f.openingDmg!).toBeGreaterThan(0);
    expect(f.openingDmg!).toBeLessThan(0.2);
  });

  it('⚠️ les étalons ne portent AUCUNE dorée', () => {
    for (let r = 0; r <= 9; r++)
      for (let v = 0; v < 3; v++)
        for (const k of referenceRuneBuild(r, 4, v)) expect(SKILLS[k.id].tier, `${r}/${v}`).not.toBe('gold');
  });
});

describe('🧲 Pillard et 🕳️ Scelleur', () => {
  const out = (over: Partial<ExpeditionOutcome> = {}): ExpeditionOutcome => ({
    win: true, gold: 100, energy: 50, summonStones: 3, mana: 10, item: null, items: [], key: 1, reconBonus: 0, returnMult: 1, text: 'ok', ...over,
  });

  it('une équipe = le MEILLEUR porteur, jamais la somme', () => {
    const p = (lv: number) => withSkills(refChampionAdv(30, 0), [{ id: 'plunder', level: lv }]);
    expect(teamRuneValue([p(1), p(1), p(1)], 'plunder')).toBeCloseTo(skillValue('plunder', 1) / 100);
    expect(teamRuneValue([p(1), p(4)], 'plunder')).toBeCloseTo(skillValue('plunder', 4) / 100);
  });

  it('Pillard double la cargaison, jamais l’énergie, et suit sa chance', () => {
    const esc = [withSkills(refChampionAdv(30, 0), [{ id: 'plunder', level: 5 }])];
    let doubles = 0;
    for (let s = 1; s <= 4000; s++) {
      const o = withPlunder(out(), esc, s);
      expect(o.energy).toBe(50);
      if (o.gold === 200) {
        doubles++;
        expect([o.summonStones, o.mana, o.key]).toEqual([6, 20, 2]);
      }
    }
    expect(doubles / 4000).toBeCloseTo(skillValue('plunder', 5) / 100, 1);
  });

  it('Pillard : rien sans la rune, rien sur un échec', () => {
    const nu = [withSkills(refChampionAdv(30, 0), [])];
    const o = out();
    expect(withPlunder(o, nu, 5)).toBe(o);
    const perdu = out({ win: false });
    expect(withPlunder(perdu, [withSkills(refChampionAdv(30, 0), [{ id: 'plunder', level: 5 }])], 5)).toBe(perdu);
  });

  it('Scelleur : une faille refermée rend plus de mana', () => {
    const poi: Poi = { id: 'rift_y', type: 'rift', level: 5, x: 60, y: 60, distNorm: 0.5, spawnedAt: 0, expiresAt: EXPE.lifespanMs.rift };
    const mk = (skills: ChampSkill[]) => [0, 1, 2].map((i) => withSkills(refChampionAdv(40, i), i === 0 ? skills : []));
    const run = (skills: ChampSkill[]) =>
      resolveIncursion({ poi, escort: mk(skills), road: NUS, hero: null, seed: 3, now: 1000, pantheonLevel: 40 });
    const sans = run([]);
    const avec = run([{ id: 'riftSealer', level: 5 }]);
    expect(sans.win).toBe(true);
    expect(avec.mana).toBe(Math.round(sans.mana * (1 + skillValue('riftSealer', 5) / 100)));
  });
});
