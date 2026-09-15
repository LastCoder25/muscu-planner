import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { RARITY_RANK, RANK_ORDER, itemLevelMult } from '@/lib/items';
import { advRarity, type Adventurer } from '@/lib/adventurers';
import {
  adventurerGearPower,
  adventurerPowers,
  autoAdvGear,
  lootCorpses,
  type CompanionCtx,
  type Corpse,
} from '@/lib/raid';
import {
  ADV_GEAR_DROP,
  ADV_GEAR_SLOTS,
  LINEAGE_GEAR,
  OUTFITTER,
  advGearEffects,
  advGearOptions,
  advGearRoles,
  advGearValue,
  canWearAdvGear,
  lineageOf,
  outfitFromItem,
  outfitSlot,
  outfitterMsFor,
  pickLineage,
  rollAdvGear,
  settleOutfit,
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
  it('⚠️ rareté ET jet se sentent même sur une petite stat (crit, base 4)', () => {
    // À `ADV_GEAR.k` 0,15 un plancher à 1 écrasait tout : 4 × rareté × 0,15 < 1 en commun
    // comme en légendaire, et le jet ne changeait rien. Le plancher est à 0,1.
    expect(advGearValue('crit_pct', 'commun', 0.3)).not.toBe(
      advGearValue('crit_pct', 'legendaire', 0.3),
    );
    expect(advGearValue('crit_pct', 'legendaire', 0.3)).toBeGreaterThan(
      advGearValue('crit_pct', 'commun', 0.3),
    );
    expect(advGearValue('crit_pct', 'commun', 1)).toBeGreaterThan(
      advGearValue('crit_pct', 'commun', 0),
    );
    // …et une pièce tirée porte bien cette valeur (même niveau d'objet, même stat).
    const a = piece('a', {
      rarity: 'commun',
      effect: { type: 'crit_pct', value: advGearValue('crit_pct', 'commun', 0.3) },
    });
    const b = piece('b', {
      rarity: 'legendaire',
      effect: { type: 'crit_pct', value: advGearValue('crit_pct', 'legendaire', 0.3) },
    });
    expect(advGearEffects([a]).critAdd).toBeLessThan(advGearEffects([b]).critAdd);
    expect(advGearValue('crit_pct', 'commun', 0)).toBeGreaterThanOrEqual(0.1);
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

describe('au rempart et dans la puissance', () => {
  const ctx = (advGear: AdvGear[]): CompanionCtx => ({
    familiars: [],
    talents: [],
    kennelLevel: 0,
    now: 0,
    advGear,
  });
  it('une pièce portée augmente la puissance, une pièce interdite non', () => {
    const a = { ...adv('a', ['guerrier'], { weapon: 'p' }), level: 60 };
    const nu = adventurerPowers([a], ctx([])).get('a')!;
    const arme = piece('p', { level: 60, effect: { type: 'damage_pct', value: 40 } });
    expect(adventurerPowers([a], ctx([arme])).get('a')!).toBeGreaterThan(nu);
    // Hors de sa lignée : `canWearAdvGear` la refuse (`wornGear` l'ignore) → la puissance
    // ne bouge pas, exactement comme si le stock était vide.
    const interdite = { ...arme, lineage: 'archer' as const };
    expect(adventurerPowers([a], ctx([interdite])).get('a')!).toBe(nu);
  });
});

// ⚠️ `adventurerGearPower` existe pour que le SÉLECTEUR de la Guilde (Task 8) compare N
// candidates sans recalculer la puissance de TOUT le vivier à chaque ligne
// (`adventurerPowers` fait un `.map()` sur `advs` entier). Elle doit rendre EXACTEMENT ce
// que rendrait `adventurerPowers` sur le vivier modifié — jamais une formule recopiée — et
// garder les PAIRES calculées sur le vivier COMPLET (l'exclusivité d'une pièce entre
// aventuriers dépend de tout le monde), tout en ne calculant le COMBAT que pour la cible.
describe('la puissance d’UN aventurier, une candidate en main (sélecteur d’équipement)', () => {
  const ctx = (advGear: AdvGear[]): CompanionCtx => ({
    familiars: [],
    talents: [],
    kennelLevel: 0,
    now: 0,
    advGear,
  });
  it('une pièce PERMISE rend un gain positif, une pièce INTERDITE un gain nul', () => {
    const a = { ...adv('a', ['guerrier']), level: 60 };
    const arme = piece('p', { level: 60, effect: { type: 'damage_pct', value: 40 } });
    const c = ctx([arme]);
    const sansRien = adventurerGearPower([a], a, 'weapon', undefined, c);
    const avecArme = adventurerGearPower([a], a, 'weapon', 'p', c);
    expect(avecArme).toBeGreaterThan(sansRien);
    // Hors de sa lignée : `canWearAdvGear` la refuse (`wornGear`, appelé par
    // `companionPairs`, l'ignore) → l'affectation candidate n'atteint jamais le combat.
    const interdite = piece('q', { level: 60, lineage: 'archer', effect: arme.effect });
    const avecInterdite = adventurerGearPower([a], a, 'weapon', 'q', ctx([interdite]));
    expect(avecInterdite).toBe(sansRien);
  });
  it('rend EXACTEMENT ce que rendrait `adventurerPowers` sur le vivier modifié — jamais une formule recopiée', () => {
    const a = { ...adv('a', ['guerrier']), level: 40 };
    const b = { ...adv('b', ['archer']), level: 30 };
    const advs = [a, b];
    const arme = piece('p', { level: 40, effect: { type: 'damage_pct', value: 25 } });
    const c = ctx([arme]);
    const fast = adventurerGearPower(advs, a, 'weapon', 'p', c);
    const modified = advs.map((x) => (x.id === 'a' ? { ...x, gear: { weapon: 'p' } } : x));
    const slow = adventurerPowers(modified, c).get('a')!;
    expect(fast).toBe(slow);
  });
  it('les PAIRES viennent du VIVIER COMPLET — une pièce revendiquée PLUS TÔT dans le vivier ne compte pas deux fois pour la cible', () => {
    // Même id assigné aux deux (dérive de données possible) : `wornGear` l'attribue au
    // PREMIER de la liste (`a`, avant `b`) — `b` n'y a jamais droit, quel que soit le calcul.
    const a = { ...adv('a', ['guerrier'], { weapon: 'p' }), level: 40 };
    const b = { ...adv('b', ['guerrier'], { weapon: 'p' }), level: 40 };
    const arme = piece('p', { level: 40, effect: { type: 'damage_pct', value: 40 } });
    const c = ctx([arme]);
    const sansArme = adventurerGearPower([a, b], b, 'weapon', undefined, c);
    const avecArme = adventurerGearPower([a, b], b, 'weapon', 'p', c);
    // Si les paires se calculaient sur `[b]` SEULE (en ignorant `a`), `b` obtiendrait
    // l'arme et ce test échouerait : c'est exactement ce qu'il verrouille.
    expect(avecArme).toBe(sansArme);
  });
});

describe('confier au mieux : l’équipement', () => {
  const ctx = (advGear: AdvGear[]): CompanionCtx => ({
    familiars: [],
    talents: [],
    kennelLevel: 0,
    now: 0,
    advGear,
  });
  it('donne à chacun la meilleure pièce PERMISE de sa lignée, une pièce par porteur', () => {
    const a = { ...adv('a', ['guerrier']), level: 50 };
    const b = { ...adv('b', ['archer']), level: 50 };
    // ⚠️ 'c' est un second GUERRIER, exactement au niveau de 'a' : il rivalise pour les
    // MÊMES pièces. Sans lui, « une pièce par porteur » n'est jamais mise à l'épreuve —
    // avec 'a' et 'b' seuls, aucune pièce n'est éligible pour les deux à la fois, donc
    // retirer le garde `taken.has(c.g.id)` ne changerait rien à voir.
    const c = { ...adv('c', ['guerrier']), level: 50 };
    const stock = [
      piece('faible', { level: 50, effect: { type: 'damage_pct', value: 5 } }),
      piece('forte', { level: 50, effect: { type: 'damage_pct', value: 30 } }),
      piece('arc', { lineage: 'archer', level: 50, effect: { type: 'damage_pct', value: 20 } }),
      piece('trop_rare', {
        level: 50,
        rarity: 'epique',
        effect: { type: 'damage_pct', value: 99 },
      }),
    ];
    const plan = autoAdvGear([a, b, c], ctx(stock));
    expect(plan.get('a')?.weapon).toBe('forte');
    expect(plan.get('b')?.weapon).toBe('arc');
    // 'forte' est déjà prise par 'a' : 'c' hérite de 'faible', jamais deux fois la même
    // pièce.
    expect(plan.get('c')?.weapon).toBe('faible');
  });
});

describe('sources d’équipement', () => {
  const corpse = (i: number, over: Partial<Corpse> = {}): Corpse => ({
    id: `c${i}`,
    emoji: '🗡️',
    name: 'Coupe-jarret',
    level: 30,
    x: 0,
    y: 0,
    ...over,
  });
  it('les corps d’un siège en laissent, seulement des lignées du vivier', () => {
    const corpses = Array.from({ length: 400 }, (_, i) => corpse(i));
    const v = [adv('a', ['mage'])];
    const l = lootCorpses(corpses, 'bandits', 30, 9, 0, v);
    expect(l.advGear.length).toBeGreaterThan(0);
    for (const g of l.advGear) expect(g.lineage).toBe('mage');
    expect(lootCorpses(corpses, 'bandits', 30, 9, 0, []).advGear).toHaveLength(0);
  });
  it('taux par corps et par champion', () => {
    expect(ADV_GEAR_DROP.champion).toBeGreaterThan(ADV_GEAR_DROP.corpse);
  });
  it('⚠️ GÉNÉRATEUR SÉPARÉ pour l’équipement — le reste du butin ne dépend pas du vivier', () => {
    // `pickLineage` ne consomme un tirage QUE si le vivier n’est pas vide : sans vivier,
    // aucune pièce ne peut jamais sortir (elle rend `null` sans lire `rng`), avec vivier
    // le tirage de gear consomme des tirages EN PLUS. Si ces tirages venaient à retomber
    // sur le flux principal (celui de l’or, de la ferraille, des objets) au lieu de son
    // propre générateur (`gearRng`), le seul fait d’avoir un vivier ou pas déciderait AUSSI
    // du reste du butin — ce qui n’a aucun sens (un vivier ne change rien à ce qu’un corps
    // a sur lui) et casserait la même graine que ci-dessus.
    const corpses = Array.from({ length: 200 }, (_, i) => corpse(i));
    const sans = lootCorpses(corpses, 'bandits', 30, 9, 0, []);
    const avec = lootCorpses(corpses, 'bandits', 30, 9, 0, [
      adv('a', ['mage']),
      adv('b', ['archer']),
    ]);
    expect(avec.gold).toBe(sans.gold);
    expect(avec.scrap).toBe(sans.scrap);
    expect(avec.summonStones).toBe(sans.summonStones);
    expect(avec.keys).toBe(sans.keys);
    expect(avec.items).toEqual(sans.items);
    // …et le vivier fait bien sortir une pièce : le test n’est pas trivialement vrai.
    expect(sans.advGear).toHaveLength(0);
    expect(avec.advGear.length).toBeGreaterThan(0);
  });
});

describe('⚒️ Équipementier', () => {
  it('la durée raccourcit à chaque niveau sans jamais devenir instantanée', () => {
    for (let L = 1; L < 100; L++) expect(outfitterMsFor(L + 1)).toBeLessThan(outfitterMsFor(L));
    expect(outfitterMsFor(100)).toBeGreaterThan(OUTFITTER.baseMs * (1 - OUTFITTER.speedMax));
  });
  it('transforme un objet du héros en pièce de la lignée visée, rang autour de SON niveau', () => {
    const cible = { ...adv('a', ['archer']), level: 12 };
    const hero = {
      id: 'h',
      slot: 'relic',
      name: 'Relique',
      emoji: '💀',
      rarity: 'primordial',
      level: 90,
      baseLevel: 90,
      effect: { type: 'crit_pct', value: 30 },
    } as const;
    const g = outfitFromItem(mulberry32(4), hero as never, cible, 90)!;
    expect(g.lineage).toBe('archer');
    expect(g.slot).toBe('accessory');
    expect(g.level).toBeLessThanOrEqual(12 + 9);
    expect(outfitSlot('familiar')).toBeNull();
  });
  it('règlement idempotent : rien avant l’échéance, la pièce au stock après', () => {
    const piece0 = rollAdvGear(mulberry32(1), { lineage: 'mage', level: 10, playerLevel: 10 });
    const s = { stock: [], forge: { until: 100, advId: 'a', piece: piece0 } };
    expect(settleOutfit(s, 99)).toBe(s);
    const done = settleOutfit(s, 100);
    expect(done.stock).toHaveLength(1);
    expect(done.forge).toBeNull();
    expect(settleOutfit(done, 200)).toBe(done);
  });
  it('sans lignée ou objet 🔒/familier, rien à fabriquer', () => {
    const cible = { ...adv('a', ['archer']), level: 12 };
    const orpheline = { ...adv('b', []), level: 12 };
    const arme = {
      id: 'w',
      slot: 'weapon',
      name: 'Épée',
      emoji: '🗡️',
      rarity: 'rare',
      level: 20,
      baseLevel: 20,
      effect: { type: 'damage_pct', value: 10 },
    } as const;
    expect(outfitFromItem(mulberry32(2), arme as never, orpheline, 90)).toBeNull();
    expect(outfitFromItem(mulberry32(2), { ...arme, locked: true } as never, cible, 90)).toBeNull();
  });
  it('la pièce fabriquée reste PORTABLE par la cible — même un objet primordial sur une recrue de haut niveau', () => {
    // ⚠️ Ruling du contrôleur : le rang est tiré autour du NIVEAU de la cible, pas de sa
    // CLASSE — un archer resté à sa classe de départ (commune) mais monté au niveau 95
    // verrait sinon débarquer une pièce quasi primordiale, que `canWearAdvGear` refuserait
    // pour toujours. La fabrication vise un aventurier NOMMÉ : la pièce doit lui aller.
    const cible = { ...adv('a', ['archer']), level: 95 }; // classe commune, très haut niveau
    const hero = {
      id: 'h',
      slot: 'weapon',
      name: 'Arme',
      emoji: '⚔️',
      rarity: 'primordial',
      level: 95,
      baseLevel: 95,
      effect: { type: 'damage_pct', value: 50 },
    } as const;
    for (let seed = 1; seed <= 200; seed++) {
      const g = outfitFromItem(mulberry32(seed), hero as never, cible, 95)!;
      expect(canWearAdvGear(cible, g), `seed ${seed} : ${g.rarity}`).toBe(true);
    }
  });
});
