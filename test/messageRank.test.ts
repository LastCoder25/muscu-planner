import { describe, it, expect } from 'vitest';
import {
  buildMessage,
  messageRankLevel,
  poiDifficultyLevel,
  type ActiveExpedition,
  type Poi,
} from '@/lib/expedition';
import { messageCard } from '@/lib/missionCard';
import { characterRank } from '@/lib/characterRank';

// Un lieu gardé dont la difficulté affichée diffère du niveau brut de ses gardes.
function guardedPoi(): Poi {
  for (let i = 0; i < 500; i++) {
    const p = { id: `poi_t${i}`, type: 'mine', level: 40 } as Poi;
    if (characterRank(poiDifficultyLevel(p)).name !== characterRank(p.level).name) return p;
  }
  throw new Error('aucun lieu gardé trouvé');
}

describe('🏅 le rapport affiche le rang de la carte', () => {
  it('rang = difficulté du lieu, pas le niveau brut des gardes', () => {
    const poi = guardedPoi();
    const exp = {
      poi,
      sentAt: 1_700_000_000_000,
      midAt: 1,
      returnAt: 2,
      outcome: { win: true, text: '', gold: 0, energy: 0, key: 0 },
    } as unknown as ActiveExpedition;
    const m = buildMessage(exp);
    expect(messageRankLevel(m)).toBe(poiDifficultyLevel(poi));
    const r = characterRank(poiDifficultyLevel(poi));
    expect(
      messageCard(m, []).rank?.startsWith(`${r.name} ★`) ||
        messageCard(m, []).rank?.startsWith(`${r.name} ☆`),
    ).toBe(true);
  });
  it('sans type de lieu (coffre), on retombe sur le niveau', () => {
    expect(messageRankLevel({ id: 'chest_x', level: 12 })).toBe(12);
  });
});
