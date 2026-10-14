// 🩸 Les pertes de l'ennemi se reportent sur la troupe qui s'installe (2026-10-14) : elle se
// renforce au fil des VAGUES d'attaque du joueur, pas de l'horloge.
import { describe, expect, it } from 'vitest';
import {
  WEAR,
  addWear,
  healWear,
  healedWear,
  newWaves,
  wavesToHeal,
  wearEnemy,
  wearHitLabel,
  wearSettleLabel,
  wornSize,
  type EnemyWear,
} from '@/lib/enemyWear';
import {
  captureControl,
  controlIdOf,
  ensureControls,
  loseControl,
  holdControl,
} from '@/lib/controlPoints';
import {
  campSpecOf,
  createMap,
  forgetDeparture,
  isAttackTarget,
  moveDeparture,
  recordDeparture,
  type ExpeditionMap,
} from '@/lib/expedition';
import { archipelOn, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { ensureIslandConquest, objectiveIdOf, takeObjective } from '@/lib/islandConquest';
import { partyClaimRoster } from '@/lib/party';
import { refChampionAdv } from '@/lib/caravan';

const H = 3_600_000;
const NOW = 1_000 * H;
const ID = controlIdOf('mine');
const L = 30;
const mapAt = (seed = 3): ExpeditionMap => ensureControls(createMap(seed, 0, L, 1), 0, L, 100);
const poiOf = (m: ExpeditionMap, id = ID) => m.pois.find((p) => p.id === id)!;
const withDeps = (m: ExpeditionMap, departures: number[]): ExpeditionMap => ({
  ...m,
  attackTrips: departures,
});

describe('addWear', () => {
  it('compose les pertes : 1 − (1 − a)(1 − b)', () => {
    const a = addWear(undefined, 0.2, NOW)!;
    expect(a.share).toBeCloseTo(0.2);
    const b = addWear(a, 0.2, NOW)!;
    expect(b.share).toBeCloseTo(1 - 0.8 * 0.8);
  });
  it('pas de plancher : l’usure est ce que le combat a retiré, jusqu’à 100 %', () => {
    expect(WEAR.minShare).toBe(0);
    expect(addWear(undefined, 0.8, NOW)!.share).toBeCloseTo(0.8);
    const w = addWear(undefined, 1, NOW)!;
    expect(w.share).toBeCloseTo(1);
    expect(addWear(w, 1, NOW)!.share).toBeCloseTo(1);
  });
  it('taille technique : une troupe à 0 reste minuscule mais jamais nulle', () => {
    const w = addWear(undefined, 1, NOW)!;
    expect(wornSize(10, w)).toBeCloseTo(WEAR.minSize);
    expect(wornSize(0.02, w)).toBeCloseTo(0.02); // jamais au-dessus de la taille d'origine
    expect(wornSize(10, addWear(undefined, 0.5, NOW))).toBeCloseTo(5);
    expect(wornSize(10, undefined)).toBe(10);
  });
  it('une usure sous epsilon, ou un NaN, ne laisse rien', () => {
    expect(addWear(undefined, 0.005, NOW)).toBeUndefined();
    expect(addWear(undefined, Number.NaN, NOW)).toBeUndefined();
  });
  it('idempotent : un même combat (hitId) n’est compté qu’une fois', () => {
    const a = addWear(undefined, 0.3, NOW, 'r1')!;
    const again = addWear(a, 0.3, NOW, 'r1')!;
    expect(again).toBe(a);
    expect(again.share).toBeCloseTo(0.3);
    expect(addWear(a, 0.3, NOW, 'r2')!.share).toBeGreaterThan(0.3);
  });
  it('les ids comptés sont bornés', () => {
    let w: EnemyWear | undefined;
    for (let i = 0; i < 30; i++) w = addWear(w, 0.01, NOW, `r${i}`);
    expect(w!.hits!.length).toBeLessThanOrEqual(12);
    expect(w!.hits!.at(-1)).toBe('r29');
  });
});

describe('guérison par vagues d’attaque', () => {
  const worn = addWear(undefined, 0.4, NOW, 'r1')!;
  const poi = (m: ExpeditionMap) => poiOf(m);
  const worned = (): ExpeditionMap =>
    loseControl(captureControl(mapAt(), ID, ['a0'], 0, 7), ID, L, NOW, {
      level: 5,
      faction: 'bandits',
      dealt: 0.4,
      hitId: 'r1',
    });
  it('sans trajet d’attaque arrivé, healWear rend EXACTEMENT la même carte', () => {
    const m = withDeps(worned(), [NOW - H]); // avant l'usure
    expect(healWear(m, NOW + 5 * H)).toBe(m);
    expect(healWear(worned(), NOW + 5 * H)).toEqual(worned());
  });
  it('chaque VAGUE arrivée retire `healPerWave`, l’horloge seule ne fait rien', () => {
    const m = withDeps(worned(), [NOW + 2 * H, NOW + 4 * H]);
    const next = healWear(m, NOW + 5 * H);
    expect(next).not.toBe(m);
    const w = poi(next).control!.wear!;
    expect(w.share).toBeCloseTo(0.4 - 2 * WEAR.healPerWave);
    expect(w.from).toBe(NOW + 4 * H);
    // une seconde lecture ne recompte pas les mêmes vagues
    expect(healWear(next, NOW + 6 * H)).toBe(next);
    // des trajets pas encore arrivés ne comptent pas
    const early = healWear(withDeps(worned(), [NOW + 9 * H]), NOW + H);
    expect(poi(early).control!.wear!.share).toBeCloseTo(0.4);
  });
  it('plusieurs équipes parties ensemble ne font qu’UNE vague', () => {
    const m = withDeps(worned(), [NOW + 2 * H, NOW + 2.2 * H, NOW + 2.9 * H, NOW + 3 * H]);
    const w = poi(healWear(m, NOW + 4 * H)).control!.wear!;
    expect(w.share).toBeCloseTo(0.4 - WEAR.healPerWave);
    // la vague est commencée : un trajet lu plus tard, dans sa fenêtre, ne compte pas
    const next = healWear(m, NOW + 2.5 * H);
    expect(poi(healWear(next, NOW + 3 * H)).control!.wear!.share).toBeCloseTo(
      0.4 - WEAR.healPerWave,
    );
  });
  it('la vague du combat lui-même ne renforce pas la troupe qu’il vient d’user', () => {
    const m = withDeps(worned(), [NOW + 0.5 * H]);
    expect(healWear(m, NOW + 2 * H)).toBe(m);
  });
  it('newWaves : une vague s’ouvre plus de `waveMs` après le début de la précédente', () => {
    expect(newWaves([], NOW, NOW + 9 * H)).toEqual({ n: 0, last: NOW });
    expect(newWaves([NOW + 3 * H, NOW + 1.5 * H, NOW + 2 * H], NOW, NOW + 9 * H)).toEqual({
      n: 2,
      last: NOW + 3 * H,
    });
  });
  it('assez de vagues : l’usure disparaît', () => {
    const n = wavesToHeal(worn);
    expect(n).toBe(Math.ceil((0.4 - WEAR.epsilon) / WEAR.healPerWave));
    const deps = Array.from({ length: n }, (_, i) => NOW + (i + 1) * 2 * H);
    const next = healWear(withDeps(worned(), deps), NOW + (2 * n + 1) * H);
    // guérie : pleine force, seule reste la mémoire des combats comptés (part 0)
    expect(poi(next).control!.wear!.share).toBe(0);
    expect(campSpecOf(poi(next))!.size).toBe(poi(next).control!.size);
    expect(healedWear(worn, n, NOW)!.share).toBe(0);
    expect(healedWear({ share: 0.4, from: NOW }, n, NOW)).toBeUndefined();
  });
  it('seuls les trajets d’ATTAQUE renforcent : les départs simples ne comptent pas', () => {
    const m: ExpeditionMap = { ...worned(), departures: [NOW + 2 * H, NOW + 4 * H] };
    expect(healWear(m, NOW + 5 * H)).toBe(m);
  });
  it('jamais au-dessus de l’armée initiale : trop de vagues ramènent à la taille neuve', () => {
    const base = poi(worned()).control!.size;
    const deps = Array.from({ length: 50 }, (_, i) => NOW + (i + 1) * 2 * H);
    const next = healWear(withDeps(worned(), deps), NOW + 120 * H);
    expect(poi(next).control!.wear!.share).toBe(0);
    expect(poi(next).control!.size).toBe(base);
    expect(campSpecOf(poi(next))!.size).toBe(base);
    for (let t = 1; t <= 12; t++) {
      const w = healedWear(worn, t, NOW);
      expect(wornSize(base, w)).toBeLessThanOrEqual(base);
    }
  });
  it('un lieu tenu par le joueur n’est pas touché', () => {
    const m = withDeps(captureControl(mapAt(), ID, ['a0'], 0, 7), [NOW + 2 * H]);
    expect(healWear(m, NOW + 3 * H)).toBe(m);
  });
});

describe('loseControl : l’ennemi s’installe affaibli', () => {
  const held = () => captureControl(mapAt(), ID, ['a0'], 0, 7);
  it('pose l’usure du combat sur la nouvelle troupe, idempotente par rapport', () => {
    const m = loseControl(held(), ID, L, NOW, {
      level: 5,
      faction: 'bandits',
      dealt: 0.4,
      hitId: 'rep',
    });
    const c = poiOf(m).control!;
    expect(c.owner).toBe('enemy');
    expect(c.wear!.share).toBeCloseTo(0.4);
    expect(c.wear!.hits).toEqual(['rep']);
  });
  it('sans `dealt` (rien entamé, ou abandon), la troupe est neuve', () => {
    expect(
      poiOf(loseControl(held(), ID, L, NOW, { level: 5, faction: 'bandits', dealt: 0 })).control!
        .wear,
    ).toBeUndefined();
    expect(poiOf(loseControl(held(), ID, L, NOW)).control!.wear).toBeUndefined();
  });
  it('campSpecOf combat la troupe USÉE', () => {
    const m = loseControl(held(), ID, L, NOW, { level: 5, faction: 'bandits', dealt: 0.4 });
    const p = poiOf(m);
    expect(campSpecOf(p)!.size).toBeCloseTo(p.control!.size * 0.6);
    const fresh = { ...p, control: { ...p.control!, wear: undefined } };
    expect(campSpecOf(fresh)!.size).toBe(p.control!.size);
  });
  it('un lieu défendu avec succès ne garde aucune usure ennemie à poser', () => {
    expect(poiOf(holdControl(held(), ID, NOW, 7)).control!.wear).toBeUndefined();
  });
});

describe('attaque ratée du joueur', () => {
  const enemy = (): ExpeditionMap => mapAt();
  it('la troupe ennemie garde la trace du combat, une seule fois par rapport', () => {
    const m = wearEnemy(enemy(), ID, 0.2, NOW, 'att1');
    expect(poiOf(m).control!.wear!.share).toBeCloseTo(0.2);
    expect(campSpecOf(poiOf(m))!.size).toBeCloseTo(poiOf(enemy()).control!.size * 0.8);
    expect(wearEnemy(m, ID, 0.2, NOW, 'att1')).toBe(m);
    const twice = wearEnemy(m, ID, 0.2, NOW + H, 'att2');
    expect(poiOf(twice).control!.wear!.share).toBeCloseTo(1 - 0.8 * 0.8);
  });
  it('rien entamé, lieu inconnu ou tenu par nous : même carte', () => {
    const m = enemy();
    expect(wearEnemy(m, ID, 0, NOW, 'x')).toBe(m);
    expect(wearEnemy(m, 'nope', 0.3, NOW, 'x')).toBe(m);
    const mine = captureControl(m, ID, ['a0'], 0, 7);
    expect(wearEnemy(mine, ID, 0.3, NOW, 'x')).toBe(mine);
  });
});

describe('prise : l’usure disparaît', () => {
  it('captureControl efface l’usure de la troupe vaincue', () => {
    const worn = wearEnemy(mapAt(), ID, 0.3, NOW, 'a');
    expect(poiOf(worn).control!.wear).toBeDefined();
    const taken = captureControl(worn, ID, ['a0'], NOW, 7);
    expect(poiOf(taken).control!.owner).toBe('player');
    expect(poiOf(taken).control!.wear).toBeUndefined();
    // et ce n'est pas revenu à l'ennemi avec l'ancienne usure : une reprise repart de zéro
    const lost = loseControl(taken, ID, L, NOW + H);
    expect(poiOf(lost).control!.wear).toBeUndefined();
  });
  it('takeObjective efface l’usure de l’objectif tenu', () => {
    const lv = archipelOn(1).levelCap;
    const isl = ensureIslandConquest(
      ensureControls(
        createMap(7, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(1)),
        NOW,
        lv,
        ISLAND_OUTPOST_LEVEL,
      ),
      NOW,
      lv,
    );
    const OBJ = objectiveIdOf(0);
    const worn = wearEnemy(isl, OBJ, 0.3, NOW, 'a');
    expect(poiOf(worn, OBJ).control!.wear).toBeDefined();
    const held = takeObjective(worn, OBJ, ['a0'], NOW).pois.find((q) => q.id === OBJ)!;
    expect(held.control!.owner).toBe('player');
    expect(held.control!.wear).toBeUndefined();
  });
});

describe('trajets d’attaque sur la carte', () => {
  it('recordDeparture(…, attack) alimente attackTrips, forget/move le suivent', () => {
    const m0 = mapAt();
    const a = recordDeparture(m0, NOW, NOW + H, true);
    expect(a.departures).toContain(NOW + H);
    expect(a.attackTrips).toEqual([NOW + H]);
    const plain = recordDeparture(a, NOW, NOW + 2 * H);
    expect(plain.attackTrips).toEqual([NOW + H]);
    const moved = moveDeparture(plain, NOW + H, NOW + 30 * 60_000);
    expect(moved.attackTrips).toEqual([NOW + 30 * 60_000]);
    const forgot = forgetDeparture(moved, NOW + 30 * 60_000);
    expect(forgot.attackTrips).toBeUndefined();
    expect(forgot.departures).toEqual([NOW + 2 * H]);
  });
  it('isAttackTarget : lieu fixe ennemi oui, lieu tenu non', () => {
    const m = mapAt();
    expect(isAttackTarget(poiOf(m))).toBe(true);
    expect(isAttackTarget(poiOf(captureControl(m, ID, ['a0'], 0, 7)))).toBe(false);
  });
});

describe('textes', () => {
  it('dit l’usure à partir de 1 %', () => {
    expect(wearSettleLabel(0.4)).toContain('affaibli de 40 %');
    expect(wearHitLabel(0.4)).toContain('retiré 40 %');
    expect(wearSettleLabel(0.004)).toBe('');
    expect(wearHitLabel(undefined)).toBe('');
  });
});

describe('victoire serrée en défense : blessure légère encaissée sans XP en double', () => {
  it('xpGranted : le blessé léger reçoit sa convalescence, son XP ne bouge pas', () => {
    const adv = { ...refChampionAdv(10, 0), id: 'a' };
    const party = {
      hero: false,
      faction: 'bandits' as const,
      escort: ['a'],
      win: true,
      foes: 2,
      slain: 2,
      kills: {},
      heroKills: 0,
      xp: { a: 50 },
      hurt: [],
      lightHurt: ['a'],
      journal: [],
    };
    const r = partyClaimRoster(party, [adv], {
      pantheonLevel: 50,
      heroLevel: 30,
      infirmaryLevel: 0,
      backAt: NOW,
      now: NOW,
      xpGranted: true,
      healMult: 1,
    });
    const out = r.adventurers[0]!;
    expect(out.hurtUntil).toBeGreaterThan(NOW);
    expect(out.xp).toBe(adv.xp);
    expect(out.level).toBe(adv.level);
  });
});

describe('relecture : robustesse', () => {
  it('un rapport retraité APRÈS guérison complète ne ré-use pas la troupe', () => {
    const lost = loseControl(captureControl(mapAt(), ID, ['a0'], 0, 7), ID, L, NOW, {
      level: 5,
      faction: 'bandits',
      dealt: 0.3,
      hitId: 'rep',
    });
    const deps = Array.from({ length: 10 }, (_, i) => NOW + (i + 1) * 2 * H);
    const healed = healWear(withDeps(lost, deps), NOW + 30 * H);
    expect(poiOf(healed).control!.wear!.share).toBe(0);
    // le même combat relu : rien ne change
    expect(wearEnemy(healed, ID, 0.3, NOW, 'rep')).toBe(healed);
    // un AUTRE combat use bien
    expect(
      poiOf(wearEnemy(healed, ID, 0.3, NOW + 31 * H, 'autre')).control!.wear!.share,
    ).toBeCloseTo(0.3);
    // une usure à 0 ne se « guérit » plus (la carte ne bouge pas)
    const more = withDeps(healed, [...deps, NOW + 40 * H]);
    expect(healWear(more, NOW + 41 * H)).toBe(more);
  });
  it('le nombre de vagues annoncé suffit (pas d’arrondi flottant trompeur)', () => {
    for (const share of [0.08, 0.15, 0.22, 0.29, 0.43, 0.71, 1]) {
      const w = { share, from: NOW };
      const n = wavesToHeal(w);
      expect(healedWear(w, n, NOW), String(share)).toBeUndefined();
      if (n > 1) expect(healedWear(w, n - 1, NOW), String(share)).toBeDefined();
    }
  });
});
