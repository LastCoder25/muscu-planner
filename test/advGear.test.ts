import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { RARITY_RANK, RANK_ORDER, itemLevelMult, prestigeRankIndex, type Item } from '@/lib/items';
import { ADV_CLASSES, advAvatar, advRarity, type Adventurer } from '@/lib/adventurers';
import { refAdventurer } from '@/lib/caravan';
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
  advGearHasSecondAffix,
  advGearOptions,
  advGearRoles,
  advGearValue,
  advLooks,
  canWearAdvGear,
  pendingAdvGear,
  lineageOf,
  normalizeAdvGearState,
  outfitFromItem,
  outfitRank,
  outfitOptions,
  advGearCells,
  nextForgeUntil,
  rollAdvGearDrop,
  outfitSlot,
  outfitterMsFor,
  outfitGoldCost,
  planOutfitBatch,
  advGearSellValue,
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
  it('chaque lignée a ses QUATRE pièces (relique comprise, v0.881), nommées et distinctes', () => {
    expect(ADV_GEAR_SLOTS).toEqual(['weapon', 'armor', 'accessory', 'relic']);
    for (const def of Object.values(LINEAGE_GEAR)) {
      const names = ADV_GEAR_SLOTS.map((s) => def.pieces[s].name);
      expect(new Set(names).size).toBe(4);
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
  it('⚠️ les lignées sont EXACTEMENT les classes de strate 0 de la table des classes', () => {
    // Une classe de départ ajoutée sans lignée d'équipement ne pourrait rien porter ; une
    // lignée qui ne serait pas une classe de départ ne serait jamais tirée.
    const roots = ADV_CLASSES.filter((c) => c.stratum === 0).map((c) => c.id);
    expect([...Object.keys(LINEAGE_GEAR)].sort()).toEqual([...roots].sort());
    for (const id of roots) expect(lineageOf(adv('r', [id]))).toBe(id);
    for (const c of ADV_CLASSES.filter((k) => k.stratum > 0))
      expect(lineageOf(adv('x', [c.id])), c.id).toBeNull();
  });
});

describe('tirage', () => {
  it('rang sur la courbe des compagnons : jamais plus d’un rang au-dessus du joueur, stat du pool', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 400; i++) {
      const g = rollAdvGear(rng, { lineage: 'mage', level: 12, playerLevel: 12 });
      expect(RARITY_RANK[g.rarity]).toBeLessThanOrEqual(prestigeRankIndex(12) + 1);
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

describe('butin : pièce tombée (siège, embuscade)', () => {
  // Un vivier réaliste : des aventuriers promus au mieux (trois lignées), plus une recrue
  // restée commune dans une lignée où personne d'autre ne l'accompagne.
  const vivier = (L: number) => [
    refAdventurer(L, 0),
    refAdventurer(L, 1),
    refAdventurer(L, 2),
    { ...adv('recrue', ['mage']), level: L },
  ];
  it('toute pièce tombée est PORTABLE par au moins un aventurier du vivier', () => {
    let pieces = 0;
    for (const L of [1, 3, 8, 12, 20, 26, 35, 45, 60, 70, 90]) {
      const v = vivier(L);
      for (let s = 1; s <= 150; s++) {
        const g = rollAdvGearDrop(mulberry32(s * 7919 + L), v, {
          chance: 1,
          level: L + (s % 8),
          luck: s % 2 ? 0.45 : 0.1,
          playerLevel: L,
        });
        if (!g) continue;
        pieces++;
        expect(
          v.some((a) => canWearAdvGear(a, { ...g, id: 'g' })),
          `L${L} s${s} ${g.lineage} ${g.rarity}`,
        ).toBe(true);
      }
    }
    expect(pieces).toBeGreaterThan(1000);
  });
  it('⚠️ plafonnée à la meilleure classe de SA lignée — une recrue commune seule ne reçoit que du commun', () => {
    const recrue = { ...adv('r', ['archer']), level: 60 };
    for (let s = 1; s <= 200; s++) {
      const g = rollAdvGearDrop(mulberry32(s), [recrue], {
        chance: 1,
        level: 60,
        luck: 0.45,
        playerLevel: 60,
      })!;
      expect(g.rarity).toBe('commun');
      // Valeurs RECALCULÉES au rang plafonné, pas celles du rang tiré.
      expect(g.effect.value).toBe(advGearValue(g.effect.type, 'commun', g.roll));
      expect(g.effect2).toBeUndefined();
    }
  });
  it('⚠️ sur la courbe des compagnons : jamais plus d’un rang au-dessus du rang du joueur', () => {
    // Vivier au sommet de l'arbre : le plafond de classe ne mord pas, seule la courbe borne.
    const v = [refAdventurer(100, 0), refAdventurer(100, 1), refAdventurer(100, 2)];
    for (const L of [12, 30, 45]) {
      for (let s = 1; s <= 300; s++) {
        const g = rollAdvGearDrop(mulberry32(s * 31 + L), v, {
          chance: 1,
          level: L + 10,
          luck: 0.45,
          playerLevel: L,
        })!;
        expect(RARITY_RANK[g.rarity], `L${L} ${g.rarity}`).toBeLessThanOrEqual(
          prestigeRankIndex(L) + 1,
        );
      }
    }
  });
  it('rien pour un vivier vide, ni quand le tirage de chance échoue', () => {
    for (let s = 1; s <= 100; s++) {
      expect(
        rollAdvGearDrop(mulberry32(s), [], { chance: 1, level: 30, luck: 0.4, playerLevel: 30 }),
      ).toBeNull();
      expect(
        rollAdvGearDrop(mulberry32(s), vivier(30), {
          chance: 0,
          level: 30,
          luck: 0.4,
          playerLevel: 30,
        }),
      ).toBeNull();
    }
  });
});

describe('relecture du jsonb au chargement', () => {
  it('écarte les entrées de stock malformées et les fabrications incomplètes', () => {
    const ok = piece('ok');
    const s = normalizeAdvGearState({
      stock: [
        ok,
        { slot: 'weapon', effect: {} },
        { id: 'x', effect: {} },
        { id: 'y', slot: 'armor' },
        null,
        3,
      ],
      forge: { advId: 'a', until: 10 },
    });
    expect(s.stock).toEqual([ok]);
    expect(s.forges).toEqual([]);
    expect(normalizeAdvGearState({ stock: [], forge: { piece: {}, advId: 'a' } }).forges).toEqual(
      [],
    );
    // ⚠️ L'ancienne forge UNIQUE rejoint la file : une fabrication lancée avant la mise à jour
    // ne se perd pas. La file est triée par échéance.
    const f = { piece: {}, advId: 'a', until: 5 };
    const g = { piece: {}, advId: 'b', until: 3 };
    expect(normalizeAdvGearState({ stock: [], forge: f }).forges).toEqual([f]);
    expect(normalizeAdvGearState({ stock: [], forges: [f], forge: g }).forges).toEqual([g, f]);
    expect(normalizeAdvGearState(null)).toEqual({ stock: [], forges: [] });
    expect(normalizeAdvGearState({ stock: {} })).toEqual({ stock: [], forges: [] });
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

describe('🖼️ le portrait montre l’équipement porté (v0.865)', () => {
  /** Une lignée valide de n classes partant de `root` (chaque classe descend de la précédente). */
  function lignee(root: string, n: number): string[] {
    const r = ADV_CLASSES.find((c) => c.id === root)!;
    const out = [r.id];
    const tags = new Set(r.tags);
    for (let st = 1; out.length < n; st++) {
      const next = ADV_CLASSES.find(
        (c) => c.stratum === st && (c.req ?? []).every((t) => tags.has(t)),
      );
      if (!next) break;
      out.push(next.id);
      next.tags.forEach((t) => tags.add(t));
    }
    return out;
  }

  it('⚠️ une pièce PORTÉE remplace l’habillage de classe de son emplacement', () => {
    // Deux classes : habillage arme = commun, armure = inhabituel. On porte une armure COMMUNE.
    const path = lignee('guerrier', 2);
    expect(path.length).toBe(2);
    const cuirasse = piece('c', { slot: 'armor', name: 'Cuirasse', emoji: '🥋' });
    const a = adv('a', path, { armor: 'c' });
    expect(advAvatar(a).gear.armor).toBe('inhabituel');
    const look = advLooks([a], [cuirasse]).get('a')!;
    expect(look.gear.armor).toEqual({ rarity: 'commun', piece: cuirasse });
    // L'emplacement sans pièce garde l'habillage de classe.
    expect(look.gear.weapon).toEqual({ rarity: advAvatar(a).gear.weapon, piece: null });
  });

  it('l’arme portée donne sa FORME, lignée par lignée ; sans arme, la lame d’avant', () => {
    const attendu = {
      guerrier: 'lame',
      archer: 'arc',
      mage: 'baton',
      homme_armes: 'masse',
      eclaireur: 'dague',
      caravanier: 'baton',
    } as const;
    for (const [l, kind] of Object.entries(attendu)) {
      const w = piece('w', { lineage: l as AdvGear['lineage'] });
      const a = adv('a', [l], { weapon: 'w' });
      expect(advLooks([a], [w]).get('a')!.weaponKind, l).toBe(kind);
      expect(advLooks([adv('a', [l])], [w]).get('a')!.weaponKind, l).toBe('lame');
    }
  });

  it('⚠️ une pièce NON portable (règles de `wornGear`) ne s’affiche pas', () => {
    const recrue = adv('a', ['guerrier'], { weapon: 'rare', armor: 'arc' });
    const stock = [
      piece('rare', { rarity: 'epique' }), // trop rare pour une classe commune
      piece('arc', { lineage: 'archer', slot: 'armor' }), // autre lignée
    ];
    const look = advLooks([recrue], stock).get('a')!;
    expect(look.gear.weapon).toEqual({ rarity: 'commun', piece: null });
    expect(look.gear.armor).toBeUndefined();
    expect(look.weaponKind).toBe('lame');
    // Une pièce assignée à deux porteurs n'habille que le premier (celui que le combat retient).
    const p = piece('p', { slot: 'armor' });
    const b1 = adv('b1', ['guerrier'], { armor: 'p' });
    const b2 = adv('b2', ['guerrier'], { armor: 'p' });
    const m = advLooks([b1, b2], [p]);
    expect(m.get('b1')!.gear.armor?.piece).toBe(p);
    expect(m.get('b2')!.gear.armor).toBeUndefined();
  });

  it('sans pièce : exactement l’habillage de classe d’avant (`advAvatar`)', () => {
    const roots = ADV_CLASSES.filter((c) => c.stratum === 0).map((c) => c.id);
    for (const r of roots)
      for (const n of [1, 2, 3, 4, 6]) {
        const a = adv('a', lignee(r, n));
        const base = advAvatar(a);
        const look = advLooks([a], [piece('x')]).get('a')!;
        expect(look.profile).toBe(base.profile);
        expect(look.weaponKind).toBe('lame');
        expect(
          Object.fromEntries(Object.entries(look.gear).map(([s, v]) => [s, v.rarity])),
        ).toEqual(base.gear);
        expect(Object.values(look.gear).every((v) => v.piece === null)).toBe(true);
      }
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

describe('🗡️ grille 2×2 du portrait', () => {
  it('4 cases dans l’ordre des emplacements, pleine si la pièce est portée, sinon la pièce du métier', () => {
    const a = { ...adv('a', ['archer']), level: 10 };
    const arc = piece('arc', { lineage: 'archer', slot: 'weapon', rarity: 'commun' });
    const cells = advGearCells(a, [arc]);
    expect(cells.map((c) => c.slot)).toEqual(['weapon', 'armor', 'accessory', 'relic']);
    expect(cells[0]!.filled).toBe(true);
    expect(cells[0]!.piece?.id).toBe('arc');
    expect(cells[0]!.rank).toBeTruthy();
    expect(cells[1]!.filled).toBe(false);
    expect(cells[3]!.name).toBe(LINEAGE_GEAR.archer.pieces.relic.name);
  });
});

describe('⚒️ Équipementier', () => {
  it('la durée raccourcit à chaque niveau sans jamais devenir instantanée', () => {
    for (let L = 1; L < 100; L++) expect(outfitterMsFor(L + 1)).toBeLessThan(outfitterMsFor(L));
    expect(outfitterMsFor(100)).toBeGreaterThan(OUTFITTER.baseMs * (1 - OUTFITTER.speedMax));
  });
  it('transforme un objet du héros en pièce de la lignée visée, sur le MÊME emplacement', () => {
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
    expect(g.slot).toBe('relic');
    expect(g.level).toBeLessThanOrEqual(12 + 9);
    expect(outfitSlot('familiar')).toBeNull();
    expect(outfitSlot('trophy')).toBeNull();
    for (const s of ['weapon', 'armor', 'accessory', 'relic'] as const)
      expect(outfitSlot(s)).toBe(s);
  });
  it('rang de la pièce : celui de l’aventurier, jamais au-dessus de l’objet fourni', () => {
    // Aventurier promu (classe au-dessus du commun) : un objet primordial donne SA classe, un objet commun du commun.
    const rare = refAdventurer(40, 1);
    const item = (rarity: string) =>
      ({
        id: 'i',
        slot: 'weapon',
        name: 'Arme',
        emoji: '⚔️',
        rarity,
        level: 40,
        baseLevel: 40,
        effect: { type: 'damage_pct', value: 10 },
      }) as never;
    const cls = advRarity(rare);
    expect(RARITY_RANK[cls]).toBeGreaterThan(0);
    expect(outfitRank(item('primordial'), rare)).toBe(cls);
    expect(outfitRank(item(cls), rare)).toBe(cls);
    expect(outfitRank(item('commun'), rare)).toBe('commun');
    // Déterministe : chaque tirage sort AU rang annoncé, seul le jet varie.
    for (let seed = 1; seed <= 60; seed++) {
      expect(outfitFromItem(mulberry32(seed), item('primordial'), rare, 40)!.rarity).toBe(cls);
      expect(outfitFromItem(mulberry32(seed), item('commun'), rare, 40)!.rarity).toBe('commun');
    }
  });
  it('ordre conseillé : pièce au rang de l’aventurier d’abord, emplacement vide, objet le moins précieux', () => {
    const cible = { ...refAdventurer(40, 1), gear: { weapon: 'x' } };
    const cls = advRarity(cible);
    const portee = {
      ...piece('x', { slot: 'weapon', rarity: 'commun' }),
      lineage: lineageOf(cible)!,
    };
    const up = RANK_ORDER[Math.min(RANK_ORDER.length - 1, RARITY_RANK[cls] + 2)]!;
    const it = (id: string, slot: string, rarity: string) =>
      ({
        id,
        slot,
        name: id,
        emoji: '⚔️',
        rarity,
        level: 40,
        baseLevel: 40,
        effect: { type: 'damage_pct', value: 10 },
      }) as never;
    const rows = outfitOptions(
      [
        it('bas', 'armor', 'commun'),
        it('precieux', 'armor', up),
        it('juste', 'armor', cls),
        it('occupe', 'weapon', cls),
        it('fam', 'familiar', cls),
        { ...(it('lock', 'armor', cls) as object), locked: true } as never,
      ],
      cible,
      [portee],
      [],
    );
    expect(rows.map((r) => r.item.id)).toEqual(['juste', 'precieux', 'occupe', 'bas']);
    expect(rows.find((r) => r.item.id === 'bas')!.capped).toBe(true);
    expect(rows.find((r) => r.item.id === 'bas')!.rank).toBe('commun');
    expect(rows.find((r) => r.item.id === 'precieux')!.rank).toBe(cls);
    expect(rows.find((r) => r.item.id === 'occupe')!.emptySlot).toBe(false);
  });
  it('chaque objet dit ce qu’il remplace : vide, mieux, même rang ou moins bien que la pièce portée', () => {
    const cible = refAdventurer(40, 1);
    const cls = advRarity(cible);
    const lineage = lineageOf(cible)!;
    const low = RANK_ORDER[Math.max(0, RARITY_RANK[cls] - 1)]!;
    const high = RANK_ORDER[Math.min(RANK_ORDER.length - 1, RARITY_RANK[cls] + 1)]!;
    const it = (id: string, slot: string) =>
      ({
        id,
        slot,
        name: id,
        emoji: '⚔️',
        rarity: cls,
        level: 40,
        baseLevel: 40,
        effect: { type: 'damage_pct', value: 10 },
      }) as never;
    const worn = [
      { ...piece('w', { slot: 'weapon', rarity: low }), lineage },
      { ...piece('a', { slot: 'armor', rarity: cls }), lineage },
      { ...piece('c', { slot: 'accessory', rarity: high }), lineage },
    ];
    const forges = [
      { until: 1, advId: cible.id, piece: { ...worn[1]!, slot: 'relic' as const } },
      { until: 2, advId: 'autre', piece: { ...worn[1]!, slot: 'relic' as const } },
    ];
    const rows = outfitOptions(
      [it('arme', 'weapon'), it('armure', 'armor'), it('acc', 'accessory'), it('rel', 'relic')],
      cible,
      worn,
      forges,
    );
    const by = (id: string) => rows.find((r) => r.item.id === id)!;
    if (low !== cls) expect(by('arme').verdict).toBe('up');
    expect(by('armure').verdict).toBe('same');
    if (high !== cls) expect(by('acc').verdict).toBe('down');
    expect(by('rel').verdict).toBe('empty');
    expect(by('armure').current?.id).toBe('a');
    expect(by('rel').current).toBeUndefined();
    expect(by('rel').queued).toBe(1); // la file d'un AUTRE aventurier ne compte pas
    expect(by('arme').queued).toBe(0);
    // Ordre : vide, puis mieux, puis même rang, puis moins bien.
    expect(rows.map((r) => r.item.id)).toEqual(['rel', 'arme', 'armure', 'acc']);
  });
  it('les fabrications se mettent en FILE : chacune après la précédente', () => {
    const d = outfitterMsFor(10);
    expect(nextForgeUntil([], 1000, 10)).toBe(1000 + d);
    const p = rollAdvGear(mulberry32(1), { lineage: 'mage', level: 10, playerLevel: 10 });
    const q = [{ until: 1000 + d, advId: 'a', piece: p }];
    expect(nextForgeUntil(q, 1000, 10)).toBe(1000 + 2 * d);
    // Une file terminée ne retarde rien.
    expect(nextForgeUntil(q, 1000 + 5 * d, 10)).toBe(1000 + 6 * d);
  });
  it('une fabrication est bien plus courte qu’avant (10 min à neuf)', () => {
    expect(outfitterMsFor(0)).toBe(10 * 60_000);
  });
  it('règlement idempotent : rien avant l’échéance, la pièce au stock après', () => {
    const piece0 = rollAdvGear(mulberry32(1), { lineage: 'mage', level: 10, playerLevel: 10 });
    const s = {
      stock: [],
      forges: [
        { until: 100, advId: 'a', piece: piece0 },
        { until: 150, advId: 'b', piece: piece0 },
      ],
    };
    expect(settleOutfit(s, 99)).toBe(s);
    const one = settleOutfit(s, 100);
    expect(one.stock).toHaveLength(1);
    expect(one.forges.map((f) => f.advId)).toEqual(['b']);
    const done = settleOutfit(one, 200);
    expect(done.stock).toHaveLength(2);
    expect(done.forges).toEqual([]);
    expect(settleOutfit(done, 300)).toBe(done);
    // Deux échues d'un coup (absence) : les deux arrivent, ids distincts.
    const both = settleOutfit(s, 1000);
    expect(new Set(both.stock.map((g) => g.id)).size).toBe(2);
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
    // ⚠️ Le rang est celui de la CLASSE de la cible (v0.881), jamais de son niveau : un
    // archer resté à sa classe de départ mais monté au niveau 95 recevrait sinon une pièce
    // que `canWearAdvGear` refuserait pour toujours. La pièce doit aller à son destinataire.
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

describe('🟤 UNE PIÈCE DE BAS RANG VAUT ENFIN QUELQUE CHOSE (v0.900)', () => {
  it('⚠️ toute pièce porte DEUX stats, quel que soit son rang', () => {
    // Mesuré : un set COMPLET de rang 🟤 Bronze valait **+1,14 % de puissance** contre
    // +18,7 % en 🌟 Divin ancestral — 0,04 niveau d'aventurier contre 10,2, un écart de
    // 250×. La cause n'était pas la petite assiette de stats (un set Bronze vaut 1,55 à
    // 2,09 % du niveau 10 au 80 : une valeur PLATE, donc indépendante de l'assiette) mais
    // le RANG, dont le plus gros levier était le 2ᵉ affixe réservé à 🟡 Or et au-dessus.
    for (const rank of RANK_ORDER) {
      expect(advGearHasSecondAffix(rank), rank).toBe(true);
      const g = rollAdvGear(mulberry32(7), {
        lineage: 'guerrier',
        slot: 'armor',
        level: 20,
        playerLevel: 20,
        rank,
      });
      expect(g.effect2, `pièce de rang ${rank}`).toBeTruthy();
      expect(g.effect2!.type).not.toBe(g.effect.type); // deux canaux distincts
    }
  });

  it('⚠️ le RANG ne pilote plus que la TAILLE des stats, et il le fait toujours', () => {
    // On ne remonte le bas qu'à condition que la progression reste lisible : une pièce d'un
    // rang supérieur doit rester strictement meilleure, sinon le rang cesse de vouloir dire
    // quelque chose — c'est précisément ce que l'app affiche depuis qu'elle parle en rangs.
    const val = (rank: (typeof RANK_ORDER)[number]) => advGearValue('max_pv_pct', rank, 0.5);
    for (let i = 1; i < RANK_ORDER.length; i++)
      expect(val(RANK_ORDER[i]!), RANK_ORDER[i]).toBeGreaterThan(val(RANK_ORDER[i - 1]!));
  });
});

describe('⭐ une pièce d’aventurier se lit en RANG ET ÉTOILES', () => {
  it('la case porte le grade complet, comme un objet du héros', () => {
    // ⚠️ Les étoiles ne sont pas décoratives : une pièce porte un JET qui décide d'une part
    // de sa valeur. Sans elles, deux pièces « Bronze » de jets opposés se lisaient pareil —
    // le défaut que la v0.895 avait corrigé côté héros et qui survivait ici.
    const a = { ...adv('a', ['archer']), level: 10 };
    const bas = piece('bas', { lineage: 'archer', slot: 'weapon', rarity: 'commun', roll: 0.05 });
    const haut = piece('haut', { lineage: 'archer', slot: 'weapon', rarity: 'commun', roll: 0.95 });
    const rBas = advGearCells(a, [bas])[0]!.rank!;
    const rHaut = advGearCells(a, [haut])[0]!.rank!;
    expect(rBas).toContain('★');
    expect(rHaut).toContain('★');
    // Même rang, jets opposés → deux étiquettes DIFFÉRENTES : c'est tout l'objet.
    expect(rBas).not.toBe(rHaut);
    expect(advGearCells(a, [haut])[0]!.title).toContain(rHaut);
  });
});

describe('💰⚒️ L’ÉQUIPEMENTIER SE PAIE EN OR, ET ON PEUT TOUT LANCER D’UN COUP', () => {
  const item = (id: string, over: Partial<Item> = {}): Item => ({
    id,
    slot: 'weapon',
    name: 'Lame',
    emoji: '🗡️',
    rarity: 'commun',
    roll: 0.5,
    level: 20,
    effect: { type: 'damage_pct', value: 10 },
    ...over,
  });

  it('⚠️ FORGER PUIS REVENDRE NE FABRIQUE JAMAIS D’OR — l’invariant non négociable', () => {
    // Sans cette marge, l'Équipementier devient une imprimante à or et toute l'économie
    // part en boucle. On l'éprouve au JET PARFAIT (la revente la plus chère possible).
    for (const rank of RANK_ORDER) {
      for (const level of [1, 20, 50, 100]) {
        const cost = outfitGoldCost(rank, level);
        const best = advGearSellValue(piece('x', { rarity: rank, roll: 1, level }));
        expect(cost, `${rank} niv ${level}`).toBeGreaterThan(best);
      }
    }
  });

  it('le coût suit le RANG et le NIVEAU, et dérive de la table de valeur du projet', () => {
    for (let i = 1; i < RANK_ORDER.length; i++)
      expect(outfitGoldCost(RANK_ORDER[i]!, 20)).toBeGreaterThan(
        outfitGoldCost(RANK_ORDER[i - 1]!, 20),
      );
    expect(outfitGoldCost('rare', 60)).toBeGreaterThan(outfitGoldCost('rare', 10));
    // ⚠️ DÉRIVÉ, jamais une seconde échelle de prix : si la valeur d'un rang bouge, le coût suit.
    // Forger coute goldK fois ce que la piece se REVENDRAIT (jet nul) : les deux lisent la
    // meme table de valeur, donc regler l'une deplace l'autre.
    const revente = advGearSellValue(piece('ref', { rarity: 'rare', roll: 0, level: 30 }));
    expect(outfitGoldCost('rare', 30) / revente).toBeCloseTo(OUTFITTER.goldK, 1);
  });

  it('le lot remplit les VIDES et remplace ce qui est MOINS BON, jamais l’égal', () => {
    // Un archer argent (2 classes) qui ne porte qu'une arme commune : l'arme doit être
    // remplacée (« il porte du bronze et il est passé argent »), les 3 autres remplies.
    const a = { ...adv('a', ['guerrier', 'epeiste']), gear: { weapon: 'w0' } };
    const worn = [piece('w0', { slot: 'weapon', rarity: 'commun' })];
    const sac = ADV_GEAR_SLOTS.map((s, i) => item('i' + i, { slot: s, rarity: 'rare' }));
    const plan = planOutfitBatch(sac, a, worn, []);
    expect(plan.jobs.map((j) => j.slot).sort()).toEqual([...ADV_GEAR_SLOTS].sort());
    expect(plan.jobs.every((j) => j.verdict === 'empty' || j.verdict === 'up')).toBe(true);
    expect(plan.gold).toBe(plan.jobs.reduce((s, j) => s + outfitGoldCost(j.rank, a.level), 0));
    // Une pièce de MÊME rang que ce qu'il porte n'est pas refaite : ça détruirait un objet
    // et coûterait de l'or pour rien.
    const dejaBien = ADV_GEAR_SLOTS.map((s) => piece('p' + s, { slot: s, rarity: 'inhabituel' }));
    const a2 = {
      ...a,
      gear: Object.fromEntries(ADV_GEAR_SLOTS.map((s) => [s, 'p' + s])) as Adventurer['gear'],
    };
    expect(planOutfitBatch(sac, a2, dejaBien, []).jobs).toHaveLength(0);
  });

  it('⚠️ un objet ne sert qu’UNE fois, et un emplacement DÉJÀ EN FILE n’est pas repris', () => {
    const a = adv('a', ['guerrier']);
    // Deux objets pour le MÊME emplacement : un seul doit être retenu.
    const sac = [item('i1', { slot: 'weapon' }), item('i2', { slot: 'weapon' })];
    expect(planOutfitBatch(sac, a, [], []).jobs).toHaveLength(1);
    // Une arme déjà commandée → on n'en recommande pas une seconde.
    const enFile = [
      {
        until: 1,
        advId: 'a',
        piece: piece('q', { slot: 'weapon' }) as Omit<AdvGear, 'id'>,
      },
    ];
    expect(planOutfitBatch(sac, a, [], enFile).jobs).toHaveLength(0);
  });

  it('le lot suit l’ORDRE CONSEILLÉ : il sacrifie l’objet le MOINS précieux', () => {
    // ⚠️ Aucune heuristique propre au lot : il balaie `outfitOptions`. Deux objets donnent
    // la même pièce → c'est le moins cher qui part.
    const a = adv('a', ['guerrier', 'epeiste']); // classe inhabituel
    const sac = [
      item('cher', { slot: 'weapon', rarity: 'legendaire' }),
      item('modeste', { slot: 'weapon', rarity: 'inhabituel' }),
    ];
    expect(planOutfitBatch(sac, a, [], []).jobs[0]!.item.id).toBe('modeste');
  });
});

describe('🗡️ ce qui attend un porteur (pendingAdvGear)', () => {
  // ⚠️ Constaté sur le compte réel : un archer sans arme alors qu'un arc portable dormait
  // en stock — « Confier au mieux » ne se relance pas quand une forge se termine, et rien
  // ne distinguait ce cas d'un emplacement vide parfaitement normal.
  it('signale l’emplacement vide qu’une pièce du stock peut remplir', () => {
    const a = adv('a', ['guerrier']);
    expect(pendingAdvGear([a], [piece('p')]).get('a')).toEqual(['weapon']);
  });

  it('⚠️ une pièce DÉJÀ PORTÉE (par lui ou par un autre) ne compte pas', () => {
    const p1 = piece('p1');
    // Par lui : son emplacement n'est plus vide.
    expect(pendingAdvGear([adv('a', ['guerrier'], { weapon: 'p1' })], [p1]).size).toBe(0);
    // Par un AUTRE : promettre un remplissage qui n'aura pas lieu serait un mensonge.
    const porte = adv('a', ['guerrier'], { weapon: 'p1' });
    const nu = adv('b', ['guerrier']);
    expect(pendingAdvGear([porte, nu], [p1]).size).toBe(0);
    // Avec DEUX pièces, le second est servi — et le PREMIER, déjà armé, n'est pas signalé.
    // ⚠️ Ce dernier point est le seul qui éprouve la garde « emplacement déjà pourvu » :
    // partout ailleurs la pièce portée sort de toute façon du stock disponible, ce qui la
    // masque. Sans lui, l'écran annoncerait « une arme attend » à un aventurier armé.
    const deux = pendingAdvGear([porte, nu], [p1, piece('p2')]);
    expect(deux.get('b')).toEqual(['weapon']);
    expect(deux.has('a')).toBe(false);
  });

  it('⚠️ rien à signaler quand la pièce lui est INTERDITE — un vide peut être normal', () => {
    const guerrier = adv('a', ['guerrier']);
    expect(pendingAdvGear([guerrier], [piece('p', { lineage: 'archer' })]).size).toBe(0);
    expect(pendingAdvGear([guerrier], [piece('p', { rarity: 'inhabituel' })]).size).toBe(0);
  });

  it('⚠️ une pièce portée mais devenue INVALIDE laisse son emplacement vide', () => {
    // `wornGear` ignore une pièce hors lignée : l'emplacement l'est donc en pratique, et
    // une pièce valide du stock doit être signalée.
    const a = adv('a', ['guerrier'], { weapon: 'faux' });
    expect(
      pendingAdvGear([a], [piece('faux', { lineage: 'archer' }), piece('bon')]).get('a'),
    ).toEqual(['weapon']);
  });

  it('plusieurs emplacements à la fois, et rien quand le stock est vide', () => {
    const a = adv('a', ['guerrier']);
    const slots = pendingAdvGear([a], [piece('w'), piece('r', { slot: 'relic' })]).get('a');
    expect(slots).toEqual(['weapon', 'relic']);
    expect(pendingAdvGear([a], []).size).toBe(0);
  });

  it('⚠️ elle est d’accord avec l’auto-équipement : ce qu’elle signale, le plan le remplit', () => {
    // Sinon l'écran annoncerait « il y a à faire » et le bouton ne ferait rien.
    const advs = [adv('a', ['guerrier']), adv('b', ['archer'])];
    const stock = [piece('w1'), piece('w2', { lineage: 'archer', name: 'Arc' })];
    const ctx = { familiars: [], talents: [], kennelLevel: 1, now: 0, advGear: stock };
    const plan = autoAdvGear(advs, ctx);
    for (const [id, slots] of pendingAdvGear(advs, stock))
      for (const s of slots) expect(plan.get(id)?.[s], `${id}/${s}`).toBeTruthy();
  });
});
