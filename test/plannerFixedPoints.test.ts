import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plannableControl, plannedTripMin } from '@/lib/expeditionPlanner';
import { startParty } from '@/lib/party';
import { dwellMsFor, FALLEN_DWELL_MS, type ExpeditionOutcome, type Poi } from '@/lib/expedition';

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const ctl = (kind: string, owner: 'enemy' | 'player' = 'enemy', assault?: boolean) => ({
  type: 'control',
  control: { owner, kind, ...(assault ? { assault } : {}) },
});

describe('🪄 le planificateur et la fouille des ruines d’un héros tombé', () => {
  it('une heure de fouille s’ajoute à l’aller-retour du groupe le plus lent', () => {
    expect(plannedTripMin([30, 50], 0)).toBe(50);
    expect(plannedTripMin([30, 50], FALLEN_DWELL_MS)).toBe(110);
  });

  it('⚠️ la durée annoncée égale celle du vrai départ (startParty), ruines comprises', () => {
    for (const type of ['fallen', 'mine', 'vein'] as const) {
      const poi = { id: 'x', type } as unknown as Poi;
      const champions = 2;
      const leg = 40;
      const trip = startParty(
        { poi, hero: null, seed: 1, champions },
        0,
        leg,
        {} as ExpeditionOutcome,
      );
      expect(plannedTripMin([2 * leg], dwellMsFor(poi, champions))).toBe(trip.returnAt / 60_000);
    }
    // Et la fouille est bien comptée : sans elle, les ruines auraient 60 min de moins.
    expect(dwellMsFor({ type: 'fallen' } as Poi, 1)).toBe(FALLEN_DWELL_MS);
  });
});

describe('🏰 les points ennemis proposables', () => {
  it('un point ennemi ordinaire se propose', () => {
    for (const k of ['mine', 'training', 'garden', 'tower', 'archives', 'ossuary', 'arsenal'])
      expect(plannableControl(ctl(k))).toBe(true);
  });
  it('jamais la forteresse, un point tenu ni un point déjà attaqué', () => {
    expect(plannableControl(ctl('fortress'))).toBe(false);
    expect(plannableControl(ctl('mine', 'player'))).toBe(false);
    expect(plannableControl(ctl('mine', 'enemy', true))).toBe(false);
  });
  it('un lieu qui n’est pas un point de contrôle n’en est pas un', () => {
    expect(plannableControl({ type: 'camp' })).toBe(false);
    expect(plannableControl({ type: 'control' })).toBe(false);
  });

  // Le câblage : l'interrupteur filtre bien les points ennemis, la page ne les écarte plus.
  it('le planificateur ne les calcule que pastille allumée', () => {
    const c = src('src/composables/useExpeditionPlanner.ts');
    expect(c).toContain("withControls.value || p.type !== 'control'");
    expect(c).toContain('withControls,');
    expect(c).toContain('dwellMsFor(t, advsOf(us).length)'); // la fouille est dans le trajet
    expect(src('src/components/ExpeditionPlanner.vue')).toContain('data-test="with-controls"');
    expect(src('src/pages/ExpeditionMapPage.vue')).toContain('plannableControl(p)');
  });
  it('éteint par défaut : prendre un point poste des champions', () => {
    expect(src('src/composables/useExpeditionPlanner.ts')).toContain(
      "ref(readStr(CONTROLS_KEY) === '1')",
    );
  });
});
