/**
 * 🖼️ LES PORTRAITS DE CHAMPIONS (v0.969 ; demandé par l'utilisateur : « possible d'avoir un
 * portrait pour chaque champion unique ? à la place de l'avatar par exemple », voie
 * « 32 vraies illustrations » choisie par lui).
 *
 * ⚠️ **LA PLOMBERIE EST LÀ, LES IMAGES RESTENT À FOURNIR.** Cette table démarre VIDE : tant
 * qu'un champion n'y figure pas, son portrait retombe sur l'avatar et l'emoji d'aujourd'hui
 * — **rien ne casse, rien ne manque à l'écran**. Déposer un fichier et ajouter sa ligne
 * suffit à l'allumer, champion par champion.
 *
 * ⚠️ **UNE TABLE EXPLICITE, PAS UNE CONVENTION DE NOM.** On pourrait deviner le chemin
 * depuis l'id et laisser le navigateur échouer en silence — mais alors rien ne pourrait
 * vérifier qu'un fichier existe, et un portrait manquant se verrait en production plutôt
 * qu'au test. C'est le patron de `exerciseImages`, et son test garde-fou : **chaque fichier
 * nommé ici doit exister sur le disque**, sinon la suite rougit.
 *
 * ⚠️ **UN ROSTER À MOITIÉ ILLUSTRÉ EST ACCEPTABLE ICI, et c'est voulu** : le repli est
 * l'avatar habillé de sa classe, pas un trou. Le projet a déjà pris cette décision pour les
 * exos (« quelques exos sans correspondance propre gardent l'icône »).
 *
 * ⚠️ **LE POIDS COMPTE** : le service worker ne cache RIEN, tout est retéléchargé à chaque
 * visite, et le Codex affiche les 32 d'un coup. Viser ~16-20 Ko par portrait en **WebP
 * 160 px** (~500-640 Ko pour le roster complet) — les illustrations d'exos du projet pèsent
 * 60,8 Ko en moyenne, mais elles se chargent UNE par UNE.
 */

/** Champion id → chemin public du portrait. ⚠️ Vide au départ : voir l'en-tête. */
const CHAMPION_PORTRAITS: Record<string, string> = {
  // Exemple, à décommenter quand le fichier existe :
  // ysolde: '/champions/ysolde.webp',
};

/** Le portrait d'un champion, ou `null` s'il n'en a pas encore — l'appelant retombe alors
 *  sur l'avatar et l'emoji, qui sont déjà uniques par champion. */
export function championPortrait(championId: string | null | undefined): string | null {
  return (championId && CHAMPION_PORTRAITS[championId]) || null;
}

/** Combien de champions sont illustrés — pour que l'avancement se voie sans lire le code. */
export const portraitCount = (): number => Object.keys(CHAMPION_PORTRAITS).length;
