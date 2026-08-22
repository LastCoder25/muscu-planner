import { describe, it, expect } from 'vitest';
import { VOIES, VOIE_BY_ID, voiePassiveEffects } from '@/lib/voies';

describe('voies (spécialisation)', () => {
  it('catalogue cohérent : id unique, preferred non vide, passif défini', () => {
    const ids = new Set(VOIES.map((v) => v.id));
    expect(ids.size).toBe(VOIES.length);
    for (const v of VOIES) {
      expect(v.preferred.length).toBeGreaterThan(0);
      expect(v.passive.base).toBeGreaterThan(0);
      expect(VOIE_BY_ID[v.id]).toBe(v);
    }
  });
  it('voiePassiveEffects : applique le passif (fraction), neutre si aucune voie', () => {
    const berserk = voiePassiveEffects('berserker'); // +6% dégâts
    expect(berserk.damagePct).toBeCloseTo(0.06, 5);
    const none = voiePassiveEffects(null);
    expect(none.damagePct).toBe(0);
    expect(none.dmgReduction).toBe(0);
    const gardien = voiePassiveEffects('gardien'); // +5% réduction
    expect(gardien.dmgReduction).toBeCloseTo(0.05, 5);
  });
});
