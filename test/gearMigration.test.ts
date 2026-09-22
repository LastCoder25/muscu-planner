import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import {
  AFFIX_TRANSLATION,
  LEGENDARY_PROCS,
  RARITY_RANK,
  RANK_ORDER,
  SLOT_AFFIXES,
  SLOTS,
  affixCountForRarity,
  affixValue,
  makeGearPiece,
  migrateGearItem,
  prestigeRankIndex,
  rollDrop,
  rollSetPiece,
  voieRelicPower,
  type GearSlot,
  type Item,
} from '@/lib/items';
import { GIFT_ROLL, NEW_SLOTS, gearRefonteGifts } from '@/lib/gearMigration';

// Un objet d'AVANT la refonte : pas de poids d'emplacement, stats des listes communes.
const old = (o: Partial<Item> & Pick<Item, 'slot'>): Item => ({
  id: `o-${o.slot}-${o.name ?? ''}`,
  name: 'Lame épique',
  emoji: '⚔️',
  rarity: 'epique',
  level: 30,
  baseLevel: 30,
  effect: { type: 'damage_pct', value: 12 },
  roll: 0.6,
  ...o,
});

describe('migrateGearItem — conversion au chargement (spec § 9)', () => {
  it('traduit les stats sorties de leur emplacement (PV sur une arme → dégâts, etc.)', () => {
    const w = migrateGearItem(
      old({
        slot: 'weapon',
        effect: { type: 'max_pv_pct', value: 12 },
        effect2: { type: 'crit_pct', value: 5 },
      }),
    );
    expect([w.effect.type, w.effect2?.type]).toEqual(['damage_pct', 'crit_dmg_pct']);
    const a = migrateGearItem(old({ slot: 'armor', effect: { type: 'crit_pct', value: 5 } }));
    expect(a.effect.type).toBe('dmg_reduction_pct');
    const r = migrateGearItem(old({ slot: 'accessory', effect: { type: 'damage_pct', value: 9 } }));
    expect(r.effect.type).toBe('crit_pct');
  });

  it('recalcule les valeurs au nouveau barème, au même rang, même jet, même niveau', () => {
    const it0 = old({
      slot: 'weapon',
      effect: { type: 'damage_pct', value: 99 },
      effect2: { type: 'gold_pct', value: 3 },
    });
    const m = migrateGearItem(it0);
    expect(m.effect.value).toBe(affixValue('damage_pct', 'epique', 0.6, 'weapon'));
    expect(m.effect2!.value).toBe(affixValue('accuracy_pct', 'epique', 0.6, 'weapon'));
    expect([m.rarity, m.roll, m.level]).toEqual([it0.rarity, it0.roll, it0.level]);
  });

  it('chaque objet converti respecte les stats de son emplacement, sans doublon', () => {
    const olds = [
      'damage_pct',
      'crit_pct',
      'lifesteal_pct',
      'execute_pct',
      'momentum_pct',
      'dmg_reduction_pct',
      'max_pv_pct',
      'thorns_pct',
      'rage_pct',
      'gold_pct',
      'magic_find_pct',
      'regen_pct',
      'initiative_pct',
    ] as const;
    for (const slot of ['weapon', 'armor', 'accessory'] as GearSlot[])
      for (const a of olds)
        for (const b of olds) {
          if (a === b) continue;
          const m = migrateGearItem(
            old({
              slot,
              name: `${a}${b}`,
              effect: { type: a, value: 5 },
              effect2: { type: b, value: 5 },
            }),
          );
          const types = [m.effect.type, m.effect2?.type].filter(Boolean);
          const allowed = [...SLOT_AFFIXES[slot].major, ...SLOT_AFFIXES[slot].support];
          expect(
            types.every((t) => allowed.includes(t!)),
            `${slot} ${a}+${b}`,
          ).toBe(true);
          expect(new Set(types).size, `${slot} ${a}+${b}`).toBe(types.length);
          // Deux stats d'avant traduites vers la MÊME stat : l'objet garde ses DEUX affixes.
          expect(types, `${slot} ${a}+${b}`).toHaveLength(2);
          expect(SLOT_AFFIXES[slot].major, `${slot} ${a}+${b}`).toContain(m.effect.type);
        }
  });

  it('la table de traduction ne vise que des stats de l’emplacement', () => {
    for (const [slot, table] of Object.entries(AFFIX_TRANSLATION)) {
      const l = SLOT_AFFIXES[slot as GearSlot];
      for (const t of Object.values(table!)) expect([...l.major, ...l.support]).toContain(t);
    }
  });

  it('une pièce de set garde sa stat principale d’emplacement, à la valeur d’une pièce de set', () => {
    const m = migrateGearItem(
      old({ slot: 'accessory', setId: 'voie:assassin', effect: { type: 'damage_pct', value: 9 } }),
    );
    expect(m.effect.type).toBe('crit_pct');
    expect(m.effect.value).toBe(affixValue('crit_pct', 'epique', 0.6, 'accessory', true));
    expect(m.setId).toBe('voie:assassin');
  });

  it('une relique reçoit un pouvoir et perd ses stats ; celle d’un set prend le pouvoir de sa voie', () => {
    const set = migrateGearItem(
      old({
        slot: 'relic',
        name: 'Idole · Set',
        setId: 'voie:gardien',
        effect: { type: 'max_pv_pct', value: 9 },
        effect2: { type: 'regen_pct', value: 4 },
      }),
    );
    expect(set.power).toBe(voieRelicPower('gardien'));
    expect(set.setId).toBeUndefined();
    expect(set.effect2).toBeUndefined();
    expect(set.effect.value).toBe(0);
    const phenix = migrateGearItem(old({ slot: 'relic', name: 'Idole x', legendary: 'phoenix' }));
    expect(phenix.power).toBe('phenix');
    expect(phenix.legendary).toBeUndefined();
    const a = migrateGearItem(old({ slot: 'relic', name: 'Idole y' }));
    expect(a.power).toBeDefined();
    expect(migrateGearItem(old({ slot: 'relic', name: 'Idole y' })).power).toBe(a.power);
  });

  it('un effet légendaire déplacé en prend un de SON emplacement, toujours le même', () => {
    const it0 = old({ slot: 'accessory', rarity: 'legendaire', legendary: 'aegis' });
    const m = migrateGearItem(it0);
    const proc = LEGENDARY_PROCS.find((p) => p.id === m.legendary)!;
    expect(proc.slots).toContain('accessory');
    expect(migrateGearItem(it0).legendary).toBe(m.legendary);
  });

  it('est idempotente : un objet déjà converti, ou un drop neuf, ressort identique', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 400; i++) {
      const d = rollDrop(rng, { cleared: true, defeated: 3, level: 40, playerLevel: 40 });
      if (!d) continue;
      const it0 = { ...d, id: `d${i}` } as Item;
      expect(migrateGearItem(it0), `drop ${i}`).toEqual(it0);
      const s = {
        ...rollSetPiece(rng, { setId: 'voie:berserker', level: 40 }),
        id: `s${i}`,
      } as Item;
      expect(migrateGearItem(s), `set ${i}`).toEqual(s);
    }
    const once = migrateGearItem(
      old({ slot: 'weapon', effect: { type: 'max_pv_pct', value: 12 } }),
    );
    expect(migrateGearItem(once)).toEqual(once);
  });
});

describe('makeGearPiece — les pièces offertes', () => {
  it('sort au rang et au jet demandés, avec le nombre d’affixes de sa rareté', () => {
    for (const r of RANK_ORDER) {
      const p = makeGearPiece(mulberry32(1), { slot: 'helmet', rarity: r, roll: 0.5, level: 30 });
      expect([p.rarity, p.roll]).toEqual([r, 0.5]);
      expect([p.effect, p.effect2, p.effect3].filter(Boolean)).toHaveLength(affixCountForRarity(r));
    }
  });
});

describe('gearRefonteGifts — cadeaux de la refonte (spec § 9.4-9.5)', () => {
  const setPiece = (slot: GearSlot, rarity: Item['rarity'], id = slot): Item =>
    old({ id: `set-${id}`, slot, rarity, setId: 'voie:gardien' });
  let n = 0;
  const newId = () => `g${n++}`;

  it('un set porté en entier reçoit ses 3 pièces neuves, un rang sous le sien, équipées', () => {
    const eq = {
      weapon: setPiece('weapon', 'epique'),
      armor: setPiece('armor', 'epique'),
      accessory: setPiece('accessory', 'epique'),
    };
    const g = gearRefonteGifts({ equipped: eq, inventory: [], loadouts: [] }, 30, 'u', newId);
    for (const s of NEW_SLOTS) {
      expect(g.equipped[s]?.setId).toBe('voie:gardien');
      expect(g.equipped[s]?.rarity).toBe('rare');
      expect(g.equipped[s]?.roll).toBe(GIFT_ROLL.mid);
    }
    expect(g.gifts).toHaveLength(3); // aucune pièce de départ : les emplacements sont pris
  });

  it('un set rangé reçoit ses pièces au sac ; les emplacements neufs ont une pièce de départ', () => {
    const lo = [
      { items: { weapon: setPiece('weapon', 'rare'), armor: setPiece('armor', 'rare') } },
    ];
    const inv = [setPiece('accessory', 'rare')];
    const g = gearRefonteGifts({ equipped: {}, inventory: inv, loadouts: lo }, 30, 'u', newId);
    const bag = g.inventory.filter(
      (x) => x.setId === 'voie:gardien' && NEW_SLOTS.includes(x.slot as GearSlot),
    );
    expect(bag).toHaveLength(3);
    expect(bag.every((x) => x.rarity === 'magique')).toBe(true);
    const rank = RANK_ORDER[prestigeRankIndex(30) - 1];
    for (const s of NEW_SLOTS) {
      expect(g.equipped[s]?.setId).toBeUndefined();
      expect(g.equipped[s]?.rarity).toBe(rank);
    }
  });

  it('un set au rang le plus bas reçoit des pièces à son rang, jet faible', () => {
    const eq = {
      weapon: setPiece('weapon', 'commun'),
      armor: setPiece('armor', 'commun'),
      accessory: setPiece('accessory', 'commun'),
    };
    const g = gearRefonteGifts({ equipped: eq, inventory: [], loadouts: [] }, 5, 'u', newId);
    expect(g.equipped.shield?.rarity).toBe('commun');
    expect(g.equipped.shield?.roll).toBe(GIFT_ROLL.low);
  });

  it('un set incomplet ne reçoit rien ; un emplacement neuf déjà pris ne reçoit rien', () => {
    const eq = { weapon: setPiece('weapon', 'epique'), shield: old({ slot: 'shield' }) };
    const g = gearRefonteGifts({ equipped: eq, inventory: [], loadouts: [] }, 30, 'u', newId);
    expect(g.gifts.some((x) => x.setId)).toBe(false);
    expect(g.equipped.shield?.id).toBe(eq.shield.id);
    expect(g.gifts.map((x) => x.slot).sort()).toEqual(['boots', 'helmet']);
  });

  it('un cadeau n’est jamais au-dessus du rang du joueur', () => {
    for (const L of [1, 10, 30, 60, 90]) {
      const g = gearRefonteGifts({ equipped: {}, inventory: [], loadouts: [] }, L, 'u', newId);
      for (const x of g.gifts)
        expect(RARITY_RANK[x.rarity], `niveau ${L}`).toBeLessThan(
          Math.max(1, prestigeRankIndex(L) + 1),
        );
    }
    expect(SLOTS).toEqual(expect.arrayContaining(NEW_SLOTS));
  });
});
