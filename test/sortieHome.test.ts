// 🏥 Les blessés d'une sortie (point fixe, attaque combinée comprise) rentrent à la BASE, et
// une sortie dont le point est perdu aussi (2026-09-29, décision de l'utilisateur).
import { describe, expect, it } from 'vitest';
import {
  baseWalkers,
  voyageMemberIds,
  walkToBase,
  withoutWalkers,
  type ActiveParty,
} from '@/lib/party';
import { EXPE, travelPosition, type ExpeditionOutcome, type Poi } from '@/lib/expedition';

const site: Poi = {
  id: 'camp1',
  type: 'camp',
  level: 20,
  x: 40,
  y: 20,
  distNorm: 0.6,
  spawnedAt: 0,
  expiresAt: 9e15,
};
const outcome = (hurt: string[], light: string[] = []): ExpeditionOutcome =>
  ({
    win: false,
    gold: 500,
    energy: 3,
    summonStones: 2,
    mana: 0,
    item: null,
    items: [],
    key: 1,
    reconBonus: 0,
    returnMult: 1,
    text: '',
    party: {
      hero: false,
      faction: 'bandits',
      escort: ['a', 'b', 'c'],
      win: false,
      foes: 3,
      slain: 1,
      kills: {},
      heroKills: 0,
      xp: {},
      hurt,
      lightHurt: light,
      journal: [],
    },
  }) as unknown as ExpeditionOutcome;
const sortie = (o: ExpeditionOutcome): ActiveParty => ({
  id: 'g1',
  poi: site,
  sentAt: 0,
  midAt: 60 * 60_000,
  returnAt: 120 * 60_000,
  goldCost: 0,
  seed: 1,
  reported: true,
  outcome: o,
  origin: { x: 150, y: 60 },
  homeId: 'ctl_mine',
});

describe('🏥 qui rentre à la base (`baseWalkers`)', () => {
  it('les blessés, graves ou légers — les valides reprennent leur poste', () => {
    const p = sortie(outcome(['a'], ['b']));
    expect(baseWalkers(p, ['a', 'b', 'c'], true)).toEqual(['a', 'b']);
  });
  it('tout le monde si le point est perdu', () => {
    const p = sortie(outcome([]));
    expect(baseWalkers(p, ['a', 'b', 'c'], false)).toEqual(['a', 'b', 'c']);
  });
  it('seulement les membres de CE voyage (une attaque combinée liste tous les groupes)', () => {
    const p = sortie(outcome(['a', 'c']));
    expect(baseWalkers(p, ['a', 'b'], true)).toEqual(['a']);
  });
  it('un voyage parti de la base rentre déjà à la base : rien à faire', () => {
    const p = { ...sortie(outcome(['a'])), homeId: undefined };
    expect(baseWalkers(p, ['a', 'b'], true)).toEqual([]);
  });
});

describe('🏥 le trajet direct vers la base (`walkToBase`)', () => {
  const p = sortie(outcome(['a']));
  it('part du lieu de mission et va à la ville, sans rapport ni butin', () => {
    const w = walkToBase(p, ['a'], p.midAt, 40 * 60_000);
    expect(w.sentAt).toBe(p.midAt);
    expect(w.midAt).toBe(p.midAt);
    expect(w.returnAt).toBe(p.midAt + 40 * 60_000);
    expect(w.origin).toBeUndefined();
    expect(w.wingOf).toBe(p.id);
    expect(w.reported).toBe(true);
    expect(w.outcome.party?.escort).toEqual(['a']);
    expect(w.outcome.gold + w.outcome.energy + w.outcome.summonStones + w.outcome.key).toBe(0);
    // Départ au lieu, arrivée en ville — jamais par le point fixe.
    expect(travelPosition(w, w.midAt)).toMatchObject({ x: site.x, y: site.y });
    expect(travelPosition(w, w.returnAt)).toMatchObject({ x: EXPE.town.x, y: EXPE.town.y });
  });
  it('en route (point tombé pendant le retour) : part de là où ils sont, au prorata', () => {
    const at = p.midAt + 30 * 60_000;
    const pos = travelPosition(p, at);
    const w = walkToBase(p, ['a', 'b', 'c'], at, 40 * 60_000);
    expect(w.poi.x).toBeCloseTo(pos.x, 9);
    expect(w.poi.y).toBeCloseTo(pos.y, 9);
    const share =
      Math.hypot(pos.x - EXPE.town.x, pos.y - EXPE.town.y) /
      Math.hypot(site.x - EXPE.town.x, site.y - EXPE.town.y);
    expect(w.returnAt - at).toBe(Math.max(60_000, Math.round(40 * 60_000 * share)));
  });
});

describe('🏥 le voyage d’origine sans eux (`withoutWalkers`)', () => {
  const p = sortie(outcome(['a']));
  it('garde ceux qui reprennent leur poste, et ne sera plus réparti', () => {
    const r = withoutWalkers(p, ['a'], 2)!;
    expect(r.outcome.party?.escort).toEqual(['b', 'c']);
    expect(r.baseSplit).toBe(true);
    expect(r.returnAt).toBe(p.returnAt);
  });
  it('disparaît s’il ne reste personne', () => {
    expect(withoutWalkers(p, ['a', 'b', 'c'], 0)).toBeNull();
  });
});

describe('🏰 deux groupes qui rentrent à la même seconde (signalé : « mes champions de l’ossuaire sont où ? »)', () => {
  // Attaque combinée : le rapport est PARTAGÉ (escorte a, b, c), chaque groupe a son équipe.
  const back = 120 * 60_000;
  const roster = ['a', 'b', 'c'].map((id) => ({ id, busyUntil: back }));
  const scripto = { ...sortie(outcome([])), homeId: 'ctl_scriptorium', crew: ['a'] };
  const ossu = { ...sortie(outcome([])), id: 'g2', homeId: 'ctl_ossuary', crew: ['b', 'c'] };
  it('chaque groupe ne ramène que SON équipe, jamais celle de l’autre', () => {
    expect(voyageMemberIds(scripto, roster)).toEqual(['a']);
    expect(voyageMemberIds(ossu, roster)).toEqual(['b', 'c']);
  });
  it('un voyage sans groupe propre garde l’escorte du rapport', () => {
    expect(voyageMemberIds(sortie(outcome([])), roster)).toEqual(['a', 'b', 'c']);
  });
  it('ni un posté, ni un champion reparti par un autre chemin', () => {
    const r = [
      { id: 'b', busyUntil: back, posted: 'ctl_ossuary' },
      { id: 'c', busyUntil: back + 1 },
    ];
    expect(voyageMemberIds(ossu, r)).toEqual([]);
  });
  it('un champion qui quitte le groupe à pied quitte aussi son équipe', () => {
    expect(withoutWalkers(ossu, ['b'], 1)?.crew).toEqual(['c']);
  });
});
