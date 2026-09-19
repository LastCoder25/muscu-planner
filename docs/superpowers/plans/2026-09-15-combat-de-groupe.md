# Combat de groupe et XP partagée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un moteur de combat de groupe (`src/lib/skirmish.ts`) où chaque aventurier est une unité distincte (avec SON compagnon, SON talent, SES pièces), branché d'abord sur les embuscades de convoi, avec une XP de combat au prorata des ennemis abattus partagée entre les présents — prêt à servir les camps de faction de l'étape 3.

**Architecture:** Le moteur ne recopie AUCUNE formule de dégâts : un affrontement de groupe est un ENCHAÎNEMENT DE DUELS résolus par `simulateCombat` (crit, esquive, réduction, vol de vie, signatures, procs), avec les PV reportés des DEUX côtés (nouvelle option `startMonsterPv`). La troupe avance dans son ordre ; l'unité du joueur qui l'affronte est tirée à la graine parmi les vivants ; le perdant d'un duel tombe, et le journal nomme qui a abattu qui. `siegeBattle` n'est PAS réutilisé : ses unités n'ont que PV et dégâts (crit fondu, ni esquive, ni réduction, ni procs) et presque aucun aléa hors ciblage — sur un 3 contre 3 l'issue serait quasi déterministe, or la route vit de probabilités (bandes mesurées). Les effets par aventurier passent par UNE fonction (`unitEffects`, `caravan.ts`) lue par la route (`roadUnits`) ET par le rempart (`pairEffects` de `raid.ts` y délègue). La troupe de la route est à danger ABSOLU (`roadTroop(poi)`, calibrée sur 3 aventuriers de référence équipés et accompagnés).

**Tech Stack:** Quasar / Vue 3 `<script setup>` TS strict (`noUncheckedIndexedAccess`), Pinia, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-camps-equipement-aventuriers-design.md` (étape 2 ; l'étape 3 réutilisera `simulateSkirmish`, `troopOf`, `skirmishXpShares` avec des groupes sans taille maximale et le héros comme unité).

## Global Constraints

- Réponses, libellés et commentaires en **français**.
- Toute la logique métier dans `src/lib/` (pure, testée) ; les composants ne font que peindre.
- « **Un moteur** (`src/lib/skirmish.ts`, pur/testé) : groupe du joueur (héros et/ou aventuriers, chacun avec compagnon, talent, équipement) contre une troupe. Unités distinctes, PV reportés, ciblage simple, **journal des morts** (qui a abattu qui). »
- « **Danger absolu** : la troupe dépend du niveau du lieu et de sa taille, jamais du groupe envoyé. Calibrée sur un groupe de référence équipé (3 aventuriers de la lignée de référence). »
- « **XP** : chaque ennemi abattu vaut de l'XP ; le total est **partagé entre les membres présents**, avec le rendement décroissant de `missionXp` (un vétéran sur un lieu faible gagne peu, et ne fait pas monter les recrues à sa place). »
- « **Embuscades de convoi** : passent sur ce moteur et cette règle d'XP (remplace le bonus forfaitaire par combat traversé). »
- « Les convois gardent `escortMax` (leur calibration mesurée en dépend) ; seuls les camps en sont libérés. »
- Bandes de route à GARDER (jamais relâchées), niveaux 12/20/26/45/70/85 : trio équipé calme **[0,70 ; 0,94]** et écart max−min < 0,30 · périlleux **[0,08 ; 0,40]** · solo **< 0,01** · duo **≤ trio − 0,25** · trio SANS pièces calme **≥ 0,50** · pièces **> +0,10** aux niveaux 70/85 · sans compagnons au niveau 45 : < avec et > 0,30 · niveau 20 : trio > solo + 0,30, trio > 0,40, trio < 1, quatuor ≥ trio · périlleux aux niveaux 26/70 : solo < 0,15, trio > 0,08, quatuor ≥ trio · trio périlleux niveau 26 < 0,70.
- Constantes que la recalibration PEUT bouger : `CARAVAN.foePvTurns`, `CARAVAN.foeDmgPctPv`, `CARAVAN.perilousMult`, `CARAVAN.troopCalm`, `CARAVAN.troopPerilous`, `SKIRMISH.xpPerKill`. Constantes INTERDITES : `CARAVAN.escortMax`, `CARAVAN.refEscort`, `AMBUSH_BASE`, `CARAVAN.lossKeep`, `CARAVAN.yieldShare`, `CARAVAN.scoutPerRole`, `ADV_GEAR.k`.
- Un paramètre de contexte nouveau est **REQUIS**, jamais optionnel. Seuls `CaravanOutcome.kills` et `CaravanEvent.kills`/`fallen` sont optionnels : les convois lancés avant la bascule ne les ont pas (leur `outcome` est figé au départ). `unitEffects(p, companionMult = 1)` garde un défaut : ce n'est pas un contexte, c'est la fatigue que seul le rempart applique.
- Tout réglage d'équilibrage se justifie par une **mesure** avec les vraies libs (sonde jetable, supprimée avant commit) ; chaque garantie de calcul est vérifiée **par mutation** (casser depuis une COPIE du fichier, jamais `git checkout`/`git restore`, constater le rouge, restaurer).
- Poste AppLocker : jamais `npx`. Tests `node node_modules/vitest/vitest.mjs run [fichier] [-t "motif"]` · typecheck `npm run typecheck` · lint **ciblé uniquement** : `node node_modules/prettier/bin/prettier.cjs --write <fichiers>` puis `node node_modules/eslint/bin/eslint.js -c ./eslint.config.js <fichiers src>` — **jamais `npm run lint`** (il reformate tout le dépôt) · build `node node_modules/@quasar/app-vite/bin/quasar.js build` · smoke `npm run smoke` · code mort `npm run dead`.
- Worktree `C:\Users\BTHH2960\Projets\Perso\muscu-planner-equilibre`, branche `camps`. Ne JAMAIS lire ni modifier `C:\Users\BTHH2960\Projets\Perso\muscu-planner`. `test/` est exclu du typecheck (les erreurs de type des tests n'apparaissent qu'à l'exécution).
- Commits : `git add <fichiers de la tâche>` seulement ; titre français SANS accents ; ligne vide puis `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Ne jamais committer `.superpowers/`. Pas de push. La version (`package.json`) ne change qu'à la Task 6.

---

## File Structure

| Fichier                                                                                  | Rôle                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/combat.ts` (modif)                                                              | option `startMonsterPv` de `simulateCombat` (PV du monstre reportés)                                                                                                                                                                                                                                                                              |
| `src/lib/skirmish.ts` (nouveau)                                                          | `SKIRMISH`, types `SkirmishUnit`/`SkirmishKill`/`SkirmishResult`/`TroopSpec`, `trialXpBase`, `simulateSkirmish`, `troopOf`, `skirmishXpShares`                                                                                                                                                                                                    |
| `src/lib/caravan.ts` (modif)                                                             | `CompanionSet`, `unitEffects`, `roadPairs`, `roadUnits`, `roadTroop`, `CARAVAN.troopCalm/troopPerilous` ; bascule de `resolveCaravan` ; `missionXp(adv, poi)` ; `CaravanOutcome.kills` ; rapport (`kills`, `hasKills`, `totalKills`) ; retrait de `roadFoe`, `roadCompanionEffects`, `effectivePv`, `offensePerRound`, `xpPerFight`, `xpFightMax` |
| `src/lib/raid.ts` (modif)                                                                | `pairEffects` délègue à `unitEffects` ; `companionPairs` typé `CompanionSet`                                                                                                                                                                                                                                                                      |
| `src/components/CaravanReportView.vue` (modif)                                           | abattus par aventurier et total                                                                                                                                                                                                                                                                                                                   |
| `src/stores/character.ts` (modif)                                                        | commentaire de `claimCaravan` (l'XP stockée contient déjà la part des abattus)                                                                                                                                                                                                                                                                    |
| `test/combat.test.ts`, `test/skirmish.test.ts` (nouveau), `test/caravan.test.ts` (modif) | couverture                                                                                                                                                                                                                                                                                                                                        |
| `CLAUDE.md`, `package.json` (modif)                                                      | entrée de version, bump                                                                                                                                                                                                                                                                                                                           |

---

### Task 1: Les PV du monstre se reportent aussi dans `simulateCombat`

**Files:**

- Modify: `src/lib/combat.ts:293-300` (signature et initialisation de `simulateCombat`)
- Test: `test/combat.test.ts`

**Interfaces:**

- Produces: `simulateCombat(player, monster, opts: { seed: number; goldOnWin: number; startPlayerPv?: number; startMonsterPv?: number })`. Absent → combat identique au bit près. `monsterMaxPv` reste `monster.pv` (seuils d'exécution, vol de vie, épines inchangés).

- [ ] **Step 1: Write the failing test** (à la fin de `test/combat.test.ts`)

```ts
describe('startMonsterPv — les PV du MONSTRE se reportent aussi', () => {
  const p = playerCombatant('P', { puissance: 60, endurance: 60, agilite: 60 }, 10);
  const m = { name: 'M', pv: 500, damage: 30, crit: 0.1, dodge: 0.05, initiative: 5 };

  it('absent → combat identique au bit près', () => {
    for (let s = 1; s <= 20; s++)
      expect(simulateCombat(p, m, { seed: s, goldOnWin: 0, startMonsterPv: m.pv })).toEqual(
        simulateCombat(p, m, { seed: s, goldOnWin: 0 }),
      );
  });

  it('un monstre ENTAMÉ part de ses PV restants, pas de son maximum', () => {
    const r = simulateCombat(p, m, { seed: 3, goldOnWin: 0, startMonsterPv: 1 });
    expect(r.log[0]!.who).toBe('player');
    // Un premier coup (ou une esquive) sur un monstre à 1 PV : il reste au plus 1.
    // Sans l'option, il resterait ~500 − un coup, soit des centaines.
    expect(r.log[0]!.monsterPv).toBeLessThanOrEqual(1);
    expect(r.win).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run test/combat.test.ts -t "startMonsterPv"`
Expected: FAIL sur « un monstre ENTAMÉ » (`monsterPv` vaut plusieurs centaines).

- [ ] **Step 3: Minimal implementation** dans `src/lib/combat.ts`

Remplacer la signature et la ligne `let mPv = monster.pv;` :

```ts
/** Simule un combat auto tour par tour. `seed` rend le combat reproductible.
 *  `startPlayerPv` / `startMonsterPv` : PV de DÉPART (PV reportés d'un combat précédent) ;
 *  les maxima restent ceux des combattants — un blessé n'a pas moins de PV max. */
export function simulateCombat(
  player: Combatant,
  monster: Combatant,
  opts: { seed: number; goldOnWin: number; startPlayerPv?: number; startMonsterPv?: number },
): CombatResult {
  const rng = mulberry32(opts.seed);
  let pPv = opts.startPlayerPv ?? player.pv;
  let mPv = opts.startMonsterPv ?? monster.pv;
```

(`const monsterMaxPv = monster.pv;` plus bas ne change pas.)

- [ ] **Step 4: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/combat.test.ts`
Expected: PASS (tout le fichier).

- [ ] **Step 5: Mutation** — dans une copie, remplacer `opts.startMonsterPv ?? monster.pv` par `monster.pv` → relancer Step 4 → « un monstre ENTAMÉ » FAIL → restaurer depuis la copie.

- [ ] **Step 6: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/combat.ts test/combat.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/combat.ts
git add src/lib/combat.ts test/combat.test.ts
git commit -m "combat : startMonsterPv, les PV du monstre se reportent aussi

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Le moteur `skirmish.ts` — duels enchaînés, journal des morts, troupe, XP partagée

**Files:**

- Create: `src/lib/skirmish.ts`
- Test: `test/skirmish.test.ts`

**Interfaces:**

- Consumes: `simulateCombat(..., { startPlayerPv, startMonsterPv })` (Task 1), `offenseOf`, `survivalOf`, `mulberry32`, `type Combatant` (`combat.ts`).
- Produces:
  - `SKIRMISH: { xpPerKill: number; carryMargin: number }`
  - `interface SkirmishUnit { id: string; name: string; emoji: string; level: number; combatant: Combatant }`
  - `interface SkirmishKill { duel: number; killer: string; victim: string }`
  - `interface SkirmishResult { win: boolean; duels: number; kills: SkirmishKill[]; killsBy: Record<string, number>; down: string[]; foesDown: string[]; pvLeft: Record<string, number> }` — `down` = alliés tombés (→ infirmerie), `foesDown` = ennemis abattus, `pvLeft` = PV restants des ALLIÉS.
  - `interface TroopSpec { count: number; level: number; pvTurns: number; dmgPctPv: number; mult: number; name: string; emoji: string }`
  - `trialXpBase(level: number): number` (= `6 + level * 1.6`, la base de `missionXp`)
  - `simulateSkirmish(allies: readonly SkirmishUnit[], foes: readonly SkirmishUnit[], seed: number): SkirmishResult`
  - `troopOf(reference: readonly Combatant[], spec: TroopSpec): SkirmishUnit[]` (ids `foe0..`)
  - `skirmishXpShares(present: readonly { id: string; level: number }[], foes: readonly SkirmishUnit[], result: Pick<SkirmishResult, 'foesDown'>): Record<string, number>` (entiers)

- [ ] **Step 1: Write the failing test** — créer `test/skirmish.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  SKIRMISH,
  simulateSkirmish,
  skirmishXpShares,
  trialXpBase,
  troopOf,
  type SkirmishUnit,
} from '@/lib/skirmish';
import { offenseOf, survivalOf, type Combatant } from '@/lib/combat';

const c = (o: Partial<Combatant> = {}): Combatant => ({
  name: 'x',
  pv: 100,
  damage: 10,
  crit: 0,
  dodge: 0,
  initiative: 10,
  ...o,
});
const u = (id: string, o: Partial<Combatant> = {}, level = 10): SkirmishUnit => ({
  id,
  name: id,
  emoji: '⚔️',
  level,
  combatant: c({ name: id, ...o }),
});

describe('⚔️ simulateSkirmish — des duels enchaînés, PV reportés des deux côtés', () => {
  it('est DÉTERMINISTE : même graine, même bataille', () => {
    const allies = [u('a', { pv: 300, damage: 40 }), u('b', { pv: 200, damage: 60 })];
    const foes = [u('f0', { pv: 150, damage: 30 }), u('f1', { pv: 150, damage: 30 })];
    expect(simulateSkirmish(allies, foes, 42)).toEqual(simulateSkirmish(allies, foes, 42));
  });

  it('⚠️ les PV d’un ALLIÉ se reportent d’un duel à l’autre', () => {
    // L'ennemi frappe le premier (17..23), l'allié abat chaque ennemi d'un coup. Frais à
    // chaque duel, l'allié gagnerait les trois ; PV reportés, il tombe au troisième.
    const a = u('a', { pv: 50, damage: 100, initiative: 1 });
    const foe = (id: string) => u(id, { pv: 20, damage: 20, initiative: 50 });
    const r = simulateSkirmish([a], [foe('f0'), foe('f1'), foe('f2')], 7);
    expect(r.win).toBe(false);
    expect(r.down).toEqual(['a']);
    expect(r.foesDown).toEqual(['f0', 'f1']);
    expect(r.killsBy['a']).toBe(2);
    expect(r.killsBy['f2']).toBe(1);
    expect(r.pvLeft['a']).toBe(0);
  });

  it('⚠️ les PV d’un ENNEMI se reportent : il ne se relève pas entre deux adversaires', () => {
    // a1 entame f0 (51..69) puis tombe ; a2 l'achève d'un coup SANS être touché — ce qui
    // n'arrive que si f0 garde ses PV entamés.
    const allies = [
      u('a1', { pv: 15, damage: 60, initiative: 99 }),
      u('a2', { pv: 1000, damage: 60, initiative: 99 }),
    ];
    const foes = [u('f0', { pv: 100, damage: 20, initiative: 1 })];
    let vus = 0;
    for (let s = 1; s <= 60; s++) {
      const r = simulateSkirmish(allies, foes, s);
      if (r.kills[0]?.victim !== 'a1') continue;
      vus++;
      expect(r.kills[1]).toEqual({ duel: 1, killer: 'a2', victim: 'f0' });
      expect(r.pvLeft['a2']).toBe(1000);
      expect(r.win).toBe(true);
    }
    expect(vus, 'a1 n’a jamais ouvert : le test ne prouve rien').toBeGreaterThan(0);
  });

  it('le JOURNAL nomme qui a abattu qui, et les comptes le suivent', () => {
    const allies = [u('a', { pv: 400, damage: 50 }), u('b', { pv: 400, damage: 50 })];
    const foes = [0, 1, 2, 3].map((i) => u(`f${i}`, { pv: 120, damage: 25 }));
    for (let s = 1; s <= 30; s++) {
      const r = simulateSkirmish(allies, foes, s);
      const tues = r.kills.filter((k) => k.victim.startsWith('f'));
      expect(tues.map((k) => k.victim).sort()).toEqual([...r.foesDown].sort());
      for (const k of tues) expect(['a', 'b']).toContain(k.killer);
      expect((r.killsBy['a'] ?? 0) + (r.killsBy['b'] ?? 0)).toBe(r.foesDown.length);
      expect(r.win).toBe(r.foesDown.length === foes.length);
      // Chaque duel fait tomber au moins un combattant : la bataille est bornée.
      expect(r.duels).toBeLessThanOrEqual(allies.length + foes.length);
    }
  });

  it('⚠️ un groupe VAINQUEUR compte le membre tombé en chemin', () => {
    const allies = [
      u('faible', { pv: 5, damage: 1, initiative: 1 }),
      u('fort', { pv: 1000, damage: 200, initiative: 99 }),
    ];
    const foes = [u('f0', { pv: 50, damage: 20, initiative: 50 })];
    let vu = false;
    for (let s = 1; s <= 60 && !vu; s++) {
      const r = simulateSkirmish(allies, foes, s);
      if (r.win && r.down.includes('faible')) vu = true;
    }
    expect(vu).toBe(true);
  });

  it('bords : troupe vide = victoire sans duel ; groupe vide = défaite', () => {
    expect(simulateSkirmish([u('a')], [], 1)).toMatchObject({ win: true, duels: 0 });
    expect(simulateSkirmish([], [u('f0')], 1)).toMatchObject({ win: false, duels: 0 });
  });
});

describe('🗡️ troopOf — danger ABSOLU, dérivé d’une référence', () => {
  it('ne dépend que de la RÉFÉRENCE et du lieu', () => {
    const ref = [c({ pv: 400, damage: 40, strikes: 2 }), c({ pv: 600, damage: 20 })];
    const spec = {
      count: 3,
      level: 20,
      pvTurns: 2,
      dmgPctPv: 0.25,
      mult: 1,
      name: 'Bandit',
      emoji: '🗡️',
    };
    const t = troopOf(ref, spec);
    expect(t).toHaveLength(3);
    const off = (offenseOf(ref[0]!) + offenseOf(ref[1]!)) / 2;
    const surv = (survivalOf(ref[0]!) + survivalOf(ref[1]!)) / 2;
    expect(t[0]!.combatant.pv).toBe(Math.round(off * 2));
    expect(t[0]!.combatant.damage).toBe(Math.round(surv * 100 * 0.25));
    expect(new Set(t.map((x) => x.id)).size).toBe(3);
    for (const x of t) expect(x.level).toBe(20);
    const fort = troopOf(ref, { ...spec, mult: 1.5 });
    expect(fort[0]!.combatant.pv).toBeGreaterThan(t[0]!.combatant.pv);
    expect(fort[0]!.combatant.damage).toBeGreaterThan(t[0]!.combatant.damage);
    expect(troopOf(ref, { ...spec, count: 5 })).toHaveLength(5);
  });
});

describe('🎓 skirmishXpShares — les abattus, partagés entre les présents', () => {
  const foes = [0, 1, 2].map((i) => u(`f${i}`, {}, 10));
  const tous = { foesDown: ['f0', 'f1', 'f2'] };

  it('la base d’épreuve est celle de missionXp', () => {
    expect(trialXpBase(10)).toBeCloseTo(22, 9);
  });
  it('le total est PARTAGÉ : à deux, chacun touche la moitié', () => {
    const plein = 3 * SKIRMISH.xpPerKill * trialXpBase(10);
    expect(skirmishXpShares([{ id: 'a', level: 10 }], foes, tous)['a']).toBe(Math.round(plein));
    const deux = skirmishXpShares(
      [
        { id: 'a', level: 10 },
        { id: 'b', level: 10 },
      ],
      foes,
      tous,
    );
    expect(deux['a']).toBe(Math.round(plein / 2));
    expect(deux['b']).toBe(Math.round(plein / 2));
  });
  it('seuls les ennemis ABATTUS comptent', () => {
    const un = skirmishXpShares([{ id: 'a', level: 10 }], foes, { foesDown: ['f1'] })['a'];
    expect(un).toBe(Math.round(SKIRMISH.xpPerKill * trialXpBase(10)));
    expect(skirmishXpShares([{ id: 'a', level: 10 }], foes, { foesDown: [] })['a']).toBe(0);
  });
  it('⚠️ un VÉTÉRAN sur un lieu faible gagne peu (rendement décroissant de missionXp)', () => {
    const vet = skirmishXpShares([{ id: 'v', level: 40 }], foes, tous)['v']!;
    const bleu = skirmishXpShares([{ id: 'r', level: 10 }], foes, tous)['r']!;
    expect(vet).toBeLessThan(bleu);
    expect(vet).toBe(Math.round(3 * SKIRMISH.xpPerKill * trialXpBase(10) * 0.25 ** 1.5));
  });
  it('⚠️ …et ne fait pas monter une RECRUE à sa place : un abattu vaut au plus niveau + marge', () => {
    const forts = [0, 1, 2].map((i) => u(`f${i}`, {}, 40));
    const r = skirmishXpShares([{ id: 'r', level: 5 }], forts, tous)['r'];
    expect(r).toBe(Math.round(3 * SKIRMISH.xpPerKill * trialXpBase(5 + SKIRMISH.carryMargin)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run test/skirmish.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/skirmish"`.

- [ ] **Step 3: Implementation** — créer `src/lib/skirmish.ts`

```ts
// skirmish.ts — le COMBAT DE GROUPE : des unités distinctes contre une troupe. Pur/testable.
//
// ⚠️ UN MOTEUR, PAS UN TROISIÈME JEU DE FORMULES. Chaque affrontement est un DUEL résolu
// par `simulateCombat` — crit, esquive, réduction, vol de vie, signatures et procs compris —
// avec les PV REPORTÉS des deux côtés. Le groupe vit dans l'ENCHAÎNEMENT : la troupe avance
// dans son ordre, l'unité du joueur qui l'affronte est tirée à la graine parmi celles encore
// debout, et le perdant du duel tombe.
//
// ⚠️ POURQUOI PAS `siegeBattle` : ses unités n'ont que PV et dégâts (crit fondu, ni
// esquive, ni réduction, ni procs) et presque aucun aléa hors du ciblage. Sur un 3 contre 3
// l'issue y serait quasi déterministe — or la route vit de PROBABILITÉS (trio calme
// 70-94 %, périlleux 8-40 %). Et ses règles (mur, brèche, secteurs) n'ont pas d'objet en
// rase campagne.
//
// ⚠️ PERSONNE NE MEURT : un allié « tombé » part à l'infirmerie (`down`), jamais perdu.
import { mulberry32, offenseOf, simulateCombat, survivalOf, type Combatant } from './combat';

export const SKIRMISH = {
  /** Part de la base d'une épreuve (`trialXpBase`) que vaut UN ennemi abattu, pour le groupe
   *  entier. ⚠️ Recalibrée en Task 4 (XP moyenne d'un convoi à ±15 % de l'ancienne). */
  xpPerKill: 0.2,
  /** Un abattu ne vaut jamais plus qu'un ennemi de `niveau du membre + N` : un vétéran
   *  n'élève pas une recrue à sa place en l'emmenant sur un lieu hors de sa ligue. */
  carryMargin: 5,
} as const;

export interface SkirmishUnit {
  id: string;
  name: string;
  emoji: string;
  /** Niveau de l'unité — lu par l'XP (rendement décroissant, marge de portage). */
  level: number;
  combatant: Combatant;
}

/** Une mort du journal : QUI a abattu QUI, et à quel duel. */
export interface SkirmishKill {
  duel: number;
  killer: string;
  victim: string;
}

export interface SkirmishResult {
  /** Toute la troupe est tombée. */
  win: boolean;
  duels: number;
  kills: SkirmishKill[];
  /** Morts par tueur (alliés ET ennemis). */
  killsBy: Record<string, number>;
  /** Alliés tombés — BLESSÉS (infirmerie), jamais perdus. */
  down: string[];
  /** Ennemis abattus. */
  foesDown: string[];
  /** PV restants des alliés (0 pour un tombé). */
  pvLeft: Record<string, number>;
}

export interface TroopSpec {
  count: number;
  level: number;
  /** PV d'un ennemi ≈ N tours de l'offense MOYENNE d'une unité de référence. */
  pvTurns: number;
  /** Morsure ≈ part des PV EFFECTIFS moyens d'une unité de référence. */
  dmgPctPv: number;
  /** Multiplicateur de PV ET de dégâts (route périlleuse, taille de camp…). */
  mult: number;
  name: string;
  emoji: string;
}

/** Base d'XP d'une épreuve de ce niveau — celle de `missionXp`, source unique. */
export function trialXpBase(level: number): number {
  return 6 + level * 1.6;
}

/**
 * La bataille. Déterministe pour une graine.
 *
 * ⚠️ CIBLAGE SIMPLE, écrit une fois : la troupe se présente DANS SON ORDRE (le chef en
 * dernier si l'appelant l'y range), et c'est la graine qui choisit quel allié vivant lui
 * fait face — sans quoi le premier du vivier encaisserait tout, et partirait toujours seul
 * à l'infirmerie.
 * ⚠️ Chaque duel fait tomber au moins un combattant (le perdant ; les deux si les épines
 * achèvent le vainqueur) : la boucle se termine en au plus `allies + foes` duels.
 */
export function simulateSkirmish(
  allies: readonly SkirmishUnit[],
  foes: readonly SkirmishUnit[],
  seed: number,
): SkirmishResult {
  const rng = mulberry32((seed ^ 0x3c6ef372) >>> 0 || 1);
  const pv = new Map<string, number>();
  for (const x of [...allies, ...foes]) pv.set(x.id, x.combatant.pv);
  const up = (x: SkirmishUnit) => (pv.get(x.id) ?? 0) > 0;
  const kills: SkirmishKill[] = [];
  const killsBy: Record<string, number> = {};
  const down: string[] = [];
  const foesDown: string[] = [];
  const fall = (killer: SkirmishUnit, victim: SkirmishUnit, duel: number, ally: boolean) => {
    pv.set(victim.id, 0);
    kills.push({ duel, killer: killer.id, victim: victim.id });
    killsBy[killer.id] = (killsBy[killer.id] ?? 0) + 1;
    (ally ? down : foesDown).push(victim.id);
  };

  let duel = 0;
  for (;;) {
    const foe = foes.find(up);
    const living = allies.filter(up);
    if (!foe || !living.length) break;
    const ally = living[Math.floor(rng() * living.length)]!;
    const r = simulateCombat(ally.combatant, foe.combatant, {
      seed: (seed + duel * 7919) >>> 0,
      goldOnWin: 0,
      startPlayerPv: pv.get(ally.id),
      startMonsterPv: pv.get(foe.id),
    });
    const last = r.log[r.log.length - 1];
    if (last) {
      pv.set(ally.id, Math.max(0, last.playerPv));
      pv.set(foe.id, Math.max(0, last.monsterPv));
    }
    // Le perdant tombe — y compris aux PV restants d'un combat tranché au chrono.
    if (r.win || !up(foe)) fall(ally, foe, duel, false);
    if (!r.win || !up(ally)) fall(foe, ally, duel, true);
    duel++;
  }

  return {
    win: !foes.some(up),
    duels: duel,
    kills,
    killsBy,
    down,
    foesDown,
    pvLeft: Object.fromEntries(allies.map((a) => [a.id, pv.get(a.id) ?? 0])),
  };
}

/**
 * Une TROUPE à danger ABSOLU, dérivée d'un groupe de RÉFÉRENCE — jamais du groupe envoyé :
 * sinon « combien j'en envoie » ne voudrait plus rien dire.
 *
 * ⚠️ `offenseOf` / `survivalOf` sont les formules de `combatPower`, l'arbitre du jeu :
 * une copie locale (celle de l'ancienne route) ignorait signatures et esquive, et la route
 * cessait de suivre l'escorte (mesuré v0.797).
 */
export function troopOf(reference: readonly Combatant[], spec: TroopSpec): SkirmishUnit[] {
  const n = Math.max(1, reference.length);
  const off = reference.reduce((s, x) => s + offenseOf(x), 0) / n;
  const surv = reference.reduce((s, x) => s + survivalOf(x), 0) / n;
  const pv = Math.max(1, Math.round(Math.max(1, off) * spec.pvTurns * spec.mult));
  const damage = Math.max(1, Math.round(surv * 100 * spec.dmgPctPv * spec.mult));
  return Array.from({ length: Math.max(1, Math.round(spec.count)) }, (_, i) => ({
    id: `foe${i}`,
    name: spec.name,
    emoji: spec.emoji,
    level: Math.max(1, spec.level),
    combatant: { name: spec.name, pv, damage, crit: 0.08, dodge: 0.05, initiative: 12 },
  }));
}

/**
 * L'XP de combat : chaque ennemi ABATTU vaut de l'XP, le total est PARTAGÉ entre les
 * membres PRÉSENTS — qui l'a abattu ne compte pas, on a tenu ensemble.
 *
 * ⚠️ Deux garde-fous par membre, et chacun répond à un abus : le RENDEMENT DÉCROISSANT de
 * `missionXp` (plancher 0,15, puissance 1,5) quand l'ennemi est loin sous lui, et la MARGE
 * DE PORTAGE (`SKIRMISH.carryMargin`) quand il est loin au-dessus — sinon un vétéran
 * emmenant des recrues sur un lieu hors de leur ligue les ferait monter à sa place.
 */
export function skirmishXpShares(
  present: readonly { id: string; level: number }[],
  foes: readonly SkirmishUnit[],
  result: Pick<SkirmishResult, 'foesDown'>,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!present.length) return out;
  const dead = new Set(result.foesDown);
  const slain = foes.filter((f) => dead.has(f.id));
  for (const m of present) {
    const lvl = Math.max(1, m.level);
    let sum = 0;
    for (const f of slain) {
      const fl = Math.max(1, f.level);
      const ratio = Math.max(0.15, Math.min(1, fl / lvl));
      sum +=
        SKIRMISH.xpPerKill * trialXpBase(Math.min(fl, lvl + SKIRMISH.carryMargin)) * ratio ** 1.5;
    }
    out[m.id] = Math.round(sum / present.length);
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/skirmish.test.ts test/combat.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutations** (chacune depuis une copie de `src/lib/skirmish.ts`, relancer `test/skirmish.test.ts`, constater FAIL, restaurer)
  1. `startPlayerPv: pv.get(ally.id)` → `startPlayerPv: ally.combatant.pv` → « PV d'un ALLIÉ » FAIL.
  2. `startMonsterPv: pv.get(foe.id)` → `startMonsterPv: foe.combatant.pv` → « PV d'un ENNEMI » FAIL.
  3. `win: !foes.some(up)` → `win: allies.some(up)` → « JOURNAL » ou « bords » FAIL.
  4. Supprimer la ligne `if (!r.win || !up(ally)) fall(foe, ally, duel, true);` → « PV d'un ALLIÉ » FAIL (`down` vide, `killsBy['f2']` absent).
  5. `sum / present.length` → `sum` → « PARTAGÉ » FAIL.
  6. `ratio ** 1.5` → `1` → « VÉTÉRAN » FAIL.
  7. `Math.min(fl, lvl + SKIRMISH.carryMargin)` → `fl` → « RECRUE » FAIL.
  8. `foes.filter((f) => dead.has(f.id))` → `foes` → « seuls les ennemis ABATTUS » FAIL.
  9. `spec.pvTurns * spec.mult` → `spec.pvTurns` → « troopOf » FAIL.

- [ ] **Step 6: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/skirmish.ts test/skirmish.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/skirmish.ts
git add src/lib/skirmish.ts test/skirmish.test.ts
git commit -m "skirmish : moteur de combat de groupe (duels enchaines, journal des morts, troupe absolue, XP partagee)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Une unité par aventurier — `unitEffects`, `roadPairs`, `roadUnits`, `roadTroop`

**Files:**

- Modify: `src/lib/caravan.ts` (après `advTalentEffects` ~ligne 462 : `CompanionSet`, `unitEffects` ; après `RoadCompanions` ~ligne 920 : `roadPairs`, `roadUnits`, `roadTroop` ; `companionsOf` ~335 et `advTalentsOf` ~434 deviennent des lectures de `roadPairs` ; `CARAVAN` : `troopCalm`, `troopPerilous`)
- Modify: `src/lib/raid.ts:2197-2238` (`companionPairs` typé `CompanionSet`), `src/lib/raid.ts:2375-2393` (`pairEffects` délègue)
- Test: `test/caravan.test.ts` (nouveau `describe` en fin de fichier)

**Interfaces:**

- Consumes: `SkirmishUnit`, `troopOf`, `TroopSpec` (Task 2).
- Produces:
  - `interface CompanionSet { familiar?: Item; talent?: TalentInstance; gear?: AdvGear[] }`
  - `unitEffects(p: CompanionSet | undefined, companionMult?: number): AggregatedEffects` (défaut 1 : seul le rempart passe la fatigue)
  - `roadPairs(escort: Adventurer[], road: RoadCompanions): Map<string, CompanionSet>`
  - `roadUnits(escort: Adventurer[], road: RoadCompanions): SkirmishUnit[]`
  - `roadTroop(poi: Poi): SkirmishUnit[]`
  - `CARAVAN.troopCalm: number`, `CARAVAN.troopPerilous: number` (valeurs de départ 3 et 3, recalibrées en Task 4)
  - `companionsOf` / `advTalentsOf` : signatures INCHANGÉES.

- [ ] **Step 1: Write the failing test** (fin de `test/caravan.test.ts` ; ajouter `roadPairs, roadUnits, roadTroop, unitEffects` à l'import de `@/lib/caravan`, `mergeEffects` à celui de `@/lib/items`, et `import { troopOf } from '@/lib/skirmish';`)

```ts
describe('⚔️ UNE UNITÉ PAR AVENTURIER — ce qu’il emmène au combat', () => {
  const fam = (id: string, value = 20): Item =>
    ({
      id,
      slot: 'familiar',
      name: id,
      emoji: '🐺',
      rarity: 'commun',
      level: 1,
      baseLevel: 1,
      effect: { type: 'damage_pct', value },
    }) as Item;
  const guerrier = (id: string, o: Partial<Adventurer> = {}): Adventurer => ({
    ...refAdventurer(20, 0),
    id,
    name: id,
    ...o,
  });
  const road = (
    familiars: Item[] = [],
    talents: TalentInstance[] = [],
    advGear: AdvGear[] = [],
  ) => ({
    familiars,
    talents,
    advGear,
  });

  it('unitEffects = compagnon + talent + pièces, UNE seule définition', () => {
    const f = fam('f1');
    const t = { id: 't1', code: 't_dmg', xp: 0, level: 1, equipped: false } as TalentInstance;
    const g = refAdvGear(20, 1);
    expect(unitEffects({ familiar: f, talent: t, gear: g })).toEqual(
      mergeEffects(companionEffects([f]), advTalentEffects([t]), advGearEffects(g)),
    );
    expect(unitEffects({ familiar: f }, 0.5).damagePct).toBeCloseTo(
      unitEffects({ familiar: f }).damagePct / 2,
      9,
    );
  });

  it('⚠️ chaque loup n’épaule QUE son homme : quatre loups ne se diluent ni ne s’empilent', () => {
    const seul = roadUnits([guerrier('a0', { familiarId: 'f0' })], road([fam('f0')]))[0]!;
    const quatre = roadUnits(
      [0, 1, 2, 3].map((i) => guerrier(`a${i}`, { familiarId: `f${i}` })),
      road([0, 1, 2, 3].map((i) => fam(`f${i}`))),
    );
    for (const x of quatre) expect(x.combatant.damage).toBe(seul.combatant.damage);
    const nu = roadUnits([guerrier('a0')], road())[0]!;
    expect(seul.combatant.damage).toBeGreaterThan(nu.combatant.damage);
    // Un loup sur quatre : les trois autres restent nus.
    const un = roadUnits(
      [guerrier('a0', { familiarId: 'f0' }), guerrier('a1'), guerrier('a2'), guerrier('a3')],
      road([fam('f0')]),
    );
    expect(un[0]!.combatant.damage).toBe(seul.combatant.damage);
    for (const x of un.slice(1)) expect(x.combatant.damage).toBe(nu.combatant.damage);
  });

  it('l’unité EST le combattant d’un aventurier seul avec SA paire', () => {
    const team = [guerrier('a0', { familiarId: 'f0' }), guerrier('a1')];
    const r = road([fam('f0')]);
    const pairs = roadPairs(team, r);
    const units = roadUnits(team, r);
    team.forEach((a, i) => {
      expect(units[i]!.id).toBe(a.id);
      expect(units[i]!.level).toBe(a.level);
      expect(units[i]!.combatant).toEqual(
        escortCombatant([a], a.name, unitEffects(pairs.get(a.id))),
      );
    });
  });

  it('⚠️ roadPairs garde les exclusions : héros, doublon, fantôme', () => {
    const r = { ...road([fam('f1')]), heroFamiliarId: 'f1' };
    expect(roadPairs([guerrier('a', { familiarId: 'f1' })], r).get('a')).toBeUndefined();
    const deux = roadPairs(
      [guerrier('a', { familiarId: 'f1' }), guerrier('b', { familiarId: 'f1' })],
      road([fam('f1')]),
    );
    expect(deux.get('a')?.familiar?.id).toBe('f1');
    expect(deux.get('b')).toBeUndefined();
    expect(roadPairs([guerrier('a', { familiarId: 'parti' })], road([fam('f1')])).size).toBe(0);
  });

  it('⚠️ roadTroop : DANGER ABSOLU — le lieu seul, calibré sur la référence équipée', () => {
    const p = poi({ level: 30 });
    expect(roadTroop(p)).toEqual(roadTroop(p));
    expect(roadTroop(p)).toHaveLength(CARAVAN.troopCalm);
    expect(roadTroop(poi({ level: 30, perilous: true }))).toHaveLength(CARAVAN.troopPerilous);
    const ref = roadUnits(
      Array.from({ length: CARAVAN.refEscort }, (_, i) => ({
        ...refAdventurer(30, i),
        familiarId: `refFam${i % 3}`,
        gear: {
          weapon: `refGear${i}weapon`,
          armor: `refGear${i}armor`,
          accessory: `refGear${i}accessory`,
        },
      })),
      { familiars: refCompanions(30), talents: [], advGear: refAdvGear(30) },
    );
    expect(roadTroop(p)[0]!.combatant).toEqual(
      troopOf(
        ref.map((x) => x.combatant),
        {
          count: CARAVAN.troopCalm,
          level: 30,
          pvTurns: CARAVAN.foePvTurns,
          dmgPctPv: CARAVAN.foeDmgPctPv,
          mult: 1,
          name: 'Bandit de grand chemin',
          emoji: '🗡️',
        },
      )[0]!.combatant,
    );
    expect(roadTroop(poi({ level: 60 }))[0]!.combatant.pv).toBeGreaterThan(
      roadTroop(poi({ level: 20 }))[0]!.combatant.pv,
    );
    const calme = roadTroop(poi({ level: 30 }))[0]!.combatant;
    const peril = roadTroop(poi({ level: 30, perilous: true }))[0]!.combatant;
    expect(peril.damage).toBeGreaterThanOrEqual(calme.damage);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts -t "UNE UNITÉ PAR AVENTURIER"`
Expected: FAIL — `unitEffects is not a function`.

- [ ] **Step 3: Implementation dans `src/lib/caravan.ts`**

Ajouter l'import en tête (après l'import de `./advGear`) :

```ts
import { troopOf, type SkirmishUnit } from './skirmish';
```

Dans `CARAVAN`, sous `perilousMult` :

```ts
  /** Taille de la troupe d'une embuscade — calme / périlleuse (moteur de groupe, v0.859).
   *  ⚠️ Recalibrées en Task 4, mesures à l'appui. */
  troopCalm: 3,
  troopPerilous: 3,
```

Juste après `advTalentEffects` :

```ts
/** Ce qu'UN aventurier emmène au combat — la forme partagée par la route et le rempart. */
export interface CompanionSet {
  familiar?: Item;
  talent?: TalentInstance;
  gear?: AdvGear[];
}

/**
 * ⚔️ CE QU'UN AVENTURIER TIRE DE SA PAIRE ET DE SES PIÈCES — UNE seule définition, lue par
 * la route (`roadUnits`) ET par le rempart (`pairEffects`, `raid.ts`). Deux copies
 * finiraient par annoncer une valeur que le combat n'applique pas.
 * `companionMult` : la FATIGUE au rempart (un état, pas une formule) ; 1 partout ailleurs.
 */
export function unitEffects(p: CompanionSet | undefined, companionMult = 1): AggregatedEffects {
  return mergeEffects(
    companionEffects(p?.familiar ? [p.familiar] : [], companionMult),
    advTalentEffects(p?.talent ? [p.talent] : []),
    advGearEffects(p?.gear ?? []),
  );
}
```

Juste après l'interface `RoadCompanions` :

```ts
/**
 * 🐾 QUI PORTE QUOI SUR LA ROUTE, par aventurier. Les exclusions de toujours : ce que le
 * HÉROS porte n'est pas disponible, un même familier ou talent confié deux fois ne compte
 * qu'une (le premier du vivier le garde), un id fantôme est ignoré, un talent trop rare
 * pour la classe ne se porte pas, une pièce ne se porte que selon `wornGear`.
 * ⚠️ Pas de Chenil ni de fatigue ici (cf. `companionPairs` au rempart) — comportement
 * inchangé de la route.
 */
export function roadPairs(escort: Adventurer[], road: RoadCompanions): Map<string, CompanionSet> {
  const fams = new Map(road.familiars.map((f) => [f.id, f]));
  const tals = new Map(road.talents.map((t) => [t.id, t]));
  const heroTal = new Set(road.heroTalentIds ?? []);
  const worn = wornGear(escort, road.advGear);
  const prisF = new Set<string>();
  const prisT = new Set<string>();
  const out = new Map<string, CompanionSet>();
  for (const a of escort) {
    const entry: CompanionSet = {};
    const fid = a.familiarId;
    if (fid && fid !== road.heroFamiliarId && !prisF.has(fid)) {
      const f = fams.get(fid);
      if (f) {
        prisF.add(fid);
        entry.familiar = f;
      }
    }
    const tid = a.talentId;
    if (tid && !heroTal.has(tid) && !prisT.has(tid)) {
      const t = tals.get(tid);
      if (t && canAdvTalent(a, t)) {
        prisT.add(tid);
        entry.talent = t;
      }
    }
    const g = worn.get(a.id);
    if (g?.length) entry.gear = g;
    if (entry.familiar || entry.talent || entry.gear) out.set(a.id, entry);
  }
  return out;
}

/** ⚔️ L'escorte en UNITÉS DISTINCTES : chaque aventurier avec SA paire et SES pièces.
 *  ⚠️ Plus de division par l'effectif : elle n'existait que parce que l'escorte était FONDUE
 *  en un seul combattant. Ici chaque loup n'épaule que son homme. */
export function roadUnits(escort: Adventurer[], road: RoadCompanions): SkirmishUnit[] {
  const pairs = roadPairs(escort, road);
  return escort.map((a) => ({
    id: a.id,
    name: a.name,
    emoji: advTitle(a)?.emoji ?? '⚔️',
    level: a.level,
    combatant: escortCombatant([a], a.name, unitEffects(pairs.get(a.id))),
  }));
}

/**
 * 🗡️ LES BANDITS DE LA ROUTE — une TROUPE à danger ABSOLU.
 *
 * ⚠️ Dimensionnée sur l'escorte de RÉFÉRENCE (`CARAVAN.refEscort` aventuriers au niveau du
 * lieu, accompagnés et équipés), jamais sur l'escorte envoyée : sinon une escorte faible
 * affronterait des bandits faibles et « combien j'en envoie » ne voudrait plus rien dire.
 */
export function roadTroop(poi: Poi): SkirmishUnit[] {
  const ref = roadUnits(refEscortOf(poi.level), {
    familiars: refCompanions(poi.level),
    talents: [],
    advGear: refAdvGear(poi.level),
  });
  const perilous = !!poi.perilous;
  return troopOf(
    ref.map((x) => x.combatant),
    {
      count: perilous ? CARAVAN.troopPerilous : CARAVAN.troopCalm,
      level: poi.level,
      pvTurns: CARAVAN.foePvTurns,
      dmgPctPv: CARAVAN.foeDmgPctPv,
      mult: perilous ? CARAVAN.perilousMult : 1,
      name: perilous ? 'Pillard de la passe' : 'Bandit de grand chemin',
      emoji: '🗡️',
    },
  );
}
```

Remplacer les corps de `companionsOf` et `advTalentsOf` (signatures et commentaires conservés) :

```ts
export function companionsOf(
  advs: Adventurer[],
  owned: Item[],
  heroFamiliarId?: string | null,
): Item[] {
  const pairs = roadPairs(advs, { familiars: owned, talents: [], advGear: [], heroFamiliarId });
  return [...pairs.values()].flatMap((p) => (p.familiar ? [p.familiar] : []));
}
```

```ts
export function advTalentsOf(
  advs: Adventurer[],
  owned: TalentInstance[],
  heroTalentIds: readonly string[] = [],
): TalentInstance[] {
  const pairs = roadPairs(advs, { familiars: [], talents: owned, advGear: [], heroTalentIds });
  return [...pairs.values()].flatMap((p) => (p.talent ? [p.talent] : []));
}
```

⚠️ `roadPairs` étant déclarée plus bas dans le fichier, c'est une `function` : le hoisting la rend utilisable. `companionsOf`/`advTalentsOf` s'appuient sur l'interface `RoadCompanions` (déjà déclarée dans le module).

- [ ] **Step 4: `raid.ts` délègue**

Ajouter `unitEffects` et `type CompanionSet` à l'import existant depuis `./caravan`. Remplacer `pairEffects` :

```ts
function pairEffects(p: CompanionSet | undefined, ctx?: CompanionCtx): AggregatedEffects {
  // ⚠️ FATIGUÉ = DIMINUÉ DE MOITIÉ, jamais perdu ni blessé (règle v0.663). La formule
  // elle-même vit dans `unitEffects`, partagée avec la route.
  return unitEffects(
    p,
    p?.familiar && ctx && isFatigued(p.familiar, ctx.now) ? DAMAGED_EFFICIENCY : 1,
  );
}
```

Dans `companionPairs`, remplacer les deux occurrences du type littéral `{ familiar?: Item; talent?: TalentInstance; gear?: AdvGear[] }` par `CompanionSet` (retour `Map<string, CompanionSet>`, `const out = new Map<string, CompanionSet>()`, `const entry: CompanionSet = {}`). Retirer de l'import `./caravan` les noms devenus inutilisés dans `raid.ts` si eslint les signale (`companionEffects`, `advTalentEffects`) et de `./advGear` (`advGearEffects`).

- [ ] **Step 5: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts test/raid.test.ts test/defensePower.test.ts test/advGear.test.ts`
Expected: PASS (le rempart est numériquement inchangé : les tests de puissance et de fatigue de `raid.test.ts` restent verts).

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 6: Mutations** (depuis des copies, restaurer après chaque)
  1. `roadUnits` : `unitEffects(pairs.get(a.id))` → `scaleEffects(unitEffects(pairs.get(a.id)), 1 / escort.length)` → « quatre loups » FAIL.
  2. `roadPairs` : retirer `fid !== road.heroFamiliarId &&` → « exclusions » FAIL.
  3. `unitEffects` : retirer `advGearEffects(p?.gear ?? [])` → « unitEffects = compagnon + talent + pièces » FAIL, et le test « au rempart » de `test/advGear.test.ts` ou `raid.test.ts` FAIL.
  4. `pairEffects` : passer `1` au lieu de la fatigue → test de fatigue de `raid.test.ts` (« isFatigued »/« lasse », ~ligne 1239) FAIL.
  5. `roadTroop` : `mult: perilous ? CARAVAN.perilousMult : 1` → `mult: 1` → « roadTroop … peril.damage » FAIL si `perilousMult > 1` (sinon noter la mutation comme couverte en Task 4 par « une route PÉRILLEUSE est réellement plus dure »).

- [ ] **Step 7: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/caravan.ts src/lib/raid.ts test/caravan.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/caravan.ts src/lib/raid.ts
git add src/lib/caravan.ts src/lib/raid.ts test/caravan.test.ts
git commit -m "caravan : une unite par aventurier (unitEffects partage route et rempart, roadUnits, roadTroop)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Les embuscades de convoi passent sur le moteur de groupe — XP des abattus, blessés, recalibration mesurée

**Files:**

- Modify: `src/lib/caravan.ts` (`CARAVAN` : retrait `xpPerFight`/`xpFightMax`, commentaires de calibration ; `CaravanEvent` ; `CaravanOutcome.kills` ; `missionXp` ; `resolveCaravan` ; retrait `roadFoe`, `roadCompanionEffects`, `effectivePv`, `offensePerRound` et des imports devenus inutiles `simulateCombat`, `offenseOf`, `survivalOf`)
- Modify: `src/lib/skirmish.ts` (`SKIRMISH.xpPerKill` si la mesure l'exige)
- Test: `test/caravan.test.ts` (réécritures listées ci-dessous)
- Probe jetable: `test/_probe-road.test.ts` (créé puis SUPPRIMÉ avant commit)

**Interfaces:**

- Consumes: `simulateSkirmish`, `skirmishXpShares`, `trialXpBase` (Task 2) ; `roadUnits`, `roadTroop` (Task 3).
- Produces:
  - `missionXp(adv: Adventurer, poi: Poi): number` (le 3ᵉ paramètre `fights` disparaît)
  - `interface CaravanEvent { kind; won?: boolean; kills?: number; fallen?: number; text: string }` — `kills` = bandits abattus, `fallen` = membres tombés, sur une embuscade.
  - `CaravanOutcome.kills?: Record<string, number>` (abattus par aventurier, toutes embuscades ; ABSENT sur les convois d'avant la bascule)
  - `CaravanOutcome.xp[id]` = `missionXp(a, poi)` + Σ parts `skirmishXpShares` des embuscades
  - `CaravanOutcome.hurt` = union des `down` de toutes les embuscades
  - Exports retirés : `roadFoe`, `roadCompanionEffects`, `CARAVAN.xpPerFight`, `CARAVAN.xpFightMax`.

- [ ] **Step 1: MESURE DE RÉFÉRENCE, AVANT toute modification** — créer `test/_probe-road.test.ts` :

```ts
import { it } from 'vitest';
import { refAdventurer, refAdvGear, refCompanions, resolveCaravan } from '@/lib/caravan';
import type { Adventurer } from '@/lib/adventurers';
import type { Poi } from '@/lib/expedition';

const poi = (level: number, perilous = false): Poi => ({
  id: 'p',
  type: 'wreck',
  level,
  x: 50,
  y: 50,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...(perilous ? { perilous: true } : {}),
});
const trio = (L: number): Adventurer[] =>
  Array.from({ length: 3 }, (_, i) => ({
    ...refAdventurer(L, i),
    id: `a${i}`,
    familiarId: `refFam${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
    },
  }));

it('référence XP et blessés (ancien moteur)', { timeout: 600_000 }, () => {
  for (const per of [false, true])
    for (const L of [12, 20, 26, 45, 70, 85]) {
      const road = { familiars: refCompanions(L), talents: [], advGear: refAdvGear(L) };
      let xp = 0;
      let blesse = 0;
      const N = 400;
      for (let s = 1; s <= N; s++) {
        const o = resolveCaravan(poi(L, per), trio(L), s * 7919 + 3, road, L);
        xp += Object.values(o.xp).reduce((a, b) => a + b, 0) / 3;
        if (o.hurt.length) blesse++;
      }
      console.log(
        `${per ? 'peril' : 'calme'} L${L} xp/membre=${(xp / N).toFixed(2)} voyagesBlesses=${((100 * blesse) / N).toFixed(1)}%`,
      );
    }
});
```

Run: `node node_modules/vitest/vitest.mjs run test/_probe-road.test.ts`
Expected: 12 lignes. **Recopier ces 12 lignes dans le rapport de tâche** : c'est la cible XP (±15 %) de la Step 6 et la référence de blessés citée dans CLAUDE.md.

- [ ] **Step 2: Réécrire les tests** dans `test/caravan.test.ts` (les tests périmés se RÉÉCRIVENT, ils ne se suppriment pas)

Import : retirer `roadCompanionEffects` et `roadFoe` de l'import `@/lib/caravan` ; ajouter `import { simulateSkirmish, trialXpBase } from '@/lib/skirmish';` (et garder `roadUnits, roadTroop, roadPairs, unitEffects` de la Task 3).

(a) Remplacer la fonction `winPct` (lignes ~121-137) :

```ts
function winPct(escort: Adventurer[], p: Poi, n = 150) {
  const lvl = escort[0]?.level ?? p.level;
  const units = roadUnits(escort, {
    familiars: refCompanions(lvl),
    talents: [],
    advGear: refAdvGear(lvl, escort.length),
  });
  const troop = roadTroop(p);
  let w = 0;
  for (let s = 0; s < n; s++) if (simulateSkirmish(units, troop, s * 211 + 7).win) w++;
  return w / n;
}
```

(b) Test « les bandits ne dépendent PAS de l'escorte » (~145) — corps remplacé :

```ts
const p = poi();
expect(roadTroop(p)).toEqual(roadTroop(p)); // il ne dépend que du POI
expect(roadTroop(p).length).toBeGreaterThan(0);
for (const f of roadTroop(p)) expect(f.combatant.pv).toBeGreaterThan(0);
```

(c) Test « un POI plus profond envoie des bandits plus forts » (~301) :

```ts
expect(roadTroop(poi({ level: 40 }))[0]!.combatant.pv).toBeGreaterThan(
  roadTroop(poi({ level: 10 }))[0]!.combatant.pv,
);
```

(d) Remplacer le test « chacun reçoit SON dû » (~463) :

```ts
it('chacun reçoit SON dû — un vétéran ne se paie pas en emmenant des recrues', () => {
  // Les abattus sont PARTAGÉS : emmener des recrues ne peut que diluer la part du vétéran,
  // jamais l'augmenter ; et sur une route facile la recrue apprend bien plus que lui.
  const facile = poi({ level: 5 });
  for (let s = 1; s <= 40; s++) {
    const seul = resolveCaravan(facile, [vet('v')], s, NUS, 100);
    const accompagne = resolveCaravan(
      facile,
      [vet('v'), bleu('r1'), bleu('r2'), bleu('r3')],
      s,
      NUS,
      100,
    );
    expect(accompagne.xp['v']!, `graine ${s}`).toBeLessThanOrEqual(seul.xp['v']! + 1);
    expect(accompagne.xp['r1']!).toBeGreaterThan(accompagne.xp['v']!);
  }
});
```

(e) Remplacer le test « elle ne dépend QUE du nombre d'épreuves » (~500) :

```ts
it('⚠️ le socle de mission tombe TOUJOURS ; les abattus s’y AJOUTENT', () => {
  const p = poi();
  const esc = team(3, 20);
  let sansCombat = 0;
  let avecAbattus = 0;
  let defaites = 0;
  for (let s = 0; s < 300; s++) {
    const o = resolveCaravan(p, esc, s * 977 + 1, NUS, 100);
    const f = o.events.filter((e) => e.kind === 'bandits');
    const abattus = f.reduce((n, e) => n + (e.kills ?? 0), 0);
    for (const a of esc) {
      expect(o.xp[a.id]!).toBeGreaterThanOrEqual(missionXp(a, p));
      if (!f.length) expect(o.xp[a.id]).toBe(missionXp(a, p));
      if (abattus > 0) expect(o.xp[a.id]!).toBeGreaterThan(missionXp(a, p));
    }
    if (!f.length) sansCombat++;
    if (abattus > 0) avecAbattus++;
    if (f.some((x) => x.won === false)) defaites++;
    // Les abattus par tête somment ceux des embuscades.
    const parTete = Object.values(o.kills ?? {}).reduce((n, k) => n + k, 0);
    expect(parTete).toBe(abattus);
  }
  expect(sansCombat, 'aucun voyage sans combat : le test ne prouve rien').toBeGreaterThan(0);
  expect(avecAbattus, 'aucun abattu : le test ne prouve rien').toBeGreaterThan(0);
  expect(defaites, 'aucune défaite : le test ne prouve rien').toBeGreaterThan(0);
});
```

(f) Remplacer le `describe('⚠️ le bonus d’XP suit les combats RÉELS, pas l’étiquette', …)` (~844-865) :

```ts
describe('⚠️ l’XP de combat suit les ennemis ABATTUS, pas l’étiquette', () => {
  it('une route périlleuse SANS embuscade ne paie plus le simple risque', () => {
    const a = refAdventurer(20);
    expect(missionXp(a, poi({ perilous: true }))).toBe(missionXp(a, poi()));
  });
  it('missionXp lit la base d’épreuve partagée avec le combat de groupe', () => {
    const p = poi({ level: 33, distNorm: CARAVAN.xpRefDist });
    expect(missionXp(refAdventurer(33), p)).toBe(Math.round(trialXpBase(33)));
  });
});
```

(g) Dans le `describe('🐾 UN COMPAGNON PAR AVENTURIER …')`, le sous-`describe('🐾🧠 SUR LA ROUTE AUSSI — la moyenne, jamais la somme')` (~1024-1098) est renommé `'🐾🧠 SUR LA ROUTE AUSSI — chaque compagnon épaule SON homme'` et ses tests réécrits :

```ts
it('un compagnon apporte quelque chose à son aventurier', () => {
  const team = [adv('a', { familiarId: 'f1' })];
  expect(unitEffects(roadPairs(team, road()).get('a')).damagePct).toBe(0);
  expect(unitEffects(roadPairs(team, road([fam('f1')])).get('a')).damagePct).toBeGreaterThan(0);
});

it('⚠️ QUATRE loups sur quatre têtes : chacun garde SON loup, rien ne s’empile', () => {
  // L'escorte n'est plus FONDUE : quatre loups font quatre combattants un peu meilleurs,
  // jamais un groupe +4x %. C'est ce qui interdit le retour du « pool global » (v0.777).
  const seul = unitEffects(roadPairs([adv('a', { familiarId: 'f1' })], road([fam('f1')])).get('a'));
  const pairs = roadPairs(
    ['a', 'b', 'c', 'd'].map((id, i) => adv(id, { familiarId: `f${i}` })),
    road([fam('f0'), fam('f1'), fam('f2'), fam('f3')]),
  );
  for (const id of ['a', 'b', 'c', 'd'])
    expect(unitEffects(pairs.get(id)).damagePct).toBeCloseTo(seul.damagePct, 6);
});

it('⚠️ … et UN loup sur quatre têtes n’épaule que la sienne', () => {
  const pairs = roadPairs(
    [adv('a', { familiarId: 'f1' }), adv('b'), adv('c'), adv('d')],
    road([fam('f1')]),
  );
  expect(unitEffects(pairs.get('a')).damagePct).toBeGreaterThan(0);
  for (const id of ['b', 'c', 'd']) expect(pairs.get(id)).toBeUndefined();
});

it('⚠️ UN SEUL DRESSAGE : ce qui a été appris au rempart compte sur la route', () => {
  const guerrier = fam('f1', { atkXp: famXpForLevel(20), defXp: 0 });
  const sentinelle = fam('f1', { atkXp: 0, defXp: famXpForLevel(20) / 4 });
  const novice = fam('f1');
  const team = [adv('a', { familiarId: 'f1' })];
  const d = (f: Item) => unitEffects(roadPairs(team, road([f])).get('a')).damagePct;
  expect(d(sentinelle)).toBeCloseTo(d(guerrier), 6);
  expect(d(guerrier)).toBeGreaterThan(d(novice));
});

it('⚠️ le familier du HÉROS ne part pas en convoi', () => {
  const team = [adv('a', { familiarId: 'f1' })];
  expect(roadPairs(team, { ...road([fam('f1')]), heroFamiliarId: 'f1' }).get('a')).toBeUndefined();
});

it('le TALENT confié compte lui aussi, et il est bridé', () => {
  const t = { id: 't1', code: 't_dmg', xp: 0, level: 1, equipped: false } as TalentInstance;
  const team = [adv('a', { talentId: 't1' })];
  const somme = (x: AggregatedEffects) =>
    (Object.values(x) as number[]).reduce((s2, v) => s2 + v, 0);
  expect(somme(unitEffects(roadPairs(team, road()).get('a')))).toBe(0);
  const avec = unitEffects(roadPairs(team, road([], [t])).get('a'));
  expect(somme(avec)).toBeGreaterThan(0);
  expect(somme(avec)).toBeLessThan(somme(advTalentEffects([{ ...t }], 1)));
});
```

(le test « CE QUI EST BRANCHÉ EST BIEN LU PAR LE COMBAT » qui suit reste tel quel : il passe par `resolveCaravan`.)

(h) Remplacer le test « l'équipement compte sur la route, DIVISÉ PAR L'EFFECTIF » (~1541) :

```ts
it('⚠️ l’équipement compte sur la route, et il n’épaule que SON porteur', () => {
  const stock = [bat(0)];
  const nu = unitEffects(
    roadPairs([caravanier()], { familiars: [], talents: [], advGear: [] }).get('car'),
  );
  const seul = unitEffects(
    roadPairs([caravanier()], { familiars: [], talents: [], advGear: stock }).get('car'),
  );
  expect(nu.maxPvPct).toBe(0);
  expect(seul.maxPvPct).toBeCloseTo(advGearEffects(stock).maxPvPct, 9);
  const trio = roadPairs(
    [caravanier(), { ...refAdventurer(40, 0), id: 'b' }, { ...refAdventurer(40, 1), id: 'c' }],
    { familiars: [], talents: [], advGear: stock },
  );
  expect(unitEffects(trio.get('car')).maxPvPct).toBeCloseTo(seul.maxPvPct, 9);
  expect(trio.get('b')).toBeUndefined();
});
```

(i) Nouveau `describe` (après le `describe('⚠️ l’XP est versée PAR AVENTURIER, et toujours', …)`) :

```ts
describe('🤕 LES BLESSÉS SONT CEUX QUI SONT TOMBÉS', () => {
  it('⚠️ une embuscade PERDUE envoie toute l’escorte tombée à l’infirmerie', () => {
    // L'ancien tirage d'UNE victime au hasard disparaît : le journal dit qui est tombé.
    const esc = team(3, 26);
    let pertes = 0;
    for (let s = 1; s <= 400; s++) {
      const o = resolveCaravan(poi({ level: 26, perilous: true }), esc, s * 131 + 5, NUS, 100);
      const f = o.events.filter((e) => e.kind === 'bandits');
      const tombes = f.reduce((n, e) => n + (e.fallen ?? 0), 0);
      expect(o.hurt.length > 0, `graine ${s}`).toBe(tombes > 0);
      expect(o.hurt.length).toBeLessThanOrEqual(tombes);
      if (f.some((e) => e.won === false)) {
        pertes++;
        // Une embuscade n'est perdue que quand TOUTE l'escorte est tombée.
        expect(o.hurt.length).toBe(esc.length);
      }
    }
    expect(pertes, 'aucune embuscade perdue : le test ne prouve rien').toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts`
Expected: FAIL (au minimum : `kills`/`fallen` absents des événements, `o.kills` absent, `missionXp` à 3 paramètres encore présent mais bandes/abattus rouges).

- [ ] **Step 4: Implementation dans `src/lib/caravan.ts`**

Import : remplacer la ligne `import { troopOf, type SkirmishUnit } from './skirmish';` posée en Task 3 par `import { simulateSkirmish, skirmishXpShares, trialXpBase, troopOf, type SkirmishUnit } from './skirmish';` ; retirer `simulateCombat`, `offenseOf`, `survivalOf` de l'import de `./combat` (garder `mulberry32`, `combatPower`, `type Combatant`).

`CARAVAN` : supprimer `xpPerFight` et `xpFightMax` (et leur commentaire).

`CaravanEvent` :

```ts
interface CaravanEvent {
  kind: CaravanEventKind;
  /** `bandits` uniquement : l'escorte a-t-elle tenu ? */
  won?: boolean;
  /** `bandits` : bandits abattus / membres tombés (moteur de groupe, v0.859). */
  kills?: number;
  fallen?: number;
  text: string;
}
```

`CaravanOutcome`, sous `xp` :

```ts
  /** 🗡️ Bandits abattus par aventurier, toutes embuscades confondues. ⚠️ ABSENT sur les
   *  convois lancés avant le moteur de groupe (leur `outcome` est figé au départ). */
  kills?: Record<string, number>;
```

Supprimer `effectivePv`, `offensePerRound`, `roadFoe` et `roadCompanionEffects` (avec leurs commentaires ; garder `caravanFamiliarXp`).

`missionXp` :

```ts
/** XP de MISSION d'un membre — le socle, versé quel que soit le résultat, même sans combat.
 *  `ratio` : RENDEMENT DÉCROISSANT sous le niveau de l'aventurier. `travel` : la DISTANCE
 *  (cf. `missionTravelMult`). ⚠️ L'ancien bonus forfaitaire par combat traversé est
 *  REMPLACÉ par la part des abattus (`skirmishXpShares`), ajoutée dans `resolveCaravan`. */
export function missionXp(adv: Adventurer, poi: Poi): number {
  const ratio = Math.max(0.15, Math.min(2, poi.level / Math.max(1, adv.level)));
  const travel = missionTravelMult(poi);
  return Math.max(1, Math.round(trialXpBase(poi.level) * Math.min(1, ratio) ** 1.5 * travel));
}
```

`resolveCaravan` — remplacer, de `const foe = roadFoe(poi);` jusqu'à la fin de la branche `if (roll < amb) { … }`, par :

```ts
  // ⚔️ Une unité par aventurier contre une troupe à danger ABSOLU. Chaque embuscade repart
  // de l'escorte au complet et en pleine forme : les jambes de trajet sont des rencontres
  // distinctes, séparées par des heures de route.
  const units = roadUnits(escort, road);
  const troop = roadTroop(poi);
  const kills: Record<string, number> = Object.fromEntries(escort.map((a) => [a.id, 0]));
  const xpShare: Record<string, number> = Object.fromEntries(escort.map((a) => [a.id, 0]));
  // Une rencontre par jambe de trajet — deux fois plus sur une route dangereuse.
  const legs = poi.perilous ? 4 : 2;
  const base = poi.perilous ? AMBUSH_BASE.perilous : AMBUSH_BASE.calme;
  const amb = ambushChance(poi, escort);
  for (let i = 0; i < legs; i++) {
    const roll = rng();
    if (roll < amb) {
      const r = simulateSkirmish(units, troop, (seed + i * 7919) >>> 0);
      const abattus = r.foesDown.length;
      events.push({
        kind: 'bandits',
        won: r.win,
        kills: abattus,
        fallen: r.down.length,
        text: r.win
          ? `Une embuscade repoussée (${abattus} bandit${abattus > 1 ? 's' : ''} abattu${abattus > 1 ? 's' : ''}).`
          : `Des bandits emportent une part du convoi (${abattus} abattu${abattus > 1 ? 's' : ''} sur ${troop.length}).`,
      });
      for (const a of escort) kills[a.id] = (kills[a.id] ?? 0) + (r.killsBy[a.id] ?? 0);
      const parts = skirmishXpShares(escort, troop, r);
      for (const a of escort) xpShare[a.id] = (xpShare[a.id] ?? 0) + (parts[a.id] ?? 0);
      // 🤕 Le JOURNAL dit qui est tombé : ceux-là partent à l'infirmerie, gagné ou perdu.
      for (const id of r.down) if (!hurt.includes(id)) hurt.push(id);
      if (r.win) {
        mult *= 1.12;
        // (bloc de tirage d'équipement d'aventurier INCHANGÉ, sur `gearRng`)
        const piece = rollAdvGearDrop(gearRng, escort, {
          chance: ADV_GEAR_DROP.ambush,
          level: poi.level,
          luck: poi.perilous ? 0.3 : 0.1,
          playerLevel,
        });
        if (piece) advGear.push(piece);
      } else {
        mult *= CARAVAN.lossKeep;
      }
```

(les branches `else if (roll >= base && roll < 0.34)` / `detour` / `calme` et le commentaire sur `base` restent tels quels.)

Plus bas, remplacer le calcul d'XP :

```ts
const xp: Record<string, number> = {};
for (const a of escort) xp[a.id] = missionXp(a, poi) + (xpShare[a.id] ?? 0);
```

et ajouter `kills,` dans l'objet retourné (après `xp,`).

(Un seul import depuis `./skirmish` dans `caravan.ts` : celui de la Task 3, élargi ci-dessus.)

- [ ] **Step 5: Run tests (hors bandes)**

Run: `npm run typecheck`
Expected: aucune erreur (le compilateur désigne tout appelant de `missionXp` à 3 arguments ou de `roadFoe` resté dans `src/`).

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts -t "socle de mission|BLESSÉS|SON dû|ABATTUS|SUR LA ROUTE AUSSI|l’équipement compte sur la route"`
Expected: PASS. Les tests de BANDES peuvent échouer à ce stade : c'est l'objet de la Step 6.

- [ ] **Step 6: RECALIBRATION MESURÉE** — remplacer le contenu de `test/_probe-road.test.ts` par :

```ts
import { it } from 'vitest';
import {
  CARAVAN,
  refAdventurer,
  refAdvGear,
  refCompanions,
  resolveCaravan,
  roadTroop,
  roadUnits,
} from '@/lib/caravan';
import { SKIRMISH, simulateSkirmish } from '@/lib/skirmish';
import type { Adventurer } from '@/lib/adventurers';
import type { Poi } from '@/lib/expedition';

const poi = (level: number, perilous = false): Poi => ({
  id: 'p',
  type: 'wreck',
  level,
  x: 50,
  y: 50,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...(perilous ? { perilous: true } : {}),
});
const team = (n: number, L: number, nus = false, sansGear = false): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(L, i),
    id: `a${i}`,
    ...(nus ? {} : { familiarId: `refFam${i % 3}` }),
    ...(sansGear
      ? {}
      : {
          gear: {
            weapon: `refGear${i}weapon`,
            armor: `refGear${i}armor`,
            accessory: `refGear${i}accessory`,
          },
        }),
  }));
const win = (esc: Adventurer[], p: Poi, n: number) => {
  const lvl = esc[0]!.level;
  const units = roadUnits(esc, {
    familiars: refCompanions(lvl),
    talents: [],
    advGear: refAdvGear(lvl, esc.length),
  });
  const troop = roadTroop(p);
  let w = 0;
  for (let s = 0; s < n; s++) if (simulateSkirmish(units, troop, s * 211 + 7).win) w++;
  return w / n;
};
const NIV = [12, 20, 26, 45, 70, 85];
const C = CARAVAN as unknown as Record<string, number>;
const S = SKIRMISH as unknown as Record<string, number>;

it('phase 1 — grille grossière (100 graines, marge 2 points)', { timeout: 3_600_000 }, () => {
  for (const foePvTurns of [1.5, 2, 2.5, 3, 3.5, 4])
    for (const foeDmgPctPv of [0.15, 0.2, 0.25, 0.3, 0.35])
      for (const perilousMult of [1.2, 1.35, 1.5, 1.7])
        for (const troopCalm of [2, 3])
          for (const troopPerilous of [3, 4]) {
            Object.assign(C, { foePvTurns, foeDmgPctPv, perilousMult, troopCalm, troopPerilous });
            const calme = NIV.map((L) => win(team(3, L), poi(L), 100));
            if (calme.some((t) => t < 0.72 || t > 0.92)) continue;
            const peril = NIV.map((L) => win(team(3, L), poi(L, true), 100));
            if (peril.some((t) => t < 0.1 || t > 0.38)) continue;
            console.log(
              JSON.stringify({
                foePvTurns,
                foeDmgPctPv,
                perilousMult,
                troopCalm,
                troopPerilous,
                calme,
                peril,
              }),
            );
          }
});
```

Run: `node node_modules/vitest/vitest.mjs run test/_probe-road.test.ts`
Expected: une ligne JSON par candidat. **Aucun candidat** → affiner la grille autour des configurations les plus proches (pas de 0,25 sur `foePvTurns`, 0,025 sur `foeDmgPctPv`) et relancer ; si toujours aucun, S'ARRÊTER et rapporter (ne jamais relâcher une bande).

Puis ajouter au probe (en y collant les candidats de la phase 1 dans `CANDIDATS`) :

```ts
const CANDIDATS: Record<string, number>[] = [
  // collés depuis la phase 1 : { foePvTurns, foeDmgPctPv, perilousMult, troopCalm, troopPerilous }
];

it('phase 2 — toutes les bandes (600 graines) + XP + blessés', { timeout: 3_600_000 }, () => {
  for (const cand of CANDIDATS) {
    Object.assign(C, cand);
    const calme = NIV.map((L) => win(team(3, L), poi(L), 600));
    const peril = NIV.map((L) => win(team(3, L), poi(L, true), 600));
    const solo = NIV.map((L) => win(team(1, L), poi(L), 600));
    const duo = NIV.map((L) => win(team(2, L), poi(L), 600));
    const sansGear = NIV.map((L) => win(team(3, L, false, true), poi(L), 200));
    const ok =
      calme.every((t) => t >= 0.7 && t <= 0.94) &&
      Math.max(...calme) - Math.min(...calme) < 0.3 &&
      peril.every((t) => t >= 0.08 && t <= 0.4) &&
      solo.every((t) => t < 0.01) &&
      duo.every((t, i) => t <= calme[i]! - 0.25) &&
      sansGear.every((t) => t >= 0.5) &&
      [4, 5].every((i) => win(team(3, NIV[i]!), poi(NIV[i]!), 200) > sansGear[i]! + 0.1) &&
      win(team(3, 45, true), poi(45), 200) < win(team(3, 45), poi(45), 200) &&
      win(team(3, 45, true), poi(45), 200) > 0.3 &&
      win(team(3, 20), poi(20), 150) > win(team(1, 20), poi(20), 150) + 0.3 &&
      win(team(3, 20), poi(20), 150) > 0.4 &&
      win(team(3, 20), poi(20), 150) < 1 &&
      win(team(4, 20), poi(20), 150) >= win(team(3, 20), poi(20), 150) &&
      [26, 70].every(
        (L) =>
          win(team(1, L), poi(L, true), 150) < 0.15 &&
          win(team(3, L), poi(L, true), 150) > 0.08 &&
          win(team(4, L), poi(L, true), 150) >= win(team(3, L), poi(L, true), 150),
      ) &&
      win(team(3, 26), poi(26, true), 150) < 0.7;
    const marge = Math.min(
      ...calme.map((t) => Math.min(t - 0.7, 0.94 - t)),
      ...peril.map((t) => Math.min(t - 0.08, 0.4 - t)),
    );
    console.log(JSON.stringify({ cand, ok, marge, calme, peril, solo, duo, sansGear }));
    if (!ok) continue;
    for (const k of [0.1, 0.15, 0.2, 0.25, 0.3, 0.4]) {
      S.xpPerKill = k;
      const lignes: string[] = [];
      for (const per of [false, true])
        for (const L of NIV) {
          const road = { familiars: refCompanions(L), talents: [], advGear: refAdvGear(L) };
          let xp = 0;
          let blesse = 0;
          for (let s = 1; s <= 400; s++) {
            const o = resolveCaravan(poi(L, per), team(3, L), s * 7919 + 3, road, L);
            xp += Object.values(o.xp).reduce((a, b) => a + b, 0) / 3;
            if (o.hurt.length) blesse++;
          }
          lignes.push(
            `${per ? 'peril' : 'calme'} L${L} xp=${(xp / 400).toFixed(2)} blesses=${((100 * blesse) / 400).toFixed(1)}%`,
          );
        }
      console.log(`xpPerKill=${k}\n` + lignes.join('\n'));
    }
  }
});
```

Run: `node node_modules/vitest/vitest.mjs run test/_probe-road.test.ts -t "phase 2"`
Expected: pour chaque candidat, `ok` et la `marge` ; pour les candidats `ok`, l'XP moyenne par membre selon `xpPerKill`.

Choisir : le candidat `ok` de plus grande `marge`, puis le `xpPerKill` dont les 12 moyennes restent à **±15 %** des 12 valeurs de la Step 1 (s'il n'y en a pas, prendre le plus proche et le rapporter explicitement). **Écrire ces valeurs** dans `CARAVAN` (`foePvTurns`, `foeDmgPctPv`, `perilousMult`, `troopCalm`, `troopPerilous`) et `SKIRMISH.xpPerKill`, en remplaçant les commentaires de calibration de `foePvTurns`/`foeDmgPctPv`/`troopCalm` par les chiffres MESURÉS (calme, périlleux, solo, duo, sans pièces aux 6 niveaux ; XP avant/après ; part de voyages avec blessé avant/après).

- [ ] **Step 7: Mettre à jour les commentaires chiffrés des tests de bandes** (`test/caravan.test.ts`, tests « LA DIFFICULTÉ DE LA ROUTE EST PLATE », « COMBIEN J'EN ENVOIE », « L'ÉQUIPEMENT EST UN BONUS ») avec les valeurs mesurées sur 600 graines par le moteur de groupe. Les ASSERTIONS ne changent pas.

- [ ] **Step 8: Re-épingler le test du générateur séparé** (« GÉNÉRATEUR SÉPARÉ pour l'équipement — la graine 8 pin le reste du butin », ~1682). Ses valeurs dépendent du moteur. Dans le probe, ajouter puis lancer :

```ts
it('graine à épingler', () => {
  const escort = [0, 1, 2].map((i) => refAdventurer(40, i));
  const road = { familiars: refCompanions(40), talents: [], advGear: [] };
  for (let s = 1; s <= 400; s++) {
    const o = resolveCaravan(poi(40, true), escort, s, road, 40);
    const iWin = o.events.findIndex((e) => e.kind === 'bandits' && e.won);
    if (o.advGear.length && iWin >= 0 && iWin < o.events.length - 1) {
      console.log(
        s,
        JSON.stringify({
          gold: o.gold,
          energy: o.energy,
          summonStones: o.summonStones,
          scrap: o.scrap,
          keys: o.keys,
          wages: o.wages,
          xp: o.xp,
          kills: o.kills,
          hurt: o.hurt,
          kinds: o.events.map((e) => e.kind),
          won: o.events.map((e) => e.won),
        }),
      );
      break;
    }
  }
});
```

Remplacer dans le test la graine `8` par la graine imprimée (et le libellé « la graine 8 »), et chaque valeur attendue par celle imprimée (ajouter `expect(o.kills).toEqual(…)`). Puis **mutation** : dans une copie de `caravan.ts`, remplacer `rollAdvGearDrop(gearRng,` par `rollAdvGearDrop(rng,` → ce test FAIL → restaurer.

- [ ] **Step 9: Supprimer la sonde et lancer toute la couverture concernée**

```bash
rm test/_probe-road.test.ts
node node_modules/vitest/vitest.mjs run test/caravan.test.ts test/skirmish.test.ts test/raid.test.ts test/defensePower.test.ts test/advGear.test.ts test/scrapEconomy.test.ts test/goldSink.test.ts
npm run typecheck
```

Expected: tout PASS, aucune erreur de type.

- [ ] **Step 10: Mutations** (depuis des copies de `src/lib/caravan.ts`, restaurer après chaque ; relancer `test/caravan.test.ts`)
  1. Troupe adaptée à l'escorte : `const troop = roadTroop(poi);` → `const troop = troopOf(units.map((u) => u.combatant), { count: CARAVAN.troopCalm, level: poi.level, pvTurns: CARAVAN.foePvTurns, dmgPctPv: CARAVAN.foeDmgPctPv, mult: 1, name: 'x', emoji: 'x' });` → un test de bande (solo < 0,01 ou duo ≤ trio − 0,25, via `resolveCaravan` dans « socle de mission » ou « BLESSÉS ») FAIL. ⚠️ `winPct` appelle `roadTroop` directement : si seuls des tests `winPct` existaient, cette mutation passerait — vérifier qu'un test passant par `resolveCaravan` tombe, sinon le signaler.
  2. Compagnons ignorés : `roadUnits(escort, road)` → `roadUnits(escort, { familiars: [], talents: [], advGear: [] })` → « CE QUI EST BRANCHÉ EST BIEN LU PAR LE COMBAT » FAIL.
  3. Victime unique : `for (const id of r.down) if (!hurt.includes(id)) hurt.push(id);` → `if (!r.win && escort[0] && !hurt.includes(escort[0].id)) hurt.push(escort[0].id);` → « BLESSÉS » FAIL.
  4. Abattus non cumulés : retirer la ligne `for (const a of escort) kills[a.id] = …` → « socle de mission » (Σ par tête) FAIL.
  5. XP des abattus ignorée : `missionXp(a, poi) + (xpShare[a.id] ?? 0)` → `missionXp(a, poi)` → « socle de mission » FAIL.
  6. Route périlleuse neutralisée : dans `roadTroop`, `perilous ? CARAVAN.troopPerilous : CARAVAN.troopCalm` → `CARAVAN.troopCalm` ET `perilous ? CARAVAN.perilousMult : 1` → `1` → « une route PÉRILLEUSE est réellement plus dure » ou la bande périlleuse FAIL.
  7. Anciennes constantes : remettre `foePvTurns: 2.58`, `foeDmgPctPv: 0.275`, `perilousMult: 1.35`, `troopCalm: 3`, `troopPerilous: 3` → au moins un test de bande FAIL (si les valeurs retenues sont identiques à celles-ci, noter « mutation sans objet »).
  8. Rendement décroissant de mission : dans `missionXp`, `Math.min(1, ratio) ** 1.5` → `1` → « l'XP a un RENDEMENT DÉCROISSANT » FAIL.

- [ ] **Step 11: Lint ciblé + commit** (le message reprend les chiffres mesurés)

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/caravan.ts src/lib/skirmish.ts test/caravan.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/caravan.ts src/lib/skirmish.ts
git add src/lib/caravan.ts src/lib/skirmish.ts test/caravan.test.ts
git commit -m "Embuscades de convoi sur le moteur de groupe : XP des abattus partagee, blesses = tombes, route recalibree

Mesure (600 graines, niveaux 12/20/26/45/70/85) : <coller calme / perilleux / solo / duo / sans pieces>.
XP moyenne par membre avant -> apres : <coller>. Voyages avec blesse avant -> apres : <coller>.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

(les `<coller>` sont les sorties de la Step 1 et de la Step 6, recopiées telles quelles.)

---

### Task 5: Le rapport de convoi montre les abattus — et les convois d'avant se lisent toujours

**Files:**

- Modify: `src/lib/caravan.ts` (`CaravanReportMember`, `CaravanReport`, `caravanReport`)
- Modify: `src/components/CaravanReportView.vue`
- Modify: `src/stores/character.ts:2255-2266` (commentaire de `claimCaravan` seulement)
- Test: `test/caravan.test.ts` (`describe('📜 LE RAPPORT DE CONVOI …')`)

**Interfaces:**

- Consumes: `CaravanOutcome.kills?` (Task 4).
- Produces: `CaravanReportMember.kills: number` ; `CaravanReport.hasKills: boolean` ; `CaravanReport.totalKills: number`.

- [ ] **Step 1: Write the failing test** (dans le `describe('📜 LE RAPPORT DE CONVOI DIT QUI A VOYAGÉ …')`)

```ts
it('🗡️ chaque aventurier affiche SES abattus', () => {
  const v = van();
  const kills = { [escort[0]!.id]: 2, [escort[1]!.id]: 0, [escort[2]!.id]: 1 };
  const r = caravanReport({ ...v, outcome: { ...v.outcome, kills } }, escort);
  expect(r.hasKills).toBe(true);
  expect(r.members.map((m) => m.kills)).toEqual([2, 0, 1]);
  expect(r.totalKills).toBe(3);
});

it('⚠️ un convoi LANCÉ AVANT le moteur de groupe se lit et s’encaisse toujours', () => {
  // Son `outcome` a été figé au départ par l'ancien moteur : ni `kills`, ni `fallen`.
  // L'XP par tête (`xp`) et les blessés (`hurt`), que `claimCaravan` crédite, y sont.
  const v = van();
  const outcome = { ...v.outcome };
  delete (outcome as { kills?: unknown }).kills;
  const legacy = {
    ...v,
    outcome: { ...outcome, events: outcome.events.map(({ kills: _k, fallen: _f, ...e }) => e) },
  };
  const r = caravanReport(legacy, escort);
  expect(r.hasKills).toBe(false);
  expect(r.totalKills).toBe(0);
  for (const m of r.members) {
    expect(m.kills).toBe(0);
    expect(m.xp).toBe(Math.round(v.outcome.xp[m.id] ?? 0));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts -t "RAPPORT DE CONVOI"`
Expected: FAIL — `hasKills` indéfini.

- [ ] **Step 3: Implementation dans `src/lib/caravan.ts`**

Dans `CaravanReportMember`, après `xp: number;` :

```ts
/** Bandits abattus par lui sur ce voyage (0 pour un convoi d'avant le moteur de groupe). */
kills: number;
```

Dans `CaravanReport`, après `totalXp: number;` :

```ts
/** Le convoi porte-t-il un décompte des abattus ? Faux pour un convoi lancé avant v0.859 :
 *  l'écran n'affiche alors pas une colonne de zéros qui mentirait. */
hasKills: boolean;
totalKills: number;
```

Dans `caravanReport`, dans l'objet du membre (après `xp: …,`) :

```ts
      kills: Math.max(0, Math.round(o.kills?.[id] ?? 0)),
```

puis après `const totalXp = …` :

```ts
const totalKills = members.reduce((n, m) => n + m.kills, 0);
```

et dans l'objet retourné, après `totalXp,` : `hasKills: !!o.kills, totalKills,`.

- [ ] **Step 4: Écran** — `src/components/CaravanReportView.vue`

Dans le titre repliable, après `<span class="cr-exp-xp">+{{ r.totalXp }} XP</span>`, ajouter avant lui :

```vue
<span v-if="r.hasKills" class="cr-exp-kills">🗡️ {{ r.totalKills }}</span>
```

Dans chaque ligne, avant `<span class="cr-m-xp">` :

```vue
<span
  v-if="r.hasKills && m.kills"
  class="cr-m-kills"
  :title="`${m.kills} bandit(s) abattu(s)`"
>🗡️ {{ m.kills }}</span>
```

Styles (dans le bloc `scoped`) :

```scss
.cr-exp-kills,
.cr-m-kills {
  color: var(--dim);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.cr-exp-kills {
  margin-left: auto;
}
.cr-exp-kills + .cr-exp-xp {
  margin-left: 8px;
}
```

- [ ] **Step 5: Store** — `src/stores/character.ts`, commentaire au-dessus de `claimCaravan` : remplacer la première phrase par

```ts
/** Encaisse la cargaison d'un convoi rentré : devises, XP par aventurier, blessés.
 *  ⚠️ `o.xp` contient DÉJÀ le socle de mission ET la part des bandits abattus, calculés au
 *  départ (moteur de groupe) ; un convoi lancé avant la bascule porte l'XP de l'ancien
 *  moteur dans le même champ — rien à distinguer ici. `o.hurt` = ceux qui sont tombés. */
```

(aucune ligne de code ne change dans le store.)

- [ ] **Step 6: Run tests + typecheck**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 7: Mutations** (copies, restaurer)
  1. `hasKills: !!o.kills` → `hasKills: true` → « convoi LANCÉ AVANT » FAIL.
  2. `o.kills?.[id] ?? 0` → `0` → « SES abattus » FAIL.

- [ ] **Step 8: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/caravan.ts src/components/CaravanReportView.vue src/stores/character.ts test/caravan.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/caravan.ts src/components/CaravanReportView.vue src/stores/character.ts
git add src/lib/caravan.ts src/components/CaravanReportView.vue src/stores/character.ts test/caravan.test.ts
git commit -m "Rapport de convoi : bandits abattus par aventurier, convois d'avant le moteur de groupe lisibles

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Portes, code mort, CLAUDE.md, version

**Files:**

- Modify: `CLAUDE.md` (nouvelle entrée juste AU-DESSUS de la puce « 🗡️ ÉQUIPEMENT DES AVENTURIERS PAR CLASSE DE BASE (v0.858… », ~ligne 639 ; annotation de la puce « ⚠️ LE BONUS D'XP SUIT LES COMBATS RÉELS », ~ligne 301 ; mention de `missionXp`/`roadFoe` dans la puce CARAVANES)
- Modify: `package.json` (`version`)
- Modify: `src/lib/adventurers.ts:1302` (commentaire « Mesuré avec `missionXp` »)

- [ ] **Step 1: Rebase et version**

```bash
git fetch origin && git rebase origin/main
node -e "console.log(require('./package.json').version)"
git show origin/main:package.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))"
```

Mettre `package.json` `version` à la version d'`origin/main` + 1 en mineur (`0.858.0` → `0.859.0` si `origin/main` n'a pas bougé).

- [ ] **Step 2: Code mort**

Run: `npm run dead`
Expected: zéro ligne. Si `roadPairs`, `unitEffects`, `troopOf`, `TroopSpec`, `SkirmishKill` ou autre sont signalés « export inutilisé », dé-exporter ce qui n'est lu qu'en interne (garder exportés `simulateSkirmish`, `troopOf`, `skirmishXpShares`, `trialXpBase`, `SKIRMISH`, `SkirmishUnit`, `SkirmishResult`, `roadUnits`, `roadTroop`, `unitEffects`, `CompanionSet` s'ils sont lus hors de leur module, tests compris) ; relancer jusqu'à zéro.

- [ ] **Step 3: CLAUDE.md** — insérer au-dessus de la puce « 🗡️ ÉQUIPEMENT DES AVENTURIERS PAR CLASSE DE BASE » :

```md
- **⚔️ COMBAT DE GROUPE — les embuscades de convoi passent au moteur à unités distinctes (v0.859 ; étape 2 du chantier « camps »)**. `src/lib/skirmish.ts` (pur/testé).
  - **LE MOTEUR N'A AUCUNE FORMULE DE DÉGÂTS** : un affrontement est un **enchaînement de DUELS** `simulateCombat` (crit, esquive, réduction, vol de vie, signatures, procs), PV **reportés des deux côtés** (nouvelle option `startMonsterPv`). La troupe se présente dans son ordre, la graine choisit l'allié vivant qui lui fait face, le perdant tombe ; le **journal** nomme qui a abattu qui. ⚠️ `siegeBattle` n'a PAS été réutilisé : ses unités n'ont que PV/dégâts (ni esquive, ni réduction, ni procs) et presque aucun aléa — un 3 contre 3 y serait quasi déterministe, or la route vit de probabilités.
  - **UNE UNITÉ PAR AVENTURIER** (`roadUnits`) avec SON compagnon, SON talent, SES pièces : `unitEffects` (caravan.ts) est la définition UNIQUE, lue par la route ET par le rempart (`pairEffects` y délègue, fatigue en paramètre). La division par l'effectif (`roadCompanionEffects`, supprimé) n'existait que parce que l'escorte était fondue en un combattant.
  - **DANGER ABSOLU** : `roadTroop(poi)` = `troopOf` sur 3 aventuriers de référence accompagnés et équipés (offense et survie MOYENNES via `offenseOf`/`survivalOf`), jamais sur l'escorte envoyée. `roadFoe` supprimé. Constantes recalibrées : `foePvTurns` ‹valeur›, `foeDmgPctPv` ‹valeur›, `perilousMult` ‹valeur›, `troopCalm` ‹valeur›, `troopPerilous` ‹valeur›. `escortMax`, `AMBUSH_BASE`, `lossKeep` inchangés.
  - **MESURÉ (600 graines, niveaux 12/20/26/45/70/85)** : trio calme ‹…›, périlleux ‹…›, solo ‹…›, duo ‹…›, trio sans pièces ‹…› — toutes les bandes de `caravan.test` tiennent sans être relâchées.
  - **XP** : `missionXp(adv, poi)` garde le socle (versé même sans combat, même en perdant) ; le bonus forfaitaire par combat traversé (`xpPerFight`/`xpFightMax`) est **remplacé** par la part des abattus `skirmishXpShares` : chaque bandit abattu vaut `SKIRMISH.xpPerKill` (‹valeur›) × `trialXpBase(niveau)`, total **partagé entre les présents**, rendement décroissant de `missionXp` et **marge de portage** (`carryMargin` 5 : un abattu vaut au plus niveau du membre + 5, un vétéran n'élève pas une recrue à sa place). XP moyenne par membre d'un trio, avant → après : ‹…›.
  - **BLESSÉS = TOMBÉS** : l'ancienne victime tirée au hasard disparaît ; tout allié tombé (gagné OU perdu) part à l'infirmerie, et une embuscade perdue = toute l'escorte tombée. Voyages avec blessé, avant → après : ‹…›.
  - **RAPPORT** : abattus par aventurier et total (`CaravanOutcome.kills`, `CaravanReport.hasKills/totalKills`). ⚠️ Les convois lancés AVANT la bascule gardent leur `outcome` figé (sans `kills`) : ils s'encaissent et se lisent comme avant.
  - ‹N› mutations, toutes rouges (liste : Task 1 ×1, Task 2 ×9, Task 3 ×5, Task 4 ×8 + flux `gearRng`, Task 5 ×2).
```

Remplacer chaque `‹…›` par la valeur mesurée correspondante (Task 4 Step 1 et Step 6) et `‹N›` par le nombre de mutations réellement lancées.

Dans la puce « ⚠️ LE BONUS D'XP SUIT LES COMBATS RÉELS, pas l'étiquette » (~ligne 301), ajouter en tête : `⚠️ **REMPLACÉ en v0.859** par la part des abattus du combat de groupe (cf. « COMBAT DE GROUPE »).`

Dans `src/lib/adventurers.ts`, commentaire de `advXpToNext` : `Mesuré avec \`missionXp\``→`Mesuré avec \`missionXp\` (avant v0.859 ; le moteur de groupe garde l'XP moyenne à ±15 %)`.

- [ ] **Step 4: Les cinq portes + code mort** (lire chaque sortie)

```bash
npm run typecheck
node node_modules/prettier/bin/prettier.cjs --write CLAUDE.md package.json src/lib/adventurers.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/adventurers.ts src/lib/caravan.ts src/lib/skirmish.ts src/lib/raid.ts src/lib/combat.ts src/components/CaravanReportView.vue src/stores/character.ts
node node_modules/vitest/vitest.mjs run
node node_modules/@quasar/app-vite/bin/quasar.js build
npm run smoke
npm run dead
```

Expected: typecheck sans erreur ; eslint sans erreur ; vitest tout vert (nombre de fichiers et de tests à rapporter) ; build OK ; smoke OK ; dead zéro ligne.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md package.json src/lib/adventurers.ts
git commit -m "Combat de groupe et XP partagee sur les embuscades de convoi (v0.859)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

(Si `npm run dead` a imposé des dé-exports, ajouter les fichiers `src/lib/*.ts` concernés au même `git add`.)

---

## Self-review (fait à l'écriture)

- **Couverture spec étape 2** : moteur pur/testé, unités distinctes, PV reportés, ciblage simple, journal → Task 2 (+ Task 1) ; danger absolu calibré sur 3 aventuriers de référence équipés → Task 3 (`roadTroop`) + Task 4 Step 6 ; XP par abattu partagée avec rendement décroissant → Task 2 (`skirmishXpShares`) + Task 4 ; embuscades sur ce moteur, bonus forfaitaire remplacé → Task 4 ; `escortMax` gardé → contrainte + non touché ; blessés dérivés du journal → Task 4 ; rapport par aventurier → Task 5 ; convois en vol avant la bascule → Task 5 ; CLAUDE.md, version, portes, mutations → Task 6. **Service de l'étape 3** : `simulateSkirmish` accepte des groupes de toute taille et n'importe quelle `SkirmishUnit` (le héros y entrera comme unité), `troopOf` accepte `count`/`mult` (taille de camp), le chef se range en dernier dans la liste de la troupe.
- **Noms cohérents** : `simulateSkirmish`, `troopOf`, `TroopSpec`, `skirmishXpShares`, `trialXpBase`, `SKIRMISH.xpPerKill/carryMargin`, `SkirmishUnit/SkirmishKill/SkirmishResult` (`killsBy`, `down`, `foesDown`, `pvLeft`) ; `CompanionSet`, `unitEffects`, `roadPairs`, `roadUnits`, `roadTroop`, `CARAVAN.troopCalm/troopPerilous` ; `CaravanEvent.kills/fallen`, `CaravanOutcome.kills`, `CaravanReportMember.kills`, `CaravanReport.hasKills/totalKills`.
- **Valeurs non connues à l'écriture** : uniquement des MESURES (constantes recalibrées, XP et blessés avant/après, graine épinglée), chacune produite par une commande donnée dans le plan.
