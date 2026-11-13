import { describe, expect, it } from 'vitest';
import { SKILL_MAX_LEVEL, maxRise } from '@/lib/skillRunes';
import {
  fuseAllRising,
  fuseAllSkills,
  fuseSkills,
  riseLineText,
  type RuneBank,
  type StockSkill,
} from '@/lib/runeBank';

// 🌈🔗 « Tout fusionner » élève d'elle-même les Nv 5 (non dorés) et enchaîne : plus de passage
// à la main après coup. La fusion AU CHOIX, elle, n'élève jamais.
const bank = (skills: StockSkill[]): RuneBank => ({
  runes: 0,
  blessed: 0,
  exalted: 0,
  skills,
  opened: skills.length,
  comp: 2,
});
const sk = (uid: string, id: StockSkill['id'], level = 1, up = 0): StockSkill =>
  up ? { uid, id, level, up } : { uid, id, level };
const many = (n: number, id: StockSkill['id'], level = 1, up = 0, p = 'x'): StockSkill[] =>
  Array.from({ length: n }, (_, i) => sk(`${p}${i}`, id, level, up));

describe('🌈🔗 « Tout fusionner » élève les Nv 5 et enchaîne', () => {
  it('7 × Nv 1 → Nv 5 + Nv 2, et le Nv 5 passe aussitôt à la couleur du dessus, Nv 1', () => {
    const r = fuseAllRising(bank(many(7, 'speed')));
    expect(r.groups).toEqual([{ id: 'speed', up: 0, before: [1, 1, 1, 1, 1, 1, 1], after: [5, 2] }]);
    expect(r.rises).toEqual([{ id: 'speed', up: 0, count: 1 }]);
    // le Nv 2 reste vert, l'élevé est un Nv 1 bleu qui GARDE son uid et sa place
    expect(r.bank.skills).toEqual([sk('x0', 'speed', 1, 1), sk('x5', 'speed', 2)]);
  });

  it('enchaîne : le Nv 1 élevé se fusionne avec les exemplaires déjà là, et ainsi de suite', () => {
    // 5 verts Nv 1 → Nv 5 → bleu Nv 1 ; + un bleu Nv 4 → Nv 5 → violet Nv 1.
    const r = fuseAllRising(bank([...many(5, 'speed'), sk('b', 'speed', 4, 1)]));
    expect(r.groups.map((g) => [g.up, g.after])).toEqual([
      [0, [5]],
      [1, [5]],
    ]);
    expect(r.rises).toEqual([
      { id: 'speed', up: 0, count: 1 },
      { id: 'speed', up: 1, count: 1 },
    ]);
    expect(r.bank.skills).toHaveLength(1);
    expect(r.bank.skills[0]).toMatchObject({ id: 'speed', level: 1, up: 2 });
  });

  it('un doré reste au Nv 5 : c’est le sommet, rien ne s’élève', () => {
    const top = maxRise('speed');
    const r = fuseAllRising(bank([sk('a', 'speed', 3, top), sk('b', 'speed', 2, top)]));
    expect(r.groups).toHaveLength(1);
    expect(r.rises).toEqual([]);
    expect(r.bank.skills).toEqual([sk('a', 'speed', SKILL_MAX_LEVEL, top)]);
  });

  it('un Nv 5 déjà au stock, sans rien à fusionner, s’élève aussi (un « pack de 5 »)', () => {
    const r = fuseAllRising(bank([sk('a', 'speed', 5), sk('p', 'pv', 2)]));
    expect(r.groups).toEqual([]);
    expect(r.rises).toEqual([{ id: 'speed', up: 0, count: 1 }]);
    expect(r.bank.skills).toEqual([sk('a', 'speed', 1, 1), sk('p', 'pv', 2)]);
  });

  it('rien à faire : le stock est rendu tel quel', () => {
    const b = bank([sk('a', 'speed', 3), sk('p', 'pv', 2)]);
    expect(fuseAllRising(b)).toEqual({ bank: b, groups: [], rises: [] });
  });

  it('sans Nv 5 à élever, il se comporte exactement comme fuseAllSkills', () => {
    const b = bank([...many(2, 'speed'), sk('p', 'pv', 2), sk('q', 'pv', 1)]);
    const a = fuseAllSkills(b);
    const r = fuseAllRising(b);
    expect(r.groups).toEqual(a.groups);
    expect(r.bank).toEqual(a.bank);
    expect(r.rises).toEqual([]);
  });

  it('viser une compétence ne touche pas aux autres (même un Nv 5)', () => {
    const b = bank([...many(5, 'speed'), sk('p', 'pv', 5)]);
    const r = fuseAllRising(b, 'speed');
    expect(r.rises).toEqual([{ id: 'speed', up: 0, count: 1 }]);
    expect(r.bank.skills.find((s) => s.uid === 'p')).toEqual(sk('p', 'pv', 5));
  });

  it('viser une couleur ne fusionne pas les autres couleurs… tant que rien ne s’y élève', () => {
    // deux bleus Nv 2 : hors du périmètre « vert » tant qu’aucun vert ne s’élève jusque-là.
    const b = bank([sk('a', 'speed', 2), sk('b', 'speed', 1), ...many(2, 'speed', 2, 1, 'u')]);
    const r = fuseAllRising(b, { id: 'speed', up: 0 });
    expect(r.groups.map((g) => g.up)).toEqual([0]);
    expect(r.bank.skills.filter((s) => s.up === 1)).toHaveLength(2);
  });

  it('…mais une fois un vert élevé, le bleu où il arrive entre dans le périmètre', () => {
    const b = bank([...many(5, 'speed'), ...many(2, 'speed', 2, 1, 'u')]);
    const r = fuseAllRising(b, { id: 'speed', up: 0 });
    // le vert devient un bleu Nv 1, qui se fusionne avec les deux bleus Nv 2 → Nv 5 → violet Nv 1
    expect(r.groups.map((g) => g.up)).toEqual([0, 1]);
    expect(r.bank.skills).toHaveLength(1);
    expect(r.bank.skills[0]).toMatchObject({ level: 1, up: 2 });
  });

  it('la fusion AU CHOIX n’élève jamais : on obtient exactement ce qu’on a demandé', () => {
    const b = bank([sk('a', 'speed', 3), sk('b', 'speed', 2)]);
    const r = fuseSkills(b, ['a', 'b']);
    expect(r?.bank.skills).toEqual([sk('a', 'speed', SKILL_MAX_LEVEL)]);
  });

  it('une ligne d’élévation se lit « 2 × Nv 5 : 🟢 → 🔵 Nv 1 »', () => {
    expect(riseLineText({ id: 'speed', up: 0, count: 2 })).toBe('🌈 2 × Nv 5 : 🟢 → 🔵 Nv 1');
    expect(riseLineText({ id: 'speed', up: 0, count: 1 })).toBe('🌈 Nv 5 : 🟢 → 🔵 Nv 1');
  });
});
