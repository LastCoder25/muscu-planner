import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { RARITY_RANK, RANK_ORDER, itemLevelMult } from '@/lib/items';
import { advRarity, type Adventurer } from '@/lib/adventurers';
import {
  ADV_GEAR_SLOTS,
  LINEAGE_GEAR,
  advGearEffects,
  advGearOptions,
  advGearRoles,
  canWearAdvGear,
  lineageOf,
  pickLineage,
  rollAdvGear,
  wornGear,
  type AdvGear,
} from '@/lib/advGear';

const adv = (id: string, path: string[], gear?: Adventurer['gear']): Adventurer => ({
  id,
  name: id,
  seed: 1,
  path,
  level: 20,
  xp: 0,
  ...(gear ? { gear } : {}),
});
const piece = (id: string, over: Partial<AdvGear> = {}): AdvGear => ({
  id,
  lineage: 'guerrier',
  slot: 'weapon',
  name: 'Épée',
  emoji: '🗡️',
  rarity: 'commun',
  roll: 0.5,
  level: 20,
  effect: { type: 'damage_pct', value: 10 },
  ...over,
});

describe('équipement propre à chaque classe de base', () => {
  it('chaque lignée a ses trois pièces, nommées et distinctes', () => {
    for (const def of Object.values(LINEAGE_GEAR)) {
      const names = ADV_GEAR_SLOTS.map((s) => def.pieces[s].name);
      expect(new Set(names).size).toBe(3);
      for (const s of ADV_GEAR_SLOTS) expect(def.pieces[s].pool.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('seules les lignées civiles portent un bonus de rôle, sur l’accessoire', () => {
    expect(LINEAGE_GEAR.eclaireur.role).toBe('speed');
    expect(LINEAGE_GEAR.caravanier.role).toBe('haul');
    expect(LINEAGE_GEAR.guerrier.role).toBeUndefined();
    const rng = mulberry32(3);
    const acc = rollAdvGear(rng, {
      lineage: 'caravanier',
      slot: 'accessory',
      level: 30,
      playerLevel: 30,
    });
    expect(acc.role?.kind).toBe('haul');
    const arme = rollAdvGear(rng, {
      lineage: 'caravanier',
      slot: 'weapon',
      level: 30,
      playerLevel: 30,
    });
    expect(arme.role).toBeUndefined();
  });
  it('la lignée est la classe de départ', () => {
    expect(lineageOf(adv('a', ['archer', 'tireur']))).toBe('archer');
    expect(lineageOf(adv('b', []))).toBeNull();
  });
});

describe('tirage', () => {
  it('suit la pyramide des drops : rareté plafonnée par le niveau, stat du pool de la pièce', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const g = rollAdvGear(rng, { lineage: 'mage', level: 12, playerLevel: 12 });
      expect(RARITY_RANK[g.rarity]).toBeLessThanOrEqual(RARITY_RANK[RANK_ORDER[5]!]);
      expect(LINEAGE_GEAR.mage.pieces[g.slot].pool).toContain(g.effect.type);
      if (g.effect2) expect(g.effect2.type).not.toBe(g.effect.type);
    }
  });
  it('2ᵉ affixe à partir de Magique seulement', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 300; i++) {
      const g = rollAdvGear(rng, { lineage: 'guerrier', level: 60, playerLevel: 60 });
      expect(!!g.effect2).toBe(RARITY_RANK[g.rarity] >= RARITY_RANK.magique);
    }
  });
  it('le tirage de lignée ne choisit que parmi le vivier (rien si vivier vide)', () => {
    const rng = mulberry32(5);
    const v = [adv('a', ['mage']), adv('b', ['mage'])];
    for (let i = 0; i < 50; i++) expect(pickLineage(rng, v)).toBe('mage');
    expect(pickLineage(rng, [])).toBeNull();
  });
});

describe('port', () => {
  it('une pièce ne se porte que par sa lignée et jusqu’à la rareté de sa classe', () => {
    const recrue = adv('a', ['guerrier']); // classe commune
    expect(canWearAdvGear(recrue, piece('p'))).toBe(true);
    expect(canWearAdvGear(recrue, piece('p', { rarity: 'inhabituel' }))).toBe(false);
    expect(canWearAdvGear(recrue, piece('p', { lineage: 'archer' }))).toBe(false);
    expect(RARITY_RANK[advRarity(recrue)]).toBe(0);
  });
  it('wornGear : une pièce, un porteur ; mauvais emplacement ou interdite = ignorée', () => {
    const stock = [
      piece('p1'),
      piece('p2', { slot: 'armor', effect: { type: 'max_pv_pct', value: 8 } }),
    ];
    const a = adv('a', ['guerrier'], { weapon: 'p1', armor: 'p1' });
    const b = adv('b', ['guerrier'], { weapon: 'p1', armor: 'p2' });
    const w = wornGear([a, b], stock);
    expect(w.get('a')?.map((g) => g.id)).toEqual(['p1']);
    expect(w.get('b')?.map((g) => g.id)).toEqual(['p2']);
  });
  it('effets : valeur × niveau d’objet, comme un objet du héros', () => {
    const e = advGearEffects([piece('p', { level: 40 })]);
    expect(e.damagePct).toBeCloseTo((10 * itemLevelMult(40)) / 100, 6);
  });
  it('rôles : seuls les accessoires civils PORTÉS comptent', () => {
    const stock = [
      piece('r', { lineage: 'caravanier', slot: 'accessory', role: { kind: 'haul', value: 0.05 } }),
    ];
    const porteur = adv('c', ['caravanier'], { accessory: 'r' });
    expect(advGearRoles([porteur], stock)).toEqual({ speed: 0, haul: 0.05 });
    expect(advGearRoles([adv('d', ['caravanier'])], stock)).toEqual({ speed: 0, haul: 0 });
  });
  it('options : filtre lignée, rareté et pièces prises, en disant combien sont masquées', () => {
    const stock = [
      piece('ok'),
      piece('rare', { rarity: 'rare' }),
      piece('arc', { lineage: 'archer' }),
      piece('pris'),
    ];
    const a = adv('a', ['guerrier']);
    const b = adv('b', ['guerrier'], { weapon: 'pris' });
    const o = advGearOptions(a, [a, b], stock, 'weapon');
    expect(o.options.map((g) => g.id)).toEqual(['ok']);
    expect(o).toMatchObject({ tooRare: 1, otherLineage: 1, taken: 1 });
  });
});
