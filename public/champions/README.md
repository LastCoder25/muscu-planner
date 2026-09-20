# 🖼️ Portraits de champions

**Les 32 champions sont illustrés.** Rien à faire ici au quotidien.

## D'où viennent ces images

De [DiceBear](https://www.dicebear.com), style **`pixel-art`**, licence **CC0**
(domaine public, aucun crédit dû) — comme la base d'exercices du projet.

Elles sont **téléchargées et bundlées**, jamais chargées depuis l'API à l'exécution :
une dépendance réseau au rendu ajouterait de la latence et finirait par disparaître.

⚠️ **Le style a été choisi à l'œil**, quatre styles CC0 rendus côte à côte en grand ET
en 30 px. `pixel-art` est le seul qui dise « jeu », et le pixel art reste **lisible en
petit** — ce qui décide, puisque le Codex affiche les 32 d'un coup. (`notionists` fait
employés de bureau, `open-peeps` fait illustration de startup.)

## Ce qui est déterminé, et par quoi

|               |                                                                          |
| ------------- | ------------------------------------------------------------------------ |
| **Le visage** | la graine est l'**id du champion** — il ne change donc jamais            |
| **Le fond**   | la **couleur de sa rareté** (`RANK_COLOR`), la même que partout ailleurs |
| **Le format** | SVG — **63 Ko pour les 32**, et net à toute taille                       |

⚠️ **SVG et non WebP** : dix fois plus léger qu'un jeu de WebP 160 px, et le service
worker ne cache **rien** — chaque octet est retéléchargé à chaque visite.

## Régénérer

```
node scripts/fetch-champion-portraits.mjs
```

⚠️ Inutile après un clone : les fichiers sont versionnés. Le téléchargement est
**déterministe**, donc relancer le script redonne exactement les mêmes images.

## Ajouter un champion

Poser sa ligne dans `src/data/championPortraits.ts` **et** dans le script ci-dessus,
puis relancer. `test/championPortraits.test.ts` exige que **les 32 champions soient
illustrés** et que **chaque fichier nommé existe** : l'oublier fait rougir la suite.

## Le repli

Un champion sans portrait — ou dont le fichier ne charge pas — garde **l'avatar habillé
de sa classe et son emoji**, qui sont déjà uniques. Rien ne casse, rien ne se vide.
