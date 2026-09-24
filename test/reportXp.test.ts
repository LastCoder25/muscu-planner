// 🎓 L'XP DES CHAMPIONS TOMBE À L'ARRIVÉE DU RAPPORT, plus à l'encaissement (demandé par
// l'utilisateur : voir l'animation quand le rapport arrive, sur TOUS les events, pas
// seulement ceux qui portent une récompense).
import { describe, it, expect } from 'vitest';
import { grantReportXp, partyClaimRoster } from '@/lib/party';
import { refChampionAdv } from '@/lib/caravan';
import { grantAdvXp, type Adventurer } from '@/lib/adventurers';
import type { ExpeditionMessage, PartyResult } from '@/lib/expedition';
import { useAdvXpFx } from '@/composables/useAdvXpFx';

const adv = (id: string): Adventurer => ({ ...refChampionAdv(20, 0), id });
const roster = [adv('a'), adv('b'), adv('c')];

const party = (xp: Record<string, number>): PartyResult =>
  ({
    hero: false,
    faction: 'bandits',
    escort: Object.keys(xp),
    win: true,
    foes: 2,
    slain: 2,
    kills: {},
    heroKills: 0,
    xp,
    hurt: [],
    wages: 0,
    journal: [],
  }) as unknown as PartyResult;

const msg = (id: string, p?: PartyResult, over: Partial<ExpeditionMessage> = {}): ExpeditionMessage =>
  ({
    id,
    level: 20,
    win: true,
    text: '',
    gold: 0,
    energy: 0,
    key: 0,
    resolvedAt: 0,
    claimAt: 0,
    claimed: false,
    read: false,
    ...(p ? { party: p } : {}),
    ...over,
  }) as ExpeditionMessage;

describe('🎓 grantReportXp — XP versée à l’arrivée du rapport', () => {
  it('verse l’XP de chaque membre et marque le rapport', () => {
    const m = msg('m1', party({ a: 50, b: 80 }));
    const r = grantReportXp([m], [m], roster, 30);
    expect(r.adventurers[0]).toEqual(grantAdvXp(roster[0]!, 50, 30));
    expect(r.adventurers[1]).toEqual(grantAdvXp(roster[1]!, 80, 30));
    expect(r.adventurers[2]).toBe(roster[2]);
    expect(r.messages[0]!.xpGranted).toBe(true);
    expect(r.granted.map((x) => x.id)).toEqual(['m1']);
  });

  it('deux rapports frais : les XP s’additionnent', () => {
    const m1 = msg('m1', party({ a: 40 }));
    const m2 = msg('m2', party({ a: 30 }));
    const r = grantReportXp([m2, m1], [m1, m2], roster, 30);
    expect(r.adventurers[0]).toEqual(grantAdvXp(grantAdvXp(roster[0]!, 40, 30), 30, 30));
    expect(r.messages.every((x) => x.xpGranted)).toBe(true);
  });

  it('⚠️ jamais deux fois : un rapport déjà marqué ne verse rien', () => {
    const m = msg('m1', party({ a: 50 }), { xpGranted: true });
    const box = [m];
    const r = grantReportXp(box, [m], roster, 30);
    expect(r.adventurers).toBe(roster);
    expect(r.messages).toBe(box);
    expect(r.granted).toEqual([]);
  });

  it('un rapport sans groupe (héros seul, coffre) ne verse rien et ne réécrit rien', () => {
    const m = msg('m1');
    const box = [m];
    const r = grantReportXp(box, [m], roster, 30);
    expect(r.messages).toBe(box);
    expect(r.adventurers).toBe(roster);
  });

  it('⚠️ un rapport écarté par la boîte (absent) ne verse rien', () => {
    const m = msg('m1', party({ a: 50 }));
    const r = grantReportXp([], [m], roster, 30);
    expect(r.adventurers).toBe(roster);
    expect(r.granted).toEqual([]);
  });
});

describe('🎁 partyClaimRoster — l’encaissement ne reverse pas l’XP déjà versée', () => {
  const ctx = { pantheonLevel: 30, infirmaryLevel: 0, backAt: 0, now: 0 };
  it('xpGranted : aucun champion ne bouge', () => {
    const r = partyClaimRoster(party({ a: 50 }), roster, { ...ctx, xpGranted: true });
    expect(r.adventurers[0]).toBe(roster[0]);
  });
  it('rapport d’avant (sans marque) : l’XP est versée à l’encaissement, comme avant', () => {
    const r = partyClaimRoster(party({ a: 50 }), roster, { ...ctx, xpGranted: false });
    expect(r.adventurers[0]).toEqual(grantAdvXp(roster[0]!, 50, 30));
  });
});

describe('⏸️ useAdvXpFx — retenue pendant un rejeu', () => {
  const track = { id: 'a', xp: 10 } as never;
  it('retenu : rien ne s’ouvre ; relâché : l’overlay part', () => {
    const fx = useAdvXpFx();
    fx.hold('t1', true);
    fx.show([track], 'X');
    expect(fx.current.value).toBeNull();
    fx.hold('t1', false);
    expect(fx.current.value?.title).toBe('X');
    fx.dismiss();
    expect(fx.current.value).toBeNull();
  });
  it('un overlay déjà ouvert repasse en file quand un rejeu s’ouvre', () => {
    const fx = useAdvXpFx();
    fx.show([track], 'Y');
    expect(fx.current.value?.title).toBe('Y');
    fx.hold('t2', true);
    expect(fx.current.value).toBeNull();
    fx.hold('t2', false);
    expect(fx.current.value?.title).toBe('Y');
    fx.dismiss();
  });
  it('deux retenues : la première relâchée ne libère pas l’autre', () => {
    const fx = useAdvXpFx();
    fx.hold('s', true);
    fx.hold('r', true);
    fx.show([track], 'Z');
    fx.hold('s', false);
    expect(fx.current.value).toBeNull();
    fx.hold('r', false);
    expect(fx.current.value?.title).toBe('Z');
    fx.dismiss();
  });
});
