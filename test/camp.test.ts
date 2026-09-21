import { describe, it, expect } from 'vitest';
import {
  CAMP,
  campBodies,
  campFoe,
  campGroupHaul,
  campHurt,
  campRewardLabel,
  campWinPct,
  resolveCamp,
  type PartyInput,
} from '@/lib/camp';
import {
  canSendParty,
  normalizeParties,
  PARTY_HERO_BLOCK_LABEL,
  partyClaimRoster,
  partyHeroBlocker,
  partyHeroToll,
  partyLegMin,
  partyReport,
  partySendBlocker,
  PARTY_SEND_BLOCK_LABEL,
  settleParties,
  startParty,
  type ActiveParty,
  partyFightSeed,
  partyForecastSeed,
} from '@/lib/party';
import {
  HERO_UNIT_ID,
  HERO_PARTY_WORTH,
  heroPartyCombatant,
  partyAllies,
  refEscortUnits,
} from '@/lib/caravan';
import {
  buildMessage,
  campSpecOf,
  goldCost,
  harvestYield,
  travelFactor,
  travelOneWayMin,
  type ExpeditionMessage,
  type PartyResult,
  type Poi,
} from '@/lib/expedition';

import {
  CARAVAN,
  caravanHurtMs,
  caravanLegMin,
  missionXp,
  missionXpFor,
  refAdvGear,
  refChampionAdv,
  escortGear,
  roadUnits,
  type EscortKit,
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
import { grantAdvXp, type Adventurer } from '@/lib/adventurers';

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
    ...refChampionAdv(level, i),
    id: `adv_${i}`,
    // ⚠️ 4 emplacements depuis la v0.881 : sans la relique, le fixture ne correspondrait
    // plus à `refAdvGear` / `refEscortUnits`.
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const road = (level: number, n: number): EscortKit => ({
  talents: [],
  advGear: refAdvGear(level, n),
});
/** Les unités d'une escorte — la signature RÉELLE : `roadUnits(escort, escortGear(escort, road))`. */
const units = (esc: Adventurer[], rd: EscortKit) => roadUnits(esc, escortGear(esc, rd));
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
    const forecast = new Set(Array.from({ length: 500 }, (_, i) => partyForecastSeed(i)));
    expect(forecast.size, 'échantillons répétés').toBe(500);
    const seeds = [0, 1, 11, 119, 2 ** 31, 2 ** 32 - 1, 2 ** 32 - 17, 2 ** 31 - 17];
    const r = mulberry32(99);
    for (let i = 0; i < 3000; i++) seeds.push(Math.floor(r() * 2 ** 32));
    for (let i = 0; i < 2000; i++) seeds.push(i);
    for (const s of seeds) expect(forecast.has(partyFightSeed(s)), `graine ${s}`).toBe(false);
    // La PREUVE (et pas seulement l'échantillon) : combat pair, pronostic impair.
    for (const s of seeds) expect(partyFightSeed(s) % 2, `graine ${s}`).toBe(0);
    for (const f of forecast) expect(f % 2).toBe(1);
  });
  it('resolveCamp combat sur partyFightSeed ; campWinPct échantillonne partyForecastSeed', () => {
    const inp0 = input({ spec: { faction: 'betes', size: 4 } });
    const allies = units(inp0.escort, inp0.road);
    const group = fuseUnits(allies, 'Groupe');
    const foe = campFoe(inp0.poi, inp0.spec);
    const bodies = campBodies(inp0.poi, inp0.spec);
    let differ = 0;
    for (let s = 1; s <= 40; s++) {
      const o = resolveCamp({ ...inp0, seed: s });
      const fight = simulateCombat(group, foe, { seed: partyFightSeed(s), goldOnWin: 0 });
      const d = deriveSkirmish(
        { log: fight.log, win: fight.win, allyPv: group.pv, foePv: foe.pv },
        allies,
        bodies,
        s,
      );
      expect(o.party!.win, `graine ${s}`).toBe(fight.win);
      expect(o.party!.slain).toBe(d.foesDown.length);
      expect(o.party!.hurt).toEqual(d.win ? [] : d.down);
      if (
        simulateCombat(group, foe, { seed: s + 17, goldOnWin: 0 }).log.length !== fight.log.length
      )
        differ++;
    }
    expect(differ, 'graines indiscernables : le test ne prouve rien').toBeGreaterThan(0);
    let w = 0;
    for (let i = 0; i < 60; i++)
      if (simulateCombat(group, foe, { seed: partyForecastSeed(i), goldOnWin: 0 }).win) w++;
    expect(campWinPct(inp0.poi, inp0.spec, allies, 60)).toBe(w / 60);
  });
});

describe('⚔️ resolveCamp — un combat fondu, le groupe lu dans son journal', () => {
  it('est déterministe', () => {
    expect(resolveCamp(input())).toEqual(resolveCamp(input()));
  });

  it('⚠️ AUCUNE taille maximale : dix aventuriers partent, et pèsent', () => {
    expect(canSendParty(poi(), 12, false, 1)).toBe(true);
    expect(canSendParty(poi(), 0, true, 0)).toBe(true);
    expect(canSendParty(poi(), 0, false, 1)).toBe(false);
    expect(canSendParty(poi({ type: 'wreck' }), 3, false, 1)).toBe(false);
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
        const allies = partyAllies(esc, inp.road, inp.hero);
        const foe = campFoe(inp.poi, inp.spec);
        const bodies = campBodies(inp.poi, inp.spec);
        const group = fuseUnits(allies, 'Groupe');
        const fight = simulateCombat(group, foe, { seed: partyFightSeed(s), goldOnWin: 0 });
        const d = deriveSkirmish(
          { log: fight.log, win: fight.win, allyPv: group.pv, foePv: foe.pv },
          allies,
          bodies,
          s,
        );
        const parts = skirmishXpShares(esc, bodies, d);
        // Socle selon l'ISSUE + part des abattus : la règle EXACTE d'un convoi (v0.1014).
        expect(o.party!.xp).toEqual(missionXpFor(esc, inp.poi, d.win, parts));
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

  it('AVEC le héros : le MÊME butin qu’un groupe (v0.980), et le héros jamais blessé', () => {
    // ⚠️ Il ne compte plus que pour deux champions : lui faire tomber le butin d'une
    // expédition solo (or à l'équilibre du péage, pièce de set) n'avait plus de sens.
    const spec = { faction: 'bandits' as const, size: 2 };
    const o = resolveCamp(input({ hero: fort(20), spec }));
    expect(o.party!.hero).toBe(true);
    expect(o.party!.win).toBe(true);
    expect(o.gold).toBe(campGroupHaul(poi(), spec).gold);
    expect(o.item).toBeNull();
    expect(o.party).not.toHaveProperty('advGear'); // ⚠️ plus aucune pièce de champion (v0.1012)
    expect(o.party!.hurt).not.toContain(HERO_UNIT_ID);
  });

  it('SANS le héros, victoire : or et pierres ; jamais d’objet du héros, de ferraille ni de pièce de champion', () => {
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
    expect('scrap' in o).toBe(false);
    expect(o.summonStones).toBeGreaterThan(0);
    expect(o.party).not.toHaveProperty('advGear'); // ⚠️ plus aucune pièce de champion (v0.1012)
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
    expect(o.gold + o.summonStones + o.key).toBe(0);
    expect(o.party).not.toHaveProperty('advGear'); // ⚠️ plus aucune pièce de champion (v0.1012)
    expect(o.party!.xp['adv_0']!).toBeGreaterThanOrEqual(missionXp(inp.escort[0]!, inp.poi, o.win));
  });

  it('⚠️ SANS le héros : JAMAIS de clé, et le butin est exactement campGroupHaul ', () => {
    // Les clés nourrissent le Labyrinthe (bande 2-5 runs/jour, v0.794/v0.799) : un groupe de
    // camp n'en rend AUCUNE, quelle que soit la faction — les bêtes en rendaient 1-2 par camp.
    let victoires = 0;
    for (const faction of ['bandits', 'mortsvivants', 'betes'] as const)
      for (let s = 1; s <= 40; s++) {
        const inp = input({
          seed: s,
          poi: poi({ level: 5, type: 'lair' }),
          escort: team(6, 60),
          road: road(60, 6),
          spec: { faction, size: 5 },
          playerLevel: 60,
        });
        const o = resolveCamp(inp);
        expect(o.key, `${faction} graine ${s}`).toBe(0);
        if (!o.party!.win) continue;
        victoires++;
        const h = campGroupHaul(inp.poi, inp.spec);
        expect(o.gold).toBe(h.gold);
        expect(o.summonStones).toBe(h.summonStones);
        expect(o.party).not.toHaveProperty('advGear'); // ⚠️ plus aucune pièce de champion (v0.1012)
      }
    expect(victoires, 'aucune victoire : le test ne prouve rien').toBeGreaterThan(0);
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
  it('startParty : le voyage seul — il REÇOIT l’issue, il ne la calcule plus', () => {
    // ⚠️ La dispatch camp/faille vit au seul chemin d’envoi (le store) : ce constructeur
    // ne choisit plus la résolution. On lui passe donc celle d’un camp.
    const i = input({ hero: fort(20) });
    const a = startParty(i, 1000, 30, resolveCamp(i));
    expect(a.midAt).toBe(1000 + 30 * 60_000);
    expect(a.returnAt).toBe(1000 + 60 * 60_000);
    // ⚠️ PLUS DE PÉAGE SUR UN CAMP (v0.980) : le héros n'y décide plus du butin.
    expect(a.goldCost).toBe(0);
    expect(partyHeroToll(i.poi)).toBe(0);
    // …mais une FAILLE le garde : c'est le coût de sa présence (v0.932).
    const r = { ...i, poi: poi({ type: 'rift' }) };
    expect(startParty(r, 1000, 30, resolveCamp(i)).goldCost).toBe(goldCost('rift', 20));
    expect(partyHeroToll(r.poi)).toBe(goldCost('rift', 20));
    expect(a.outcome.party).toBeDefined();
    const j = input();
    expect(startParty(j, 1000, 30, resolveCamp(j)).goldCost).toBe(0);
  });
});

describe('💰 butin de groupe : dérivé des sources existantes', () => {
  it('pierres = part du sanctuaire, les bandits paient en or ; jamais de ferraille ni de clé', () => {
    const p = poi({ level: 30 });
    const tfH = travelFactor((2 * travelOneWayMin(30, 0.5)) / 60);
    const k = 3 / CAMP.refGroup;
    const b = campGroupHaul(p, { faction: 'betes', size: 3 });
    expect(b.summonStones).toBe(0);
    const m = campGroupHaul(p, { faction: 'mortsvivants', size: 3 });
    expect(m.summonStones).toBe(
      Math.round(harvestYield('shrine', 30, tfH).summonStones * CAMP.stoneShare * k),
    );
    const bd = campGroupHaul(p, { faction: 'bandits', size: 3 });
    expect(bd.gold).toBeGreaterThan(m.gold);
    expect(bd.gold / m.gold).toBeCloseTo(CAMP.banditGoldMult, 1);
    for (const h of [b, m, bd]) {
      expect('scrap' in h).toBe(false);
      expect('key' in h).toBe(false);
    }
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

describe('🧝 le héros dans un groupe vaut au plus HERO_PARTY_WORTH champions (v0.980)', () => {
  const refOf = (L: number) => fuseUnits(refEscortUnits(L), 'r');
  const k = (L: number) => HERO_PARTY_WORTH / refEscortUnits(L).length;

  it('⚠️ un héros FORT vaut EXACTEMENT K champions de référence, à tous les niveaux', () => {
    // Mesuré avant la borne : ×8 un champion au niveau 12, ×216 au niveau 100 — il refermait
    // seul des failles de 40 à 60 niveaux au-dessus de lui.
    for (const L of [5, 12, 26, 45, 70, 100]) {
      const h = heroPartyCombatant(fort(L));
      expect(offenseOf(h) / offenseOf(refOf(L)), `offense niv ${L}`).toBeCloseTo(k(L), 2);
      expect(survivalOf(h) / survivalOf(refOf(L)), `survie niv ${L}`).toBeCloseTo(k(L), 2);
    }
  });

  it('⚠️ sur les caractéristiques des CHAMPIONS : deux héros forts se valent au mur', () => {
    // Garder son critique / multi-frappe le faisait valoir 1 champion au niveau 12 et 2 au
    // niveau 70 (mesuré) : la borne ne tenait pas. Au-delà de la borne, le héros ne compte plus.
    const a = heroPartyCombatant(fort(40));
    const b = heroPartyCombatant({
      ...fort(40),
      combatant: { ...fort(40).combatant, damage: 99999 },
    });
    expect(b).toEqual(a);
    expect(a.crit).toBe(refOf(40).crit);
  });

  it('⚠️ UNE BORNE, JAMAIS UN PLANCHER : un héros faible garde sa propre force', () => {
    const L = 12;
    const faible = {
      name: 'Héros',
      level: L,
      combatant: { ...refOf(L), damage: 1, pv: 10 },
    };
    const h = heroPartyCombatant(faible);
    expect(offenseOf(h)).toBeCloseTo(offenseOf(faible.combatant), 3);
    expect(survivalOf(h)).toBeCloseTo(survivalOf(faible.combatant), 1);
  });
});

describe('🖥️ ce que l’écran lit — la MÊME règle que la résolution et le store', () => {
  it('⚠️ partyAllies fond EXACTEMENT le groupe de resolveCamp (pronostic sur le bon groupe)', () => {
    const inp = input({ hero: fort(20), spec: { faction: 'betes', size: 4 } });
    const allies = partyAllies(inp.escort, inp.road, inp.hero);
    expect(allies.map((u) => u.id)).toEqual(['adv_0', 'adv_1', 'adv_2', HERO_UNIT_ID]);
    // Le héros se bat BORNÉ à deux champions (v0.980), les aventuriers avec leur paire.
    expect(allies[3]!.combatant).toEqual(heroPartyCombatant(inp.hero!));
    expect(allies.slice(0, 3)).toEqual(units(inp.escort, inp.road));
    // Le combat de résolution rejoué sur ce groupe donne la même issue.
    const group = fuseUnits(allies, 'Groupe');
    const foe = campFoe(inp.poi, inp.spec);
    for (let s = 1; s <= 20; s++) {
      const fight = simulateCombat(group, foe, { seed: partyFightSeed(s), goldOnWin: 0 });
      expect(resolveCamp({ ...inp, seed: s }).party!.win, `graine ${s}`).toBe(fight.win);
    }
    expect(partyAllies(inp.escort, inp.road, null)).toHaveLength(3);
  });

  it('⚠️ partySendBlocker : sans le héros, un groupe prend un CRÉNEAU DE CONVOI (un seul pool)', () => {
    // Revue finale : sans ce partage, rien ne bornait le nombre de groupes en parallèle.
    expect(partySendBlocker(poi(), 3, false, 1, 9)).toBeNull();
    expect(partySendBlocker(poi(), 3, false, 0, 9)).toBe('slots');
    // Le héros est à lui seul sa limite : il ne prend pas de créneau, même avec une escorte.
    expect(partySendBlocker(poi(), 3, true, 0, 9)).toBeNull();
    expect(partySendBlocker(poi(), 0, true, 0, 9)).toBeNull();
    expect(partySendBlocker(poi(), 0, false, 0, 9)).toBe('empty');
    expect(partySendBlocker(poi({ type: 'wreck' }), 3, true, 5, 9)).toBe('notTarget');
    // ⚠️ UNE FAILLE EST UNE CIBLE DE GROUPE depuis que l’incursion existe : la porte
    // lit `PARTY_TARGETS`, pas `CAMP_TYPES` (le détail de la résolution vit ailleurs).
    expect(partySendBlocker(poi({ type: 'rift' }), 2, true, 5, 9)).toBeNull();
    expect(canSendParty(poi(), 3, false, 0, 9)).toBe(false);
    for (const k of ['notTarget', 'empty', 'slots', 'tooMany'] as const)
      expect(PARTY_SEND_BLOCK_LABEL[k].length).toBeGreaterThan(0);
    expect(PARTY_SEND_BLOCK_LABEL.slots).toContain('créneaux de convoi');
  });

  it('🗿 LE PLAFOND DU PANTHÉON BORNE LA TAILLE DU GROUPE — même avec le héros', () => {
    // ⚠️ C'est le SEUL endroit du jeu où l'effectif entier pourrait partir d'un coup : un
    // groupe n'a pas d'`escortMax`. Sans ce garde, la collection deviendrait décisive et
    // le plafond du Panthéon ne voudrait plus rien dire (v0.958).
    expect(partySendBlocker(poi(), 3, false, 5, 3)).toBeNull();
    expect(partySendBlocker(poi(), 4, false, 5, 3)).toBe('tooMany');
    // ⚠️ Le héros n'exempte pas : il s'ajoute au groupe, il ne le remplace pas.
    expect(partySendBlocker(poi(), 4, true, 5, 3)).toBe('tooMany');
    expect(canSendParty(poi(), 4, false, 5, 3)).toBe(false);
  });

  it('partyHeroBlocker : expédition, infirmerie, Avant-poste, or — dans cet ordre, sinon libre', () => {
    const ok = { onExpedition: false, healMs: 0, outpost: true, gold: 100, cost: 100 };
    expect(partyHeroBlocker(ok)).toBeNull();
    expect(partyHeroBlocker({ ...ok, gold: 99 })).toBe('gold');
    expect(partyHeroBlocker({ ...ok, outpost: false, gold: 0 })).toBe('outpost');
    expect(partyHeroBlocker({ ...ok, healMs: 1, outpost: false })).toBe('infirmary');
    expect(partyHeroBlocker({ ...ok, onExpedition: true, healMs: 1 })).toBe('expedition');
    for (const k of ['expedition', 'infirmary', 'outpost', 'gold'] as const)
      expect(PARTY_HERO_BLOCK_LABEL[k].length).toBeGreaterThan(0);
  });

  it('⚠️ campRewardLabel annonce la devise que campGroupHaul verse vraiment — jamais de ferraille', () => {
    const vus = new Set<string>();
    for (let i = 0; i < 400; i++)
      for (const type of ['camp', 'lair'] as const) {
        const p = poi({ id: `lbl_${i}`, type, level: 30 });
        const spec = campSpecOf(p)!;
        vus.add(`${type}:${spec.faction}`);
        const label = campRewardLabel(p);
        // ⚠️ UNE SEULE ligne depuis la v0.980 : le héros ne change plus le butin.
        expect(label, label).not.toContain('héros');
        const haul = campGroupHaul(p, spec);
        expect(label.includes('🔮'), label).toBe(haul.summonStones > 0);
        expect(label.includes('🗝️'), label).toBe(false);
        expect(label).not.toContain('🔩');
        expect(label).not.toContain('🧩');
        expect(label).not.toContain('pièce');
      }
    expect(vus.size, 'toutes les factions × types ne sont pas exercées').toBe(6);
    expect(campRewardLabel(poi({ type: 'wreck' }))).toBe('');
  });

  it('partyReport dit l’issue — et n’annonce plus de pièce de champion (v0.1012)', () => {
    const L = 60;
    const esc = team(10, L);
    const o = resolveCamp(
      input({
        poi: poi({ level: 5, type: 'lair' }),
        escort: esc,
        road: road(L, 10),
        spec: { faction: 'mortsvivants', size: 5 },
        playerLevel: L,
      }),
    );
    const r = partyReport(o.party!, esc);
    expect(r.win).toBe(true);
    expect(r).not.toHaveProperty('pieces');
    const perdu = resolveCamp(
      input({
        escort: team(1, 5),
        road: road(5, 1),
        poi: poi({ level: 40 }),
        spec: { faction: 'bandits', size: 4 },
      }),
    );
    const rp = partyReport(perdu.party!, []);
    expect(rp.win).toBe(false);
    expect(rp).not.toHaveProperty('pieces');
  });
});

describe('📬 settleParties — un groupe parti sans le héros : rapport à l’arrivée, retrait au retour', () => {
  const trip = (id: string, sentAt: number, leg = 30): ActiveParty => {
    const i = input({ poi: poi({ id: `cp_${id}` }) });
    return { ...startParty(i, sentAt, leg, resolveCamp(i)), id };
  };
  const msg = (id: string, claimed?: boolean): ExpeditionMessage => ({
    id,
    level: 1,
    win: true,
    text: '',
    gold: 0,
    energy: 0,
    key: 0,
    resolvedAt: 0,
    read: true,
    ...(claimed === undefined ? {} : { claimed }),
  });

  it('avant l’arrivée : RIEN ne change (le store n’écrit pas à vide)', () => {
    const p = trip('a', 0);
    const r = settleParties([p], [], p.midAt - 1, 30);
    expect(r.changed).toBe(false);
    expect(r.fresh).toEqual([]);
    expect(r.parties).toEqual([p]);
  });

  it('à l’arrivée : le rapport est déposé UNE fois, à encaisser, et le groupe reste en route', () => {
    const p = trip('a', 0);
    const r = settleParties([p], [], p.midAt, 30);
    expect(r.changed).toBe(true);
    expect(r.fresh).toHaveLength(1);
    expect(r.messages).toEqual([buildMessage(p)]);
    expect(r.messages[0]!.claimed).toBe(false);
    expect(r.messages[0]!.party).toBeDefined();
    expect(r.parties).toEqual([{ ...p, reported: true }]);
    // Le tick suivant ne redépose rien et n'écrit pas.
    const again = settleParties(r.parties, r.messages, p.midAt + 1, 30);
    expect(again.changed).toBe(false);
    expect(again.messages).toHaveLength(1);
  });

  it('⚠️ un rapport déjà présent (même id) n’est jamais dupliqué', () => {
    const p = trip('a', 0);
    const r = settleParties([p], [buildMessage(p)], p.midAt, 30);
    expect(r.fresh).toEqual([]);
    expect(r.messages).toHaveLength(1);
    expect(r.parties[0]!.reported).toBe(true);
  });

  it('au retour : le groupe est RETIRÉ, le rapport reste dans la boîte', () => {
    const p = { ...trip('a', 0), reported: true };
    const box = [buildMessage(p)];
    const r = settleParties([p], box, p.returnAt, 30);
    expect(r.changed).toBe(true);
    expect(r.parties).toEqual([]);
    expect(r.fresh).toEqual([]);
    // ⚠️ La MÊME boîte (référence) : le store n'écrit `messages` que si elle a changé. Réécrire
    // une copie au retour pourrait écraser un encaissement tout juste enregistré et rendre le
    // butin encaissable une seconde fois.
    expect(r.messages).toBe(box);
  });

  it('⚠️ app fermée tout le voyage : rapport déposé PUIS groupe retiré, dans le même appel', () => {
    const p = trip('a', 0);
    const r = settleParties([p], [], p.returnAt + 5, 30);
    expect(r.parties).toEqual([]);
    expect(r.fresh).toHaveLength(1);
    expect(r.messages[0]!.claimed).toBe(false);
  });

  it('plusieurs groupes : chacun à son rythme', () => {
    const a = trip('a', 0, 10);
    const b = trip('b', 0, 60);
    const r = settleParties([a, b], [], a.returnAt, 30);
    expect(r.parties.map((p) => p.id)).toEqual(['b']);
    expect(r.parties[0]!.reported).toBeFalsy();
    expect(r.fresh.map((m) => m.id)).toEqual([buildMessage(a).id]);
  });

  it('⚠️ la boîte est taillée par keepMessages : un butin non encaissé n’est jamais jeté', () => {
    const p = trip('a', 0);
    const old = [msg('lu1', true), msg('lu2', true), msg('attend', false)];
    const r = settleParties([p], old, p.midAt, 2);
    expect(r.messages.map((m) => m.id)).toEqual([buildMessage(p).id, 'lu1', 'attend']);
  });
});

describe('🎁 partyClaimRoster — ce que l’encaissement change au vivier', () => {
  const esc = team(3, 20);
  const bystander: Adventurer = { ...refChampionAdv(20, 0), id: 'adv_reste' };
  const roster = [...esc, bystander];
  const party = (over: Partial<PartyResult> = {}) => ({
    ...resolveCamp(input({ escort: esc })).party!,
    xp: { adv_0: 50, adv_1: 70, adv_2: 90 },
    hurt: ['adv_1'],
    wages: 123.6,
    ...over,
  });
  const ctx = { pantheonLevel: 30, infirmaryLevel: 4, now: 1_000_000 };

  it('XP de chacun = grantAdvXp ; celui qui n’est pas parti est intact', () => {
    const r = partyClaimRoster(party(), roster, ctx);
    esc.forEach((a, i) =>
      expect(r.adventurers[i]).toMatchObject(
        grantAdvXp(a, [50, 70, 90][i]!, ctx.pantheonLevel) as object,
      ),
    );
    expect(r.adventurers[3]).toBe(bystander);
  });

  it('🤕 les blessés du camp partent à l’infirmerie (durée d’un convoi), les autres non', () => {
    const r = partyClaimRoster(party(), roster, ctx);
    const until = ctx.now + caravanHurtMs(esc, ctx.infirmaryLevel);
    expect(r.adventurers[1]!.hurtUntil).toBe(until);
    expect(r.adventurers[0]!.hurtUntil).toBeUndefined();
    expect(r.adventurers[2]!.hurtUntil).toBeUndefined();
  });

  it('⚠️ une convalescence plus longue (siège perdu) n’est jamais raccourcie', () => {
    const long = ctx.now + 100 * 3600_000;
    const alite = roster.map((a) => (a.id === 'adv_1' ? { ...a, hurtUntil: long } : a));
    expect(partyClaimRoster(party(), alite, ctx).adventurers[1]!.hurtUntil).toBe(long);
  });

  it('un aventurier renvoyé depuis : rien à lui verser, l’escorte ne compte que les présents', () => {
    const r = partyClaimRoster(party(), [esc[0]!, esc[2]!], ctx);
    expect(r.escort.map((a) => a.id)).toEqual(['adv_0', 'adv_2']);
    expect(r.adventurers).toHaveLength(2);
    // ⚠️ Et jamais celui qui n'est pas parti : son compagnon n'a rien à apprendre du camp.
    expect(partyClaimRoster(party(), roster, ctx).escort.map((a) => a.id)).toEqual([
      'adv_0',
      'adv_1',
      'adv_2',
    ]);
  });

  it('⚠️ salaires ENTIERS (colonne gold entière), jamais négatifs', () => {
    expect(partyClaimRoster(party(), roster, ctx).wages).toBe(124);
    expect(partyClaimRoster(party({ wages: -5 }), roster, ctx).wages).toBe(0);
  });
});

describe('🧾 normalizeParties — un jsonb malformé ne fait jamais planter', () => {
  it('non-tableau → [] ; entrée incomplète écartée ; entrée valide gardée', () => {
    const base = input();
    const ok: ActiveParty = { ...startParty(base, 0, 10, resolveCamp(base)), id: 'g1' };
    expect(normalizeParties(null)).toEqual([]);
    expect(normalizeParties({})).toEqual([]);
    const { outcome: _o, ...sansIssue } = ok;
    void _o;
    expect(
      normalizeParties([ok, null, 3, { ...ok, id: 7 }, sansIssue, { ...ok, returnAt: 'x' }]),
    ).toEqual([ok]);
  });
});
