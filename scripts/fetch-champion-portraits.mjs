/**
 * 🖼️ LES PORTRAITS DE CHAMPIONS — 32 illustrations d'aventuriers.
 *
 * `node scripts/fetch-champion-portraits.mjs [--force]`
 *
 * ⚠️ À NE RELANCER QUE POUR REGÉNÉRER : un clone du dépôt a déjà les fichiers. Sans
 * `--force`, un portrait déjà présent est SAUTÉ — le service limite son débit et une
 * génération complète prend une vingtaine de minutes, donc une reprise après coupure ne
 * doit pas tout refaire.
 *
 * ## D'où viennent les images
 *
 * Générées par **Pollinations.ai** (service public, sans clé), en art **cel-shadé façon
 * key visual de RPG japonais**. ⚠️ **Ce n'est PAS une banque d'images CC0** comme la base
 * d'exercices : ce sont des images générées à la demande. Elles sont **téléchargées et
 * versionnées** — le dépôt fait foi, jamais le service.
 *
 * ⚠️ **ET CE N'EST DONC PAS REPRODUCTIBLE DANS LE TEMPS.** La graine est fixée par l'id du
 * champion, mais le service peut changer de modèle : relancer ce script des mois plus tard
 * ne redonnera pas les mêmes visages. C'est exactement pourquoi les fichiers sont commités.
 * _(L'ancienne version de ce fichier promettait l'inverse — c'était faux.)_
 *
 * ## Pourquoi un sujet écrit à la main par champion
 *
 * On pourrait fabriquer le prompt depuis les champs (`lineage` + `role` + `rarity`) — et on
 * obtiendrait **32 variations molles du même archétype**, puisque six lignées et quatre
 * rôles ne font que vingt-quatre combinaisons. Or ce qui distingue Boulin Grosse-Malle de
 * Tessa la Meneuse (tous deux caravaniers porteurs) n'est dans AUCUN champ : c'est leur
 * nom. `SUBJECTS` est donc écrit, une ligne par champion, et la compilation du prompt ne
 * fait qu'y ajouter le style et le cadrage.
 *
 * ⚠️ **LE ROSTER EST LU DEPUIS `src/data/champions.ts`**, jamais recopié ici — l'ancienne
 * version embarquait sa propre liste des 32, qui aurait divergé au premier champion ajouté.
 * Node lit le TypeScript directement (type-stripping natif) ; le fichier n'a que des
 * `import type`, donc rien à résoudre.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CHAMPIONS } from '../src/data/champions.ts';
import { seedOf } from '../src/lib/combat.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/champions');
const FORCE = process.argv.includes('--force');

/**
 * ⚠️ **LE STYLE A ÉTÉ CHOISI À L'ŒIL**, six formulations rendues côte à côte sur un cas
 * facile (une archère élancée) ET des cas difficiles (un nain massif barbu, un vieillard,
 * une vieille femme — ce sont eux qui départagent, le modèle glissant vers la peinture
 * semi-réaliste et vers « un jeune homme brun » dès qu'on le laisse faire).
 *
 * Ce qui fait basculer vers l'anime, dans l'ordre : **« anime key visual » EN TÊTE** (le
 * modèle pondère le début du prompt), **« bold black outlines »**, et **« 2D »** dit
 * explicitement. Sans ces trois-là on obtient de la peinture d'heroic fantasy — jolie,
 * mais ce n'est pas ce qui a été demandé.
 */
const STYLE_AVANT =
  'anime key visual, 2D anime art style, flat cel shaded colors, bold black outlines, anime portrait of';

/**
 * ⚠️ **LE STYLE EST RÉPÉTÉ APRÈS LE SUJET, et ce n'est pas une maladresse.** Mis en tête
 * seulement, il gagne — mais le modèle ignore alors l'âge et la carrure, et rend 32 jeunes
 * hommes bruns (mesuré : Orsène « vieux moine herboriste » et Boulin « gros marchand
 * jovial » sont sortis jeunes et minces). Mis après le sujet seulement, les personnages
 * sont justes mais le rendu repart vers la peinture. Il faut donc **encadrer** : amorce de
 * style, sujet, rappel de style.
 */
const STYLE_APRES =
  'drawn in flat anime cel shading with bold black outlines, not photorealistic, ' +
  'official character art for a japanese fantasy rpg';

/**
 * ⚠️ **LE CADRAGE EST SERRÉ, ET C'EST POUR LE CODEX.** Un plan large montrerait mieux
 * l'équipement, mais le Codex affiche **les 32 d'un coup** : à cette taille, un buste
 * devient une tache et seul un visage reste identifiable. On cadre donc pour le plus petit
 * usage, pas pour le plus flatteur.
 */
const FRAMING = 'head and shoulders portrait, headroom above the head, centered, looking at viewer';

/**
 * Champion → ce qu'on voit. Le nom d'abord, la lignée ensuite : « Casse-Mur » dit un
 * marteau et une armure cabossée, là où `homme_armes` ne dit rien de personnel.
 *
 * ⚠️ **CHAQUE SUJET OUVRE SUR L'ÂGE, LE GENRE ET LA CARRURE** — « a very old wrinkled man,
 * 75 years old », « a very fat jolly middle aged man ». C'est la seule façon mesurée de les
 * obtenir : reléguées en fin de phrase, ces indications sont ignorées et tout le roster
 * rajeunit. Un vieil herboriste et une matriarche sont précisément ce qu'un générateur ne
 * produit jamais spontanément.
 *
 * ⚠️ La rareté se lit dans la RICHESSE de la description, pas dans une mention : un commun
 * a un manteau rapiécé, un primordial une aura. Écrire « legendary rarity » dans le prompt
 * ne produirait que des paillettes génériques.
 */
const SUBJECTS = {
  // ── COMMUN — des gens ordinaires, vêtements usés, pas d'aura ──
  orsene:
    'a very old wrinkled man, 75 years old, long white beard, kind tired eyes, herbalist monk in an olive green hood, sprigs of herbs at his collar, mossy green tones',
  boulin:
    'a very fat jolly middle aged man, huge round belly, double chin, big grin, merchant porter with leather straps and a flat cap, warm brown tones',
  fila: 'a young teenage girl, nimble scout, short windswept brown hair, freckles, dusty travel scarf, light leather wraps, sandy beige tones',
  teck: 'a grizzled old man, 65 years old, weathered face, one eye narrowed, brass spyglass in hand, patched lookout coat, slate grey tones',

  // ── INHABITUEL ──
  sauge:
    'an old woman, 70 years old, wrinkled kind face, silver hair in a bun, embroidered shawl, holding a steaming clay teapot, sage green tones',
  gorm: 'a huge broad shouldered man, thick neck, short brown hair, stubble, lumber hauler with a heavy timber beam across his shoulders and a rope harness, oak brown tones',
  sylve:
    'a young elf woman, pointed ears, braided auburn hair, forest archer, leaf woven cloak, short bow, dappled green light',
  vig: 'a lean young man, night ranger, half his face in shadow under a deep hood, twin crescent moon charms, indigo blue tones',

  // ── MAGIQUE ──
  anselme:
    'a middle aged monk man, tonsured head, calm scholarly face, prayer beads, open grimoire, stained glass light, violet tones',
  barthe:
    'a burly muscular man, blacksmith warrior, soot smudged face, short beard, anvil strapped to his back, flying sparks, forge orange tones',
  zephyrine:
    'a young woman, wind dancer, pale green hair, trailing ribbons, floating leaves, airy pastel tones',
  verre:
    'a thin middle aged man, cartographer mage with one glass eye, stacked monocle lenses on a headband, rolled maps, high collar, pale cyan tones',

  // ── RARE ──
  lysandre:
    'a young woman, water priestess, floating orbs of water around her, flowing blue veils, silver circlet, aqua tones',
  tessa:
    'a confident adult woman, desert caravan leader, keffiyeh headwrap, sun tanned skin, camel bells, amber and sand tones',
  roan: 'a young man, roguish road duelist, crooked smirk, windswept dark hair, worn travel coat, twin short swords, dusk tones',
  miren:
    'a young woman, silent markswoman, cloth mask over her mouth, finger raised to her lips, dark leathers, muted green tones',

  // ── ÉPIQUE — l'ornement apparaît ──
  ferrand:
    'a very old man, 80 years old, long white beard, scholarly robes, holding a candle lantern and a leather ledger, warm gold tones',
  ursk: 'a huge hulking muscular man, thick braided black beard, scarred brow, dented iron pauldrons, massive sledgehammer haft on his shoulder, iron grey tones',
  nive: 'a young woman, mountain pass scout, fur lined hood, frost on her lashes, ice axe, pale blue tones',
  kaell:
    'an adult man, cold eyed swordsman, pale scar across his cheek, frozen breath, dark fur mantle, icy white and blue tones',

  // ── LÉGENDAIRE — aura, sigils, silhouette reconnaissable ──
  ombrelune:
    'a mysterious young woman, moonlit sorceress, long white hair, silver veils, crescent moon halo, glowing lunar sigils, deep purple night',
  tarn: 'a massive adult man, fortress knight, towering layered armour, banner pauldrons, stoic weathered face, stone grey and crimson tones',
  ysolde:
    'a tall adult woman, longbow huntress, feathered mantle, sharp golden gaze, great bow drawn, forest gold tones',
  corvin:
    'a slender hooded figure, raven assassin, black beaked mask, feathered cloak, swirling mist, charcoal and ink tones',

  // ── MYTHIQUE ──
  brume:
    'a very old woman, fog seer crone, deeply wrinkled face, tattered grey wraps, glowing staff, swirling mist around her, ghostly pale tones',
  molosse:
    'a colossal armoured man, tusked boar helm, heavy chains, colossal burden on his back, warm earth tones, strong bright rim light',
  fulgur:
    'a young man, storm mage, electric white hair, crackling lightning arcs around him, torn stormcloak, violet thunder tones',
  nyx: 'a young woman, silent shadow archer, silver hair, spiderweb motifs on her cloak, black hood, pale luminous eyes, midnight tones',

  // ── PRIMORDIAL — divin, lumineux, spectaculaire ──
  aurore:
    'a radiant goddess woman, sunrise halo behind her, golden and rose light, flowing white robes, serene luminous face',
  atlas:
    'a colossal stone titan man, cracked granite skin with bright glowing golden veins, a mountain peak on his shoulders, majestic, strong luminous rim light',
  ventcourt:
    'a lithe wind spirit figure, body trailing into a whirlwind, translucent scarves, streaks of motion, teal storm tones',
  oeildumonde:
    'a divine warrior man, cosmic third eye on his forehead, starlit armour, golden aura, holding a trident, godlike presence',
};

/**
 * ⚠️ **LA GRAINE EST DÉRIVÉE DE L'ID** : elle ne change pas quand on retouche un sujet, donc
 * corriger la description d'un champion ne rebat pas les cartes des 31 autres.
 *
 * ⚠️ **LE HASH VIENT DE LA LIB** (`seedOf`, FNV-1a) au lieu d'être recopié ici : le script
 * lit déjà du TypeScript (`champions.ts`), et `combat.ts` n'a aucun import — rien
 * n'obligeait à en tenir une seconde copie. Valeurs inchangées : mêmes constantes, et le
 * `|| 1` de la lib ne peut mordre que sur un hash nul, que le modulo ramène au même point.
 */
const seedFor = (id) => seedOf(id) % 100000;

/** Le logo du service est incrusté **en bas à droite** — `nologo=true` ne le retire plus.
 *  On génère donc carré et on **coupe la bande basse**, ce qui supprime le logo et resserre
 *  le cadrage du même geste. */
const GEN = 640;
const CROP = 560;
/** ⚠️ 256 px et non 160 : la révélation d'invocation affiche un portrait à ~132 px CSS,
 *  soit ~400 px réels sur un téléphone 3×. Le service worker ne cache RIEN, donc chaque
 *  octet compte — d'où le WebP, et d'où la mesure du total à la fin du script. */
const SIZE = 256;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPortrait(prompt, seed) {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${GEN}&height=${GEN}&seed=${seed}&nologo=true&private=true`;
  // Le service répond 429 dès qu'on enchaîne : on attend de plus en plus longtemps plutôt
  // que d'abandonner, sinon une génération complète échoue toujours au milieu.
  for (let essai = 0; essai < 8; essai++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        // Une réponse d'erreur est une page de quelques centaines d'octets, pas une image.
        if (buf.length > 5000) return buf;
      }
    } catch {
      /* réseau : on retente */
    }
    await sleep(5000 + essai * 5000);
  }
  return null;
}

// ⚠️ Un champion sans sujet écrit ne doit pas produire un portrait générique en silence.
const sansSujet = CHAMPIONS.filter((c) => !SUBJECTS[c.id]).map((c) => c.id);
if (sansSujet.length) {
  console.error(`✖ champions sans description : ${sansSujet.join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

let total = 0;
let faits = 0;
for (const c of CHAMPIONS) {
  const dest = resolve(OUT, `${c.id}.webp`);
  if (!FORCE && existsSync(dest)) {
    console.log(`· ${c.id} — déjà là`);
    continue;
  }
  const prompt = `${STYLE_AVANT} ${SUBJECTS[c.id]}, ${STYLE_APRES}, ${FRAMING}, dark gradient background`;
  const brut = await fetchPortrait(prompt, seedFor(c.id));
  if (!brut) {
    console.error(`✖ ${c.id} — échec après 8 tentatives`);
    continue;
  }
  const img = await sharp(brut)
    .extract({ left: (GEN - CROP) >> 1, top: 0, width: CROP, height: CROP })
    .resize(SIZE, SIZE)
    .webp({ quality: 80 })
    .toBuffer();
  writeFileSync(dest, img);
  total += img.length;
  faits++;
  console.log(`✔ ${c.id} — ${(img.length / 1024).toFixed(1)} Ko`);
}

console.log(`\n${faits} portrait(s) écrit(s), ${(total / 1024).toFixed(0)} Ko.`);
