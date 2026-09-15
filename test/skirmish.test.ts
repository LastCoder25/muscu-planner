import { describe, it, expect } from 'vitest';
import {
  SKIRMISH,
  cumulativeCuts,
  deriveSkirmish,
  skirmishXpShares,
  slainByAlly,
  trialXpBase,
  troopOf,
  type GroupFight,
  type SkirmishResult,
  type SkirmishUnit,
} from '@/lib/skirmish';
import { cutsFor } from '@/lib/siegeStage';
import {
  offenseOf,
  simulateCombat,
  survivalOf,
  type CombatEvent,
  type Combatant,
} from '@/lib/combat';

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
/** Un événement de journal écrit à la main : seuls les PV APRÈS l'événement comptent. */
const ev = (playerPv: number, monsterPv: number): CombatEvent => ({
  round: 1,
  who: 'player',
  type: 'hit',
  damage: 0,
  playerPv,
  monsterPv,
});

/** Un VRAI combat fondu (`simulateCombat`) entre le groupe et la troupe, puis la dérivation. */
function vrai(
  allies: SkirmishUnit[],
  foes: SkirmishUnit[],
  groupe: Partial<Combatant>,
  troupe: Partial<Combatant>,
  seed: number,
): { fight: GroupFight; r: SkirmishResult } {
  const g = c({ name: 'Groupe', ...groupe });
  const t = c({ name: 'Troupe', ...troupe });
  const res = simulateCombat(g, t, { seed, goldOnWin: 0 });
  const fight: GroupFight = { log: res.log, win: res.win, allyPv: g.pv, foePv: t.pv };
  return { fight, r: deriveSkirmish(fight, allies, foes, seed) };
}

/** Rejoue le journal INDÉPENDAMMENT : indice de l'événement où chaque borne est franchie
 *  (`Infinity` si jamais), au haut de marée des pertes — un soin ne relève personne. */
function franchissements(fight: GroupFight, cuts: number[], cote: 'foe' | 'ally'): number[] {
  const out = cuts.map(() => Infinity);
  const total = cote === 'foe' ? fight.foePv : fight.allyPv;
  let haut = 0;
  fight.log.forEach((e, k) => {
    const pv = cote === 'foe' ? e.monsterPv : e.playerPv;
    haut = Math.max(haut, Math.min(total, total - pv));
    cuts.forEach((cut, i) => {
      if (out[i] === Infinity && haut >= cut) out[i] = k;
    });
  });
  return out;
}

const trio = () => [
  u('a', { pv: 300, damage: 30 }),
  u('b', { pv: 200, damage: 60 }),
  u('c', { pv: 100, damage: 10, dodge: 0.2 }),
];
const bandits = () => [0, 1, 2, 3].map((i) => u(`f${i}`, { pv: 50, damage: 20 }, 12));
/** Un combat serré : victoires ET défaites, et du vol de vie (PV du groupe non monotones). */
const GROUPE = { pv: 500, damage: 30, lifesteal: 0.2 };
const TROUPE = { pv: 300, damage: 60 };

describe('✂️ cumulativeCuts — des bornes cumulées qui somment EXACTEMENT', () => {
  it('le dernier franchissement tombe pile au total, et les bornes ne redescendent jamais', () => {
    for (const [total, w] of [
      [1000, [1]],
      [1000, [3, 1, 2]],
      [7, [1, 1, 1, 1, 1]],
      [12345, [0.37, 1.2, 0.05, 2]],
    ] as [number, number[]][]) {
      const cuts = cumulativeCuts(total, w);
      expect(cuts).toHaveLength(w.length);
      expect(cuts[cuts.length - 1]).toBe(total);
      for (let i = 1; i < cuts.length; i++) expect(cuts[i]!).toBeGreaterThanOrEqual(cuts[i - 1]!);
    }
  });
  it('les parts suivent les POIDS', () => {
    expect(cumulativeCuts(600, [1, 2, 3])).toEqual([100, 300, 600]);
  });
  it('⚠️ des poids tous NULS (ou négatifs) valent des poids ÉGAUX', () => {
    expect(cumulativeCuts(600, [0, 0, 0])).toEqual([200, 400, 600]);
    expect(cumulativeCuts(600, [-1, 0, -5])).toEqual([200, 400, 600]);
  });
  it('⚠️ JAMAIS de borne à 0 : un corps ne tombe pas au premier événement sans être touché', () => {
    // 2 PV pour 5 corps : l'arrondi donnait une première borne à 0 — franchie par une esquive.
    const cuts = cumulativeCuts(2, [1, 1, 1, 1, 1]);
    expect(cuts[cuts.length - 1]).toBe(2);
    for (const x of cuts) expect(x).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i]!).toBeGreaterThanOrEqual(cuts[i - 1]!);
    // Un total nul reste nul (rien à répartir) : la borne ne ment pas en inventant 1 PV.
    expect(cumulativeCuts(0, [1, 1])).toEqual([0, 0]);
  });
  it('⚠️ à poids égaux, ce sont EXACTEMENT les bornes du rejeu de siège d’avant (source unique)', () => {
    // `cutsFor` délègue désormais ici : on compare donc à la formule qu'il portait, pour que
    // l'extraction ne décale aucun corps d'un rejeu de siège.
    const avant = (pv: number, n: number) =>
      Array.from({ length: n }, (_, i) => Math.round((pv * (i + 1)) / n));
    for (const [pv, n] of [
      [1000, 7],
      [12345, 6],
      [7, 5],
      [9999, 3],
      [83761, 11],
    ] as [number, number][]) {
      expect(cumulativeCuts(pv, Array<number>(n).fill(1))).toEqual(avant(pv, n));
      expect(cutsFor(pv, n)).toEqual(avant(pv, n));
    }
  });
});

describe('⚔️ deriveSkirmish — le groupe LU dans le journal du combat fondu', () => {
  it('est DÉTERMINISTE : même journal, même graine, même bataille', () => {
    const { fight } = vrai(trio(), bandits(), GROUPE, TROUPE, 9);
    expect(deriveSkirmish(fight, trio(), bandits(), 42)).toEqual(
      deriveSkirmish(fight, trio(), bandits(), 42),
    );
  });

  it('⚠️ l’issue EST celle du combat : la dérivation ne décide rien', () => {
    let v = 0;
    for (let s = 1; s <= 80; s++) {
      const { fight, r } = vrai(trio(), bandits(), GROUPE, TROUPE, s);
      expect(r.win, `graine ${s}`).toBe(fight.win);
      if (r.win) v++;
    }
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(80);
  });

  it('⚠️ un corps tombe EXACTEMENT quand sa borne est franchie, jamais deux fois ; tous en cas de victoire', () => {
    let victoires = 0;
    let defaites = 0;
    for (let s = 1; s <= 120; s++) {
      const { fight, r } = vrai(trio(), bandits(), GROUPE, TROUPE, s);
      expect(r.foeCuts).toEqual(cumulativeCuts(fight.foePv, [50, 50, 50, 50]));
      const attendu = franchissements(fight, r.foeCuts, 'foe');
      const tues = r.kills.filter((k) => k.victim.startsWith('f'));
      expect(new Set(tues.map((k) => k.victim)).size).toBe(tues.length);
      bandits().forEach((f, i) => {
        const k = tues.find((x) => x.victim === f.id);
        if (attendu[i] !== Infinity) expect(k?.at, `graine ${s} ${f.id}`).toBe(attendu[i]);
        else if (!fight.win) expect(k, `graine ${s} ${f.id}`).toBeUndefined();
        else expect(k?.at, `graine ${s} ${f.id}`).toBe(fight.log.length); // achevé au chrono
      });
      expect([...r.foesDown].sort()).toEqual(tues.map((k) => k.victim).sort());
      if (fight.win) {
        victoires++;
        expect(r.foesDown).toHaveLength(bandits().length);
      } else defaites++;
    }
    expect(victoires, 'aucune victoire : le test ne prouve rien').toBeGreaterThan(0);
    expect(defaites, 'aucune défaite : le test ne prouve rien').toBeGreaterThan(0);
  });

  it('⚠️ les alliés tombés sont EXACTEMENT ceux dont la borne est franchie ; tous en cas de défaite', () => {
    let defaites = 0;
    let victoiresAvecTombe = 0;
    for (let s = 1; s <= 120; s++) {
      const { fight, r } = vrai(trio(), bandits(), GROUPE, TROUPE, s);
      const attendu = franchissements(fight, r.allyCuts, 'ally');
      const chutes = r.kills.filter((k) => !k.victim.startsWith('f'));
      expect(new Set(chutes.map((k) => k.victim)).size).toBe(chutes.length);
      r.front.forEach((id, i) => {
        const k = chutes.find((x) => x.victim === id);
        if (attendu[i] !== Infinity) expect(k?.at, `graine ${s} ${id}`).toBe(attendu[i]);
        else if (fight.win) expect(k, `graine ${s} ${id}`).toBeUndefined();
        else expect(k?.at, `graine ${s} ${id}`).toBe(fight.log.length);
      });
      expect([...r.down].sort()).toEqual(chutes.map((k) => k.victim).sort());
      if (!fight.win) {
        defaites++;
        expect([...r.down].sort()).toEqual(['a', 'b', 'c']);
      } else if (r.down.length) victoiresAvecTombe++;
    }
    expect(defaites, 'aucune défaite : le test ne prouve rien').toBeGreaterThan(0);
    expect(
      victoiresAvecTombe,
      'aucun tombé dans une victoire : le test ne prouve rien',
    ).toBeGreaterThan(0);
  });

  it('⚠️ le TUEUR est toujours debout au moment du coup (au début de l’événement)', () => {
    for (let s = 1; s <= 120; s++) {
      const { r } = vrai(trio(), bandits(), GROUPE, TROUPE, s);
      const chute = new Map(r.kills.map((k) => [k.victim, k.at]));
      for (const k of r.kills) {
        const tombe = chute.get(k.killer);
        if (tombe !== undefined)
          expect(tombe, `graine ${s} ${k.killer}`).toBeGreaterThanOrEqual(k.at);
      }
      const par: Record<string, number> = {};
      for (const k of r.kills) par[k.killer] = (par[k.killer] ?? 0) + 1;
      expect(r.killsBy).toEqual(par);
    }
  });

  it('⚠️ un allié tombé plus tôt n’est plus jamais crédité (journal écrit à la main)', () => {
    // Le 1ᵉʳ du front (100 PV sur 200) tombe à l'événement 0 ; les bandits meurent APRÈS.
    const allies = [u('a', { pv: 100, damage: 50 }), u('b', { pv: 100, damage: 50 })];
    const foes = [u('f0', { pv: 50 }), u('f1', { pv: 50 })];
    const fight: GroupFight = {
      log: [ev(100, 100), ev(100, 50), ev(100, 0)],
      win: true,
      allyPv: 200,
      foePv: 100,
    };
    for (let s = 1; s <= 60; s++) {
      const r = deriveSkirmish(fight, allies, foes, s);
      const premier = r.front[0]!;
      expect(r.down).toEqual([premier]);
      for (const k of r.kills.filter((x) => x.victim.startsWith('f')))
        expect(k.killer, `graine ${s}`).not.toBe(premier);
    }
  });

  it('⚠️ un bandit abattu n’abat plus personne (journal écrit à la main)', () => {
    // f0 tombe à l'événement 0 ; les deux alliés tombent APRÈS : seul f1 peut les abattre.
    const allies = [u('a', { pv: 100 }), u('b', { pv: 100 })];
    const foes = [u('f0', { pv: 50 }), u('f1', { pv: 50 })];
    const fight: GroupFight = {
      log: [ev(200, 50), ev(100, 50), ev(0, 50)],
      win: false,
      allyPv: 200,
      foePv: 100,
    };
    for (let s = 1; s <= 60; s++) {
      const r = deriveSkirmish(fight, allies, foes, s);
      expect(r.foesDown).toEqual(['f0']);
      for (const k of r.kills.filter((x) => !x.victim.startsWith('f')))
        expect(k.killer, `graine ${s}`).toBe('f1');
    }
  });

  it('⚠️ le crédit suit l’OFFENSE de chaque unité : qui ne frappe pas n’abat personne', () => {
    const allies = [u('fort', { pv: 100, damage: 80 }), u('nul', { pv: 100, damage: 0 })];
    expect(offenseOf(allies[1]!.combatant)).toBe(0);
    let fort = 0;
    for (let s = 1; s <= 60; s++) {
      const { r } = vrai(allies, bandits(), { pv: 900, damage: 80 }, { pv: 200, damage: 5 }, s);
      expect(r.killsBy['nul'] ?? 0, `graine ${s}`).toBe(0);
      fort += r.killsBy['fort'] ?? 0;
    }
    expect(fort).toBeGreaterThan(0);
  });

  it('…et à offense double, deux fois plus d’abattus en moyenne', () => {
    const allies = [u('x2', { pv: 100, damage: 40 }), u('x1', { pv: 100, damage: 20 })];
    const foes = [0, 1, 2, 3, 4, 5].map((i) => u(`f${i}`, { pv: 10 }));
    const fight: GroupFight = {
      log: [0, 1, 2, 3, 4, 5].map((i) => ev(200, 60 - (i + 1) * 10)),
      win: true,
      allyPv: 200,
      foePv: 60,
    };
    let x2 = 0;
    let x1 = 0;
    for (let s = 1; s <= 600; s++) {
      const r = deriveSkirmish(fight, allies, foes, s);
      x2 += r.killsBy['x2'] ?? 0;
      x1 += r.killsBy['x1'] ?? 0;
    }
    expect(x2 / x1).toBeGreaterThan(1.7);
    expect(x2 / x1).toBeLessThan(2.3);
  });

  it('⚠️ les parts des alliés suivent leur SURVIE, dans un ordre de front tiré à la graine', () => {
    const allies = trio();
    const fight: GroupFight = { log: [ev(600, 100)], win: true, allyPv: 600, foePv: 100 };
    const premiers = new Set<string>();
    for (let s = 1; s <= 40; s++) {
      const r = deriveSkirmish(fight, allies, bandits(), s);
      expect([...r.front].sort()).toEqual(['a', 'b', 'c']);
      premiers.add(r.front[0]!);
      const poids = r.front.map((id) => survivalOf(allies.find((a) => a.id === id)!.combatant));
      expect(r.allyCuts).toEqual(cumulativeCuts(600, poids));
    }
    expect(premiers.size, 'le front ne change jamais : il n’est pas tiré').toBeGreaterThan(1);
  });

  it('⚠️ un DERNIER événement où les deux camps tombent est une DÉFAITE : tout le monde tombe', () => {
    const allies = [u('a', { pv: 100 }), u('b', { pv: 100 })];
    const foes = [u('f0', { pv: 50 }), u('f1', { pv: 50 })];
    const fight: GroupFight = {
      log: [ev(150, 50), ev(-5, -3)],
      win: false,
      allyPv: 200,
      foePv: 100,
    };
    const r = deriveSkirmish(fight, allies, foes, 3);
    expect(r.win).toBe(false);
    expect([...r.down].sort()).toEqual(['a', 'b']);
    expect([...r.foesDown].sort()).toEqual(['f0', 'f1']);
    expect(r.kills.find((k) => k.victim === 'f0')?.at).toBe(0);
    expect(r.kills.find((k) => k.victim === 'f1')?.at).toBe(1);
  });

  it('⚠️ au CHRONO : une défaite fait tomber les alliés encore debout, une victoire achève la troupe', () => {
    const allies = [u('a', { pv: 100, damage: 10 }), u('b', { pv: 100, damage: 10 })];
    const foes = [u('f0', { pv: 50 }), u('f1', { pv: 50 })];
    const log = [ev(150, 60)];
    const perdu = deriveSkirmish({ log, win: false, allyPv: 200, foePv: 100 }, allies, foes, 5);
    expect([...perdu.down].sort()).toEqual(['a', 'b']);
    expect(perdu.foesDown).toEqual([]);
    for (const k of perdu.kills) expect(['f0', 'f1']).toContain(k.killer);
    const gagne = deriveSkirmish({ log, win: true, allyPv: 200, foePv: 100 }, allies, foes, 5);
    expect([...gagne.foesDown].sort()).toEqual(['f0', 'f1']);
    expect(gagne.down).toEqual([]);
    for (const k of gagne.kills) expect(['a', 'b']).toContain(k.killer);
  });

  it('bords : troupe vide = victoire sans mort ; groupe vide = défaite', () => {
    const f: GroupFight = { log: [], win: true, allyPv: 100, foePv: 1 };
    expect(deriveSkirmish(f, [u('a')], [], 1)).toMatchObject({ win: true, kills: [] });
    expect(deriveSkirmish({ ...f, win: false }, [], [u('f0')], 1)).toMatchObject({
      win: false,
      down: [],
    });
  });

  it('⚠️ un camp VIDE ne plante pas, même quand le journal fait tomber quelqu’un en face', () => {
    // Sans allié, les corps franchissent leur borne : il n'y a personne à créditer, mais la
    // chute reste inscrite. Avant, `pick` rendait `undefined` et `killer.id` levait.
    const foes = [u('f0', { pv: 50 }), u('f1', { pv: 50 })];
    const sansAllie: GroupFight = { log: [ev(0, 40), ev(0, 0)], win: true, allyPv: 0, foePv: 100 };
    const r = deriveSkirmish(sansAllie, [], foes, 7);
    expect([...r.foesDown].sort()).toEqual(['f0', 'f1']);
    expect(r.kills).toEqual([]);
    expect(r.killsBy).toEqual({});
    // Et symétriquement, sans ennemi : les alliés qui tombent n'ont pas de tueur.
    const allies = [u('a', { pv: 100 }), u('b', { pv: 100 })];
    const sansEnnemi: GroupFight = { log: [ev(0, 0)], win: false, allyPv: 200, foePv: 0 };
    const p = deriveSkirmish(sansEnnemi, allies, [], 7);
    expect([...p.down].sort()).toEqual(['a', 'b']);
    expect(p.kills).toEqual([]);
  });
});

describe('🗡️ troopOf — UNE seule force de troupe : le combattant fondu, réparti en corps', () => {
  const spec = { count: 3, level: 20, name: 'Bandit', emoji: '🗡️' };

  it('⚠️ la somme des PV ET des dégâts des corps vaut EXACTEMENT ceux du combattant fondu', () => {
    for (const [pv, damage, count] of [
      [1000, 90, 3],
      [12345, 777, 5],
      [7, 2, 4],
      [83761, 5, 11],
      [1, 1, 3],
    ] as [number, number, number][]) {
      const foe = c({ pv, damage, crit: 0.13, dodge: 0.07, initiative: 9, lifesteal: 0.1 });
      const t = troopOf(foe, { ...spec, count });
      expect(t).toHaveLength(count);
      expect(
        t.reduce((s, x) => s + x.combatant.pv, 0),
        `pv ${pv}/${count}`,
      ).toBe(pv);
      expect(
        t.reduce((s, x) => s + x.combatant.damage, 0),
        `dmg ${damage}/${count}`,
      ).toBe(damage);
      expect(new Set(t.map((x) => x.id)).size).toBe(count);
      for (const x of t) {
        expect(x.level).toBe(20);
        // Le reste du combattant EST celui du combat fondu, pas une valeur inventée.
        expect(x.combatant).toMatchObject({
          crit: 0.13,
          dodge: 0.07,
          initiative: 9,
          lifesteal: 0.1,
        });
      }
    }
  });

  it('à parts ÉGALES : les PV des corps redonnent au chiffre près les bornes à poids égaux', () => {
    // `deriveSkirmish` prend les PV des corps pour poids : l'issue et le journal ne bougent pas.
    for (const [pv, count] of [
      [1000, 3],
      [12345, 6],
      [9999, 7],
      [83761, 11],
    ] as [number, number][]) {
      const t = troopOf(c({ pv }), { ...spec, count });
      expect(
        cumulativeCuts(
          pv,
          t.map((x) => x.combatant.pv),
        ),
      ).toEqual(cumulativeCuts(pv, new Array<number>(count).fill(1)));
    }
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
  it('⚠️ le rendement décroissant a un PLANCHER (0,15) : un très haut vétéran touche encore', () => {
    // Niveau 100 sur des ennemis de niveau 10 : ratio brut 0,1, relevé à 0,15.
    const tresVieux = skirmishXpShares([{ id: 'v', level: 100 }], foes, tous)['v'];
    expect(tresVieux).toBe(Math.round(3 * SKIRMISH.xpPerKill * trialXpBase(10) * 0.15 ** 1.5));
    expect(tresVieux).toBeGreaterThan(0);
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

describe('🛡️ ABATTUS PAR ALLIÉ — jamais ceux de la TROUPE, même en cas de collision d’id', () => {
  it('crédite un allié pour un corps de troupe abattu, jamais pour un allié abattu', () => {
    const escort = [{ id: 'a0' }, { id: 'a1' }];
    const d = {
      foesDown: ['t0'],
      kills: [
        { at: 0, killer: 'a0', victim: 't0' }, // a0 abat un corps de troupe → compte
        { at: 1, killer: 't1', victim: 'a1' }, // un corps de troupe abat un allié → jamais
      ],
    };
    expect(slainByAlly(escort, d)).toEqual({ a0: 1, a1: 0 });
  });

  it('⚠️ COLLISION D’ID (`foe0`) : un aventurier ne vole aucun abattu au corps de troupe qui porte le même id', () => {
    // `troopOf` nomme TOUJOURS ses corps `foe0`/`foe1`/`foe2` — un aventurier qui porterait
    // le même id ne doit jamais hériter des abattus que CE corps de troupe a scorés contre
    // un AUTRE allié : c'est la victime qui décide, jamais le nom du tueur.
    const escort = [{ id: 'foe0' }, { id: 'a1' }];
    const d = {
      foesDown: ['foe1'], // seul le corps de troupe foe1 est mort
      kills: [
        // le corps de troupe 'foe0' abat 'a1' → jamais crédité à l'aventurier 'foe0'
        { at: 0, killer: 'foe0', victim: 'a1' },
        // 'a1' abat le corps 'foe1' → compte
        { at: 1, killer: 'a1', victim: 'foe1' },
      ],
    };
    expect(slainByAlly(escort, d)).toEqual({ foe0: 0, a1: 1 });
  });

  it('un tueur étranger à l’escorte n’ajoute jamais de clé au résultat', () => {
    const escort = [{ id: 'a0' }];
    const d = { foesDown: ['t0'], kills: [{ at: 0, killer: 't1', victim: 't0' }] };
    expect(slainByAlly(escort, d)).toEqual({ a0: 0 });
  });
});
