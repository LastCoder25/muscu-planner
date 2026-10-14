import { describe, expect, it } from 'vitest';
import { ISLAND_OUTPOST_LEVEL, archipelOn } from '@/lib/archipelago';
import { createMap, type ExpeditionMap, type Poi } from '@/lib/expedition';
import {
  controlYieldCard,
  dueRetakes,
  ensureControls,
  holdGrace,
  deadRisingAt,
  knownAttackAt,
  riseCloseness,
  riseShortLabel,
  risingControlKey,
  seatsOf,
} from '@/lib/controlPoints';
import {
  ensureIslandConquest,
  FORTRESS_ID,
  islandConquest,
  objectiveIdOf,
  raiseDead,
  RISE,
  redirectIslandAttacks,
  regainIslandTarget,
  takeObjective,
} from '@/lib/islandConquest';
import { FIELD_ARMY, islandRetakeOrigin, syncFieldArmies } from '@/lib/fieldArmy';

/**
 * 🏳️ ÉTAPE 6 BIS (décisions de l'utilisateur, 2026-10-02) : les objectifs d'une île SE
 * TIENNENT une fois pris, la forteresse vient les récupérer EN PRIORITÉ, puis les lieux fixes.
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;

function island(id: number): ExpeditionMap {
  const lv = archipelOn(id).levelCap;
  const m = createMap(7, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, lv, ISLAND_OUTPOST_LEVEL), NOW, lv);
}
const poi = (m: ExpeditionMap, id: string): Poi | undefined => m.pois.find((p) => p.id === id);
const OBJ = objectiveIdOf(0);

describe('🏳️ un objectif pris se tient', () => {
  it('il reste sur la carte, à nous, avec sa garnison ; il compte comme pris', () => {
    const m = takeObjective(island(1), OBJ, ['a', 'b', 'c', 'd', 'e', 'f'], NOW);
    const o = poi(m, OBJ)!;
    expect(o.control!.owner).toBe('player');
    expect(o.control!.garrison).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(seatsOf('objective')).toBe(5);
    expect(islandConquest(m)!.objectivesDown).toBe(1);
    expect(controlYieldCard(o, NOW + H, 20)).toBeNull();
    // Le tick de la carte le garde, à nous.
    const t = ensureIslandConquest(m, NOW + H, 20);
    expect(t.pois.filter((p) => p.id === OBJ)).toHaveLength(1);
    expect(poi(t, OBJ)!.control!.owner).toBe('player');
    // Et il reçoit une attaque prévue, comme tout lieu tenu.
    const g = ensureControls(t, NOW + H, 20, ISLAND_OUTPOST_LEVEL);
    expect(poi(g, OBJ)!.control!.attackAt).toBeGreaterThan(NOW);
  });
  it('repris par l’ennemi, il recompte comme debout (la forteresse se reverrouille)', () => {
    const m = takeObjective(island(1), OBJ, ['a'], NOW);
    const back = regainIslandTarget(m, OBJ);
    expect(islandConquest(back)!.objectivesDown).toBe(0);
    expect(regainIslandTarget(back, OBJ)).toBe(back);
    expect(regainIslandTarget(m, FORTRESS_ID)).toBe(m);
  });
});

describe('🎯 la forteresse vise d’abord les objectifs qu’on tient', () => {
  /** Un lieu fixe tenu, son attaque échue maintenant ; l'objectif 0 tenu, attaque lointaine.
   *  ⚠️ L'objectif est pris il y a 4 jours : sa trêve (`holdGrace`, 72 h au plus) est finie,
   *  sinon il ne pourrait pas être attaqué maintenant. */
  function setup(takenAt = NOW - 96 * H): ExpeditionMap {
    const m0 = takeObjective(island(1), OBJ, ['a'], takenAt);
    const fixed = m0.pois.find((p) => p.control && !p.id.startsWith('isl_'))!;
    return {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === fixed.id
          ? {
              ...p,
              control: { ...p.control!, owner: 'player', garrison: ['b'], attackAt: NOW - 1 },
            }
          : p.id === OBJ
            ? { ...p, control: { ...p.control!, attackAt: NOW + 48 * H } }
            : p,
      ),
    };
  }
  it('l’attaque échue d’un lieu fixe se reporte sur l’objectif tenu', () => {
    const m = setup();
    const fixedId = dueRetakes(m, NOW).find((p) => !p.id.startsWith('isl_'))!.id;
    const r = redirectIslandAttacks(m, NOW);
    expect(poi(r, OBJ)!.control!.attackAt).toBe(NOW - 1);
    expect(poi(r, fixedId)!.control!.attackAt).toBeGreaterThan(NOW);
    expect(dueRetakes(r, NOW).map((p) => p.id)).toEqual([OBJ]);
  });
  it('🕊️ un objectif tout juste pris est en trêve : le report ne le rend pas dû', () => {
    const m = setup(NOW - H);
    const r = holdGrace(redirectIslandAttacks(m, NOW), NOW);
    expect(dueRetakes(r, NOW).map((p) => p.id)).toEqual([]);
    expect(poi(r, OBJ)!.control!.attackAt).toBeGreaterThan(NOW);
  });
  it('sans objectif tenu, ou île pacifiée, rien ne change', () => {
    const m = setup();
    const noObj = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === OBJ ? { ...p, control: { ...p.control!, owner: 'enemy' as const } } : p,
      ),
    };
    expect(redirectIslandAttacks(noObj, NOW)).toBe(noObj);
    const pac = { ...m, archipel: { ...m.archipel!, pacifiedAt: NOW - H } };
    expect(redirectIslandAttacks(pac, NOW)).toBe(pac);
  });
});

describe('🪦 un cimetière tenu ne se relève pas : ses morts l’attaquent', () => {
  it('il reste à nous, son attaque tombe à l’heure où il se serait relevé', () => {
    const m0 = takeObjective(island(3), OBJ, ['a'], NOW);
    const due = NOW + RISE.riseMs;
    const m = raiseDead(m0, due + 1);
    expect(poi(m, OBJ)!.control!.owner).toBe('player');
    expect(islandConquest(m)!.objectivesDown).toBe(1);
    expect(poi(m, OBJ)!.control!.attackAt).toBe(due);
    expect(m.archipel!.razedAt?.[OBJ]).toBeUndefined();
  });
});

// 🪦 Signalé (2026-10-13) : « une attaque qui vient de nulle part ». Les morts se relèvent sous
// le cimetière, à une heure CONNUE dès la prise ; aucune armée ne marche ; la reprise ordinaire
// d'un cimetière part de la forteresse.
describe('🪦 les morts qui se relèvent se voient venir', () => {
  const due = NOW + RISE.riseMs;
  const withAttack = (m: ExpeditionMap, at: number): ExpeditionMap => ({
    ...m,
    pois: m.pois.map((p) =>
      p.id === OBJ ? { ...p, control: { ...p.control!, attackAt: at } } : p,
    ),
  });
  const taken = () => takeObjective(island(3), OBJ, ['a'], NOW);
  it('posée dès la prise, connue d’avance, et sans armée en marche', () => {
    const m = raiseDead(withAttack(taken(), due + 10 * H), NOW + H);
    const c = poi(m, OBJ)!;
    expect(c.control!.attackAt).toBe(due);
    expect(deadRisingAt(c)).toBe(due);
    expect(knownAttackAt(c, NOW + H)).toBe(due);
    expect(m.archipel!.razedAt?.[OBJ]).toBe(NOW);
    const armies = syncFieldArmies(m, {
      raid: null,
      detectR: 999,
      reach: 999,
      now: due - H,
      playerLevel: 30,
    });
    expect(armies.pois.some((p) => p.army?.kind === 'retake' && p.army.targetId === OBJ)).toBe(
      false,
    );
  });
  it('une reprise déjà prévue avant passe d’abord', () => {
    const m0 = withAttack(taken(), NOW + 5 * H);
    expect(raiseDead(m0, NOW + H)).toBe(m0);
  });
  it('jouée une fois : une défense à cette heure ne se rejoue pas', () => {
    const m1 = raiseDead(withAttack(taken(), due + 10 * H), NOW + H);
    const m2 = withAttack(m1, due + 40 * H);
    const m3 = raiseDead(m2, due + 1);
    expect(poi(m3, OBJ)!.control!.attackAt).toBe(due + 40 * H);
    expect(deadRisingAt(poi(m3, OBJ)!)).toBeNull();
  });
  it('la carte affiche le délai et un cercle qui se resserre', () => {
    expect(riseShortLabel(45 * 60_000)).toBe('45 min');
    expect(riseShortLabel(5 * H - 1)).toBe('5 h');
    expect(riseShortLabel(72 * H)).toBe('3 j');
    expect(riseCloseness(NOW + 48 * H, NOW)).toBe(0);
    expect(riseCloseness(NOW, NOW)).toBe(10);
    const m = raiseDead(withAttack(taken(), due + 10 * H), NOW + H);
    expect(risingControlKey(m, due - 2 * H)).toBe(`${OBJ}:2 h:9`);
  });
});

describe('🏝️ une reprise sur une île part d’un lieu ennemi', () => {
  const mk = (id: string, kind: string, owner: string, x: number, y: number) =>
    ({ id, x, y, control: { kind, owner } }) as unknown as Poi;
  const fort = mk('f', 'fortress', 'enemy', 0, 0);
  const near = mk('o1', 'objective', 'enemy', 50, 50);
  const far = mk('o2', 'objective', 'enemy', 200, 200);
  it('un objectif tenu est repris par la forteresse', () => {
    expect(islandRetakeOrigin([fort, near, far], mk('h', 'objective', 'player', 60, 60))!.id).toBe(
      'f',
    );
  });
  it('un autre lieu fixe, par l’objectif ennemi le plus proche, sinon la forteresse', () => {
    expect(islandRetakeOrigin([fort, near, far], mk('m', 'mine', 'player', 60, 60))!.id).toBe('o1');
    expect(islandRetakeOrigin([fort], mk('m', 'mine', 'player', 60, 60))!.id).toBe('f');
  });
});

// 🏝️ Signalé (2026-10-13) : partie de la forteresse toute proche, la reprise n'était visible
// que quelques minutes. Elle apparaît à son départ, au moins `islandLeadMs` avant l'attaque.
describe('🏝️ la reprise d’un cimetière se voit venir depuis la forteresse', () => {
  const T = NOW + 30 * H;
  const map = () => {
    const m = takeObjective(island(3), OBJ, ['a'], NOW);
    return {
      ...m,
      pois: m.pois.map((p) =>
        p.id === OBJ ? { ...p, control: { ...p.control!, attackAt: T } } : p,
      ),
    };
  };
  const army = (m: ExpeditionMap, now: number) =>
    syncFieldArmies(m, { raid: null, detectR: 0, reach: 0, now, playerLevel: 50 }).pois.find(
      (p) => p.army?.kind === 'retake' && p.army.targetId === OBJ,
    );
  it('visible au moins 4 h avant, partie de la forteresse, sans cercle de détection', () => {
    const m = map();
    const lead = FIELD_ARMY.islandLeadMs;
    const a = army(m, T - 60_000)!;
    expect(a).toBeDefined();
    const fort = poi(m, FORTRESS_ID)!;
    expect(Math.hypot(a.from!.x - fort.x, a.from!.y - fort.y)).toBeLessThan(8);
    expect(a.spawnedAt).toBeLessThanOrEqual(T - lead);
    expect(army(m, a.spawnedAt - 60_000)).toBeUndefined();
    expect(army(m, a.spawnedAt + 60_000)).toBeDefined();
  });
  it('une forteresse toute proche : rassemblée 4 h avant quand même', () => {
    const m0 = map();
    const c = poi(m0, OBJ)!;
    const m = {
      ...m0,
      pois: m0.pois.map((p) => (p.id === FORTRESS_ID ? { ...p, x: c.x + 6, y: c.y } : p)),
    };
    const a = army(m, T - 60_000)!;
    expect(a.spawnedAt).toBe(T - FIELD_ARMY.islandLeadMs);
  });
});

// 🕊️🪦 Signalé (2026-10-14) : la fin d'une trêve décale une relève retenue ; `raiseDead` ne
// doit pas la ramener à son heure d'origine (elle tomberait alors sans préavis).
describe('🪦 une relève décalée par la fin de la trêve garde sa nouvelle heure', () => {
  it('riseAt plus tard que l’échéance : raiseDead n’y touche pas', () => {
    const due = NOW + RISE.riseMs;
    const later = due + 4 * H;
    const m0 = takeObjective(island(3), OBJ, ['a'], NOW);
    const shifted: ExpeditionMap = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === OBJ ? { ...p, control: { ...p.control!, attackAt: later, riseAt: later } } : p,
      ),
    };
    const m = raiseDead(shifted, NOW + H);
    expect(poi(m, OBJ)!.control!.attackAt).toBe(later);
    expect(poi(m, OBJ)!.control!.riseAt).toBe(later);
  });
});
