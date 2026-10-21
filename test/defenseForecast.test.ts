// 🔮 Le pronostic de bataille entier (`defenseForecast.ts`) : la tenue annoncée, l'usure de la
// troupe qui s'installe si le lieu tombe, la part abattue d'une armée interceptée et NOS pertes
// (miliciens, champions blessés) — chaque chiffre confronté au VRAI combat (`fightCampForce`)
// rejoué sur un lot de graines de départ.
import { describe, expect, it } from 'vitest';
import {
  attackForecast,
  defenseForecast,
  interceptForecast,
  FORECAST_LOSS_SAMPLES,
} from '@/lib/defenseForecast';
import { campHurt, campLightHurt, fightCampForce } from '@/lib/camp';
import { controlAttackHold, retakeArmyPoi, retakeBattle, fieldArmySpec } from '@/lib/fieldArmy';
import { controlDefenseHold } from '@/lib/controlPoints';
import { placeWard } from '@/lib/controlWard';
import { militiaLost, militiaUnits } from '@/lib/militia';
import { addWear, WEAR, type EnemyWear } from '@/lib/enemyWear';
import { campSpecOf, EXPE, type Poi } from '@/lib/expedition';
import { partyWinChance } from '@/lib/partyForecast';
import {
  firstAidChance,
  refAdvGear,
  refChampionAdv,
  spareInjured,
  type EscortKit,
} from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';

const H = 3_600_000;
const L = 35;
const KIT: EscortKit = { advGear: [] };
const MAP = { seed: 42 };

/** Un lieu tenu, attaqué à `attackAt` (l'assaillant tombe à un niveau qui en dépend). */
const held = (attackAt: number, garrison: string[]): Poi => ({
  id: 'ctl_scriptorium',
  type: 'control',
  level: 22,
  x: EXPE.town.x + 30,
  y: EXPE.town.y,
  distNorm: 0.3,
  spawnedAt: 0,
  expiresAt: 9e15,
  control: {
    kind: 'scriptorium',
    owner: 'player',
    faction: 'mortsvivants',
    size: 2,
    garrison,
    retakes: 1,
    attackAt,
  },
});
const mil = (n: number): string[] => Array.from({ length: n }, (_, i) => `mil:${i}`);
const champ = (k: number): Adventurer => ({ ...refChampionAdv(L, k), id: `c${k}` });

/** Le VRAI combat de la reprise, tel que le store le livre (`retakeBattle` + `fightCampForce`),
 *  sur la graine de départ `k` (la résolution la passe à `partyFightSeed`). */
function realDefense(p: Poi, advs: Adventurer[], ids: string[], k: number) {
  const milIds = ids.filter((i) => i.startsWith('mil:'));
  const units = militiaUnits(milIds, L);
  const escort = advs.filter((a) => ids.includes(a.id));
  const { foe, force } = retakeBattle(MAP, p, [...units], L, 1);
  const g = fightCampForce({
    poi: foe,
    spec: force,
    escort,
    road: KIT,
    hero: null,
    seed: 1000 + k,
    playerLevel: L,
    pantheonLevel: 30,
    militia: units,
  });
  return { g, escort, milIds, seed: 1000 + k };
}

interface Real {
  win: number;
  wear: number;
  militia: number;
  pHurt: number;
  pLight: number;
  part: number;
  partLost: number;
}
function measure(
  runs: number,
  one: (k: number) => ReturnType<typeof realDefense>,
  prev?: EnemyWear,
): Real {
  let partLost = 0;
  let win = 0;
  let lost = 0;
  let wear = 0;
  let militia = 0;
  let hurt = 0;
  let light = 0;
  let part = 0;
  for (let k = 0; k < runs; k++) {
    const { g, escort, milIds, seed } = one(k);
    const d = g.skirmish;
    if (d.win) win++;
    else {
      lost++;
      wear += addWear(prev, d.foeDealt, 0)?.share ?? prev?.share ?? 0;
    }
    militia += militiaLost(milIds, d).length;
    if (spareInjured(escort, campHurt(d, escort), seed).length) hurt++;
    if (spareInjured(escort, campLightHurt(d, escort), seed).length) light++;
    const pt = d.win ? 1 : g.foes ? g.slain / g.foes : 0;
    part += pt;
    if (!d.win) partLost += pt;
  }
  return {
    win: win / runs,
    wear: lost ? wear / lost : 0,
    militia: militia / runs,
    pHurt: hurt / runs,
    pLight: light / runs,
    part: part / runs,
    partLost: lost ? partLost / lost : 0,
  };
}

describe('🛡️ la tenue annoncée = celle que l’écran affiche déjà', () => {
  it('face à l’armée en approche : EXACTEMENT `controlAttackHold`', () => {
    const adv = [champ(0)];
    const ids = ['c0', ...mil(2)];
    for (let i = 0; i < 6; i++) {
      const p = held(1000 * H + i * 7919, ids);
      const f = defenseForecast(MAP, p, ids, adv, KIT, L, 1, null, true, 0);
      expect(f.hold).toBe(controlAttackHold(MAP, p, ids, adv, KIT, L, 1, null));
    }
  });
  it('avant que l’armée soit visible : EXACTEMENT `controlDefenseHold`', () => {
    const adv = [champ(0)];
    const ids = ['c0', ...mil(2)];
    for (let i = 0; i < 3; i++) {
      const p = held(1000 * H + i * 7919, ids);
      const f = defenseForecast(MAP, p, ids, adv, KIT, L, 1, null, false, 0);
      expect(f.hold).toBe(controlDefenseHold(p, ids, adv, KIT, L, 1, null, 0));
    }
  });
  it('🪵 sous palissade aussi : les MÊMES troupes rétrécies que `controlDefenseHold`', () => {
    const adv = [champ(0)];
    const ids = ['c0', ...mil(2)];
    const T = 1000 * H;
    const p0 = held(T, ids);
    const p = { ...p0, control: placeWard(p0.control!, 'bastion', T - H) };
    const f = defenseForecast(MAP, p, ids, adv, KIT, L, 1, null, false, T);
    const bare = defenseForecast(MAP, p, ids, adv, KIT, L, 1, null, false, T + 48 * H);
    expect(f.hold).toBe(controlDefenseHold(p, ids, adv, KIT, L, 1, null, T));
    // la palissade compte : la tenue annoncée monte tant qu'elle est debout
    expect(f.hold).toBeGreaterThan(bare.hold);
  });
});

describe('🛡️ la défense face au vrai combat', () => {
  // Une garnison de deux miliciens face à une attaque qui la tient environ 6 fois sur 10.
  const ids = mil(2);
  const p = held(1000 * H + 4 * 7919, ids);
  const f = defenseForecast(MAP, p, ids, [], KIT, L, 1, null, true, 0, 240);
  const real = measure(400, (k) => realDefense(p, [], ids, k));

  it('la fréquence de victoire réelle ≈ la tenue annoncée', () => {
    expect(f.hold).toBeGreaterThan(0.3);
    expect(f.hold).toBeLessThan(0.9);
    expect(Math.abs(real.win - f.hold)).toBeLessThan(0.08);
  });
  it('l’usure annoncée ≈ l’usure moyenne réelle des défaites', () => {
    expect(f.lostSamples).toBeGreaterThan(0);
    expect(f.wearIfLost).toBeGreaterThan(0.05);
    expect(Math.abs(real.wear - f.wearIfLost)).toBeLessThan(0.08);
  });
  it('les miliciens perdus annoncés ≈ les miliciens réellement perdus', () => {
    expect(f.expected.militia).toBeGreaterThan(0.3);
    expect(Math.abs(real.militia - f.expected.militia)).toBeLessThan(0.2);
  });
  it('perdre emporte TOUS les miliciens engagés ; gagner en laisse en vie', () => {
    expect(f.ifLost.militia).toBeCloseTo(2, 6);
    expect(f.ifWon.militia).toBeLessThan(2);
  });
  it('sans champion, personne n’est blessé', () => {
    expect(f.expected.pHurt).toBe(0);
    expect(f.expected.pLight).toBe(0);
  });
});

describe('🤕 les champions blessés', () => {
  // Un champion et deux miliciens face à une attaque rude : la défaite blesse le champion.
  const adv = [champ(0)];
  const ids = ['c0', ...mil(2)];
  const p = held(1000 * H + 2 * 7919, ids);
  const f = defenseForecast(MAP, p, ids, adv, KIT, L, 1, null, true, 0, 240);
  const real = measure(400, (k) => realDefense(p, adv, ids, k));

  it('la probabilité de blessure grave ≈ celle des vrais combats', () => {
    expect(f.expected.pHurt).toBeGreaterThan(0.2);
    expect(Math.abs(real.pHurt - f.expected.pHurt)).toBeLessThan(0.1);
  });
  it('une défaite blesse gravement, une victoire jamais (seulement légèrement si serrée)', () => {
    expect(f.ifLost.pHurt).toBeGreaterThan(0.5);
    expect(f.ifWon.pHurt).toBe(0);
  });
  it('la blessure légère d’une victoire serrée ≈ celle des vrais combats', () => {
    expect(Math.abs(real.pLight - f.expected.pLight)).toBeLessThan(0.1);
  });
  it('les PREMIERS SECOURS comptent : la probabilité de blessure est celle APRÈS secours', () => {
    const care = [{ ...champ(0), skills: [{ id: 'care' as const, level: 5 }] }];
    const p0 = firstAidChance(care);
    expect(p0).toBeGreaterThan(0.1);
    const g = defenseForecast(MAP, p, ids, care, KIT, L, 1, null, true, 0, 240);
    // Seule la défaite blesse (grave) : sans secours elle blesserait toujours le champion.
    expect(g.ifLost.pHurt).toBeLessThan(f.ifLost.pHurt - 0.5 * p0);
    expect(Math.abs(g.ifLost.pHurt - (1 - p0))).toBeLessThan(0.1);
    const r = measure(400, (k) => realDefense(p, care, ids, k));
    expect(Math.abs(r.pHurt - g.expected.pHurt)).toBeLessThan(0.1);
  });
  it('au lapidaire, comme ailleurs, les champions se battent (v1.254.0)', () => {
    const here = held(1000 * H + 2 * 7919, ids);
    const lap = held(1000 * H + 2 * 7919, ids);
    lap.control = { ...lap.control!, kind: 'lapidary' };
    const a = defenseForecast(MAP, here, ids, adv, KIT, L, 1, null, true, 0, 48);
    const g = defenseForecast(MAP, lap, ids, adv, KIT, L, 1, null, true, 0, 48);
    expect(g.engaged.champions).toBeGreaterThan(0);
    expect(g.engaged.champions).toBe(a.engaged.champions);
  });
});

describe('🛡️ les bornes', () => {
  it('personne en défense : tenue 0, usure 0, rien à annoncer', () => {
    const p = held(1000 * H, []);
    for (const vs of [true, false]) {
      const f = defenseForecast(MAP, p, [], [], KIT, L, 1, null, vs, 0);
      expect(f.hold).toBe(0);
      expect(f.wearIfLost).toBe(0);
      expect(f.lostSamples).toBe(0);
      expect(f.expected.militia).toBe(0);
    }
  });
  it('une garnison écrasante tient à 100 % : aucune usure, pas de « si elle tombe »', () => {
    const adv = [0, 1, 2].map(champ);
    const ids = [...adv.map((a) => a.id), ...mil(5)];
    const p = held(1000 * H + 8 * 7919, ids);
    const low = defenseForecast(MAP, p, ids, adv, KIT, L, 1, null, true, 0);
    if (low.hold === 1) {
      expect(low.lostSamples).toBe(0);
      expect(low.wearIfLost).toBe(0);
    }
    expect(low.wearIfLost).toBeGreaterThanOrEqual(0);
    expect(low.wearIfLost).toBeLessThanOrEqual(1 - WEAR.minShare + 1e-9);
  });
  it('l’usure ne dépasse jamais le plancher (`WEAR.minShare`, lu dans la constante)', () => {
    const ids = mil(1);
    for (let i = 0; i < 6; i++) {
      const f = defenseForecast(
        MAP,
        held(1000 * H + i * 7919, ids),
        ids,
        [],
        KIT,
        L,
        1,
        null,
        true,
        0,
      );
      expect(f.wearIfLost).toBeLessThanOrEqual(1 - WEAR.minShare + 1e-9);
    }
  });
});

describe('⚔️ l’assaut du joueur sur un lieu ennemi', () => {
  const team = (n: number): Adventurer[] =>
    Array.from({ length: n }, (_, i) => ({
      ...refChampionAdv(30, i),
      id: `adv_${i}`,
      gear: {
        weapon: `refGear${i}weapon`,
        armor: `refGear${i}armor`,
        accessory: `refGear${i}accessory`,
        relic: `refGear${i}relic`,
      },
    }));
  const road: EscortKit = { talents: [], advGear: refAdvGear(30, 4) };
  const enemy = (size: number, wear?: { share: number; from: number }): Poi => ({
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
      owner: 'enemy',
      faction: 'bandits',
      size,
      garrison: [],
      retakes: 0,
      ...(wear ? { wear } : {}),
    },
  });
  const realAttack = (poi: Poi, escort: Adventurer[], runs: number, prev?: EnemyWear) =>
    measure(
      runs,
      (k) => {
        const g = fightCampForce({
          poi,
          spec: campSpecOf(poi)!,
          escort,
          road,
          hero: null,
          seed: 2000 + k,
          playerLevel: 30,
          pantheonLevel: 30,
        });
        return { g, escort, milIds: [], seed: 2000 + k };
      },
      prev,
    );

  it('la chance de victoire = celle que l’écran affiche (`partyWinChance`)', () => {
    const poi = enemy(3);
    const f = attackForecast(poi, team(3), road, null, 240)!;
    expect(f.win).toBe(partyWinChance(poi, team(3), road, null, 0, 40));
  });
  it('en cas d’échec, l’usure annoncée ≈ l’usure moyenne réelle', () => {
    const poi = enemy(4);
    const f = attackForecast(poi, team(3), road, null, 240)!;
    expect(f.win).toBeGreaterThan(0.1);
    expect(f.win).toBeLessThan(0.9);
    const real = realAttack(poi, team(3), 400);
    expect(Math.abs(real.wear - f.wearIfLost)).toBeLessThan(0.08);
    expect(Math.abs(real.win - f.win)).toBeLessThan(0.08);
    expect(Math.abs(real.pHurt - f.expected.pHurt)).toBeLessThan(0.1);
  });
  it('l’usure s’AJOUTE à celle que la troupe portait déjà', () => {
    const fresh = attackForecast(enemy(6), team(3), road, null, 120)!;
    const worn = attackForecast(enemy(6, { share: 0.3, from: 0 }), team(3), road, null, 120)!;
    expect(worn.lostSamples).toBeGreaterThan(0);
    expect(worn.win).toBeGreaterThan(fresh.win);
    expect(worn.wearIfLost).toBeGreaterThanOrEqual(0.3);
    // … et colle au VRAI cumul (`addWear(prev, foeDealt)`), pas à une usure repartie de zéro.
    const realWorn = realAttack(enemy(6, { share: 0.3, from: 0 }), team(3), 400, {
      share: 0.3,
      from: 0,
    });
    const f240 = attackForecast(enemy(6, { share: 0.3, from: 0 }), team(3), road, null, 240)!;
    expect(Math.abs(realWorn.wear - f240.wearIfLost)).toBeLessThan(0.06);
  });
  it('une troupe déjà usée est jugée sur sa force RÉDUITE (`campSpecOf`)', () => {
    const worn = enemy(4, { share: 0.5, from: 0 });
    const f = attackForecast(worn, team(3), road, null, 240)!;
    expect(f.win).toBe(partyWinChance(worn, team(3), road, null, 0, 40));
  });
  it('la TROUSSE DE SOINS efface toute blessure pronostiquée (comme `medkitHeal`)', () => {
    const poi = enemy(4);
    const kit: EscortKit = { ...road, supplies: ['trousse'] };
    const bare = attackForecast(poi, team(3), road, null, 120)!;
    const cured = attackForecast(poi, team(3), kit, null, 120)!;
    expect(bare.expected.pHurt).toBeGreaterThan(0.1);
    for (const l of [cured.ifWon, cured.ifLost, cured.expected]) {
      expect(l.hurt).toBe(0);
      expect(l.light).toBe(0);
      expect(l.pHurt).toBe(0);
      expect(l.pLight).toBe(0);
      expect(l.heroHurt).toBe(0);
    }
    const hero = {
      name: 'H',
      level: 30,
      combatant: { name: 'H', pv: 50, damage: 5, crit: 0.1, dodge: 0.1, initiative: 10 },
    };
    const h0 = attackForecast(enemy(8), [], road, hero, 120)!;
    const h1 = attackForecast(enemy(8), [], kit, hero, 120)!;
    expect(h0.ifLost.heroHurt).toBe(1);
    expect(h1.ifLost.heroHurt).toBe(0);
  });
  it('personne n’attaque, ou un lieu qui ne se combat pas : rien', () => {
    expect(attackForecast(enemy(3), [], road, null)).toBeNull();
    const mine: Poi = { ...enemy(3), type: 'mine' };
    delete mine.control;
    expect(attackForecast(mine, team(2), road, null)).toBeNull();
  });
  it('coût borné par défaut', () => {
    const f = attackForecast(enemy(3), team(3), road, null)!;
    expect(f.samples).toBe(FORECAST_LOSS_SAMPLES);
  });

  describe('🗼 l’interception d’une armée de reprise', () => {
    const target = held(1000 * H + 10 * H, []);
    const army = retakeArmyPoi(
      target,
      MAP,
      [{ id: 'base', x: EXPE.town.x, y: EXPE.town.y, r: 80 }],
      200,
      1000 * H + 6 * H,
      30,
    )!;
    // Une armée assez rude pour que l'issue reste incertaine.
    const strong: Poi = { ...army, army: { ...army.army!, size: 4 } };
    it('la part abattue attendue ≈ la part abattue réelle ; la victoire = `partyWinChance`', () => {
      expect(army).toBeTruthy();
      const f = interceptForecast(strong, team(2), road, null, 240)!;
      expect(f.win).toBe(partyWinChance(strong, team(2), road, null, 0, 40));
      const real = measure(400, (k) => {
        const g = fightCampForce({
          poi: strong,
          spec: fieldArmySpec(strong)!,
          escort: team(2),
          road,
          hero: null,
          seed: 3000 + k,
          playerLevel: 30,
          pantheonLevel: 30,
        });
        return { g, escort: team(2), milIds: [], seed: 3000 + k };
      });
      expect(Math.abs(real.part - f.partAll)).toBeLessThan(0.06);
      expect(Math.abs(real.pHurt - f.expected.pHurt)).toBeLessThan(0.1);
      expect(f.partAll).toBeGreaterThanOrEqual(f.win);
      expect(f.partIfLost).toBeLessThan(1);
      expect(f.lostSamples).toBeGreaterThan(0);
      expect(Math.abs(real.partLost - f.partIfLost)).toBeLessThan(0.06);
    });
    it('hors armée en campagne : rien', () => {
      expect(interceptForecast(enemy(3), team(2), road, null)).toBeNull();
    });
  });
});
