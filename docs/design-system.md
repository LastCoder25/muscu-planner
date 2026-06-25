# Design system

Direction : **panneau de contrôle d'équipement** (pas wellness mou). Référence visuelle vivante : `docs/seance-live-mockup.html` — ouvre-la, c'est la cible.

## Palette (tokens)
```
--bg        #15120E   fond graphite chaud
--surface   #211C16   cartes
--surface-2 #2C261E   cartes actives
--line      #3A332A   bordures
--text      #F3EEE6   texte principal
--dim       #9A8F7E   texte secondaire
--accent    #FFD23F   jaune voltage — action / actif (UNIQUE accent fort)
--accent-ink #1A1605  texte sur accent
```
Notes d'effort 1–4 (du vert au rouge) : `1 #7BC86C` · `2 #C6D24A` · `3 #FFB23F` · `4 #FF6A45`.
Validé (série faite) : vert sourd `#7BC86C`.

## Mapping Quasar
Dans `src/css/quasar.variables.sass` :
```sass
$primary   : #FFD23F
$secondary : #9A8F7E
$dark      : #15120E
$dark-page : #15120E
$positive  : #7BC86C
$negative  : #FF6A45
$warning   : #FFB23F
```
Mode sombre forcé (`Dark.set(true)` au boot, ou `config: { dark: true }`).

## Typographie
- **Oswald** (300–700) : chiffres, titres, timer, valeurs (charge/reps). Tabular nums.
- **Inter** (400–700) : libellés, texte UI.
Import Google Fonts dans `index.html` ou via `quasar.config` `extras`/`build`.

## Règles d'or UI
- **Mobile d'abord** : viewport ~390 px, cibles tactiles ≥ 44 px, pensé pour mains moites en salle.
- Un seul accent fort (jaune). Le reste reste graphite et discret.
- La densité s'adapte au niveau via `level_config.ui_density` (`comfortable` débutant → `dense` avancé).

## Catalogue d'interactions — écran live (à reproduire)
- **Timer de repos radial** : apparaît et prend le dessus après « Valider la série » ; anneau SVG décroissant ; boutons `+15 s` et `Passer le repos`.
- **Steppers** ±2,5 kg / ±1 rep sur la série en cours (jamais de clavier).
- **Note d'effort 1–4** dans le bloc « ressenti » (Facile/Modéré/Dur/Max), couleurs ci-dessus ; obligatoire avant validation.
- **Switch d'exo** : sheet avec onglets **Suggestions** (mêmes muscles) / **Séances passées** (rappel dernière charge + note) ; charge conservée ; trace `swapped_from`.
- **Dictée** : bouton micro sur le commentaire (Web Speech API).
- **CTA collant** « Valider la série » en bas ; devient « Passer le repos » pendant le repos.
- Pastille de note colorée sur les séries validées ; volume cumulé affiché.
