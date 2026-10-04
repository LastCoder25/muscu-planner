// ⏳ Les groupes d'attaque combinée qui attendent de partir d'un lieu (signalé : la fiche d'un
// lieu fixe ne disait rien de ses champions réservés).
import { describe, expect, it } from 'vitest';
import {
  attackReservedIds,
  waitingFrom,
  type AttackWing,
  type CombinedAttack,
} from '@/lib/combinedAttack';
import type { Poi } from '@/lib/expedition';

const target = { id: 'camp1', type: 'camp' } as Poi;
const wing = (
  originId: string | null,
  state: AttackWing['state'],
  departAt: number,
  members: string[],
): AttackWing => ({
  originId,
  members,
  hero: false,
  legMin: 30,
  departAt,
  returnAt: departAt + 3_600_000,
  state,
});
const attack = (id: string, wings: AttackWing[]): CombinedAttack => ({
  id,
  poi: target,
  seed: 1,
  createdAt: 0,
  arriveAt: 10,
  midAt: 10,
  playerLevel: 20,
  supplies: [],
  wings,
});

describe('⏳ waitingFrom', () => {
  it('ne rend que les groupes EN ATTENTE partis de ce lieu, du plus proche départ au plus lointain', () => {
    const attacks = [
      attack('a', [wing(null, 'waiting', 5, ['h1']), wing('fort', 'waiting', 9, ['c1', 'c2'])]),
      attack('b', [wing('fort', 'waiting', 3, ['c3']), wing('fort', 'gone', 1, ['c4'])]),
      attack('c', [wing('autre', 'waiting', 2, ['c5']), wing('fort', 'dropped', 2, ['c6'])]),
    ];
    const r = waitingFrom(attacks, 'fort');
    expect(r.map((w) => w.attackId)).toEqual(['b', 'a']);
    expect(r.map((w) => w.members)).toEqual([['c3'], ['c1', 'c2']]);
    expect(r[0]!.poi.id).toBe('camp1');
    expect(waitingFrom(attacks, null).map((w) => w.members)).toEqual([['h1']]);
  });
  it('rien sans attaque', () => {
    expect(waitingFrom(null, 'fort')).toEqual([]);
    expect(waitingFrom([], 'fort')).toEqual([]);
  });
});

describe('⚔️⏳ attackReservedIds', () => {
  it('les champions des groupes EN ATTENTE partis d’un lieu fixe, pas ceux de la base ni partis', () => {
    const r = attackReservedIds([
      attack('a', [wing(null, 'waiting', 5, ['h1']), wing('fort', 'waiting', 9, ['c1', 'c2'])]),
      attack('b', [wing('fort', 'gone', 1, ['c4']), wing('autre', 'dropped', 2, ['c6'])]),
    ]);
    expect([...r].sort()).toEqual(['c1', 'c2']);
    expect(attackReservedIds(null).size).toBe(0);
  });
});
