import { describe, it, expect } from 'vitest';
import { mulberry32, combatPower, TROPHY } from '@/lib/combat';
import { makeBoss } from './helpers/friendBoss';
import {
  rollTrophy,
  bestGearLoadout,
  playerWithGear,
  aggregateEffects,
  migrateGearItem,
  TROPHY_SLOT,
  TROPHY_POWERS,
  TROPHY_QUEST,
  trophyPowerOf,
  trophyQuest,
  trophyQuestLen,
  trophyPowerText,
  RELIC_POWERS,
  SET_SIGNATURES,
  STAR_JET,
  jetStar,
  gradeLabel,
  prestigeRankIndex,
  RANK_ORDER,
  WORN_SLOTS,
  SLOTS,
  FAMILIAR_SLOT,
  VOIE_SETS,
  rollSetPiece,
  type Item,
} from '@/lib/items';
import {
  FRIEND_BOSS,
  FRIEND_BOSS_CHEST,
  chestMark,
  chestState,
  friendBossChest,
  type FriendBoss,
} from '@/lib/friendBoss';
import { bossGoldForLevel, bossSummonCost } from '@/data/bosses';
import { gearedBuild } from './helpers/gearedFighter';

const H = 3600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 8, 14, 10);

const boss = (over: Partial<FriendBoss> = {}): FriendBoss =>
  makeBoss({
    createdAt: T0,
    startAt: T0,
    defeatedAt: T0 + 7 * D, // abattu à la toute fin : aucun bonus « tué tôt »
    damage: 300,
    ...over,
  });

describe('🏆 TROPHÉE — rang et étoiles (v0.894)', () => {
  const draw = (level: number, n = 4000, luck = 0) => {
    const rng = mulberry32(level * 31 + 7);
    const stars = [0, 0, 0, 0, 0];
    const ranks = new Set<string>();
    for (let i = 0; i < n; i++) {
      const t = rollTrophy(rng, { title: 'x', level, luck });
      stars[jetStar(t.roll) - 1]!++;
      ranks.add(t.rarity);
    }
    return { stars: stars.map((s) => s / n), ranks };
  };
  it('le rang est TOUJOURS celui du joueur', () => {
    for (const L of [5, 12, 30, 55, 78]) {
      expect([...draw(L, 300).ranks]).toEqual([RANK_ORDER[prestigeRankIndex(L)]]);
    }
  });
  it('en bas du rang (★1), le trophée est ★1', () => {
    for (const L of [1, 11, 21, 51]) expect(draw(L).stars[0]).toBe(1);
  });
  it('à ★5 de son rang : ★5 six fois sur dix, jamais au-dessus de son étoile', () => {
    for (const L of [10, 30, 60]) {
      const { stars } = draw(L);
      expect(stars[4]!).toBeCloseTo(STAR_JET.top, 1);
      expect(stars[3]!).toBeGreaterThan(stars[2]!); // plus proche de son étoile = plus fréquent
    }
    // Joueur ★3 (niveau 25) : jamais ★4 ni ★5.
    const s3 = draw(25).stars;
    expect(s3[3]! + s3[4]!).toBe(0);
    expect(s3[2]!).toBeCloseTo(STAR_JET.top, 1);
  });
  it('gradeLabel l’écrit en rang et étoiles — comme un familier depuis la v0.907', () => {
    const t = rollTrophy(mulberry32(3), { title: 'x', level: 30 });
    expect(gradeLabel(t)).toMatch(/★/);
    expect(gradeLabel({ ...t, slot: 'familiar' })).toBe(gradeLabel(t));
    expect(gradeLabel({ rarity: t.rarity })).not.toMatch(/★/);
  });
});

// ⚠️ SETS SPÉCIALISÉS (2026-09-22, spec § 5) : le trophée ne porte PLUS de stats — un
// POUVOIR, dont la QUÊTE suit le geste d'une voie. Les tables de stats par famille d'exo
// (`TROPHY_MAINS`, `TROPHY_SUPPORT`, `TROPHY_FAMILY_K`) sont retirées avec leurs tests :
// leur sujet n'existe plus (même politique que `garrisonCombatant`, v0.777).
describe('🏆 TROPHÉE — un pouvoir, pas des stats', () => {
  it('huit pouvoirs, un par voie, une famille d’effet chacun', () => {
    expect(TROPHY_POWERS).toHaveLength(8);
    const voies = TROPHY_POWERS.map((p) => p.voie);
    expect(new Set(voies).size).toBe(8);
    expect(new Set(TROPHY_POWERS.map((p) => p.id)).size).toBe(8);
    // Chaque voie de set a son pouvoir de trophée (et réciproquement).
    expect([...voies].sort()).toEqual(VOIE_SETS.map((s) => s.id.slice(5)).sort());
  });

  it('⚠️ aucun nom déjà pris par une signature de set ou un pouvoir de relique', () => {
    // Deux « Transe » ou deux « Carapace » dans le même combat ne se distinguent plus.
    const pris = new Set([
      ...RELIC_POWERS.map((p) => p.name),
      ...Object.values(SET_SIGNATURES).map((s) => s.name),
    ]);
    for (const p of TROPHY_POWERS) expect(pris.has(p.name), p.name).toBe(false);
  });

  it('le tirage donne un pouvoir et AUCUNE stat', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 40; i++) {
      const t = rollTrophy(rng, { title: 'Pompes', level: 40 });
      expect(t.slot).toBe(TROPHY_SLOT);
      expect(trophyPowerOf(t.power)).toBeDefined();
      expect(t.effect.value).toBe(0);
      expect(t.effect2).toBeUndefined();
      expect(t.effect3).toBeUndefined();
      expect(t.legendary).toBeUndefined();
      // Rien n'entre dans les stats agrégées.
      expect(aggregateEffects({ [TROPHY_SLOT]: { ...t, id: 't' } })).toEqual(aggregateEffects({}));
    }
  });

  it('les huit pouvoirs tombent (aucun lien avec l’exo du boss)', () => {
    const rng = mulberry32(11);
    const vus = new Set<string>();
    for (let i = 0; i < 400; i++) vus.add(rollTrophy(rng, { title: 'x', level: 40 }).power!);
    expect(vus.size).toBe(8);
  });

  it('rang et étoiles RACCOURCISSENT la quête — et ne changent rien d’autre', () => {
    const bas = trophyQuestLen({ rarity: RANK_ORDER[0]!, roll: 0 });
    const haut = trophyQuestLen({ rarity: RANK_ORDER.at(-1)!, roll: 1 });
    expect(bas).toBe(TROPHY_QUEST.long);
    expect(haut).toBe(TROPHY_QUEST.court);
    // Monotone : jamais plus longue à rang ou étoile supérieurs.
    let prev = Infinity;
    for (const r of RANK_ORDER)
      for (const roll of [0, 0.25, 0.5, 0.75, 1]) {
        const len = trophyQuestLen({ rarity: r, roll });
        expect(len).toBeLessThanOrEqual(prev);
        prev = len;
      }
  });

  it('⚠️ le COÛT du pouvoir change la longueur : annuler un tour ne se paie pas comme frapper', () => {
    // Mesuré : au même rythme, « annuler » valait +37 % de combat et « achever » +0,2 %.
    const base = { rarity: RANK_ORDER[3]!, roll: 0.5 };
    const len = (id: string) => trophyQuestLen({ ...base, power: id });
    expect(len('annuler')).toBeGreaterThan(len('achever'));
    expect(len('retourner')).toBeGreaterThan(len('etaler'));
    // Deux pouvoirs de coût différent ne peuvent pas rendre la même quête.
    expect(new Set(TROPHY_POWERS.map((p) => len(p.id))).size).toBeGreaterThan(1);
  });

  it('la VOIE PORTÉE fait avancer la quête deux fois plus vite', () => {
    const t: Item = { ...rollTrophy(mulberry32(3), { title: 'x', level: 40 }), id: 't' };
    const p = trophyPowerOf(t.power)!;
    expect(trophyQuest(t, p.voie)?.fast).toBe(true);
    expect(trophyQuest(t, 'une_autre')?.fast).toBeUndefined();
    expect(trophyQuest(t, null)?.fast).toBeUndefined();
    expect(trophyQuest(undefined, p.voie)).toBeUndefined();
  });

  it('le combattant du héros porte la quête, et la voie vient du SET porté', () => {
    const rng = mulberry32(5);
    const gardien = VOIE_SETS.find((s) => s.id === 'voie:gardien')!;
    const mur = TROPHY_POWERS.find((p) => p.voie === 'gardien')!;
    const t: Item = { ...rollTrophy(rng, { title: 'x', level: 40 }), power: mur.id, id: 't' };
    const stats = { puissance: 30, endurance: 30, agilite: 30 };
    const piece = (slot: 'weapon' | 'armor'): Item => ({
      ...rollSetPiece(rng, { setId: gardien.id, level: 40, preferSlot: slot, playerLevel: 40 }),
      id: 'p' + slot,
    });
    const nu = playerWithGear('g', stats, { trophy: t }, {}, 40);
    expect(nu.trophy).toEqual({ id: mur.id, len: trophyQuestLen(t) });
    const enGardien = playerWithGear(
      'g',
      stats,
      { trophy: t, weapon: piece('weapon'), armor: piece('armor') },
      {},
      40,
    );
    expect(enGardien.trophy?.fast).toBe(true);
  });

  it('un trophée d’avant la refonte reçoit un pouvoir, garde le sien, et perd ses stats', () => {
    const vieux: Item = {
      id: 'vieux',
      slot: TROPHY_SLOT,
      name: 'Trophée · Pompes',
      emoji: '🏆',
      rarity: 'epique',
      level: 40,
      roll: 0.5,
      effect: { type: 'damage_pct', value: 12 },
      effect2: { type: 'crit_dmg_pct', value: 20 },
    };
    const m = migrateGearItem(vieux);
    expect(trophyPowerOf(m.power)).toBeDefined();
    expect(m.effect.value).toBe(0);
    expect(m.effect2).toBeUndefined();
    expect(migrateGearItem(m)).toEqual(m); // idempotent
    // Le pouvoir est tiré sur l'ID : le même trophée reçoit toujours le même.
    expect(migrateGearItem({ ...vieux }).power).toBe(m.power);
    const autre = migrateGearItem({ ...vieux, id: 'autre' });
    expect(TROPHY_POWERS.some((p) => p.id === autre.power)).toBe(true);
  });

  it('son texte dit le geste, sa longueur et l’effet', () => {
    const t = rollTrophy(mulberry32(3), { title: 'x', level: 40 });
    const p = trophyPowerOf(t.power)!;
    const txt = trophyPowerText(t);
    expect(txt).toContain(p.name);
    expect(txt).toContain(p.quest);
    expect(txt).toContain(String(trophyQuestLen(t)));
    expect(trophyPowerText({ ...t, power: undefined })).toBe('');
  });

  it('WORN_SLOTS couvre les 4 emplacements, le familier et le trophée', () => {
    expect(WORN_SLOTS).toEqual([...SLOTS, FAMILIAR_SLOT, TROPHY_SLOT]);
  });
});

const geared = (L: number, seed: number) => gearedBuild(L, seed, false, false);
const realistic = (L: number, seed: number) => gearedBuild(L, seed, true, false);

describe('🏆 TROPHÉE — l’optimiseur le voit', () => {
  it('garde le trophée porté et prend un meilleur trophée du sac', () => {
    const L = 40;
    const { stats, eq, inv } = geared(L, 1);
    const rng = mulberry32(21);
    const trophies = Array.from({ length: 12 }, (_, i) => ({
      ...rollTrophy(rng, { title: 'x', level: L }),
      id: 'tr' + i,
    }));
    const power = (e: typeof eq) => combatPower(playerWithGear('g', stats, e, {}, L));
    const ranked = [...trophies].sort(
      (a, b) => power({ ...eq, trophy: a }) - power({ ...eq, trophy: b }),
    );
    const worn = { ...eq, [TROPHY_SLOT]: ranked[0]! };
    const out = bestGearLoadout('g', stats, worn, [...inv, ...ranked.slice(1)], L);
    // Le trophée retenu est le meilleur POUR le build retenu (l'optimiseur change aussi le
    // reste, et la valeur d'un pouvoir dépend de ce reste).
    const best = Math.max(...trophies.map((t) => power({ ...out, trophy: t })));
    expect(power({ ...out, trophy: out[TROPHY_SLOT]! })).toBeCloseTo(best, 6);
    // Sans rien au sac, l'optimiseur ne le retire jamais.
    const kept = bestGearLoadout('g', stats, worn, inv, L);
    expect(kept[TROPHY_SLOT]?.id).toBe(ranked[0]!.id);
  });

  it('un trophée à quête COURTE vaut plus qu’un à quête longue', () => {
    // C'est la seule chose que le rang et les étoiles changent : la fréquence.
    const L = 40;
    const { stats, eq } = geared(L, 1);
    const base = rollTrophy(mulberry32(9), { title: 'x', level: L });
    const power = (t: Item) => combatPower(playerWithGear('g', stats, { ...eq, trophy: t }, {}, L));
    const court: Item = { ...base, rarity: RANK_ORDER.at(-1)!, roll: 1, id: 'c' };
    const long: Item = { ...base, rarity: RANK_ORDER[0]!, roll: 0, id: 'l' };
    expect(trophyQuestLen(court)).toBeLessThan(trophyQuestLen(long));
    expect(power(court)).toBeGreaterThan(power(long));
  });

  it('ajoute un bonus mesurable mais modeste à un build complet', () => {
    // ⚠️ Le trophée reste un BONUS (spec § 5.3) : un joueur sans amis ne doit pas être en
    // retard. Mesuré sur le joueur qui existe (objets + familiers + talents).
    for (const L of [30, 90]) {
      const gains: number[] = [];
      for (let seed = 1; seed <= 2; seed++) {
        const { stats, eq, fx } = realistic(L, seed);
        const base = combatPower(playerWithGear('g', stats, eq, fx, L));
        const rng = mulberry32(seed * 31 + L);
        for (let i = 0; i < 24; i++) {
          const t = { ...rollTrophy(rng, { title: 'x', level: L }), id: 't' };
          gains.push(
            combatPower(playerWithGear('g', stats, { ...eq, trophy: t }, fx, L)) / base - 1,
          );
        }
      }
      gains.sort((a, b) => a - b);
      const med = gains[Math.floor(gains.length / 2)]!;
      expect(med, `niveau ${L}`).toBeGreaterThan(0.01);
      expect(med, `niveau ${L}`).toBeLessThan(0.09);
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
    expect(trophyPowerOf(c.trophy.power)).toBeDefined();
  });

  it('tué tôt, il rapporte plus d’or, de pierres et de chance au trophée', () => {
    const tard = friendBossChest(boss(), 'u', 40);
    const tot = friendBossChest(boss({ defeatedAt: T0 + 2 * D }), 'u', 40);
    expect(tot.early).toBeCloseTo(5 / 7, 6);
    expect(tot.gold).toBeGreaterThan(tard.gold);
    expect(tot.stones).toBeGreaterThan(tard.stones);
    // ⚠️ v0.894 : le rang du trophée est celui du joueur ; la chance relève ses ÉTOILES — et
    // les étoiles RACCOURCISSENT la quête (sets spécialisés) : tuer tôt donne un trophée qui
    // se déclenche plus souvent.
    const fives = (early: number) => {
      let n = 0;
      for (let i = 0; i < 400; i++) {
        const t = friendBossChest(
          boss({ id: 'b' + i, defeatedAt: T0 + 7 * D * (1 - early) }),
          'u',
          40,
        ).trophy;
        if (jetStar(t.roll) === 5) n++;
      }
      return n / 400;
    };
    expect(fives(1)).toBeGreaterThan(fives(0) + 0.1);
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

describe('🏆 quête — ce que le texte promet est ce que le combat fait', () => {
  it('TROPHY.spreadTurns est ce que « étaler » annonce', () => {
    const etaler = TROPHY_POWERS.find((p) => p.id === 'etaler')!;
    expect(etaler.effect).toContain(String(TROPHY.spreadTurns));
  });
});
