# Runes multicolores — refonte de l'ouverture et de l'attribution

Date : 2026-09-30. Décisions de l'utilisateur, prises en conversation. Remplace, dans
`2026-09-27-runes-competences.md`, les parties « une rune par couleur », « la rune se pose sur un
champion et tire sa compétence » et « emplacements pleins : remplacer ou perdre la rune ».
Les 18 compétences, leurs valeurs, `LEVEL_CURVE`, les emplacements (A 2 · S 3 · X 4) et les
règles de rang des couleurs ne changent pas.

## 1. Le principe

Aujourd'hui : on gagne une rune D'UNE COULEUR, on la pose sur un champion, elle tire une
compétence de sa couleur chez lui.

Désormais :

1. On gagne une **rune multicolore**, toujours la même, quelle que soit la source.
2. On l'**ouvre** (animation) : elle révèle une **compétence** tirée dans une table unique.
3. La compétence va au **stock de compétences**. On la **fusionne** ou on la **donne** à un champion
   quand on veut.
4. Une compétence donnée ne revient **jamais** au stock.

La surprise est à l'ouverture ; le choix du champion se fait en connaissant la compétence.

## 2. La rune multicolore et sa table unique

Une seule table pour toutes les runes : celle d'un lieu à ton rang, aujourd'hui `PLACE_ODDS.equal`.

| Couleur     | Chance |
| ----------- | ------ |
| 🟢 Verte    | 70 %   |
| 🔵 Bleue    | 22 %   |
| 🟣 Violette | 7 %    |
| 🟠 Dorée    | 1 %    |

Puis une compétence de cette couleur, uniformément parmi les compétences de la couleur
(la règle de `rollRuneSkill`, sans l'exclusion « déjà au maximum » : la compétence n'est plus
tirée chez un champion).

Les tables `ASCENSION_ODDS`, `AWAKEN_ODDS` et les lignes `below` / `above` / `aboveMature` de
`PLACE_ODDS` disparaissent. **La qualité ne dépend plus de la source ; seule la QUANTITÉ change.**

⚠️ Tirage déterministe : graine = compte + numéro de la rune ouverte (un compteur persisté), pour
qu'un rechargement pendant l'animation ne fasse pas retirer.

## 3. Combien de runes chaque source donne

| Source                                           | Runes     |
| ------------------------------------------------ | --------- |
| Lieu réussi sous ton rang ou à ton rang          | 1         |
| Lieu réussi au-dessus de ton rang                | 2         |
| Faille de rang supérieur refermée, mûre (≥ 50 %) | 3         |
| Ascension vers Argent, Or, Or noir               | 1         |
| Ascension vers Légendaire, Demi-dieu, Divin      | 2         |
| Ascension au-delà                                | 3         |
| Cran d'Éveil d'un champion A / S / X             | 1 / 2 / 3 |
| Scriptorium, par copie                           | 1         |

La **chance** qu'un lieu lâche des runes (`RUNE_PLACE.chance`, ×2 pour une faille) ne change pas.

**Scriptorium** : `CONTROL.runeHoursPerItem` 24 → **16** (une rune par 16 h à 3 copistes, 32 h
avec un seul). Sa qualité ne change pas : il tirait déjà dans la table `equal`.

⚠️ **À MESURER avant de figer** : le débit total de runes par jour et le rythme auquel un
champion remplit ses emplacements, contre la cible de la spec d'origine (~0,7 rune/jour pour un
joueur régulier). Le Scriptorium tenu en continu dépasse à lui seul cette cible ; les chiffres
de ce tableau sont une première proposition. Les étalons de combat (`referenceRuneBuild`,
`REF_POWER`, `RIFT_RELIEF`, `SMALL_FORCE_RELIEF`) supposent un build médian : vérifier qu'il reste
réaliste.

## 4. Le stock

```ts
interface RuneState {
  runes: number; // runes multicolores non ouvertes
  skills: StockSkill[]; // compétences ouvertes, chacune à part
  opened: number; // compteur des ouvertures (graine du tirage)
  comp: number; // version des migrations versées
}
interface StockSkill {
  uid: string;
  id: SkillId;
  level: number;
}
```

- Deux exemplaires de la même compétence restent **séparés** : rien ne se fusionne tout seul.
- `pending` (la rune « remplacer ou garder ») disparaît : il n'y a plus de tirage chez un champion.

## 5. Fusion

On choisit deux exemplaires **de la même compétence** au stock : ils deviennent un seul exemplaire
dont le niveau est la **somme**, plafonnée à 5.

- Niveau 1 + niveau 1 → niveau 2 ; niveau 2 + niveau 1 → niveau 3.
- Une fusion qui dépasserait 5 est **refusée**, et l'écran le dit : on ne perd jamais un niveau sans
  le savoir.

Règle unique, lisible partout : **un niveau de compétence vaut toujours une rune.**

## 6. Donner une compétence à un champion

Depuis le stock, on choisit une compétence puis un champion. Trois issues :

| Cas                                          | Effet                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Il ne l'a pas, une place est libre           | Elle entre à son niveau.                                                              |
| Il l'a déjà                                  | Les niveaux **s'additionnent**. Refusé si ça dépasse 5.                               |
| Il ne l'a pas, toutes ses places sont prises | Le joueur choisit une compétence à **remplacer** : elle est perdue, avec ses niveaux. |

Toujours vrai :

- **Règles de rang** inchangées (`canUseRune`) : violette pour un champion Argent ou plus, dorée pour
  Or ou plus. On peut ouvrir une dorée à tout moment, on ne la donne qu'à qui peut la porter.
- Une compétence donnée **ne revient jamais** au stock. Il n'y a pas de bouton « retirer ».
- Le remplacement demande une confirmation qui dit ce qui est perdu (« Critique niveau 3 »).
- Tous les refus vivent dans UNE fonction de la lib (`giveSkillBlocker`), lue par l'écran ET le
  store — l'écran grise avec la raison, le store refuse.

## 7. La tuile Runes du Panthéon

Une tuile **🪬 Runes** à côté de Champions et Équipement, avec une pastille « N à ouvrir ».

**Runes à ouvrir** : le nombre en stock, « Ouvrir » (une), « Ouvrir ×10 » (voir § 8).

**Compétences** : rangées par couleur puis par nom, avec leur niveau. Toucher une compétence :

- **Donner à un champion** : la liste des champions, chacun avec une pastille qui dit ce qui se
  passera — 🟢 « Nouvelle », ⬆️ « Niv 2 → 3 », 🔁 « Remplacer », ou grisé avec la raison
  (rang trop bas, niveau 5 dépassé). Tri : améliorations, places libres, remplacements, grisés.
- **Fusionner** avec un autre exemplaire de la même compétence (seuls les exemplaires compatibles
  sont proposés).

La fiche d'un champion montre ses compétences, sans bouton de retrait.

## 8. Les animations

**À l'unité** : un mur de pierre gravé, sombre, dans le langage du sanctuaire d'invocation. On pose
la rune dans une alcôve, les glyphes du mur s'allument un à un, la couleur tirée envahit le mur,
la compétence se révèle (glyphe, nom en machine à écrire, couleur, niveau 1).

- **Présage honnête**, comme l'invocation : rien sur une verte, une lueur sur une violette ou une
  dorée, un suspense plus long pour les couleurs rares. Une verte ne fait jamais semblant d'être
  rare.
- « Passer » dès le début ; `prefers-reduced-motion` → état final direct.
- **Règle fondatrice** : le store a DÉJÀ tiré et crédité avant l'animation. L'écran ne fait que la
  mise en scène.

**Le lot ×10** : **9 runes pour 10 compétences**. Dix runes se posent sur le mur, les vertes et
bleues se révèlent en cascade, on touche les violettes et dorées pour les ouvrir en grand, une à
une (le patron des cartes A et S du ×10). « Tout révéler » pour abréger. Le bouton ne s'affiche
qu'à partir de 9 runes en stock et porte son prix.

⚠️ Le lot donne +11 % de compétences : à mesurer avec le débit (§ 3).

## 9. Migration (une fois, `comp` = version)

1. Toutes les compétences de tous les champions sont **retirées**.
2. Chaque **niveau** de compétence retirée rend des runes multicolores selon sa couleur :

   | Couleur     | Runes par niveau |
   | ----------- | ---------------- |
   | 🟢 Verte    | 1                |
   | 🔵 Bleue    | 2                |
   | 🟣 Violette | 3                |
   | 🟠 Dorée    | 5                |

3. Les runes colorées encore au stock suivent le **même barème**, comme une compétence niveau 1 de
   leur couleur. Une rune `pending` compte pour sa couleur.
4. Idempotent, marqué par la version ; faite au chargement (`normalizeRow`) et persistée dans la même
   écriture que les champions, comme les autres régularisations (`settleLegacy`). Un éclat annonce
   le nombre de runes rendues.

Avant d'appliquer : relevé du nombre de runes que ce barème rend sur les comptes réels, soumis à
l'utilisateur.

## 10. Ce qui ne change pas

- Les 18 compétences, leurs valeurs, la courbe de niveau, leurs effets en combat et sur les convois
  (`runeCombatEffects`, `roleShare`).
- Les emplacements par lettre.
- Les règles de rang des couleurs.

## 11. Découpage proposé

1. **Lib** : table unique, `openRune`, quantités par source, stock de compétences, fusion,
   `giveSkillBlocker` / `giveSkill`, migration. Tests et mutations.
2. **Sources** : branchement des quantités (lieux, ascension, Éveil, Scriptorium 16 h).
3. **Mesure** : débit de runes par jour, rythme de remplissage, effet du lot ×10, étalons de combat.
4. **Migration** : relevé sur les comptes réels, validation, application.
5. **Écrans** : tuile Runes, écran « donner », fusion, fiche champion sans retrait.
6. **Animations** : unité puis ×10, vérifiées au banc à 344 / 390 / 600 px.
