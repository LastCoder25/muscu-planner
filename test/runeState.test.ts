import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { CHAMPIONS } from '@/data/champions';
import {
  addRunes,
  compensationRunes,
  normalizeChampSkills,
  normalizeRuneState,
  RUNE_TIERS,
  SKILL_MAX_LEVEL,
  SKILL_SLOTS,
  skillsOfTier,
  type RuneState,
} from '@/lib/skillRunes';
import { runeUseBlocker, settlePendingRune, useRune, type Adventurer } from '@/lib/adventurers';

/** 💾 L'état des runes et la pose sur un champion. */

const A = CHAMPIONS.find((c) => c.grade === 'A')!;
const champ = (over: Partial<Adventurer> = {}): Adventurer => ({
  id: 'c1', name: A.name, seed: 1, path: [], level: 25, xp: 0, championId: A.id, copies: 1, ...over,
});
const state = (over: Partial<RuneState['stock']> = {}): RuneState => ({
  stock: { green: 0, blue: 0, violet: 0, gold: 0, ...over },
  pending: null,
  comp: 1,
});

describe('💾 relecture défensive', () => {
  it('un JSONB vide ou faux donne un état propre', () => {
    for (const raw of [null, undefined, 3, 'x', {}, { stock: { green: -2, blue: 'a', gold: 2.7 } }]) {
      const s = normalizeRuneState(raw);
      for (const t of RUNE_TIERS) expect(Number.isInteger(s.stock[t]) && s.stock[t] >= 0).toBe(true);
      expect(s.pending).toBeNull();
    }
    expect(normalizeRuneState({ stock: { gold: 2.7 } }).stock.gold).toBe(2);
  });
  it('une rune en attente mal formée est écartée, une bonne est gardée', () => {
    expect(normalizeRuneState({ pending: { advId: 'a', tier: 'rose', drawn: 'pv' } }).pending).toBeNull();
    expect(normalizeRuneState({ pending: { advId: 'a', tier: 'blue', drawn: 'pv' } }).pending).toEqual({ advId: 'a', tier: 'blue', drawn: 'pv' });
  });
  it('les compétences d’un champion : inconnues et doublons écartés, niveaux bornés', () => {
    expect(normalizeChampSkills([{ id: 'pv', level: 9 }, { id: 'pv', level: 1 }, { id: 'zz', level: 1 }, { id: 'crit', level: 0 }])).toEqual([
      { id: 'pv', level: SKILL_MAX_LEVEL },
      { id: 'crit', level: 1 },
    ]);
    expect(normalizeChampSkills('x')).toEqual([]);
  });
  it('ajouter des runes ne touche pas l’état d’origine', () => {
    const s = state();
    const t = addRunes(s, ['green', 'green', 'gold']);
    expect(t.stock).toMatchObject({ green: 2, gold: 1 });
    expect(s.stock.green).toBe(0);
    expect(addRunes(s, [])).toBe(s);
  });
});

describe('🎁 la compensation', () => {
  it('une rune par ascension et par cran d’Éveil, rejouable à l’identique', () => {
    const cs = [{ id: 'a', grade: 'S' as const, ascended: 3, awaken: 2 }, { id: 'b', grade: 'A' as const, ascended: 0, awaken: 0 }];
    expect(compensationRunes(cs)).toHaveLength(5);
    expect(compensationRunes(cs)).toEqual(compensationRunes(cs));
    expect(compensationRunes([{ ...cs[0]!, id: 'z' }])).toHaveLength(5);
  });
});

describe('🔮 poser une rune', () => {
  it('pose une nouvelle compétence, puis la monte', () => {
    let a = champ();
    let s = state({ green: 5 });
    const r = useRune(a, 'green', s, mulberry32(1));
    expect(r.kind).toBe('new');
    if (r.kind === 'blocked') throw new Error();
    expect(r.state.stock.green).toBe(4);
    a = r.adv; s = r.state;
    expect(a.skills).toHaveLength(1);
    // En reposant jusqu'à ce que le même tombe, il monte au lieu de prendre une place.
    for (let i = 0; i < 20 && s.stock.green > 0; i++) {
      const q = useRune(a, 'green', s, mulberry32(i + 7));
      if (q.kind === 'blocked' || q.kind === 'full') break;
      a = q.adv; s = q.state;
    }
    expect(a.skills!.length).toBeLessThanOrEqual(SKILL_SLOTS.A);
  });

  it('emplacements pleins et compétence nouvelle : la rune est dépensée, la décision attend', () => {
    const vertes = skillsOfTier('green');
    const a = champ({ skills: [{ id: vertes[0]!, level: 1 }, { id: vertes[1]!, level: 1 }] });
    let seen = false;
    for (let seed = 1; seed < 50 && !seen; seed++) {
      const r = useRune(a, 'green', state({ green: 1 }), mulberry32(seed));
      if (r.kind !== 'full') continue;
      seen = true;
      expect(r.state.stock.green).toBe(0);
      expect(r.state.pending).toEqual({ advId: 'c1', tier: 'green', drawn: r.drawn });
      expect(runeUseBlocker(a, 'green', addRunes(r.state, ['green']))).toBe('pending');
      const rep = settlePendingRune(a, r.state, 0)!;
      expect(rep.adv.skills![0]).toEqual({ id: r.drawn, level: 1 });
      expect(rep.state.pending).toBeNull();
      const keep = settlePendingRune(a, r.state, null)!;
      expect(keep.adv.skills).toEqual(a.skills);
    }
    expect(seen).toBe(true);
  });

  it('les refus : pas en stock, rang trop bas, pas un champion, cran au maximum', () => {
    expect(runeUseBlocker(champ(), 'green', state())).toBe('noRune');
    expect(runeUseBlocker(champ({ level: 1 }), 'gold', state({ gold: 1 }))).toBe('rank');
    expect(runeUseBlocker({ ...champ(), championId: undefined }, 'green', state({ green: 1 }))).toBe('notChampion');
    const max = champ({ skills: skillsOfTier('green').slice(0, 2).map((id) => ({ id, level: SKILL_MAX_LEVEL })) });
    expect(runeUseBlocker(max, 'green', state({ green: 1 }))).toBeNull();
    // Un S avec les quatre vertes au maximum : plus rien à tirer dans ce cran.
    const S = CHAMPIONS.find((c) => c.grade === 'X') ?? CHAMPIONS.find((c) => c.grade === 'S')!;
    const full = champ({ championId: S.id, skills: skillsOfTier('green').map((id) => ({ id, level: SKILL_MAX_LEVEL })) });
    expect(runeUseBlocker(full, 'green', state({ green: 1 }))).toBe('maxed');
  });

  it('une décision ne vaut que pour le champion concerné', () => {
    const s: RuneState = { ...state(), pending: { advId: 'autre', tier: 'green', drawn: 'speed' } };
    expect(settlePendingRune(champ(), s, 0)).toBeNull();
  });
});
