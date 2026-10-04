import { describe, it, expect } from 'vitest';
import { LIGHT_HURT, closeWinDown, deriveSkirmish } from '@/lib/skirmish';
import {
  convoyLightHurt,
  convoyHurt,
  caravanHurtMs,
  refChampionAdv,
  refAdvGear,
  resolveCaravan,
} from '@/lib/caravan';
import { campLightHurt, campHurt, resolveCamp } from '@/lib/camp';
import { partyClaimRoster, partyReport } from '@/lib/party';
import type { PartyResult, Poi } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';
import type { CombatEvent } from '@/lib/combat';

/** 🩹 Victoire serrée = blessure légère (demandé par l'utilisateur, les deux options). */

const d = (win: boolean, endShare: number, down = ['a', 'b']) => ({ win, endShare, down });

describe('🩹 victoire serrée', () => {
  it('une victoire NETTE ne blesse personne', () => {
    expect(closeWinDown(d(true, LIGHT_HURT.closeShare))).toEqual([]);
    expect(closeWinDown(d(true, 0.9))).toEqual([]);
  });
  it('une victoire SERRÉE blesse légèrement ceux qui sont tombés', () => {
    expect(closeWinDown(d(true, LIGHT_HURT.closeShare - 0.01))).toEqual(['a', 'b']);
  });
  it('une défaite ne produit AUCUNE blessure légère (elle a sa blessure grave)', () => {
    expect(closeWinDown(d(false, 0))).toEqual([]);
  });
  it('convoi : un seul blessé léger, le premier tombé — la même politique que la défaite', () => {
    expect(convoyLightHurt(d(true, 0.1))).toEqual(['a']);
    expect(convoyHurt(d(true, 0.1))).toEqual([]);
  });
  it('camp : tous les tombés de l’escorte, jamais le héros', () => {
    const esc = [{ id: 'a' }, { id: 'b' }];
    expect(campLightHurt(d(true, 0.1, ['a', 'hero', 'b']), esc)).toEqual(['a', 'b']);
    expect(campHurt(d(true, 0.1, ['a', 'b']), esc)).toEqual([]);
  });
  it('la part de PV restante est lue sur la fin du journal', () => {
    const log = [
      { playerPv: 80, monsterPv: 50 },
      { playerPv: 20, monsterPv: 0 },
    ] as CombatEvent[];
    const unit = (id: string) => ({
      id,
      combatant: { name: id, pv: 50, damage: 10, crit: 0, dodge: 0, initiative: 1 },
    });
    const r = deriveSkirmish(
      { log, win: true, allyPv: 100, foePv: 50 },
      [unit('a'), unit('b')],
      [unit('f')],
      3,
    );
    expect(r.endShare).toBeCloseTo(0.2);
  });
  it('la blessure légère est une fraction de la convalescence normale', () => {
    expect(LIGHT_HURT.msShare).toBeGreaterThan(0);
    expect(LIGHT_HURT.msShare).toBeLessThan(1);
  });
});

describe('🩹 encaissement', () => {
  const adv = (id: string, i: number): Adventurer => ({ ...refChampionAdv(10, i), id });
  const party = (over: Partial<PartyResult>): PartyResult => ({
    hero: false,
    faction: 'bandits',
    escort: ['a', 'b', 'c'],
    win: true,
    foes: 3,
    slain: 3,
    kills: {},
    heroKills: 0,
    xp: { a: 1, b: 1, c: 1 },
    hurt: [],
    journal: [],
    ...over,
  });
  const ctx = {
    pantheonLevel: 50,
    infirmaryLevel: 0,
    backAt: 1000,
    now: 1000,
    xpGranted: true,
    healMult: 1,
  };
  const roster = [adv('a', 0), adv('b', 1), adv('c', 2)];

  it('un blessé léger part à l’infirmerie pour la courte durée, les autres restent debout', () => {
    const { adventurers, escort } = partyClaimRoster(party({ lightHurt: ['b'] }), roster, ctx);
    const full = caravanHurtMs(escort, 0);
    const by = Object.fromEntries(adventurers.map((a) => [a.id, a.hurtUntil]));
    expect(by.b).toBe(1000 + full * LIGHT_HURT.msShare);
    expect(by.a).toBeUndefined();
    expect(by.c).toBeUndefined();
  });
  it('un blessé grave garde la durée pleine même s’il est aussi marqué léger', () => {
    const { adventurers, escort } = partyClaimRoster(
      party({ win: false, hurt: ['a'], lightHurt: ['a'] }),
      roster,
      ctx,
    );
    expect(adventurers.find((a) => a.id === 'a')!.hurtUntil).toBe(1000 + caravanHurtMs(escort, 0));
  });
  it('le rapport distingue blessé et blessé léger', () => {
    const r = partyReport(party({ hurt: ['a'], lightHurt: ['a', 'b'] }), roster);
    const m = Object.fromEntries(r.members.map((x) => [x.id, x]));
    expect(m.a!.hurt && !m.a!.lightHurt).toBe(true);
    expect(!m.b!.hurt && m.b!.lightHurt).toBe(true);
    expect(!m.c!.hurt && !m.c!.lightHurt).toBe(true);
  });
});

describe('🩹 câblage : les missions produisent bien des blessés légers', () => {
  const poi = (L: number, over: Partial<Poi> = {}): Poi => ({
    id: 'p',
    type: 'well',
    level: L,
    x: 50,
    y: 50,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 9e15,
    ...over,
  });
  const team = (n: number, L: number): Adventurer[] =>
    Array.from({ length: n }, (_, i) => ({
      ...refChampionAdv(L, i),
      id: `a${i}`,
      gear: {
        weapon: `refGear${i}weapon`,
        armor: `refGear${i}armor`,
        accessory: `refGear${i}accessory`,
        relic: `refGear${i}relic`,
      },
    }));

  it('convoi : un blessé léger n’apparaît qu’après une embuscade GAGNÉE, et jamais en grave', () => {
    const esc = team(3, 26);
    let light = 0;
    for (let s = 1; s <= 300; s++) {
      const o = resolveCaravan(poi(26), esc, s * 131 + 5, { advGear: refAdvGear(26, 3) }, 26, 26);
      for (const id of o.lightHurt ?? []) {
        light++;
        expect(o.hurt).not.toContain(id);
        const won = o.events.filter((e) => e.kind === 'bandits' && e.won);
        expect(won.some((e) => e.down![0] === id)).toBe(true);
      }
    }
    expect(light, 'aucun blessé léger : le câblage ne prouve rien').toBeGreaterThan(0);
  });

  it('camp : des blessés légers sur des victoires, jamais sur une défaite', () => {
    const esc = team(2, 12);
    let light = 0;
    for (let s = 1; s <= 200; s++) {
      const o = resolveCamp({
        poi: poi(12, { type: 'camp' }),
        spec: { faction: 'bandits', size: 2 },
        escort: esc,
        road: { advGear: refAdvGear(12, 2) },
        hero: null,
        seed: s * 97 + 3,
        playerLevel: 12,
        pantheonLevel: 12,
      });
      const p = o.party!;
      if (p.lightHurt?.length) {
        light++;
        expect(p.win).toBe(true);
      }
    }
    expect(light, 'aucun blessé léger : le câblage ne prouve rien').toBeGreaterThan(0);
  });
});
