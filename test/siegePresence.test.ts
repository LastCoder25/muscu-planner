import { describe, expect, it } from 'vitest';
import { advsHomeAt, heroHomeAt, outingsOf, type Outing } from '@/lib/siegePresence';
import type { Adventurer } from '@/lib/adventurers';
import type { ActiveExpedition } from '@/lib/expedition';

const H = 3_600_000;
const T = 100 * H; // l'heure de l'attaque

function adv(id: string, extra: Partial<Adventurer> = {}): Adventurer {
  return { id, name: id, seed: 1, path: ['guerrier'], level: 5, xp: 0, ...extra } as Adventurer;
}
const out = (sentAt: number, returnAt: number, escort: string[], hero = false): Outing => ({
  sentAt,
  returnAt,
  escort,
  hero,
});

describe('🏰 qui était là à l’heure de l’attaque', () => {
  it('LE CAS RÉEL (2026-09-27) : rentrés avant, renvoyés après — ils défendaient', () => {
    // Héros rentré 1 h avant l'attaque, groupes rentrés 2 h et 3 h avant ; le joueur ouvre
    // l'app 2 h APRÈS l'attaque et renvoie tout le monde avant que le siège ne soit tranché.
    const advs = ['a', 'b', 'c'].map((id) => adv(id, { busyUntil: T + 6 * H }));
    const outings = [
      out(T + 2 * H, T + 4 * H, [], true),
      out(T + 2 * H, T + 6 * H, ['a', 'b', 'c']),
    ];
    expect(heroHomeAt(outings, T)).toBe(true);
    expect(advsHomeAt(advs, outings, T).map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('un voyage EN COURS à l’attaque tient dehors, même réglé depuis', () => {
    const advs = [adv('a', { busyUntil: T + H }), adv('b')];
    const outings = [out(T - 2 * H, T + H, ['a'], true)];
    expect(heroHomeAt(outings, T)).toBe(false);
    expect(advsHomeAt(advs, outings, T).map((a) => a.id)).toEqual(['b']);
  });

  it('rentré pile à l’heure de l’attaque : il défend', () => {
    expect(heroHomeAt([out(T - H, T, [], true)], T)).toBe(true);
    expect(advsHomeAt([adv('a', { busyUntil: T })], [out(T - H, T, ['a'])], T)).toHaveLength(1);
  });

  it('parti après l’attaque, mais à l’infirmerie à l’heure de l’attaque : il ne défend pas', () => {
    const a = adv('a', { busyUntil: T + 5 * H, hurtUntil: T + H });
    expect(advsHomeAt([a], [out(T + 2 * H, T + 5 * H, ['a'])], T)).toHaveLength(0);
  });

  it('sans aucun voyage, la disponibilité se lit à l’heure de l’attaque', () => {
    const advs = [adv('a', { busyUntil: T - H }), adv('b', { hurtUntil: T + H })];
    expect(advsHomeAt(advs, [], T).map((a) => a.id)).toEqual(['a']);
    expect(heroHomeAt([], T)).toBe(true);
  });
});

describe('outingsOf : tous les voyages, une seule forme', () => {
  const exp = (sentAt: number, returnAt: number, escort?: string[]) =>
    ({
      sentAt,
      returnAt,
      outcome: escort ? { party: { escort } } : {},
    }) as unknown as ActiveExpedition;

  it('l’expédition porte le héros (et son escorte), les groupes et convois non', () => {
    const o = outingsOf({
      expedition: exp(1, 2, ['x']),
      parties: [exp(3, 4, ['y'])],
      caravans: [{ sentAt: 5, returnAt: 6, escort: ['z'] }],
    });
    expect(o).toEqual([
      { sentAt: 1, returnAt: 2, escort: ['x'], hero: true },
      { sentAt: 3, returnAt: 4, escort: ['y'], hero: false },
      { sentAt: 5, returnAt: 6, escort: ['z'], hero: false },
    ]);
  });

  it('une expédition solo n’a pas d’escorte', () => {
    expect(outingsOf({ expedition: exp(1, 2), parties: [], caravans: [] })[0]!.escort).toEqual([]);
  });
});
