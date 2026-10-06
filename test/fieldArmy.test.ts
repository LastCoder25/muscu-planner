import { describe, it, expect } from 'vitest';
import {
  FIELD_ARMY,
  ARMY_PATH,
  armyTrajectory,
  applyFieldHitToBase,
  applyFieldHitToMap,
  DETECT_FLOOR,
  detectRadius,
  fieldArmyMana,
  pendingFieldHits,
  resolveFieldArmy,
  retakeArmyPoi,
  seenRadius,
  siegeArmyPoi,
  syncFieldArmies,
  thinGroups,
} from '@/lib/fieldArmy';
import { EXPE, warbandAt, type ExpeditionMap, type FieldHit, type Poi } from '@/lib/expedition';
import { emptyBase, rollRaid, type BaseState } from '@/lib/raid';
import { refAdvGear, refChampionAdv, type EscortKit } from '@/lib/caravan';
import { meetAll } from '@/lib/party';
import { partyWinChance } from '@/lib/partyForecast';
import type { Adventurer } from '@/lib/adventurers';

const H = 3_600_000;
const T0 = 1_000 * H;
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);

/** Le seul cercle de la base, de rayon `r`. */
const baseC = (r: number) => [{ id: 'base', x: EXPE.town.x, y: EXPE.town.y, r }];

const raidAt = (arrivesAt: number, leadMs: number, level = 30) =>
  rollRaid(7, level, arrivesAt, leadMs);

const controlPoi = (over: Partial<Poi> = {}, attackAt = T0 + 10 * H): Poi => ({
  id: 'ctl_mine',
  type: 'control',
  level: 30,
  x: EXPE.town.x + 30,
  y: EXPE.town.y,
  distNorm: 0.3,
  spawnedAt: 0,
  expiresAt: 9e15,
  control: {
    kind: 'mine',
    owner: 'player',
    faction: 'bandits',
    size: 2,
    garrison: [],
    retakes: 1,
    attackAt,
  },
  ...over,
});

const map = (pois: Poi[]): ExpeditionMap => ({
  seed: 42,
  spawnCount: 0,
  pois,
  nextSpawnAt: 9e15,
});

const team = (n: number, level: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(level, i),
    id: `adv_${i}`,
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

describe('🗼 le rayon de détection', () => {
  it('vaut la marche d’une armée pendant le préavis de la Tour', () => {
    expect(detectRadius(H)).toBeCloseTo(FIELD_ARMY.speedPerHour, 6);
    expect(detectRadius(4 * H)).toBeCloseTo(4 * FIELD_ARMY.speedPerHour, 6);
    expect(detectRadius(-5)).toBe(0);
  });
});

describe('⚔️ l’armée d’un siège sur la carte', () => {
  const arrive = T0 + 6 * H;
  const raid = raidAt(arrive, 4 * H);
  it('n’apparaît qu’à sa détection, au bord du rayon, et disparaît à son arrivée', () => {
    expect(siegeArmyPoi(raid, 200, arrive - 5 * H, 30)).toBeNull();
    const p = siegeArmyPoi(raid, 200, arrive - 4 * H, 30)!;
    expect(p).not.toBeNull();
    expect(dist(p.from!, EXPE.town)).toBeCloseTo(detectRadius(4 * H), 3);
    expect(p.army).toMatchObject({ kind: 'siege', targetId: raid.id, at: arrive });
    expect(siegeArmyPoi(raid, 200, arrive, 30)).toBeNull();
  });
  it('marche sur la ville : elle y est à l’heure du siège', () => {
    const p = siegeArmyPoi(raid, 200, arrive - H, 30)!;
    const end = warbandAt(p, arrive);
    expect(dist(end, EXPE.town)).toBeLessThan(0.01);
    expect(dist(p, EXPE.town)).toBeLessThan(dist(p.from!, EXPE.town));
  });
  it('ne sort pas de la zone révélée (le brouillard reste le brouillard)', () => {
    const p = siegeArmyPoi(raid, 20, arrive - H / 2, 30)!;
    expect(dist(p.from!, EXPE.town)).toBeLessThanOrEqual(19 + 1e-6);
  });
  it('sa force de campagne suit ce qui a déjà été abattu', () => {
    const full = siegeArmyPoi(raid, 200, arrive - H, 30)!.army!.size;
    const half = siegeArmyPoi({ ...raid, fieldCut: 0.5 }, 200, arrive - H, 30)!.army!.size;
    expect(full).toBe(FIELD_ARMY.siegeSize);
    expect(half).toBeCloseTo(full / 2, 6);
  });
});

describe('⚔️ l’armée d’une reprise : vue SEULEMENT dans le rayon de détection', () => {
  const at = T0 + 10 * H;
  it('hors du rayon de la base, on la voit quand même à DETECT_FLOOR du point (le plancher)', () => {
    // Point à 30, rayon de base 25 : seul le cercle du point (30) la voit → 3 h de marche.
    expect(retakeArmyPoi(controlPoi(), { seed: 42 }, baseC(25), 200, at - 3.1 * H, 30)).toBeNull();
    const p = retakeArmyPoi(controlPoi(), { seed: 42 }, baseC(25), 200, at - 2.9 * H, 30)!;
    expect(dist(p.from!, { x: EXPE.town.x + 30, y: EXPE.town.y })).toBeCloseTo(DETECT_FLOOR, 3);
  });
  it('visible les (rayon − distance) / vitesse dernières heures, en marche vers le point', () => {
    const R = 80; // point à 30 → 50 unités de marche visibles → 5 h
    expect(retakeArmyPoi(controlPoi(), { seed: 42 }, baseC(R), 200, at - 5.1 * H, 30)).toBeNull();
    const p = retakeArmyPoi(controlPoi(), { seed: 42 }, baseC(R), 200, at - 4.9 * H, 30)!;
    expect(p).not.toBeNull();
    expect(p.army).toMatchObject({ kind: 'retake', targetId: 'ctl_mine', at });
    expect(dist(p.from!, EXPE.town)).toBeCloseTo(R, 3);
    const end = warbandAt(p, at);
    expect(dist(end, { x: EXPE.town.x + 30, y: EXPE.town.y })).toBeLessThan(0.01);
  });
  it('ni point tenu par l’ennemi, ni attaque passée', () => {
    const enemy = controlPoi();
    enemy.control = { ...enemy.control!, owner: 'enemy' };
    expect(retakeArmyPoi(enemy, { seed: 42 }, baseC(80), 200, at - H, 30)).toBeNull();
    expect(retakeArmyPoi(controlPoi(), { seed: 42 }, baseC(80), 200, at, 30)).toBeNull();
  });
  it('amputée de ce qui a déjà été abattu', () => {
    const cut = controlPoi();
    cut.control = { ...cut.control!, retakeCut: 0.5 };
    const a = retakeArmyPoi(controlPoi(), { seed: 42 }, baseC(80), 200, at - H, 30)!.army!.size;
    const b = retakeArmyPoi(cut, { seed: 42 }, baseC(80), 200, at - H, 30)!.army!.size;
    expect(b).toBeCloseTo(a / 2, 6);
  });
});

describe('🗺️ syncFieldArmies', () => {
  const arrive = T0 + 6 * H;
  const raid = raidAt(arrive, 4 * H);
  const ctx = (now: number, r = raid) => ({
    raid: r,
    detectR: 50,
    reach: 200,
    now,
    playerLevel: 30,
  });
  it('pose les armées vues, rend la même carte quand rien ne change, les retire ensuite', () => {
    const m0 = map([controlPoi({}, arrive)]);
    const m1 = syncFieldArmies(m0, ctx(arrive - H));
    const ids = m1.pois.map((p) => p.id);
    expect(ids).toContain(`army_${raid.id}`);
    expect(ids).toContain(`army_ctl_mine_${arrive}`);
    expect(syncFieldArmies(m1, ctx(arrive - H))).toBe(m1);
    const m2 = syncFieldArmies(m1, ctx(arrive - H, null as never));
    expect(m2.pois.some((p) => p.id === `army_${raid.id}`)).toBe(false);
    const m3 = syncFieldArmies(m1, ctx(arrive));
    expect(m3.pois.some((p) => p.army)).toBe(false);
  });
});

describe('⚔️ resolveFieldArmy — un camp, dont les abattus quittent l’armée', () => {
  const arrive = T0 + 6 * H;
  const raid = raidAt(arrive, 4 * H);
  const poi = siegeArmyPoi(raid, 200, arrive - H, 30)!;
  const input = (n: number, seed: number) => ({
    poi,
    escort: team(n, 30),
    road: road(30, n),
    hero: null,
    seed,
    playerLevel: 30,
    pantheonLevel: 30,
  });
  it('déterministe, et le choc porte la part abattue', () => {
    expect(resolveFieldArmy(input(3, 5))).toEqual(resolveFieldArmy(input(3, 5)));
    const o = resolveFieldArmy(input(3, 5));
    const h = o.party!.fieldHit!;
    expect(h).toMatchObject({ kind: 'siege', targetId: raid.id, at: arrive });
    expect(h.part).toBeCloseTo(o.win ? 1 : o.party!.slain / o.party!.foes, 9);
  });
  it('⚠️ même vaincus, ils rentrent avec le BUTIN DE LA FACTION des abattus — pas de 💠', () => {
    let seen = 0;
    for (let s = 1; s <= 40; s++) {
      const o = resolveFieldArmy(input(2, s));
      if (o.win || !o.party!.slain) continue;
      seen++;
      expect(o.mana).toBe(0);
      const loot =
        o.gold + o.summonStones + Object.values(o.supplies ?? {}).reduce((a, b) => a + b, 0);
      if (raid.faction !== 'betes') expect(loot).toBeGreaterThan(0);
      expect(o.party!.hurt.length).toBeGreaterThan(0);
    }
    expect(seen, 'aucune défaite avec des abattus : le test ne prouve rien').toBeGreaterThan(0);
  });
  it('🕳️ une armée sortie d’une FAILLE rend du 💠, et pas le butin de faction', () => {
    const riftRaid = { ...raid, overflow: { faction: raid.faction, level: 30, at: 0 } };
    const rp = siegeArmyPoi(riftRaid, 200, arrive - H, 30)!;
    expect(rp.army!.rift).toBe(true);
    let seen = 0;
    for (let s = 1; s <= 40; s++) {
      const o = resolveFieldArmy({ ...input(2, s), poi: rp });
      if (!o.party!.slain) continue;
      seen++;
      expect(o.mana).toBeGreaterThan(0);
      expect(o.gold + o.summonStones).toBe(0);
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('💠 au prorata de ce qui tombe, toute l’armée = une défense entière', () => {
    expect(fieldArmyMana(6, 0, 30)).toBe(0);
    expect(fieldArmyMana(6, 1, 30)).toBeGreaterThan(fieldArmyMana(6, 0.5, 30));
  });
  it('trop forte pour une seule équipe, battable en combiné', () => {
    const chance = (n: number) => partyWinChance(poi, team(n, 30), road(30, n), null, 0, 40)!;
    expect(chance(3)).toBeLessThan(0.2);
    expect(chance(FIELD_ARMY.siegeSize + 1)).toBeGreaterThan(0.5);
  });
});

describe('🏰 applyFieldHitToBase', () => {
  const arrive = T0 + 6 * H;
  const raid = raidAt(arrive, 4 * H);
  const base: BaseState = { ...emptyBase(3, T0), raid };
  const hit = (part: number, id = 'h1'): FieldHit => ({
    kind: 'siege',
    targetId: raid.id,
    at: arrive,
    part,
    hitId: id,
  });
  const bodies = (b: BaseState) => b.raid?.groups.reduce((s, g) => s + g.count, 0) ?? 0;
  it('ampute l’armée, garde son champion, une seule fois par choc', () => {
    const a = applyFieldHitToBase(base, hit(0.5), arrive - H, arrive + 24 * H);
    expect(a.effect).toBe('thinned');
    expect(bodies(a.base)).toBeLessThan(bodies(base));
    expect(a.base.raid!.groups.some((g) => g.champion)).toBe(raid.groups.some((g) => g.champion));
    expect(a.base.raid!.fieldCut).toBeCloseTo(0.5, 9);
    expect(applyFieldHitToBase(a.base, hit(0.5), arrive - H, 0).base).toBe(a.base);
    const b = applyFieldHitToBase(a.base, hit(0.5, 'h2'), arrive - H, 0);
    expect(b.base.raid!.fieldCut).toBeCloseTo(0.75, 9);
  });
  it('battue : le siège est annulé et le suivant repart de plus tard', () => {
    const a = applyFieldHitToBase(base, hit(1), arrive - H, arrive + 24 * H);
    expect(a.effect).toBe('routed');
    expect(a.base.raid).toBeNull();
    expect(a.base.nextRaidAt).toBe(arrive + 24 * H);
  });
  it('⚠️ un choc APRÈS l’arrivée, ou contre un autre raid, ne change rien', () => {
    expect(applyFieldHitToBase(base, hit(1), arrive + 1, 0).base).toBe(base);
    expect(applyFieldHitToBase(base, { ...hit(1), targetId: 'x' }, arrive - H, 0).base).toBe(base);
  });
  it('thinGroups : chaque groupe perd sa part, les groupes vidés disparaissent', () => {
    const g = thinGroups(raid.groups, 0.5);
    for (const x of g) {
      const o = raid.groups.find((y) => y.species === x.species && y.level === x.level)!;
      if (!x.champion) expect(x.count).toBe(Math.round(o.count * 0.5));
    }
    expect(thinGroups(raid.groups, 1).every((x) => x.champion)).toBe(true);
  });
});

describe('🏰 applyFieldHitToMap', () => {
  const at = T0 + 10 * H;
  const hit = (part: number, id = 'h1', when = at): FieldHit => ({
    kind: 'retake',
    targetId: 'ctl_mine',
    at: when,
    part,
    hitId: id,
  });
  it('ampute la reprise, puis la repousse si l’armée est battue', () => {
    const m = map([controlPoi({}, at)]);
    const a = applyFieldHitToMap(m, hit(0.4), at - H, at + 30 * H);
    expect(a.effect).toBe('thinned');
    expect(a.map.pois[0]!.control!.retakeCut).toBeCloseTo(0.4, 9);
    expect(applyFieldHitToMap(a.map, hit(0.4), at - H, 0).map).toBe(a.map);
    const b = applyFieldHitToMap(a.map, hit(1, 'h2'), at - H, at + 30 * H);
    expect(b.effect).toBe('routed');
    expect(b.map.pois[0]!.control!.attackAt).toBe(at + 30 * H);
    expect(b.map.pois[0]!.control!.retakeCut).toBeUndefined();
  });
  it('⚠️ une autre attaque (autre heure) n’est pas touchée', () => {
    const m = map([controlPoi({}, at)]);
    expect(applyFieldHitToMap(m, hit(1, 'h', at + H), at - H, 0).map).toBe(m);
  });
});

describe('📬 pendingFieldHits', () => {
  it('lit les chocs d’une armée sur les voyages, du plus tôt au plus tard', () => {
    const o = (targetId: string, part: number) =>
      ({
        party: { fieldHit: { kind: 'siege', targetId, at: 0, part, hitId: `${part}` } },
      }) as never;
    const v = [
      { midAt: 5, outcome: o('r', 0.2) },
      { midAt: 2, outcome: o('r', 0.1) },
      { midAt: 1, outcome: o('autre', 0.5) },
    ];
    expect(pendingFieldHits(v, 'siege', 'r', []).map((x) => x.at)).toEqual([2, 5]);
    expect(pendingFieldHits(v, 'retake', 'r', [])).toEqual([]);
  });

  it('un groupe déjà RENTRÉ : le choc se lit sur son rapport (signalé : l’armée battue attaquait encore)', () => {
    const hit = { kind: 'retake' as const, targetId: 'ctl', at: 50, part: 1, hitId: 'h1' };
    // Plus aucun voyage en cours : seul le rapport de la boîte porte la victoire.
    const got = pendingFieldHits([], 'retake', 'ctl', [
      { resolvedAt: 7, party: { fieldHit: hit } as never },
      { resolvedAt: 3 },
    ]);
    expect(got).toEqual([{ hit, at: 7 }]);
    // Encore en route ET déjà dans la boîte : rendu UNE fois.
    const both = pendingFieldHits(
      [{ midAt: 7, outcome: { party: { fieldHit: hit } } as never }],
      'retake',
      'ctl',
      [{ resolvedAt: 7, party: { fieldHit: hit } as never }],
    );
    expect(both).toHaveLength(1);
  });

  it('appliqué à la carte, le choc lu sur le rapport repousse la reprise', () => {
    const hit = { kind: 'retake' as const, targetId: 'ctl', at: 50, part: 1, hitId: 'h1' };
    const map = {
      pois: [{ id: 'ctl', type: 'control', control: { owner: 'player', attackAt: 50 } }],
    } as never;
    const [{ at }] = pendingFieldHits([], 'retake', 'ctl', [
      { resolvedAt: 7, party: { fieldHit: hit } as never },
    ]);
    const r = applyFieldHitToMap(map, hit, at, 999);
    expect(r.effect).toBe('routed');
    expect((r.map as { pois: { control: { attackAt: number } }[] }).pois[0]!.control.attackAt).toBe(
      999,
    );
  });
});

describe('🗺️ armyTrajectory — la ligne jusqu’au lieu attaqué', () => {
  const arrive = T0 + 6 * H;
  const raid = raidAt(arrive, 4 * H);
  it('siège : de l’armée vers la ville, arrêtée au bord de l’enceinte, anneau sur la ville', () => {
    const p = siegeArmyPoi(raid, 200, arrive - 3 * H, 30)!;
    const a = armyTrajectory(p)!;
    expect([a.x1, a.y1]).toEqual([p.x, p.y]);
    expect([a.tx, a.ty]).toEqual([EXPE.town.x, EXPE.town.y]);
    expect(dist({ x: a.x2, y: a.y2 }, EXPE.town)).toBeCloseTo(ARMY_PATH.baseR, 6);
    // alignée : le bout du trait est sur le segment armée → ville
    const t = (a.x2 - a.x1) / (EXPE.town.x - a.x1);
    expect(a.y1 + t * (EXPE.town.y - a.y1)).toBeCloseTo(a.y2, 6);
  });
  it('reprise : vers le POINT FIXE, pas vers la ville', () => {
    const at = T0 + 10 * H;
    const p = retakeArmyPoi(controlPoi({}, at), { seed: 42 }, baseC(80), 200, at - 3 * H, 30)!;
    const a = armyTrajectory(p)!;
    expect([a.tx, a.ty]).toEqual([EXPE.town.x + 30, EXPE.town.y]);
    expect(dist({ x: a.x2, y: a.y2 }, { x: a.tx, y: a.ty })).toBeCloseTo(ARMY_PATH.pointR, 6);
  });
  it('rien pour un lieu ordinaire, ni une armée déjà au contact', () => {
    expect(armyTrajectory(controlPoi())).toBeNull();
    const p = siegeArmyPoi(raid, 200, arrive - H / 60, 30)!;
    expect(armyTrajectory({ ...p, x: EXPE.town.x + 1, y: EXPE.town.y })).toBeNull();
  });
});

describe('🧭 meetAll — le point de rencontre commun', () => {
  const arrive = T0 + 8 * H;
  const raid = raidAt(arrive, 8 * H);
  it('sur un lieu fixe : le plus long trajet', () => {
    const p = controlPoi();
    expect(meetAll(p, 0, [() => 30, () => 90])).toMatchObject({ min: 90, joined: true });
  });
  it('sur une armée : tous peuvent y être à la minute de la rencontre', () => {
    const p = siegeArmyPoi(raid, 200, T0, 30)!;
    const near = (q: Poi) => dist(q, EXPE.town) * 3; // 3 min par unité depuis la ville
    const far = (q: Poi) => dist(q, { x: EXPE.town.x, y: EXPE.town.y + 60 }) * 3;
    const m = meetAll(p, T0, [near, far]);
    expect(m.joined).toBe(true);
    expect(near(m.poi)).toBeLessThanOrEqual(m.min);
    expect(far(m.poi)).toBeLessThanOrEqual(m.min);
    const before = warbandAt(p, T0 + (m.min - 1) * 60_000);
    expect(near(before) <= m.min - 1 && far(before) <= m.min - 1).toBe(false);
  });
  it('injoignable : la rencontre se ferait sous les murs', () => {
    const p = siegeArmyPoi(raid, 200, T0, 30)!;
    expect(meetAll(p, T0, [() => 10_000]).joined).toBe(false);
  });
});

describe('🗼 le rayon de détection dessiné sur la carte', () => {
  it('le rayon VU : la détection, bornée juste sous la zone révélée, jamais négatif', () => {
    expect(seenRadius(40, 90)).toBe(40);
    expect(seenRadius(120, 90)).toBe(89);
    expect(seenRadius(-5, 90)).toBe(0);
  });

  it('une armée n’apparaît jamais au-delà du rayon que la carte dessine', () => {
    const detect = detectRadius(8 * 3_600_000);
    expect(detect).toBeCloseTo(8 * FIELD_ARMY.speedPerHour, 9);
    expect(seenRadius(detect, 60)).toBeLessThan(60);
  });
});
