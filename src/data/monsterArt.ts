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
  // Les 37 suivants générés via Stable Horde (2026-09-26, Juggernaut XL).
  'Goule affamée': '/monsters/l_goule.webp',
  'Tisseuse d’os': '/monsters/l_tisseuse_os.webp',
  Revenant: '/monsters/l_revenant.webp',
  'Roi ossuaire': '/monsters/l_roi_ossuaire.webp',
  'Rampant des abysses': '/monsters/l_rampant.webp',
  Étreigneur: '/monsters/l_etreigneur.webp',
  'Essaim grouillant': '/monsters/l_essaim.webp',
  'Vase corrosive': '/monsters/l_vase.webp',
  'Étreigneur des abysses': '/monsters/l_etreigneur_abysses.webp',
  'Élémentaire de feu': '/monsters/l_elementaire_feu.webp',
  Fulgur: '/monsters/l_fulgur.webp',
  'Spectre glacial': '/monsters/l_spectre_glacial.webp',
  'Colosse du gouffre': '/monsters/l_colosse_gouffre.webp',
  Oni: '/monsters/l_oni.webp',
  Diablotin: '/monsters/l_diablotin.webp',
  'Sangsue d’ombre': '/monsters/l_sangsue.webp',
  'Liche mineure': '/monsters/l_liche_mineure.webp',
  'Seigneur oni': '/monsters/l_seigneur_oni.webp',
  'Tengu du chaos': '/monsters/l_tengu.webp',
  Wyverne: '/monsters/l_wyverne.webp',
  'Œil du chaos': '/monsters/l_oeil_chaos.webp',
  'Mère-couvée': '/monsters/l_mere_couvee.webp',
  'Wyverne ancienne': '/monsters/l_wyverne_ancienne.webp',
  'Séraphin déchu': '/monsters/l_seraphin.webp',
  'Sentinelle astrale': '/monsters/l_sentinelle.webp',
  Aberration: '/monsters/l_aberration.webp',
  'Comète vivante': '/monsters/l_comete_vivante.webp',
  'Veilleur astral': '/monsters/l_veilleur.webp',
  'Dévoreur du néant': '/monsters/l_devoreur_neant.webp',
  'Vide rampant': '/monsters/l_vide_rampant.webp',
  'Horreur informe': '/monsters/l_horreur.webp',
  'Fragment brisé': '/monsters/l_fragment.webp',
  'Gueule du néant': '/monsters/l_gueule_neant.webp',
  'Tyran déchu': '/monsters/l_tyran_dechu.webp',
  Cataclysme: '/monsters/l_cataclysme.webp',
  'Fléau final': '/monsters/l_fleau_final.webp',
  'Tyran de l’infini': '/monsters/l_tyran_infini.webp',
  // ── Gardiens de faille (v0.1108) — affichés par `RiftStage`.
  'Coupe-jarret (gardien)': '/monsters/g_coupe_jarret.webp',
  'Archer déserteur (gardien)': '/monsters/g_archer.webp',
  'Brise-porte (gardien)': '/monsters/g_brise_porte.webp',
  'Mercenaire (gardien)': '/monsters/g_mercenaire.webp',
  'Chef de bande (gardien)': '/monsters/g_chef_bande.webp',
  'Loup famélique (gardien)': '/monsters/g_loup.webp',
  'Arachné des bois (gardien)': '/monsters/g_arachne.webp',
  'Sanglier enragé (gardien)': '/monsters/g_sanglier.webp',
  'Ours des cavernes (gardien)': '/monsters/g_ours.webp',
  'Scorpion géant (gardien)': '/monsters/g_scorpion.webp',
  'Revenant (gardien)': '/monsters/g_revenant.webp',
  'Spectre plaintif (gardien)': '/monsters/g_spectre.webp',
  'Ossuaire ambulant (gardien)': '/monsters/g_ossuaire.webp',
  'Nécromant (gardien)': '/monsters/g_necromant.webp',
  'Porte-linceul (gardien)': '/monsters/g_porte_linceul.webp',
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
