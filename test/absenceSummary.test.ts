import { describe, expect, it } from 'vitest';
import {
  ABSENCE_MIN_MS,
  absenceChips,
  absenceDuration,
  absenceSummary,
  isAbsence,
  relaunchChips,
} from '@/lib/absenceSummary';
import type { ExpeditionMessage, PartyResult } from '@/lib/expedition';

const T0 = 1_000_000_000;
const H = 3_600_000;

function msg(
  over: Partial<ExpeditionMessage> & { party?: Partial<PartyResult> },
): ExpeditionMessage {
  const { party, ...rest } = over;
  return {
    id: 'm' + Math.random(),
    poiType: 'mine',
    level: 5,
    win: true,
    text: '',
    gold: 0,
    energy: 0,
    key: 0,
    resolvedAt: T0 + H,
    read: false,
    ...rest,
    ...(party
      ? {
          party: {
            hero: false,
            faction: 'bandits',
            escort: [],
            win: true,
            foes: 0,
            slain: 0,
            kills: {},
            heroKills: 0,
            xp: {},
            hurt: [],
            journal: [],
            ...party,
          } as PartyResult,
        }
      : {}),
  } as ExpeditionMessage;
}

describe('absenceSummary — la tuile « pendant ton absence »', () => {
  it('additionne or, XP, consommables et blessés des rapports de la fenêtre', () => {
    const s = absenceSummary(
      [
        msg({ gold: 100, supplies: { rations: 2 }, party: { xp: { a: 40, b: 60 }, hurt: ['a'] } }),
        msg({ gold: 50, supplies: { potion: 1 }, party: { xp: { a: 10 }, heroHurt: true } }),
      ],
      T0,
      T0 + 5 * H,
    )!;
    expect(s.reports).toBe(2);
    expect(s.gold).toBe(150);
    expect(s.xp).toBe(110);
    expect(s.supplies).toBe(3);
    expect(s.hurt).toBe(2);
  });

  it('ne compte que (depuis, maintenant] : ni le passé, ni le futur, ni les coffres', () => {
    const s = absenceSummary(
      [
        msg({ gold: 1, resolvedAt: T0 }), // exactement à la dernière visite : déjà vu
        msg({ gold: 2, resolvedAt: T0 - H }),
        msg({ gold: 4, resolvedAt: T0 + 6 * H }), // pas encore tombé
        msg({ gold: 8, chest: true, resolvedAt: T0 + H }), // sport, pas carte
        msg({ gold: 16, resolvedAt: T0 + 2 * H }),
      ],
      T0,
      T0 + 5 * H,
    )!;
    expect(s.reports).toBe(1);
    expect(s.gold).toBe(16);
  });

  it('rend null quand rien n’est rentré', () => {
    expect(absenceSummary([], T0, T0 + H)).toBeNull();
    expect(absenceSummary([msg({ resolvedAt: T0 - 1 })], T0, T0 + H)).toBeNull();
  });

  it('distingue lieux pris, lieux perdus et défenses tenues', () => {
    const s = absenceSummary(
      [
        msg({ poiType: 'control', party: { controlId: 'c1', win: true } }), // pris
        msg({ poiType: 'control', party: { controlId: 'c2', win: false } }), // assaut raté : ni pris ni perdu
        msg({ poiType: 'control', party: { controlId: 'c3', defense: true, win: false } }), // perdu
        msg({ poiType: 'control', party: { controlId: 'c4', defense: true, win: true } }), // tenu
      ],
      T0,
      T0 + 5 * H,
    )!;
    expect(s.taken).toBe(1);
    expect(s.lost).toBe(1);
  });

  it('compte les failles refermées (victoire d’incursion) et débordées', () => {
    const s = absenceSummary(
      [
        msg({ poiType: 'rift', party: { win: true, rift: { level: 5, maxPv: 1, pvTrail: [] } } }),
        msg({ poiType: 'rift', party: { win: false, rift: { level: 5, maxPv: 1, pvTrail: [] } } }),
        msg({ poiType: 'rift', overflow: {} as ExpeditionMessage['overflow'] }),
      ],
      T0,
      T0 + 5 * H,
    )!;
    expect(s.riftsClosed).toBe(1);
    expect(s.riftsOverflowed).toBe(1);
  });
});

describe('isAbsence', () => {
  it('exige une première visite connue et un écart d’au moins 30 min', () => {
    expect(isAbsence(0, T0)).toBe(false);
    expect(isAbsence(T0, T0 + ABSENCE_MIN_MS - 1)).toBe(false);
    expect(isAbsence(T0, T0 + ABSENCE_MIN_MS)).toBe(true);
  });
});

describe('pastilles', () => {
  it('n’affiche jamais un zéro et accorde les libellés', () => {
    const chips = absenceChips({
      reports: 3,
      gold: 120,
      xp: 0,
      supplies: 1,
      taken: 2,
      lost: 0,
      hurt: 1,
      riftsClosed: 0,
      riftsOverflowed: 0,
    });
    expect(chips.map((c) => c.key)).toEqual(['gold', 'supplies', 'taken', 'hurt']);
    expect(chips.find((c) => c.key === 'taken')!.label).toBe('lieux pris');
    expect(chips.find((c) => c.key === 'supplies')!.label).toBe('consommable');
  });

  it('« à relancer » : héros, champions et lieux, rien pour ce qui est à zéro', () => {
    expect(relaunchChips({ champions: 0, heroFree: false, places: 0 })).toEqual([]);
    const r = relaunchChips({ champions: 1, heroFree: true, places: 4 });
    expect(r.map((c) => c.key)).toEqual(['hero', 'champions', 'places']);
    expect(r[1]!.label).toBe('1 champion libre');
    expect(r[2]!.label).toBe('4 lieux disponibles');
  });

  it('durée lisible', () => {
    expect(absenceDuration(45 * 60_000)).toBe('45 min');
    expect(absenceDuration(3 * H + 12 * 60_000)).toBe('3 h 12');
    expect(absenceDuration(52 * H)).toBe('2 j 4 h');
  });
});
