import { describe, it, expect } from 'vitest';
import { VOIES, VOIE_BY_ID } from '@/lib/voies';
import { VOIE_SETS, VOIE_SET_STATS, wornVoie, type Equipped, type Item } from '@/lib/items';

describe('voies (profils, 2026-09-22)', () => {
  it('catalogue cohérent : id unique, profil non vide', () => {
    const ids = new Set(VOIES.map((v) => v.id));
    expect(ids.size).toBe(VOIES.length);
    for (const v of VOIES) {
      expect(v.preferred.length).toBeGreaterThan(0);
      expect(VOIE_BY_ID[v.id]).toBe(v);
    }
  });
  it('le profil d’une voie EST ce que portent les paliers de son set', () => {
    for (const v of VOIES) {
      const set = VOIE_SETS.find((s) => s.id === `voie:${v.id}`)!;
      expect([...set.tiers.map((t) => t.type)].sort(), v.id).toEqual([...v.preferred].sort());
      // Sa stat exclusive est aussi la stat identité de son set.
      expect(v.preferred, v.id).toContain(VOIE_SET_STATS[v.id]![0]);
    }
  });
});

describe('🧭 wornVoie — la voie se déduit du set porté', () => {
  const piece = (slot: Item['slot'], setId: string, rarity: Item['rarity'] = 'rare'): Item =>
    ({
      id: `${setId}-${slot}`,
      slot,
      name: 'x',
      emoji: '',
      rarity,
      level: 10,
      baseLevel: 10,
      effect: { type: 'damage_pct', value: 5 },
      setId,
    }) as Item;
  it('sans set porté (ou une seule pièce), pas de voie', () => {
    expect(wornVoie({})).toBeNull();
    expect(wornVoie({ weapon: piece('weapon', 'voie:epineux') })).toBeNull();
  });
  it('dès deux pièces, la voie du set', () => {
    const eq: Equipped = {
      weapon: piece('weapon', 'voie:epineux'),
      armor: piece('armor', 'voie:epineux'),
    };
    expect(wornVoie(eq)).toBe('epineux');
  });
  it('le set le plus fourni l’emporte, puis le plus haut rang à égalité', () => {
    const eq: Equipped = {
      weapon: piece('weapon', 'voie:gardien'),
      armor: piece('armor', 'voie:gardien'),
      shield: piece('shield', 'voie:gardien'),
      helmet: piece('helmet', 'voie:epineux'),
      boots: piece('boots', 'voie:epineux'),
    };
    expect(wornVoie(eq)).toBe('gardien');
    const tie: Equipped = {
      weapon: piece('weapon', 'voie:gardien', 'commun'),
      armor: piece('armor', 'voie:gardien', 'commun'),
      helmet: piece('helmet', 'voie:epineux', 'epique'),
      boots: piece('boots', 'voie:epineux', 'epique'),
    };
    expect(wornVoie(tie)).toBe('epineux');
  });
});
