# Équipement des aventuriers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner aux aventuriers un équipement propre à leur classe de base (3 emplacements), obtenu en siège, en convoi et à l'Équipementier, compté au combat et dans leur puissance.

**Architecture:** Toute la logique pure vit dans un nouveau module `src/lib/advGear.ts` (types, table par lignée, tirage, effets, règles de port). Le combat le lit par les deux points de passage existants — `pairEffects`/`companionPairs` (rempart et puissance, `raid.ts`) et `roadCompanionEffects` (route, `caravan.ts`) — pour qu'un chiffre affiché soit toujours celui du combat. Le stock est une colonne JSONB additive sur `characters`.

**Tech Stack:** Quasar / Vue 3 `<script setup>` TS strict, Pinia, Supabase (JSONB), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-camps-equipement-aventuriers-design.md` (étape 1)

## Global Constraints

- Réponses et libellés en **français**.
- Toute la logique métier dans `src/lib/` (pure, testée) ; les composants ne font que peindre.
- Migrations Supabase **additives** et numérotées ; la prochaine est `0067`.
- Scripts via `node node_modules/<pkg>/bin/...` (AppLocker) — jamais `npx`/`.cmd`.
- **Aucune nouvelle stat** : les pièces puisent dans les `EffectType` existants (pas d'esquive).
- Rareté d'une pièce **≤ rareté de la classe** de son porteur (même règle que `canAdvTalent`).
- Une pièce ne se porte que par un aventurier de **sa lignée** (`path[0]`).
- Les **convois gardent** `CARAVAN.escortMax` (seuls les futurs camps en seront libérés).
- Toute règle appliquée **au combat autant qu'au store** : une pièce devenue interdite ne compte plus, sans migration.
- Un paramètre de contexte nouveau est **REQUIS**, jamais optionnel (le compilateur désigne les sites).
- Vérifications avant toute annonce : `npm run typecheck` · `npm run lint` · `node node_modules/vitest/vitest.mjs run` · `node node_modules/@quasar/app-vite/bin/quasar.js build` · `npm run smoke` · `npm run dead`.
- Tout réglage d'équilibrage se justifie par une **mesure** avec les vraies libs (sonde jetable supprimée ensuite) ; chaque garantie de calcul est vérifiée **par mutation** (le test doit être vu rouge).
- Worktree : `C:\Users\BTHH2960\Projets\Perso\muscu-planner-equilibre`, branche `camps`. Avant push : `git fetch origin && git rebase origin/main`, version = celle d'`origin/main` + 1.

---

## File Structure

| Fichier                                                             | Rôle                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/lib/items.ts` (modif)                                          | exporte `effectBase` et `scrapValueOf` (réutilisés, pas recopiés)                                        |
| `src/lib/advGear.ts` (nouveau)                                      | types `AdvGear`/`Lineage`, `LINEAGE_GEAR`, tirage, effets, port, options, Équipementier                  |
| `src/lib/adventurers.ts` (modif)                                    | champ `Adventurer.gear`                                                                                  |
| `src/lib/raid.ts` (modif)                                           | `CompanionCtx.advGear`, `companionPairs`/`pairEffects` avec l'équipement, `autoAdvGear`, butin des corps |
| `src/lib/caravan.ts` (modif)                                        | `RoadCompanions.advGear`, route, rôles civils, escorte de référence équipée, butin d'embuscade           |
| `src/lib/buildings.ts` + `src/lib/buildingPreview.ts` (modif)       | bâtiment `outfitter`                                                                                     |
| `supabase/migrations/0067_adv_gear.sql` (nouveau)                   | colonne `characters.adv_gear jsonb`                                                                      |
| `src/stores/character.ts` (modif)                                   | lecture/écriture du stock, actions, crédits de butin, forge                                              |
| `src/components/GuildPanel.vue` (modif)                             | emplacements sur la fiche, sélecteur, stock                                                              |
| `src/components/VillagePlots.vue` (modif)                           | panneau de l'Équipementier                                                                               |
| `src/pages/BasePage.vue`, `src/pages/ExpeditionMapPage.vue` (modif) | contextes de combat (`advGear`)                                                                          |
| `test/advGear.test.ts` (nouveau) + tests existants (modif)          | couverture                                                                                               |

---

### Task 1: Réutiliser les bases d'effet et la ferraille d'`items.ts`

**Files:**

- Modify: `src/lib/items.ts:330-336` (scrapValue), `src/lib/items.ts:825` (EFFECT_BASE)
- Test: `test/items.test.ts`

**Interfaces:**

- Produces: `effectBase(t: EffectType): number` ; `scrapValueOf(slot: ItemSlot, rarity: Rarity, level: number): number` (et `scrapValue(it)` qui l'appelle).

- [ ] **Step 1: Write the failing test** (à la fin de `test/items.test.ts`)

```ts
import { effectBase, scrapValueOf, scrapValue } from '@/lib/items';

describe('bases partagées avec l’équipement des aventuriers', () => {
  it('effectBase rend la base qu’un drop utilise', () => {
    expect(effectBase('damage_pct')).toBeGreaterThan(0);
    expect(effectBase('gold_pct')).toBe(14);
  });
  it('scrapValue passe par scrapValueOf (une seule formule)', () => {
    const it0 = { slot: 'armor', rarity: 'rare', level: 20 } as const;
    expect(scrapValue(it0 as never)).toBe(scrapValueOf('armor', 'rare', 20));
    expect(scrapValueOf('familiar', 'rare', 20)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run test/items.test.ts -t "bases partagées"`
Expected: FAIL — `effectBase is not a function`.

- [ ] **Step 3: Minimal implementation** dans `src/lib/items.ts`

Remplacer le corps de `scrapValue` :

```ts
/** Ferraille d'une pièce à partir de son emplacement, sa rareté et son niveau d'objet.
 *  ⚠️ Source unique : l'équipement des aventuriers la lit aussi (`advGearScrap`). */
export function scrapValueOf(slot: ItemSlot, rarity: Rarity, level: number): number {
  const slotMult = SCRAP_BY_SLOT[slot] ?? 0;
  if (!slotMult) return 0;
  const rarityMult = 1 + RANK_ORDER.indexOf(rarity) * SCRAP_RARITY_STEP;
  const v = SCRAP_BASE * slotMult * rarityMult * itemLevelMult(level);
  return Math.max(1, Math.round(v));
}
/** Ferraille rendue par le recyclage d'un objet. 0 pour un familier. */
export function scrapValue(it: Item): number {
  return scrapValueOf(it.slot, it.rarity, it.level);
}
```

Sous la déclaration de `EFFECT_BASE` :

```ts
/** Base d'un effet (avant rareté, jet et niveau d'objet) — celle d'un drop du héros. */
export function effectBase(t: EffectType): number {
  return EFFECT_BASE[t];
}
```

- [ ] **Step 4: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/items.test.ts`
Expected: PASS (tout le fichier).

- [ ] **Step 5: Commit**

```bash
git add src/lib/items.ts test/items.test.ts
git commit -m "items : effectBase et scrapValueOf exportes (reutilises par l'equipement des aventuriers)"
```

---

### Task 2: Le module `advGear.ts` — lignées, tirage, effets, règles de port

**Files:**

- Create: `src/lib/advGear.ts`
- Modify: `src/lib/adventurers.ts` (interface `Adventurer`, après `talentId`)
- Test: `test/advGear.test.ts`

**Interfaces:**

- Consumes: `effectBase`, `scrapValueOf` (Task 1) ; `rollTier`, `rollItemLevel`, `rankRollMult`, `itemLevelMult`, `effectAsAggregate`, `mergeEffects`, `emptyEffects`, `sellValueOf`, `RARITY_RANK`, `RARITY_LABEL` (`items.ts`) ; `advRarity`, `Adventurer` (`adventurers.ts`).
- Produces (exact) :
  - `type Lineage = 'guerrier' | 'archer' | 'mage' | 'homme_armes' | 'eclaireur' | 'caravanier'`
  - `type AdvGearSlot = 'weapon' | 'armor' | 'accessory'`, `const ADV_GEAR_SLOTS: AdvGearSlot[]`
  - `interface AdvGear { id; lineage; slot; name; emoji; rarity; roll; level; effect; effect2?; role?: { kind: 'speed' | 'haul'; value: number }; locked? }`
  - `const LINEAGE_GEAR: Record<Lineage, LineageGearDef>`
  - `lineageOf(adv: Adventurer): Lineage | null`
  - `canWearAdvGear(adv: Adventurer, g: AdvGear): boolean`
  - `pickLineage(rng: () => number, advs: Adventurer[]): Lineage | null`
  - `rollAdvGear(rng, opts: { lineage: Lineage; slot?: AdvGearSlot; level: number; luck?: number; playerLevel: number }): Omit<AdvGear, 'id'>`
  - `advGearEffects(gear: AdvGear[]): AggregatedEffects`
  - `wornGear(advs: Adventurer[], stock: AdvGear[]): Map<string, AdvGear[]>`
  - `advGearRoles(escort: Adventurer[], stock: AdvGear[]): { speed: number; haul: number }`
  - `advGearOptions(adv, advs, stock, slot): { options: AdvGear[]; otherLineage: number; tooRare: number; taken: number }`
  - `advGearSellValue(g: AdvGear): number`, `advGearScrap(g: AdvGear): number`
  - `Adventurer.gear?: Partial<Record<AdvGearSlot, string>>`

- [ ] **Step 1: Ajouter le champ sur l'aventurier** (`src/lib/adventurers.ts`, dans `interface Adventurer`, juste après le champ `talentId`)

```ts
  /** ÉQUIPEMENT — ids de pièces du stock d'aventurier, un par emplacement.
   *  ⚠️ Comme le compagnon, l'appariement vit SUR l'aventurier : la pièce suit son homme.
   *  Absent = rien de porté (tous les aventuriers d'avant). */
  gear?: Partial<Record<'weapon' | 'armor' | 'accessory', string>>;
```

- [ ] **Step 2: Write the failing tests** — `test/advGear.test.ts`

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run test/advGear.test.ts`
Expected: FAIL — `Cannot find module '@/lib/advGear'`.

- [ ] **Step 4: Implement** — `src/lib/advGear.ts`

```ts
// advGear.ts — ÉQUIPEMENT DES AVENTURIERS (pur/testé). Spec :
// docs/superpowers/specs/2026-09-14-camps-equipement-aventuriers-design.md (étape 1).
//
// ⚠️ Stock SÉPARÉ du sac du héros, pièces PROPRES À CHAQUE CLASSE DE BASE, rareté plafonnée
// par la classe du porteur. Aucune nouvelle stat : on puise dans les EffectType existants.
import {
  effectAsAggregate,
  effectBase,
  emptyEffects,
  itemLevelMult,
  mergeEffects,
  rankRollMult,
  RARITY_RANK,
  rollItemLevel,
  rollTier,
  scrapValueOf,
  sellValueOf,
  type AggregatedEffects,
  type EffectType,
  type ItemEffect,
  type Rarity,
} from './items';
import { advRarity, type Adventurer } from './adventurers';

export const LINEAGES = [
  'guerrier',
  'archer',
  'mage',
  'homme_armes',
  'eclaireur',
  'caravanier',
] as const;
export type Lineage = (typeof LINEAGES)[number];
export type AdvGearSlot = 'weapon' | 'armor' | 'accessory';
export const ADV_GEAR_SLOTS: AdvGearSlot[] = ['weapon', 'armor', 'accessory'];

export interface AdvGear {
  id: string;
  lineage: Lineage;
  slot: AdvGearSlot;
  name: string;
  emoji: string;
  rarity: Rarity;
  roll: number;
  level: number;
  effect: ItemEffect;
  effect2?: ItemEffect;
  /** Lignées civiles uniquement, sur l'accessoire : trajet raccourci / cargaison (fraction). */
  role?: { kind: 'speed' | 'haul'; value: number };
  locked?: boolean;
}

interface PieceDef {
  name: string;
  emoji: string;
  /** Stats possibles ; la 1ʳᵉ tirée est l'affixe principal, une AUTRE le 2ᵉ (Magique+). */
  pool: EffectType[];
}
export interface LineageGearDef {
  role?: 'speed' | 'haul';
  pieces: Record<AdvGearSlot, PieceDef>;
}

export const LINEAGE_GEAR: Record<Lineage, LineageGearDef> = {
  guerrier: {
    pieces: {
      weapon: { name: 'Épée', emoji: '🗡️', pool: ['damage_pct', 'crit_pct'] },
      armor: { name: 'Cuirasse', emoji: '🥋', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
      accessory: { name: 'Gantelets', emoji: '🧤', pool: ['crit_pct', 'damage_pct'] },
    },
  },
  archer: {
    pieces: {
      weapon: { name: 'Arc', emoji: '🏹', pool: ['damage_pct', 'crit_pct'] },
      armor: { name: 'Cuir', emoji: '🦺', pool: ['max_pv_pct', 'crit_pct'] },
      accessory: { name: 'Carquois', emoji: '🎯', pool: ['crit_pct', 'momentum_pct'] },
    },
  },
  mage: {
    pieces: {
      weapon: { name: 'Bâton', emoji: '🪄', pool: ['damage_pct', 'execute_pct'] },
      armor: { name: 'Robe', emoji: '👘', pool: ['max_pv_pct', 'lifesteal_pct'] },
      accessory: { name: 'Grimoire', emoji: '📖', pool: ['damage_pct', 'lifesteal_pct'] },
    },
  },
  homme_armes: {
    pieces: {
      weapon: { name: 'Masse', emoji: '🔨', pool: ['damage_pct', 'thorns_pct'] },
      armor: { name: 'Plates', emoji: '🛡️', pool: ['dmg_reduction_pct', 'max_pv_pct'] },
      accessory: { name: 'Bouclier', emoji: '🔰', pool: ['dmg_reduction_pct', 'thorns_pct'] },
    },
  },
  eclaireur: {
    role: 'speed',
    pieces: {
      weapon: { name: 'Dague', emoji: '🔪', pool: ['crit_pct', 'damage_pct'] },
      armor: { name: 'Cape', emoji: '🧣', pool: ['max_pv_pct', 'crit_pct'] },
      accessory: { name: 'Longue-vue', emoji: '🔭', pool: ['crit_pct', 'damage_pct'] },
    },
  },
  caravanier: {
    role: 'haul',
    pieces: {
      weapon: { name: 'Bâton de marche', emoji: '🦯', pool: ['max_pv_pct', 'damage_pct'] },
      armor: { name: 'Manteau', emoji: '🧥', pool: ['max_pv_pct', 'dmg_reduction_pct'] },
      accessory: { name: 'Bât', emoji: '🎒', pool: ['dmg_reduction_pct', 'max_pv_pct'] },
    },
  },
};

/** Réglages. ⚠️ `k` est LE levier d'équilibrage de l'équipement (mesuré en Task 4). */
export const ADV_GEAR = {
  k: 1,
  /** Bonus de rôle d'un accessoire civil commun, jet 0 (rareté et jet le font monter). */
  roleBase: { speed: 0.03, haul: 0.04 },
  /** Revente : un objet d'aventurier vaut la moitié d'un objet du héros de même grade. */
  sellK: 0.5,
} as const;

export function lineageOf(adv: Adventurer): Lineage | null {
  const root = adv.path[0];
  return root && (LINEAGES as readonly string[]).includes(root) ? (root as Lineage) : null;
}

/** ⚠️ Même règle que `canAdvTalent` : la rareté ne dépasse pas celle de la classe. */
export function canWearAdvGear(adv: Adventurer, g: AdvGear): boolean {
  return lineageOf(adv) === g.lineage && RARITY_RANK[g.rarity] <= RARITY_RANK[advRarity(adv)];
}

/** Une lignée présente dans le vivier — sinon le stock se remplirait d'objets importables. */
export function pickLineage(rng: () => number, advs: Adventurer[]): Lineage | null {
  const present = [...new Set(advs.map(lineageOf).filter((l): l is Lineage => !!l))];
  if (!present.length) return null;
  return present[Math.floor(rng() * present.length)]!;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function rollAdvGear(
  rng: () => number,
  opts: { lineage: Lineage; slot?: AdvGearSlot; level: number; luck?: number; playerLevel: number },
): Omit<AdvGear, 'id'> {
  const luck = opts.luck ?? 0;
  const slot = opts.slot ?? ADV_GEAR_SLOTS[Math.floor(rng() * ADV_GEAR_SLOTS.length)]!;
  const { rank, roll } = rollTier(rng, opts.level, luck, 0, opts.playerLevel);
  const level = rollItemLevel(rng, Math.max(1, Math.min(opts.level, opts.playerLevel)), luck);
  const def = LINEAGE_GEAR[opts.lineage];
  const piece = def.pieces[slot];
  const i1 = Math.floor(rng() * piece.pool.length);
  const t1 = piece.pool[i1]!;
  const value = (t: EffectType) =>
    Math.max(1, round1(effectBase(t) * rankRollMult(rank, roll) * ADV_GEAR.k));
  const out: Omit<AdvGear, 'id'> = {
    lineage: opts.lineage,
    slot,
    name: piece.name,
    emoji: piece.emoji,
    rarity: rank,
    roll,
    level,
    effect: { type: t1, value: value(t1) },
  };
  if (RARITY_RANK[rank] >= RARITY_RANK.magique) {
    const others = piece.pool.filter((t) => t !== t1);
    const t2 = others[Math.floor(rng() * others.length)]!;
    out.effect2 = { type: t2, value: value(t2) };
  }
  if (def.role && slot === 'accessory') {
    const base = ADV_GEAR.roleBase[def.role];
    const scale = rankRollMult(rank, roll) / rankRollMult('commun', 0);
    out.role = { kind: def.role, value: Math.round(base * scale * 1000) / 1000 };
  }
  return out;
}

/** Ce que des pièces apportent au combat — valeur × niveau d'objet, comme un objet du héros. */
export function advGearEffects(gear: AdvGear[]): AggregatedEffects {
  const parts = gear.flatMap((g) => {
    const m = itemLevelMult(g.level);
    const out = [effectAsAggregate(g.effect.type, g.effect.value * m)];
    if (g.effect2) out.push(effectAsAggregate(g.effect2.type, g.effect2.value * m));
    return out;
  });
  return parts.length ? mergeEffects(...parts) : emptyEffects();
}

/**
 * Qui porte quoi, règles appliquées. ⚠️ Lu par le COMBAT, pas seulement l'écran : une pièce
 * portée deux fois ne compte qu'une, une pièce sur le mauvais emplacement ou devenue trop
 * rare est ignorée, un id qui ne désigne plus rien (vendu, recyclé) aussi.
 */
export function wornGear(advs: Adventurer[], stock: AdvGear[]): Map<string, AdvGear[]> {
  const byId = new Map(stock.map((g) => [g.id, g]));
  const taken = new Set<string>();
  const out = new Map<string, AdvGear[]>();
  for (const a of advs) {
    const list: AdvGear[] = [];
    for (const slot of ADV_GEAR_SLOTS) {
      const id = a.gear?.[slot];
      if (!id || taken.has(id)) continue;
      const g = byId.get(id);
      if (!g || g.slot !== slot || !canWearAdvGear(a, g)) continue;
      taken.add(id);
      list.push(g);
    }
    if (list.length) out.set(a.id, list);
  }
  return out;
}

/** Bonus de rôle PORTÉS par une escorte (fractions, non plafonnées — la route plafonne). */
export function advGearRoles(
  escort: Adventurer[],
  stock: AdvGear[],
): { speed: number; haul: number } {
  const out = { speed: 0, haul: 0 };
  for (const list of wornGear(escort, stock).values())
    for (const g of list) if (g.role) out[g.role.kind] += g.role.value;
  return out;
}

/** Ce que le sélecteur d'un emplacement propose, et combien de pièces sont masquées. */
export function advGearOptions(
  adv: Adventurer,
  advs: Adventurer[],
  stock: AdvGear[],
  slot: AdvGearSlot,
): { options: AdvGear[]; otherLineage: number; tooRare: number; taken: number } {
  const takenIds = new Set(
    advs.filter((o) => o.id !== adv.id).flatMap((o) => Object.values(o.gear ?? {})),
  );
  const res = { options: [] as AdvGear[], otherLineage: 0, tooRare: 0, taken: 0 };
  const lineage = lineageOf(adv);
  for (const g of stock) {
    if (g.slot !== slot) continue;
    if (g.lineage !== lineage) res.otherLineage++;
    else if (RARITY_RANK[g.rarity] > RARITY_RANK[advRarity(adv)]) res.tooRare++;
    else if (takenIds.has(g.id)) res.taken++;
    else res.options.push(g);
  }
  return res;
}

export function advGearSellValue(g: AdvGear): number {
  return Math.max(1, Math.round(sellValueOf(g.rarity, g.roll, g.level) * ADV_GEAR.sellK));
}
export function advGearScrap(g: AdvGear): number {
  return scrapValueOf(g.slot, g.rarity, g.level);
}
```

- [ ] **Step 5: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/advGear.test.ts`
Expected: PASS. Si « options » échoue sur l'ordre des champs, vérifier que `otherLineage` est testé AVANT la rareté (une pièce d'une autre lignée n'est jamais « trop rare »).

- [ ] **Step 6: Mutations (chacune doit faire tomber un test, puis être annulée depuis une copie du fichier — jamais par git)**

1. `canWearAdvGear` : retirer `lineageOf(adv) === g.lineage &&`.
2. `canWearAdvGear` : `<=` → `<`.
3. `wornGear` : retirer `taken.has(id) ||`.
4. `rollAdvGear` : `>= RARITY_RANK.magique` → `>= RARITY_RANK.inhabituel`.
5. `rollAdvGear` : retirer `&& slot === 'accessory'`.
6. `advGearEffects` : retirer `* m`.
7. `pickLineage` : renvoyer `LINEAGES[0]` au lieu de `null` quand vide.

Run après chaque : `node node_modules/vitest/vitest.mjs run test/advGear.test.ts` → Expected: FAIL.

- [ ] **Step 7: Commit**

```bash
git add src/lib/advGear.ts src/lib/adventurers.ts test/advGear.test.ts
git commit -m "advGear : equipement des aventuriers par classe de base (tirage, effets, regles de port)"
```

---

### Task 3: L'équipement compte au rempart et dans la puissance affichée

**Files:**

- Modify: `src/lib/raid.ts` (`CompanionCtx` ~2328, `companionPairs` ~2189, `pairEffects` ~2360, `autoCompanions` ~2425)
- Modify (sites de construction du contexte, désignés par le compilateur) : `src/stores/character.ts:1487` (`companionCtx`), `src/components/GuildPanel.vue:530`, `src/pages/BasePage.vue:1062`, `src/pages/ExpeditionMapPage.vue:686`
- Test: `test/advGear.test.ts` (nouveau `describe`), tests existants qui construisent un `CompanionCtx`

**Interfaces:**

- Consumes: `wornGear`, `advGearEffects`, `AdvGear` (Task 2).
- Produces: `CompanionCtx.advGear: AdvGear[]` (REQUIS) ; entrée de `companionPairs` = `{ familiar?; talent?; gear?: AdvGear[] }` ; `pairEffects` inclut l'équipement ; `adventurerPowers` le compte.

- [ ] **Step 1: Write the failing test** (dans `test/advGear.test.ts`)

```ts
import { adventurerPowers, type CompanionCtx } from '@/lib/raid';

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
    const interdite = { ...arme, lineage: 'archer' as const };
    expect(adventurerPowers([a], ctx([interdite])).get('a')!).toBe(nu);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run test/advGear.test.ts -t "au rempart"`
Expected: FAIL (puissance identique : l'équipement n'est pas lu).

- [ ] **Step 3: Implement** dans `src/lib/raid.ts`

Import en tête : `import { advGearEffects, wornGear, type AdvGear } from './advGear';`

Dans `interface CompanionCtx`, après `talents` :

```ts
  /** 🗡️ Le STOCK d'équipement des aventuriers. ⚠️ REQUIS : sans lui l'équipement porté
   *  ne compterait nulle part, et l'écran annoncerait une puissance que le combat ignore. */
  advGear: AdvGear[];
```

Dans `companionPairs` : changer le type de retour et de `entry` en `{ familiar?: Item; talent?: TalentInstance; gear?: AdvGear[] }`, calculer avant la boucle `const worn = wornGear(advs, ctx.advGear);`, et avant `if (entry.familiar || entry.talent)` :

```ts
const g = worn.get(a.id);
if (g) entry.gear = g;
```

puis la condition devient `if (entry.familiar || entry.talent || entry.gear) out.set(a.id, entry);`.

Dans `pairEffects`, changer le type du paramètre en `{ familiar?: Item; talent?: TalentInstance; gear?: AdvGear[] } | undefined` et ajouter un 3ᵉ terme au `mergeEffects` :

```ts
    advGearEffects(p?.gear ?? []),
```

Dans `autoCompanions`, la fonction `power(a, familiar, talent)` doit garder l'équipement porté de `a` : remplacer `pairEffects({ familiar, talent }, ctx)` par `pairEffects({ familiar, talent, gear: worn.get(a.id) }, ctx)` avec `const worn = wornGear(advs, ctx.advGear);` déclaré juste avant.

- [ ] **Step 4: Réparer les sites de construction** — lancer `npm run typecheck` ; chaque erreur « Property 'advGear' is missing » désigne un site. Y ajouter :
  - store `companionCtx(cur, now)` : `advGear: cur.adv_gear?.stock ?? [],` (le champ `adv_gear` arrive en Task 5 : en attendant, `advGear: [],` et laisser un rappel dans le message de commit de Task 5).
  - `GuildPanel.vue`, `BasePage.vue`, `ExpeditionMapPage.vue` : `advGear: char.row?.adv_gear?.stock ?? [],` (même remarque : `[]` jusqu'à Task 5).
  - Dans `test/`, tout objet `CompanionCtx` écrit à la main : ajouter `advGear: []` (le typecheck n'inclut pas `test/` — lancer la suite complète pour les trouver).

- [ ] **Step 5: Run tests**

Run: `node node_modules/vitest/vitest.mjs run` puis `npm run typecheck`
Expected: PASS partout.

- [ ] **Step 6: Mutations** — (a) retirer le terme `advGearEffects(...)` de `pairEffects` ; (b) dans `companionPairs`, retirer `|| entry.gear` de la condition. Expected: le test « au rempart » FAIL à chaque fois.

- [ ] **Step 7: Commit**

```bash
git add src/lib/raid.ts src/stores/character.ts src/components/GuildPanel.vue src/pages/BasePage.vue src/pages/ExpeditionMapPage.vue test
git commit -m "Equipement des aventuriers compte au rempart et dans leur puissance"
```

---

### Task 4: La route — effets, rôles civils, escorte de référence équipée (MESURÉE)

**Files:**

- Modify: `src/lib/caravan.ts` (`RoadCompanions` ~800, `roadCompanionEffects` ~837, `refEscortOf` ~483, `roadFoe` ~560, `caravanLegMin` ~652, `startCaravan` ~984, calcul `haul` ~904)
- Modify: `src/stores/character.ts` (construction de `RoadCompanions`, ~2050), `src/pages/ExpeditionMapPage.vue:767` (appel `caravanLegMin`)
- Test: `test/caravan.test.ts`

**Interfaces:**

- Consumes: `wornGear`, `advGearEffects`, `advGearRoles`, `rollAdvGear`-compatible shape, `LINEAGE_GEAR`, `ADV_GEAR` (Task 2).
- Produces: `RoadCompanions.advGear: AdvGear[]` (REQUIS) ; `refAdvGear(level: number): AdvGear[]` (exporté) ; `caravanLegMin(poi, escort, comptoirLevel: number, gearSpeed: number): number` (4ᵉ paramètre REQUIS).

- [ ] **Step 1: Write the failing tests** (dans `test/caravan.test.ts`)

```ts
import { refAdvGear } from '@/lib/caravan';
import { advGearRoles } from '@/lib/advGear';

describe('équipement des aventuriers sur la route', () => {
  it('l’escorte de référence est équipée à son niveau (3 pièces par membre, rareté permise)', () => {
    const g = refAdvGear(40);
    expect(g.length).toBe(3 * CARAVAN.refEscort);
    for (const p of g) expect(p.level).toBe(40);
  });
  it('un accessoire de caravanier porté grossit la cargaison, plafonné par haulMax', () => {
    const car = { ...refAdventurer(40, 2), gear: { accessory: 'bat' } };
    const stock = [
      {
        id: 'bat',
        lineage: 'caravanier',
        slot: 'accessory',
        name: 'Bât',
        emoji: '🎒',
        rarity: 'commun',
        roll: 0,
        level: 40,
        effect: { type: 'max_pv_pct', value: 5 },
        role: { kind: 'haul', value: 5 },
      },
    ] as const;
    expect(advGearRoles([car], [...stock]).haul).toBe(5);
    // résolu avec un bonus énorme : la cargaison reste bornée à 1 + haulMax
    const out = resolveCaravan(poi({ level: 40 }), [car], 7, {
      familiars: [],
      talents: [],
      advGear: [...stock],
    });
    const nu = resolveCaravan(poi({ level: 40 }), [{ ...car, gear: {} }], 7, {
      familiars: [],
      talents: [],
      advGear: [],
    });
    expect(out.scrap + out.energy + out.gold).toBeLessThanOrEqual(
      Math.ceil(((nu.scrap + nu.energy + nu.gold) * (1 + CARAVAN.haulMax)) / 1) + 3,
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts -t "équipement des aventuriers sur la route"`
Expected: FAIL — `refAdvGear is not a function`.

- [ ] **Step 3: Implement** dans `src/lib/caravan.ts`

Imports : `import { advGearEffects, advGearRoles, LINEAGE_GEAR, wornGear, type AdvGear, type Lineage } from './advGear';` et `effectBase`, `advRarity` si absents.

`RoadCompanions` : ajouter `advGear: AdvGear[];` (REQUIS, avec le même commentaire que `CompanionCtx`).

`roadCompanionEffects` : après `tals`, `const worn = wornGear(escort, road.advGear);` ; la garde devient `if (!fams.length && !tals.length && !worn.size) return emptyEffects();` ; le `mergeEffects` reçoit en plus `advGearEffects([...worn.values()].flat())` (toujours divisé par l'effectif : même règle que les compagnons).

Référence équipée :

```ts
/** Jet de référence d'une pièce : le jet MOYEN d'un tirage biaisé bas (même valeur que les familiers). */
const REF_GEAR_JET = 0.3;
/** L'ÉQUIPEMENT de l'escorte de référence : chaque membre porte ses 3 pièces, à son niveau,
 *  de la rareté la plus haute que SA classe permet — la règle de `gearExpect` : l'attendu,
 *  pas l'exceptionnel. ⚠️ Sans elle, un vivier équipé roulerait sur la route. */
export function refAdvGear(level: number): AdvGear[] {
  return refEscortOf(level).flatMap((a, i) => {
    const lineage = a.path[0] as Lineage;
    const rarity = advRarity(a);
    return (['weapon', 'armor', 'accessory'] as const).map((slot) => {
      const piece = LINEAGE_GEAR[lineage].pieces[slot];
      const t = piece.pool[0]!;
      return {
        id: `refGear${i}${slot}`,
        lineage,
        slot,
        name: piece.name,
        emoji: piece.emoji,
        rarity,
        roll: REF_GEAR_JET,
        level: Math.max(1, level),
        effect: { type: t, value: effectBase(t) * rankRollMult(rarity, REF_GEAR_JET) },
      } satisfies AdvGear;
    });
  });
}
```

`refEscortOf` : ajouter à chaque membre `gear: { weapon: \`refGear${i}weapon\`, armor: \`refGear${i}armor\`, accessory: \`refGear${i}accessory\` }`. ⚠️ `refAdvGear`appelle`refEscortOf`: définir`refEscortOf`SANS gear dans une fonction interne`refEscortBare(level)` réutilisée par les deux, pour éviter la récursion.

`roadFoe` : le 2ᵉ argument de `roadCompanionEffects` devient `{ familiars: refCompanions(poi.level), talents: [], advGear: refAdvGear(poi.level) }`.

Rôles civils :

- `caravanLegMin(poi, escort, comptoirLevel: number, gearSpeed: number)` : `const speed = Math.min(CARAVAN.speedMax, countRole(escort, 'speed') * CARAVAN.speedPerRole + gearSpeed);`
- `startCaravan` : `caravanLegMin(poi, escort, comptoirLevel, advGearRoles(escort, road.advGear).speed)`.
- `resolveCaravan`, calcul `haul` : `1 + Math.min(CARAVAN.haulMax, countRole(escort, 'haul') * CARAVAN.haulPerRole + advGearRoles(escort, road.advGear).haul)`.

Sites : `ExpeditionMapPage.vue:767` passe `advGearRoles(escort, char.row?.adv_gear?.stock ?? []).speed` ; le store (construction `RoadCompanions`) ajoute `advGear: cur.adv_gear?.stock ?? []` (`[]` jusqu'à Task 5). Dans `test/caravan.test.ts`, tout `RoadCompanions` littéral reçoit `advGear: []`, et l'helper `team(n, L)` équipe ses membres de la référence (`gear` + `advGear: refAdvGear(L)`), sinon les bandes mesurent une escorte nue face à une route calibrée équipée.

- [ ] **Step 4: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts`
Expected: PASS, **y compris les bandes d'embuscade existantes** (trio calme ~73-94 %, périlleux sous 40 %, platitude). Si une bande casse : ne PAS la relâcher ; passer à Step 5.

- [ ] **Step 5: Mesure (sonde jetable)** — `test/zz-probe-gear.test.ts` :

```ts
import { it } from 'vitest';
import { resolveCaravan, refAdventurer, refCompanions, refAdvGear, CARAVAN } from '@/lib/caravan';
it('bandes équipées', () => {
  for (const L of [12, 20, 26, 45, 70, 85])
    for (const perilous of [false, true]) {
      const escort = [0, 1, 2].map((i) => ({
        ...refAdventurer(L, i),
        familiarId: `refFam${i}`,
        gear: {
          weapon: `refGear${i}weapon`,
          armor: `refGear${i}armor`,
          accessory: `refGear${i}accessory`,
        },
      }));
      let won = 0,
        fights = 0;
      for (let s = 1; s <= 400; s++) {
        const o = resolveCaravan(
          { id: 'p', type: 'well', level: L, distNorm: 0.5, perilous } as never,
          escort,
          s,
          { familiars: refCompanions(L), talents: [], advGear: refAdvGear(L) },
        );
        for (const e of o.events)
          if (e.kind === 'bandits') {
            fights++;
            if (e.won) won++;
          }
      }
      console.log(
        L,
        perilous ? 'périlleux' : 'calme',
        Math.round((100 * won) / Math.max(1, fights)) + ' %',
      );
    }
});
```

Run: `node node_modules/vitest/vitest.mjs run test/zz-probe-gear.test.ts --reporter=verbose`
Expected: calme **73-94 %**, périlleux **8-40 %** à tous les niveaux. Hors bande : ajuster `CARAVAN.foePvTurns` / `foeDmgPctPv` (jamais `ADV_GEAR.k` pour masquer), relancer, puis **supprimer la sonde** et noter les chiffres dans le commit.

- [ ] **Step 6: Mutations** — (a) `roadFoe` sans `advGear: refAdvGear(...)` (→ bande « périlleux sous 40 % » FAIL) ; (b) `haul` sans le terme d'équipement (→ test cargaison FAIL) ; (c) retirer `Math.min(CARAVAN.haulMax, …)`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/caravan.ts src/stores/character.ts src/pages/ExpeditionMapPage.vue test/caravan.test.ts
git commit -m "Route : equipement des aventuriers, roles civils, escorte de reference equipee (bandes mesurees)"
```

---

### Task 5: Persistance, actions du store et « Confier au mieux »

**Files:**

- Create: `supabase/migrations/0067_adv_gear.sql`
- Modify: `src/stores/character.ts` (`CharacterRow` ~192, `normalizeRow` ~227, nouvelles actions près de `setAdvTalent` ~1675, `autoAssignCompanions`, retour du store)
- Modify: `src/lib/raid.ts` (nouvelle `autoAdvGear`)
- Test: `test/advGear.test.ts`

**Interfaces:**

- Produces:
  - `CharacterRow.adv_gear: AdvGearState | null` avec `interface AdvGearState { stock: AdvGear[]; forge?: AdvForge | null }` (déclarée dans `advGear.ts`, `AdvForge` en Task 7 — déclarer ici `forge?: { until: number; advId: string; piece: Omit<AdvGear, 'id'> } | null`).
  - `autoAdvGear(advs: Adventurer[], ctx: CompanionCtx): Map<string, Partial<Record<AdvGearSlot, string>>>`
  - Store : `setAdvGear(uid, advId, slot, gearId | null)`, `sellAdvGear(uid, ids: string[])`, `recycleAdvGear(uid, ids: string[])`, `toggleAdvGearLock(uid, id)`, `grantAdvGear(cur, pieces: Omit<AdvGear,'id'>[]): AdvGearState` (helper interne), getter `advGearStock`.

- [ ] **Step 1: Migration** — `supabase/migrations/0067_adv_gear.sql`

```sql
-- 0067_adv_gear.sql — ÉQUIPEMENT DES AVENTURIERS : stock et forge de l'Équipementier.
-- Additive : null = aucun équipement (tous les comptes d'avant).
alter table public.characters add column if not exists adv_gear jsonb;
```

Appliquer via la Management API (même méthode que les migrations précédentes, token dans `.supabase-token` du dossier principal) :

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('C:/Users/BTHH2960/Projets/Perso/muscu-planner/.supabase-token','utf8').trim();fetch('https://api.supabase.com/v1/projects/wzbxbntqlheelgqswzew/database/query',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({query:fs.readFileSync('supabase/migrations/0067_adv_gear.sql','utf8')})}).then(r=>r.text()).then(console.log)"
```

Expected: `[]`. Vérifier : même commande avec `select column_name from information_schema.columns where table_name='characters' and column_name='adv_gear'` → une ligne.

- [ ] **Step 2: Failing test for `autoAdvGear`** (dans `test/advGear.test.ts`)

```ts
import { autoAdvGear } from '@/lib/raid';

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
    const plan = autoAdvGear([a, b], ctx(stock));
    expect(plan.get('a')?.weapon).toBe('forte');
    expect(plan.get('b')?.weapon).toBe('arc');
  });
});
```

Run: `node node_modules/vitest/vitest.mjs run test/advGear.test.ts -t "confier au mieux"` → Expected: FAIL.

- [ ] **Step 3: Implement `autoAdvGear`** dans `src/lib/raid.ts` (sous `autoCompanions`)

```ts
/** 🗡️ CONFIER AU MIEUX — l'équipement. Mêmes principes que `autoCompanions` : le gain est lu
 *  par l'arbitre du jeu (`combatPowerRaw`), attribution par GAIN DÉCROISSANT sur tout le
 *  vivier, une pièce par porteur, et rien d'interdit (lignée, rareté de la classe). */
export function autoAdvGear(
  advs: Adventurer[],
  ctx: CompanionCtx,
): Map<string, Partial<Record<AdvGearSlot, string>>> {
  const out = new Map<string, Partial<Record<AdvGearSlot, string>>>(advs.map((a) => [a.id, {}]));
  const pairs = companionPairs(advs, { ...ctx, advGear: [] });
  const base = (a: Adventurer, gear: AdvGear[]) =>
    combatPowerRaw(escortCombatant([a], a.name, pairEffects({ ...pairs.get(a.id), gear }, ctx)));
  const taken = new Set<string>();
  const chosen = new Map<string, AdvGear[]>(advs.map((a) => [a.id, []]));
  for (const slot of ADV_GEAR_SLOTS) {
    const cands: { a: Adventurer; g: AdvGear; gain: number }[] = [];
    for (const a of advs) {
      const cur = base(a, chosen.get(a.id)!);
      for (const g of ctx.advGear)
        if (g.slot === slot && canWearAdvGear(a, g))
          cands.push({ a, g, gain: base(a, [...chosen.get(a.id)!, g]) - cur });
    }
    cands.sort((x, y) => y.gain - x.gain);
    const served = new Set<string>();
    for (const c of cands) {
      if (c.gain <= 0 || served.has(c.a.id) || taken.has(c.g.id)) continue;
      served.add(c.a.id);
      taken.add(c.g.id);
      chosen.get(c.a.id)!.push(c.g);
      out.get(c.a.id)![slot] = c.g.id;
    }
  }
  return out;
}
```

(imports : `ADV_GEAR_SLOTS`, `canWearAdvGear`, `type AdvGearSlot` depuis `./advGear`.)

Run: `node node_modules/vitest/vitest.mjs run test/advGear.test.ts` → PASS.

- [ ] **Step 4: Store** (`src/stores/character.ts`)

`CharacterRow` : `adv_gear: AdvGearState | null; // équipement des aventuriers (migr. 0067)`.

`normalizeRow` :

```ts
const ag = obj<Partial<AdvGearState>>(r.adv_gear);
r.adv_gear = { stock: arr<AdvGear>(ag.stock), forge: ag.forge ?? null };
```

Getter : `const advGearStock = computed<AdvGear[]>(() => row.value?.adv_gear?.stock ?? []);`

Actions (près de `setAdvTalent`) :

```ts
async function setAdvGear(userId: string, advId: string, slot: AdvGearSlot, gearId: string | null) {
  const cur = row.value;
  if (!cur) return;
  const adv = (cur.adventurers ?? []).find((a) => a.id === advId);
  if (!adv) return;
  if (gearId) {
    const g = (cur.adv_gear?.stock ?? []).find((x) => x.id === gearId);
    if (!g) throw new Error('Cette pièce est introuvable.');
    if (g.slot !== slot) throw new Error('Mauvais emplacement.');
    // ⚠️ Refus AU STORE : l'écran ne propose pas l'impossible, il ne le garantit pas.
    if (!canWearAdvGear(adv, g))
      throw new Error(
        g.lineage !== lineageOf(adv)
          ? `Cette pièce est faite pour un autre métier.`
          : `Trop rare pour ${adv.name} : sa classe est de rang ${rarityRank(advRarity(adv)).name} — promeus-le d’abord.`,
      );
  }
  const adventurers = (cur.adventurers ?? []).map((a) => {
    const gear = { ...(a.gear ?? {}) };
    if (a.id === advId) gear[slot] = gearId ?? undefined;
    else if (gearId && gear[slot] === gearId) gear[slot] = undefined;
    return { ...a, gear };
  });
  await persistOptimistic(userId, { adventurers });
}

/** Retire des pièces du stock et les désassigne (vente ou recyclage). 🔒 et portées exclues. */
function dropAdvGear(cur: CharacterRow, ids: string[]) {
  const worn = new Set((cur.adventurers ?? []).flatMap((a) => Object.values(a.gear ?? {})));
  const stock = cur.adv_gear?.stock ?? [];
  const gone = stock.filter((g) => ids.includes(g.id) && !g.locked && !worn.has(g.id));
  return { gone, state: { ...cur.adv_gear, stock: stock.filter((g) => !gone.includes(g)) } };
}
async function sellAdvGear(userId: string, ids: string[]) {
  const cur = row.value;
  if (!cur) return;
  const { gone, state } = dropAdvGear(cur, ids);
  if (!gone.length) return;
  const gold = gone.reduce((s, g) => s + advGearSellValue(g), 0);
  await persist(userId, { gold: cur.gold + gold, adv_gear: state });
}
async function recycleAdvGear(userId: string, ids: string[]) {
  const cur = row.value;
  if (!cur) return;
  const { gone, state } = dropAdvGear(cur, ids);
  if (!gone.length) return;
  const scrap = gone.reduce((s, g) => s + advGearScrap(g), 0);
  await persist(userId, { scrap: cur.scrap + scrap, adv_gear: state });
}
async function toggleAdvGearLock(userId: string, id: string) {
  const cur = row.value;
  if (!cur) return;
  const stock = (cur.adv_gear?.stock ?? []).map((g) =>
    g.id === id ? { ...g, locked: !g.locked } : g,
  );
  await persistOptimistic(userId, { adv_gear: { ...cur.adv_gear, stock } });
}
/** Ajoute des pièces au stock (butin). */
function withAdvGear(cur: CharacterRow, pieces: Omit<AdvGear, 'id'>[]): AdvGearState {
  const stock = [
    ...(cur.adv_gear?.stock ?? []),
    ...pieces.map((p) => ({ ...p, id: crypto.randomUUID() })),
  ];
  return { ...(cur.adv_gear ?? { stock: [] }), stock };
}
```

Remplacer les `advGear: []` provisoires des Tasks 3-4 par `cur.adv_gear?.stock ?? []` / `char.row?.adv_gear?.stock ?? []`.

« Confier au mieux » : dans l'action existante qui applique `autoCompanions` (~1660), appliquer aussi `autoAdvGear(advs, companionCtx(cur, now))` et écrire `gear` de chaque aventurier dans le même `persist`.

Exporter du store : `advGearStock, setAdvGear, sellAdvGear, recycleAdvGear, toggleAdvGearLock`.

- [ ] **Step 5: Run gates partielles**

Run: `npm run typecheck` puis `node node_modules/vitest/vitest.mjs run`
Expected: PASS.

- [ ] **Step 6: Mutations** — `autoAdvGear` : (a) retirer `canWearAdvGear(a, g)` ; (b) retirer `taken.has(c.g.id) ||` ; (c) trier par gain croissant. Expected: test « confier au mieux » FAIL.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0067_adv_gear.sql src/stores/character.ts src/lib/raid.ts src/lib/advGear.ts src/components src/pages test/advGear.test.ts
git commit -m "Equipement des aventuriers : stock persiste (migr. 0067), actions, confier au mieux"
```

---

### Task 6: Sources — corps après un siège, embuscades repoussées

**Files:**

- Modify: `src/lib/raid.ts` (`CorpseLoot` ~2916, `lootCorpses` ~2931)
- Modify: `src/lib/caravan.ts` (`CaravanOutcome` ~162, boucle d'embuscades de `resolveCaravan`)
- Modify: `src/stores/character.ts` (`tickScavengers` ~1822, `claimCaravan` ~2082)
- Test: `test/advGear.test.ts`

**Interfaces:**

- Consumes: `rollAdvGear`, `pickLineage` (Task 2) ; `withAdvGear` (Task 5).
- Produces: `CorpseLoot.advGear: Omit<AdvGear,'id'>[]` ; `lootCorpses(corpses, faction, playerLevel, seed, lootPct, advs: Adventurer[])` (6ᵉ param REQUIS) ; `CaravanOutcome.advGear: Omit<AdvGear,'id'>[]` ; `ADV_GEAR_DROP = { corpse: 0.02, champion: 0.5, ambush: 0.25 }` dans `advGear.ts`.

- [ ] **Step 1: Failing tests**

```ts
import { lootCorpses, type Corpse } from '@/lib/raid';
import { ADV_GEAR_DROP } from '@/lib/advGear';

describe('sources d’équipement', () => {
  it('les corps d’un siège en laissent, seulement des lignées du vivier', () => {
    const corpses: Corpse[] = Array.from({ length: 400 }, (_, i) => ({
      id: `c${i}`,
      emoji: '🗡️',
      name: 'Coupe-jarret',
      level: 30,
    }));
    const v = [adv('a', ['mage'])];
    const l = lootCorpses(corpses, 'bandits', 30, 9, 0, v);
    expect(l.advGear.length).toBeGreaterThan(0);
    for (const g of l.advGear) expect(g.lineage).toBe('mage');
    expect(lootCorpses(corpses, 'bandits', 30, 9, 0, []).advGear).toHaveLength(0);
  });
  it('taux par corps et par champion', () => {
    expect(ADV_GEAR_DROP.champion).toBeGreaterThan(ADV_GEAR_DROP.corpse);
  });
});
```

(`Corpse` = `{ id, emoji, name, level, champion?, looted?, massMult? }`, `raid.ts:116`.)

Et dans `test/caravan.test.ts` :

```ts
it('une embuscade repoussée peut laisser une pièce de la lignée d’un membre', () => {
  const escort = [0, 1, 2].map((i) => ({ ...refAdventurer(40, i), familiarId: `refFam${i}` }));
  let pieces = 0;
  for (let s = 1; s <= 300; s++) {
    const o = resolveCaravan(poi({ level: 40, perilous: true }), escort, s, {
      familiars: refCompanions(40),
      talents: [],
      advGear: [],
    });
    for (const g of o.advGear) expect(escort.map((a) => a.path[0])).toContain(g.lineage);
    pieces += o.advGear.length;
  }
  expect(pieces).toBeGreaterThan(0);
});
```

Run: `node node_modules/vitest/vitest.mjs run test/advGear.test.ts test/caravan.test.ts -t "équipement"` → Expected: FAIL.

- [ ] **Step 2: Implement**

`advGear.ts` :

```ts
/** Chances de pièce d'aventurier par source. ⚠️ À re-mesurer si l'économie de siège bouge. */
export const ADV_GEAR_DROP = { corpse: 0.02, champion: 0.5, ambush: 0.25 } as const;
```

`raid.ts` : `CorpseLoot` += `advGear: Omit<AdvGear, 'id'>[];` ; `lootCorpses` reçoit `advs: Adventurer[]` en 6ᵉ paramètre ; initialiser `advGear: []` dans `loot` ; dans la boucle, après le `rollDrop` du corps :

```ts
const chance = (c.champion ? ADV_GEAR_DROP.champion : ADV_GEAR_DROP.corpse) / (c.massMult ?? 1);
if (rng() < chance) {
  const lineage = pickLineage(rng, advs);
  if (lineage)
    loot.advGear.push(
      rollAdvGear(rng, { lineage, level: L, luck: c.champion ? 0.45 : 0.1, playerLevel }),
    );
}
```

⚠️ Ce `rng()` supplémentaire décale les tirages suivants : les tests existants de `lootCorpses` qui figent une valeur exacte peuvent changer — les relancer ; s'ils cassent sur un nombre, réécrire l'assertion sur la PROPRIÉTÉ testée, pas relâcher la borne.

`caravan.ts` : `CaravanOutcome` += `advGear: Omit<AdvGear, 'id'>[];` ; dans `resolveCaravan`, `const advGear: Omit<AdvGear,'id'>[] = [];` et dans la branche embuscade gagnée (`if (r.win)`) :

```ts
if (rng() < ADV_GEAR_DROP.ambush) {
  const lineage = pickLineage(rng, escort);
  if (lineage)
    advGear.push(
      rollAdvGear(rng, {
        lineage,
        level: poi.level,
        luck: poi.perilous ? 0.3 : 0.1,
        playerLevel: poi.level,
      }),
    );
}
```

et retourner `advGear` dans l'objet résultat.

Store : `tickScavengers` passe `advList.value` en 6ᵉ argument de `lootCorpses` et, si `loot.advGear.length`, `patch.adv_gear = withAdvGear(cur, loot.advGear)` ; le relevé de pillage n'est pas modifié. `claimCaravan` : `...(o.advGear?.length ? { adv_gear: withAdvGear(cur, o.advGear) } : {})` dans le `persist` (⚠️ `o.advGear` absent sur les convois partis avant cette version : l'optional chaining est voulu).

- [ ] **Step 3: Run tests** — suite complète + typecheck. Expected: PASS.

- [ ] **Step 4: Mutations** — (a) `pickLineage(rng, advs)` → `'guerrier'` en dur (test « seulement des lignées du vivier » FAIL) ; (b) supprimer le bloc d'embuscade (test caravane FAIL).

- [ ] **Step 5: Commit**

```bash
git add src/lib/advGear.ts src/lib/raid.ts src/lib/caravan.ts src/stores/character.ts test
git commit -m "Sources d'equipement d'aventurier : corps apres un siege, embuscades repoussees"
```

---

### Task 7: L'Équipementier

**Files:**

- Modify: `src/lib/buildings.ts` (`BUILDING_TYPES`, après `training`), `src/lib/buildingPreview.ts` (entrée `outfitter`)
- Modify: `src/lib/advGear.ts` (forge)
- Modify: `src/stores/character.ts` (`startOutfit`, règlement dans le tick de base)
- Modify: `src/components/VillagePlots.vue` (panneau quand `typeId === 'outfitter'`)
- Test: `test/advGear.test.ts`, `test/buildings.test.ts` (enregistrement exhaustif), `test/goldSink.test.ts` (re-mesure)

**Interfaces:**

- Produces: `OUTFITTER = { baseMs: 40 * 60_000, speedMax: 0.6, half: 30 }` ; `outfitterMsFor(level: number): number` ; `outfitSlot(slot: ItemSlot): AdvGearSlot | null` ; `outfitFromItem(rng, item: Item, target: Adventurer, playerLevel: number): Omit<AdvGear,'id'> | null` ; `settleOutfit(state: AdvGearState, now: number): AdvGearState` (rend le MÊME objet si rien ne change) ; store `startOutfit(uid, itemId, advId, now)`.

- [ ] **Step 1: Failing tests** (`test/advGear.test.ts`)

```ts
import { OUTFITTER, outfitFromItem, outfitSlot, outfitterMsFor, settleOutfit } from '@/lib/advGear';

describe('Équipementier', () => {
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
});
```

Run → Expected: FAIL.

- [ ] **Step 2: Implement** (`advGear.ts`)

```ts
import type { Item, ItemSlot } from './items';

export interface AdvGearState {
  stock: AdvGear[];
  forge?: { until: number; advId: string; piece: Omit<AdvGear, 'id'> } | null;
}

/** ⚒️ ÉQUIPEMENTIER. Durée asymptotique : chaque niveau raccourcit, jamais instantané
 *  (règle « aucun niveau mort du 0 au 100 »). */
export const OUTFITTER = { baseMs: 40 * 60_000, speedMax: 0.6, half: 30 } as const;
export function outfitterMsFor(level: number): number {
  const L = Math.max(0, level);
  return Math.round(OUTFITTER.baseMs * (1 - (OUTFITTER.speedMax * L) / (L + OUTFITTER.half)));
}
export function outfitSlot(slot: ItemSlot): AdvGearSlot | null {
  if (slot === 'weapon' || slot === 'armor') return slot;
  if (slot === 'accessory' || slot === 'relic') return 'accessory';
  return null;
}
/** ⚠️ Le rang est tiré autour du niveau de l'AVENTURIER visé, jamais de l'objet sacrifié :
 *  un objet primordial ne fabrique pas une pièce primordiale pour une recrue. */
export function outfitFromItem(
  rng: () => number,
  item: Item,
  target: Adventurer,
  playerLevel: number,
): Omit<AdvGear, 'id'> | null {
  const slot = outfitSlot(item.slot);
  const lineage = lineageOf(target);
  if (!slot || !lineage || item.locked) return null;
  const luck = Math.min(0.5, 0.1 + RARITY_RANK[item.rarity] * 0.05);
  return rollAdvGear(rng, { lineage, slot, level: target.level, luck, playerLevel });
}
export function settleOutfit(state: AdvGearState, now: number): AdvGearState {
  const f = state.forge;
  if (!f || f.until > now) return state;
  return {
    stock: [...state.stock, { ...f.piece, id: `forge-${f.until}-${f.advId}` }],
    forge: null,
  };
}
```

`buildings.ts` (après l'entrée `training`) :

```ts
  // UTILITAIRE : l'ÉQUIPEMENTIER transforme un objet du héros en pièce d'aventurier.
  {
    id: 'outfitter',
    label: 'Équipementier',
    emoji: '⚒️',
    category: 'utility',
    effect: {},
    perLevelNote: 'fabrication plus rapide à chaque niveau (de moins en moins)',
    buildGold: 800,
    unlockLevel: 5,
    unique: true,
    unlock: { activity: 'L’équipement des aventuriers', where: 'sur ta base' },
    desc: 'Transforme un objet dont ton héros ne veut plus en pièce pour un aventurier, faite pour son métier.',
  },
```

`buildingPreview.ts` : ajouter `outfitter` au `Record` avec des lignes calculées par `outfitterMsFor(level)` (même forme que l'entrée `training`) ; `buildingScales('outfitter')` doit rendre `true` (ajouter le cas si `buildingScales` ne le déduit pas).

Store : `startOutfit(userId, itemId, advId, now)` — refuse si `forge` en cours, si l'objet est porté/🔒/familier, si l'aventurier n'existe pas, si aucun Équipementier ; retire l'objet de `inventory`, pose `forge = { until: now + outfitterMsFor(niveau), advId, piece: outfitFromItem(Math.random, item, adv, playerLevel) }`. Dans le tick de base (là où `settleTraining` est appelé) : `const ag = settleOutfit(cur.adv_gear ?? { stock: [] }, now); if (ag !== cur.adv_gear) patch.adv_gear = ag;`.

`VillagePlots.vue` : quand `selectedPlot.building.typeId === 'outfitter'`, un bloc « ⚒️ Fabriquer » : sélecteur d'aventurier (`char.advList`), sélecteur d'objet du sac (non 🔒, non familier, non porté), bouton « Fabriquer · {{ fmtDuration(outfitterMsFor(niveau)) }} » → `char.startOutfit(...)` ; si `forge` en cours : « en fabrication pour {nom} · encore {durée} ».

- [ ] **Step 3: Run tests** — suite complète. `test/buildings.test.ts` (Record exhaustif, « aucun niveau mort ») et `test/goldSink.test.ts` doivent passer. ⚠️ `plotCap` passe de 10 à 11 : si `goldSink` sort de sa bande (part du plafond sur un an 55-90 %), **mesurer** (le test l'affiche) et ajuster `BUILD.upBase` par son COEFFICIENT, jamais `upExp` ; noter la mesure dans le commit.

- [ ] **Step 4: Mutations** — (a) `settleOutfit` sans `f.until > now` ; (b) `outfitFromItem` avec `level: item.level` ; (c) `outfitterMsFor` sans `(1 - …)`. Expected: FAIL chacune.

- [ ] **Step 5: Commit**

```bash
git add src/lib/advGear.ts src/lib/buildings.ts src/lib/buildingPreview.ts src/stores/character.ts src/components/VillagePlots.vue test
git commit -m "Equipementier : un objet du heros devient une piece d'aventurier (duree asymptotique)"
```

---

### Task 8: Écrans de la Guilde — emplacements, sélecteur, stock

**Files:**

- Modify: `src/components/GuildPanel.vue` (fiche ~205-260, `pairBonusOf`, nouvelle feuille de sélection, section stock)

**Interfaces:**

- Consumes: `advGearOptions`, `wornGear`, `advGearSellValue`, `advGearScrap`, `LINEAGE_GEAR`, `ADV_GEAR_SLOTS` (Task 2) ; store `advGearStock`, `setAdvGear`, `sellAdvGear`, `recycleAdvGear`, `toggleAdvGearLock` (Task 5).

- [ ] **Step 1: Fiche d'aventurier** — sous le bloc `.d-stats`, ajouter :

```vue
<div class="d-gear">
        <button
          v-for="slot in ADV_GEAR_SLOTS"
          :key="slot"
          class="d-gear-slot"
          type="button"
          @click="gearPick = { advId: detailAdv.id, slot }"
        >
          <template v-if="wornOf(detailAdv)[slot]">
            <span class="dg-emo">{{ wornOf(detailAdv)[slot]!.emoji }}</span>
            <span class="dg-name" :class="'r-' + wornOf(detailAdv)[slot]!.rarity">{{ wornOf(detailAdv)[slot]!.name }}</span>
          </template>
          <template v-else>
            <span class="dg-emo dim">{{ pieceDef(detailAdv, slot)?.emoji ?? '＋' }}</span>
            <span class="dg-name dim">{{ pieceDef(detailAdv, slot)?.name ?? 'Emplacement' }}</span>
          </template>
        </button>
      </div>
```

Script :

```ts
import {
  ADV_GEAR_SLOTS,
  LINEAGE_GEAR,
  advGearOptions,
  advGearScrap,
  advGearSellValue,
  lineageOf,
  wornGear,
  type AdvGear,
  type AdvGearSlot,
} from '@/lib/advGear';
const gearPick = ref<{ advId: string; slot: AdvGearSlot } | null>(null);
const worn = computed(() => wornGear(char.advList, char.advGearStock));
function wornOf(a: Adventurer): Partial<Record<AdvGearSlot, AdvGear>> {
  return Object.fromEntries((worn.value.get(a.id) ?? []).map((g) => [g.slot, g]));
}
function pieceDef(a: Adventurer, slot: AdvGearSlot) {
  const l = lineageOf(a);
  return l ? LINEAGE_GEAR[l].pieces[slot] : null;
}
const gearRows = computed(() => {
  const p = gearPick.value;
  const a = p && char.advList.find((x) => x.id === p.advId);
  return a ? advGearOptions(a, char.advList, char.advGearStock, p.slot) : null;
});
async function pickGear(id: string | null) {
  const p = gearPick.value;
  if (!p || !auth.user) return;
  try {
    await char.setAdvGear(auth.user.id, p.advId, p.slot, id);
    gearPick.value = null;
  } catch (e) {
    $q.notify({ type: 'negative', message: (e as Error).message });
  }
}
```

(Utiliser les noms réels des refs déjà présentes dans `GuildPanel.vue` pour `auth`, `$q`, `Adventurer` — les lire en tête du fichier.)

- [ ] **Step 2: Feuille de sélection** — calquée sur le sélecteur de talent existant :

```vue
<q-dialog :model-value="!!gearPick" position="bottom" @update:model-value="gearPick = null">
    <q-card v-if="gearRows" class="guild-card">
      <div class="d-sub">Pièces permises pour son métier et sa classe</div>
      <button v-for="g in gearRows.options" :key="g.id" class="pick-row" type="button" @click="pickGear(g.id)">
        <span>{{ g.emoji }} <b :class="'r-' + g.rarity">{{ g.name }}</b> · niv {{ g.level }}</span>
        <span class="dim">{{ effectText(g.effect) }}<template v-if="g.effect2"> · {{ effectText(g.effect2) }}</template></span>
      </button>
      <div v-if="!gearRows.options.length" class="dim">Aucune pièce disponible.</div>
      <div class="dim small">
        <span v-if="gearRows.otherLineage">{{ gearRows.otherLineage }} pour un autre métier · </span>
        <span v-if="gearRows.tooRare">{{ gearRows.tooRare }} trop rares pour sa classe · </span>
        <span v-if="gearRows.taken">{{ gearRows.taken }} portées par un autre</span>
      </div>
      <q-btn flat no-caps label="Retirer la pièce" @click="pickGear(null)" />
    </q-card>
  </q-dialog>
```

Script : `import { effectLabelFor, type ItemEffect } from '@/lib/items';` puis `const effectText = (e: ItemEffect) => effectLabelFor(e.type, e.value);` (signature réelle `effectLabelFor(type, v)`, `items.ts:918`).

- [ ] **Step 3: Puissance** — la ligne « dont +N grâce à son compagnon et son talent » devient « grâce à son compagnon, son talent et son équipement » (le calcul `pairBonusOf` compare déjà `powers` et `barePowers` : `barePowers` doit rester NU — passer `adventurerPowers(char.advList)` sans contexte, inchangé).

- [ ] **Step 4: Stock** — sous le vivier, une section repliable « 🗡️ Équipement des aventuriers (N) » listant `char.advGearStock` : emoji, nom, rareté, lignée (`LINEAGE_GEAR` + label de classe), et trois boutons 🔒 (`toggleAdvGearLock`), 🪙 `advGearSellValue(g)` (`sellAdvGear([g.id])`), 🔩 `advGearScrap(g)` (`recycleAdvGear([g.id])`) ; boutons désactivés si 🔒 ou portée.

- [ ] **Step 5: Vérifier le rendu** — banc Playwright jetable (le smoke s'arrête au login) : monter `GuildPanel.vue` avec un faux store à 344 et 390 px, vérifier l'absence de débordement horizontal et d'erreur console, capturer, puis **supprimer le banc**. Noter ce qui a été vu.

- [ ] **Step 6: Commit**

```bash
git add src/components/GuildPanel.vue
git commit -m "Guilde : emplacements d'equipement sur la fiche, selecteur filtre, stock (vendre / recycler / verrou)"
```

---

### Task 9: Portes, version, documentation, livraison

**Files:**

- Modify: `package.json` (version), `CLAUDE.md` (entrée de version), mémoire `todo-en-attente.md` (hors dépôt)

- [ ] **Step 1: Portes complètes**

```bash
npm run typecheck
npm run lint
node node_modules/vitest/vitest.mjs run
node node_modules/@quasar/app-vite/bin/quasar.js build
npm run smoke
npm run dead
```

Expected: tout vert ; `dead` ne rend aucune ligne (sinon dé-exporter ce qui n'est lu que dans son module).

- [ ] **Step 1b: Re-mesure des sièges (exigée par la spec)** — sonde jetable `test/zz-probe-siege-gear.test.ts` : niveaux 12/28/50/80/100, enceinte à niveau + héros + vivier de référence (`refAdventurer`), tenue sur 150 sièges SANS puis AVEC `refAdvGear(niveau)` porté (`CompanionCtx.advGear`). Attendu : l'équipement ajoute des points de tenue sans faire casser les bornes de `raid.test` (fin de partie < 85 % aux niveaux 40/60/90). Si une borne casse : ajuster `ADV_GEAR.k` puis relancer la sonde de route (Task 4), jamais la borne. Noter les chiffres dans le commit, supprimer la sonde.

- [ ] **Step 2: Rebase et version**

```bash
git fetch origin && git rebase origin/main
git show origin/main:package.json | grep '"version"'
```

Mettre `package.json` à la version d'`origin/main` + 1 (mineure). Relancer tests + build si le rebase a apporté des changements.

- [ ] **Step 3: CLAUDE.md** — ajouter une entrée « 🗡️ ÉQUIPEMENT DES AVENTURIERS (vX) » en tête des entrées récentes : stock séparé, table par lignée, règles de port, sources et taux, Équipementier, bandes de route mesurées (chiffres de Task 4), effet sur `goldSink` (Task 7), nombre de mutations.

- [ ] **Step 4: Commit et push**

```bash
git add package.json CLAUDE.md
git commit -m "Equipement des aventuriers par classe de base (vX)"
git push origin HEAD:main
```

- [ ] **Step 5: Mémoire** — dans `todo-en-attente.md` : retirer « équiper les aventuriers » des items longs, noter l'étape 1 livrée sous « Camps de bandits » (étapes 2 et 3 restantes).
