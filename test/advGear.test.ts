import { describe, it, expect } from 'vitest';
import { GRADE_COLOR, PULL_GRADES } from '@/data/champions';
import { mulberry32 } from '@/lib/combat';
import { RARITY_RANK, RANK_ORDER, itemLevelMult } from '@/lib/items';
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
  ADV_GEAR_SLOTS,
  LINEAGE_GEAR,
  advGearEffects,
  advGearHasSecondAffix,
  advGearLevelBand,
  advGearOptions,
  advGearRoles,
  advGearValue,
  advLooks,
  canWearAdvGear,
  pendingAdvGear,
  lineageOf,
  makeAdvGear,
  normalizeAdvGearState,
  advGearCells,
  pickLineage,
  rollGachaPiece,
  wornGear,
  type AdvGear,
  advGearRankStar,
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
  name: 'Épée courte',
  emoji: '🗡️',
  rarity: 'commun',
  grade: 'B',
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

describe('🗡️ une pièce = un MODÈLE, sans jet (v0.1012)', () => {
  it('deux pièces du même modèle au même rang sont IDENTIQUES — la condition d’un doublon', () => {
    for (const lineage of Object.keys(LINEAGE_GEAR) as AdvGear['lineage'][])
      for (const slot of ADV_GEAR_SLOTS)
        for (const rank of RANK_ORDER)
          for (const grade of PULL_GRADES) {
            const a = makeAdvGear({ lineage, slot, rank, grade });
            const b = makeAdvGear({ lineage, slot, rank, grade });
            expect(a).toEqual(b);
            expect(a).not.toHaveProperty('roll');
          }
  });
  it('les stats sont ÉCRITES par le modèle : la 1ʳᵉ du pool, puis la 2ᵉ', () => {
    for (const [lineage, def] of Object.entries(LINEAGE_GEAR) as [
      AdvGear['lineage'],
      (typeof LINEAGE_GEAR)['mage'],
    ][])
      for (const slot of ADV_GEAR_SLOTS) {
        const g = makeAdvGear({ lineage, slot, rank: 'rare', grade: 'B' });
        expect(g.effect.type).toBe(def.pieces[slot].pool[0]);
        expect(g.effect2?.type).toBe(def.pieces[slot].pool[1]);
      }
  });
  it('la pièce démarre à ★1 de son rang, et son niveau reste dans la tranche du rang', () => {
    for (const rank of RANK_ORDER) {
      const band = advGearLevelBand(rank);
      expect(makeAdvGear({ lineage: 'mage', slot: 'weapon', rank, grade: 'B' }).level).toBe(
        band.min,
      );
      const haut = makeAdvGear({ lineage: 'mage', slot: 'weapon', rank, grade: 'B', level: 999 });
      expect(haut.level).toBe(band.max);
      const bas = makeAdvGear({ lineage: 'mage', slot: 'weapon', rank, grade: 'B', level: -4 });
      expect(bas.level).toBe(band.min);
    }
    // Les tranches se suivent sans trou ni chevauchement (un rang = 10 niveaux)…
    for (let i = 1; i < RANK_ORDER.length; i++)
      expect(advGearLevelBand(RANK_ORDER[i]!).min).toBe(
        advGearLevelBand(RANK_ORDER[i - 1]!).max + 1,
      );
    // …et la dernière rareté court jusqu'au plafond du jeu.
    expect(advGearLevelBand('commun')).toEqual({ min: 1, max: 10 });
    expect(advGearLevelBand('primordial').max).toBe(100);
  });
  it('seules les lignées civiles portent un bonus de rôle, sur l’accessoire', () => {
    expect(LINEAGE_GEAR.eclaireur.role).toBe('speed');
    expect(LINEAGE_GEAR.caravanier.role).toBe('haul');
    expect(LINEAGE_GEAR.guerrier.role).toBeUndefined();
    const acc = makeAdvGear({ lineage: 'caravanier', slot: 'accessory', rank: 'rare', grade: 'B' });
    expect(acc.role?.kind).toBe('haul');
    expect(
      makeAdvGear({ lineage: 'caravanier', slot: 'weapon', rank: 'rare', grade: 'B' }).role,
    ).toBeUndefined();
  });
  it('⚠️ le rang se sent même sur une petite stat (crit, base 4), sans jet', () => {
    // À `ADV_GEAR.k` 0,15 un plancher à 1 écrasait tout : 4 × rareté × 0,15 < 1 en commun
    // comme en légendaire. Le plancher est à 0,1.
    expect(advGearValue('crit_pct', 'legendaire')).toBeGreaterThan(
      advGearValue('crit_pct', 'commun'),
    );
    expect(advGearValue('crit_pct', 'commun')).toBeGreaterThanOrEqual(0.1);
  });
  it('⚠️ la valeur est le PLANCHER du rang — ancrage : aucun jet ne s’y glisse', () => {
    // Comparer `advGearValue` à elle-même ne peut rien attraper (mutation « jet 0,3 » passée
    // au VERT). On ancre donc deux valeurs réelles, plancher du rang × `ADV_GEAR.k` :
    // 10 PV × 0,9 × 0,1125 = 1,0 en commun, 10 × 1,63 × 0,1125 = 1,8 en rare. Un jet même
    // moyen les ferait bouger. ⚠️ Si `ADV_GEAR.k` est recalibré, ces deux chiffres se mettent
    // à jour AVEC lui — c'est leur métier de rougir.
    expect(advGearValue('max_pv_pct', 'commun')).toBe(1);
    expect(advGearValue('max_pv_pct', 'rare')).toBe(1.8);
  });
  it('le tirage de lignée ne choisit que parmi le vivier (rien si vivier vide)', () => {
    const rng = mulberry32(5);
    const v = [adv('a', ['mage']), adv('b', ['mage'])];
    for (let i = 0; i < 50; i++) expect(pickLineage(rng, v)).toBe('mage');
    expect(pickLineage(rng, [])).toBeNull();
  });
});

describe('🎰 la pièce d’un tirage B — la SEULE source d’équipement de champion', () => {
  const vivier = (L: number) => [
    refAdventurer(L, 0),
    refAdventurer(L, 1),
    refAdventurer(L, 2),
    { ...adv('recrue', ['mage']), level: L },
  ];
  it('TOUJOURS Bronze ★1, lettre imposée, lignée du vivier, et PORTABLE — à tout niveau', () => {
    for (const L of [1, 3, 8, 12, 20, 26, 35, 45, 60, 70, 90]) {
      const v = vivier(L);
      const lignees = new Set(v.map(lineageOf));
      for (let s = 1; s <= 80; s++) {
        const g = rollGachaPiece(mulberry32(s * 7919 + L), v, { grade: 'B' });
        expect(g.grade).toBe('B');
        expect(lignees.has(g.lineage)).toBe(true);
        // ⚠️ Décision de l'utilisateur : une pièce naît au PREMIER rang, ★1 — le rang se
        // gagne ensuite (niveau avec son porteur, puis ascension).
        expect(g.rarity).toBe(RANK_ORDER[0]);
        expect(advGearRankStar(g).star).toBe(1);
        expect(
          v.some((a) => canWearAdvGear(a, { ...g, id: 'g' })),
          `L${L} s${s} ${g.lineage} ${g.rarity}`,
        ).toBe(true);
      }
    }
  });
  it('une pièce tirée est exactement le modèle Bronze ★1 de sa lignée et de son emplacement', () => {
    const recrue = { ...adv('r', ['archer']), level: 60 };
    for (let s = 1; s <= 100; s++) {
      const g = rollGachaPiece(mulberry32(s), [recrue], { grade: 'B' });
      expect(g.rarity).toBe('commun');
      expect(g).toEqual(
        makeAdvGear({ lineage: 'archer', slot: g.slot, rank: 'commun', grade: 'B' }),
      );
    }
  });
  it('un compte SANS champion reçoit quand même une pièce (le premier tirage ne rend pas du vide)', () => {
    for (let s = 1; s <= 50; s++) {
      const g = rollGachaPiece(mulberry32(s), [], { grade: 'B' });
      expect(Object.keys(LINEAGE_GEAR)).toContain(g.lineage);
      expect(g.rarity).toBe(RANK_ORDER[0]);
    }
  });
});

describe('relecture du jsonb au chargement', () => {
  it('écarte les entrées de stock malformées', () => {
    const ok = makeAdvGear({ lineage: 'guerrier', slot: 'weapon', rank: 'commun', grade: 'B' });
    const s = normalizeAdvGearState({
      stock: [
        { ...ok, id: 'ok' },
        { slot: 'weapon', effect: {} },
        { id: 'x', effect: {} },
        null,
        3,
      ],
    });
    expect(s.stock).toEqual([{ ...ok, id: 'ok' }]);
    expect(normalizeAdvGearState(null)).toEqual({ stock: [] });
    expect(normalizeAdvGearState({ stock: {} })).toEqual({ stock: [] });
  });
  it('⚠️ une pièce d’avant est remise sur son modèle : plus de jet, stats écrites, niveau dans sa tranche', () => {
    const vieille = {
      id: 'v',
      lineage: 'archer',
      slot: 'armor',
      name: 'Cuir',
      emoji: '🦺',
      rarity: 'rare',
      roll: 0.93,
      level: 55, // hors de la tranche du rang (31-40)
      effect: { type: 'crit_pct', value: 9.9 }, // la 2ᵉ stat du pool, tirée en premier
      locked: true,
    };
    const [g] = normalizeAdvGearState({ stock: [vieille] }).stock;
    expect(g).not.toHaveProperty('roll');
    expect(g).toEqual({
      ...makeAdvGear({ lineage: 'archer', slot: 'armor', rank: 'rare', grade: 'B', level: 55 }),
      id: 'v',
      locked: true,
    });
    expect(g!.level).toBe(advGearLevelBand('rare').max);
    // Idempotente : relire deux fois rend la même pièce.
    expect(normalizeAdvGearState({ stock: [g] }).stock).toEqual([g]);
  });
  it('⚠️ une fabrication PAYÉE de l’ancienne forge rejoint le stock, sans doublon à la relecture', () => {
    const piece0 = makeAdvGear({ lineage: 'mage', slot: 'relic', rank: 'commun', grade: 'B' });
    const raw = {
      stock: [],
      forges: [{ until: 100, advId: 'a', piece: { ...piece0, roll: 0.4 } }],
      forge: { until: 200, advId: 'b', piece: piece0 },
    };
    const s = normalizeAdvGearState(raw);
    expect(s.stock.map((g) => g.id).sort()).toEqual(['forge-100-a', 'forge-200-b']);
    expect(s).not.toHaveProperty('forges');
    // Si l'ancienne file est encore là au chargement suivant, la pièce n'est pas dupliquée.
    expect(normalizeAdvGearState({ ...raw, stock: s.stock }).stock).toHaveLength(2);
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

describe('🚫 plus aucun drop d’équipement de champion (v0.1012)', () => {
  it('les corps d’un siège ne laissent que des objets du HÉROS', () => {
    const corpses: Corpse[] = Array.from({ length: 400 }, (_, i) => ({
      id: `c${i}`,
      emoji: '🗡️',
      name: 'Coupe-jarret',
      level: 30,
      x: 0,
      y: 0,
    }));
    const l = lootCorpses(corpses, 'bandits', 30, 9, undefined);
    expect(l).not.toHaveProperty('advGear');
    expect(l.items.length).toBeGreaterThan(0);
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

describe('🟤 UNE PIÈCE DE BAS RANG VAUT ENFIN QUELQUE CHOSE (v0.900)', () => {
  it('⚠️ toute pièce porte DEUX stats, quel que soit son rang', () => {
    for (const rank of RANK_ORDER) {
      expect(advGearHasSecondAffix(rank), rank).toBe(true);
      const g = makeAdvGear({ lineage: 'guerrier', slot: 'armor', rank, grade: 'B' });
      expect(g.effect2, `pièce de rang ${rank}`).toBeTruthy();
      expect(g.effect2!.type).not.toBe(g.effect.type);
    }
  });
  it('⚠️ le RANG pilote la TAILLE des stats : un rang de plus vaut toujours mieux', () => {
    for (let i = 1; i < RANK_ORDER.length; i++)
      expect(advGearValue('max_pv_pct', RANK_ORDER[i]!), RANK_ORDER[i]).toBeGreaterThan(
        advGearValue('max_pv_pct', RANK_ORDER[i - 1]!),
      );
  });
});

describe('🎰 une pièce de champion se lit en LETTRE (B / A / S), comme les champions', () => {
  it('la case porte la lettre et sa couleur — plus le rang ni les étoiles du héros', () => {
    // Demandé : « les items de champions, comme les champions, ont 3 raretés S/A/B ; les
    // anciennes raretés ne sont plus utilisées ». Avant, la case disait « Bronze ★★☆☆☆ ».
    const a = { ...adv('a', ['archer']), level: 10 };
    for (const g of PULL_GRADES) {
      const p = piece(g, { lineage: 'archer', slot: 'weapon', rarity: 'commun', grade: g });
      const c = advGearCells(a, [p])[0]!;
      expect(c.rank).toBe(g);
      expect(c.rank).not.toContain('★');
      expect(c.color).toBe(GRADE_COLOR[g]);
      expect(c.model).toBe(`archer-weapon-${g.toLowerCase()}`);
    }
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
    const ctx = { kennelLevel: 1, now: 0, advGear: stock };
    const plan = autoAdvGear(advs, ctx);
    for (const [id, slots] of pendingAdvGear(advs, stock))
      for (const s of slots) expect(plan.get(id)?.[s], `${id}/${s}`).toBeTruthy();
  });
});
