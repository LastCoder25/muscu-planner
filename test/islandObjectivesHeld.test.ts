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
  heldRazedObjectives,
  islandConquest,
  objectiveIdOf,
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
  // ⚠️ Signalé (2026-10-15, cimetière de l'île 3) : le report posait l'attaque de l'objectif à
  // l'heure ÉCHUE — elle se jouait à la seconde, sans armée en marche ni préavis, et un
  // objectif laissé vide passait à l'ennemi « instantanément ». L'attaque reportée part
  // désormais de la forteresse, VISIBLE, et tombe à son arrivée.
  it('l’attaque échue d’un lieu fixe se reporte sur l’objectif tenu, qu’on voit venir', () => {
    const m = setup();
    const fixedId = dueRetakes(m, NOW).find((p) => !p.id.startsWith('isl_'))!.id;
    const r = redirectIslandAttacks(m, NOW);
    const at = poi(r, OBJ)!.control!.attackAt!;
    expect(at).toBeGreaterThanOrEqual(NOW + FIELD_ARMY.islandLeadMs);
    expect(at).toBeLessThan(NOW + 48 * H);
    expect(poi(r, fixedId)!.control!.attackAt).toBeGreaterThan(NOW);
    expect(dueRetakes(r, NOW)).toEqual([]);
    // L'armée est sur la carte dès maintenant, partie de la forteresse.
    const seen = syncFieldArmies(r, { raid: null, detectR: 0, reach: 200, now: NOW, playerLevel: 20 });
    const army = seen.pois.find((p) => p.army?.kind === 'retake' && p.army.targetId === OBJ);
    expect(army).toBeDefined();
  });
  it('une attaque déjà prévue plus tôt sur l’objectif reste la sienne', () => {
    const m0 = setup();
    const m = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === OBJ ? { ...p, control: { ...p.control!, attackAt: NOW + H } } : p,
      ),
    };
    expect(poi(redirectIslandAttacks(m, NOW), OBJ)!.control!.attackAt).toBe(NOW + H);
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

// 🕯️ Île 3 (décision de l'utilisateur, 2026-10-16) : un objectif battu ne se TIENT plus, il
// s'éteint (cf. `islandDead.test.ts` pour le rallumage). Restent les cimetières TENUS d'avant :
// le store rappelle leur garnison (`heldRazedObjectives`), puis la carte les retire.
describe('🕯️ un cimetière battu ne se tient pas : il s’éteint', () => {
  it('takeObjective n’ajoute aucun lieu tenu : il quitte la carte, compte abattu, a une braise', () => {
    const m = takeObjective(island(3), OBJ, ['a'], NOW);
    expect(poi(m, OBJ)).toBeUndefined();
    expect(m.pois.some((p) => p.control?.owner === 'player' && p.id === OBJ)).toBe(false);
    expect(islandConquest(m)!.objectivesDown).toBe(1);
    expect(m.archipel!.destroyed).toContain(OBJ);
    expect(m.archipel!.embers?.[OBJ]).toMatchObject({ at: NOW, charge: 0 });
  });
  it('un cimetière tenu d’avant : rappelé (garnison), puis retiré avec une braise neuve', () => {
    const base = island(3);
    const razed = takeObjective(base, OBJ, [], NOW);
    // Reliquat : l'ancienne règle le laissait sur la carte, à nous, garnison dedans.
    const old = base.pois.find((p) => p.id === OBJ)!;
    const holder = (garrison: string[]): ExpeditionMap => ({
      ...razed,
      archipel: { ...razed.archipel!, embers: undefined },
      pois: [
        ...razed.pois,
        { ...old, control: { ...old.control!, owner: 'player', razes: undefined, garrison } },
      ],
    });
    const held = holder(['a']);
    expect(heldRazedObjectives(held).map((p) => p.id)).toEqual([OBJ]);
    // Tant que quelqu'un y reste, la carte le garde.
    expect(poi(ensureIslandConquest(held, NOW + H, 50), OBJ)!.control!.owner).toBe('player');
    // Vidé : il quitte la carte et reçoit sa braise, comptée à partir de maintenant.
    const empty = holder([]);
    expect(heldRazedObjectives(empty)).toEqual([]);
    const t = ensureIslandConquest(empty, NOW + H, 50);
    expect(poi(t, OBJ)).toBeUndefined();
    expect(t.archipel!.embers?.[OBJ]).toMatchObject({ at: NOW + H, charge: 0 });
    // Les autres îles n'ont rien de tel.
    expect(heldRazedObjectives(takeObjective(island(1), OBJ, ['a'], NOW))).toEqual([]);
  });
});

// 🪦 Signalé (2026-10-13) : « une attaque qui vient de nulle part ». Des morts qui se relèvent
// (`riseAt` = `attackAt`) ont une heure CONNUE d'avance ; aucune armée ne marche. Ces fonctions
// restent génériques sur `riseAt` (plus posé par l'île 3 : construit ici à la main).
describe('🪦 une relève datée (riseAt) se voit venir', () => {
  const due = NOW + 72 * H;
  const rising = (attackAt = due, riseAt = due): Poi => {
    const o = island(3).pois.find((p) => p.id === OBJ)!;
    return { ...o, control: { ...o.control!, owner: 'player', attackAt, riseAt } };
  };
  it('connue d’avance, sans armée en marche', () => {
    const c = rising();
    expect(deadRisingAt(c)).toBe(due);
    expect(knownAttackAt(c, NOW + H)).toBe(due);
    const m = { ...island(3), pois: [...island(3).pois.filter((p) => p.id !== OBJ), c] };
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
  it('une échéance déplacée depuis (attackAt ≠ riseAt) n’est plus celle des morts', () => {
    expect(deadRisingAt(rising(due + 4 * H, due))).toBeNull();
    const enemy = rising();
    enemy.control!.owner = 'enemy';
    expect(deadRisingAt(enemy)).toBeNull();
  });
  it('la carte affiche le délai et un cercle qui se resserre', () => {
    expect(riseShortLabel(45 * 60_000)).toBe('45 min');
    expect(riseShortLabel(5 * H - 1)).toBe('5 h');
    expect(riseShortLabel(72 * H)).toBe('3 j');
    expect(riseCloseness(NOW + 48 * H, NOW)).toBe(0);
    expect(riseCloseness(NOW, NOW)).toBe(10);
    const m = { ...island(3), pois: [...island(3).pois.filter((p) => p.id !== OBJ), rising()] };
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
describe('🏝️ la reprise d’un objectif tenu se voit venir depuis la forteresse', () => {
  const T = NOW + 30 * H;
  const map = () => {
    const m = takeObjective(island(1), OBJ, ['a'], NOW);
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
