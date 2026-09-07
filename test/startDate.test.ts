import { describe, it, expect } from 'vitest';
import {
  addDaysUtcIso,
  daysBetweenUtcIso,
  nextMondayIso,
  isStartAllowed,
  startOptions,
  startLabel,
  START_MAX_AHEAD_DAYS,
} from '@/lib/startDate';

describe('arithmétique de dates (UTC explicite)', () => {
  it('décale sans jamais dériver d’un jour', () => {
    expect(addDaysUtcIso('2026-09-10', 1)).toBe('2026-09-11');
    expect(addDaysUtcIso('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysUtcIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysUtcIso('2028-02-28', 1)).toBe('2028-02-29'); // bissextile
    expect(addDaysUtcIso('2026-09-10', 0)).toBe('2026-09-10');
  });

  it('un aller-retour de N jours retombe sur la même date, sur une année entière', () => {
    let d = '2026-01-01';
    for (let i = 0; i < 365; i++) {
      const next = addDaysUtcIso(d, 1);
      expect(daysBetweenUtcIso(d, next)).toBe(1);
      expect(addDaysUtcIso(next, -1)).toBe(d);
      d = next;
    }
  });
});

describe('nextMondayIso', () => {
  it('donne toujours un LUNDI, strictement après aujourd’hui', () => {
    // 2026-09-10 est un jeudi ; on balaie une semaine complète.
    for (let i = 0; i < 14; i++) {
      const today = addDaysUtcIso('2026-09-06', i); // part d'un dimanche
      const m = nextMondayIso(today);
      expect(new Date(`${m}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(daysBetweenUtcIso(today, m)).toBeGreaterThan(0);
      expect(daysBetweenUtcIso(today, m)).toBeLessThanOrEqual(7);
    }
  });
  it('un lundi renvoie le lundi SUIVANT, pas aujourd’hui', () => {
    expect(nextMondayIso('2026-09-07')).toBe('2026-09-14'); // 07/09/2026 = lundi
  });
});

describe('isStartAllowed', () => {
  const TODAY = '2026-09-10';
  it('refuse le passé : un défi antidaté serait perdu d’avance', () => {
    expect(isStartAllowed('2026-09-09', TODAY)).toBe(false);
    expect(isStartAllowed('2026-08-01', TODAY)).toBe(false);
  });
  it('accepte aujourd’hui et la fenêtre à venir, borne comprise', () => {
    expect(isStartAllowed(TODAY, TODAY)).toBe(true);
    expect(isStartAllowed(addDaysUtcIso(TODAY, START_MAX_AHEAD_DAYS), TODAY)).toBe(true);
    expect(isStartAllowed(addDaysUtcIso(TODAY, START_MAX_AHEAD_DAYS + 1), TODAY)).toBe(false);
  });
  it('refuse ce qui n’est pas une date', () => {
    expect(isStartAllowed('', TODAY)).toBe(false);
    expect(isStartAllowed('demain', TODAY)).toBe(false);
    expect(isStartAllowed('2026-9-1', TODAY)).toBe(false);
  });
});

describe('startOptions', () => {
  it('propose trois repères en semaine, tous valides', () => {
    const opts = startOptions('2026-09-10'); // jeudi
    expect(opts.map((o) => o.id)).toEqual(['today', 'tomorrow', 'monday']);
    for (const o of opts) expect(isStartAllowed(o.date, '2026-09-10')).toBe(true);
  });
  it('ne propose jamais deux fois la même date (dimanche : demain = lundi)', () => {
    const opts = startOptions('2026-09-13'); // dimanche
    expect(new Set(opts.map((o) => o.date)).size).toBe(opts.length);
    expect(opts.map((o) => o.id)).toEqual(['today', 'tomorrow']);
  });
});

describe('startLabel', () => {
  it('reste lisible', () => {
    expect(startLabel('2026-09-10', '2026-09-10')).toBe("aujourd'hui");
    expect(startLabel('2026-09-11', '2026-09-10')).toBe('demain');
    expect(startLabel('2026-09-14', '2026-09-10')).toBe('lundi 14 septembre');
  });
});
