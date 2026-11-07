// Élastique de RÉSISTANCE (niveau de bande), distinct de l'assistance : exclusif avec elle,
// absent des anciennes séries, et une autre bande est une autre charge pour le conseil.
import { describe, it, expect } from 'vitest';
import {
  updateSetAt,
  loadBlocks,
  legLastBand,
  setCellLabel,
  lastEnteredSet,
  exerciseHistorySets,
  repQuickPicks,
  stepWeight,
  elasticBandLabel,
  ELASTIC_BANDS,
  type ComboChallenge,
  type ComboLeg,
  type ComboSet,
} from '@/lib/combo';

const D = '2099-01-05';
const set = (p: Partial<ComboSet> = {}): ComboSet => ({ date: D, reps: 10, weight: null, ...p });

describe('élastique de résistance', () => {
  it('quatre niveaux nommés', () => {
    expect(ELASTIC_BANDS.map((b) => b.id)).toEqual(['light', 'medium', 'strong', 'xstrong']);
    expect(elasticBandLabel('xstrong')).toBe('Très fort');
    expect(elasticBandLabel(null)).toBe('');
  });

  it('corriger une série pose la bande', () => {
    const out = updateSetAt([set()], 0, {
      reps: 12,
      weight: null,
      assisted: false,
      band: 'strong',
    });
    expect(out[0]!.band).toBe('strong');
    expect(out[0]!.reps).toBe(12);
  });

  it('⚠️ assisté ET résistance ne coexistent jamais : l’assistance efface la bande', () => {
    const out = updateSetAt([set({ band: 'light' })], 0, {
      reps: 10,
      weight: null,
      assisted: true,
      band: 'light',
    });
    expect(out[0]!.assisted).toBe(true);
    expect(out[0]!.band).toBeUndefined();
  });

  it('repasser à « aucun » retire la bande', () => {
    const out = updateSetAt([set({ band: 'medium' })], 0, {
      reps: 10,
      weight: null,
      assisted: false,
      band: null,
    });
    expect('band' in out[0]!).toBe(false);
  });

  it('une ancienne série assistée (sans bande) se relit telle quelle', () => {
    const old = set({ assisted: true });
    expect(old.band).toBeUndefined();
    const out = updateSetAt([old], 0, { reps: 10, weight: null, assisted: true });
    expect(out[0]!.assisted).toBe(true);
  });

  it('changer de bande remet les blocs de charge à zéro (autre charge)', () => {
    const at = (m: number) => `${D}T08:${String(m).padStart(2, '0')}:00Z`;
    const sets = [
      set({ reps: 8, band: 'light', at: at(0) }),
      set({ reps: 9, band: 'light', at: at(5) }),
      set({ reps: 6, band: 'strong', at: at(30) }),
    ];
    // La dernière est à « fort » : seules les séries « fort » comptent.
    expect(loadBlocks(sets)).toEqual([6]);
    // Même bande partout : les trois se comparent.
    expect(loadBlocks(sets.map((s) => ({ ...s, band: 'light' as const }))).length).toBeGreaterThan(
      0,
    );
  });

  it('le niveau de la dernière série préremplit la suivante', () => {
    const leg = { sets: [set({ band: 'light' }), set({ band: 'strong' })] } as unknown as ComboLeg;
    expect(legLastBand(leg)).toBe('strong');
    expect(legLastBand({ sets: [] } as unknown as ComboLeg)).toBeNull();
  });
});

describe('setCellLabel — étiquette compacte d’une cellule', () => {
  it('poids du corps, lest, assisté, résistance', () => {
    expect(setCellLabel(set({ reps: 12 }))).toBe('12');
    expect(setCellLabel(set({ reps: 12, weight: 15 }))).toBe('12×15kg');
    expect(setCellLabel(set({ reps: 8, assisted: true }))).toBe('8 🟧');
    expect(setCellLabel(set({ reps: 9, weight: 5, band: 'strong' }))).toBe('9×5kg 🟦');
    expect(setCellLabel(undefined)).toBe('');
  });
});

describe('1re série d’un nouveau défi : la dernière saisie', () => {
  const at = (m: number) => `${D}T08:${String(m).padStart(2, '0')}:00Z`;
  it('lastEnteredSet : la plus récente par heure, quel que soit l’ordre de la liste', () => {
    const a = set({ reps: 8, weight: 20, at: at(5) });
    const b = set({ reps: 12, weight: 25, at: at(40) });
    const c = set({ reps: 9, weight: 22, at: at(10) });
    expect(lastEnteredSet([a, b, c])).toBe(b);
    expect(lastEnteredSet([b, c, a])).toBe(b);
  });
  it('sans heure : par jour ; une série à 0 rep est ignorée ; liste vide → null', () => {
    const old = set({ date: '2099-01-03', reps: 7 });
    const recent = set({ date: '2099-01-08', reps: 11 });
    expect(lastEnteredSet([recent, old])).toBe(recent);
    expect(lastEnteredSet([old, set({ date: '2099-02-01', reps: 0 })])).toBe(old);
    expect(lastEnteredSet([])).toBeNull();
  });
  it('exerciseHistorySets : seulement cet exo, sans les séries basculées', () => {
    const mk = (id: string, sets: ComboSet[]) =>
      ({
        id: 'c',
        name: '',
        start_date: D,
        duration_days: 7,
        status: 'done',
        legs: [{ exercise_id: id, sets }],
      }) as unknown as ComboChallenge;
    const moved = set({ reps: 5, origin: { exercise_id: 'x', exercise_name: 'X', rep_weight: 1 } });
    const out = exerciseHistorySets(
      [mk('a', [set({ reps: 10 }), moved]), mk('b', [set({ reps: 3 })])],
      'a',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.reps).toBe(10);
  });
});

describe('repQuickPicks — pastilles de reps', () => {
  it('sans fourchette : 8 à 12', () => expect(repQuickPicks()).toEqual([8, 9, 10, 11, 12]));
  it('fourchette courte : toutes les valeurs', () =>
    expect(repQuickPicks(12, 15)).toEqual([12, 13, 14, 15]));
  it('fourchette large : 6 valeurs réparties, bornes comprises', () => {
    const p = repQuickPicks(10, 30);
    expect(p).toHaveLength(6);
    expect(p[0]).toBe(10);
    expect(p[5]).toBe(30);
  });
  it('durée : aucune pastille', () => expect(repQuickPicks(30, 60, true)).toEqual([]));
});

describe('stepWeight — stepper de charge', () => {
  it('poids du corps → +2,5 kg ; retour à 0 → vide', () => {
    expect(stepWeight(null, 1)).toBe(2.5);
    expect(stepWeight(2.5, -1)).toBeNull();
    expect(stepWeight(null, -1)).toBeNull();
  });
  it('de 2,5 en 2,5, arrondi au demi-kilo', () => {
    expect(stepWeight(40, 1)).toBe(42.5);
    expect(stepWeight(40, -1)).toBe(37.5);
    expect(stepWeight(41.25, 1)).toBe(44);
  });
});
