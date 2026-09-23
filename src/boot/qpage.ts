// qpage.ts — enregistre QPage sous son nom, parce qu'aucun template ne l'écrit en clair.
//
// ⚠️ DÉFAUT STRUCTUREL, trouvé par le smoke connecté. Les 36 pages du projet s'ouvrent par
// `<component :is="embedded ? 'div' : 'q-page'">` — la forme choisie pour le cockpit, où
// une page devient un simple `div` dans le volet de droite (une `q-page` imbriquée dans
// une autre n'a pas de sens). Mais `@quasar/app-vite` importe les composants en ANALYSANT
// LES TEMPLATES : il voit `<q-page>` écrit en clair, il ne voit pas une CHAÎNE passée à
// `:is`. QPage n'était donc importé nulle part, et Vue rendait un élément HTML inconnu.
//
// Un élément inconnu vaut `display: inline`. Conséquences mesurées : les gouttières de
// 16 px des pages ne poussaient pas leur contenu (les cartes touchaient les bords), le
// `min-height` que QPage calcule à partir de la hauteur du header n'existait pas, et
// `/program` débordait de 16 px à 344 comme à 390 px — le garde-fou mobile-first du projet
// en défaut sur un écran entier, sans que rien ne puisse le dire.
//
// ⚠️ Pourquoi ici et pas un import par page : 36 imports identiques divergent, et il aurait
// suffi qu'une page future oublie le sien pour retrouver le même silence. Une ligne, un
// endroit, et toute page qui écrira `'q-page'` sera servie.
import { QPage } from 'quasar';
import { defineBoot } from '#q-app';

export default defineBoot(({ app }) => {
  app.component('QPage', QPage);
});
