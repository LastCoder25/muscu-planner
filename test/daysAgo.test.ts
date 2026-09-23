// ⚠️ CE FICHIER EXISTE À CAUSE D'UN DÉFAUT LIVRÉ, trouvé par le smoke connecté : le mur de
// records annonçait « hier » pour avant-hier et « il y a 8 j » pour neuf. La cause n'était
// pas le barème mais l'UNITÉ — on soustrayait un INSTANT (`Date.now()`) d'un JOUR arbitrairement
// posé à midi UTC, donc toute la matinée française tombait un cran trop bas.
import { describe, it, expect } from 'vitest';
import { daysAgoLabel } from '@/lib/startDate';
import { personalRecords } from '@/lib/estimates';
import { localDayIso } from '@/lib/localDay';
import type { SessionLog } from '@/lib/types';

describe("daysAgoLabel — l'ancienneté compare deux JOURS", () => {
  it('nomme les tout premiers crans', () => {
    expect(daysAgoLabel('2026-09-23', '2026-09-23')).toBe("aujourd'hui");
    expect(daysAgoLabel('2026-09-22', '2026-09-23')).toBe('hier');
    expect(daysAgoLabel('2026-09-21', '2026-09-23')).toBe('il y a 2 j');
  });

  // ⚠️ LE DÉFAUT EXACT : 14 → 23 septembre, c'est NEUF jours. L'ancienne version en
  // annonçait huit dès lors qu'il était avant midi UTC.
  it('compte les jours de calendrier, pas des tranches de 24 h', () => {
    expect(daysAgoLabel('2026-09-14', '2026-09-23')).toBe('il y a 9 j');
  });

  it('passe aux mois puis aux années', () => {
    expect(daysAgoLabel('2026-08-23', '2026-09-23')).toBe('il y a 1 mois');
    expect(daysAgoLabel('2026-03-23', '2026-09-23')).toBe('il y a 6 mois');
    expect(daysAgoLabel('2025-09-23', '2026-09-23')).toBe('il y a 1 an');
    expect(daysAgoLabel('2024-09-23', '2026-09-23')).toBe('il y a 2 ans');
  });

  // ⚠️ LE CAS QUI DISCRIMINE, et il a fallu une mutation survivante pour le trouver : à
  // 365 jours, `/30` et `/30,44` donnent tous deux 12 mois, donc le même libellé — mon
  // premier test « sans ça on lirait 13 mois » ne prouvait RIEN. C'est à 345 jours que les
  // deux divergent (11,5 → arrondi à 12, contre 11,33 → 11) : un mois de 30 jours ronds
  // annoncerait « il y a 1 an » pour onze mois et demi.
  it('ne vieillit pas onze mois en une année', () => {
    expect(daysAgoLabel('2025-10-13', '2026-09-23')).toBe('il y a 11 mois');
  });

  it('une date future ne rend jamais un « il y a » négatif', () => {
    expect(daysAgoLabel('2026-09-25', '2026-09-23')).toBe("aujourd'hui");
  });

  // ⚠️ La frontière du barème : 30 jours se disent en jours, 31 en mois. Sans ce test,
  // déplacer le seuil ne ferait rougir personne.
  it('bascule des jours aux mois à 31', () => {
    expect(daysAgoLabel('2026-08-24', '2026-09-23')).toBe('il y a 30 j');
    expect(daysAgoLabel('2026-08-23', '2026-09-23')).toBe('il y a 1 mois');
  });
});

describe('personalRecords — la date du record est un jour LOCAL', () => {
  function log(iso: string): { performedAt: string; log: SessionLog } {
    return {
      performedAt: iso,
      log: {
        schema_version: '1.0',
        type: 'session_log',
        id: 'l' + iso,
        performed_at: iso,
        exercises: [
          {
            id: 'ex1',
            name: 'Développé couché',
            planned: { sets: 3, reps_min: 8, reps_max: 12, load: 'external', load_kg: 60 },
            performed: [{ reps: 10, load_kg: 60, difficulty: 3 }],
          },
        ],
      } as unknown as SessionLog,
    };
  }

  // ⚠️ Une séance faite à 1 h du matin en France porte l'horodatage UTC de la VEILLE.
  // `slice(0, 10)` la datait donc un jour trop tôt — le piège que `localDay.ts` documente.
  it('ne date pas un record de la veille parce que UTC a déjà changé de jour', () => {
    const minuitPasse = new Date('2026-09-15T01:30:00+02:00'); // 15/09 en France
    expect(minuitPasse.toISOString().slice(0, 10)).toBe('2026-09-14'); // … mais 14 en UTC
    const [rec] = personalRecords([log(minuitPasse.toISOString())]);
    expect(rec?.dateIso).toBe(localDayIso(minuitPasse));
  });

  it('garde le jour local d’un horaire ordinaire', () => {
    const apresMidi = new Date('2026-09-20T15:00:00+02:00');
    const [rec] = personalRecords([log(apresMidi.toISOString())]);
    expect(rec?.dateIso).toBe('2026-09-20');
  });
});
