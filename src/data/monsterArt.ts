/**
 * 🐉 LES ILLUSTRATIONS DES ENNEMIS (v0.1006 ; demandé par l'utilisateur : « vu qu'on a des
 * portraits et des items, je voudrais que les ennemis aient des illustrations aussi…
 * où on les voit en entier »).
 *
 * **Étape 1 : monstres de donjon et boss de palier**, en **CORPS ENTIER, de PROFIL, tournés
 * vers la GAUCHE** — là où se tient le héros dans le rejeu de combat (`CombatStage`).
 * Générées par Pollinations (Z-Image, API à clé) puis détourées et versionnées
 * (`scripts/fetch-monster-art.mjs`), comme les portraits de champions : jamais chargées
 * depuis un service à l'exécution.
 *
 * ⚠️ **INDEXÉE PAR NOM, PAS PAR ID.** Un monstre procédural porte un id PAR NIVEAU
 * (`proc_mon_25_weak`, `proc_mon_28_weak`…) mais un NOM tiré d'un pool de douze : c'est le
 * nom qui désigne la créature qu'on voit. Et c'est aussi ce que porte un combat rejoué
 * (`StageFight` n'a que `name`/`emoji`). Un même nom = une même créature, partout —
 * l'Archidémon du donjon et celui du boss de palier sont une seule illustration.
 *
 * ⚠️ **UNE TABLE EXPLICITE** (patron de `championPortraits`) : un test vérifie que chaque
 * fichier existe et que chaque nom désigne un vrai monstre ou boss. Un ennemi absent garde
 * son emoji — le siège et l'arène restent en emoji par décision (trop petits à l'écran).
 */
export const MONSTER_ART: Readonly<Record<string, string>> = {
  // ── Monstres écrits à la main ──
  Gluant: '/monsters/slime.webp',
  'Loup affamé': '/monsters/wolf.webp',
  'Sanglier enragé': '/monsters/boar.webp',
  'Golem de pierre': '/monsters/golem.webp',
  'Ogre brutal': '/monsters/ogre.webp',
  Spectre: '/monsters/spectre.webp',
  'Troll des cavernes': '/monsters/troll.webp',
  Dragon: '/monsters/dragon.webp',
  Titan: '/monsters/titan.webp',
  Archidémon: '/monsters/archdemon.webp',
  Chimère: '/monsters/chimere.webp',
  Hydre: '/monsters/hydre.webp',
  Béhémoth: '/monsters/behemoth.webp',
  Léviathan: '/monsters/leviathan.webp',
  Kraken: '/monsters/kraken.webp',
  'Seigneur-liche': '/monsters/liche_seigneur.webp',
  'Avatar du Chaos': '/monsters/chaos.webp',
  // ── Monstres procéduraux (pool de skins) ──
  'Oni ancestral': '/monsters/oni.webp',
  'Scorpion de brume': '/monsters/scorpion.webp',
  'Tisseur du vide': '/monsters/tisseur.webp',
  'Wyrm des abysses': '/monsters/wyrm.webp',
  'Effroi stellaire': '/monsters/effroi.webp',
  'Colosse primordial': '/monsters/colosse.webp',
  'Fléau sans nom': '/monsters/fleau.webp',
  'Drakéide du chaos': '/monsters/drakeide.webp',
  'Roi de cendres': '/monsters/roi_cendres.webp',
  'Éclipse vivante': '/monsters/eclipse.webp',
  'Fureur du firmament': '/monsters/fureur.webp',
  'Oracle dévorant': '/monsters/oracle.webp',
  // ── Boss de palier écrits à la main ──
  'Golem ancestral': '/monsters/golem_ancestral.webp',
  'Dragon primordial': '/monsters/dragon_primordial.webp',
  'Liche couronnée': '/monsters/liche_couronnee.webp',
  'Titan du Néant': '/monsters/titan_neant.webp',
  // ── Boss procéduraux ──
  'Shogun des Ombres': '/monsters/shogun.webp',
  'Souverain des Abysses': '/monsters/souverain.webp',
  'Roi-Rapace du Firmament': '/monsters/roi_rapace.webp',
  'Reine du Vide': '/monsters/reine_vide.webp',
  'Serpent-Monde': '/monsters/serpent_monde.webp',
  'Regard Primordial': '/monsters/regard.webp',
  'Tyran des Âges': '/monsters/tyran.webp',
  'Dévoreur d’Éclipses': '/monsters/devoreur.webp',
  'Champion Déchu': '/monsters/champion_dechu.webp',
  'Seigneur Écarlate': '/monsters/seigneur_ecarlate.webp',
  'Fléau Tournoyant': '/monsters/fleau_tournoyant.webp',
  'Cristal Conscient': '/monsters/cristal.webp',
  'Trident du Chaos': '/monsters/trident.webp',
  'Comète Vivante': '/monsters/comete.webp',
  'Gardien de l’Infini': '/monsters/gardien_infini.webp',
  // ── Labyrinthe (étape 2, v0.1008) — ajoutés au fil de la dotation gratuite quotidienne,
  //    palier par palier. « Golem de pierre » et « Léviathan » partagent déjà l'image des
  //    donjons (même nom = même créature).
  'Rat des galeries': '/monsters/l_rat.webp',
  'Araignée grise': '/monsters/l_araignee.webp',
  'Chauve-souris': '/monsters/l_chauve_souris.webp',
  'Serpent des ombres': '/monsters/l_serpent_ombres.webp',
  'Matriarche des galeries': '/monsters/l_matriarche.webp',
  'Loup errant': '/monsters/l_loup_errant.webp',
  'Sanglier furieux': '/monsters/l_sanglier_furieux.webp',
  'Scorpion venimeux': '/monsters/l_scorpion.webp',
  'Varan mordant': '/monsters/l_varan.webp',
  'Alpha de la meute': '/monsters/l_alpha.webp',
  Squelette: '/monsters/l_squelette.webp',
  // ── Gardiens de faille (v0.1108) — affichés par `RiftStage`. Descriptions et slugs
  //    prêts dans le script (`g_*`) ; à ajouter ICI une fois les fichiers générés (la table
  //    ne recense que ce qui existe) :
  //    'Archer déserteur (gardien)' g_archer ·
  //    'Brise-porte (gardien)' g_brise_porte · 'Mercenaire (gardien)' g_mercenaire ·
  //    'Chef de bande (gardien)' g_chef_bande · 'Loup famélique (gardien)' g_loup ·
  //    'Arachné des bois (gardien)' g_arachne · 'Sanglier enragé (gardien)' g_sanglier ·
  //    'Ours des cavernes (gardien)' g_ours · 'Scorpion géant (gardien)' g_scorpion ·
  //    'Revenant (gardien)' g_revenant · 'Spectre plaintif (gardien)' g_spectre ·
  //    'Ossuaire ambulant (gardien)' g_ossuaire · 'Nécromant (gardien)' g_necromant ·
  //    'Porte-linceul (gardien)' g_porte_linceul
  'Coupe-jarret (gardien)': '/monsters/g_coupe_jarret.webp',
};

/**
 * L'illustration d'un ennemi, ou `null` — l'appelant retombe alors sur l'emoji.
 * ⚠️ `Object.hasOwn` et non un accès direct : un nom comme « constructor » rendrait sinon
 * une FONCTION.
 */
export function monsterArt(name: string | null | undefined): string | null {
  if (!name || !Object.hasOwn(MONSTER_ART, name)) return null;
  return MONSTER_ART[name] ?? null;
}
