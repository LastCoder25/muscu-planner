// 🛡️ La défense d'un lieu fixe compte les champions de la garnison partis en sortie qui
// rentrent AVANT l'attaque (2026-10-15, demandé : « s'ils reviennent entre-temps, il faut les
// prendre en compte dans la défense »). La règle est celle de la bataille : au retour,
// `rejoinHome` les remet comme renfort arrivé à `returnAt`, et la reprise compte tout renfort
// arrivé au plus tard à l'attaque.
import { describe, expect, it } from 'vitest';
import {
  captureControl,
  controlIdOf,
  defendersAtAttack,
  ensureControls,
  seatsOf,
  sortieLeaves,
} from '@/lib/controlPoints';
import { rejoinHome, sortieReturnsTo } from '@/lib/controlRoutes';
import { createMap, type ExpeditionMap, type ExpeditionOutcome } from '@/lib/expedition';

const H = 3600_000;
const L = 30;
const MINE = controlIdOf('mine');
const ATTACK = 10 * H;
const pt = (m: ExpeditionMap) => m.pois.find((p) => p.id === MINE)!;
const world = (ids: string[]) => {
  let m = ensureControls(createMap(3, 0, L, 1), 0, L);
  m = captureControl(m, MINE, ids, 0, 7);
  return {
    ...m,
    pois: m.pois.map((p) =>
      p.control ? { ...p, control: { ...p.control, attackAt: ATTACK } } : p,
    ),
  };
};
const trip = (homeId: string, returnAt: number, escort: string[]) => ({
  homeId,
  returnAt,
  outcome: { party: { escort } } as unknown as ExpeditionOutcome,
});
const adv = (id: string, busyUntil: number, posted?: string) => ({ id, busyUntil, posted });
const ids = (l: { id: string }[]) => l.map((r) => r.id).sort();

describe('🛡️ sortieReturnsTo : les sortants qui reviendront défendre', () => {
  const m = sortieLeaves(world(['a', 'b', 'c']), MINE, ['a', 'b'], H, L);

  it('rentré avant l’attaque, il défend ; rentré après, il arrive trop tard', () => {
    const back = sortieReturnsTo(
      pt(m),
      [trip(MINE, 5 * H, ['a']), trip(MINE, 15 * H, ['b'])],
      [adv('a', 5 * H), adv('b', 15 * H)],
    );
    const d = defendersAtAttack(pt(m).control!, ATTACK, back);
    expect(d.present.sort()).toEqual(['a', 'c']);
    expect(d.late).toEqual(['b']);
  });

  it('sans eux, la garnison restée seule défend (témoin du défaut corrigé)', () => {
    expect(defendersAtAttack(pt(m).control!, ATTACK).present).toEqual(['c']);
  });

  it('un blessé renvoyé à la base (retour différent du voyage) ne revient pas défendre', () => {
    const back = sortieReturnsTo(
      pt(m),
      [trip(MINE, 5 * H, ['a', 'b'])],
      [adv('a', 5 * H), adv('b', 7 * H)],
    );
    expect(ids(back)).toEqual(['a']);
  });

  it('un champion resté posté ailleurs (point pris) ne revient pas', () => {
    const back = sortieReturnsTo(
      pt(m),
      [trip(MINE, 5 * H, ['a', 'b'])],
      [adv('a', 5 * H), adv('b', 5 * H, 'ailleurs')],
    );
    expect(ids(back)).toEqual(['a']);
  });

  it('une sortie partie d’un AUTRE point ne défend pas celui-ci', () => {
    const back = sortieReturnsTo(pt(m), [trip('autre', 5 * H, ['a'])], [adv('a', 5 * H)]);
    expect(back).toEqual([]);
  });

  it('un point qui n’est pas à nous n’attend personne', () => {
    const p = pt(m);
    const ennemi = { ...p, control: { ...p.control!, owner: 'enemy' as const } };
    expect(sortieReturnsTo(ennemi, [trip(MINE, 5 * H, ['a'])], [adv('a', 5 * H)])).toEqual([]);
  });
});

describe('🛡️ sortieReturnsTo suit EXACTEMENT rejoinHome', () => {
  it('sans place gardée, seules les places libres sont reprises (point plein = personne)', () => {
    const full = Array.from({ length: seatsOf('mine') }, (_, i) => `g${i}`);
    const m = world(full);
    const voy = [trip(MINE, 5 * H, ['x'])];
    const back = sortieReturnsTo(pt(m), voy, [adv('x', 5 * H)]);
    expect(back).toEqual([]);
    expect(rejoinHome(m, MINE, ['x'], 5 * H).back).toEqual([]);
  });

  it('avec sa place GARDÉE, il revient défendre même si le point est plein', () => {
    const full = Array.from({ length: seatsOf('mine') }, (_, i) => `g${i}`);
    const m = sortieLeaves(world(full), MINE, ['g0'], H, L);
    const back = sortieReturnsTo(pt(m), [trip(MINE, 5 * H, ['g0'])], [adv('g0', 5 * H)]);
    expect(ids(back)).toEqual(['g0']);
    expect(rejoinHome(m, MINE, ['g0'], 5 * H).back).toEqual(['g0']);
  });

  it('les mêmes champions que ceux que la bataille remet sur le point', () => {
    const m = sortieLeaves(world(['a', 'b']), MINE, ['a'], H, L);
    const voy = [trip(MINE, 5 * H, ['a', 'z'])];
    const back = sortieReturnsTo(pt(m), voy, [adv('a', 5 * H), adv('z', 5 * H)]);
    const r = rejoinHome(m, MINE, ['a', 'z'], 5 * H);
    expect(ids(back)).toEqual([...r.back].sort());
    expect(back.every((x) => x.at === 5 * H)).toBe(true);
  });
});

describe('🛡️ câblage : la carte passe les sortants à la défense', () => {
  it('defenseArgs lit sortieReturnsTo avant defendersAtAttack', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/pages/ExpeditionMapPage.vue', 'utf8');
    const body = src.slice(
      src.indexOf('function defenseArgs('),
      src.indexOf('function defenseOf('),
    );
    expect(body).toContain('sortieReturnsTo(p,');
    expect(body).toMatch(/defendersAtAttack\(c, at, \[\.\.\.back, \.\.\.extra\]\)/);
  });
});
