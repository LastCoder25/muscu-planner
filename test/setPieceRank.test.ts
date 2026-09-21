import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { characterRank } from '@/lib/characterRank';
import {
  rollTier,
  rollSetPiece,
  dropsPerLevel,
  setPiecesPerLevel,
  voieSetId,
  RARITY_RANK,
  RANK_ORDER,
  VOIE_SETS,
} from '@/lib/items';

/**
 * 🧩 UNE PIÈCE DE SET S'OUVRE À SON RANG AU MÊME RYTHME QU'UN DROP (v0.1023, mesuré).
 *
 * La part de ton rang (« ton rang s'ouvre sur la durée du rang », v0.894) était rapportée au
 * volume des DROPS — ~220 par niveau au niveau 30 — et s'appliquait telle quelle aux pièces
 * de set, dont un niveau ne fournit que ~5 par set. Mesuré : 0 à 2 % des pièces à son rang du
 * niveau 25 au 75, et un set complet ne valait presque rien (×1,00 à ×1,07). La règle est
 * désormais : AUTANT d'objets de ton rang par niveau, quelle que soit la source.
 */

const N = 6000;
const mine = (L: number) => Math.min(RANK_ORDER.length - 1, characterRank(L).rankIndex);

function dropOwnShare(L: number): number {
  const rng = mulberry32(11 + L);
  let own = 0;
  for (let i = 0; i < N; i++) if (RARITY_RANK[rollTier(rng, L, 0, 0, L).rank] === mine(L)) own++;
  return own / N;
}
function setOwnShare(L: number): number {
  const rng = mulberry32(29 + L);
  let own = 0;
  for (let i = 0; i < N; i++) {
    const p = rollSetPiece(rng, { setId: voieSetId('gardien'), level: L, luck: 0, playerLevel: L });
    if (RARITY_RANK[p.rarity] === mine(L)) own++;
  }
  return own / N;
}

describe('🧩 pièces de set : la part de ton rang suit leur volume', () => {
  it('un niveau fournit ~40 fois moins de pièces d’UN set que de drops', () => {
    const r = dropsPerLevel(30) / setPiecesPerLevel(30);
    expect(r).toBeGreaterThan(30);
    expect(setPiecesPerLevel(30) * VOIE_SETS.length).toBeLessThan(dropsPerLevel(30));
  });

  it('autant d’objets de ton rang par niveau par les drops que par les pièces de SON set', () => {
    // Début de rang (niv. 22, 23) : la part est basse des deux côtés et ne sature pas.
    for (const L of [22, 23, 32]) {
      const drops = dropOwnShare(L) * dropsPerLevel(L);
      const set = setOwnShare(L) * setPiecesPerLevel(L);
      expect(set / drops).toBeGreaterThan(0.75);
      expect(set / drops).toBeLessThan(1.35);
    }
  });

  it('une pièce de set tombe bien plus souvent à ton rang qu’un drop', () => {
    expect(setOwnShare(25)).toBeGreaterThan(10 * dropOwnShare(25));
  });

  it('le rang s’ouvre toujours progressivement : bas en début de rang, jamais au-dessus', () => {
    expect(setOwnShare(21)).toBeLessThan(0.45);
    expect(setOwnShare(28)).toBeGreaterThan(setOwnShare(21));
    const rng = mulberry32(5);
    for (let i = 0; i < 2000; i++) {
      const p = rollSetPiece(rng, {
        setId: voieSetId('assassin'),
        level: 60,
        luck: 1,
        playerLevel: 30,
      });
      expect(RARITY_RANK[p.rarity]).toBeLessThanOrEqual(mine(30));
    }
  });
});
