import { describe, expect, it } from 'vitest';
import { dispelOverflow, rollRaid, RAID, type BaseState, type RiftOverflow } from '../src/lib/raid';
import { replayWhenLabel, REPLAY_LATE_MS } from '../src/lib/riftStage';
import { messageCard } from '../src/lib/missionCard';
import { DISPEL_TEXT } from '../src/lib/raid';
import type { ExpeditionMessage } from '../src/lib/expedition';

const OV: RiftOverflow = { at: 1_000, level: 39, faction: 'mortsvivants' };
const base = (extra: Partial<BaseState>): BaseState => ({ ...(extra as BaseState) });

describe('⚔️ une interception gagnée disperse l’armée de la faille', () => {
  it('lève le marquage en attente', () => {
    const d = dispelOverflow(base({ overflow: OV, raid: null }), 5_000);
    expect(d.base.overflow).toBeNull();
    expect(d.dispel).toBe('dispersed');
  });

  it('une armée vue APRÈS la bataille perd sa marque et son renfort', () => {
    const raid = rollRaid(7, 30, 20_000_000, 10_000_000, OV); // vue à 10 000 000
    const d = dispelOverflow(base({ overflow: null, raid }), 5_000_000);
    expect(d.dispel).toBe('dispersed');
    const b = d.base;
    expect(b.raid?.overflow).toBeUndefined();
    b.raid!.groups.forEach((g, i) =>
      expect(g.threat).toBeCloseTo((raid.groups[i]!.threat ?? 1) / RAID.riftThreat, 9),
    );
    // Même armée, sans renfort : identique au tirage ordinaire de la même faction.
    const plain = rollRaid(7, 30, 20_000_000, 10_000_000, null);
    if (plain.faction === raid.faction)
      plain.groups.forEach((g, i) => expect(b.raid!.groups[i]!.threat).toBeCloseTo(g.threat!, 9));
  });

  it('une armée vue AVANT la bataille garde la force annoncée', () => {
    const raid = rollRaid(7, 30, 20_000_000, 10_000_000, OV);
    const d = dispelOverflow(base({ overflow: null, raid }), 15_000_000);
    expect(d.base.raid).toBe(raid);
    expect(d.dispel).toBe('late');
  });

  it('rien à changer → la même référence', () => {
    const b0 = base({ overflow: null, raid: null });
    expect(dispelOverflow(b0, 1)).toEqual({ base: b0, dispel: null });
    expect(dispelOverflow(b0, 1).base).toBe(b0);
  });

  it('🗼 le rapport d’interception dit ce que la victoire a changé', () => {
    const m = {
      id: 'm',
      poiType: 'warband',
      level: 30,
      win: true,
      text: 'Bande rompue.',
      resolvedAt: 0,
      party: { dispel: 'late', escort: [], hero: false, foes: 1, slain: 1, win: true },
    } as unknown as ExpeditionMessage;
    expect(messageCard(m, []).story).toContain(DISPEL_TEXT.late);
    const sans = { ...m, party: { ...m.party!, dispel: undefined } } as ExpeditionMessage;
    expect(messageCard(sans, []).story).toBe('Bande rompue.');
  });
});

describe('⏱️ un rejeu en retard dit l’heure de la bataille', () => {
  const at = new Date(2026, 8, 26, 23, 26).getTime();
  it('à l’heure : rien à dire', () => {
    expect(replayWhenLabel(at, at + REPLAY_LATE_MS - 1)).toBeNull();
  });
  it('en retard le même jour : l’heure', () => {
    expect(replayWhenLabel(at, at + REPLAY_LATE_MS)).toBe('⏱️ Livrée à 23 h 26');
  });
  it('le lendemain : « hier », plus loin : la date', () => {
    expect(replayWhenLabel(at, new Date(2026, 8, 27, 1, 5).getTime())).toBe(
      '⏱️ Livrée hier à 23 h 26',
    );
    expect(replayWhenLabel(at, new Date(2026, 8, 29, 9, 0).getTime())).toBe(
      '⏱️ Livrée le 26/09 à 23 h 26',
    );
  });
});
