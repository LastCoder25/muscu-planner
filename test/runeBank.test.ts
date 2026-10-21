import { describe, expect, it } from 'vitest';
import {
  AWAKEN_RUNE_COUNT,
  REFUND_PER_LEVEL,
  RUNE_LOT,
  RUNE_ODDS,
  ascensionRuneCount,
  bestFusePick,
  fusePick,
  emptyBank,
  fuseAllSkills,
  fuseBlocker,
  fuseGroupText,
  fuseSkills,
  giveBlocker,
  giveKind,
  giveSkill,
  legacyRefund,
  normalizeRuneBank,
  openBlocker,
  openRune,
  openRunes,
  placeRuneCount,
  stackSkills,
  type GiveKind,
  type RuneBank,
  type StockSkill,
} from '@/lib/runeBank';
import { RUNE_TIERS, SKILLS, skillsOfTier } from '@/lib/skillRunes';

const bank = (runes: number, skills: StockSkill[] = []): RuneBank => ({
  runes,
  skills,
  opened: skills.length,
  comp: 2,
});
const sk = (uid: string, id: StockSkill['id'], level = 1): StockSkill => ({ uid, id, level });

describe('table unique', () => {
  it('somme 1, et vaut la table de la spec (70 / 22 / 7 / 1)', () => {
    const sum = RUNE_TIERS.reduce((n, t) => n + RUNE_ODDS[t], 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(RUNE_ODDS).toEqual({ green: 0.7, blue: 0.22, violet: 0.07, gold: 0.01 });
  });

  it('l’ouverture suit la table (20 000 tirages)', () => {
    const count = { green: 0, blue: 0, violet: 0, gold: 0 };
    for (let i = 1; i <= 20000; i++) count[SKILLS[openRune('j', i).id].tier]++;
    for (const t of RUNE_TIERS) expect(count[t] / 20000).toBeCloseTo(RUNE_ODDS[t], 1);
    expect(count.gold).toBeGreaterThan(100);
  });

  it('toutes les compétences d’une couleur sortent', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 4000; i++) seen.add(openRune('j', i).id);
    for (const t of ['green', 'blue', 'violet'] as const)
      for (const id of skillsOfTier(t)) expect(seen.has(id)).toBe(true);
  });

  it('déterministe : même joueur et même numéro, même compétence ; niveau 1', () => {
    expect(openRune('a', 7)).toEqual(openRune('a', 7));
    expect(openRune('a', 7).level).toBe(1);
    const differ = [1, 2, 3, 4, 5, 6, 7, 8].some(
      (n) => openRune('a', n).id !== openRune('b', n).id,
    );
    expect(differ).toBe(true);
  });
});

describe('ouvrir', () => {
  it('une rune : −1 rune, +1 compétence, compteur avancé', () => {
    const r = openRunes(bank(3), 'j', 1)!;
    expect(r.bank.runes).toBe(2);
    expect(r.bank.skills).toHaveLength(1);
    expect(r.bank.opened).toBe(1);
    expect(r.opened[0]).toEqual(openRune('j', 1));
  });

  it('un lot : 9 runes pour 10 compétences', () => {
    expect(RUNE_LOT).toEqual({ size: 10, cost: 9 });
    const r = openRunes(bank(9), 'j', 10)!;
    expect(r.bank.runes).toBe(0);
    expect(r.opened).toHaveLength(10);
    expect(new Set(r.bank.skills.map((s) => s.uid)).size).toBe(10);
  });

  it('refuse sans assez de runes, et toute autre taille qu’1 ou 10', () => {
    expect(openBlocker(bank(0), 1)).toBe('none');
    expect(openBlocker(bank(8), 10)).toBe('none');
    expect(openBlocker(bank(9), 10)).toBeNull();
    expect(openBlocker(bank(50), 5)).toBe('lot');
    expect(openRunes(bank(8), 'j', 10)).toBeNull();
  });

  it('deux ouvertures successives ne rejouent pas le même tirage', () => {
    const a = openRunes(bank(2), 'j', 1)!;
    const b = openRunes(a.bank, 'j', 1)!;
    expect(b.opened[0]!.uid).not.toBe(a.opened[0]!.uid);
    expect(b.opened[0]).toEqual(openRune('j', 2));
  });
});

describe('fusionner au choix', () => {
  it('les niveaux s’additionnent, le plus haut garde sa place, les autres disparaissent', () => {
    const r = fuseSkills(
      bank(0, [sk('a', 'crit', 1), sk('b', 'crit', 2), sk('c', 'pv'), sk('d', 'crit', 1)]),
      ['a', 'b', 'd'],
    )!;
    expect(r.bank.skills).toEqual([sk('b', 'crit', 4), sk('c', 'pv')]);
    expect(r.group).toEqual({ id: 'crit', up: 0, before: [2, 1, 1], after: [4] });
  });

  it('une partie seulement : les exemplaires non choisis restent au stock', () => {
    const six = [1, 2, 3, 4, 5, 6].map((i) => sk('s' + i, 'speed', 1));
    const r = fuseSkills(bank(0, six), ['s1', 's2', 's3'])!;
    expect(r.bank.skills.map((s) => [s.uid, s.level])).toEqual([
      ['s1', 3],
      ['s4', 1],
      ['s5', 1],
      ['s6', 1],
    ]);
  });

  it('refuse moins de deux, au-delà de 5, deux compétences différentes, un absent', () => {
    const b = bank(0, [sk('a', 'crit', 3), sk('b', 'crit', 3), sk('c', 'pv'), sk('d', 'crit', 2)]);
    expect(fuseBlocker(b, ['a'])).toBe('few');
    expect(fuseBlocker(b, ['a', 'a'])).toBe('few');
    expect(fuseBlocker(b, ['a', 'b'])).toBe('over');
    expect(fuseBlocker(b, ['a', 'd'])).toBeNull();
    expect(fuseBlocker(b, ['a', 'c'])).toBe('different');
    expect(fuseBlocker(b, ['a', 'z'])).toBe('missing');
    expect(fuseSkills(b, ['a', 'b'])).toBeNull();
  });
});

describe('choisir tout ou partie', () => {
  it('ajoute à l’exemplaire choisi le nombre demandé par niveau, borné au stock', () => {
    const b = bank(0, [
      sk('a', 'speed'),
      sk('b', 'speed'),
      sk('c', 'speed', 2),
      sk('d', 'speed'),
      sk('x', 'pv'),
    ]);
    const r = fusePick(b, 'a', { 1: 9, 2: 0 });
    expect(r.rows).toEqual([
      { level: 2, count: 1, take: 0 },
      { level: 1, count: 2, take: 2 },
    ]);
    expect(r.uids).toEqual(['a', 'b', 'd']);
    expect(r.total).toBe(3);
    expect(fusePick(b, 'a', { 2: 1 }).uids).toEqual(['a', 'c']);
    expect(fusePick(b, 'z', {})).toEqual({ rows: [], uids: [], total: 0 });
  });
});

describe('jusqu’au plus haut', () => {
  /** Les exemplaires que « Jusqu’au plus haut » retient, comme l’écran les fusionne. */
  const bestUids = (b: RuneBank, uid: string) => fusePick(b, uid, bestFusePick(b, uid).take).uids;

  it('vise le plus haut niveau atteignable, pas le premier qui tient', () => {
    // 1 + 3 = 4 en prenant le plus gros d'abord ; 1 + 2 + 2 = 5 existe.
    const b = bank(0, [
      sk('a', 'crit', 1),
      sk('b', 'crit', 3),
      sk('c', 'crit', 2),
      sk('d', 'crit', 2),
    ]);
    const pick = bestUids(b, 'a');
    expect(pick[0]).toBe('a');
    expect(new Set(pick)).toEqual(new Set(['a', 'c', 'd']));
  });

  it('à niveau égal, le moins d’exemplaires ; jamais une autre compétence', () => {
    const b = bank(0, [sk('a', 'pv', 1), sk('b', 'pv', 4), sk('c', 'pv', 1), sk('x', 'crit', 1)]);
    expect(bestUids(b, 'a')).toEqual(['a', 'b']);
    expect(bestUids(b, 'z')).toEqual([]);
    expect(bestFusePick(b, 'a').total).toBe(5);
    // 1 + 2 + 2 et 1 + 2 + 1 + 1 font tous deux 5 : on garde le moins d’exemplaires.
    const tie = bank(0, [
      sk('s', 'pv', 1),
      sk('t', 'pv', 2),
      sk('u', 'pv', 2),
      sk('v', 'pv'),
      sk('w', 'pv'),
    ]);
    expect(bestUids(tie, 's')).toEqual(['s', 't', 'u']);
  });

  it('sept Nv 1 : en prend cinq, le choisi compris', () => {
    const seven = [1, 2, 3, 4, 5, 6, 7].map((i) => sk('s' + i, 'speed', 1));
    const pick = bestUids(bank(0, seven), 's4');
    expect(pick).toHaveLength(5);
    expect(pick[0]).toBe('s4');
    expect(fuseBlocker(bank(0, seven), pick)).toBeNull();
  });
});

describe('tout fusionner', () => {
  it('six Nv 1 deviennent un Nv 5 et un Nv 1 : de quoi préparer le prochain champion', () => {
    const six = [1, 2, 3, 4, 5, 6].map((i) => sk('s' + i, 'speed', 1));
    const r = fuseAllSkills(bank(0, [...six, sk('p', 'pv', 2)]));
    expect(r.bank.skills).toEqual([sk('s1', 'speed', 5), sk('s6', 'speed', 1), sk('p', 'pv', 2)]);
    expect(r.groups).toEqual([{ id: 'speed', up: 0, before: [1, 1, 1, 1, 1, 1], after: [5, 1] }]);
  });

  it('les plus hauts niveaux d’abord, jamais au-delà de 5 ni écrêtés', () => {
    const r = fuseAllSkills(
      bank(0, [sk('a', 'crit', 3), sk('b', 'crit', 2), sk('c', 'crit', 3), sk('d', 'crit', 2)]),
    );
    expect(r.groups[0]!.after).toEqual([5, 5]);
    const total = r.bank.skills.reduce((t, s) => t + s.level, 0);
    expect(total).toBe(10);
    expect(r.bank.skills.every((s) => s.level <= 5)).toBe(true);
  });

  it('une seule compétence si on la nomme ; rien à fusionner = stock inchangé', () => {
    const b = bank(0, [sk('a', 'crit'), sk('b', 'crit'), sk('c', 'pv'), sk('d', 'pv')]);
    const r = fuseAllSkills(b, 'pv');
    expect(r.bank.skills).toEqual([sk('a', 'crit'), sk('b', 'crit'), sk('c', 'pv', 2)]);
    const full = bank(0, [sk('a', 'crit', 5), sk('b', 'crit', 5), sk('c', 'pv')]);
    expect(fuseAllSkills(full)).toEqual({ bank: full, groups: [] });
  });

  it('se lit « 7 × Nv 1 → Nv 5 · Nv 2 » ; le stock s’empile par compétence et niveau', () => {
    expect(fuseGroupText({ id: 'speed', before: [1, 1, 1, 1, 1, 1, 1], after: [5, 2] })).toBe(
      '7 × Nv 1 → Nv 5 · Nv 2',
    );
    expect(fuseGroupText({ id: 'crit', before: [3, 1, 1], after: [5] })).toBe(
      'Nv 3 + 2 × Nv 1 → Nv 5',
    );
    const st = stackSkills([sk('a', 'crit'), sk('b', 'pv'), sk('c', 'crit'), sk('d', 'crit', 2)]);
    expect(st.map((s) => [s.uid, s.count])).toEqual([
      ['a', 2],
      ['b', 1],
      ['d', 1],
    ]);
  });
});

describe('donner à un champion', () => {
  const c = (skills: { id: StockSkill['id']; level: number }[], slots = 3, rankIndex = 3) => ({
    skills,
    slots,
    rankIndex,
  });

  it('nouvelle compétence dans une place libre, à son niveau', () => {
    const r = giveSkill(bank(0, [sk('a', 'crit', 2)]), 'a', c([{ id: 'pv', level: 1 }]))!;
    expect(r.skills).toEqual([
      { id: 'pv', level: 1 },
      { id: 'crit', level: 2 },
    ]);
    expect(r.bank.skills).toEqual([]);
  });

  it('compétence déjà portée : les niveaux s’additionnent, refus au-delà de 5', () => {
    const b = bank(0, [sk('a', 'crit', 2)]);
    expect(giveSkill(b, 'a', c([{ id: 'crit', level: 3 }]))!.skills).toEqual([
      { id: 'crit', level: 5 },
    ]);
    expect(giveBlocker(b, 'a', c([{ id: 'crit', level: 4 }]))).toBe('over');
  });

  it('champion plein : il faut choisir quoi remplacer, l’ancienne est perdue', () => {
    const b = bank(0, [sk('a', 'crit', 2)]);
    const full = c(
      [
        { id: 'pv', level: 3 },
        { id: 'damage', level: 1 },
      ],
      2,
    );
    expect(giveBlocker(b, 'a', full)).toBe('full');
    expect(giveBlocker(b, 'a', full, 5)).toBe('full');
    expect(giveSkill(b, 'a', full, 0)!.skills).toEqual([
      { id: 'crit', level: 2 },
      { id: 'damage', level: 1 },
    ]);
  });

  it('annonce ce que le don ferait (pastille de l’écran)', () => {
    expect(giveKind(c([]), { id: 'crit' })).toBe('new');
    expect(giveKind(c([{ id: 'crit', level: 1 }]), { id: 'crit' })).toBe('stack');
    const full = c(
      [
        { id: 'pv', level: 1 },
        { id: 'damage', level: 1 },
      ],
      2,
    );
    const kind: GiveKind = giveKind(full, { id: 'crit' });
    expect(kind).toBe('replace');
  });

  it('⚠️ toute couleur se donne à tout champion, même Bronze — et refuse hors champion', () => {
    const b = bank(0, [sk('a', 'crit'), sk('g', 'plunder')]);
    expect(giveBlocker(b, 'a', c([], 3, 0))).toBeNull();
    expect(giveBlocker(b, 'g', c([], 3, 0))).toBeNull();
    expect(giveSkill(b, 'g', c([], 3, 0), null)).not.toBeNull();
    expect(giveBlocker(b, 'a', c([], 0, 3))).toBe('missing');
  });
});

describe('quantités par source', () => {
  it('lieux : 1 à ton rang ou dessous, 2 au-dessus, 3 pour une faille mûre au-dessus', () => {
    expect(placeRuneCount({ placeRankIndex: 2, playerRankIndex: 3 })).toBe(1);
    expect(placeRuneCount({ placeRankIndex: 3, playerRankIndex: 3 })).toBe(1);
    expect(placeRuneCount({ placeRankIndex: 4, playerRankIndex: 3 })).toBe(2);
    expect(placeRuneCount({ placeRankIndex: 4, playerRankIndex: 3, riftMature: true })).toBe(3);
    expect(placeRuneCount({ placeRankIndex: 3, playerRankIndex: 3, riftMature: true })).toBe(1);
  });

  it('ascension : 1 jusqu’à l’Or noir, 2 de Légendaire à Divin, 3 au-delà ; Éveil par lettre', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(ascensionRuneCount)).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3,
    ]);
    expect(AWAKEN_RUNE_COUNT).toEqual({ A: 1, S: 2, X: 3 });
  });
});

describe('relecture et migration', () => {
  it('relecture défensive : ids inconnus, doublons, niveaux hors bornes', () => {
    const b = normalizeRuneBank({
      runes: 3.7,
      opened: -2,
      skills: [
        sk('a', 'crit', 9),
        sk('a', 'pv'),
        { uid: 'x', id: 'nope', level: 1 },
        sk('b', 'pv', 0),
      ],
    });
    expect(b).toEqual({
      runes: 3,
      blessed: 0,
      exalted: 0,
      opened: 0,
      comp: 0,
      skills: [sk('a', 'crit', 5), sk('b', 'pv', 1)],
    });
    // Sans version : pas encore basculé (c'est `migrateLegacyRunes` qui la pose).
    expect(normalizeRuneBank(null)).toEqual({ ...emptyBank(), comp: 0 });
  });

  it('rembourse chaque niveau selon sa couleur, le stock coloré et la rune en attente', () => {
    expect(REFUND_PER_LEVEL).toEqual({ green: 1, blue: 2, violet: 3, gold: 5 });
    const n = legacyRefund(
      [
        [
          { id: 'speed', level: 3 },
          { id: 'crit', level: 2 },
        ],
        [{ id: 'plunder', level: 1 }],
      ],
      { green: 2, blue: 1, violet: 0, gold: 1 },
      'blue',
    );
    // 3×1 + 2×3 + 1×5 = 14 · stock 2 + 2 + 5 = 9 · attente 2
    expect(n).toBe(25);
  });
});
