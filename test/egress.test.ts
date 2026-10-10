import { describe, expect, it } from 'vitest';
import { mergeWritten, writtenEcho } from '@/lib/characterWrite';
import {
  REPLAY_KEEP,
  depositMessages,
  keepMessages,
  type ExpeditionMessage,
} from '@/lib/expedition';

describe('📉 écrire sans relire la ligne', () => {
  it("l'écho est ce que la base stockerait : un champ indéfini disparaît", () => {
    const e = writtenEcho({ gold: 5, voie: undefined, base: { a: [1, 2] } });
    expect(e).toEqual({ gold: 5, base: { a: [1, 2] } });
    expect('voie' in e).toBe(false);
  });

  it("la ligne fusionnée garde ce qui n'est pas écrit et prend ce qui l'est", () => {
    const cur = { gold: 1, inventory: [{ id: 'x' }], pseudo: 'A' };
    const next = mergeWritten(cur, { gold: 9 });
    expect(next).toEqual({ gold: 9, inventory: [{ id: 'x' }], pseudo: 'A' });
    // nouvelle référence (les ticks comparent l'identité), l'ancienne intacte
    expect(next).not.toBe(cur);
    expect(cur.gold).toBe(1);
    // ce qui n'est pas écrit n'est pas recopié : même objet
    expect(next.inventory).toBe(cur.inventory);
  });

  it('sans ligne chargée, on part du patch', () => {
    expect(mergeWritten(null, { gold: 3 })).toEqual({ gold: 3 });
  });
});

const duel = { maxPv: 100, steps: [{ pv: 1, crit: false, dealt: 1, taken: 0, bossPv: 0, bossTurns: 0, groupTurns: 1 }] };
function report(i: number, withDuel = true): ExpeditionMessage {
  return {
    id: `m${i}`,
    level: 1,
    win: true,
    text: 't',
    gold: 0,
    energy: 0,
    key: 0,
    resolvedAt: 1000 - i,
    read: true,
    party: {
      win: true,
      rift: { level: 1, maxPv: 10, pvTrail: [5], foeTrail: [], ...(withDuel ? { boss: duel } : {}) },
    } as unknown as ExpeditionMessage['party'],
  } as ExpeditionMessage;
}

describe('📉 la boîte allège les vieux rapports', () => {
  it(`seuls les ${REPLAY_KEEP} plus récents gardent le duel du gardien`, () => {
    const box = Array.from({ length: 15 }, (_, i) => report(i));
    const kept = keepMessages(box, 40);
    expect(kept).toHaveLength(15);
    kept.forEach((m, i) => {
      expect(!!m.party?.rift?.boss).toBe(i < REPLAY_KEEP);
      // le reste du rapport est intact
      expect(m.party?.rift?.pvTrail).toEqual([5]);
      expect(m.text).toBe('t');
    });
  });

  it('les notes de production ne prennent pas la place des rapports', () => {
    const notes = Array.from({ length: 4 }, (_, i) => ({ ...report(100 + i), id: `ctlgold_${i}` }));
    const box = [...notes, ...Array.from({ length: REPLAY_KEEP }, (_, i) => report(i))];
    const kept = keepMessages(box, 40);
    expect(kept.filter((m) => m.party?.rift?.boss)).toHaveLength(box.length);
  });

  it('une boîte à alléger est réécrite, même sans rien de neuf', () => {
    const box = Array.from({ length: 12 }, (_, i) => report(i));
    const out = depositMessages(box, [], 40);
    expect(out).not.toBe(box);
    expect(out.filter((m) => m.party?.rift?.boss)).toHaveLength(REPLAY_KEEP);
    // et une fois allégée, plus rien à écrire : même référence
    expect(depositMessages(out, [], 40)).toBe(out);
  });
});
