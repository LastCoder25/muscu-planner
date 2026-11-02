// Élastique de RÉSISTANCE (niveau de bande), distinct de l'assistance : exclusif avec elle,
// absent des anciennes séries, et une autre bande est une autre charge pour le conseil.
import { describe, it, expect } from 'vitest';
import {
  updateSetAt,
  loadBlocks,
  legLastBand,
  elasticBandLabel,
  ELASTIC_BANDS,
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
    const out = updateSetAt([set()], 0, { reps: 12, weight: null, assisted: false, band: 'strong' });
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
    expect(loadBlocks(sets.map((s) => ({ ...s, band: 'light' as const }))).length).toBeGreaterThan(0);
  });

  it('le niveau de la dernière série préremplit la suivante', () => {
    const leg = { sets: [set({ band: 'light' }), set({ band: 'strong' })] } as unknown as ComboLeg;
    expect(legLastBand(leg)).toBe('strong');
    expect(legLastBand({ sets: [] } as unknown as ComboLeg)).toBeNull();
  });
});
