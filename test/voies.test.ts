import { describe, it, expect } from 'vitest';
import { VOIES, VOIE_BY_ID, voiePassiveEffects } from '@/lib/voies';
import { combatPowerRaw } from '@/lib/combat';
import { playerWithGear, mergeEffects } from '@/lib/items';
import { gearedBuild } from './helpers/gearedFighter';

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
    // ⚠️ RÉÉCRIT (refonte équipement, étape 7) : bornés en POINTS, les passifs ne disaient pas
    // ce qu'ils valent (un point de rage ne pèse pas un point de PV). Mesuré sur le joueur de
    // référence : 0,8 à 4 % avant, et le passif Vampire (1 % de vol de vie) atteignait seul le
    // plafond de soin — ils décidaient de la voie à la place du set (177 échecs sur 288). La
    // propriété est donc en PUISSANCE : chacun entre 0,3 et 2 %, aux niveaux 30 et 60.
    for (const L of [30, 60]) {
      const b = gearedBuild(L, 1);
      const p0 = combatPowerRaw(playerWithGear('g', b.stats, b.eq, b.fx, L));
      for (const v of VOIES) {
        const fx = mergeEffects(b.fx, voiePassiveEffects(v.id));
        const gain = combatPowerRaw(playerWithGear('g', b.stats, b.eq, fx, L)) / p0 - 1;
        expect(gain, `${v.id} niveau ${L}`).toBeGreaterThan(0.003);
        expect(gain, `${v.id} niveau ${L}`).toBeLessThan(0.02);
      }
    }
  });
});
