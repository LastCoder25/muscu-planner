import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { autoEquipRunes, type RuneBank, type StockSkill } from '@/lib/runeBank';
import type { ChampSkill } from '@/lib/skillRunes';

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const bank = (skills: StockSkill[]): RuneBank => ({
  runes: 0,
  skills,
  opened: skills.length,
  comp: 2,
});
const sk = (uid: string, id: StockSkill['id'], level = 1, up?: number): StockSkill => ({
  uid,
  id,
  level,
  ...(up ? { up } : {}),
});
const worn = (id: ChampSkill['id'], level: number, up?: number): ChampSkill => ({
  id,
  level,
  ...(up ? { up } : {}),
});
const champ = (id: string, skills: ChampSkill[], slots = 3) => ({ id, slots: { skills, slots } });

describe('⚙️ auto-équiper : le stock améliore les runes posées', () => {
  it('ajoute au porteur les exemplaires de la même compétence, le plus gros d’abord', () => {
    const out = autoEquipRunes(bank([sk('a', 'speed', 1), sk('b', 'speed', 2)]), [
      champ('c1', [worn('speed', 1)]),
    ]);
    expect(out.skills.get('c1')![0]!.level).toBe(4);
    expect(out.bank.skills).toHaveLength(0);
    expect(out.upgrades).toEqual([
      { advId: 'c1', id: 'speed', from: 1, to: 4, copies: 2, rose: false },
    ]);
  });

  it('ne dépasse jamais le niveau 5 : l’exemplaire qui ne rentre pas reste au stock', () => {
    const out = autoEquipRunes(bank([sk('a', 'speed', 3), sk('b', 'speed', 1)]), [
      champ('c1', [worn('speed', 3)]),
    ]);
    expect(out.skills.get('c1')![0]!.level).toBe(4); // le Nv 1 passe, le Nv 3 ne rentre pas
    expect(out.bank.skills.map((s) => s.uid)).toEqual(['a']);
  });

  it('une compétence qui ne se porte pas n’est pas donnée (pas de place libre remplie)', () => {
    const out = autoEquipRunes(bank([sk('a', 'haul', 2)]), [champ('c1', [worn('speed', 1)])]);
    expect(out.upgrades).toEqual([]);
    expect(out.bank.skills).toHaveLength(1);
  });

  it('une autre COULEUR de la même compétence n’est pas versée (pas de rétrogradation)', () => {
    const out = autoEquipRunes(bank([sk('a', 'speed', 2)]), [champ('c1', [worn('speed', 1, 1)])]);
    expect(out.upgrades).toEqual([]);
    expect(out.bank.skills).toHaveLength(1);
  });

  it('au niveau 5 elle s’élève (règle du don à la main) et l’amélioration le dit', () => {
    const out = autoEquipRunes(bank([sk('a', 'speed', 2)]), [champ('c1', [worn('speed', 3)])]);
    expect(out.upgrades[0]).toMatchObject({ from: 3, to: 5, rose: true });
  });

  it('chaque champion est servi, le stock se partage dans l’ordre', () => {
    const out = autoEquipRunes(bank([sk('a', 'speed', 2)]), [
      champ('c1', [worn('speed', 1)]),
      champ('c2', [worn('speed', 1)]),
    ]);
    expect(out.skills.has('c1')).toBe(true);
    expect(out.skills.has('c2')).toBe(false);
  });

  it('rien à améliorer : stock et champions intacts', () => {
    const b = bank([sk('a', 'speed', 1)]);
    const out = autoEquipRunes(b, [champ('c1', [])]);
    expect(out.bank).toBe(b);
    expect(out.skills.size).toBe(0);
  });
});

describe('🪬 l’écran des runes', () => {
  const sheet = src('src/components/RuneBankSheet.vue');
  it('propose Auto-équiper, branché sur le même calcul que le geste', () => {
    expect(sheet).toContain('data-test="auto-equip"');
    expect(sheet).toContain('autoEquipRunes(');
    expect(sheet).toContain('char.autoEquipRuneSkills(uid)');
  });
  it('n’affiche plus « Ouvertes à l’instant » : l’intérêt, c’est le stock', () => {
    expect(sheet).not.toContain('Ouvertes à l’instant');
    expect(sheet).not.toContain('lastOpened');
  });
});

describe('⚙️ montées automatiques : les boutons manuels disparaissent', () => {
  it('la Guilde cache l’ascension et l’éveil des pièces quand leur réglage est allumé', () => {
    const g = src('src/components/GuildPanel.vue');
    expect(g).toContain('if (autoUp.value.gear) return null;');
    expect(g).toContain('if (autoUp.value.merge) return null;');
  });
  it('le retour de mission ne propose plus l’ascension des pièces', () => {
    expect(src('src/components/AdvXpGainOverlay.vue')).toContain(
      'if (autoUp.value.gear) return null;',
    );
  });
});
