import { describe, it, expect } from 'vitest';
import { normalizeCharacterRow, type CharacterRow } from '@/lib/characterRow';
import { SCRAP_TO_GOLD } from '@/lib/raid';
import { PRICE_REFUND_VERSION } from '@/lib/priceRefund';

// Une ligne telle que la base peut la rendre : colonnes récentes absentes, jsonb malformés.
function raw(over: Record<string, unknown> = {}): CharacterRow {
  return {
    user_id: 'u1',
    pseudo: 'Test',
    gold: 100,
    energy_spent: 0,
    ...over,
  } as unknown as CharacterRow;
}

describe('🧾 normalizeCharacterRow — une ligne malformée ne fait jamais planter la page', () => {
  it('jsonb malformés → tableaux et objets vides', () => {
    const { row } = normalizeCharacterRow(
      raw({
        inventory: {},
        cleared_dungeons: 'x',
        defeated_bosses: null,
        equipped: [],
        loadouts: 3,
        messages: {},
        energy_log: null,
        buildings: null,
        set_pieces_seen: [],
        adventurers: {},
      }),
    );
    expect(row.inventory).toEqual([]);
    expect(row.cleared_dungeons).toEqual([]);
    expect(row.defeated_bosses).toEqual([]);
    expect(row.equipped).toEqual({});
    expect(row.loadouts).toEqual([]);
    expect(row.messages).toEqual([]);
    expect(row.energy_log).toEqual([]);
    expect(row.buildings).toEqual([]);
    expect(row.set_pieces_seen).toEqual({});
    expect(row.adventurers).toEqual([]);
  });

  it('colonnes récentes absentes → valeurs par défaut', () => {
    const { row } = normalizeCharacterRow(raw());
    expect(row.summon_stones).toBe(0);
    expect(row.gacha_tickets).toBe(0);
    expect(row.boss_tokens).toBe(0);
    expect(row.gear_version).toBe(0);
    expect(row.quest_week).toBeNull();
    expect(row.voie).toBeNull();
    expect(row.base).toBeNull();
    expect(row.expedition).toBeNull();
    expect(row.expedition_map).toBeNull();
    // ⚠️ absent = déjà versé : on ne rembourse jamais sur une lecture incomplète.
    expect(row.price_refund).toBe(PRICE_REFUND_VERSION);
  });

  it('🎰 le pity survit, borné, et la marque des tickets de bienvenue aussi', () => {
    const { row } = normalizeCharacterRow(
      raw({ gacha: { sinceTop: 12.7, sinceFloor: -3, pulls: '40', welcomed: true } }),
    );
    expect(row.gacha).toEqual({
      sinceTop: 12,
      sinceFloor: 0,
      sinceApex: 0,
      pulls: 40,
      welcomed: true,
    });
  });

  it('🔩 la ferraille est convertie en or, une fois', () => {
    const { row } = normalizeCharacterRow(raw({ scrap: 7 }));
    expect(row.gold).toBe(100 + 7 * SCRAP_TO_GOLD);
    expect(row.scrap).toBe(0);
    const again = normalizeCharacterRow(row);
    expect(again.row.gold).toBe(100 + 7 * SCRAP_TO_GOLD);
  });

  it('les doublons d’un set rangé ne sont pas perdus', () => {
    const it0 = {
      id: 'a',
      slot: 'weapon',
      rarity: 'commun',
      name: 'Épée',
      effect: { type: 'damage_pct', value: 5 },
    };
    const { row } = normalizeCharacterRow(raw({ loadouts: [{ items: {}, spares: [it0] }] }));
    expect(row.loadouts[0]!.spares!.map((s) => s.id)).toEqual(['a']);
  });

  it('🪬 pas de bascule des runes à refaire → runeRefund vaut null', () => {
    const { runeRefund } = normalizeCharacterRow(
      raw({ runes: { runes: 0, skills: [], opened: 0, comp: 2 } }),
    );
    expect(runeRefund).toBeNull();
  });

  it('un champion perd son ancien compagnon et son ancien talent', () => {
    const { row } = normalizeCharacterRow(
      raw({
        adventurers: [
          {
            id: 'x',
            name: 'X',
            seed: 1,
            path: ['guerrier'],
            level: 1,
            xp: 0,
            familiarId: 'f',
            talentId: 't',
          },
        ],
      }),
    );
    expect(row.adventurers![0]).not.toHaveProperty('familiarId');
    expect(row.adventurers![0]).not.toHaveProperty('talentId');
  });
});
