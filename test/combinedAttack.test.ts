import { describe, expect, it } from 'vitest';
import {
  attackNoShows,
  attackOutings,
  attackParticipants,
  attackSettled,
  attackWaitingIds,
  attackWingVoyages,
  BASE_WING_ID,
  wingOriginId,
  combinedBlocker,
  heroAttackReturnAt,
  heroInAttack,
  heroOutInAttack,
  normalizeAttacks,
  planWings,
  wingDeparture,
  type AttackWing,
  type CombinedAttack,
} from '@/lib/combinedAttack';
import type { Adventurer } from '@/lib/adventurers';
import { travelPosition, type ExpeditionMap, type Poi } from '@/lib/expedition';

const MIN = 60_000;
const target = { id: 'camp1', type: 'camp', x: 150, y: 60, level: 20 } as unknown as Poi;
const adv = (id: string, extra: Partial<Adventurer> = {}): Adventurer =>
  ({ id, name: id, level: 10, xp: 0, seed: 1, path: [], ...extra }) as unknown as Adventurer;

function mapWith(point: Partial<Poi['control']> & { id?: string } = {}): ExpeditionMap {
  const { id = 'pt1', ...control } = point;
  return {
    pois: [
      {
        id,
        type: 'mine',
        x: 40,
        y: 40,
        level: 20,
        control: { owner: 'player', garrison: ['c1', 'c2'], ...control },
      },
    ],
  } as unknown as ExpeditionMap;
}

describe('planWings — tous arrivent ensemble', () => {
  const now = 1_000_000;
  const p = planWings(
    [
      { originId: null, members: ['a'], hero: true, legMin: 60 },
      { originId: 'pt1', members: ['c1'], hero: false, legMin: 20 },
    ],
    now,
    5 * MIN,
  );
  it("l'arrivée commune est le plus long trajet, parti maintenant", () => {
    expect(p.arriveAt).toBe(now + 60 * MIN);
    expect(p.midAt).toBe(p.arriveAt + 5 * MIN);
  });
  it('chaque groupe part à « arrivée − son trajet » et rentre à son pas', () => {
    expect(p.wings[0]!.departAt).toBe(now);
    expect(p.wings[1]!.departAt).toBe(now + 40 * MIN);
    for (const w of p.wings) {
      expect(w.departAt + w.legMin * MIN).toBe(p.arriveAt);
      expect(w.returnAt).toBe(p.midAt + w.legMin * MIN);
      expect(w.state).toBe('waiting');
    }
  });
});

describe('combinedBlocker', () => {
  const w = (originId: string | null, members: string[], hero = false) => ({
    originId,
    members,
    hero,
  });
  it('au moins deux départs', () => {
    expect(combinedBlocker(target, [w(null, ['a'])], null)).toBe('fewWings');
  });
  it('une armée en marche ne se coordonne pas', () => {
    // ⚔️🧭 Depuis les armées en campagne, une cible en MARCHE se coordonne : la rencontre
    // commune se calcule (`meetAll`).
    expect(combinedBlocker({ type: 'warband' }, [w(null, ['a']), w('p', ['b'])], null)).toBeNull();
  });
  it('ni départ ni champion en double', () => {
    expect(combinedBlocker(target, [w('p', ['a']), w('p', ['b'])], null)).toBe('twice');
    expect(combinedBlocker(target, [w(null, ['a']), w('p', ['a'])], null)).toBe('twice');
  });
  it('le héros part de la base', () => {
    expect(combinedBlocker(target, [w(null, ['a']), w('p', ['b'], true)], null)).toBe('heroFar');
  });
  it('chaque départ envoie quelqu’un', () => {
    expect(combinedBlocker(target, [w(null, [], true), w('p', [])], null)).toBe('emptyWing');
    expect(combinedBlocker(target, [w(null, [], true), w('p', ['b'])], null)).toBeNull();
  });
  // 🐞 Signalé : « le bouton est grisé » sur une attaque combinée avec le héros. L'écran
  // nomme la base « base » dans son plan ; la règle attend `null`. `wingOriginId` est la
  // SEULE traduction, lue par la vérification ET l'envoi.
  it('le plan de l’écran (« base » + un point) avec le héros peut partir', () => {
    expect(wingOriginId(BASE_WING_ID)).toBeNull();
    expect(wingOriginId('pt1')).toBe('pt1');
    const plan = [
      { id: BASE_WING_ID, ids: ['a'], hero: true },
      { id: 'pt1', ids: ['c1'], hero: false },
    ];
    const wings = plan.map((p) => w(wingOriginId(p.id), p.ids, p.hero));
    expect(combinedBlocker(target, wings, null)).toBeNull();
    // Sans la traduction, c'était le défaut : le héros « partait » d'un point nommé « base ».
    expect(
      combinedBlocker(
        target,
        plan.map((p) => w(p.id, p.ids, p.hero)),
        null,
      ),
    ).toBe('heroFar');
  });
});

describe('wingDeparture — l’attente se paie', () => {
  const t0 = 5_000_000;
  const wing = (extra: Partial<AttackWing> = {}): AttackWing => ({
    originId: null,
    members: ['a', 'b'],
    hero: true,
    legMin: 30,
    departAt: t0,
    returnAt: t0 + 90 * MIN,
    state: 'waiting',
    ...extra,
  });
  const reserved = (id: string, extra: Partial<Adventurer> = {}) =>
    adv(id, { busyUntil: t0 + 90 * MIN, ...extra });
  const ctx = (extra = {}) => ({
    now: t0,
    map: mapWith(),
    advs: [reserved('a'), reserved('b')],
    raidAt: null,
    heroWoundedAt: () => false,
    ...extra,
  });

  it("pas encore l'heure → rien", () => {
    expect(wingDeparture(wing(), ctx({ now: t0 - 1 }))).toBeNull();
    expect(wingDeparture(wing({ state: 'gone' }), ctx())).toBeNull();
  });
  it('tout le monde part', () => {
    expect(wingDeparture(wing(), ctx())).toEqual({ members: ['a', 'b'], hero: true });
  });
  it('un siège échu AVANT le départ et pas encore tranché → on attend', () => {
    expect(wingDeparture(wing(), ctx({ raidAt: t0 - MIN }))).toBe('wait');
    // Un siège qui tombe APRÈS le départ ne retient personne.
    expect(wingDeparture(wing(), ctx({ raidAt: t0 + MIN }))).not.toBe('wait');
  });
  it("un champion à l'infirmerie au départ ne vient pas, un héros blessé non plus", () => {
    const r = wingDeparture(
      wing(),
      ctx({
        advs: [reserved('a', { hurtUntil: t0 + MIN }), reserved('b')],
        heroWoundedAt: () => true,
      }),
    );
    expect(r).toEqual({ members: ['b'], hero: false });
  });
  it('un champion réservé pour autre chose (busyUntil différent) ne vient pas', () => {
    const r = wingDeparture(wing(), ctx({ advs: [reserved('a'), adv('b', { busyUntil: 1 })] }));
    expect(r).toEqual({ members: ['a'], hero: true });
  });
  it('un champion posté ailleurs ne part pas de la base', () => {
    const r = wingDeparture(
      wing(),
      ctx({ advs: [reserved('a', { posted: 'pt1' }), reserved('b')] }),
    );
    expect(r).toEqual({ members: ['b'], hero: true });
  });

  describe('depuis un point fixe', () => {
    const pw = (extra: Partial<AttackWing> = {}) =>
      wing({ originId: 'pt1', members: ['c1', 'c2'], hero: false, ...extra });
    const posted = (id: string, extra: Partial<Adventurer> = {}) =>
      reserved(id, { posted: 'pt1', ...extra });
    it('la garnison encore en poste part', () => {
      expect(wingDeparture(pw(), ctx({ advs: [posted('c1'), posted('c2')] }))).toEqual({
        members: ['c1', 'c2'],
        hero: false,
      });
    });
    it('une reprise échue avant le départ et pas tranchée → on attend', () => {
      expect(
        wingDeparture(pw(), ctx({ map: mapWith({ attackAt: t0 - MIN }), advs: [posted('c1')] })),
      ).toBe('wait');
    });
    it('point perdu → personne ne part (ils ont été battus)', () => {
      expect(
        wingDeparture(pw(), ctx({ map: mapWith({ owner: 'enemy' }), advs: [posted('c1')] })),
      ).toEqual({ members: [], hero: false });
    });
    it('un champion sorti de la garnison ne part pas', () => {
      const r = wingDeparture(
        pw(),
        ctx({ map: mapWith({ garrison: ['c2'] }), advs: [posted('c1'), posted('c2')] }),
      );
      expect(r).toEqual({ members: ['c2'], hero: false });
    });
  });
});

function attack(wings: Partial<AttackWing>[], extra: Partial<CombinedAttack> = {}): CombinedAttack {
  return {
    id: 'atk1',
    poi: target,
    seed: 7,
    createdAt: 0,
    arriveAt: 100 * MIN,
    midAt: 110 * MIN,
    playerLevel: 20,
    supplies: [],
    wings: wings.map((w) => ({
      originId: null,
      members: [],
      hero: false,
      legMin: 30,
      departAt: 70 * MIN,
      returnAt: 140 * MIN,
      state: 'waiting' as const,
      ...w,
    })),
    ...extra,
  };
}

describe('état et présence', () => {
  const a = attack([
    { members: ['a', 'b'], hero: true, state: 'gone', gone: ['a'], heroGone: true },
    { originId: 'pt1', members: ['c1'], state: 'dropped', gone: [] },
    { originId: 'pt2', members: ['d'], state: 'waiting', departAt: 90 * MIN },
  ]);
  it('réglée seulement quand plus personne n’attend', () => {
    expect(attackSettled(a)).toBe(false);
    expect(attackSettled(attack([{ state: 'gone' }, { state: 'dropped' }]))).toBe(true);
  });
  it('participants et absents', () => {
    expect(attackParticipants(a)).toEqual({ ids: ['a'], hero: true });
    expect(attackNoShows(a)).toEqual({ ids: ['b', 'c1', 'd'], hero: false });
  });
  it('dehors : les partis jusqu’au retour, les attendus à partir de leur départ ; jamais un groupe abandonné', () => {
    expect(attackOutings([a])).toEqual([
      { sentAt: 70 * MIN, returnAt: 140 * MIN, escort: ['a'], hero: true },
      { sentAt: 90 * MIN, returnAt: 140 * MIN, escort: ['d'], hero: false },
    ]);
  });
  it('le héros est engagé tant qu’il attend ou qu’il est parti', () => {
    expect(heroInAttack([a])).toBe(true);
    expect(heroInAttack([attack([{ hero: true }])])).toBe(true);
    expect(heroInAttack([attack([{ hero: true, state: 'gone', heroGone: false }])])).toBe(false);
    expect(heroInAttack(null)).toBe(false);
  });
  // 🐞 Signalé : « ça me met le héros dispo alors qu'il est en attaque combinée ».
  it('le héros rentre d’une attaque à son heure de retour — en attente comme parti', () => {
    const w = (over: object) => attack([{ hero: true, returnAt: 140 * MIN, ...over }]);
    expect(heroAttackReturnAt([w({})])).toBe(140 * MIN);
    expect(heroAttackReturnAt([w({ state: 'gone', heroGone: true })])).toBe(140 * MIN);
    expect(heroAttackReturnAt([w({ state: 'gone', heroGone: false })])).toBeNull();
    expect(heroAttackReturnAt([attack([{ hero: false }])])).toBeNull();
    expect(heroAttackReturnAt(null)).toBeNull();
  });
  it('seul un héros PARTI quitte la base : en attente, il défend encore', () => {
    expect(heroOutInAttack([attack([{ hero: true }])])).toBe(false);
    expect(heroOutInAttack([attack([{ hero: true, state: 'gone', heroGone: true }])])).toBe(true);
    expect(heroOutInAttack(null)).toBe(false);
  });
});

describe('attackWingVoyages — la carte', () => {
  it('un groupe qui attend est posé chez lui ; tous visent la même arrivée', () => {
    const map = mapWith();
    const v = attackWingVoyages(
      [attack([{ members: ['a'] }, { originId: 'pt1', members: ['c1'] }, { state: 'dropped' }])],
      map,
    );
    expect(v).toHaveLength(2);
    expect(v[0]!.voyage.origin).toBeUndefined();
    expect(v[1]!.voyage.origin).toEqual({ x: 40, y: 40 });
    for (const w of v) {
      expect(w.voyage.midAt - w.voyage.dwellMs).toBe(100 * MIN);
      expect(w.waiting).toBe(true);
    }
  });
});

describe('normalizeAttacks', () => {
  it('écarte le malformé sans planter', () => {
    expect(normalizeAttacks(null)).toEqual([]);
    expect(normalizeAttacks([{ id: 'x' }, attack([{}])])).toHaveLength(1);
  });
});

describe('attackWaitingIds — les membres qu’une attaque attend encore', () => {
  it('rend les membres des groupes en attente, pas ceux déjà partis ni abandonnés', () => {
    const ids = attackWaitingIds([
      attack([
        { originId: 'oss', members: ['a', 'b'] },
        { members: ['c'], state: 'gone', gone: ['c'] },
        { members: ['d'], state: 'dropped' },
      ]),
    ]);
    expect([...ids].sort()).toEqual(['a', 'b']);
    expect(attackWaitingIds(null).size).toBe(0);
  });
});

describe('planWings — « tous maintenant » (les plus proches ralentis)', () => {
  const now = 1_000_000;
  const inputs = [
    { originId: null, members: ['a'], hero: true, legMin: 60 },
    { originId: 'pt1', members: ['c1'], hero: false, legMin: 20 },
  ];
  const p = planWings(inputs, now, 5 * MIN, 0, true);
  it('tout le monde part maintenant et arrive ensemble', () => {
    expect(p.arriveAt).toBe(now + 60 * MIN);
    for (const w of p.wings) expect(w.departAt).toBe(now);
  });
  it('le retour reste à leur pas (pas ralenti)', () => {
    for (const w of p.wings) expect(w.returnAt).toBe(p.midAt + w.legMin * MIN);
    expect(p.wings[1]!.legMin).toBe(20);
  });
  it('même arrivée et même retour que « chacun à son heure » : seul le départ change', () => {
    const q = planWings(inputs, now, 5 * MIN);
    expect(q.arriveAt).toBe(p.arriveAt);
    expect(q.wings.map((w) => w.returnAt)).toEqual(p.wings.map((w) => w.returnAt));
    expect(q.wings[1]!.departAt).toBe(now + 40 * MIN);
  });
  it('à mi-chemin du temps, le groupe proche est à mi-chemin de sa route', () => {
    const map = mapWith();
    const a: CombinedAttack = {
      id: 'atk',
      poi: target,
      seed: 2,
      createdAt: now,
      arriveAt: p.arriveAt,
      midAt: p.midAt,
      playerLevel: 30,
      supplies: [],
      wings: p.wings,
    };
    const v = attackWingVoyages([a], map).find((x) => x.key === 'atk:1')!;
    const pos = travelPosition(v.voyage, now + 30 * MIN);
    expect(pos.phase).toBe('outbound');
    expect(pos.frac).toBeCloseTo(0.5, 5);
  });
});
