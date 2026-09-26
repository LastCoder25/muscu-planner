import { describe, expect, it } from 'vitest';
import { dispelOverflow, rollRaid, RAID, type BaseState, type RiftOverflow } from '../src/lib/raid';

const OV: RiftOverflow = { at: 1_000, level: 39, faction: 'mortsvivants' };
const base = (extra: Partial<BaseState>): BaseState => ({ ...(extra as BaseState) });

describe('⚔️ une interception gagnée disperse l’armée de la faille', () => {
  it('lève le marquage en attente', () => {
    const b = dispelOverflow(base({ overflow: OV, raid: null }), 5_000);
    expect(b.overflow).toBeNull();
  });

  it('une armée vue APRÈS la bataille perd sa marque et son renfort', () => {
    const raid = rollRaid(7, 30, 20_000_000, 10_000_000, OV); // vue à 10 000 000
    const b = dispelOverflow(base({ overflow: null, raid }), 5_000_000);
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
    const b = dispelOverflow(base({ overflow: null, raid }), 15_000_000);
    expect(b.raid).toBe(raid);
  });

  it('rien à changer → la même référence', () => {
    const b0 = base({ overflow: null, raid: null });
    expect(dispelOverflow(b0, 1)).toBe(b0);
  });
});
