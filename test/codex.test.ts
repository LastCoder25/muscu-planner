import { describe, it, expect } from 'vitest';
import {
  discoveredMonsterIds,
  bestiary,
  setCollection,
  codexSummary,
  championGallery,
} from '@/lib/codex';
import { CHAMPIONS } from '@/data/champions';
import { awakenLevel, type Adventurer } from '@/lib/adventurers';
import { MONSTERS } from '@/data/monsters';
import { ITEM_SETS, RARITY_RANK, type Item, type ItemSlot } from '@/lib/items';

const setItem = (slot: ItemSlot, setId: string): Item => ({
  id: `${setId}_${slot}`,
  slot,
  name: 'Pièce',
  emoji: '🐲',
  rarity: 'B',
  level: 10,
  baseLevel: 10,
  effect: { type: 'damage_pct', value: 8 },
  setId,
});

describe('codex — bestiaire', () => {
  it('rien nettoyé → aucun monstre découvert', () => {
    expect(discoveredMonsterIds([]).size).toBe(0);
  });
  it('donjon nettoyé → ses monstres sont découverts', () => {
    expect([...discoveredMonsterIds(['clairiere'])]).toEqual(['slime']);
    const caverne = discoveredMonsterIds(['caverne']);
    expect(caverne.has('wolf')).toBe(true);
    expect(caverne.has('golem')).toBe(true);
  });
  it('bestiary : tout le bestiaire, trié par tier, avec les flags découvert', () => {
    const b = bestiary(['clairiere']);
    expect(b).toHaveLength(MONSTERS.length);
    for (let i = 1; i < b.length; i++) expect(b[i]!.tier).toBeGreaterThanOrEqual(b[i - 1]!.tier);
    expect(b.find((e) => e.id === 'slime')!.discovered).toBe(true);
    expect(b.find((e) => e.id === 'dragon')!.discovered).toBe(false);
  });
});

describe('codex — journal des sets (voie)', () => {
  const BERS = 'voie:berserker';
  it('rien possédé → 0/4, non complet', () => {
    const sets = setCollection({}, []);
    const bers = sets.find((s) => s.set.id === BERS)!;
    expect(bers.owned).toBe(0);
    expect(bers.complete).toBe(false);
  });

  it('4 slots distincts d’un set → complet', () => {
    const inv = [
      setItem('weapon', BERS),
      setItem('armor', BERS),
      setItem('accessory', BERS),
      setItem('relic', BERS),
    ];
    const bers = setCollection({}, inv).find((s) => s.set.id === BERS)!;
    expect(bers.owned).toBe(4);
    expect(bers.complete).toBe(true);
  });

  it('doublons de slot ne comptent qu’une fois (slots DISTINCTS)', () => {
    const inv = [setItem('weapon', BERS), setItem('weapon', BERS)];
    const bers = setCollection({}, inv).find((s) => s.set.id === BERS)!;
    expect(bers.owned).toBe(1);
  });

  it('compte les pièces équipées ET du sac', () => {
    const equipped = { weapon: setItem('weapon', 'voie:gardien') };
    const inv = [setItem('armor', 'voie:gardien')];
    const gardien = setCollection(equipped, inv).find((s) => s.set.id === 'voie:gardien')!;
    expect(gardien.owned).toBe(2);
  });
});

describe('codex — résumé', () => {
  it('agrège monstres trouvés et sets complets', () => {
    const s = codexSummary(['clairiere'], {}, []);
    expect(s.monstersFound).toBe(1);
    expect(s.monstersTotal).toBe(MONSTERS.length);
    expect(s.setsComplete).toBe(0);
    expect(s.setsTotal).toBe(ITEM_SETS.length);
  });
});

describe('🏅 la GALERIE DES CHAMPIONS', () => {
  const owned = (id: string, copies: number): Adventurer => ({
    id: 'a_' + id,
    name: id,
    seed: 1,
    path: [],
    championId: id,
    copies,
    level: 1,
    xp: 0,
  });

  it('le roster ENTIER est là, et ce qu_on n_a pas tiré reste à découvrir', () => {
    const g = championGallery([]);
    expect(g).toHaveLength(CHAMPIONS.length);
    expect(g.every((e) => !e.owned && e.copies === 0)).toBe(true);
  });

  it('un champion possédé porte ses exemplaires et son cran d_Éveil', () => {
    const c = CHAMPIONS[0]!;
    const e = championGallery([owned(c.id, 3)]).find((x) => x.champ.id === c.id)!;
    expect(e.owned).toBe(true);
    expect(e.copies).toBe(3);
    // ⚠️ La PREMIÈRE copie est le champion : trois exemplaires = deux crans.
    expect(e.awaken).toBe(awakenLevel(3));
    expect(e.awaken).toBe(2);
  });

  it('⚠️ la pyramide du genre : de la rareté la plus BASSE à la plus haute', () => {
    // L_entrée en bas, la collection en haut — c_est aussi l_ordre dans lequel on les tire.
    const g = championGallery([]);
    for (let i = 1; i < g.length; i++)
      expect(RARITY_RANK[g[i]!.champ.rarity]).toBeGreaterThanOrEqual(
        RARITY_RANK[g[i - 1]!.champ.rarity],
      );
  });

  it('⚠️ un aventurier SANS champion ne compte pas — la galerie ne lit que les identités', () => {
    const recrue: Adventurer = {
      id: 'v1',
      name: 'Recrue',
      seed: 1,
      path: ['guerrier'],
      level: 9,
      xp: 0,
    };
    expect(championGallery([recrue]).some((e) => e.owned)).toBe(false);
  });

  it('le résumé compte les champions comme il compte monstres et sets', () => {
    const c = CHAMPIONS[0]!;
    const s = codexSummary([], {}, [], {}, [owned(c.id, 1)]);
    expect(s.championsTotal).toBe(CHAMPIONS.length);
    expect(s.championsFound).toBe(1);
  });
});
