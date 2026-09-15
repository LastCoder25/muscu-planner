import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import {
  COMPANION_RANK,
  RANK_ORDER,
  RARITY_RANK,
  companionDropRank,
  familiarRankRef,
  prestigeRankIndex,
  rollCompanionTier,
  rollFamiliar,
} from '@/lib/items';
import { rollTalentDrop, talentRankOf } from '@/lib/talents';
import { FAMILIAR_SPECIES } from '@/data/familiars';
import { LABYRINTHS } from '@/data/labyrinths';
import { characterRank } from '@/lib/characterRank';

/** Écarts de rang (tiré − référence) sur `n` tirages, en parts. */
function offsets(draw: () => number, ref: number, n = 20_000): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const d = draw() - ref;
    m.set(d, (m.get(d) ?? 0) + 1 / n);
  }
  return m;
}
const tier = (id: string) => LABYRINTHS.find((l) => l.id === id)!;

describe('🐾 familiers et talents plafonnés au RANG DU JOUEUR (v0.857)', () => {
  it('le rang de référence est celui de l’échelle de PRESTIGE : un rang tous les 10 niveaux', () => {
    for (const L of [1, 10, 11, 20, 21, 30, 45, 61, 71, 100])
      expect(prestigeRankIndex(L), `niveau ${L}`).toBe(
        Math.min(RANK_ORDER.length - 1, characterRank(L).rankIndex),
      );
    // …borné par le contenu : un donjon de niveau 12 ne donne pas le rang d’un joueur 45.
    expect(companionDropRank(12, 45)).toBe(prestigeRankIndex(12));
    expect(companionDropRank(80, 45)).toBe(prestigeRankIndex(45));
  });

  it('⚠️ SON rang le plus souvent, JAMAIS au-dessus (v0.876)', () => {
    for (const luck of [0, 1]) {
      const rng = mulberry32(7 + luck);
      const o = offsets(() => RARITY_RANK[rollCompanionTier(rng, 3, luck).rank], 3);
      expect(o.get(0)!, `luck ${luck} : part de son rang`).toBeGreaterThan(luck ? 0.65 : 0.52);
      for (const d of o.keys()) expect(d, `luck ${luck}`).toBeLessThanOrEqual(0);
      // La traîne basse existe (fourrage), mais reste courte.
      expect(o.get(-1) ?? 0).toBeGreaterThan(0.2);
      expect((o.get(-3) ?? 0) + (o.get(-4) ?? 0)).toBeLessThan(0.01);
    }
  });

  it('la chance du contenu resserre la traîne basse : on farme SON rang plus profond', () => {
    const own = (luck: number) =>
      offsets(() => RARITY_RANK[rollCompanionTier(mulberryOnce, 4, luck).rank], 4).get(0)!;
    const mulberryOnce = mulberry32(99);
    expect(own(1)).toBeGreaterThan(own(0) + 0.1);
  });

  it('⚠️ TOUT SE DÉCALE AU PASSAGE DE RANG : un niveau de plus, le familier le plus fréquent monte', () => {
    const mode = (player: number) => {
      const rng = mulberry32(player);
      const sp = FAMILIAR_SPECIES[0]!;
      const o = offsets(
        () =>
          RARITY_RANK[rollFamiliar(rng, sp, { level: 85, luck: 1, playerLevel: player }).rarity],
        0,
        6000,
      );
      return [...o.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    };
    expect(mode(20)).toBe(1); // Argent
    expect(mode(21)).toBe(2); // Or dès le rang gagné
    expect(mode(41)).toBe(4);
  });

  it('⚠️ AU LABYRINTHE, le PALIER borne par SON rang, pas par son niveau', () => {
    // Le Chaos est « Niv 40 » (rang Or noir) mais porte le rang Légendaire : un joueur qui
    // devient Légendaire au niveau 41 y trouve son rang tout de suite.
    const chaos = tier('chaos');
    expect(
      familiarRankRef({
        level: chaos.dropLevel,
        playerLevel: 41,
        rankCap: RARITY_RANK[chaos.rank],
      }),
    ).toBe(4);
    // Un palier peu profond cesse de donner son rang une fois dépassé.
    const gouffre = tier('gouffre');
    expect(
      familiarRankRef({
        level: gouffre.dropLevel,
        playerLevel: 45,
        rankCap: RARITY_RANK[gouffre.rank],
      }),
    ).toBe(RARITY_RANK[gouffre.rank]);
    // Et le joueur reste le plafond, quel que soit le palier.
    const infini = tier('infini');
    expect(
      familiarRankRef({
        level: infini.dropLevel,
        playerLevel: 30,
        rankCap: RARITY_RANK[infini.rank],
      }),
    ).toBe(prestigeRankIndex(30));
  });

  it('un familier du Labyrinthe ne dépasse jamais le rang du joueur + 1', () => {
    for (const L of [5, 20, 30, 45, 60, 80]) {
      const rng = mulberry32(L * 13);
      for (const t of LABYRINTHS) {
        for (let i = 0; i < 400; i++) {
          const f = rollFamiliar(rng, FAMILIAR_SPECIES[i % FAMILIAR_SPECIES.length]!, {
            level: t.dropLevel,
            luck: 1,
            playerLevel: L,
            rankCap: RARITY_RANK[t.rank],
          });
          expect(RARITY_RANK[f.rarity], `${t.id} niveau ${L}`).toBeLessThanOrEqual(
            Math.min(prestigeRankIndex(L), RARITY_RANK[t.rank]) + 1,
          );
        }
      }
    }
  });

  it('les TALENTS suivent la même règle', () => {
    const rng = mulberry32(5);
    const o = offsets(
      () =>
        RARITY_RANK[talentRankOf(rollTalentDrop(rng, { level: 28, luck: 0.6, playerLevel: 30 }))],
      prestigeRankIndex(28),
      8000,
    );
    expect(o.get(0)!).toBeGreaterThan(0.55);
    for (const d of o.keys()) expect(d).toBeLessThanOrEqual(1);
  });

  it('au sommet de l’échelle, le rang au-dessus ne sort pas de l’échelle', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 3000; i++)
      expect(RANK_ORDER).toContain(rollCompanionTier(rng, RANK_ORDER.length - 1, 1).rank);
  });

  it('une rareté IMPOSÉE reste imposée', () => {
    const rng = mulberry32(1);
    const f = rollFamiliar(rng, FAMILIAR_SPECIES[0]!, {
      level: 5,
      playerLevel: 5,
      rarity: 'mythique',
    });
    expect(f.rarity).toBe('mythique');
  });
});
