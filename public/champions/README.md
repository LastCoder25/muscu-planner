# 🖼️ Portraits de champions

Déposer ici **un fichier par champion**, puis ajouter sa ligne dans
`src/data/championPortraits.ts` :

```ts
const CHAMPION_PORTRAITS: Record<string, string> = {
  ysolde: '/champions/ysolde.webp',
};
```

Les ids sont ceux de `src/data/champions.ts` (32 champions, 4 par rareté).

## Format attendu

|            |                                                     |
| ---------- | --------------------------------------------------- |
| **Format** | WebP (JPEG accepté)                                 |
| **Taille** | 160 × 160 px minimum — un carré, recadré en `cover` |
| **Poids**  | ~16-20 Ko par portrait                              |

⚠️ **Le poids compte** : le service worker ne cache **rien**, tout est retéléchargé à
chaque visite, et le Codex affiche les 32 portraits d'un coup (~500-640 Ko à ce format).
Les illustrations d'exercices du projet pèsent 60,8 Ko en moyenne, mais elles se
chargent **une par une** — pas ici.

## Ce qui se passe sans fichier

Rien ne casse : un champion absent de la table garde **l'avatar habillé de sa classe et
son emoji**, qui sont déjà uniques par champion. Le roster peut donc s'illustrer
champion par champion.

## Garde-fou

`test/championPortraits.test.ts` vérifie que **chaque fichier nommé dans la table existe
sur le disque** et que chaque id désigne un vrai champion. Une ligne ajoutée sans son
fichier fait rougir la suite.
