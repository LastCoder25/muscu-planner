# Camps de faction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les POI `camp` et `lair` deviennent des camps de faction (bandits / bêtes / morts-vivants) que l’on attaque avec un GROUPE — le héros (oui/non) et autant d’aventuriers disponibles qu’on veut —, résolus par UN combat fondu calibré lu par `deriveSkirmish`, avec XP des abattus partagée, butin selon la présence du héros, infirmerie propre aux camps et rapport dans la boîte 📬.

**Architecture:** Un nouveau module pur `src/lib/camp.ts` porte toute la règle des camps (spec, ennemi fondu, corps, résolution, butin, trajet, estimation). Le groupe est fondu par une fonction LINÉAIRE `fuseUnits` (`skirmish.ts`) qui conserve exactement la somme des `offenseOf` et des `survivalOf` des membres — seul chemin qui reste lisible sans taille maximale de groupe et qui accueille le héros « comme une unité de plus ». L’ennemi est un combattant fondu à danger ABSOLU (niveau et taille du camp, jamais le groupe envoyé), ses corps en sont DÉRIVÉS (la somme des corps = la force réelle du combat). Un groupe AVEC héros vit dans `characters.expedition` (un seul voyage héros, comme aujourd’hui) ; SANS héros dans une nouvelle colonne JSONB `characters.parties` ; les deux déposent le même `ExpeditionMessage` (champ `party`) encaissé par `expeClaim`.

**Tech Stack:** Quasar / Vue 3 `<script setup lang="ts">` TS strict (`noUncheckedIndexedAccess`), Pinia, Supabase (JSONB), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-camps-equipement-aventuriers-design.md` — section « Étape 3 — Camps de faction » et « Tranché après relecture ». Les étapes 1 (équipement) et 2 (combat de groupe) sont livrées ; ce plan réutilise `deriveSkirmish`, `GroupFight`, `skirmishXpShares`, `roadUnits`, `unitEffects`, `rollAdvGearDrop`.

## Global Constraints

- Réponses, libellés et commentaires en **français**, dans le style du code voisin (commentaires `⚠️` qui disent POURQUOI).
- Toute la logique métier dans `src/lib/` (pure, testée) ; composants et store ne font que peindre / persister.
- Spec (verbatim) : « `camp` et `lair` deviennent des camps de faction (bandits, bêtes, morts-vivants), rosters repris de `raid.ts`. Camp = troupe + chef ; repaire = troupe plus grande + champion. Niveau dérivé de la distance (règle v0.683 inchangée). »
- Spec : « faction et taille (camp / repaire) tirées uniformément, sans biais de région ni de distance (seul le niveau suit la distance) ». Tirage sur un générateur SÉPARÉ : les tirages existants de la carte (`spawnOne`) ne bougent pas d’un bit.
- Spec : « La troupe reste à danger ABSOLU (fixée par le niveau et la taille du camp) », calibrée sur un groupe de référence ÉQUIPÉ et ACCOMPAGNÉ (même approche que la route : `refCompanions` + `refAdvGear`). « Certains gros camps demandent de nombreux aventuriers » : calibration par taille MESURÉE.
- Spec : « on choisit le héros (oui/non) et autant d’aventuriers disponibles qu’on veut — aucune taille maximale de groupe ». « ⚠️ Les convois gardent `escortMax` (leur calibration mesurée en dépend) ; seuls les camps en sont libérés. »
- Spec : « Départ comme un convoi : trajet en temps réel, zéro énergie ; le héros présent est en expédition jusqu’au retour. `poiOffers` s’ouvre aux camps pour les groupes. » Un seul voyage héros à la fois.
- Moteur : UN combat fondu (`simulateCombat(groupe fondu, ennemi fondu)`) ; le groupe est lu par `deriveSkirmish`. ⚠️ Ne PAS utiliser l’option `startMonsterPv` de `simulateCombat` (supprimée par la vague de corrections parallèle).
- XP : socle `missionXp` + part des abattus `skirmishXpShares` (rendement décroissant, marge de portage niveau+5) — mêmes règles que les embuscades, y compris le multiplicateur de distance si la vague parallèle l’a ajouté à la part des abattus. Le héros NE PREND PAS de part (cf. Task 4).
- Butin : « avec le héros : butin actuel (camp → objet, repaire → pièce de set + pierres) ; sans le héros : or, ferraille, clés, pierres, pièce d’aventurier ». Invariants économiques à tenir : la ferraille reste plus dure que l’or (`scrapEconomy.test`), l’épave reste la source de pointe, le puits d’or tient (`goldSink.test`).
- Défaite : « aventuriers à l’infirmerie ; le héros rentre sans butin (échec d’expédition actuel), sans blessure ». Politique d’infirmerie PROPRE AUX CAMPS = TOUS les aventuriers tombés (≠ `convoyHurt`).
- Rapport : « boîte 📬, encaissé au retour : groupe, abattus, XP de chacun, journal ». `claimed: false` explicite ; `claimed === undefined` = déjà crédité. Pas de rejeu animé.
- Compat : un POI `camp`/`lair` d’une carte sauvegardée et une expédition héros EN COURS vers un camp d’ancien format restent résolvables/encaissables.
- Push : un groupe qui rentre notifie comme un convoi, message avare (ni faction, ni effectif).
- **Vague de corrections parallèle sur la branche** : (1) les corps de `roadTroop`/`troopOf` dérivent leurs PV et dégâts de `roadFoe` (somme des corps = force réelle) ; (2) la part d’XP des abattus est multipliée par `missionTravelMult` ; (3) `startMonsterPv` disparaît. ⚠️ **Au début de CHAQUE tâche, relire les signatures réelles** de `skirmish.ts` et `caravan.ts` (`git log --oneline -8`, puis lire les fonctions nommées dans « Consumes »). Si un nom ou une signature diffère, suivre le code réel et le noter dans le rapport de tâche. Si la vague a créé un helper qui dérive des corps d’un combattant fondu, `campBodies` (Task 4) DOIT l’appeler au lieu de sa propre répartition.
- Un paramètre de contexte nouveau est **REQUIS**, jamais optionnel (le compilateur désigne les sites). Seuls les champs de DONNÉES persistées nouveaux sont optionnels (`ExpeditionOutcome.party`, `ExpeditionMessage.party`) : les rapports d’avant n’en ont pas.
- Tout réglage d’équilibrage se justifie par une **mesure** avec les vraies libs (sonde jetable, supprimée avant commit, chiffres recopiés dans le rapport et le commit). Toute garantie de calcul est vérifiée **par mutation** : casser depuis une COPIE du fichier (jamais `git checkout`/`git restore`), constater le rouge, restaurer depuis la copie, rapporter chaque mutation.
- Poste AppLocker : jamais `npx` ni les shims `.bin`. Tests `node node_modules/vitest/vitest.mjs run [fichier] [-t "motif"]` · typecheck `npm run typecheck` · lint **ciblé uniquement** : `node node_modules/prettier/bin/prettier.cjs --write <fichiers>` puis `node node_modules/eslint/bin/eslint.js -c ./eslint.config.js <fichiers src>` — **jamais `npm run lint`** (il reformate tout le dépôt) · build `node node_modules/@quasar/app-vite/bin/quasar.js build` · smoke `npm run smoke` · code mort `npm run dead`.
- Worktree `C:\Users\BTHH2960\Projets\Perso\muscu-planner-equilibre`, branche `camps`. Ne JAMAIS lire ni modifier `C:\Users\BTHH2960\Projets\Perso\muscu-planner`. `test/` est exclu du typecheck (les erreurs de type des tests n’apparaissent qu’à l’exécution).
- Commits : `git add <fichiers de la tâche>` seulement (jamais `-A`/`.`) ; titre français SANS accents ; ligne vide puis `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Ne jamais committer `.superpowers/`. Pas de push. La version (`package.json`) ne change qu’à la Task 9.

---

## File Structure

| Fichier                                                                                                                                                                                               | Rôle                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/skirmish.ts` (modif)                                                                                                                                                                         | `fuseUnits` : fusion LINÉAIRE d’unités (somme exacte offense / survie)                                                                                                                                                                            |
| `src/lib/caravan.ts` (modif)                                                                                                                                                                          | `refEscortUnits` (extrait de `roadTroop`) ; `poiOffers` gagne `party` + option REQUISE `advsAvailable`                                                                                                                                            |
| `src/lib/raid.ts` (modif)                                                                                                                                                                             | export `factionRoster(faction)` (lecture de `ROSTERS`)                                                                                                                                                                                            |
| `src/lib/expedition.ts` (modif)                                                                                                                                                                       | `CAMP_TYPES`, `CAMP_FACTIONS`, `CAMP_SIZES`, `CampSpec`, `campSpecOf` ; extraction `campHeroOutcome` (bit-identique) ; `PartyResult`, `ExpeditionOutcome.party`, `ExpeditionMessage.party`, copie dans `buildMessage` ; `keepMessages` ; libellés |
| `src/lib/camp.ts` (nouveau)                                                                                                                                                                           | `CAMP`, `HERO_UNIT_ID`, `campFoe`, `campBodies`, `campHurt`, `campGroupHaul`, `resolveCamp`, `partyLegMin`, `startParty`, `canSendParty`, `campWinPct`, `partyReport`                                                                             |
| `src/lib/push.ts` (modif)                                                                                                                                                                             | `PushContext.parties` (REQUIS), message `party_home`                                                                                                                                                                                              |
| `supabase/migrations/0069_parties.sql` (nouveau)                                                                                                                                                      | colonne `characters.parties jsonb` (numéro à vérifier, cf. Task 7)                                                                                                                                                                                |
| `src/stores/character.ts` (modif)                                                                                                                                                                     | colonne `parties`, `sendParty`, `partyTick`, crédit du groupe dans `expeClaim`, refus des camps dans `expeSend`, `keepMessages`                                                                                                                   |
| `src/components/PartyReportView.vue` (nouveau)                                                                                                                                                        | rapport de groupe (membres, abattus, XP, blessés, journal repliable)                                                                                                                                                                              |
| `src/pages/ExpeditionMapPage.vue` (modif)                                                                                                                                                             | panneau « Attaquer le camp », tuiles de voyage des groupes, `partyTick`, rapport dans la modale                                                                                                                                                   |
| `src/pages/AventurePage.vue` (modif)                                                                                                                                                                  | `partyTick` au cycle, rapport dans la boîte 📬, `parties` dans la synchro push                                                                                                                                                                    |
| `test/skirmish.test.ts`, `test/caravan.test.ts`, `test/expedition.test.ts`, `test/camp.test.ts` (nouveau), `test/campCalibration.test.ts` (nouveau), `test/scrapEconomy.test.ts`, `test/push.test.ts` | couverture                                                                                                                                                                                                                                        |
| `CLAUDE.md`, `package.json` (modif)                                                                                                                                                                   | entrée de version, bump                                                                                                                                                                                                                           |

---

### Task 1: `fuseUnits` — le groupe fondu, linéaire, héros compris — et `refEscortUnits`

**Files:**

- Modify: `src/lib/skirmish.ts` (ajouter `fuseUnits` après `troopOf`)
- Modify: `src/lib/caravan.ts` (`refEscortUnits` juste avant `roadTroop` ; `roadTroop` l’appelle)
- Test: `test/skirmish.test.ts`, `test/caravan.test.ts`

**Interfaces:**

- Consumes: `offenseOf`, `survivalOf`, `combatPowerRaw`, `type Combatant` (`combat.ts`) ; `SkirmishUnit` (`skirmish.ts`) ; `roadUnits`, `refCompanions`, `refAdvGear`, `refEscortOf` (privée), `CARAVAN.refEscort` (`caravan.ts`).
- Produces:
  - `fuseUnits(units: readonly SkirmishUnit[], name: string): Combatant` — `offenseOf(résultat) ≈ Σ offenseOf(unités)`, `survivalOf(résultat) ≈ Σ survivalOf(unités)` (arrondi entier près) ; caractéristiques (crit, esquive, réduction, frappes, signatures, procs) = celles du MODÈLE, l’unité de plus forte `combatPowerRaw` (la première en cas d’égalité après tri stable par id). Lance une `Error` sur une liste vide.
  - `refEscortUnits(level: number): SkirmishUnit[]` — les `CARAVAN.refEscort` unités de référence (accompagnées, équipées) au niveau donné.

**Règle de conception à recopier en tête de `fuseUnits` (commentaire) :** la fusion en STATISTIQUES de la route (`escortCombatant` : stats additionnées, frappes = 1 + ΣAgilité·k) est calibrée à ≤ 4 membres ; sa non-linéarité (multi-frappe qui croît avec l’agilité SOMMÉE, terme de niveau compté une seule fois) exploserait à 10 membres, et le héros n’a pas de `advStats`. Les camps n’ont pas de taille maximale : leur groupe est fondu en ADDITIONNANT ce que l’arbitre du jeu mesure (`offenseOf`, `survivalOf`) — le héros entre comme une unité de plus avec son combattant RÉEL (équipement, talents, voie, procs). Aucune formule recopiée : PV et dégâts sont remis à l’échelle PAR `survivalOf`/`offenseOf` du modèle.

- [ ] **Step 0: Relire l’existant** — `git log --oneline -8`, puis lire `src/lib/skirmish.ts` et `roadTroop` dans `src/lib/caravan.ts` (la vague parallèle a pu les modifier). Noter tout écart.

- [ ] **Step 1: Write the failing test** (fin de `test/skirmish.test.ts` ; ajouter `fuseUnits` à l’import de `@/lib/skirmish` et `combatPowerRaw, offenseOf, survivalOf` à celui de `@/lib/combat` s’ils n’y sont pas)

```ts
describe('🧩 fuseUnits — le groupe fondu additionne ce que l’arbitre mesure', () => {
  const unit = (id: string, o: Partial<Combatant>, level = 20): SkirmishUnit => ({
    id,
    name: id,
    emoji: '⚔️',
    level,
    combatant: {
      name: id,
      pv: 500,
      damage: 40,
      crit: 0.1,
      dodge: 0.05,
      initiative: 10,
      strikes: 1.5,
      dmgReduction: 0.1,
      ...o,
    },
  });
  const somme = (us: SkirmishUnit[], f: (c: Combatant) => number) =>
    us.reduce((s, u) => s + f(u.combatant), 0);

  it('une seule unité : offense et survie inchangées', () => {
    const u = unit('a', {});
    const f = fuseUnits([u], 'G');
    expect(offenseOf(f)).toBeCloseTo(offenseOf(u.combatant), 0);
    expect(survivalOf(f)).toBeCloseTo(survivalOf(u.combatant), 1);
    expect(f.name).toBe('G');
  });

  it('⚠️ la SOMME est exacte, quelle que soit la forme des membres', () => {
    const us = [
      unit('a', { pv: 900, damage: 20, strikes: 1, crit: 0.05 }),
      unit('b', { pv: 300, damage: 90, strikes: 3, crit: 0.4, dodge: 0.2 }),
      unit('c', { pv: 1500, damage: 10, dmgReduction: 0.45 }),
    ];
    const f = fuseUnits(us, 'G');
    expect(offenseOf(f) / somme(us, offenseOf)).toBeCloseTo(1, 2);
    expect(survivalOf(f) / somme(us, survivalOf)).toBeCloseTo(1, 2);
  });

  it('le MODÈLE est l’unité la plus puissante : ses caractéristiques passent au groupe', () => {
    const faible = unit('faible', { crit: 0.02, strikes: 1, damage: 5, pv: 100 });
    const forte = unit('forte', {
      crit: 0.5,
      strikes: 4,
      damage: 200,
      pv: 2000,
      procs: new Set(['aegis']),
    });
    const f = fuseUnits([faible, forte], 'G');
    expect(combatPowerRaw(forte.combatant)).toBeGreaterThan(combatPowerRaw(faible.combatant));
    expect(f.crit).toBe(0.5);
    expect(f.strikes).toBe(4);
    expect(f.procs?.has('aegis')).toBe(true);
  });

  it('⚠️ l’ORDRE des membres ne change rien', () => {
    const us = [unit('a', { damage: 30 }), unit('b', { damage: 70, pv: 800 }), unit('c', {})];
    expect(fuseUnits([...us].reverse(), 'G')).toEqual(fuseUnits(us, 'G'));
  });

  it('aucune taille maximale : douze membres valent douze fois un membre', () => {
    const u = unit('x', {});
    const douze = Array.from({ length: 12 }, (_, i) => ({ ...u, id: `x${i}` }));
    const f = fuseUnits(douze, 'G');
    expect(offenseOf(f) / offenseOf(u.combatant)).toBeCloseTo(12, 1);
    expect(survivalOf(f) / survivalOf(u.combatant)).toBeCloseTo(12, 1);
  });

  it('une liste vide est une erreur d’appel', () => {
    expect(() => fuseUnits([], 'G')).toThrow();
  });
});
```

Dans `test/caravan.test.ts`, ajouter `refEscortUnits` à l’import de `@/lib/caravan`, puis en fin de fichier :

```ts
describe('🧭 refEscortUnits — la référence partagée par la route et les camps', () => {
  it('est l’escorte de référence accompagnée et équipée, unité par unité', () => {
    const L = 30;
    const ref = Array.from({ length: CARAVAN.refEscort }, (_, i) => ({
      ...refAdventurer(L, i),
      familiarId: `refFam${i % 3}`,
      gear: {
        weapon: `refGear${i}weapon`,
        armor: `refGear${i}armor`,
        accessory: `refGear${i}accessory`,
      },
    }));
    const attendu = roadUnits(ref, {
      familiars: refCompanions(L),
      talents: [],
      advGear: refAdvGear(L),
    });
    expect(refEscortUnits(L)).toEqual(attendu);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run test/skirmish.test.ts test/caravan.test.ts -t "fuseUnits|refEscortUnits"`
Expected: FAIL — `fuseUnits is not a function` / `refEscortUnits is not a function`.

- [ ] **Step 3: Implementation**

Dans `src/lib/skirmish.ts`, élargir l’import de `./combat` avec `combatPowerRaw`, puis ajouter après `troopOf` :

```ts
/**
 * 🧩 Le GROUPE FONDU d'un camp — additionne ce que l'arbitre du jeu mesure.
 *
 * ⚠️ POURQUOI PAS `escortCombatant` (la fusion de la route) : il additionne les STATS, puis
 * dérive frappes et dégâts de la somme. Calibré à ≤ 4 membres (`CARAVAN.escortMax`), il
 * devient non linéaire au-delà — frappes = 1 + ΣAgilité·k, terme de niveau compté une fois —
 * et un groupe de 10 aurait une offense sans rapport avec 10 aventuriers. Les camps n'ont
 * AUCUNE taille maximale ; et le héros n'a pas de `advStats`.
 * ⚠️ LA RÈGLE : Σ `offenseOf` et Σ `survivalOf` sont CONSERVÉES. Le héros entre comme une
 * unité de plus, avec son combattant RÉEL (équipement, talents, voie, procs). Rien n'est
 * recopié : PV et dégâts du MODÈLE sont remis à l'échelle par `survivalOf`/`offenseOf`
 * eux-mêmes, donc toute évolution de l'arbitre suit sans retouche.
 * ⚠️ MODÈLE = l'unité de plus forte `combatPowerRaw` (tri stable par id à égalité) : ce sont
 * SES crit, esquive, réduction, frappes, signatures et procs que le combat applique.
 */
export function fuseUnits(units: readonly SkirmishUnit[], name: string): Combatant {
  if (!units.length) throw new Error('fuseUnits : groupe vide');
  const sorted = [...units].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const model = sorted.reduce((best, u) =>
    combatPowerRaw(u.combatant) > combatPowerRaw(best.combatant) ? u : best,
  ).combatant;
  const off = units.reduce((s, u) => s + offenseOf(u.combatant), 0);
  const surv = units.reduce((s, u) => s + survivalOf(u.combatant), 0);
  const modelOff = Math.max(1e-9, offenseOf(model));
  const modelSurv = Math.max(1e-9, survivalOf(model));
  return {
    ...model,
    name,
    pv: Math.max(1, Math.round((model.pv * surv) / modelSurv)),
    damage: Math.max(1, Math.round((model.damage * off) / modelOff)),
  };
}
```

Dans `src/lib/caravan.ts`, juste avant `roadTroop` :

```ts
/** 🧭 Les unités de RÉFÉRENCE d'un niveau : `CARAVAN.refEscort` aventuriers, un par
 *  orientation, accompagnés (`refCompanions`) et équipés (`refAdvGear`). ⚠️ SOURCE UNIQUE
 *  du mètre-étalon : la route (`roadTroop`) ET les camps (`campFoe`) s'y calibrent — deux
 *  copies finiraient par mesurer deux vivier différents. */
export function refEscortUnits(level: number): SkirmishUnit[] {
  return roadUnits(refEscortOf(level), {
    familiars: refCompanions(level),
    talents: [],
    advGear: refAdvGear(level),
  });
}
```

Dans `roadTroop`, remplacer le calcul local de la référence (`const ref = roadUnits(refEscortOf(poi.level), { … });`) par `const ref = refEscortUnits(poi.level);` (si la vague parallèle a changé `roadTroop`, remplacer uniquement la construction de la référence, rien d’autre).

- [ ] **Step 4: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/skirmish.test.ts test/caravan.test.ts`
Expected: PASS (tout, bandes de route comprises : `roadTroop` est inchangé numériquement).
Run: `npm run typecheck` — Expected: aucune erreur.

- [ ] **Step 5: Mutations** (depuis des copies ; relancer `test/skirmish.test.ts` ; restaurer)
  1. `model * surv / modelSurv` → `model.pv * units.length` → « SOMME exacte » FAIL.
  2. `(model.damage * off) / modelOff` → `units.reduce((s, u) => s + u.combatant.damage, 0)` → « SOMME exacte » FAIL (frappes/crit différents).
  3. `const model = sorted.reduce(…)` → `const model = units[0]!.combatant` → « MODÈLE » ou « ORDRE » FAIL.
  4. Retirer le tri (`const sorted = [...units]`) avec des ex æquo : si aucun test ne tombe, le noter comme équivalente PROUVÉE (le `reduce` strict garde le premier maximum ; le tri ne sert qu’à l’égalité) et ajouter un cas d’égalité à « ORDRE » qui la tue.

- [ ] **Step 6: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/skirmish.ts src/lib/caravan.ts test/skirmish.test.ts test/caravan.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/skirmish.ts src/lib/caravan.ts
git add src/lib/skirmish.ts src/lib/caravan.ts test/skirmish.test.ts test/caravan.test.ts
git commit -m "skirmish : fuseUnits, groupe fondu lineaire (somme offense/survie) ; refEscortUnits partage

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: La spec d’un camp — faction × taille, uniforme, dérivée de l’id du POI

**Files:**

- Modify: `src/lib/expedition.ts` (après `HARVEST_TYPES`)
- Test: `test/expedition.test.ts`

**Interfaces:**

- Consumes: `mulberry32` (`combat.ts`, déjà importé) ; `type RaidFaction` (`raid.ts`, **import de TYPE seul**).
- Produces:
  - `CAMP_TYPES: ReadonlySet<PoiType>` (`camp`, `lair`)
  - `CAMP_FACTIONS: readonly RaidFaction[]` (`['bandits', 'betes', 'mortsvivants']`)
  - `CAMP_SIZES: { camp: readonly number[]; lair: readonly number[] }` — taille = force en « aventuriers de référence » ; valeurs de départ `camp: [2, 3, 4]`, `lair: [5, 7, 10]` (seules les valeurs de `lair` peuvent bouger en Task 5).
  - `interface CampSpec { faction: RaidFaction; size: number }`
  - `campSpecOf(poi: Pick<Poi, 'id' | 'type'>): CampSpec | null`

**Décision (à recopier en commentaire) :** la spec n’est PAS stockée sur le POI — elle est DÉRIVÉE de son id (hachage FNV-1a → `mulberry32` XOR constante). Trois conséquences voulues : (1) `spawnOne` ne consomme aucun tirage de plus, la carte est identique au bit près ; (2) un POI `camp`/`lair` d’une carte sauvegardée AVANT ce changement a une spec sans migration ni normalisation ; (3) faction et taille ne dépendent ni de la distance ni du niveau. La proportion camp / repaire reste celle de la liste de spawn (inchangée) : l’uniformité porte sur la faction et sur la taille DANS le palier.

- [ ] **Step 1: Write the failing test** (fin de `test/expedition.test.ts` ; ajouter `CAMP_FACTIONS, CAMP_SIZES, CAMP_TYPES, campSpecOf` à l’import de `@/lib/expedition`)

```ts
describe('🏕️ campSpecOf — faction et taille d’un camp', () => {
  const p = (id: string, type: Poi['type']) => ({ id, type });

  it('seuls les camps et repaires en ont une', () => {
    expect(campSpecOf(p('x', 'mine'))).toBeNull();
    expect(campSpecOf(p('x', 'wreck'))).toBeNull();
    expect(CAMP_TYPES.has('camp') && CAMP_TYPES.has('lair')).toBe(true);
    expect(campSpecOf(p('x', 'camp'))).not.toBeNull();
  });

  it('⚠️ ne dépend QUE de l’id et du type : niveau, distance et position n’y sont pour rien', () => {
    const a = campSpecOf({ id: 'poi_9_4', type: 'lair' });
    const full: Poi = {
      id: 'poi_9_4',
      type: 'lair',
      level: 80,
      x: 3,
      y: 7,
      distNorm: 0.99,
      spawnedAt: 0,
      expiresAt: 1,
    };
    expect(campSpecOf(full)).toEqual(a);
  });

  it('la taille appartient au palier : un camp reste un camp, un repaire un repaire', () => {
    for (let i = 0; i < 300; i++) {
      expect(CAMP_SIZES.camp).toContain(campSpecOf(p(`poi_1_${i}`, 'camp'))!.size);
      expect(CAMP_SIZES.lair).toContain(campSpecOf(p(`poi_1_${i}`, 'lair'))!.size);
    }
  });

  it('⚠️ UNIFORME : chaque faction et chaque taille sortent à parts égales', () => {
    const N = 3000;
    const fac = new Map<string, number>();
    const size = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const s = campSpecOf(p(`poi_${(i * 7919) % 100003}_${i}`, 'camp'))!;
      fac.set(s.faction, (fac.get(s.faction) ?? 0) + 1);
      size.set(s.size, (size.get(s.size) ?? 0) + 1);
    }
    for (const f of CAMP_FACTIONS) expect((fac.get(f) ?? 0) / N).toBeGreaterThan(0.29);
    for (const f of CAMP_FACTIONS) expect((fac.get(f) ?? 0) / N).toBeLessThan(0.38);
    for (const s of CAMP_SIZES.camp) expect((size.get(s) ?? 0) / N).toBeGreaterThan(0.29);
    for (const s of CAMP_SIZES.camp) expect((size.get(s) ?? 0) / N).toBeLessThan(0.38);
  });

  it('⚠️ la carte ne change pas : createMap ne porte aucun champ de camp', () => {
    const m = createMap(42, 0, 20);
    for (const q of m.pois) expect(Object.keys(q)).not.toContain('camp');
    expect(createMap(42, 0, 20)).toEqual(m);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run test/expedition.test.ts -t "campSpecOf"`
Expected: FAIL — `campSpecOf is not a function`.

- [ ] **Step 3: Implementation** dans `src/lib/expedition.ts`

En tête : `import type { RaidFaction } from './raid';`. Après `HARVEST_TYPES` :

```ts
/** 🏕️ Les POI qu'on ATTAQUE en groupe (étape 3 des camps) : camp = troupe + chef,
 *  repaire = troupe plus grande + champion. */
export const CAMP_TYPES: ReadonlySet<PoiType> = new Set<PoiType>(['camp', 'lair']);
export const CAMP_FACTIONS: readonly RaidFaction[] = ['bandits', 'betes', 'mortsvivants'];
/** Taille d'un camp = sa FORCE, en aventuriers de RÉFÉRENCE (cf. `campFoe`). Un gros
 *  repaire en demande nettement plus que trois. ⚠️ Recalibré par la mesure (Task 5). */
export const CAMP_SIZES: { camp: readonly number[]; lair: readonly number[] } = {
  camp: [2, 3, 4],
  lair: [5, 7, 10],
};

export interface CampSpec {
  faction: RaidFaction;
  size: number;
}

/** FNV-1a 32 bits : un id de POI → une graine. */
function hashId(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Faction et taille d'un camp — DÉRIVÉES de l'id, jamais stockées.
 *
 * ⚠️ GÉNÉRATEUR SÉPARÉ, par construction : `spawnOne` ne tire rien de plus, donc la carte
 * reste identique au bit près. ⚠️ Un camp d'une carte sauvegardée AVANT les camps de faction
 * en a une aussi, sans migration ni normalisation. ⚠️ Ni la distance ni le niveau n'y
 * entrent : « de tout un peu partout » (seul le niveau suit la distance, règle v0.683).
 */
export function campSpecOf(poi: Pick<Poi, 'id' | 'type'>): CampSpec | null {
  if (poi.type !== 'camp' && poi.type !== 'lair') return null;
  const rng = mulberry32((hashId(poi.id) ^ 0x6d2b79f5) >>> 0 || 1);
  const faction = CAMP_FACTIONS[Math.floor(rng() * CAMP_FACTIONS.length)]!;
  const sizes = CAMP_SIZES[poi.type];
  return { faction, size: sizes[Math.floor(rng() * sizes.length)]! };
}
```

- [ ] **Step 4: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/expedition.test.ts test/expeditionMap.test.ts`
Expected: PASS. `npm run typecheck` sans erreur.

- [ ] **Step 5: Mutations** (copies, restaurer)
  1. `hashId(poi.id)` → `hashId(poi.id) ^ Math.round((poi as Poi).level ?? 0)` → « ne dépend QUE de l’id » FAIL.
  2. `Math.floor(rng() * CAMP_FACTIONS.length)` → `0` → « UNIFORME » FAIL.
  3. `CAMP_SIZES[poi.type]` → `CAMP_SIZES.camp` → « la taille appartient au palier » FAIL.

- [ ] **Step 6: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/expedition.ts test/expedition.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/expedition.ts
git add src/lib/expedition.ts test/expedition.test.ts
git commit -m "expedition : campSpecOf, faction et taille des camps derivees de l'id (uniforme, sans toucher la carte)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Extraire le butin du héros sur un camp — `campHeroOutcome`, bit-identique

**Files:**

- Modify: `src/lib/expedition.ts` (`resolveOutcome`, bloc « Mine = récolte ; camp/repaire = combat auto seedé » jusqu’à la fin de la fonction)
- Test: `test/expedition.test.ts`
- Probe jetable: `test/_golden-outcome.test.ts` + `test/_golden-outcome.json` (SUPPRIMÉS avant commit)

**Interfaces:**

- Consumes: `rollDrop`, `rollSetPiece`, `goldCost`, `travelOneWayMin`, `pick`, `FAIL_TEXT`, `WIN_TEXT`, `EXPE.failRefund` (déjà dans le module).
- Produces: `campHeroOutcome(rng: () => number, poi: Poi, win: boolean, playerLevel: number | undefined): ExpeditionOutcome` — le butin ACTUEL d’un camp/repaire gagné (camp → objet + 10 % de clé ; repaire → pièce de set + 20 % de clé + pierres `1 + ⌊niv/12⌋` ; or `coût × (1 + A/R h × 0,1)`), ou l’échec actuel (or `coût × failRefund`, 12 % de clé, `reconBonus` 0,08) — SANS rencontres de trajet, `returnMult` 1. Consomme `rng` dans le MÊME ordre qu’avant.

- [ ] **Step 1: Instantané de référence, AVANT toute modification** — créer `test/_golden-outcome.test.ts` :

```ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { playerCombatant } from '@/lib/combat';
import { resolveOutcome, type Poi } from '@/lib/expedition';

const heroes = [
  playerCombatant('fort', { puissance: 3000, endurance: 3000, agilite: 3000 }, 40),
  playerCombatant('faible', { puissance: 20, endurance: 20, agilite: 20 }, 5),
];
const pois: Poi[] = (['mine', 'camp', 'lair'] as const).flatMap((type) =>
  [8, 25].map((level) => ({
    id: `g_${type}_${level}`,
    type,
    level,
    x: 60,
    y: 60,
    distNorm: 0.4,
    spawnedAt: 0,
    expiresAt: 9e15,
    ...(type === 'lair' ? { setId: 'voie:berserker' } : {}),
  })),
);

it('instantané resolveOutcome', () => {
  const out: unknown[] = [];
  for (const h of heroes)
    for (const p of pois)
      for (let s = 1; s <= 40; s++) out.push(resolveOutcome(h, p, s * 7919 + 3, 20));
  const file = 'test/_golden-outcome.json';
  if (process.env.GOLDEN_WRITE) writeFileSync(file, JSON.stringify(out));
  else {
    const ref = JSON.parse(readFileSync(file, 'utf8'));
    if (JSON.stringify(ref) !== JSON.stringify(out)) throw new Error('resolveOutcome a changé');
  }
});
```

Run (PowerShell) : `$env:GOLDEN_WRITE='1'; node node_modules/vitest/vitest.mjs run test/_golden-outcome.test.ts; Remove-Item Env:GOLDEN_WRITE`
Expected: PASS, fichier `test/_golden-outcome.json` écrit. (Si `setId: 'voie:berserker'` n’existe pas dans `ITEM_SETS`, prendre `ITEM_SETS[0].id` et le noter.)

- [ ] **Step 2: Write the failing test** (fin de `test/expedition.test.ts` ; ajouter `campHeroOutcome` et `goldCost`/`EXPE` à l’import si absents ; `import { mulberry32 } from '@/lib/combat';`)

```ts
describe('🎁 campHeroOutcome — le butin du héros sur un camp, extrait tel quel', () => {
  const camp: Poi = {
    id: 'c',
    type: 'camp',
    level: 20,
    x: 60,
    y: 60,
    distNorm: 0.4,
    spawnedAt: 0,
    expiresAt: 9e15,
  };
  it('victoire sur un camp : un objet, de l’or, jamais de rencontre de trajet', () => {
    let objets = 0;
    for (let s = 1; s <= 30; s++) {
      const o = campHeroOutcome(mulberry32(s), camp, true, 20);
      expect(o.win).toBe(true);
      expect(o.returnMult).toBe(1);
      expect(o.gold).toBeGreaterThanOrEqual(goldCost('camp', 20));
      if (o.item) objets++;
    }
    expect(objets).toBeGreaterThan(0);
  });
  it('échec : l’échec d’expédition actuel (or remboursé en partie, rien d’autre)', () => {
    const o = campHeroOutcome(mulberry32(5), camp, false, 20);
    expect(o.win).toBe(false);
    expect(o.gold).toBe(Math.round(goldCost('camp', 20) * EXPE.failRefund));
    expect(o.item).toBeNull();
    expect(o.reconBonus).toBe(0.08);
  });
});
```

Run: `node node_modules/vitest/vitest.mjs run test/expedition.test.ts -t "campHeroOutcome"` — Expected: FAIL (`campHeroOutcome is not a function`).

- [ ] **Step 3: Implementation** — dans `resolveOutcome`, remplacer tout le code depuis `// Mine = récolte ; camp/repaire = combat auto seedé.` jusqu’à la fin de la fonction par :

```ts
  // Mine = récolte (pas de combat) ; camp/repaire = combat auto seedé.
  const win =
    poi.type === 'mine'
      ? true
      : simulateCombat(hero, poiCombatant(poi.level, poi.type), { seed: seed + 7, goldOnWin: 0 })
          .win;
  const base = poi.type === 'mine' ? mineOutcome(rng, poi) : campHeroOutcome(rng, poi, win, playerLevel);
  if (!base.win) return base;
  // Rencontres de trajet — MÊME helper que les récoltes (aller ET retour).
  const tr = rollTravelEncounters(rng, hero, poi, seed, playerLevel);
  const items = [...(base.items ?? []), ...tr.drops];
  return {
    ...base,
    gold: Math.round(base.gold * tr.goldMult),
    item: items[0] ?? null,
    items,
    key: base.key + tr.keys,
    returnMult: tr.returnMult,
    text: base.text + tr.text,
  };
}

/** Durée aller-retour en heures, et le facteur de temps historique `0,5 + h`. */
function tripHours(poi: Poi): { rth: number; tf: number } {
  const rth = (2 * travelOneWayMin(poi.level, poi.distNorm)) / 60;
  return { rth, tf: 0.5 + rth };
}

/** MINE : récolte d'or et d'énergie, sans combat (hors rencontres de trajet). */
function mineOutcome(rng: () => number, poi: Poi): ExpeditionOutcome {
  const { rth, tf } = tripHours(poi);
  const cost = goldCost(poi.type, poi.level);
  // MINE = reine de l'or, et d'autant plus loin (coût × 1,3 + facteur de voyage).
  const gold = Math.round(cost * (1.3 + travelFactor(rth)));
  // ÉNERGIE : un complément borné du sport, jamais un substitut (ticket a0d16472).
  const energy = Math.min(
    EXPE.mineEnergyMax,
    Math.round((4 + poi.level * 1.5) * Math.min(tf, EXPE.mineEnergyTfCap)),
  );
  return {
    win: true,
    gold,
    scrap: 0,
    energy,
    summonStones: 0,
    item: null,
    items: [],
    key: 0,
    reconBonus: 0,
    returnMult: 1,
    text: pick(rng, WIN_TEXT[poi.type]),
  };
}

/**
 * 🎁 Le butin du HÉROS sur un camp ou un repaire — extrait tel quel de `resolveOutcome`.
 *
 * ⚠️ SOURCE UNIQUE : l'expédition héros d'avant ET le groupe de faction avec héros
 * (`resolveCamp`) le lisent. Il consomme `rng` dans le MÊME ordre qu'avant l'extraction
 * (vérifié par instantané) ; les rencontres de trajet restent à l'appelant.
 * - gagné : camp → un objet (+10 % de clé), repaire → pièce de set (+20 % de clé) + pierres
 *   d'invocation ; or ≥ équilibre du coût (`coût × (1 + A/R h × 0,1)`).
 * - perdu : l'échec d'expédition actuel (or remboursé en partie, 12 % de clé, reconnaissance).
 */
export function campHeroOutcome(
  rng: () => number,
  poi: Poi,
  win: boolean,
  playerLevel: number | undefined,
): ExpeditionOutcome {
  const cost = goldCost(poi.type, poi.level);
  if (!win) {
    const key = rng() < 0.12 ? 1 : 0;
    return {
      win: false,
      gold: Math.round(cost * EXPE.failRefund), // < coût → jamais un profit
      scrap: 0,
      summonStones: 0,
      energy: 0,
      item: null,
      key,
      reconBonus: 0.08,
      returnMult: 1, // un échec ne raccourcit rien : le héros rentre au pas
      text: pick(rng, FAIL_TEXT[poi.type]),
    };
  }
  const { rth } = tripHours(poi);
  let item: Omit<Item, 'id'> | null = null;
  let key = 0;
  if (poi.type === 'lair' && poi.setId) {
    item = rollSetPiece(rng, { setId: poi.setId, level: poi.level, luck: 0.6, playerLevel });
    key = rng() < 0.2 ? 1 : 0;
  } else if (poi.type === 'camp') {
    item = rollDrop(rng, {
      cleared: true,
      defeated: 1,
      level: poi.level,
      luck: 0.4,
      spread: 1,
      playerLevel,
    });
    key = rng() < 0.1 ? 1 : 0;
  }
  return {
    win: true,
    gold: Math.round(cost * (1.0 + rth * 0.1)),
    scrap: 0,
    energy: 0,
    summonStones: poi.type === 'lair' ? 1 + Math.floor(poi.level / 12) : 0,
    item,
    items: item ? [item] : [],
    key,
    reconBonus: 0,
    returnMult: 1,
    text: pick(rng, WIN_TEXT[poi.type]),
  };
}
```

⚠️ Vérifier contre l’original : l’ordre des `rng()` (combat sans rng → [objet, clé] → texte → rencontres) ; l’échec ne porte PAS de champ `items` ; `summonStones` et `energy` ne sont pas multipliés par les rencontres ; le commentaire historique sur la mine qui versait des fragments est reporté dans `mineOutcome`. Garder dans `resolveOutcome` les commentaires utiles supprimés par le remplacement (HAUL SCALÉ AU TEMPS, etc.) en les déplaçant dans les helpers.

- [ ] **Step 4: Run tests — l’instantané doit être IDENTIQUE**

Run: `node node_modules/vitest/vitest.mjs run test/_golden-outcome.test.ts test/expedition.test.ts test/expeditionMap.test.ts`
Expected: PASS (l’instantané ne lève pas `resolveOutcome a changé`).

- [ ] **Step 5: Mutations** (copies de `expedition.ts`, relancer l’instantané + `expedition.test.ts`, restaurer)
  1. Dans `campHeroOutcome`, déplacer `const key = rng() < 0.12 ? 1 : 0;` APRÈS le `pick(rng, FAIL_TEXT…)` (via une variable `text` calculée avant) → instantané FAIL.
  2. `gold: Math.round(cost * EXPE.failRefund)` → `gold: cost` → « échec » FAIL.
  3. Dans `resolveOutcome`, `key: base.key + tr.keys` → `key: base.key` → instantané FAIL.

- [ ] **Step 6: Supprimer la sonde, lint, commit**

```bash
rm test/_golden-outcome.test.ts test/_golden-outcome.json
node node_modules/prettier/bin/prettier.cjs --write src/lib/expedition.ts test/expedition.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/expedition.ts
git add src/lib/expedition.ts test/expedition.test.ts
git commit -m "expedition : campHeroOutcome extrait de resolveOutcome (instantane identique sur 480 issues)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Le moteur des camps — `camp.ts` (ennemi fondu, corps, résolution, butin, trajet)

**Files:**

- Create: `src/lib/camp.ts`
- Modify: `src/lib/raid.ts` (export `factionRoster`, juste après `ROSTERS`)
- Modify: `src/lib/expedition.ts` (type `PartyResult` ; `ExpeditionOutcome.party?`)
- Test: `test/camp.test.ts` (nouveau)

**Interfaces:**

- Consumes:
  - `fuseUnits` (Task 1), `refEscortUnits`, `roadUnits`, `missionXp`, `caravanWages`, `caravanLegMin`, `slainByAlly`, `type RoadCompanions` (`caravan.ts`) ;
  - `deriveSkirmish`, `skirmishXpShares`, `cumulativeCuts`, `type SkirmishUnit`, `type SkirmishResult` (`skirmish.ts` — relire la signature de `skirmishXpShares` : si la vague parallèle y a ajouté la distance, la passer comme pour les convois) ;
  - `campSpecOf`, `CampSpec`, `CAMP_TYPES`, `campHeroOutcome` (Tasks 2-3), `goldCost`, `harvestYield`, `travelFactor`, `travelOneWayMin`, `HARVEST`, `type Poi`, `type ExpeditionOutcome`, `type ActiveExpedition` (`expedition.ts`) ;
  - `FACTION_LABEL`, `FACTION_EMOJI`, `type RaidFaction` (`raid.ts`) ; `rollAdvGearDrop`, `type AdvGear` (`advGear.ts`) ; `mulberry32`, `offenseOf`, `survivalOf`, `simulateCombat`, `type Combatant` (`combat.ts`) ; `advTitle`, `type Adventurer` (`adventurers.ts`).
- Produces:
  - `factionRoster(faction: RaidFaction): readonly { emoji: string; name: string; kind: UnitKind }[]` (`raid.ts`)
  - `interface PartyResult` (`expedition.ts`) :
    `{ hero: boolean; faction: RaidFaction; size: number; escort: string[]; win: boolean; foes: number; slain: number; foesDown: string[]; kills: Record<string, number>; heroKills: number; xp: Record<string, number>; hurt: string[]; advGear: Omit<AdvGear, 'id'>[]; wages: number; journal: string[] }`
    et `ExpeditionOutcome.party?: PartyResult`.
  - `camp.ts` :
    - `CAMP = { refGroup, pvTurns, dmgPctPv, chiefWeight, championWeight, groupGoldShare, banditGoldMult, scrapShare, stoneShare, campPieces, lairPieces, journalMax }` (valeurs de départ ci-dessous, recalibrées en Task 5)
    - `HERO_UNIT_ID = 'hero'`
    - `interface PartyHero { name: string; level: number; combatant: Combatant }`
    - `campFoe(poi: Poi, spec: CampSpec): Combatant`
    - `campBodies(poi: Poi, spec: CampSpec): SkirmishUnit[]`
    - `campHurt(d: Pick<SkirmishResult, 'win' | 'down'>, escort: readonly { id: string }[]): string[]`
    - `campGroupHaul(poi: Poi, spec: CampSpec, rng: () => number): { gold: number; scrap: number; summonStones: number; key: number }`
    - `interface PartyInput { poi: Poi; spec: CampSpec; escort: Adventurer[]; road: RoadCompanions; hero: PartyHero | null; seed: number; playerLevel: number }`
    - `resolveCamp(input: PartyInput): ExpeditionOutcome` (toujours `party` renseigné)
    - `partyLegMin(poi: Poi, escort: Adventurer[], opts: { hero: boolean; travelMult: number; comptoirLevel: number; gearSpeed: number }): number`
    - `canSendParty(poi: Poi, escortCount: number, hero: boolean): boolean`
    - `startParty(input: PartyInput, now: number, legMin: number): ActiveExpedition`
    - `campWinPct(poi: Poi, spec: CampSpec, allies: readonly SkirmishUnit[], samples: number): number`

- [ ] **Step 0: Relire** `skirmish.ts` (`deriveSkirmish`, `skirmishXpShares`, `troopOf`), `roadTroop`/`resolveCaravan` dans `caravan.ts` : la vague parallèle a pu y ajouter un helper « corps dérivés d’un combattant fondu » ou un paramètre de distance à l’XP. Adapter `campBodies` / la ligne d’XP en conséquence et le noter.

- [ ] **Step 1: Write the failing test** — créer `test/camp.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  CAMP,
  HERO_UNIT_ID,
  campBodies,
  campFoe,
  campGroupHaul,
  campHurt,
  campWinPct,
  canSendParty,
  partyLegMin,
  resolveCamp,
  startParty,
  type PartyInput,
} from '@/lib/camp';
import {
  HARVEST,
  goldCost,
  harvestYield,
  travelFactor,
  travelOneWayMin,
  type Poi,
} from '@/lib/expedition';
import {
  CARAVAN,
  caravanLegMin,
  missionXp,
  refAdvGear,
  refAdventurer,
  refCompanions,
  roadUnits,
} from '@/lib/caravan';
import { fuseUnits, skirmishXpShares } from '@/lib/skirmish';
import { mulberry32, offenseOf, survivalOf, playerCombatant } from '@/lib/combat';
import { factionRoster, type RaidFaction } from '@/lib/raid';
import type { Adventurer } from '@/lib/adventurers';

const poi = (over: Partial<Poi> = {}): Poi => ({
  id: 'cp',
  type: 'camp',
  level: 20,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const team = (n: number, level: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(level, i),
    id: `adv_${i}`,
    familiarId: `refFam${i % 3}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
    },
  }));
const road = (level: number, n: number) => ({
  familiars: refCompanions(level),
  talents: [],
  advGear: refAdvGear(level, n),
});
const input = (over: Partial<PartyInput> = {}): PartyInput => {
  const L = over.poi?.level ?? 20;
  const n = over.escort?.length ?? 3;
  return {
    poi: poi(),
    spec: { faction: 'bandits', size: 3 },
    escort: team(3, L),
    road: road(L, n),
    hero: null,
    seed: 11,
    playerLevel: L,
    ...over,
  };
};
const fort = (L: number) => ({
  name: 'Héros',
  level: L,
  combatant: playerCombatant('Héros', { puissance: 5000, endurance: 5000, agilite: 5000 }, L),
});

describe('🗡️ campFoe — danger ABSOLU, linéaire en taille, identique d’une faction à l’autre', () => {
  it('ne dépend que du niveau et de la taille', () => {
    expect(campFoe(poi(), { faction: 'bandits', size: 3 })).toEqual(
      campFoe(poi({ x: 1, distNorm: 0.9, id: 'autre' }), { faction: 'bandits', size: 3 }),
    );
    expect(campFoe(poi({ level: 60 }), { faction: 'bandits', size: 3 }).pv).toBeGreaterThan(
      campFoe(poi({ level: 20 }), { faction: 'bandits', size: 3 }).pv,
    );
  });
  it('⚠️ deux fois plus gros = deux fois plus de PV et de dégâts', () => {
    const a = campFoe(poi(), { faction: 'betes', size: 3 });
    const b = campFoe(poi(), { faction: 'betes', size: 6 });
    expect(b.pv / a.pv).toBeCloseTo(2, 1);
    expect(b.damage / a.damage).toBeCloseTo(2, 1);
  });
  it('⚠️ ISO-MENACE : la faction ne change que les NOMS, jamais la force', () => {
    const f = (x: RaidFaction) => campFoe(poi(), { faction: x, size: 5 });
    expect({ ...f('betes'), name: '' }).toEqual({ ...f('bandits'), name: '' });
    expect({ ...f('mortsvivants'), name: '' }).toEqual({ ...f('bandits'), name: '' });
  });
  it('calibré sur la RÉFÉRENCE : PV = offense du trio de référence × pvTurns × taille/3', () => {
    const L = 30;
    const ref = fuseUnits(roadUnits(team(CARAVAN.refEscort, L), road(L, CARAVAN.refEscort)), 'r');
    const f = campFoe(poi({ level: L }), { faction: 'bandits', size: 6 });
    expect(f.pv).toBe(Math.max(1, Math.round(Math.max(1, offenseOf(ref)) * CAMP.pvTurns * 2)));
    expect(f.damage).toBe(Math.max(1, Math.round(survivalOf(ref) * 100 * CAMP.dmgPctPv * 2)));
  });
});

describe('⚰️ campBodies — les corps sont la force du combat, répartie', () => {
  it('⚠️ Σ PV et Σ dégâts des corps = ceux de l’ennemi fondu', () => {
    for (const size of [2, 5, 10]) {
      const spec = { faction: 'mortsvivants' as const, size };
      const foe = campFoe(poi(), spec);
      const b = campBodies(poi(), spec);
      expect(b.reduce((s, x) => s + x.combatant.pv, 0)).toBe(foe.pv);
      expect(b.reduce((s, x) => s + x.combatant.damage, 0)).toBe(foe.damage);
    }
  });
  it('camp = troupe + CHEF, repaire = troupe + CHAMPION ; ids uniques ; niveau du lieu', () => {
    const c = campBodies(poi(), { faction: 'bandits', size: 3 });
    const l = campBodies(poi({ type: 'lair' }), { faction: 'bandits', size: 3 });
    const roster = factionRoster('bandits');
    expect(c).toHaveLength(3 + 1);
    expect(c[c.length - 1]!.name).toBe(roster[roster.length - 1]!.name);
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
    for (const x of c) expect(x.level).toBe(20);
    // Le champion d'un repaire pèse plus que le chef d'un camp, à taille égale.
    expect(l[l.length - 1]!.combatant.pv).toBeGreaterThan(c[c.length - 1]!.combatant.pv);
  });
});

describe('⚔️ resolveCamp — un combat fondu, le groupe lu dans son journal', () => {
  it('est déterministe', () => {
    expect(resolveCamp(input())).toEqual(resolveCamp(input()));
  });

  it('⚠️ AUCUNE taille maximale : dix aventuriers partent, et pèsent', () => {
    expect(canSendParty(poi(), 12, false)).toBe(true);
    expect(canSendParty(poi(), 0, true)).toBe(true);
    expect(canSendParty(poi(), 0, false)).toBe(false);
    expect(canSendParty(poi({ type: 'wreck' }), 3, false)).toBe(false);
    const L = 30;
    const spec = { faction: 'bandits' as const, size: 10 };
    const p = poi({ level: L, type: 'lair' });
    const trois = campWinPct(p, spec, roadUnits(team(3, L), road(L, 3)), 120);
    const dix = campWinPct(p, spec, roadUnits(team(10, L), road(L, 10)), 120);
    expect(dix).toBeGreaterThan(trois);
  });

  it('les abattus du journal : Σ par aventurier + héros = abattus', () => {
    for (let s = 1; s <= 30; s++) {
      const o = resolveCamp(input({ seed: s, hero: fort(20) }));
      const r = o.party!;
      const somme = Object.values(r.kills).reduce((a, b) => a + b, 0) + r.heroKills;
      expect(somme).toBe(r.slain);
      expect(r.slain).toBe(r.foesDown.length);
      expect(r.foes).toBe(CAMP.refGroup + 1);
    }
  });

  it('⚠️ le HÉROS ne prend PAS de part d’XP : les aventuriers partagent entre eux', () => {
    const esc = team(2, 20);
    for (let s = 1; s <= 20; s++) {
      const inp = input({ seed: s, escort: esc, road: road(20, 2), hero: fort(20) });
      const o = resolveCamp(inp);
      const parts = skirmishXpShares(esc, campBodies(inp.poi, inp.spec), {
        foesDown: o.party!.foesDown,
      });
      for (const a of esc)
        expect(o.party!.xp[a.id]).toBe(missionXp(a, inp.poi) + (parts[a.id] ?? 0));
      expect(o.party!.xp[HERO_UNIT_ID]).toBeUndefined();
    }
  });

  it('⚠️ INFIRMERIE DES CAMPS : défaite → TOUS les aventuriers tombés ; victoire → personne', () => {
    let defaites = 0;
    let victoires = 0;
    for (let s = 1; s <= 60; s++) {
      const o = resolveCamp(input({ seed: s, spec: { faction: 'betes', size: 4 } }));
      if (o.party!.win) {
        victoires++;
        expect(o.party!.hurt).toEqual([]);
      } else {
        defaites++;
        expect([...o.party!.hurt].sort()).toEqual(['adv_0', 'adv_1', 'adv_2']);
      }
    }
    expect(defaites, 'aucune défaite : le test ne prouve rien').toBeGreaterThan(0);
    expect(victoires, 'aucune victoire : le test ne prouve rien').toBeGreaterThan(0);
    expect(campHurt({ win: false, down: ['hero', 'adv_0'] }, [{ id: 'adv_0' }])).toEqual(['adv_0']);
  });

  it('AVEC le héros : le butin actuel du camp, aucune pièce d’aventurier, le héros jamais blessé', () => {
    const o = resolveCamp(input({ hero: fort(20), spec: { faction: 'bandits', size: 2 } }));
    expect(o.party!.hero).toBe(true);
    expect(o.party!.advGear).toEqual([]);
    expect(o.party!.hurt).not.toContain(HERO_UNIT_ID);
    if (o.win) expect(o.gold).toBeGreaterThanOrEqual(goldCost('camp', 20));
  });

  it('SANS le héros, victoire : or, ferraille, pièce d’aventurier ; jamais d’objet du héros', () => {
    const L = 60;
    const inp = input({
      poi: poi({ level: 5, type: 'lair' }),
      escort: team(10, L),
      road: road(L, 10),
      spec: { faction: 'mortsvivants', size: 5 },
      playerLevel: L,
    });
    const o = resolveCamp(inp);
    expect(o.party!.win).toBe(true);
    expect(o.items ?? []).toEqual([]);
    expect(o.item).toBeNull();
    expect(o.gold).toBeGreaterThan(0);
    expect(o.scrap).toBeGreaterThan(0);
    expect(o.summonStones).toBeGreaterThan(0);
    expect(o.party!.advGear).toHaveLength(CAMP.lairPieces);
    expect(o.party!.wages).toBeGreaterThan(0);
  });

  it('SANS le héros, défaite : rien à ramener, et le socle d’XP tombe quand même', () => {
    const inp = input({
      escort: team(1, 5),
      road: road(5, 1),
      poi: poi({ level: 40 }),
      spec: { faction: 'bandits', size: 4 },
    });
    const o = resolveCamp(inp);
    expect(o.party!.win).toBe(false);
    expect(o.gold + o.scrap + o.summonStones + o.key).toBe(0);
    expect(o.party!.xp['adv_0']!).toBeGreaterThanOrEqual(missionXp(inp.escort[0]!, inp.poi));
  });

  it('⚠️ GÉNÉRATEUR SÉPARÉ : les pièces ne décalent pas la clé du butin de groupe', () => {
    // La clé d'un camp non-bêtes est le PREMIER tirage de `rng` après la résolution.
    let cles = 0;
    for (let s = 1; s <= 200; s++) {
      const inp = input({
        seed: s,
        poi: poi({ level: 5 }),
        escort: team(6, 60),
        road: road(60, 6),
        spec: { faction: 'bandits', size: 2 },
        playerLevel: 60,
      });
      const o = resolveCamp(inp);
      if (!o.party!.win) continue;
      const attendue = mulberry32(s >>> 0 || 1)() < HARVEST.keyChance ? 1 : 0;
      expect(o.key, `graine ${s}`).toBe(attendue);
      cles += attendue;
    }
    expect(cles, 'aucune clé : le test ne prouve rien').toBeGreaterThan(0);
  });

  it('le JOURNAL raconte, borné', () => {
    const o = resolveCamp(
      input({
        escort: team(8, 40),
        road: road(40, 8),
        poi: poi({ level: 40, type: 'lair' }),
        spec: { faction: 'betes', size: 10 },
      }),
    );
    expect(o.party!.journal.length).toBeGreaterThan(0);
    expect(o.party!.journal.length).toBeLessThanOrEqual(CAMP.journalMax + 1);
  });
});

describe('🧭 trajet et départ d’un groupe', () => {
  const esc = team(3, 20);
  it('héros seul = trajet du héros ; avec des aventuriers = le plus lent des deux', () => {
    const p = poi();
    const hero = Math.round(travelOneWayMin(p.level, p.distNorm) * 0.8);
    expect(
      partyLegMin(p, [], { hero: true, travelMult: 0.8, comptoirLevel: 0, gearSpeed: 0 }),
    ).toBe(hero);
    const adv = caravanLegMin(p, esc, 4, 0);
    expect(
      partyLegMin(p, esc, { hero: true, travelMult: 0.8, comptoirLevel: 4, gearSpeed: 0 }),
    ).toBe(Math.max(hero, adv));
    expect(
      partyLegMin(p, esc, { hero: false, travelMult: 0.8, comptoirLevel: 4, gearSpeed: 0 }),
    ).toBe(adv);
  });
  it('startParty : le rapport à l’arrivée, le retour à 2 × la jambe, coût d’or seulement avec le héros', () => {
    const a = startParty(input({ hero: fort(20) }), 1000, 30);
    expect(a.midAt).toBe(1000 + 30 * 60_000);
    expect(a.returnAt).toBe(1000 + 60 * 60_000);
    expect(a.goldCost).toBe(goldCost('camp', 20));
    expect(a.outcome.party).toBeDefined();
    expect(startParty(input(), 1000, 30).goldCost).toBe(0);
  });
});

describe('💰 butin de groupe : dérivé des sources existantes', () => {
  it('ferraille = part de l’épave, pierres = part du sanctuaire, clés des bêtes = archives', () => {
    const p = poi({ level: 30 });
    const tfH = travelFactor((2 * travelOneWayMin(30, 0.5)) / 60);
    const k = 3 / CAMP.refGroup;
    const b = campGroupHaul(p, { faction: 'betes', size: 3 }, mulberry32(1));
    expect(b.scrap).toBe(Math.round(harvestYield('wreck', 30, tfH).scrap * CAMP.scrapShare * k));
    expect(b.key).toBe(harvestYield('archive', 30, tfH).keys);
    const m = campGroupHaul(p, { faction: 'mortsvivants', size: 3 }, mulberry32(1));
    expect(m.summonStones).toBe(
      Math.round(harvestYield('shrine', 30, tfH).summonStones * CAMP.stoneShare * k),
    );
    const bd = campGroupHaul(p, { faction: 'bandits', size: 3 }, mulberry32(1));
    expect(bd.gold).toBeGreaterThan(m.gold);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run test/camp.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/camp"`.

- [ ] **Step 3: Implementation**

`src/lib/raid.ts`, juste après la constante `ROSTERS` :

```ts
/** Le roster d'une faction, dans son ORDRE (qui est une mécanique, cf. plus haut) — lu
 *  aussi par les camps de faction de la carte (`camp.ts`). Le chef est le dernier. */
export function factionRoster(faction: RaidFaction) {
  return ROSTERS[faction];
}
```

`src/lib/expedition.ts` : `import type { AdvGear } from './advGear';` en tête (type seul), puis après `CampSpec` :

```ts
/** ⚔️ Ce qu'un GROUPE a vécu sur un camp — porté par l'issue, recopié dans le rapport 📬 et
 *  encaissé par `expeClaim`. ⚠️ Absent des expéditions et rapports d'avant les camps de
 *  faction : tous les lecteurs le traitent comme optionnel. */
export interface PartyResult {
  hero: boolean;
  faction: RaidFaction;
  size: number;
  /** Ids des aventuriers envoyés (le héros n'y figure pas). */
  escort: string[];
  win: boolean;
  foes: number;
  slain: number;
  foesDown: string[];
  /** Abattus PAR aventurier. */
  kills: Record<string, number>;
  heroKills: number;
  /** XP par aventurier : socle de mission + part des abattus. */
  xp: Record<string, number>;
  /** Aventuriers envoyés à l'infirmerie (défaite : tous ceux qui sont tombés). */
  hurt: string[];
  advGear: Omit<AdvGear, 'id'>[];
  /** Salaires de l'escorte, déduits à l'encaissement. */
  wages: number;
  journal: string[];
}
```

et dans `ExpeditionOutcome`, après `waves?` : `party?: PartyResult; // ⚔️ camp de faction attaqué en groupe`.

Créer `src/lib/camp.ts` :

```ts
// camp.ts — les CAMPS DE FACTION de la carte (étape 3). Pur/testable.
//
// Un camp (`camp` / `lair`) s'attaque avec un GROUPE : le héros (oui/non) et autant
// d'aventuriers disponibles qu'on veut. Départ comme un convoi (temps réel, zéro énergie).
//
// ⚠️ UN COMBAT FONDU, LU PAR `deriveSkirmish`. Le groupe est fondu LINÉAIREMENT
// (`fuseUnits` : Σ offense, Σ survie), l'ennemi est un combattant fondu à danger ABSOLU
// (`campFoe` : niveau et taille du camp, jamais le groupe envoyé), et ses corps en sont
// DÉRIVÉS (`campBodies` : la somme des corps EST la force du combat).
// ⚠️ POURQUOI UNE FUSION LINÉAIRE ET PAS CELLE DE LA ROUTE : cf. `fuseUnits`. Conséquence
// voulue : la victoire se joue sur le RAPPORT (groupe / taille du camp) — un gros camp
// demande nettement plus que trois aventuriers, et rien ne borne la taille du groupe.
import { mulberry32, offenseOf, simulateCombat, survivalOf, type Combatant } from './combat';
import {
  cumulativeCuts,
  deriveSkirmish,
  fuseUnits,
  skirmishXpShares,
  type SkirmishResult,
  type SkirmishUnit,
} from './skirmish';
import {
  CARAVAN,
  caravanLegMin,
  caravanWages,
  missionXp,
  refEscortUnits,
  roadUnits,
  slainByAlly,
  type RoadCompanions,
} from './caravan';
import {
  CAMP_TYPES,
  HARVEST,
  campHeroOutcome,
  goldCost,
  harvestYield,
  travelFactor,
  travelOneWayMin,
  type ActiveExpedition,
  type CampSpec,
  type ExpeditionOutcome,
  type Poi,
} from './expedition';
import { FACTION_EMOJI, FACTION_LABEL, factionRoster } from './raid';
import { rollAdvGearDrop, type AdvGear } from './advGear';
import { advTitle, type Adventurer } from './adventurers';

export const CAMP = {
  /** Taille de la RÉFÉRENCE : un camp de taille 3 est dimensionné sur 3 aventuriers de
   *  référence (`refEscortUnits`), accompagnés et équipés. */
  refGroup: CARAVAN.refEscort,
  /** PV de l'ennemi fondu ≈ N tours de l'offense du groupe de référence. ⚠️ MESURÉ (Task 5). */
  pvTurns: 2.6,
  /** Morsure ≈ part de la SURVIE du groupe de référence. ⚠️ MESURÉ (Task 5). */
  dmgPctPv: 0.27,
  /** Poids du chef (camp) et du champion (repaire) face à un corps de troupe. */
  chiefWeight: 2,
  championWeight: 4,
  /** Butin SANS le héros, en part des sources existantes. ⚠️ MESURÉS (Task 5) : la
   *  ferraille reste plus dure que l'or, l'épave la source de pointe. */
  groupGoldShare: 0.6,
  banditGoldMult: 1.5,
  scrapShare: 0.12,
  stoneShare: 0.5,
  campPieces: 1,
  lairPieces: 2,
  journalMax: 40,
} as const;

/** Id de l'unité du héros dans un groupe — jamais celui d'un aventurier (`adv_…`). */
export const HERO_UNIT_ID = 'hero';

export interface PartyHero {
  name: string;
  level: number;
  combatant: Combatant;
}

export interface PartyInput {
  poi: Poi;
  spec: CampSpec;
  escort: Adventurer[];
  road: RoadCompanions;
  hero: PartyHero | null;
  seed: number;
  /** ⚠️ REQUIS : niveau RÉEL du joueur (anti-runaway des butins). */
  playerLevel: number;
}

/**
 * 🗡️ L'ENNEMI FONDU d'un camp — danger ABSOLU.
 * ⚠️ Dimensionné sur le groupe de RÉFÉRENCE du niveau du lieu, jamais sur le groupe envoyé :
 * sinon « combien j'en envoie » ne voudrait plus rien dire (même règle que la route).
 * ⚠️ Linéaire en taille, et la faction n'y entre pas : ISO-MENACE par construction (elle ne
 * change que les noms et le butin).
 */
export function campFoe(poi: Poi, spec: CampSpec): Combatant {
  const ref = fuseUnits(refEscortUnits(poi.level), 'Référence');
  const m = Math.max(0, spec.size) / CAMP.refGroup;
  return {
    name: FACTION_LABEL[spec.faction],
    pv: Math.max(1, Math.round(Math.max(1, offenseOf(ref)) * CAMP.pvTurns * m)),
    damage: Math.max(1, Math.round(survivalOf(ref) * 100 * CAMP.dmgPctPv * m)),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
  };
}

/**
 * ⚰️ LES CORPS du camp — la force de `campFoe`, RÉPARTIE : Σ PV = PV du combat, Σ dégâts =
 * dégâts du combat (bornes cumulées, donc exact au point près).
 * Troupe : `size` corps pris dans le roster de la faction, dans son ordre ; dernier = chef
 * (camp) ou champion (repaire), plus lourd.
 * ⚠️ Pas de silhouette de nombre (`countMult`) : l'XP des abattus se compte PAR CORPS, une
 * horde de bêtes paierait plus qu'une bande de brigands à force égale.
 */
export function campBodies(poi: Poi, spec: CampSpec): SkirmishUnit[] {
  const foe = campFoe(poi, spec);
  const roster = factionRoster(spec.faction);
  const troop = roster.slice(0, -1);
  const lead = roster[roster.length - 1]!;
  const n = Math.max(1, Math.round(spec.size));
  const leadW = poi.type === 'lair' ? CAMP.championWeight : CAMP.chiefWeight;
  const weights = [...Array.from({ length: n }, () => 1), leadW];
  const pvCuts = cumulativeCuts(foe.pv, weights);
  const dmgCuts = cumulativeCuts(foe.damage, weights);
  return weights.map((_, i) => {
    const skin = i < n ? troop[i % troop.length]! : lead;
    const pv = Math.max(1, pvCuts[i]! - (i ? pvCuts[i - 1]! : 0));
    const damage = Math.max(1, dmgCuts[i]! - (i ? dmgCuts[i - 1]! : 0));
    return {
      id: i < n ? `camp${i}` : 'campChef',
      name: skin.name,
      emoji: skin.emoji,
      level: Math.max(1, poi.level),
      combatant: { name: skin.name, pv, damage, crit: 0.08, dodge: 0.05, initiative: 12 },
    };
  });
}
```

⚠️ Note d’exactitude : `Math.max(1, …)` peut ajouter 1 à un corps dont la part arrondit à 0 (petits camps de bas niveau) et casser « Σ = force ». Si le test « Σ PV » tombe sur ce cas, retirer le plancher (une part nulle est impossible dès que `foe.pv ≥ poids total`, garanti par `campFoe` ≥ niveau 1 — vérifier et le noter) plutôt que de relâcher le test.

Suite de `src/lib/camp.ts` :

```ts
/** 🤕 INFIRMERIE DES CAMPS : une défaite envoie à l'infirmerie TOUS les aventuriers tombés.
 *  ⚠️ ≠ `convoyHurt` (un seul blessé) : un convoi subit une embuscade en chemin, un camp est
 *  l'épreuve qu'on est venu chercher — on en connaît la taille avant de partir. Une victoire
 *  n'en blesse aucun (à terre, relevés). Le HÉROS n'est jamais blessé. */
export function campHurt(
  d: Pick<SkirmishResult, 'win' | 'down'>,
  escort: readonly { id: string }[],
): string[] {
  if (d.win) return [];
  const ids = new Set(escort.map((a) => a.id));
  return d.down.filter((id) => ids.has(id));
}

/** 💰 Le butin d'un camp pris SANS le héros — DÉRIVÉ des sources existantes, jamais une
 *  table à part : la ferraille est une part de l'ÉPAVE (qui reste la source de pointe), les
 *  pierres une part du SANCTUAIRE, les clés des bêtes celles des ARCHIVES. La FACTION décide
 *  de la devise dominante, comme au siège (`FACTION_LOOT`). Proportionnel à la taille. */
export function campGroupHaul(
  poi: Poi,
  spec: CampSpec,
  rng: () => number,
): { gold: number; scrap: number; summonStones: number; key: number } {
  const L = Math.max(1, poi.level);
  const rthH = (2 * travelOneWayMin(L, poi.distNorm)) / 60;
  const tfH = travelFactor(rthH);
  const k = Math.max(0, spec.size) / CAMP.refGroup;
  const gold = Math.round(
    goldCost('camp', L) *
      (1 + rthH * 0.1) *
      CAMP.groupGoldShare *
      k *
      (spec.faction === 'bandits' ? CAMP.banditGoldMult : 1),
  );
  const scrap = Math.round(harvestYield('wreck', L, tfH).scrap * CAMP.scrapShare * k);
  const summonStones =
    spec.faction === 'mortsvivants'
      ? Math.round(harvestYield('shrine', L, tfH).summonStones * CAMP.stoneShare * k)
      : 0;
  const key =
    spec.faction === 'betes'
      ? harvestYield('archive', L, tfH).keys
      : rng() < HARVEST.keyChance
        ? 1
        : 0;
  return { gold, scrap, summonStones, key };
}

/** Trajet ALLER d'un groupe (minutes) : héros seul → son trajet (Avant-poste compris) ;
 *  avec des aventuriers → le plus LENT des deux (un groupe ne va pas plus vite que ses
 *  marcheurs). ⚠️ Tous les paramètres sont REQUIS, comme `caravanLegMin`. */
export function partyLegMin(
  poi: Poi,
  escort: Adventurer[],
  opts: { hero: boolean; travelMult: number; comptoirLevel: number; gearSpeed: number },
): number {
  const hero = opts.hero
    ? Math.round(travelOneWayMin(poi.level, poi.distNorm) * opts.travelMult)
    : 0;
  const advs = escort.length ? caravanLegMin(poi, escort, opts.comptoirLevel, opts.gearSpeed) : 0;
  return Math.max(1, hero, advs);
}

/** ⚠️ AUCUNE taille maximale : le vivier disponible est la seule limite (les convois gardent
 *  `CARAVAN.escortMax`, leur calibration en dépend). */
export function canSendParty(poi: Poi, escortCount: number, hero: boolean): boolean {
  return CAMP_TYPES.has(poi.type) && (hero || escortCount > 0);
}

/** Les unités du groupe : aventuriers (SA paire, SES pièces) puis le héros, unité de plus. */
function partyUnits(input: PartyInput): SkirmishUnit[] {
  const units = roadUnits(input.escort, input.road);
  if (input.hero)
    units.push({
      id: HERO_UNIT_ID,
      name: input.hero.name,
      emoji: '🧝',
      level: input.hero.level,
      combatant: input.hero.combatant,
    });
  return units;
}

/** Le récit : qui abat qui, borné. */
function campJournal(d: SkirmishResult, allies: SkirmishUnit[], bodies: SkirmishUnit[]): string[] {
  const all = new Map([...allies, ...bodies].map((u) => [u.id, u]));
  const foeIds = new Set(bodies.map((b) => b.id));
  const lines = d.kills.map((k) => {
    const killer = all.get(k.killer);
    const victim = all.get(k.victim);
    const verbe = foeIds.has(k.victim) ? 'abat' : 'met à terre';
    return `${killer?.emoji ?? '⚔️'} ${killer?.name ?? '?'} ${verbe} ${victim?.emoji ?? ''} ${victim?.name ?? '?'}`.trim();
  });
  return lines.length > CAMP.journalMax
    ? [...lines.slice(0, CAMP.journalMax), `… et ${lines.length - CAMP.journalMax} de plus.`]
    : lines;
}

/**
 * ⚔️ La résolution d'une attaque de camp (seedée au DÉPART, révélée aux horodatages).
 *
 * - Combat : `simulateCombat(groupe fondu, campFoe)` ; le groupe est lu par `deriveSkirmish`.
 * - XP : socle `missionXp` + part des abattus (`skirmishXpShares`) PARTAGÉE ENTRE LES SEULS
 *   AVENTURIERS. ⚠️ Le héros n'en prend pas : son XP vient du sport, et le compter parmi les
 *   présents diluerait la part du vivier à chaque fois qu'on l'emmène — précisément ce qui
 *   rend les gros camps jouables. Ses abattus restent au total partagé ; la MARGE DE PORTAGE
 *   empêche toujours un héros de faire monter des recrues hors de leur ligue.
 * - Avec le héros : le butin ACTUEL (`campHeroOutcome`), jamais de pièce d'aventurier.
 * - Sans le héros : gagné → `campGroupHaul` + pièce(s) d'aventurier ; perdu → rien.
 * ⚠️ `gearRng` SÉPARÉ, tiré AVANT le butin de groupe : une pièce ne décale jamais la clé.
 */
export function resolveCamp(input: PartyInput): ExpeditionOutcome {
  const { poi, spec, escort, hero, seed, playerLevel } = input;
  const rng = mulberry32(seed >>> 0 || 1);
  const gearRng = mulberry32((seed ^ 0x27d4eb2f) >>> 0 || 1);
  const allies = partyUnits(input);
  const bodies = campBodies(poi, spec);
  const group = fuseUnits(allies, 'Groupe');
  const foe = campFoe(poi, spec);
  const fight = simulateCombat(group, foe, { seed: (seed + 17) >>> 0, goldOnWin: 0 });
  const d = deriveSkirmish(
    { log: fight.log, win: fight.win, allyPv: group.pv, foePv: foe.pv },
    allies,
    bodies,
    seed,
  );
  const slainBy = slainByAlly(allies, d);
  const kills: Record<string, number> = Object.fromEntries(
    escort.map((a) => [a.id, slainBy[a.id] ?? 0]),
  );
  const shares = skirmishXpShares(escort, bodies, d);
  const xp: Record<string, number> = {};
  for (const a of escort) xp[a.id] = missionXp(a, poi) + (shares[a.id] ?? 0);

  const advGear: Omit<AdvGear, 'id'>[] = [];
  if (!hero && d.win) {
    const n = poi.type === 'lair' ? CAMP.lairPieces : CAMP.campPieces;
    for (let i = 0; i < n; i++) {
      const piece = rollAdvGearDrop(gearRng, escort, {
        chance: 1,
        level: poi.level,
        luck: Math.min(0.6, spec.size / 20),
        playerLevel,
      });
      if (piece) advGear.push(piece);
    }
  }

  const party = {
    hero: !!hero,
    faction: spec.faction,
    size: spec.size,
    escort: escort.map((a) => a.id),
    win: d.win,
    foes: bodies.length,
    slain: d.foesDown.length,
    foesDown: [...d.foesDown],
    kills,
    heroKills: hero ? (slainBy[HERO_UNIT_ID] ?? 0) : 0,
    xp,
    hurt: campHurt(d, escort),
    advGear,
    wages: caravanWages(escort, poi),
    journal: campJournal(d, allies, bodies),
  };
  const tag = `${FACTION_EMOJI[spec.faction]} ${party.slain}/${party.foes} abattus.`;

  if (hero) {
    const o = campHeroOutcome(rng, poi, d.win, playerLevel);
    return { ...o, text: `${o.text} ${tag}`, party };
  }
  const haul = d.win
    ? campGroupHaul(poi, spec, rng)
    : { gold: 0, scrap: 0, summonStones: 0, key: 0 };
  return {
    win: d.win,
    gold: haul.gold,
    energy: 0,
    summonStones: haul.summonStones,
    scrap: haul.scrap,
    item: null,
    items: [],
    key: haul.key,
    reconBonus: 0,
    returnMult: 1,
    text: d.win ? `⚔️ Camp pris par ton groupe ! ${tag}` : `💀 Ton groupe a été repoussé. ${tag}`,
    party,
  };
}

/** Construit le voyage d'un groupe. ⚠️ Le coût d'or ne se paie qu'avec le HÉROS (c'est le
 *  prix d'une expédition héros, inchangé) ; l'escorte est payée en salaires à l'encaissement. */
export function startParty(input: PartyInput, now: number, legMin: number): ActiveExpedition {
  const leg = Math.max(1, Math.round(legMin)) * 60_000;
  return {
    poi: input.poi,
    sentAt: now,
    midAt: now + leg,
    returnAt: now + 2 * leg,
    goldCost: input.hero ? goldCost(input.poi.type, input.poi.level) : 0,
    seed: input.seed >>> 0 || 1,
    outcome: resolveCamp(input),
  };
}

/** 🎯 % de victoire affiché avant l'envoi — le MÊME combat fondu, rejoué sur des graines
 *  dérivées (jamais celle du vrai départ). */
export function campWinPct(
  poi: Poi,
  spec: CampSpec,
  allies: readonly SkirmishUnit[],
  samples: number,
): number {
  if (!allies.length) return 0;
  const group = fuseUnits(allies, 'Groupe');
  const foe = campFoe(poi, spec);
  const n = Math.max(1, samples);
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(group, foe, { seed: s * 131 + 5, goldOnWin: 0 }).win) w++;
  return w / n;
}
```

⚠️ Si `skirmishXpShares` exige désormais un paramètre de distance (vague parallèle), passer ce que `resolveCaravan` passe, et adapter le test « le HÉROS ne prend PAS de part » à la même signature.

- [ ] **Step 4: Run tests**

Run: `node node_modules/vitest/vitest.mjs run test/camp.test.ts test/raid.test.ts test/expedition.test.ts`
Expected: PASS, SAUF éventuellement « INFIRMERIE DES CAMPS » (garde « aucune défaite / aucune victoire ») si les constantes de départ rendent le camp trivial ou imbattable : dans ce cas, changer la GRAINE ou la taille du fixture (jamais l’assertion) et le noter ; la calibration réelle est la Task 5.
Run: `npm run typecheck` — sans erreur.

- [ ] **Step 5: Mutations** (copies de `camp.ts`, relancer `test/camp.test.ts`, restaurer)
  1. `campFoe` : `const ref = fuseUnits(refEscortUnits(poi.level), …)` → `fuseUnits(partyUnits(…))` impossible sans input : à la place `CAMP.pvTurns * m` → `CAMP.pvTurns` → « deux fois plus gros » FAIL.
  2. `campFoe` : `name: FACTION_LABEL[spec.faction]` et ajouter `* (spec.faction === 'betes' ? 1.2 : 1)` aux PV → « ISO-MENACE » FAIL.
  3. `campBodies` : `leadW = poi.type === 'lair' ? CAMP.championWeight : CAMP.chiefWeight` → `CAMP.chiefWeight` → « champion … pèse plus » FAIL.
  4. `skirmishXpShares(escort, …)` → `skirmishXpShares(allies, …)` → « le HÉROS ne prend PAS de part » FAIL.
  5. `campHurt` : `if (d.win) return [];` → supprimé ET `d.down.filter` → `d.down.slice(0, 1)` → « INFIRMERIE DES CAMPS » FAIL.
  6. `rollAdvGearDrop(gearRng,` → `rollAdvGearDrop(rng,` → « GÉNÉRATEUR SÉPARÉ » FAIL.
  7. `if (!hero && d.win)` → `if (d.win)` → « AVEC le héros … aucune pièce » FAIL (si le fixture gagne ; sinon renforcer le héros du fixture et le noter).
  8. `Math.max(1, hero, advs)` → `Math.max(1, advs)` → « héros seul » FAIL.
  9. `goldCost: input.hero ? … : 0` → `goldCost(…)` → « startParty » FAIL.

- [ ] **Step 6: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/camp.ts src/lib/raid.ts src/lib/expedition.ts test/camp.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/camp.ts src/lib/raid.ts src/lib/expedition.ts
git add src/lib/camp.ts src/lib/raid.ts src/lib/expedition.ts test/camp.test.ts
git commit -m "camp : camps de faction, groupe fondu contre ennemi absolu, corps derives, XP des abattus sans le heros, infirmerie des camps

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Calibration MESURÉE — taille des camps, héros, économie

**Files:**

- Modify: `src/lib/camp.ts` (`CAMP.pvTurns`, `CAMP.dmgPctPv`, `CAMP.groupGoldShare`, `CAMP.banditGoldMult`, `CAMP.scrapShare`, `CAMP.stoneShare` + commentaires chiffrés)
- Modify: `src/lib/expedition.ts` (`CAMP_SIZES.lair` uniquement, si la mesure l’exige)
- Create: `test/campCalibration.test.ts`
- Modify: `test/scrapEconomy.test.ts`
- Probe jetable: `test/_probe-camp.test.ts` (SUPPRIMÉE avant commit)

**Interfaces:**

- Consumes: tout `camp.ts` (Task 4), `gearedFighter` (`test/helpers/gearedFighter.ts`).
- Produces: les valeurs mesurées ; aucune signature nouvelle.
- Constantes AUTORISÉES : celles listées dans Files. INTERDITES : tout `CARAVAN.*`, `SKIRMISH.*`, `ADV_GEAR.*`, `CAMP_SIZES.camp`, `RAID.*`, `HARVEST.*`.

**Bandes cibles (à tenir sans jamais les relâcher)** — niveaux 12 / 26 / 45 / 70, pour CHAQUE taille de `CAMP_SIZES.camp ∪ CAMP_SIZES.lair`, groupe de N aventuriers de référence accompagnés et équipés :

- **B1** N = taille : victoire ∈ **[0,65 ; 0,95]**.
- **B2** N = taille − 1 (si ≥ 1) : victoire ≤ B1 − **0,12**.
- **B3** taille ≥ 5 : N = 3 → victoire < **0,10** (« nettement plus que 3 »).
- **B4** héros seul `gearedFighter(L)` contre un camp de taille 2, niveaux 26 / 45 / 70 : victoire ≥ **0,50** (le héros garde son accès aux petits camps).
- **E1** (économie) niveaux 20 / 26 / 40 / 60 / 100, distance 0,5 : ferraille d’un repaire de la plus grande taille ≤ **0,5 ×** celle d’une épave.
- **E2** or NET d’un camp de groupe (or − salaires d’un groupe de N = taille aventuriers de référence) ≤ or moyen d’une MINE de même niveau et distance (`resolveOutcome`, 40 graines, héros fort).
- **E3** `scrapEconomy.test` : avec UN camp de groupe de taille 3 par jour ajouté au débit de ferraille ET d’or, le ratio jours ferraille / jours or reste dans **[1,1 ; 2,2]** et l’épave pèse encore > **0,45** du débit.

- [ ] **Step 1: Sonde** — créer `test/_probe-camp.test.ts`

```ts
import { it } from 'vitest';
import { simulateCombat, playerCombatant } from '@/lib/combat';
import { caravanWages, refAdvGear, refAdventurer, refCompanions, roadUnits } from '@/lib/caravan';
import { fuseUnits, type SkirmishUnit } from '@/lib/skirmish';
import { CAMP, HERO_UNIT_ID, campFoe, campGroupHaul } from '@/lib/camp';
import {
  CAMP_SIZES,
  harvestYield,
  resolveOutcome,
  travelFactor,
  travelOneWayMin,
  type Poi,
} from '@/lib/expedition';
import { mulberry32 } from '@/lib/combat';
import type { Adventurer } from '@/lib/adventurers';
import { gearedFighter } from './helpers/gearedFighter';

const C = CAMP as unknown as Record<string, number>;
const S = CAMP_SIZES as unknown as { camp: number[]; lair: number[] };
const poiAt = (L: number, type: Poi['type'] = 'camp'): Poi => ({
  id: 'p',
  type,
  level: L,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
});
const team = (n: number, L: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(L, i),
    id: `a${i}`,
    familiarId: `refFam${i % 3}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
    },
  }));
const units = (n: number, L: number): SkirmishUnit[] =>
  roadUnits(team(n, L), { familiars: refCompanions(L), talents: [], advGear: refAdvGear(L, n) });
const heroUnit = (L: number): SkirmishUnit => ({
  id: HERO_UNIT_ID,
  name: 'h',
  emoji: '🧝',
  level: L,
  combatant: gearedFighter(L),
});
function win(allies: SkirmishUnit[], L: number, size: number, n = 200) {
  const g = fuseUnits(allies, 'g');
  const f = campFoe(poiAt(L), { faction: 'bandits', size });
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(g, f, { seed: s * 211 + 7, goldOnWin: 0 }).win) w++;
  return w / n;
}
const NIV = [12, 26, 45, 70];

it('phase 1 — pvTurns × dmgPctPv', { timeout: 3_600_000 }, () => {
  const sizes = [...S.camp, ...S.lair];
  for (let pv = 1.5; pv <= 4.01; pv += 0.25)
    for (let dm = 0.15; dm <= 0.4001; dm += 0.025) {
      Object.assign(C, { pvTurns: pv, dmgPctPv: dm });
      let ok = true;
      const rows: string[] = [];
      for (const L of NIV) {
        for (const s of sizes) {
          const b1 = win(units(s, L), L, s, 120);
          const b2 = s > 1 ? win(units(s - 1, L), L, s, 120) : 0;
          const b3 = s >= 5 ? win(units(3, L), L, s, 120) : 0;
          if (b1 < 0.65 || b1 > 0.95 || (s > 1 && b2 > b1 - 0.12) || (s >= 5 && b3 >= 0.1))
            ok = false;
          rows.push(`L${L} s${s} ${b1.toFixed(2)}/${b2.toFixed(2)}/${b3.toFixed(2)}`);
        }
        if (!ok) break;
      }
      if (ok) console.log(JSON.stringify({ pv, dm }), rows.join(' | '));
    }
});

it('phase 2 — héros seul et héros + groupe', { timeout: 600_000 }, () => {
  for (const L of [26, 45, 70]) {
    const line = [2, 3, 4, 5, 7, 10].map(
      (s) =>
        `s${s}: seul ${win([heroUnit(L)], L, s, 200).toFixed(2)} +3 ${win([...units(3, L), heroUnit(L)], L, s, 200).toFixed(2)}`,
    );
    console.log(`L${L}`, line.join(' · '));
  }
});

it('phase 3 — économie', () => {
  const big = Math.max(...S.lair);
  for (const L of [20, 26, 40, 60, 100]) {
    const p = poiAt(L, 'lair');
    const tfH = travelFactor((2 * travelOneWayMin(L, 0.5)) / 60);
    const wreck = harvestYield('wreck', L, tfH).scrap;
    const scrap = campGroupHaul(p, { faction: 'bandits', size: big }, mulberry32(1)).scrap;
    const hero = playerCombatant('h', { puissance: 9e4, endurance: 9e4, agilite: 9e4 }, L);
    let mine = 0;
    for (let s = 1; s <= 40; s++) mine += resolveOutcome(hero, { ...p, type: 'mine' }, s, L).gold;
    mine /= 40;
    const nets = [3, big].map(
      (s) =>
        campGroupHaul(poiAt(L), { faction: 'bandits', size: s }, mulberry32(1)).gold -
        caravanWages(team(s, L), p),
    );
    console.log(
      `L${L} ferraille ${scrap}/${wreck} (${(scrap / wreck).toFixed(2)}) orNet ${nets.map(Math.round).join('/')} mine ${Math.round(mine)}`,
    );
  }
});
```

Run: `node node_modules/vitest/vitest.mjs run test/_probe-camp.test.ts -t "phase 1"`
Expected: une ligne par couple (`pvTurns`, `dmgPctPv`) qui tient B1-B3. **Aucune ligne** → autoriser le pas de `CAMP_SIZES.lair` (essayer `[5, 6, 8]`, `[5, 7, 9]`) et relancer ; toujours rien → S’ARRÊTER et rapporter les lignes les plus proches (ne jamais relâcher une bande).

Choisir le couple de plus grande marge (distance minimale aux bornes de B1), l’écrire dans `CAMP`, puis :
Run: `node node_modules/vitest/vitest.mjs run test/_probe-camp.test.ts -t "phase 2"`
Expected: B4 (« seul » ≥ 0,50 sur s2 aux trois niveaux). ⚠️ Si B4 échoue, **S’ARRÊTER et rapporter** : décision de conception (le héros seul ne prendrait plus les petits camps), pas un réglage — ne pas tordre `pvTurns` au détriment de B1-B3.

Run: `node node_modules/vitest/vitest.mjs run test/_probe-camp.test.ts -t "phase 3"`
Expected: E1 (ratio ferraille ≤ 0,5) et E2 (`orNet` ≤ `mine` pour les deux tailles). Sinon, baisser `scrapShare` / `groupGoldShare` / `banditGoldMult` (par pas de 0,02 / 0,05 / 0,1), relancer, et recopier les chiffres finaux.

- [ ] **Step 2: Écrire les valeurs** dans `CAMP` (et `CAMP_SIZES.lair` si changé), en remplaçant les « ⚠️ MESURÉ (Task 5) » par les chiffres de la sonde (B1 aux 4 niveaux pour 2 tailles représentatives, B3, B4, E1, E2).

- [ ] **Step 3: Write the band tests** — créer `test/campCalibration.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { simulateCombat, playerCombatant, mulberry32 } from '@/lib/combat';
import { caravanWages, refAdvGear, refAdventurer, refCompanions, roadUnits } from '@/lib/caravan';
import { fuseUnits, type SkirmishUnit } from '@/lib/skirmish';
import { HERO_UNIT_ID, campFoe, campGroupHaul } from '@/lib/camp';
import {
  CAMP_SIZES,
  harvestYield,
  resolveOutcome,
  travelFactor,
  travelOneWayMin,
  type Poi,
} from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';
import { gearedFighter } from './helpers/gearedFighter';

const poiAt = (L: number, type: Poi['type'] = 'camp'): Poi => ({
  id: 'p',
  type,
  level: L,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
});
const team = (n: number, L: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(L, i),
    id: `a${i}`,
    familiarId: `refFam${i % 3}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
    },
  }));
const units = (n: number, L: number): SkirmishUnit[] =>
  roadUnits(team(n, L), { familiars: refCompanions(L), talents: [], advGear: refAdvGear(L, n) });
function win(allies: SkirmishUnit[], L: number, size: number, n = 300) {
  const g = fuseUnits(allies, 'g');
  const f = campFoe(poiAt(L), { faction: 'bandits', size });
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(g, f, { seed: s * 211 + 7, goldOnWin: 0 }).win) w++;
  return w / n;
}
const NIV = [12, 26, 45, 70];
const SIZES = [...CAMP_SIZES.camp, ...CAMP_SIZES.lair];

describe('🏕️ LA TAILLE D’UN CAMP SE LIT EN AVENTURIERS', { timeout: 120_000 }, () => {
  it('⚠️ B1 : autant d’aventuriers de référence que la taille → un camp qui se prend, sans être donné', () => {
    for (const L of NIV)
      for (const s of SIZES) {
        const t = win(units(s, L), L, s);
        expect(t, `niveau ${L}, taille ${s}`).toBeGreaterThanOrEqual(0.65);
        expect(t, `niveau ${L}, taille ${s}`).toBeLessThanOrEqual(0.95);
      }
  });
  it('⚠️ B2 : un aventurier de moins se SENT', () => {
    for (const L of NIV)
      for (const s of SIZES.filter((x) => x > 1))
        expect(win(units(s - 1, L), L, s), `niveau ${L}, taille ${s}`).toBeLessThanOrEqual(
          win(units(s, L), L, s) - 0.12,
        );
  });
  it('⚠️ B3 : un gros camp demande NETTEMENT plus que trois aventuriers', () => {
    for (const L of NIV)
      for (const s of SIZES.filter((x) => x >= 5))
        expect(win(units(3, L), L, s), `niveau ${L}, taille ${s}`).toBeLessThan(0.1);
  });
  it('B4 : le héros seul, équipé, prend encore un petit camp de son niveau', () => {
    for (const L of [26, 45, 70]) {
      const h: SkirmishUnit = {
        id: HERO_UNIT_ID,
        name: 'h',
        emoji: '🧝',
        level: L,
        combatant: gearedFighter(L),
      };
      expect(win([h], L, 2), `niveau ${L}`).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('💰 le butin d’un camp de groupe ne détrône pas les sources dédiées', () => {
  it('⚠️ E1 : même le plus gros repaire rend au plus la moitié de la ferraille d’une épave', () => {
    const big = Math.max(...CAMP_SIZES.lair);
    for (const L of [20, 26, 40, 60, 100]) {
      const tfH = travelFactor((2 * travelOneWayMin(L, 0.5)) / 60);
      const scrap = campGroupHaul(
        poiAt(L, 'lair'),
        { faction: 'bandits', size: big },
        mulberry32(1),
      ).scrap;
      expect(scrap, `niveau ${L}`).toBeLessThanOrEqual(0.5 * harvestYield('wreck', L, tfH).scrap);
    }
  });
  it('⚠️ E2 : l’or NET d’un camp de groupe reste sous celui d’une mine', () => {
    for (const L of [20, 26, 40, 60, 100]) {
      const hero = playerCombatant('h', { puissance: 9e4, endurance: 9e4, agilite: 9e4 }, L);
      let mine = 0;
      for (let s = 1; s <= 40; s++)
        mine += resolveOutcome(hero, { ...poiAt(L), type: 'mine' }, s, L).gold;
      mine /= 40;
      for (const s of [3, Math.max(...CAMP_SIZES.lair)]) {
        const net =
          campGroupHaul(poiAt(L), { faction: 'bandits', size: s }, mulberry32(1)).gold -
          caravanWages(team(s, L), poiAt(L));
        expect(net, `niveau ${L}, taille ${s}`).toBeLessThanOrEqual(mine);
      }
    }
  });
});
```

Dans `test/scrapEconomy.test.ts`, ajouter les imports `import { campGroupHaul } from '@/lib/camp'; import { travelFactor, type Poi } from '@/lib/expedition';` (fusionner `travelFactor` dans l’import existant de `@/lib/expedition`) et, dans le `describe('ferraille : plus dure à obtenir que l’or', …)`, le test :

```ts
it('⚠️ E3 : la règle tient avec UN camp de groupe par jour en plus', () => {
  // Un camp pris sans le héros rend de la ferraille ET de l'or : ajouté aux deux débits,
  // le métal doit rester plus lent que l'or, et l'épave garder la tête.
  const camp = (L: number) => {
    const p: Poi = {
      id: 'c',
      type: 'camp',
      level: L,
      x: 60,
      y: 60,
      distNorm: 0.5,
      spawnedAt: 0,
      expiresAt: 9e15,
    };
    return campGroupHaul(p, { faction: 'bandits', size: 3 }, () => 0.99);
  };
  for (const L of LEVELS) {
    const c = camp(L);
    const scrapDay = scrapPerDay(L) + c.scrap;
    const goldDay = goldPerDay(L) + c.gold;
    const ratio = cranScrap(L) / scrapDay / (cranGold(L) / goldDay);
    expect(ratio, `niveau ${L}`).toBeGreaterThan(1.1);
    expect(ratio, `niveau ${L}`).toBeLessThan(2.2);
    expect(wreckYield(L) / scrapDay, `niveau ${L}`).toBeGreaterThan(0.45);
  }
});
```

(`travelFactor` inutilisé dans ce test : ne l’importer que s’il sert ; eslint ne lint pas `test/`, mais garder l’import propre.)

- [ ] **Step 4: Supprimer la sonde et lancer la couverture**

```bash
rm test/_probe-camp.test.ts
node node_modules/vitest/vitest.mjs run test/campCalibration.test.ts test/camp.test.ts test/scrapEconomy.test.ts test/goldSink.test.ts test/caravan.test.ts
npm run typecheck
```

Expected: tout PASS (y compris E3 et `goldSink.test` inchangé).

- [ ] **Step 5: Mutations** (copies, restaurer)
  1. `CAMP.pvTurns` ×0,5 → B1 (ou B2/B3) FAIL.
  2. `CAMP.dmgPctPv` ×2 → B1 FAIL.
  3. Dans `campFoe`, `m = size / refGroup` → `m = Math.sqrt(size / refGroup)` → B3 FAIL.
  4. `CAMP.scrapShare` → 0,6 → E1 ou E3 FAIL.
  5. `CAMP.groupGoldShare` → 3 → E2 FAIL.

- [ ] **Step 6: Lint ciblé + commit** (message avec les chiffres mesurés)

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/camp.ts src/lib/expedition.ts test/campCalibration.test.ts test/scrapEconomy.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/camp.ts src/lib/expedition.ts
git add src/lib/camp.ts src/lib/expedition.ts test/campCalibration.test.ts test/scrapEconomy.test.ts
git commit -m "Camps de faction : calibration mesuree (taille en aventuriers, heros seul, butin sous l'epave et la mine)

Mesure (300 combats, niveaux 12/26/45/70) : <coller B1/B2/B3 pour 2 tailles, B4, E1, E2>.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: La carte, la boîte et le push savent ce qu’est un groupe

**Files:**

- Modify: `src/lib/caravan.ts` (`poiOffers`)
- Modify: `src/lib/expedition.ts` (`ExpeditionMessage.party?`, `buildMessage`, `keepMessages`)
- Modify: `src/lib/push.ts` (`PushKind`, `PushContext.parties`, message)
- Modify: `src/lib/camp.ts` (`partyReport`)
- Test: `test/caravan.test.ts`, `test/expedition.test.ts`, `test/push.test.ts`, `test/camp.test.ts`

**Interfaces:**

- Consumes: `CAMP_TYPES`, `PartyResult` (Tasks 2/4).
- Produces:
  - `poiOffers(poi: Poi, opts: { heroAway: boolean; comptoirLevel: number; advsAvailable: number }): { hero: boolean; caravan: boolean; party: boolean }` — `party` = camp/repaire ET (héros disponible OU ≥ 1 aventurier disponible). ⚠️ `advsAvailable` REQUIS.
  - `ExpeditionMessage.party?: PartyResult` ; `buildMessage` le recopie depuis `exp.outcome.party`.
  - `keepMessages(list: ExpeditionMessage[], cap: number): ExpeditionMessage[]` — garde TOUS les messages `claimed === false`, complète avec les plus récents jusqu’à `cap`, ordre conservé.
  - `PushContext.parties: { id: string; returnAt: number }[]` (REQUIS) ; kind `'party_home'`, `dedupe` `party:${id}`, titre `⚔️ Ton groupe est rentré`, corps `Son rapport t’attend dans la boîte 📬.`, url `/expedition-map`.
  - `camp.ts` : `interface PartyReportMember { id: string; name: string; emoji: string; xp: number; kills: number; hurt: boolean; gone: boolean }` ; `interface PartyReport { hero: boolean; factionLabel: string; factionEmoji: string; slain: number; foes: number; heroKills: number; members: PartyReportMember[]; totalXp: number; wages: number; journal: string[] }` ; `partyReport(party: PartyResult, roster: readonly Adventurer[]): PartyReport`.

- [ ] **Step 1: Write the failing tests**

`test/caravan.test.ts` — dans le `describe` qui contient « le HÉROS, lui, ne peut pas être à deux endroits » : ajouter `advsAvailable: 0` à CHAQUE appel existant de `poiOffers` (et à `gris`), puis :

```ts
it('⚔️ un CAMP s’ouvre aux groupes : le héros, ou au moins un aventurier disponible', () => {
  const camp = poi({ type: 'camp' });
  expect(poiOffers(camp, { heroAway: false, comptoirLevel: 0, advsAvailable: 0 }).party).toBe(true);
  expect(poiOffers(camp, { heroAway: true, comptoirLevel: 0, advsAvailable: 2 }).party).toBe(true);
  expect(poiOffers(camp, { heroAway: true, comptoirLevel: 9, advsAvailable: 0 }).party).toBe(false);
  expect(
    poiOffers(poi({ type: 'lair' }), { heroAway: true, comptoirLevel: 0, advsAvailable: 1 }).party,
  ).toBe(true);
  // Les convois, eux, ne vont toujours pas au combat.
  expect(poiOffers(camp, { heroAway: true, comptoirLevel: 9, advsAvailable: 5 }).caravan).toBe(
    false,
  );
  expect(
    poiOffers(poi({ type: 'well' }), { heroAway: false, comptoirLevel: 9, advsAvailable: 5 }).party,
  ).toBe(false);
});
```

`test/expedition.test.ts` (ajouter `buildMessage, keepMessages, type ExpeditionMessage` à l’import) :

```ts
describe('📬 le rapport de groupe et la boîte', () => {
  const base = (id: string, claimed?: boolean): ExpeditionMessage => ({
    id,
    level: 1,
    win: true,
    text: '',
    gold: 0,
    energy: 0,
    key: 0,
    resolvedAt: 0,
    read: false,
    ...(claimed === undefined ? {} : { claimed }),
  });
  it('⚠️ keepMessages ne jette JAMAIS un butin à récupérer', () => {
    const list = [
      base('m0', true),
      base('m1', false),
      base('m2'),
      base('m3', false),
      base('m4', true),
    ];
    const kept = keepMessages(list, 2);
    expect(kept.map((m) => m.id)).toEqual(['m0', 'm1', 'm3']);
    expect(keepMessages(list, 10)).toEqual(list);
  });
  it('buildMessage recopie ce que le groupe a vécu', () => {
    const party = {
      hero: false,
      faction: 'betes' as const,
      size: 3,
      escort: ['a'],
      win: true,
      foes: 4,
      slain: 4,
      foesDown: [],
      kills: { a: 4 },
      heroKills: 0,
      xp: { a: 30 },
      hurt: [],
      advGear: [],
      wages: 10,
      journal: ['x'],
    };
    const exp = {
      poi: {
        id: 'c',
        type: 'camp' as const,
        level: 5,
        x: 0,
        y: 0,
        distNorm: 0.2,
        spawnedAt: 0,
        expiresAt: 1,
      },
      sentAt: 1,
      midAt: 2,
      returnAt: 3,
      goldCost: 0,
      seed: 1,
      outcome: {
        win: true,
        gold: 1,
        energy: 0,
        summonStones: 0,
        scrap: 0,
        item: null,
        key: 0,
        reconBonus: 0,
        returnMult: 1,
        text: 't',
        party,
      },
    };
    const m = buildMessage(exp);
    expect(m.party).toEqual(party);
    expect(m.claimed).toBe(false);
    expect(m.claimAt).toBe(3);
  });
});
```

`test/push.test.ts` : ajouter `parties: [],` au `ctx` par défaut, puis :

```ts
it('⚔️ un GROUPE rentré notifie, avare : ni faction ni effectif', () => {
  const plans = planPushes(ctx({ parties: [{ id: 'party_x', returnAt: NOW + 2 * H }] }), NOW);
  const p = plans.find((x) => x.kind === 'party_home');
  expect(p?.dedupe).toBe('party:party_x');
  expect(p?.sendAt).toBe(NOW + 2 * H);
  for (const f of Object.values(FACTION_LABEL)) expect(`${p?.title} ${p?.body}`).not.toContain(f);
  expect(`${p?.title} ${p?.body}`).not.toMatch(/\d/);
  expect(
    planPushes(ctx({ parties: [{ id: 'old', returnAt: NOW - H }] }), NOW).some(
      (x) => x.kind === 'party_home',
    ),
  ).toBe(false);
});
```

`test/camp.test.ts` (ajouter `partyReport` à l’import de `@/lib/camp`) :

```ts
describe('📜 partyReport — ce qu’on lit dans la boîte', () => {
  it('membres, abattus, XP, blessés ; un aventurier renvoyé garde sa ligne', () => {
    const esc = team(3, 20);
    const o = resolveCamp(input({ escort: esc, road: road(20, 3), seed: 4 }));
    const r = partyReport(o.party!, esc.slice(0, 2));
    expect(r.members.map((m) => m.id)).toEqual(['adv_0', 'adv_1', 'adv_2']);
    expect(r.members[2]!.gone).toBe(true);
    expect(r.totalXp).toBe(r.members.reduce((s, m) => s + m.xp, 0));
    expect(r.members.reduce((s, m) => s + m.kills, 0) + r.heroKills).toBe(r.slain);
    for (const m of r.members) expect(m.hurt).toBe(o.party!.hurt.includes(m.id));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts test/expedition.test.ts test/push.test.ts test/camp.test.ts -t "CAMP s’ouvre|rapport de groupe|GROUPE rentré|partyReport"`
Expected: FAIL (`party` indéfini, `keepMessages is not a function`, `party_home` absent, `partyReport is not a function`).

- [ ] **Step 3: Implementation**

`src/lib/caravan.ts` — importer `CAMP_TYPES` depuis `./expedition` et remplacer `poiOffers` :

```ts
export function poiOffers(
  poi: Poi,
  opts: { heroAway: boolean; comptoirLevel: number; advsAvailable: number },
): { hero: boolean; caravan: boolean; party: boolean } {
  return {
    hero: !opts.heroAway,
    // Les convois n'exploitent que les lieux de RÉCOLTE : le héros se bat, eux ramassent.
    caravan: opts.comptoirLevel > 0 && HARVEST_TYPES.has(poi.type),
    // ⚔️ Un CAMP s'attaque en GROUPE : le héros, ou au moins un aventurier disponible.
    // ⚠️ Ni Comptoir ni créneau de convoi : ce n'est pas un convoi, et le vivier disponible
    // est la seule limite (spec étape 3).
    party: CAMP_TYPES.has(poi.type) && (!opts.heroAway || opts.advsAvailable > 0),
  };
}
```

(Garder et compléter le commentaire existant au-dessus de la fonction.)

`src/lib/expedition.ts` — dans `ExpeditionMessage`, après `waves?` : `party?: PartyResult; // ⚔️ rapport d'un groupe de camp (absent des rapports d'avant)`. Dans `buildMessage`, après la ligne `waves` : `...(o.party ? { party: o.party } : {}),`. Après `isClaimable` :

```ts
/** Taille la boîte 📬 SANS jamais jeter un butin à récupérer. ⚠️ Un `slice` brut pouvait
 *  pousser dehors un rapport non encaissé — et avec lui l'XP d'un groupe entier. On garde
 *  tout ce qui est `claimed === false`, puis les plus récents jusqu'à `cap`. */
export function keepMessages(list: ExpeditionMessage[], cap: number): ExpeditionMessage[] {
  let room = Math.max(0, cap - list.filter((m) => m.claimed === false).length);
  return list.filter((m) => {
    if (m.claimed === false) return true;
    if (room <= 0) return false;
    room--;
    return true;
  });
}
```

`src/lib/push.ts` — `type PushKind = 'siege' | 'siege_done' | 'hero_home' | 'convoy_home' | 'party_home';` ; dans `PushContext`, après `caravans` :

```ts
/** ⚔️ Groupes partis SANS le héros vers un camp (un groupe avec héros notifie par
 *  `expedition`). ⚠️ REQUIS : un groupe oublié rentrerait sans prévenir. */
parties: {
  id: string;
  returnAt: number;
}
[];
```

et à la fin de `planPushes`, avant `return out;` :

```ts
for (const g of ctx.parties) {
  add({
    kind: 'party_home',
    dedupe: `party:${g.id}`,
    sendAt: g.returnAt,
    // ⚠️ AVARE comme le convoi : ni faction, ni effectif, ni issue.
    title: '⚔️ Ton groupe est rentré',
    body: 'Son rapport t’attend dans la boîte 📬.',
    url: '/expedition-map',
  });
}
```

`src/lib/camp.ts` — ajouter `import type { PartyResult } from './expedition';` (fusionner dans l’import de types existant) et :

```ts
export interface PartyReportMember {
  id: string;
  name: string;
  emoji: string;
  xp: number;
  kills: number;
  hurt: boolean;
  /** Plus dans le vivier : sa ligne reste, l'XP a bien été versée. */
  gone: boolean;
}
export interface PartyReport {
  hero: boolean;
  factionLabel: string;
  factionEmoji: string;
  slain: number;
  foes: number;
  heroKills: number;
  members: PartyReportMember[];
  totalXp: number;
  wages: number;
  journal: string[];
}

/** 📜 Le rapport d'un groupe, lisible après coup. ⚠️ Tout vient du résultat STOCKÉ, jamais
 *  d'un recalcul (même règle que `caravanReport`). */
export function partyReport(party: PartyResult, roster: readonly Adventurer[]): PartyReport {
  const hurt = new Set(party.hurt);
  const members = party.escort.map((id): PartyReportMember => {
    const adv = roster.find((a) => a.id === id);
    return {
      id,
      name: adv?.name ?? 'Aventurier parti',
      emoji: (adv && advTitle(adv)?.emoji) || '⚔️',
      xp: Math.max(0, Math.round(party.xp[id] ?? 0)),
      kills: Math.max(0, Math.round(party.kills[id] ?? 0)),
      hurt: hurt.has(id),
      gone: !adv,
    };
  });
  return {
    hero: party.hero,
    factionLabel: FACTION_LABEL[party.faction],
    factionEmoji: FACTION_EMOJI[party.faction],
    slain: party.slain,
    foes: party.foes,
    heroKills: party.heroKills,
    members,
    totalXp: members.reduce((s, m) => s + m.xp, 0),
    wages: Math.max(0, Math.round(party.wages)),
    journal: party.journal,
  };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `node node_modules/vitest/vitest.mjs run test/caravan.test.ts test/expedition.test.ts test/push.test.ts test/camp.test.ts test/expeditionMap.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: ERREURS attendues sur les appelants (`ExpeditionMapPage.vue` ×2 pour `advsAvailable`, `AventurePage.vue` pour `parties`) : les corriger ICI a minima pour garder le dépôt compilable — `advsAvailable: freeAdvs.value.length` dans les deux appels de `ExpeditionMapPage.vue` ; `parties: []` provisoire dans `AventurePage.vue` (remplacé en Task 8, le noter). Relancer jusqu’à zéro erreur.

- [ ] **Step 5: Mutations** (copies, restaurer)
  1. `party: CAMP_TYPES.has(…) && (…)` → `party: CAMP_TYPES.has(poi.type)` → « CAMP s’ouvre » FAIL.
  2. `keepMessages` : `if (m.claimed === false) return true;` supprimé → « ne jette JAMAIS » FAIL.
  3. `buildMessage` : retirer la ligne `party` → « recopie » FAIL.
  4. `push.ts` : `body: 'Son rapport…'` → `` body: `${ctx.parties.length} aventuriers rentrés` `` → « avare » FAIL.
  5. `partyReport` : `hurt: hurt.has(id)` → `hurt: false` → « partyReport » FAIL.

- [ ] **Step 6: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/lib/caravan.ts src/lib/expedition.ts src/lib/push.ts src/lib/camp.ts src/pages/ExpeditionMapPage.vue src/pages/AventurePage.vue test/caravan.test.ts test/expedition.test.ts test/push.test.ts test/camp.test.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/caravan.ts src/lib/expedition.ts src/lib/push.ts src/lib/camp.ts src/pages/ExpeditionMapPage.vue src/pages/AventurePage.vue
git add src/lib/caravan.ts src/lib/expedition.ts src/lib/push.ts src/lib/camp.ts src/pages/ExpeditionMapPage.vue src/pages/AventurePage.vue test/caravan.test.ts test/expedition.test.ts test/push.test.ts test/camp.test.ts
git commit -m "Camps : poiOffers ouvre les camps aux groupes, rapport de groupe dans la boite, push avare, keepMessages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Le store — envoyer un groupe, le faire rentrer, encaisser son rapport (+ migration `parties`)

**Files:**

- Create: `supabase/migrations/0069_parties.sql`
- Modify: `src/stores/character.ts` (`CharacterRow`, `COLS`, `normalizeRow`, `expeSend`, `expeTick`, `expeSettle`, `expeClaim`, nouvelles actions `sendParty`, `partyTick`, computed `partyList`, retour du store)

**Interfaces:**

- Consumes: `campSpecOf`, `CAMP_TYPES`, `keepMessages`, `isClaimable`, `buildMessage`, `type ActiveExpedition` (`expedition.ts`) ; `canSendParty`, `partyLegMin`, `startParty`, `type PartyHero` (`camp.ts`) ; `advAvailable`, `grantAdvXp` (`adventurers.ts`) ; `caravanHurtMs`, `companionsOf`, `caravanFamiliarXp` (`caravan.ts`) ; `advGearRoles` (`advGear.ts`) ; `expeditionsUnlocked`, `travelTimeMult` (`buildings.ts`) ; `woundRemainingMs`, `defenseLevel` (`raid.ts`).
- Produces (store) :
  - `CharacterRow.parties: ActiveParty[] | null` avec `type ActiveParty = ActiveExpedition & { id: string }` (exporté par `camp.ts` : ajouter `export type ActiveParty = ActiveExpedition & { id: string };`)
  - `partyList: ComputedRef<ActiveParty[]>`
  - `sendParty(userId: string, poi: Poi, opts: { hero: PartyHero | null; escortIds: string[]; playerLevel: number; now: number }): Promise<boolean>`
  - `partyTick(userId: string, now: number): Promise<ExpeditionMessage[]>` (messages nouvellement déposés)
  - `expeClaim` crédite aussi `m.party` (signature inchangée).

⚠️ **Store hors harnais de tests** : aucune porte ne couvre ces lignes. Les règles vivent dans les libs testées ; ici, relire chaque garde contre la liste ci-dessous au moment de la revue.

- [ ] **Step 1: Migration** — vérifier le numéro libre : `git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -3` et `ls supabase/migrations | tail -3`. Prendre le numéro suivant le plus haut des deux (0069 si rien n’a bougé ; sinon renommer le fichier ET le commentaire du type). Créer `supabase/migrations/0069_parties.sql` :

```sql
-- 0069_parties.sql — CAMPS DE FACTION : groupes partis SANS le héros vers un camp.
-- Additive : null = aucun groupe en route (tous les comptes d'avant). Un groupe AVEC le héros
-- vit dans `expedition`, comme toute expédition héros.
alter table public.characters add column if not exists parties jsonb;
```

Appliquer la migration sur le projet Supabase par la **même méthode que la migration 0068** (Management API, projet `wzbxbntqlheelgqswzew`, jeton `.supabase-token`) ; vérifier ensuite par une requête `select column_name from information_schema.columns where table_name='characters' and column_name='parties'` qu’elle rend une ligne. ⚠️ Si le jeton n’est pas accessible depuis le worktree sans lire le dossier `muscu-planner` interdit, **S’ARRÊTER et demander au coordinateur** d’appliquer la migration (ne jamais contourner la règle).

- [ ] **Step 2: Colonne dans le store**

`CharacterRow` : `parties: ActiveParty[] | null; // groupes de camp partis sans le héros (migr. 0069)`. `COLS` : ajouter `, parties` à la fin. `normalizeRow` (après `r.adv_gear = …`) : `r.parties = arr<ActiveParty>(r.parties);`. Après `caravanList` : `const partyList = computed<ActiveParty[]>(() => row.value?.parties ?? []);`. Exposer `partyList`, `sendParty`, `partyTick` dans l’objet retourné.

- [ ] **Step 3: `expeSend` refuse les camps ; les boîtes ne jettent plus un butin**

Dans `expeSend`, juste après `if (cur.expedition) throw …` :

```ts
// ⚔️ Un camp s'attaque en GROUPE (`sendParty`) : même le héros seul y passe, pour que
// l'issue soit le combat de faction et non l'ancien gardien.
if (CAMP_TYPES.has(poi.type)) throw new Error('Un camp s’attaque en groupe.');
```

Dans `expeTick`, `expeSettle` et `grantComboChest`, remplacer `[msg, ...cur.messages].slice(0, 20)` / `.slice(0, 30)` par `keepMessages([msg, ...cur.messages], 20)` / `keepMessages([msg, ...cur.messages], 30)`.

- [ ] **Step 4: `sendParty`** (après `claimCaravan`)

```ts
/** ⚔️ Envoie un GROUPE sur un camp de faction : le héros (oui/non) et autant
 *  d'aventuriers disponibles qu'on veut. ⚠️ Refus AU STORE (l'écran ne garantit rien) :
 *  POI de camp, groupe non vide, aventuriers disponibles, et — avec le héros — pas
 *  d'expédition en cours, pas d'infirmerie, Avant-poste construit, or suffisant.
 *  ⚠️ Le POI est RETIRÉ de la carte au départ, comme pour le héros et les convois. */
async function sendParty(
  userId: string,
  poi: Poi,
  opts: { hero: PartyHero | null; escortIds: string[]; playerLevel: number; now: number },
): Promise<boolean> {
  const cur = row.value;
  const spec = campSpecOf(poi);
  if (!cur || !spec) return false;
  const { now, hero } = opts;
  const escort = opts.escortIds
    .map((id) => advList.value.find((a) => a.id === id))
    .filter((a): a is Adventurer => !!a && advAvailable(a, now));
  if (escort.length !== opts.escortIds.length) return false;
  if (!canSendParty(poi, escort.length, !!hero)) return false;
  if (hero) {
    if (cur.expedition) return false;
    if (woundRemainingMs(cur.base, now) > 0) return false;
    if (!expeditionsUnlocked(cur.buildings)) return false;
  }
  const road = {
    familiars: cur.inventory.filter((it) => it.slot === FAMILIAR_SLOT),
    talents: normalizeTalents(cur.talents),
    advGear: cur.adv_gear?.stock ?? [],
    heroFamiliarId: cur.equipped?.[FAMILIAR_SLOT]?.id ?? null,
    heroTalentIds: normalizeTalents(cur.talents)
      .filter((t) => t.equipped === true)
      .map((t) => t.id),
  };
  const seed = (now ^ (poi.level * 2654435761)) >>> 0 || 1;
  const input = { poi, spec, escort, road, hero, seed, playerLevel: opts.playerLevel };
  const leg = partyLegMin(poi, escort, {
    hero: !!hero,
    travelMult: travelTimeMult(cur.buildings),
    comptoirLevel: comptoirLevel.value,
    gearSpeed: advGearRoles(escort, road.advGear).speed,
  });
  const trip = startParty(input, now, leg);
  if (cur.gold < trip.goldCost) return false;
  const busy = new Set(opts.escortIds);
  const map = cur.expedition_map
    ? { ...cur.expedition_map, pois: cur.expedition_map.pois.filter((p) => p.id !== poi.id) }
    : cur.expedition_map;
  await persist(userId, {
    gold: cur.gold - trip.goldCost,
    expedition_map: map,
    adventurers: advList.value.map((a) =>
      busy.has(a.id) ? { ...a, busyUntil: trip.returnAt } : a,
    ),
    ...(hero
      ? { expedition: trip }
      : { parties: [...partyList.value, { ...trip, id: `party_${now.toString(36)}` }] }),
  });
  return true;
}
```

- [ ] **Step 5: `partyTick`**

```ts
/** ⚔️ Cycle de vie des groupes partis SANS le héros : le rapport à l'arrivée sur le camp,
 *  puis le groupe retiré au retour (ses aventuriers sont libérés par `busyUntil`). Le
 *  BUTIN reste à encaisser dans la boîte 📬, comme toute expédition.
 *  ⚠️ Une seule écriture, et seulement si quelque chose change. */
async function partyTick(userId: string, now: number): Promise<ExpeditionMessage[]> {
  const cur = row.value;
  if (!cur || !partyList.value.length) return [];
  let messages = cur.messages;
  const fresh: ExpeditionMessage[] = [];
  const next: ActiveParty[] = [];
  let changed = false;
  for (const p of partyList.value) {
    let q = p;
    if (now >= p.midAt && !p.reported) {
      const msg = buildMessage(p);
      if (!messages.some((m) => m.id === msg.id)) {
        messages = keepMessages([msg, ...messages], 30);
        fresh.push(msg);
      }
      q = { ...p, reported: true };
      changed = true;
    }
    if (now >= q.returnAt) {
      changed = true;
      continue; // rentré : le rapport est déjà dans la boîte
    }
    next.push(q);
  }
  if (!changed) return [];
  await persist(userId, { parties: next, messages });
  return fresh;
}
```

⚠️ Un groupe dont l’app était fermée pendant tout le voyage passe les deux conditions dans le même tick : le rapport est déposé puis le groupe retiré — voulu.

- [ ] **Step 6: `expeClaim` crédite le groupe** — dans `expeClaim`, avant le `persist`, ajouter :

```ts
// ⚔️ UN GROUPE DE CAMP : XP par aventurier, infirmerie des camps, pièces d'aventurier,
// dressage des compagnons, salaires. ⚠️ `m.party` ABSENT des rapports d'avant : rien à faire.
const party = m.party;
let advPatch: Record<string, unknown> = {};
let partyWages = 0;
let inventoryAfter = inventory;
if (party) {
  const escortAdvs = party.escort
    .map((id) => advList.value.find((a) => a.id === id))
    .filter((a): a is Adventurer => !!a);
  const hurtUntil =
    now + caravanHurtMs(escortAdvs, defenseLevel(cur.base?.defenses ?? [], 'infirmary'));
  const hurt = new Set(party.hurt);
  const advs = advList.value.map((a) => {
    const gain = party.xp[a.id];
    if (gain === undefined) return a;
    const up = grantAdvXp(a, gain, guildLevel.value);
    return hurt.has(a.id) ? { ...up, hurtUntil } : up;
  });
  const trained = new Set(
    companionsOf(escortAdvs, cur.inventory, cur.equipped?.[FAMILIAR_SLOT]?.id).map((f) => f.id),
  );
  const famGain = caravanFamiliarXp({ level: m.level } as Poi);
  if (trained.size)
    inventoryAfter = inventoryAfter.map((it) =>
      trained.has(it.id) ? grantFamiliarXp(it, famGain, Math.max(1, m.level)) : it,
    );
  partyWages = Math.max(0, Math.round(party.wages));
  advPatch = {
    adventurers: advs,
    ...(party.advGear.length ? { adv_gear: withAdvGear(cur, party.advGear) } : {}),
  };
}
```

puis dans l’objet du `persist` : `gold: Math.max(0, cur.gold + m.gold - partyWages),` (au lieu de `cur.gold + m.gold`), `inventory: inventoryAfter,`, et `...advPatch,`.

⚠️ `caravanFamiliarXp` ne lit que `poi.level` ; si sa signature a changé, lui passer ce qu’il demande. ⚠️ Le niveau joueur réel n’est pas connu de `expeClaim` : le plafond de dressage (`grantFamiliarXp`) utilise `m.level` faute de mieux — le noter dans le rapport ; si un appelant peut passer le niveau, AJOUTER un paramètre REQUIS `playerLevel` à `expeClaim` et corriger les deux appelants (`doClaim`, `doClaimMsg`) plutôt que d’approximer.

- [ ] **Step 7: Typecheck + tests**

Run: `npm run typecheck` — Expected: aucune erreur (sinon corriger les appelants désignés).
Run: `node node_modules/vitest/vitest.mjs run` — Expected: tout PASS.

- [ ] **Step 8: Relecture des gardes** (pas de test automatisé possible) — vérifier ligne à ligne et consigner dans le rapport : (a) `expeSend` refuse camp/repaire ; (b) `sendParty` refuse POI non-camp, groupe vide, aventurier indisponible, héros en expédition / blessé / sans Avant-poste, or insuffisant ; (c) aucun `escortMax` appliqué ; (d) `partyTick` n’écrit pas à vide ; (e) `expeClaim` ne crédite `party` qu’une fois (`isClaimable` + `claimed: true` dans la même écriture) ; (f) `keepMessages` partout où la boîte est taillée.

- [ ] **Step 9: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/stores/character.ts src/lib/camp.ts
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/stores/character.ts src/lib/camp.ts
git add supabase/migrations/0069_parties.sql src/stores/character.ts src/lib/camp.ts
git commit -m "Store : envoi d'un groupe sur un camp, retour, encaissement du rapport de groupe (migr. 0069 parties)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Les écrans — attaquer un camp, voir son groupe voyager, lire son rapport

**Files:**

- Create: `src/components/PartyReportView.vue`
- Modify: `src/pages/ExpeditionMapPage.vue` (panneau camp, tuiles de voyage, cycle, modale de collecte, `poiRewardLabel`, `dimmed`)
- Modify: `src/pages/AventurePage.vue` (`partyTick` dans `expeLifecycle`, `parties` dans `syncPush`, rapport dans la boîte, texte d’attente)

**Interfaces:**

- Consumes: `partyReport`, `campWinPct`, `partyLegMin`, `HERO_UNIT_ID`, `type PartyHero` (`camp.ts`) ; `campSpecOf`, `CAMP_TYPES` (`expedition.ts`) ; `roadUnits` (`caravan.ts`) ; `FACTION_LABEL`, `FACTION_EMOJI` (`raid.ts`) ; store `sendParty`, `partyTick`, `partyList`.
- Produces: `PartyReportView.vue` props `{ party: PartyResult; roster: readonly Adventurer[] }`.

⚠️ Aucune porte ne voit ces écrans (le smoke s’arrête au login). Vérifier à l’œil si possible (banc Playwright jetable, 344 / 390 px) et le noter ; sinon le dire explicitement dans le rapport.

- [ ] **Step 1: `src/components/PartyReportView.vue`**

```vue
<template>
  <!-- ⚔️ Rapport d'un groupe de camp : faction, abattus, puis le détail REPLIABLE de chacun
       et le journal. Toute la règle vit dans `partyReport`. -->
  <div class="pr">
    <div class="pr-head">
      <span class="pr-emo">{{ r.factionEmoji }}</span>
      <div class="pr-main">
        <div class="pr-title font-display">{{ r.factionLabel }}</div>
        <div class="pr-sub">
          ⚔️ {{ r.slain }}/{{ r.foes }} abattus<template v-if="r.hero">
            · 🧝 {{ r.heroKills }} par le héros</template
          >
        </div>
      </div>
      <span v-if="r.wages" class="pr-wage">🪙 −{{ r.wages }} salaires</span>
    </div>
    <q-expansion-item
      dense
      dense-toggle
      switch-toggle-side
      class="pr-exp"
      header-class="pr-exp-head"
    >
      <template #header>
        <div class="pr-exp-title">
          {{ r.members.length }} aventurier{{ r.members.length > 1 ? 's' : '' }}
          <span class="pr-exp-xp">+{{ r.totalXp }} XP</span>
        </div>
      </template>
      <ul class="pr-list">
        <li v-for="m in r.members" :key="m.id" class="pr-row" :class="{ gone: m.gone }">
          <span class="pr-m-emo">{{ m.emoji }}</span>
          <span class="pr-m-name">{{ m.name }}</span>
          <span v-if="m.hurt" class="pr-m-hurt" title="Tombé : à l'infirmerie">🤕</span>
          <span v-if="m.kills" class="pr-m-kills">⚔️ {{ m.kills }}</span>
          <span class="pr-m-xp">+{{ m.xp }} XP</span>
        </li>
      </ul>
      <ol v-if="r.journal.length" class="pr-journal">
        <li v-for="(l, i) in r.journal" :key="i">{{ l }}</li>
      </ol>
    </q-expansion-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { partyReport } from '@/lib/camp';
import type { PartyResult } from '@/lib/expedition';
import type { Adventurer } from '@/lib/adventurers';

const props = defineProps<{ party: PartyResult; roster: readonly Adventurer[] }>();
const r = computed(() => partyReport(props.party, props.roster));
</script>

<style scoped lang="scss">
.pr {
  color: var(--text);
  margin-top: 8px;
}
.pr-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pr-emo {
  font-size: 24px;
}
.pr-main {
  min-width: 0;
  flex: 1;
}
.pr-title {
  font-size: 15px;
  font-weight: 600;
}
.pr-sub,
.pr-wage {
  font-size: 12.5px;
  color: var(--dim);
}
.pr-exp {
  margin-top: 6px;
  border-top: 1px solid var(--line-soft);
}
:deep(.pr-exp-head) {
  min-height: 44px;
  padding: 0 4px;
}
.pr-exp-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
}
.pr-exp-xp {
  margin-left: auto;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.pr-list {
  list-style: none;
  margin: 0;
  padding: 0 4px;
}
.pr-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  font-size: 13px;
  &.gone {
    color: var(--dim);
  }
}
.pr-m-emo {
  width: 22px;
  text-align: center;
}
.pr-m-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pr-m-kills {
  color: var(--dim);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pr-m-xp {
  margin-left: auto;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.pr-journal {
  margin: 6px 0 4px;
  padding-left: 22px;
  font-size: 12px;
  color: var(--dim);
  max-height: 180px;
  overflow-y: auto;
}
</style>
```

(Prettier reformatera les blocs condensés ; c’est attendu.)

- [ ] **Step 2: `ExpeditionMapPage.vue` — script**

Imports : `import PartyReportView from '@/components/PartyReportView.vue';` ; depuis `@/lib/camp` : `HERO_UNIT_ID, campWinPct, partyLegMin, type PartyHero` ; ajouter `campSpecOf, CAMP_TYPES` à l’import de `@/lib/expedition` ; `roadUnits` à celui de `@/lib/caravan` ; `FACTION_EMOJI, FACTION_LABEL` à celui de `@/lib/raid`.

Remplacer `offers` et `dimmed` pour passer `advsAvailable: freeAdvs.value.length` (déjà fait en Task 6) et faire `dimmed` retourner `!o.hero && !o.caravan && !o.party`. Ajouter :

```ts
// ── ⚔️ CAMPS DE FACTION : un groupe (héros oui/non + aventuriers, SANS maximum) ──
const selectedCamp = computed(() => (selected.value ? campSpecOf(selected.value) : null));
const partyHero = ref(false);
const partyEscort = ref<string[]>([]);
watch(selected, () => {
  partyHero.value = false;
  partyEscort.value = [];
});
const partyAdvs = computed(() => freeAdvs.value.filter((a) => partyEscort.value.includes(a.id)));
/** Ce que le groupe emmène — même forme que le convoi réel (`sendParty`). */
const partyRoad = computed(() => ({
  familiars: (char.row?.inventory ?? []).filter((it: Item) => it.slot === 'familiar'),
  talents: normalizeTalents(char.row?.talents ?? []),
  advGear: char.row?.adv_gear?.stock ?? [],
  heroFamiliarId: char.row?.equipped?.familiar?.id ?? null,
  heroTalentIds: normalizeTalents(char.row?.talents ?? [])
    .filter((t) => t.equipped === true)
    .map((t) => t.id),
}));
const heroForParty = computed<PartyHero | null>(() =>
  partyHero.value
    ? { name: char.row?.pseudo ?? 'Toi', level: heroLevel.value, combatant: fighter.value }
    : null,
);
/** 🎯 % de victoire — le MÊME combat fondu que la résolution (`campWinPct`). */
const partyWin = computed(() => {
  const p = selected.value;
  const spec = selectedCamp.value;
  if (!p || !spec) return 0;
  const allies = roadUnits(partyAdvs.value, partyRoad.value);
  const h = heroForParty.value;
  if (h)
    allies.push({
      id: HERO_UNIT_ID,
      name: h.name,
      emoji: '🧝',
      level: h.level,
      combatant: h.combatant,
    });
  return Math.round(campWinPct(p, spec, allies, 40) * 100);
});
const partyMin = computed(() =>
  selected.value
    ? 2 *
      partyLegMin(selected.value, partyAdvs.value, {
        hero: partyHero.value,
        travelMult: travelMult.value,
        comptoirLevel: char.comptoirLevel,
        gearSpeed: advGearRoles(partyAdvs.value, char.row?.adv_gear?.stock ?? []).speed,
      })
    : 0,
);
const canSendPartyNow = computed(
  () =>
    !!selected.value &&
    (partyHero.value || partyEscort.value.length > 0) &&
    (!partyHero.value ||
      (!heroUnavailable.value &&
        outpostBuilt.value &&
        (char.row?.gold ?? 0) >= costOf(selected.value))) &&
    !busyCaravan.value,
);
function togglePartyAdv(id: string) {
  // ⚠️ AUCUN maximum : c'est ce qui permet d'affronter les gros camps.
  partyEscort.value = partyEscort.value.includes(id)
    ? partyEscort.value.filter((x) => x !== id)
    : [...partyEscort.value, id];
}
async function doSendParty() {
  const uid = auth.user?.id;
  const poi = selected.value;
  if (!uid || !poi || !canSendPartyNow.value) return;
  busyCaravan.value = true;
  try {
    const ok = await char.sendParty(uid, poi, {
      hero: heroForParty.value,
      escortIds: partyEscort.value,
      playerLevel: heroLevel.value,
      now: Date.now(),
    });
    if (ok) selected.value = null;
    $q.notify(
      ok
        ? { type: 'positive', message: '⚔️ Le groupe marche sur le camp.' }
        : { type: 'negative', message: 'Départ impossible (groupe, or ou héros indisponible).' },
    );
  } finally {
    busyCaravan.value = false;
  }
}
```

Dans `trips`, après la boucle des convois :

```ts
for (const g of char.partyList) {
  const at = travelPosition(g, now.value);
  if (at.phase === 'done') continue;
  const back = at.phase === 'return';
  out.push({
    key: 'g' + g.id,
    kind: 'van',
    who: '⚔️',
    poi: g.poi,
    time: fmtMs(back ? at.remainTotalMs : at.remainToObjectiveMs),
    pct: voyageProgress(g, now.value).overall * 100,
    back,
    title: `Groupe — ${POI_LABEL[g.poi.type]} niv ${g.poi.level} · ${g.outcome.party?.escort.length ?? 0} aventurier(s)`,
  });
}
```

Dans `lifecycle`, après `await char.expeSettle(uid, Date.now());` : `await char.partyTick(uid, Date.now());`.

`poiRewardLabel` : remplacer les deux dernières lignes (camp et repaire) par :

```ts
if (p.type === 'camp' || p.type === 'lair')
  return p.type === 'camp'
    ? 'Avec le héros : or + un objet 🎁 · sans : or, ferraille, pièce d’aventurier 🗡️'
    : 'Avec le héros : pièce de set 🧩 + pierres 🔮 · sans : or, ferraille, pièces d’aventurier 🗡️';
if (p.type === 'arena') return 'Survie par vagues 🌊 — objets + pierres 🔮 ∝ vagues';
return 'Pièce de set 🧩 + pierres d’invocation 🔮';
```

(en conservant la ligne `camp` supprimée ailleurs ; l’arène reste avant.)

- [ ] **Step 3: `ExpeditionMapPage.vue` — template**

Dans la feuille (`<div v-if="selected" ref="sheetEl" class="sheet">`), envelopper le bloc héros existant `<template v-if="offers.hero">…</template>` pour qu’il ne s’affiche pas sur un camp : `<template v-if="offers.hero && !selectedCamp">`. Juste après `</div>` de `sh-head`, insérer :

```vue
<!-- ⚔️ UN CAMP S'ATTAQUE EN GROUPE : le héros (oui/non) et autant d'aventuriers qu'on
             veut — aucun maximum, c'est ce qui permet d'affronter les gros repaires. La règle
             vit dans `camp.ts` ; l'écran ne fait que la montrer. -->
<template v-if="selectedCamp && offers.party">
  <div class="sh-row">
    <span class="sh-chip"
      >{{ FACTION_EMOJI[selectedCamp.faction] }} {{ FACTION_LABEL[selectedCamp.faction] }}</span
    >
    <span class="sh-chip"
      >💪 force ≈ {{ selectedCamp.size }} aventurier{{ selectedCamp.size > 1 ? 's' : '' }}</span
    >
    <span class="sh-chip">⏱️ {{ fmtMin(partyMin) }}</span>
    <span class="sh-chip">⚡ 0</span>
    <span class="sh-chip" :class="winClass(partyWin)">🎯 {{ partyWin }}%</span>
  </div>
  <button
    v-if="offers.hero"
    class="car-adv"
    :class="{ on: partyHero }"
    @click="partyHero = !partyHero"
  >
    <span class="ca-emo">🧝</span>
    <span class="ca-name">Ton héros</span>
    <span class="ca-none">butin du héros · 🪙 {{ costOf(selected) }}</span>
  </button>
  <div class="car-pick">
    <button
      v-for="a in freeAdvs"
      :key="a.id"
      class="car-adv"
      :class="{ on: partyEscort.includes(a.id) }"
      @click="togglePartyAdv(a.id)"
    >
      <span class="ca-emo">{{ advTitle(a)?.emoji ?? '🧑' }}</span>
      <span class="ca-name">{{ a.name }}</span>
      <span class="ca-rank" :style="{ color: advRank(a).color }">{{
        rankStarStr(advRank(a).star)
      }}</span>
    </button>
  </div>
  <p class="sh-away">
    Sans le héros : or, ferraille, clés, pierres et pièce d’aventurier. En cas de défaite, tous les
    aventuriers tombés partent à l’infirmerie ; le héros rentre sans butin.
  </p>
  <button class="sh-send car-send" :disabled="!canSendPartyNow" @click="doSendParty">
    ⚔️ Attaquer le camp ({{ partyEscort.length + (partyHero ? 1 : 0) }})
  </button>
</template>
```

Adapter la dernière alerte : `<div v-if="!offers.hero && !offers.caravan && !offers.party" class="sh-away">`.

Dans la modale de collecte (`coll-card`), après `<div class="coll-haul">…</div>` :

```vue
<PartyReportView v-if="lastOutcome.party" :party="lastOutcome.party" :roster="char.advList" />
```

- [ ] **Step 4: `AventurePage.vue`**

- `expeLifecycle` : après `const settled = …` et sa notification, ajouter :

```ts
const partyMsgs = await char.partyTick(uid, Date.now());
if (partyMsgs.length)
  $q.notify({ type: 'positive', message: '📬 Rapport de ton groupe — le butin t’attend.' });
```

- `syncPush` : remplacer `parties: []` (Task 6) par `parties: char.partyList.map((g) => ({ id: g.id, returnAt: g.returnAt })),`.
- Boîte 📬 : importer `PartyReportView` ; sous `<div class="im-haul">…</div>` : `<PartyReportView v-if="m.party" :party="m.party" :roster="char.advList" />`. Dans `im-wait`, remplacer « 🧭 Le héros est encore sur la route » par `🧭 {{ m.party && !m.party.hero ? 'Le groupe est' : 'Le héros est' }} encore sur la route`.

- [ ] **Step 5: Typecheck, build, smoke**

```bash
npm run typecheck
node node_modules/@quasar/app-vite/bin/quasar.js build
npm run smoke
```

Expected: sans erreur ; smoke OK.

- [ ] **Step 6: Lint ciblé + commit**

```bash
node node_modules/prettier/bin/prettier.cjs --write src/components/PartyReportView.vue src/pages/ExpeditionMapPage.vue src/pages/AventurePage.vue
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/components/PartyReportView.vue src/pages/ExpeditionMapPage.vue src/pages/AventurePage.vue
git add src/components/PartyReportView.vue src/pages/ExpeditionMapPage.vue src/pages/AventurePage.vue
git commit -m "Ecrans : attaquer un camp en groupe (heros oui/non, sans maximum), groupes en route, rapport de groupe dans la boite

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Portes, code mort, CLAUDE.md, version

**Files:**

- Modify: `CLAUDE.md` (entrée juste AU-DESSUS de la puce « ⚔️ COMBAT DE GROUPE — ÉTAPE 2 DES CAMPS »), `package.json` (`version`)

- [ ] **Step 1: Rebase et version**

```bash
git fetch origin && git rebase origin/main
node -e "console.log(require('./package.json').version)"
git show origin/main:package.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).version))"
```

Mettre `version` à `max(version locale, version d’origin/main)` + 1 en mineur (ex. `0.860.0` → `0.861.0`). Vérifier aussi que le numéro de migration de la Task 7 n’a pas été pris entre-temps sur `origin/main` ; sinon renommer le fichier, re-appliquer par la même méthode et amender le commentaire du type.

- [ ] **Step 2: Code mort**

Run: `npm run dead`
Expected: zéro ligne. Dé-exporter ce qui n’est lu que dans son module (candidats : `partyUnits` est déjà privée ; `CampSpec`, `PartyReportMember`, `ActiveParty`, `CAMP_FACTIONS` s’ils ne sont lus qu’en interne — les garder exportés s’ils sont importés par un test). Relancer jusqu’à zéro.

- [ ] **Step 3: CLAUDE.md** — insérer :

```md
- **⚔️🏕️ CAMPS DE FACTION — ÉTAPE 3 (v‹version›)**. `src/lib/camp.ts` (pur/testé). Les POI `camp` et `lair` deviennent des camps de bandits, bêtes ou morts-vivants qu’on attaque avec un GROUPE : le héros (oui/non) et autant d’aventuriers disponibles qu’on veut — **aucun maximum** (les convois gardent `escortMax`).
  - **SPEC DÉRIVÉE DE L’ID** (`campSpecOf`) : faction et taille tirées uniformément sur un générateur séparé (FNV-1a de l’id) → la carte ne tire rien de plus, un camp d’une carte sauvegardée avant a sa spec sans migration, ni la distance ni le niveau n’y entrent. Taille = force en aventuriers de référence : camp ‹tailles›, repaire ‹tailles›. Proportion camp/repaire inchangée (liste de spawn).
  - **FUSION LINÉAIRE** (`fuseUnits`, skirmish.ts) : Σ `offenseOf` et Σ `survivalOf` conservées, caractéristiques du membre le plus puissant. ⚠️ Pas `escortCombatant` : sa fusion en stats (frappes = 1 + ΣAgilité·k) est calibrée à ≤ 4 et explose à 10 ; le héros entre comme une unité de plus avec son combattant RÉEL.
  - **DANGER ABSOLU** : `campFoe` = offense du trio de référence (`refEscortUnits`, partagé avec la route) × `pvTurns` ‹v›, morsure = survie × `dmgPctPv` ‹v›, × taille/3 ; la faction ne change que noms et butin (iso-menace par construction). Corps DÉRIVÉS (`campBodies`, Σ = force du combat, chef ×2 / champion ×4).
  - **MESURÉ (300 combats)** : N = taille → ‹B1› ; un de moins → ‹B2› ; gros repaire à 3 → ‹B3› ; héros seul équipé sur un camp de 2 → ‹B4›.
  - **XP** : socle `missionXp` + part des abattus partagée entre les SEULS aventuriers (le héros n’en prend pas : son XP vient du sport, et le compter diluerait le vivier chaque fois qu’on l’emmène ; la marge de portage tient toujours).
  - **BUTIN** : avec le héros → `campHeroOutcome` (extrait bit-identique de `resolveOutcome`), coût d’or d’expédition inchangé ; sans → dérivé des sources existantes (or ∝ coût d’un camp, ferraille = part de l’épave, pierres = part du sanctuaire pour les morts-vivants, clés des archives pour les bêtes) + ‹1/2› pièce(s) d’aventurier sur `gearRng`. Salaires à l’encaissement. Mesuré : ferraille du plus gros repaire ‹E1› d’une épave, or net ‹E2› d’une mine, règle ferraille/or tenue avec un camp par jour (‹E3›).
  - **DÉFAITE** : `campHurt` = TOUS les aventuriers tombés à l’infirmerie (≠ `convoyHurt`) ; le héros rentre avec l’échec d’expédition actuel, jamais blessé.
  - **VOYAGE** : héros présent → `characters.expedition` (un seul voyage héros) ; sans → colonne `characters.parties` (migr. ‹0069›). Trajet = le plus lent (héros / convoi), zéro énergie. Rapport `ExpeditionMessage.party` dans la boîte 📬, encaissé par `expeClaim` (XP, infirmerie, pièces, dressage, salaires). `keepMessages` ne jette plus jamais un butin à récupérer. Push `party_home`, avare.
  - ‹N› mutations, toutes rouges (Task 1 ×4, Task 2 ×3, Task 3 ×3, Task 4 ×9, Task 5 ×5, Task 6 ×5).
```

Remplacer chaque `‹…›` par la valeur réelle (Task 5 et rapports de tâches).

- [ ] **Step 4: Les six portes** (lire chaque sortie)

```bash
npm run typecheck
node node_modules/prettier/bin/prettier.cjs --write CLAUDE.md package.json
node node_modules/eslint/bin/eslint.js -c ./eslint.config.js src/lib/camp.ts src/lib/skirmish.ts src/lib/caravan.ts src/lib/expedition.ts src/lib/raid.ts src/lib/push.ts src/stores/character.ts src/components/PartyReportView.vue src/pages/ExpeditionMapPage.vue src/pages/AventurePage.vue
node node_modules/vitest/vitest.mjs run
node node_modules/@quasar/app-vite/bin/quasar.js build
npm run smoke
npm run dead
```

Expected: typecheck et eslint sans erreur ; vitest tout vert (nombre de fichiers et de tests à rapporter) ; build OK ; smoke OK ; dead zéro ligne.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md package.json
git commit -m "Camps de faction : groupes sans maximum, butin selon le heros, rapport de groupe (v<version>)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

(Si `npm run dead` a imposé des dé-exports, ajouter les fichiers `src/lib/*.ts` concernés au même `git add`.)

---

## Self-review (fait à l’écriture)

- **Couverture spec étape 3** : camps de faction et rosters de `raid.ts` → Tasks 2 et 4 (`campSpecOf`, `factionRoster`, `campBodies`) ; camp = troupe + chef, repaire = troupe + champion → Task 4 ; niveau dérivé de la distance inchangé → Task 2 (spec sans toucher `spawnOne`) ; faction × taille uniformes, rng séparé → Task 2 ; taille variable, gros camps > 3 aventuriers, danger absolu mesuré → Tasks 4-5 (B1-B3) ; héros oui/non, aucun maximum, départ comme un convoi, `poiOffers` → Tasks 4, 6, 7, 8 ; moteur fondu + `deriveSkirmish`, héros fondu documenté/testé/mesuré → Tasks 1, 4, 5 (B4) ; XP partagée, héros exclu justifié → Task 4 ; butin avec/sans héros, invariants économiques → Tasks 3, 4, 5 (E1-E3) ; infirmerie des camps → Task 4 ; rapport 📬 `claimed:false` → Tasks 6-8 ; compat anciens POI / expéditions en cours → Task 2 (spec dérivée) + outcome figé au départ (aucun champ requis nouveau) ; push avare → Task 6 ; version, CLAUDE.md, portes, mutations → Task 9.
- **Noms cohérents** : `fuseUnits`, `refEscortUnits`, `CAMP_TYPES`, `CAMP_FACTIONS`, `CAMP_SIZES`, `CampSpec`, `campSpecOf`, `campHeroOutcome`, `PartyResult`, `CAMP`, `HERO_UNIT_ID`, `PartyHero`, `PartyInput`, `campFoe`, `campBodies`, `campHurt`, `campGroupHaul`, `resolveCamp`, `partyLegMin`, `canSendParty`, `startParty`, `campWinPct`, `ActiveParty`, `partyReport`/`PartyReport`, `keepMessages`, `poiOffers(...).party` + `advsAvailable`, `PushContext.parties`/`party_home`, store `sendParty`/`partyTick`/`partyList`.
- **Valeurs non connues à l’écriture** : uniquement des MESURES (constantes `CAMP`, tailles de repaire, bandes chiffrées), chacune produite par une commande du plan. Dépendances externes explicitement signalées : la vague de corrections parallèle (Step 0 de chaque tâche lourde) et l’application de la migration (Task 7, arrêt si le jeton n’est pas accessible).
