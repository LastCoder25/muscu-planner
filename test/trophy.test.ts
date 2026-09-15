import { describe, it, expect } from 'vitest';
import { mulberry32, combatPower } from '@/lib/combat';
import {
  rollDrop,
  rollTrophy,
  bestGearLoadout,
  playerWithGear,
  aggregateEffects,
  affixCountForRarity,
  effectBase,
  itemLevelMult,
  rankRollMult,
  TROPHY_K,
  TROPHY_SLOT,
  WORN_SLOTS,
  SLOTS,
  FAMILIAR_SLOT,
  type Item,
} from '@/lib/items';
import { refBalancedStat } from '@/lib/proceduralContent';
import {
  FRIEND_BOSS,
  FRIEND_BOSS_CHEST,
  TROPHY_MAINS,
  chestMark,
  chestState,
  friendBossChest,
  type BossFamily,
  type FriendBoss,
} from '@/lib/friendBoss';
import { bossGoldForLevel, bossSummonCost } from '@/data/bosses';

const H = 3600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 8, 14, 10);
const FAMILIES = Object.keys(TROPHY_MAINS) as BossFamily[];

function boss(over: Partial<FriendBoss> = {}): FriendBoss {
  return {
    id: 'b1',
    ownerId: 'u1',
    family: 'push',
    exerciseId: 'ex_pushup',
    exerciseName: 'Pompes',
    repWeight: 1,
    createdAt: T0,
    startAt: T0,
    defeatedAt: T0 + 7 * D, // abattu à la toute fin : aucun bonus « tué tôt »
    hpTotal: 300,
    damage: 300,
    ...over,
  };
}

describe('🏆 TROPHÉE — tirage', () => {
  it('va dans l’emplacement trophée, porte l’affixe principal de sa famille et aucun proc', () => {
    const rng = mulberry32(7);
    for (const f of FAMILIES) {
      for (let i = 0; i < 30; i++) {
        const t = rollTrophy(rng, { mains: TROPHY_MAINS[f], title: 'Pompes', level: 60 });
        expect(t.slot).toBe(TROPHY_SLOT);
        expect(t.name).toContain('Pompes');
        expect(t.legendary).toBeUndefined();
        const types = [t.effect, t.effect2, t.effect3].filter(Boolean).map((e) => e!.type);
        expect(types.slice(0, TROPHY_MAINS[f].length)).toEqual([...TROPHY_MAINS[f]]);
        expect(new Set(types).size).toBe(types.length); // jamais deux fois la même stat
      }
    }
  });

  it('a autant d’affixes qu’un drop de sa rareté (au moins ses affixes imposés)', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const t = rollTrophy(rng, { mains: TROPHY_MAINS.push, title: 'x', level: 70 });
      const n = [t.effect, t.effect2, t.effect3].filter(Boolean).length;
      expect(n).toBe(affixCountForRarity(t.rarity));
    }
    const c = rollTrophy(mulberry32(3), { mains: TROPHY_MAINS.conditioning, title: 'x', level: 1 });
    expect([c.effect, c.effect2].map((e) => e!.type)).toEqual(['momentum_pct', 'initiative_pct']);
  });

  it('vaut TROPHY_K × un drop de même rareté et même jet (jamais la valeur pleine)', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const t = rollTrophy(rng, { mains: TROPHY_MAINS.legs, title: 'x', level: 40 });
      const full = effectBase('max_pv_pct') * rankRollMult(t.rarity, t.roll);
      expect(t.effect.value).toBeCloseTo(full * TROPHY_K, 1);
    }
  });

  it('compte au combat comme un objet : valeur × niveau d’objet', () => {
    const t = {
      ...rollTrophy(mulberry32(9), { mains: TROPHY_MAINS.push, title: 'x', level: 30 }),
      id: 't',
    };
    const withIt = aggregateEffects({ [TROPHY_SLOT]: t });
    const lm = itemLevelMult(t.level);
    const expected = [t.effect, t.effect2, t.effect3]
      .filter((e) => e?.type === 'damage_pct')
      .reduce((s, e) => s + (e!.value * lm) / 100, 0);
    expect(withIt.damagePct).toBeCloseTo(expected, 6);
    expect(aggregateEffects({}).damagePct).toBe(0);
  });

  it('WORN_SLOTS couvre les 4 emplacements, le familier et le trophée', () => {
    expect(WORN_SLOTS).toEqual([...SLOTS, FAMILIAR_SLOT, TROPHY_SLOT]);
  });
});

/** Un joueur équipé de niveau L (60 drops), son build optimisé. */
function geared(L: number, seed: number) {
  const rng = mulberry32(seed * 7919 + L);
  const inv: Item[] = [];
  for (let i = 0; i < 60; i++) {
    const d = rollDrop(rng, { cleared: true, defeated: 1, level: L, luck: 0.4, playerLevel: L });
    if (d) inv.push({ ...d, id: 'i' + i });
  }
  const s = refBalancedStat(L);
  const stats = { puissance: s, endurance: s, agilite: s };
  const eq = bestGearLoadout('g', stats, {}, inv, L);
  return { stats, eq, inv };
}

describe('🏆 TROPHÉE — l’optimiseur le voit', () => {
  it('garde le trophée porté et prend un meilleur trophée du sac', () => {
    const L = 40;
    const { stats, eq, inv } = geared(L, 1);
    const rng = mulberry32(21);
    const trophies = Array.from({ length: 12 }, (_, i) => ({
      ...rollTrophy(rng, { mains: TROPHY_MAINS.push, title: 'x', level: L }),
      id: 'tr' + i,
    }));
    const power = (e: typeof eq) => combatPower(playerWithGear('g', stats, e, {}, L));
    // Le moins bon au porté, les autres au sac.
    const ranked = [...trophies].sort(
      (a, b) => power({ ...eq, trophy: a }) - power({ ...eq, trophy: b }),
    );
    const worn = { ...eq, [TROPHY_SLOT]: ranked[0]! };
    const out = bestGearLoadout('g', stats, worn, [...inv, ...ranked.slice(1)], L);
    expect(out[TROPHY_SLOT]?.id).toBe(ranked[ranked.length - 1]!.id);
    // ⚠️ AUSSI SANS la passe de polissage : c'est ainsi que `computeGearPlan` explore les
    // voies — sans elle, seul l'examen des emplacements parallèles peut trouver le trophée.
    const rough = bestGearLoadout(
      'g',
      stats,
      worn,
      [...inv, ...ranked.slice(1)],
      L,
      {},
      undefined,
      undefined,
      false,
    );
    expect(rough[TROPHY_SLOT]?.id).toBe(ranked[ranked.length - 1]!.id);
    // Sans rien au sac, l'optimiseur ne le retire jamais.
    const kept = bestGearLoadout('g', stats, worn, inv, L);
    expect(kept[TROPHY_SLOT]?.id).toBe(ranked[0]!.id);
  });

  it('ajoute un bonus mesurable mais modeste à un build complet (+1 à +8 % en médiane)', () => {
    for (const L of [30, 90]) {
      const gains: number[] = [];
      for (let seed = 1; seed <= 2; seed++) {
        const { stats, eq } = geared(L, seed);
        const base = combatPower(playerWithGear('g', stats, eq, {}, L));
        const rng = mulberry32(seed * 31 + L);
        for (const f of FAMILIES)
          for (let i = 0; i < 6; i++) {
            const t = {
              ...rollTrophy(rng, { mains: TROPHY_MAINS[f], title: 'x', level: L }),
              id: 't',
            };
            gains.push(
              combatPower(playerWithGear('g', stats, { ...eq, trophy: t }, {}, L)) / base - 1,
            );
          }
      }
      gains.sort((a, b) => a - b);
      const med = gains[Math.floor(gains.length / 2)]!;
      expect(med).toBeGreaterThan(0.01);
      expect(med).toBeLessThan(0.08);
    }
  });
});

describe('🎁 COFFRE DU BOSS ENTRE AMIS', () => {
  it('est le même pour un même boss et un même joueur, différent d’un joueur à l’autre', () => {
    const b = boss();
    const a1 = friendBossChest(b, 'alice', 30);
    const a2 = friendBossChest(b, 'alice', 30);
    expect(a2).toEqual(a1);
    const others = ['bob', 'chloe', 'dan', 'eve'].map((u) => friendBossChest(b, u, 30).trophy);
    expect(others.some((t) => JSON.stringify(t) !== JSON.stringify(a1.trophy))).toBe(true);
  });

  it('paie comme deux boss de palier du niveau du joueur, sans bonus s’il meurt à la fin', () => {
    const c = friendBossChest(boss(), 'u', 28);
    expect(c.early).toBe(0);
    expect(c.gold).toBe(Math.round((bossGoldForLevel(28) * FRIEND_BOSS_CHEST.bosses) / 10) * 10);
    expect(c.stones).toBe(bossSummonCost(28) * FRIEND_BOSS_CHEST.bosses);
    expect(c.trophy.name).toContain('Pompes');
  });

  it('tué tôt, il rapporte plus d’or, de pierres et de chance au trophée', () => {
    const tard = friendBossChest(boss(), 'u', 40);
    const tot = friendBossChest(boss({ defeatedAt: T0 + 2 * D }), 'u', 40);
    expect(tot.early).toBeCloseTo(5 / 7, 6);
    expect(tot.gold).toBeGreaterThan(tard.gold);
    expect(tot.stones).toBeGreaterThan(tard.stones);
    // La chance déplace la rareté vers le haut : sur beaucoup de joueurs, le rang moyen monte.
    const rank = (early: number) => {
      let sum = 0;
      for (let i = 0; i < 300; i++) {
        const t = friendBossChest(
          boss({ id: 'b' + i, defeatedAt: T0 + 7 * D * (1 - early) }),
          'u',
          40,
        ).trophy;
        sum += [
          'commun',
          'inhabituel',
          'magique',
          'rare',
          'epique',
          'legendaire',
          'mythique',
          'primordial',
        ].indexOf(t.rarity);
      }
      return sum / 300;
    };
    expect(rank(1)).toBeGreaterThan(rank(0));
  });

  it('se lit : rien, à ouvrir, ou à récupérer si le serveur l’a donné sans crédit', () => {
    const b = boss();
    const share = FRIEND_BOSS.shareUnits.push;
    const m = { status: 'accepted' as const, units: share, claimed: false };
    expect(chestState(b, m, [])).toBe('open');
    expect(chestState(b, { ...m, claimed: true }, [])).toBe('recover');
    expect(chestState(b, { ...m, claimed: true }, [chestMark(b.id)])).toBe('none');
    expect(chestState(b, m, [chestMark(b.id)])).toBe('none');
    expect(chestState(boss({ defeatedAt: null }), m, [])).toBe('none');
    expect(chestState(b, { ...m, units: share * FRIEND_BOSS.minShare - 1 }, [])).toBe('none');
    expect(chestState(b, { ...m, status: 'declined' }, [])).toBe('none');
    expect(chestState(b, null, [])).toBe('none');
  });
});
