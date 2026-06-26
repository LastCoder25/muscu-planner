# Spec 09 — Paramètres + thèmes

> **Statut : proposition à valider.**

## But
Un écran **Paramètres** (distinct du **Profil/Réglages d'entraînement**) regroupant : **apparence (10 thèmes)**,
unités, envoi de retour (backlog, spec 08), à-propos (version), déconnexion.

## Données
- **Thème sélectionné** persisté en `localStorage` (`muscu:theme`) — applicable même hors-ligne, avant tout
  appel réseau. (Pas besoin de le stocker en base ; option future : `profile.preferences.theme`.)
- **`src/data/themes.ts`** : 10 thèmes. Chaque thème =
  `{ id, name, vars }` où `vars` mappe les variables CSS du design system :
  `--bg --surface --surface-2 --surface-3 --line --line-soft --text --dim --dim-2 --accent --accent-deep --accent-ink`
  + notes d'effort `--d1 --d2 --d3 --d4`.
- Le **thème par défaut = la palette actuelle** (« Voltage » : graphite + jaune). Les 10 restent **sombres,
  lisibles** (contraste suffisant), **un seul accent fort** chacun (cohérent avec le design system).

## Écran (`/settings`, sous MainLayout)
- **Apparence** : grille des 10 thèmes, chaque vignette = aperçu (pastilles `--bg`/`--surface`/`--accent`) + nom ;
  sélection → application **immédiate** + persistée. Thème actif mis en évidence.
- **Unités** : kg / lb (synchronisé avec le profil).
- **Retour** : bouton « Envoyer un retour » (spec 08).
- **À propos** : version (`__APP_VERSION__`), commit + date de build (déjà injectés).
- **Déconnexion**.

## Comportements
- **Application d'un thème** = écrire les variables CSS sur `document.documentElement`
  (`style.setProperty('--bg', …)`) via un composable/store **`useTheme`** :
  - au **boot** : lire `localStorage` et appliquer (avant rendu, pour éviter le flash) ;
  - au **changement** : appliquer + persister.
- L'**accent Quasar** (composants q-btn `color="primary"`…) est aussi recoloré au runtime via
  `setCssVar('primary', …)` / `'positive'` / `'negative'` (API Quasar) pour rester cohérent avec le thème.
- Centralisation : les couleurs en dur restantes doivent passer par les variables (sinon elles ignoreraient le thème).

## Navigation
- Accès depuis le header `MainLayout` : l'icône **⚙️** ouvre un petit menu **Profil** / **Paramètres**
  (aujourd'hui ⚙️ va direct au Profil) — ou une 2ᵉ icône dédiée. À trancher à l'implémentation.

## Done
- 10 thèmes sélectionnables, **appliqués en live** et **persistés** (survivent au reload, pas de flash au boot).
- Paramètres accessibles depuis la navigation, séparés du Profil.
- Envoi de retour fonctionnel (spec 08).
