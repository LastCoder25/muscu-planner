import { describe, expect, it } from 'vitest';
import { voyageAboard } from '@/lib/party';
import type { ActiveExpedition } from '@/lib/expedition';

// 👥 Signalé (2026-10-13) : « Érèbe rentre avec le héros vers la base » alors qu'il est resté
// en garnison sur la citadelle prise. Au retour, seuls ceux qui rentrent sont à bord.
describe('👥 voyageAboard', () => {
  const v = {
    crew: ['a', 'b'],
    outcome: { party: { escort: ['a', 'b'] } },
    midAt: 100,
    returnAt: 200,
  } as unknown as ActiveExpedition;
  const roster = [
    { id: 'a', busyUntil: 200 },
    { id: 'b', posted: 'isl_obj_2' },
  ];
  it('à l’aller, tout le groupe marche', () => {
    expect(voyageAboard(v, roster, 50)).toEqual(['a', 'b']);
  });
  it('au retour, celui resté en garnison n’est plus à bord', () => {
    expect(voyageAboard(v, roster, 150)).toEqual(['a']);
  });
});
