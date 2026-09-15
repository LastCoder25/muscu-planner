import { describe, it, expect } from 'vitest';
import {
  SKIRMISH,
  simulateSkirmish,
  skirmishXpShares,
  trialXpBase,
  troopOf,
  type SkirmishUnit,
} from '@/lib/skirmish';
import { offenseOf, survivalOf, type Combatant } from '@/lib/combat';

const c = (o: Partial<Combatant> = {}): Combatant => ({
  name: 'x',
  pv: 100,
  damage: 10,
  crit: 0,
  dodge: 0,
  initiative: 10,
  ...o,
});
const u = (id: string, o: Partial<Combatant> = {}, level = 10): SkirmishUnit => ({
  id,
  name: id,
  emoji: '⚔️',
  level,
  combatant: c({ name: id, ...o }),
});

describe('⚔️ simulateSkirmish — des duels enchaînés, PV reportés des deux côtés', () => {
  it('est DÉTERMINISTE : même graine, même bataille', () => {
    const allies = [u('a', { pv: 300, damage: 40 }), u('b', { pv: 200, damage: 60 })];
    const foes = [u('f0', { pv: 150, damage: 30 }), u('f1', { pv: 150, damage: 30 })];
    expect(simulateSkirmish(allies, foes, 42)).toEqual(simulateSkirmish(allies, foes, 42));
  });

  it('⚠️ les PV d’un ALLIÉ se reportent d’un duel à l’autre', () => {
    // L'ennemi frappe le premier (17..23), l'allié abat chaque ennemi d'un coup. Frais à
    // chaque duel, l'allié gagnerait les trois ; PV reportés, il tombe au troisième.
    const a = u('a', { pv: 50, damage: 100, initiative: 1 });
    const foe = (id: string) => u(id, { pv: 20, damage: 20, initiative: 50 });
    const r = simulateSkirmish([a], [foe('f0'), foe('f1'), foe('f2')], 7);
    expect(r.win).toBe(false);
    expect(r.down).toEqual(['a']);
    expect(r.foesDown).toEqual(['f0', 'f1']);
    expect(r.killsBy['a']).toBe(2);
    expect(r.killsBy['f2']).toBe(1);
    expect(r.pvLeft['a']).toBe(0);
  });

  it('⚠️ les PV d’un ENNEMI se reportent : il ne se relève pas entre deux adversaires', () => {
    // a1 entame f0 (51..69) puis tombe ; a2 l'achève d'un coup SANS être touché — ce qui
    // n'arrive que si f0 garde ses PV entamés.
    const allies = [
      u('a1', { pv: 15, damage: 60, initiative: 99 }),
      u('a2', { pv: 1000, damage: 60, initiative: 99 }),
    ];
    const foes = [u('f0', { pv: 100, damage: 20, initiative: 1 })];
    let vus = 0;
    for (let s = 1; s <= 60; s++) {
      const r = simulateSkirmish(allies, foes, s);
      if (r.kills[0]?.victim !== 'a1') continue;
      vus++;
      expect(r.kills[1]).toEqual({ duel: 1, killer: 'a2', victim: 'f0' });
      expect(r.pvLeft['a2']).toBe(1000);
      expect(r.win).toBe(true);
    }
    expect(vus, 'a1 n’a jamais ouvert : le test ne prouve rien').toBeGreaterThan(0);
  });

  it('le JOURNAL nomme qui a abattu qui, et les comptes le suivent', () => {
    const allies = [u('a', { pv: 400, damage: 50 }), u('b', { pv: 400, damage: 50 })];
    const foes = [0, 1, 2, 3].map((i) => u(`f${i}`, { pv: 120, damage: 25 }));
    for (let s = 1; s <= 30; s++) {
      const r = simulateSkirmish(allies, foes, s);
      const tues = r.kills.filter((k) => k.victim.startsWith('f'));
      expect(tues.map((k) => k.victim).sort()).toEqual([...r.foesDown].sort());
      for (const k of tues) expect(['a', 'b']).toContain(k.killer);
      expect((r.killsBy['a'] ?? 0) + (r.killsBy['b'] ?? 0)).toBe(r.foesDown.length);
      expect(r.win).toBe(r.foesDown.length === foes.length);
      // Chaque duel fait tomber au moins un combattant : la bataille est bornée.
      expect(r.duels).toBeLessThanOrEqual(allies.length + foes.length);
    }
  });

  it('⚠️ un groupe VAINQUEUR compte le membre tombé en chemin', () => {
    const allies = [
      u('faible', { pv: 5, damage: 1, initiative: 1 }),
      u('fort', { pv: 1000, damage: 200, initiative: 99 }),
    ];
    const foes = [u('f0', { pv: 50, damage: 20, initiative: 50 })];
    let vu = false;
    for (let s = 1; s <= 60 && !vu; s++) {
      const r = simulateSkirmish(allies, foes, s);
      if (r.win && r.down.includes('faible')) vu = true;
    }
    expect(vu).toBe(true);
  });

  it('bords : troupe vide = victoire sans duel ; groupe vide = défaite', () => {
    expect(simulateSkirmish([u('a')], [], 1)).toMatchObject({ win: true, duels: 0 });
    expect(simulateSkirmish([], [u('f0')], 1)).toMatchObject({ win: false, duels: 0 });
  });

  it('⚠️ un DERNIER duel où les deux tombent ensemble (épines) est une DÉFAITE : personne ne tient la route', () => {
    // Pv=1 des deux côtés + épines : le coup qui tue l'allié renvoie systématiquement
    // (plancher « au moins 1 ») une riposte fatale au monstre — DANS le même événement.
    const mutual = u('a', { pv: 1, damage: 1, dodge: 0, initiative: 1, thorns: 1 });
    const foe = u('f0', { pv: 1, damage: 1, initiative: 99 });
    const r = simulateSkirmish([mutual], [foe], 1);
    expect(r.win).toBe(false);
    expect(r.duels).toBe(1);
    expect(r.kills).toEqual([
      { duel: 0, killer: 'a', victim: 'f0' },
      { duel: 0, killer: 'f0', victim: 'a' },
    ]);
    expect(r.killsBy).toEqual({ a: 1, f0: 1 });
    expect(r.down).toEqual(['a']);
    expect(r.foesDown).toEqual(['f0']);
    expect(r.pvLeft['a']).toBe(0);
  });

  it('⚠️ …mais si un AUTRE allié tient encore, la victoire reste acquise', () => {
    const mutual = u('mutual', { pv: 1, damage: 1, dodge: 0, initiative: 1, thorns: 1 });
    const bystander = u('bystander', { pv: 1000, damage: 500, initiative: 1 });
    const foe = u('f0', { pv: 1, damage: 1, initiative: 99 });
    let vu = false;
    for (let s = 1; s <= 60 && !vu; s++) {
      const r = simulateSkirmish([mutual, bystander], [foe], s);
      if (!(r.down.includes('mutual') && !r.down.includes('bystander'))) continue;
      vu = true;
      expect(r.win).toBe(true);
      expect(r.foesDown).toEqual(['f0']);
      expect(r.kills).toEqual([
        { duel: 0, killer: 'mutual', victim: 'f0' },
        { duel: 0, killer: 'f0', victim: 'mutual' },
      ]);
      expect(r.killsBy).toEqual({ mutual: 1, f0: 1 });
      expect(r.pvLeft['bystander']).toBe(1000);
    }
    expect(vu, 'mutual n’a jamais été choisi : le test ne prouve rien').toBe(true);
  });
});

describe('🗡️ troopOf — danger ABSOLU, dérivé d’une référence', () => {
  it('ne dépend que de la RÉFÉRENCE et du lieu', () => {
    const ref = [c({ pv: 400, damage: 40, strikes: 2 }), c({ pv: 600, damage: 20 })];
    const spec = {
      count: 3,
      level: 20,
      pvTurns: 2,
      dmgPctPv: 0.25,
      mult: 1,
      name: 'Bandit',
      emoji: '🗡️',
    };
    const t = troopOf(ref, spec);
    expect(t).toHaveLength(3);
    const off = (offenseOf(ref[0]!) + offenseOf(ref[1]!)) / 2;
    const surv = (survivalOf(ref[0]!) + survivalOf(ref[1]!)) / 2;
    expect(t[0]!.combatant.pv).toBe(Math.round(off * 2));
    expect(t[0]!.combatant.damage).toBe(Math.round(surv * 100 * 0.25));
    expect(new Set(t.map((x) => x.id)).size).toBe(3);
    for (const x of t) expect(x.level).toBe(20);
    const fort = troopOf(ref, { ...spec, mult: 1.5 });
    expect(fort[0]!.combatant.pv).toBeGreaterThan(t[0]!.combatant.pv);
    expect(fort[0]!.combatant.damage).toBeGreaterThan(t[0]!.combatant.damage);
    expect(troopOf(ref, { ...spec, count: 5 })).toHaveLength(5);
  });
});

describe('🎓 skirmishXpShares — les abattus, partagés entre les présents', () => {
  const foes = [0, 1, 2].map((i) => u(`f${i}`, {}, 10));
  const tous = { foesDown: ['f0', 'f1', 'f2'] };

  it('la base d’épreuve est celle de missionXp', () => {
    expect(trialXpBase(10)).toBeCloseTo(22, 9);
  });
  it('le total est PARTAGÉ : à deux, chacun touche la moitié', () => {
    const plein = 3 * SKIRMISH.xpPerKill * trialXpBase(10);
    expect(skirmishXpShares([{ id: 'a', level: 10 }], foes, tous)['a']).toBe(Math.round(plein));
    const deux = skirmishXpShares(
      [
        { id: 'a', level: 10 },
        { id: 'b', level: 10 },
      ],
      foes,
      tous,
    );
    expect(deux['a']).toBe(Math.round(plein / 2));
    expect(deux['b']).toBe(Math.round(plein / 2));
  });
  it('seuls les ennemis ABATTUS comptent', () => {
    const un = skirmishXpShares([{ id: 'a', level: 10 }], foes, { foesDown: ['f1'] })['a'];
    expect(un).toBe(Math.round(SKIRMISH.xpPerKill * trialXpBase(10)));
    expect(skirmishXpShares([{ id: 'a', level: 10 }], foes, { foesDown: [] })['a']).toBe(0);
  });
  it('⚠️ un VÉTÉRAN sur un lieu faible gagne peu (rendement décroissant de missionXp)', () => {
    const vet = skirmishXpShares([{ id: 'v', level: 40 }], foes, tous)['v']!;
    const bleu = skirmishXpShares([{ id: 'r', level: 10 }], foes, tous)['r']!;
    expect(vet).toBeLessThan(bleu);
    expect(vet).toBe(Math.round(3 * SKIRMISH.xpPerKill * trialXpBase(10) * 0.25 ** 1.5));
  });
  it('⚠️ …et ne fait pas monter une RECRUE à sa place : un abattu vaut au plus niveau + marge', () => {
    const forts = [0, 1, 2].map((i) => u(`f${i}`, {}, 40));
    const r = skirmishXpShares([{ id: 'r', level: 5 }], forts, tous)['r'];
    expect(r).toBe(Math.round(3 * SKIRMISH.xpPerKill * trialXpBase(5 + SKIRMISH.carryMargin)));
  });
  it('⚠️ un VÉTÉRAN et une RECRUE PRÉSENTS ENSEMBLE : chacun sur SON niveau, jamais une moyenne', () => {
    // Sur un lieu de niveau 10 : le vétéran (40) reste bridé par SON rendement décroissant
    // (ratio 0,25), la recrue (10) touche sa part pleine (ratio 1) — si l'implémentation
    // moyennait les niveaux présents (25) avant de calculer le ratio, les deux toucheraient
    // la MÊME part, quel que soit leur propre niveau.
    const present = [
      { id: 'vet', level: 40 },
      { id: 'recruit', level: 10 },
    ];
    const shares = skirmishXpShares(present, foes, tous);
    const vetRatio = Math.max(0.15, Math.min(1, 10 / 40));
    const recruitRatio = Math.max(0.15, Math.min(1, 10 / 10));
    const vetExpected = Math.round(
      (3 * SKIRMISH.xpPerKill * trialXpBase(10) * vetRatio ** 1.5) / 2,
    );
    const recruitExpected = Math.round(
      (3 * SKIRMISH.xpPerKill * trialXpBase(10) * recruitRatio ** 1.5) / 2,
    );
    // Le total distribué EST la somme des calculs par membre, jamais une part moyennée :
    // le vétéran et la recrue ne touchent PAS la même chose.
    expect(shares['vet']).toBe(vetExpected);
    expect(shares['recruit']).toBe(recruitExpected);
    expect(shares['vet']).not.toBe(shares['recruit']);
    expect(shares['vet']).toBeLessThan(shares['recruit']);
  });
});
