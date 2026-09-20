# 🖼️ Portraits de champions

**Les 32 champions sont illustrés.** Rien à faire ici au quotidien.

## D'où viennent ces images

Générées par [Pollinations.ai](https://pollinations.ai) (service public, sans clé), en art
**cel-shadé façon key visual de RPG japonais**, puis **téléchargées et versionnées**. Le
dépôt fait foi, jamais le service : aucune image n'est chargée en ligne à l'exécution.

⚠️ **Ce ne sont donc pas des images CC0** comme la base d'exercices — ce sont des images
générées à la demande, pour un projet personnel.

⚠️ **La régénération n'est pas reproductible dans le temps.** La graine est l'id du
champion, mais le service peut changer de modèle : relancer dans six mois ne redonnera pas
les mêmes visages. C'est précisément pour ça que les fichiers sont commités.

## Ce qui a été refusé, et pourquoi

La première version livrait des avatars **DiceBear `pixel-art`** : déterministes, CC0,
légers — et refusés, à raison. Un avatar de profil dit « un utilisateur », pas « un
aventurier » : ni âge, ni arme, ni histoire, et les 32 ne se distinguaient que par une
coiffure. Dans un gacha, **c'est la collection qui est le jeu**.

## Ce qui est déterminé, et par quoi

|                   |                                                                             |
| ----------------- | --------------------------------------------------------------------------- |
| **Le personnage** | une description **écrite à la main**, une par champion, dans le script      |
| **Le style**      | commun aux 32 — anime, aplats, contours nets, fond sombre                   |
| **Le cadrage**    | serré sur le visage : le Codex affiche **les 32 d'un coup**, à ~30 px pièce |
| **Le format**     | WebP 256 px — **~6 Ko pièce, ~200 Ko les 32**                               |

⚠️ **Le fond est sombre et dégradé** : c'est ce qui rend ces fichiers si légers, et ça
s'accorde au thème du jeu.

## Régénérer

```
node scripts/fetch-champion-portraits.mjs           # ne refait que ce qui manque
node scripts/fetch-champion-portraits.mjs --force   # tout refaire (~20 min)
```

⚠️ Inutile après un clone : les fichiers sont versionnés. Le service limite son débit — le
script attend et retente plutôt que d'abandonner en chemin.

## Ajouter un champion

Poser sa description dans `SUBJECTS` (script), puis sa ligne dans
`src/data/championPortraits.ts`, puis relancer. Le roster, lui, est **lu directement**
depuis `src/data/champions.ts` : il n'y a pas de liste à tenir à jour en double.

`test/championPortraits.test.ts` exige que **les 32 soient illustrés**, que **chaque fichier
existe**, que **deux champions ne partagent jamais la même image** et que le **poids reste
tenable** : l'oublier fait rougir la suite.

## Le repli

Un champion sans portrait — ou dont le fichier ne charge pas — garde **l'avatar habillé de
sa classe et son emoji**, qui sont déjà uniques. Rien ne casse, rien ne se vide.
