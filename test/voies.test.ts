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
    // Lu sur le catalogue, pas écrit à la main : le test survit aux réglages d'équilibrage.
    const berserk = voiePassiveEffects('berserker');
    expect(berserk.damagePct).toBeCloseTo(VOIE_BY_ID.berserker!.passive.base / 100, 5);
    const none = voiePassiveEffects(null);
    expect(none.damagePct).toBe(0);
    expect(none.dmgReduction).toBe(0);
    const gardien = voiePassiveEffects('gardien');
    expect(gardien.dmgReduction).toBeCloseTo(VOIE_BY_ID.gardien!.passive.base / 100, 5);
  });
  it('aucun passif ne porte du critique : il est plafonné, un passif critique ne ferait rien', () => {
    // ⚠️ Mesuré (v0.837) : le critique de base atteint son plafond dès le niveau 20, donc les
    // passifs critique d'Assassin et Duelliste valaient ~0 en combat. Ils sont passés en
    // exécution et en dégâts.
    for (const v of VOIES) expect(v.passive.type, v.id).not.toBe('crit_pct');
  });
  it('un passif est un PETIT bonus : jamais une stat de voie qui décide seule du choix', () => {
    // Bornes des familles (en points) : les pourcentages de dégâts/PV/réduction/vol de vie
    // restent sous 6, l'exécution (qui ne vaut que sous 25 % des PV ennemis) sous 80.
    for (const v of VOIES) {
      const cap = v.passive.type === 'execute_pct' ? 80 : 6;
      expect(v.passive.base, v.id).toBeLessThanOrEqual(cap);
    }
  });
});
