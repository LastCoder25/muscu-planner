import { describe, it, expect } from 'vitest';
import { autoRise, type ChampSkill } from '@/lib/skillRunes';
import { giveSkill, takeBackSkill, type RuneBank, type StockSkill } from '@/lib/runeBank';
import { normalizeCharacterRow, type CharacterRow } from '@/lib/characterRow';

// ↩️ Récupérer une compétence, remplacement qui rend l'ancienne au stock, et 🌈 élévation
// automatique au niveau 5 chez un champion (décisions de l'utilisateur, 2026-10-21).

const bank = (skills: StockSkill[] = []): RuneBank => ({
  runes: 0,
  blessed: 0,
  exalted: 0,
  skills,
  opened: skills.length,
  comp: 2,
});
const sk = (uid: string, id: StockSkill['id'], level = 1, up?: number): StockSkill =>
  up ? { uid, id, level, up } : { uid, id, level };
const c = (skills: ChampSkill[], slots = 2) => ({ skills, slots });

describe('🌈 autoRise — le niveau 5 d’un champion s’élève de lui-même', () => {
  it('Nv 5 non doré → couleur au-dessus, Nv 1 ; le reste ne bouge pas', () => {
    const r = autoRise<ChampSkill>([
      { id: 'speed', level: 5 },
      { id: 'pv', level: 4 },
      { id: 'damage', level: 5, up: 1 },
    ]);
    expect(r.skills).toEqual([
      { id: 'speed', level: 1, up: 1 },
      { id: 'pv', level: 4 },
      { id: 'damage', level: 1, up: 2 },
    ]);
    expect(r.rose.map((s) => s.id)).toEqual(['speed', 'damage']);
  });

  it('dorée au Nv 5 et surchargée (5⚡) : intouchées', () => {
    const keep: ChampSkill[] = [
      { id: 'plunder', level: 5 },
      { id: 'speed', level: 5, up: 3 },
      { id: 'pv', level: 6 },
    ];
    const r = autoRise(keep);
    expect(r.skills).toEqual(keep);
    expect(r.rose).toEqual([]);
  });
});

describe('🎁 giveSkill — élévation dans la foulée, l’ancienne revient au stock', () => {
  it('cumul qui atteint 5 : elle s’élève, et le dit (`rose`)', () => {
    const r = giveSkill(bank([sk('a', 'speed', 2)]), 'a', c([{ id: 'speed', level: 3 }]))!;
    expect(r.skills).toEqual([{ id: 'speed', level: 1, up: 1 }]);
    expect(r.rose).toEqual([{ id: 'speed', level: 1, up: 1 }]);
    expect(r.back).toBeNull();
    expect(r.bank.skills).toEqual([]);
  });

  it('cumul sous 5 : rien ne s’élève', () => {
    const r = giveSkill(bank([sk('a', 'speed', 1)]), 'a', c([{ id: 'speed', level: 3 }]))!;
    expect(r.skills).toEqual([{ id: 'speed', level: 4 }]);
    expect(r.rose).toEqual([]);
  });

  it('remplacement (places pleines) : la remplacée revient au stock, niveaux et couleur', () => {
    const r = giveSkill(
      bank([sk('a', 'haul', 2), sk('rb1', 'scout', 1)]),
      'a',
      c([
        { id: 'pv', level: 3, up: 1 },
        { id: 'damage', level: 2 },
      ]),
      0,
    )!;
    expect(r.skills).toEqual([
      { id: 'haul', level: 2 },
      { id: 'damage', level: 2 },
    ]);
    // ⚠️ un uid libre, jamais celui d'un exemplaire déjà au stock
    expect(r.back).toEqual({ uid: 'rb2', id: 'pv', level: 3, up: 1 });
    expect(r.bank.skills).toEqual([
      sk('rb1', 'scout', 1),
      { uid: 'rb2', id: 'pv', level: 3, up: 1 },
    ]);
  });

  it('même compétence, autre couleur : la sienne revient au stock', () => {
    const r = giveSkill(bank([sk('a', 'crit', 2, 1)]), 'a', c([{ id: 'crit', level: 4 }]))!;
    expect(r.skills).toEqual([{ id: 'crit', level: 2, up: 1 }]);
    expect(r.back).toEqual({ uid: 'rb1', id: 'crit', level: 4 });
    expect(r.bank.skills).toEqual([r.back]);
  });

  it('un Nv 5 du stock posé sur une place libre s’élève aussitôt', () => {
    const r = giveSkill(bank([sk('a', 'scout', 5)]), 'a', c([]))!;
    expect(r.skills).toEqual([{ id: 'scout', level: 1, up: 1 }]);
    expect(r.rose).toHaveLength(1);
  });
});

describe('↩️ takeBackSkill — récupérer une compétence', () => {
  it('elle quitte le champion et arrive au stock, niveaux et couleur gardés', () => {
    const r = takeBackSkill(
      bank([sk('sk1', 'speed', 1)]),
      [
        { id: 'pv', level: 2 },
        { id: 'crit', level: 3, up: 1 },
      ],
      'crit',
    )!;
    expect(r.skills).toEqual([{ id: 'pv', level: 2 }]);
    expect(r.skill).toEqual({ uid: 'rb1', id: 'crit', level: 3, up: 1 });
    expect(r.bank.skills).toEqual([sk('sk1', 'speed', 1), r.skill]);
  });

  it('surchargée : revient au niveau 5 (le stock ne garde pas le ⚡)', () => {
    const r = takeBackSkill(bank(), [{ id: 'plunder', level: 6 }], 'plunder')!;
    expect(r.skill).toEqual({ uid: 'rb1', id: 'plunder', level: 5 });
  });

  it('compétence qu’il ne porte pas : refusé', () => {
    expect(takeBackSkill(bank(), [{ id: 'pv', level: 2 }], 'crit')).toBeNull();
  });
});

describe('🌈 rattrapage au chargement', () => {
  it('les Nv 5 déjà posés passent au Nv 1 de la couleur au-dessus (dorée et 5⚡ gardées)', () => {
    const { row } = normalizeCharacterRow({
      user_id: 'u1',
      pseudo: 'T',
      gold: 0,
      energy_spent: 0,
      runes: bank(),
      adventurers: [
        {
          id: 'a1',
          name: 'A',
          skills: [
            { id: 'speed', level: 5 },
            { id: 'pv', level: 6 },
            { id: 'plunder', level: 5 },
          ],
        },
      ],
    } as unknown as CharacterRow);
    expect(row.adventurers[0]!.skills).toEqual([
      { id: 'speed', level: 1, up: 1 },
      { id: 'pv', level: 6 },
      { id: 'plunder', level: 5 },
    ]);
  });
});
