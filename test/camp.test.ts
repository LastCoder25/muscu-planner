import { describe, it, expect } from 'vitest';
import {
  CAMP,
  HERO_UNIT_ID,
  campBodies,
  campFightSeed,
  campFoe,
  campForecastSeed,
  campGroupHaul,
  campHurt,
  campWinPct,
  canSendParty,
  partyLegMin,
  partyReport,
  resolveCamp,
  startParty,
  type PartyInput,
} from '@/lib/camp';
import {
  HARVEST,
  goldCost,
  harvestYield,
  travelFactor,
  travelOneWayMin,
  type Poi,
} from '@/lib/expedition';
import {
  CARAVAN,
  caravanLegMin,
  missionTravelMult,
  missionXp,
  refAdvGear,
  refAdventurer,
  refCompanions,
  roadPairs,
  roadUnits,
  type RoadCompanions,
} from '@/lib/caravan';
import { deriveSkirmish, fuseUnits, skirmishXpShares } from '@/lib/skirmish';
import {
  mulberry32,
  offenseOf,
  survivalOf,
  playerCombatant,
  simulateCombat,
  type Combatant,
} from '@/lib/combat';
import { factionRoster, type RaidFaction } from '@/lib/raid';
import type { Adventurer } from '@/lib/adventurers';

const poi = (over: Partial<Poi> = {}): Poi => ({
  id: 'cp',
  type: 'camp',
  level: 20,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const team = (n: number, level: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(level, i),
    id: `adv_${i}`,
    familiarId: `refFam${i % 3}`,
    // ⚠️ 4 emplacements depuis la v0.881 : sans la relique, le fixture ne correspondrait
    // plus à `refAdvGear` / `refEscortUnits`.
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const road = (level: number, n: number): RoadCompanions => ({
  familiars: refCompanions(level),
  talents: [],
  advGear: refAdvGear(level, n),
});
/** Les unités d'une escorte — la signature RÉELLE : `roadUnits(escort, roadPairs(escort, road))`. */
const units = (esc: Adventurer[], rd: RoadCompanions) => roadUnits(esc, roadPairs(esc, rd));
const input = (over: Partial<PartyInput> = {}): PartyInput => {
  const L = over.poi?.level ?? 20;
  const n = over.escort?.length ?? 3;
  return {
    poi: poi(),
    spec: { faction: 'bandits', size: 3 },
    escort: team(3, L),
    road: road(L, n),
    hero: null,
    seed: 11,
    playerLevel: L,
    ...over,
  };
};
const fort = (L: number) => ({
  name: 'Héros',
  level: L,
  combatant: playerCombatant('Héros', { puissance: 5000, endurance: 5000, agilite: 5000 }, L),
});

describe('🗡️ campFoe — danger ABSOLU, linéaire en taille, identique d’une faction à l’autre', () => {
  it('ne dépend que du niveau et de la taille', () => {
    expect(campFoe(poi(), { faction: 'bandits', size: 3 })).toEqual(
      campFoe(poi({ x: 1, distNorm: 0.9, id: 'autre' }), { faction: 'bandits', size: 3 }),
    );
    expect(campFoe(poi({ level: 60 }), { faction: 'bandits', size: 3 }).pv).toBeGreaterThan(
      campFoe(poi({ level: 20 }), { faction: 'bandits', size: 3 }).pv,
    );
  });
  it('⚠️ deux fois plus gros = deux fois plus de PV et de dégâts', () => {
    const a = campFoe(poi(), { faction: 'betes', size: 3 });
    const b = campFoe(poi(), { faction: 'betes', size: 6 });
    expect(b.pv / a.pv).toBeCloseTo(2, 1);
    expect(b.damage / a.damage).toBeCloseTo(2, 1);
  });
  it('⚠️ ISO-MENACE : la faction ne change que les NOMS, jamais la force', () => {
    const f = (x: RaidFaction) => campFoe(poi(), { faction: x, size: 5 });
    expect({ ...f('betes'), name: '' }).toEqual({ ...f('bandits'), name: '' });
    expect({ ...f('mortsvivants'), name: '' }).toEqual({ ...f('bandits'), name: '' });
  });
  it('calibré sur la RÉFÉRENCE : PV = offense du trio de référence × pvTurns × taille/3', () => {
    const L = 30;
    const ref = fuseUnits(units(team(CARAVAN.refEscort, L), road(L, CARAVAN.refEscort)), 'r');
    const f = campFoe(poi({ level: L }), { faction: 'bandits', size: 6 });
    expect(f.pv).toBe(Math.max(1, Math.round(Math.max(1, offenseOf(ref)) * CAMP.pvTurns * 2)));
    expect(f.damage).toBe(Math.max(1, Math.round(survivalOf(ref) * 100 * CAMP.dmgPctPv * 2)));
  });
});

describe('⚰️ campBodies — les corps sont la force du combat, répartie', () => {
  it('⚠️ Σ PV et Σ dégâts des corps = ceux de l’ennemi fondu', () => {
    for (const L of [1, 20, 80])
      for (const type of ['camp', 'lair'] as const)
        for (const size of [2, 5, 10]) {
          const spec = { faction: 'mortsvivants' as const, size };
          const p = poi({ level: L, type });
          const foe = campFoe(p, spec);
          const b = campBodies(p, spec);
          expect(b.reduce((s, x) => s + x.combatant.pv, 0)).toBe(foe.pv);
          expect(b.reduce((s, x) => s + x.combatant.damage, 0)).toBe(foe.damage);
          for (const x of b) {
            expect(x.combatant.pv).toBeGreaterThan(0);
            expect(x.combatant.damage).toBeGreaterThan(0);
          }
        }
  });
  it('camp = troupe + CHEF, repaire = troupe + CHAMPION ; ids uniques ; niveau du lieu', () => {
    const c = campBodies(poi(), { faction: 'bandits', size: 3 });
    const l = campBodies(poi({ type: 'lair' }), { faction: 'bandits', size: 3 });
    const roster = factionRoster('bandits');
    expect(c).toHaveLength(3 + 1);
    expect(c[c.length - 1]!.name).toBe(roster[roster.length - 1]!.name);
    expect(c[0]!.name).toBe(roster[0]!.name);
    expect(c[1]!.name).toBe(roster[1]!.name);
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
    for (const x of c) expect(x.level).toBe(20);
    // Le champion d'un repaire pèse plus que le chef d'un camp, à taille égale.
    expect(l[l.length - 1]!.combatant.pv).toBeGreaterThan(c[c.length - 1]!.combatant.pv);
    // Le chef pèse plus qu'un corps de troupe.
    expect(c[c.length - 1]!.combatant.pv).toBeGreaterThan(c[0]!.combatant.pv);
  });
});

describe('⚰️ campBodies — un ennemi minuscule garde des sommes EXACTES', () => {
  it('⚠️ total < nombre de parts : Σ exactes, jamais négatif ni NaN (un corps à 0 est admis)', () => {
    const tiny = (pv: number, damage: number): Combatant => ({
      name: 'x',
      pv,
      damage,
      crit: 0.08,
      dodge: 0.05,
      initiative: 12,
    });
    let zero = 0;
    for (const type of ['camp', 'lair'] as const)
      for (const size of [2, 5, 10])
        for (const [pv, damage] of [
          [1, 1],
          [3, 2],
          [5, 0],
          [7, 3],
        ] as const) {
          const b = campBodies(poi({ type }), { faction: 'betes', size }, tiny(pv, damage));
          expect(b.reduce((s, x) => s + x.combatant.pv, 0)).toBe(pv);
          expect(b.reduce((s, x) => s + x.combatant.damage, 0)).toBe(damage);
          for (const x of b) {
            for (const v of [x.combatant.pv, x.combatant.damage]) {
              expect(Number.isInteger(v)).toBe(true);
              expect(v).toBeGreaterThanOrEqual(0);
            }
            if (x.combatant.damage === 0) zero++;
          }
        }
    expect(zero, 'aucun corps à 0 : le cas limite n’est pas exercé').toBeGreaterThan(0);
  });
});

describe('🎲 graines — le pronostic ne rejoue JAMAIS le vrai combat', () => {
  it('⚠️ aucune graine d’échantillon n’égale celle du vrai combat, quelle que soit la graine', () => {
    const forecast = new Set(Array.from({ length: 500 }, (_, i) => campForecastSeed(i)));
    expect(forecast.size, 'échantillons répétés').toBe(500);
    const seeds = [0, 1, 11, 119, 2 ** 31, 2 ** 32 - 1, 2 ** 32 - 17, 2 ** 31 - 17];
    const r = mulberry32(99);
    for (let i = 0; i < 3000; i++) seeds.push(Math.floor(r() * 2 ** 32));
    for (let i = 0; i < 2000; i++) seeds.push(i);
    for (const s of seeds) expect(forecast.has(campFightSeed(s)), `graine ${s}`).toBe(false);
    // La PREUVE (et pas seulement l'échantillon) : combat pair, pronostic impair.
    for (const s of seeds) expect(campFightSeed(s) % 2, `graine ${s}`).toBe(0);
    for (const f of forecast) expect(f % 2).toBe(1);
  });
  it('resolveCamp combat sur campFightSeed ; campWinPct échantillonne campForecastSeed', () => {
    const inp0 = input({ spec: { faction: 'betes', size: 4 } });
    const allies = units(inp0.escort, inp0.road);
    const group = fuseUnits(allies, 'Groupe');
    const foe = campFoe(inp0.poi, inp0.spec);
    const bodies = campBodies(inp0.poi, inp0.spec);
    let differ = 0;
    for (let s = 1; s <= 40; s++) {
      const o = resolveCamp({ ...inp0, seed: s });
      const fight = simulateCombat(group, foe, { seed: campFightSeed(s), goldOnWin: 0 });
      const d = deriveSkirmish(
        { log: fight.log, win: fight.win, allyPv: group.pv, foePv: foe.pv },
        allies,
        bodies,
        s,
      );
      expect(o.party!.win, `graine ${s}`).toBe(fight.win);
      expect(o.party!.foesDown).toEqual(d.foesDown);
      expect(o.party!.hurt).toEqual(d.win ? [] : d.down);
      if (
        simulateCombat(group, foe, { seed: s + 17, goldOnWin: 0 }).log.length !== fight.log.length
      )
        differ++;
    }
    expect(differ, 'graines indiscernables : le test ne prouve rien').toBeGreaterThan(0);
    let w = 0;
    for (let i = 0; i < 60; i++)
      if (simulateCombat(group, foe, { seed: campForecastSeed(i), goldOnWin: 0 }).win) w++;
    expect(campWinPct(inp0.poi, inp0.spec, allies, 60)).toBe(w / 60);
  });
});

describe('⚔️ resolveCamp — un combat fondu, le groupe lu dans son journal', () => {
  it('est déterministe', () => {
    expect(resolveCamp(input())).toEqual(resolveCamp(input()));
  });

  it('⚠️ AUCUNE taille maximale : dix aventuriers partent, et pèsent', () => {
    expect(canSendParty(poi(), 12, false)).toBe(true);
    expect(canSendParty(poi(), 0, true)).toBe(true);
    expect(canSendParty(poi(), 0, false)).toBe(false);
    expect(canSendParty(poi({ type: 'wreck' }), 3, false)).toBe(false);
    const L = 30;
    const spec = { faction: 'bandits' as const, size: 10 };
    const p = poi({ level: L, type: 'lair' });
    const trois = campWinPct(p, spec, units(team(3, L), road(L, 3)), 120);
    const dix = campWinPct(p, spec, units(team(10, L), road(L, 10)), 120);
    expect(dix).toBeGreaterThan(trois);
  });

  it('les abattus du journal : Σ par aventurier + héros = abattus', () => {
    for (let s = 1; s <= 30; s++) {
      const o = resolveCamp(input({ seed: s, hero: fort(20) }));
      const r = o.party!;
      const somme = Object.values(r.kills).reduce((a, b) => a + b, 0) + r.heroKills;
      expect(somme).toBe(r.slain);
      expect(r.slain).toBe(r.foesDown.length);
      expect(r.foes).toBe(CAMP.refGroup + 1);
    }
  });

  it('⚠️ le HÉROS ne prend PAS de part d’XP : les aventuriers partagent entre eux', () => {
    const esc = team(2, 20);
    for (const distNorm of [0.5, 0.9])
      for (let s = 1; s <= 20; s++) {
        const inp = input({
          seed: s,
          poi: poi({ distNorm }),
          escort: esc,
          road: road(20, 2),
          hero: fort(20),
        });
        const o = resolveCamp(inp);
        const parts = skirmishXpShares(esc, campBodies(inp.poi, inp.spec), {
          foesDown: o.party!.foesDown,
        });
        // La part des abattus suit la DISTANCE comme le socle, exactement comme un convoi.
        const travel = missionTravelMult(inp.poi);
        for (const a of esc)
          expect(o.party!.xp[a.id]).toBe(
            missionXp(a, inp.poi) + Math.round((parts[a.id] ?? 0) * travel),
          );
        expect(o.party!.xp[HERO_UNIT_ID]).toBeUndefined();
      }
  });

  it('⚠️ INFIRMERIE DES CAMPS : défaite → TOUS les aventuriers tombés ; victoire → personne', () => {
    let defaites = 0;
    let victoires = 0;
    for (let s = 1; s <= 60; s++) {
      const o = resolveCamp(input({ seed: s, spec: { faction: 'betes', size: 4 } }));
      if (o.party!.win) {
        victoires++;
        expect(o.party!.hurt).toEqual([]);
      } else {
        defaites++;
        expect([...o.party!.hurt].sort()).toEqual(['adv_0', 'adv_1', 'adv_2']);
      }
    }
    expect(defaites, 'aucune défaite : le test ne prouve rien').toBeGreaterThan(0);
    expect(victoires, 'aucune victoire : le test ne prouve rien').toBeGreaterThan(0);
    expect(campHurt({ win: false, down: ['hero', 'adv_0'] }, [{ id: 'adv_0' }])).toEqual(['adv_0']);
  });

  it('AVEC le héros : le butin actuel du camp, aucune pièce d’aventurier, le héros jamais blessé', () => {
    const o = resolveCamp(input({ hero: fort(20), spec: { faction: 'bandits', size: 2 } }));
    expect(o.party!.hero).toBe(true);
    expect(o.party!.win).toBe(true);
    expect(o.party!.advGear).toEqual([]);
    expect(o.party!.hurt).not.toContain(HERO_UNIT_ID);
    expect(o.gold).toBeGreaterThanOrEqual(goldCost('camp', 20));
  });

  it('SANS le héros, victoire : or, pierres, pièces d’aventurier ; jamais d’objet du héros ni de ferraille', () => {
    const L = 60;
    const inp = input({
      poi: poi({ level: 5, type: 'lair' }),
      escort: team(10, L),
      road: road(L, 10),
      spec: { faction: 'mortsvivants', size: 5 },
      playerLevel: L,
    });
    const o = resolveCamp(inp);
    expect(o.party!.win).toBe(true);
    expect(o.items ?? []).toEqual([]);
    expect(o.item).toBeNull();
    expect(o.gold).toBeGreaterThan(0);
    // ⚠️ Les camps ne donnent JAMAIS de ferraille (v0.856 / v0.890 : épave et Fonderie seules).
    expect(o.scrap).toBe(0);
    expect(o.summonStones).toBeGreaterThan(0);
    expect(o.party!.advGear).toHaveLength(CAMP.lairPieces);
    expect(o.party!.wages).toBeGreaterThan(0);
  });

  it('SANS le héros, défaite : rien à ramener, et le socle d’XP tombe quand même', () => {
    const inp = input({
      escort: team(1, 5),
      road: road(5, 1),
      poi: poi({ level: 40 }),
      spec: { faction: 'bandits', size: 4 },
    });
    const o = resolveCamp(inp);
    expect(o.party!.win).toBe(false);
    expect(o.gold + o.scrap + o.summonStones + o.key).toBe(0);
    expect(o.party!.advGear).toEqual([]);
    expect(o.party!.xp['adv_0']!).toBeGreaterThanOrEqual(missionXp(inp.escort[0]!, inp.poi));
  });

  it('⚠️ GÉNÉRATEUR SÉPARÉ : les pièces ne décalent pas la clé du butin de groupe', () => {
    // La clé d'un camp non-bêtes est le PREMIER tirage de `rng` après la résolution.
    let cles = 0;
    for (let s = 1; s <= 200; s++) {
      const inp = input({
        seed: s,
        poi: poi({ level: 5 }),
        escort: team(6, 60),
        road: road(60, 6),
        spec: { faction: 'bandits', size: 2 },
        playerLevel: 60,
      });
      const o = resolveCamp(inp);
      if (!o.party!.win) continue;
      const attendue = mulberry32(s >>> 0 || 1)() < HARVEST.keyChance ? 1 : 0;
      expect(o.key, `graine ${s}`).toBe(attendue);
      cles += attendue;
    }
    expect(cles, 'aucune clé : le test ne prouve rien').toBeGreaterThan(0);
  });

  it('le JOURNAL raconte, borné', () => {
    const o = resolveCamp(
      input({
        escort: team(8, 40),
        road: road(40, 8),
        poi: poi({ level: 40, type: 'lair' }),
        spec: { faction: 'betes', size: 10 },
      }),
    );
    expect(o.party!.journal.length).toBeGreaterThan(0);
    expect(o.party!.journal.length).toBeLessThanOrEqual(CAMP.journalMax + 1);
  });

  it('⚠️ le JOURNAL est TRONQUÉ au-delà de journalMax, avec le reste compté', () => {
    const o = resolveCamp(
      input({
        escort: team(10, 60),
        road: road(60, 10),
        poi: poi({ level: 5, type: 'lair' }),
        spec: { faction: 'betes', size: CAMP.journalMax + 20 },
        playerLevel: 60,
      }),
    );
    const r = o.party!;
    expect(r.win).toBe(true);
    // Chaque corps abattu a une ligne : il y en a plus que la borne.
    expect(r.slain).toBeGreaterThan(CAMP.journalMax);
    expect(r.journal).toHaveLength(CAMP.journalMax + 1);
    const last = r.journal[CAMP.journalMax]!;
    expect(last).toMatch(/^… et \d+ de plus\.$/);
    // Au moins une ligne par corps abattu : le reste compté couvre tout ce qui dépasse.
    expect(Number(last.match(/\d+/)![0])).toBeGreaterThanOrEqual(r.slain - CAMP.journalMax);
    for (const line of r.journal.slice(0, CAMP.journalMax)) expect(line).not.toMatch(/^… et/);
  });
});

describe('🧭 trajet et départ d’un groupe', () => {
  const esc = team(3, 20);
  it('héros seul = trajet du héros ; avec des aventuriers = le plus lent des deux', () => {
    const p = poi();
    const hero = Math.round(travelOneWayMin(p.level, p.distNorm) * 0.8);
    expect(
      partyLegMin(p, [], { hero: true, travelMult: 0.8, comptoirLevel: 0, gearSpeed: 0 }),
    ).toBe(hero);
    const adv = caravanLegMin(p, esc, 4, 0);
    expect(
      partyLegMin(p, esc, { hero: true, travelMult: 0.8, comptoirLevel: 4, gearSpeed: 0 }),
    ).toBe(Math.max(hero, adv));
    expect(
      partyLegMin(p, esc, { hero: false, travelMult: 0.8, comptoirLevel: 4, gearSpeed: 0 }),
    ).toBe(adv);
  });
  it('startParty : le rapport à l’arrivée, le retour à 2 × la jambe, coût d’or seulement avec le héros', () => {
    const a = startParty(input({ hero: fort(20) }), 1000, 30);
    expect(a.midAt).toBe(1000 + 30 * 60_000);
    expect(a.returnAt).toBe(1000 + 60 * 60_000);
    expect(a.goldCost).toBe(goldCost('camp', 20));
    expect(a.outcome.party).toBeDefined();
    expect(startParty(input(), 1000, 30).goldCost).toBe(0);
  });
});

describe('💰 butin de groupe : dérivé des sources existantes', () => {
  it('pierres = part du sanctuaire, clés des bêtes = archives, les bandits paient en or ; jamais de ferraille', () => {
    const p = poi({ level: 30 });
    const tfH = travelFactor((2 * travelOneWayMin(30, 0.5)) / 60);
    const k = 3 / CAMP.refGroup;
    const b = campGroupHaul(p, { faction: 'betes', size: 3 }, mulberry32(1));
    expect(b.key).toBe(harvestYield('archive', 30, tfH).keys);
    expect(b.summonStones).toBe(0);
    const m = campGroupHaul(p, { faction: 'mortsvivants', size: 3 }, mulberry32(1));
    expect(m.summonStones).toBe(
      Math.round(harvestYield('shrine', 30, tfH).summonStones * CAMP.stoneShare * k),
    );
    const bd = campGroupHaul(p, { faction: 'bandits', size: 3 }, mulberry32(1));
    expect(bd.gold).toBeGreaterThan(m.gold);
    expect(bd.gold / m.gold).toBeCloseTo(CAMP.banditGoldMult, 1);
    for (const h of [b, m, bd]) expect('scrap' in h).toBe(false);
  });
});

describe('📜 partyReport — ce qu’on lit dans la boîte', () => {
  it('membres, abattus, XP, blessés ; un aventurier renvoyé garde sa ligne', () => {
    const esc = team(3, 20);
    const o = resolveCamp(input({ escort: esc, road: road(20, 3), seed: 4 }));
    const r = partyReport(o.party!, esc.slice(0, 2));
    expect(r.members.map((m) => m.id)).toEqual(['adv_0', 'adv_1', 'adv_2']);
    expect(r.members[2]!.gone).toBe(true);
    expect(r.members[0]!.gone).toBe(false);
    expect(r.totalXp).toBe(r.members.reduce((s, m) => s + m.xp, 0));
    expect(r.members.reduce((s, m) => s + m.kills, 0) + r.heroKills).toBe(r.slain);
    for (const m of r.members) expect(m.hurt).toBe(o.party!.hurt.includes(m.id));
    expect(r.factionLabel).toBe('Bandits');
    expect(r.wages).toBe(Math.round(o.party!.wages));
  });

  it('⚠️ une DÉFAITE : les blessés sont bien marqués (le cas n’est pas vide)', () => {
    // Sans ce cas, « hurt » n'était vérifié que sur une victoire où personne ne tombe :
    // un rapport qui ne marquait jamais personne passait au vert.
    const esc = team(2, 20);
    const o = resolveCamp(
      input({
        escort: esc,
        road: road(20, 2),
        poi: poi({ type: 'lair' }),
        spec: { faction: 'bandits', size: 10 },
      }),
    );
    expect(o.party!.win).toBe(false);
    expect(o.party!.hurt.length, 'aucun blessé : le cas n’est pas exercé').toBeGreaterThan(0);
    const r = partyReport(o.party!, esc);
    for (const m of r.members) expect(m.hurt).toBe(o.party!.hurt.includes(m.id));
    expect(r.members.some((m) => m.hurt)).toBe(true);
  });
});
