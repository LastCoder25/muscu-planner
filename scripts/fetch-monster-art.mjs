/**
 * 🐉 LES ILLUSTRATIONS D'ENNEMIS — monstres de donjon et boss de palier, en pied, de profil.
 *
 * `node scripts/fetch-monster-art.mjs [--force] [--only=slug,slug] [--rekey]`
 *
 * ⚠️ À NE RELANCER QUE POUR REGÉNÉRER : un clone du dépôt a déjà les fichiers. Sans
 * `--force`, une image déjà présente est SAUTÉE. `--rekey` refait le détourage depuis les
 * bruts conservés dans `.monster-raw/` (hors dépôt), sans rien régénérer ni payer.
 *
 * Même famille que les portraits de champions (Pollinations, cel-shadé façon RPG japonais)
 * mais via l'API À CLÉ et le modèle Z-Image — cf. plus bas, le modèle public ne sait plus
 * dessiner de créatures. ⚠️ Images GÉNÉRÉES, non reproductibles : le dépôt fait foi.
 *
 * ## Ce qui change par rapport aux portraits
 *
 * - **CORPS ENTIER, DE PROFIL, TOURNÉ VERS LA GAUCHE** : dans le rejeu (`CombatStage`) le
 *   héros est à gauche, le monstre à droite ; il doit lui faire face. Le modèle n'obéit pas
 *   toujours à l'orientation — `FLIP` retourne après coup ceux qui regardent à droite
 *   (vérifié à l'œil sur la planche).
 * - **DÉTOURÉ** : le monstre se pose sur la scène du combat, un carré de fond sombre y
 *   ferait une vignette collée. On génère sur **fond blanc uni** et on le retire PAR
 *   REMPLISSAGE DEPUIS LES BORDS (cf. `keyOut`). ⚠️ Un premier essai sur magenta a échoué :
 *   le modèle public ignorait la couleur demandée.
 * - **CALÉ EN BAS** : on rogne le transparent puis on pose le monstre au bas d'un carré de
 *   320 px — tous posent les pieds sur la même ligne, quelle que soit leur taille.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MONSTER_ART } from '../src/data/monsterArt.ts';
import { seedOf } from '../src/lib/combat.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/monsters');
const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '')
  .slice(7)
  .split(',')
  .filter(Boolean);

const STYLE_AVANT =
  'anime key visual, 2D anime art style, flat cel shaded colors, bold black outlines, full body side view profile of';
const STYLE_APRES =
  'drawn in flat anime cel shading with bold black outlines, not photorealistic, official monster art for a japanese fantasy rpg';
const FRAMING =
  'facing left, whole creature visible from head to tail, ' +
  'isolated on a plain flat pure white background, no ground, no scenery, no text';

/** Slug (nom du fichier) → ce qu'on voit. Écrit à la main : le nom seul ne dit ni la
 *  taille, ni la matière, ni la couleur, et le modèle comble sinon par du générique. */
const SUBJECTS = {
  slime: 'a round translucent green slime blob monster with two cute small eyes, glossy jelly',
  wolf: 'a starving grey wolf, bony ribs showing, bared fangs, crouched ready to pounce',
  boar: 'an enraged wild boar with huge curved tusks, bristling brown fur, steaming breath',
  golem: 'a hulking stone golem made of grey boulders, mossy cracks, glowing blue eyes',
  ogre: 'a brutal fat green-grey ogre with a huge spiked wooden club, loincloth, underbite tusks',
  spectre: 'a floating pale blue ghost spectre in tattered shroud, hollow glowing eyes, wispy tail',
  troll: 'a tall hunched cave troll, long arms, warty grey-green skin, stone club',
  dragon: 'a huge red dragon standing on four legs, wings folded, horns, long spiked tail',
  titan:
    'a colossal titan of molten rock and lava, cracked black stone skin with glowing orange veins',
  archdemon:
    'a towering archdemon with curved black horns, burning red skin, black armor, flaming greatsword, bat wings',
  chimere: 'a chimera with a lion body and head, a goat head on its back and a snake for a tail',
  hydre: 'a many-headed green hydra serpent, five snake heads on long necks, scaled body',
  behemoth: 'a gigantic armored behemoth beast, rhinoceros-like horns, thick grey plated hide',
  leviathan:
    'a gigantic sea serpent leviathan, dark blue scales, fins and jagged teeth, coiled body',
  kraken: 'a giant purple kraken squid, many tentacles curling, big menacing eye',
  liche_seigneur:
    'a lich lord skeleton sorcerer in dark royal robes, glowing green eyes, bone staff',
  chaos:
    'an avatar of chaos, a floating dark humanoid with a giant single eye as head, swirling purple void energy',
  oni: 'an ancient oni demon, red skin, two horns, tiger skin loincloth, iron kanabo club',
  scorpion: 'a giant scorpion made of pale mist and chitin, raised stinger tail, pincers',
  tisseur:
    'a giant void spider weaver, black and violet body, starry markings, glowing web threads',
  wyrm: 'an abyssal wyrm, long wingless deep sea dragon, bioluminescent teal markings',
  effroi:
    'a stellar horror, a tall thin alien creature with a starfield body and long clawed fingers',
  colosse: 'a primordial colossus dinosaur, massive tyrannosaurus with stone-like armored hide',
  fleau: 'a nameless plague undead abomination, stitched rotting flesh, hunched, sickly green glow',
  drakeide: 'a chaos drakeid, humanoid dragon warrior with black scales, red wings, jagged sword',
  roi_cendres: 'a king of ashes, a skeletal king in a burning crown, smoldering ember cloak',
  eclipse: 'a living eclipse, a shadow beast with a black sun for a head ringed by a fiery corona',
  fureur: 'a fury of the sky, a lightning elemental giant made of storm clouds and crackling bolts',
  oracle:
    'a devouring oracle, a floating hooded seer with a gaping fanged mouth in its chest, crystal orbs',
  golem_ancestral:
    'an ancestral giant golem of ancient carved stone covered in glowing golden runes, massive',
  dragon_primordial:
    'a primordial elder dragon, enormous, ancient bronze scales, spread wings, glowing eyes',
  liche_couronnee:
    'a crowned lich king, skeleton wearing a jeweled crown and ornate purple mantle, green soulfire',
  titan_neant:
    'a titan of the void, a colossal cosmic giant made of black space and stars, glowing violet eyes',
  shogun:
    'a shogun of shadows, demonic samurai warlord in black lacquered armor with a red oni mask, katana',
  souverain: 'a sovereign of the abyss, octopus-headed sea king in coral armor holding a trident',
  roi_rapace:
    'a raptor king of the firmament, giant golden eagle warrior with a crown and huge wings',
  reine_vide: 'a void queen, giant spider queen with a humanoid torso, black crown, violet glow',
  serpent_monde: 'a world serpent, colossal emerald snake coiled with mountains on its back',
  regard: 'a primordial gaze, a floating giant eyeball beast with tentacle stalks and golden aura',
  tyran: 'a tyrant of the ages, huge armored tyrannosaurus king with bone crown and scars',
  devoreur: 'a devourer of eclipses, a black wolf-like cosmic beast swallowing a sun, fiery mane',
  champion_dechu:
    'a fallen champion, dark knight in cracked corrupted golden armor, broken halo, greatsword',
  seigneur_ecarlate: 'a scarlet lord, vampire warlord in crimson plate armor with a blood red cape',
  fleau_tournoyant: 'a whirling scourge, a tornado elemental with blades spinning inside the wind',
  cristal: 'a conscious crystal, a giant floating cyan crystal golem with a glowing core face',
  trident: 'a chaos trident warlord, three-armed sea demon holding a black trident, purple flames',
  comete: 'a living comet, a blazing celestial beast made of fire and ice trailing a comet tail',
  gardien_infini:
    'a guardian of infinity, a serene cosmic knight in white and gold armor with an infinity sigil halo',

  // ── LABYRINTHE (étape 2, v0.1008) — dans l'ordre des paliers : les premiers passent
  //    d'abord, ce sont ceux que les joueurs croisent le plus tôt. Le gardien de chaque
  //    palier suit son roster. « Golem de pierre » et « Léviathan » réutilisent l'image
  //    des donjons (même nom = même créature).
  l_rat: 'a big mangy sewer rat with red eyes and a long pink tail',
  l_araignee: 'a large grey cave spider with hairy legs and many small eyes',
  l_chauve_souris: 'a dark brown bat with wide leathery wings spread and bared fangs, flying',
  l_serpent_ombres: 'a black shadow snake with glowing purple eyes, coiled and hissing',
  l_matriarche:
    'a huge bloated spider matriarch with a pale egg sac abdomen and a crown of bone spikes',
  l_loup_errant: 'a lean brown stray wolf with a torn ear and matted fur, growling',
  l_sanglier_furieux: 'a furious black wild boar with broken tusks and bristling mane, charging',
  l_scorpion: 'a venomous orange desert scorpion with a raised glowing green stinger',
  l_varan: 'a big monitor lizard with scaly olive skin, forked tongue and sharp claws',
  l_alpha: 'a huge alpha wolf pack leader with silver fur, scars and a heavy mane, howling',
  l_squelette: 'an undead skeleton warrior with a rusty sword and a cracked round shield',
  l_goule: 'a hunched ghoul with grey rotting skin, long claws and a hungry mouth',
  l_tisseuse_os:
    'a spider made of bones weaving webs of bone threads, skull body, pale yellow bones',
  l_revenant: 'a revenant, a ghostly armored knight with a tattered cloak and blue ghost flames',
  l_roi_ossuaire:
    'an ossuary king, a giant skeleton king standing tall, crown of bones, cape of skulls',
  l_rampant:
    'an abyssal crawler, a deep sea crustacean monster with tentacle mouth and glowing lure',
  l_etreigneur: 'a strangler octopus monster with thick purple tentacles and a beak',
  l_essaim: 'a buzzing swarm of giant mosquitoes forming the shape of a monster',
  l_vase: 'a corrosive acid ooze blob, bubbling toxic yellow-green slime dripping',
  l_etreigneur_abysses:
    'a colossal abyssal strangler, giant dark blue octopus king with bioluminescent spots',
  l_elementaire_feu: 'a fire elemental, a humanoid made of roaring flames with burning eyes',
  l_fulgur: 'a lightning elemental, a crackling humanoid made of electric bolts, yellow and white',
  l_spectre_glacial: 'an icy spectre, a floating frost ghost with icicle claws and freezing mist',
  l_colosse_gouffre:
    'a colossus of the chasm, a gigantic rock golem with glowing magma cracks and boulder fists',
  l_oni: 'a blue oni demon with one horn, muscular, holding an iron club',
  l_diablotin: 'a small mischievous red imp with bat wings, a pointed tail and a trident',
  l_sangsue: 'a giant shadow leech, a dark slimy worm with a round toothed mouth, blood red glow',
  l_liche_mineure: 'a minor lich, a skeletal mage in a ragged grey robe holding a candle staff',
  l_seigneur_oni: 'an oni lord, a giant red demon warlord in samurai armor with a huge kanabo club',
  l_tengu: 'a chaos tengu, a crow-headed yokai warrior with black wings and a curved sword',
  l_wyverne: 'a green wyvern, two-legged dragon with bat wings and a barbed tail',
  l_oeil_chaos: 'a chaos eye, a floating demonic eyeball with bat wings and blue iris',
  l_mere_couvee:
    'a brood mother spider, a giant black spider carrying many baby spiders on her back',
  l_wyverne_ancienne:
    'an ancient wyvern, a huge old grey-scaled wyvern with torn wings and moss on its horns',
  l_seraphin: 'a fallen seraph, a dark angel with six black feathered wings and a broken halo',
  l_sentinelle: 'an astral sentinel, a floating stone construct with a single glowing blue eye',
  l_aberration: 'an aberration, a twisted mass of flesh with many eyes and mouths, pink and purple',
  l_comete_vivante: 'a living comet creature, a fiery rock beast trailing blue flames',
  l_veilleur: 'an astral watcher, a tall robed cosmic being with a starry face and many eyes',
  l_devoreur_neant: 'a void devourer, a black shadow beast with a gaping mouth full of stars',
  l_vide_rampant: 'a creeping void, a crawling shadow creature made of dark purple smoke',
  l_horreur: 'a shapeless horror, a formless black blob with tentacles and glowing eyes',
  l_fragment: 'a shattered fragment, a floating cracked crystal golem leaking violet energy',
  l_gueule_neant:
    'a maw of the void, a giant floating mouth with rows of teeth surrounded by darkness',
  l_tyran_dechu: 'a fallen tyrant king, a gaunt undead emperor in rotting golden armor and crown',
  l_cataclysme: 'a cataclysm elemental, a giant made of exploding fire, rock and lightning',
  l_fleau_final: 'a final scourge, a towering skeletal reaper with a scythe and black wings',
  l_tyran_infini:
    'a tyrant of infinity, a colossal cosmic emperor in black and gold armor with a crown of stars',
  // ── GARDIENS DE FAILLE (v0.1108) — le gardien d'une faille est une espèce du roster de
  //    sa faction, en version ÉLITE : plus grande, parée, et marquée par la faille (fissures
  //    et aura d'énergie violette). 3 factions × 5 espèces = 15. Nom « X (gardien) ».
  g_coupe_jarret:
    'an elite bandit cutthroat guardian, tall masked rogue in black leather with twin curved daggers, torn red cape, glowing violet cracks of rift energy on his armor',
  g_archer:
    'an elite deserter archer guardian, hooded soldier in battered steel and green cloak drawing a huge black longbow, glowing violet rift energy arrows',
  g_brise_porte:
    'an elite bandit gatebreaker guardian, huge muscular brute with an enormous double-bladed battle axe, iron shoulder plates, glowing violet rift cracks on his skin',
  g_mercenaire:
    'an elite mercenary guardian, heavily armored knight in dented steel plate with a tower shield and a longsword, glowing violet rift sigils on the shield',
  g_chef_bande:
    'a bandit warlord guardian, scarred chieftain in a fur mantle and red war paint, spiked iron crown, huge greatsword, glowing violet rift energy aura',
  g_loup:
    'a gigantic famished dire wolf guardian, gaunt black-furred wolf with visible ribs, jagged glowing violet cracks across its body, snarling fangs',
  g_arachne:
    'a giant forest arachne guardian, huge green and brown spider with moss and bark on its carapace, dripping venom fangs, glowing violet eyes',
  g_sanglier:
    'a colossal enraged boar guardian, massive boar with huge iron-banded tusks, bristling dark fur split by glowing violet rift cracks',
  g_ours:
    'a colossal cave bear guardian, huge brown bear standing on its hind legs, stone-like armored hide, glowing violet crystals growing from its back',
  g_scorpion:
    'a colossal giant scorpion guardian, obsidian black carapace with glowing violet veins, enormous pincers, raised crystal stinger tail',
  g_revenant:
    'a revenant guardian, towering undead knight in rusted black armor, rotting grey skin, ghostly violet flames in its eye sockets, notched sword',
  g_spectre:
    'a wailing spectre guardian, huge floating pale ghost woman in tattered shroud, screaming mouth, long spectral claws, violet ethereal glow',
  g_ossuaire:
    'a walking ossuary guardian, huge hulking golem made of countless fused bones and skulls, glowing violet core in its ribcage',
  g_necromant:
    'a necromancer guardian, gaunt sorcerer in black and purple robes with a skull staff, swirling violet necrotic magic, floating skulls around him',
  g_porte_linceul:
    'a shroud bearer guardian, tall faceless undead monk wrapped in grey burial shrouds, carrying a coffin chained on its back, violet glow under the hood',

  // ── BOSS ENTRE AMIS (v0.1109) — une silhouette par emoji de `BOSS_EMOJIS` (friendBoss.ts),
  //    tirée de l'id du boss. ⚠️ DE FACE (cf. `FRONT`) : la scène le pose EN HAUT, le groupe
  //    en ligne dessous — il leur fait face, pas un héros à sa gauche.
  fb_dragon:
    'a colossal raid boss dragon, massive dark red dragon rearing up with wings spread wide, horned head roaring, glowing ember chest',
  fb_oni:
    'a colossal raid boss oni demon king, giant red-skinned demon with two big horns, wild white hair, golden armor, huge iron kanabo club held in both hands',
  fb_tyran:
    'a colossal raid boss tyrannosaurus, giant armored dinosaur with bone plates and spikes, jaws wide open roaring, glowing orange eyes',
  fb_kraken:
    'a colossal raid boss kraken, gigantic dark teal octopus monster rising up, many huge tentacles spread around, one glowing yellow eye',
  fb_scorpion:
    'a colossal raid boss scorpion king, gigantic golden and black armored scorpion, huge raised pincers, stinger tail arched high over its head',
  fb_troll:
    'a colossal raid boss mountain troll, giant hunched troll with mossy stone skin, tree trunk club, bone necklace, snarling tusks',
  fb_long:
    'a colossal raid boss eastern dragon, long serpentine jade green chinese dragon coiled upright, flowing whiskers and mane, holding a glowing pearl',
  fb_xeno:
    'a colossal raid boss alien horror, giant purple insectoid alien with many glowing eyes, scythe arms raised, chitinous armor',
};

/** Ceux dessinés DE FACE plutôt que de profil — les boss entre amis, posés au-dessus du
 *  groupe. Même style, cadrage différent. */
const FRONT = new Set(Object.keys(SUBJECTS).filter((s) => s.startsWith('fb_')));
const STYLE_AVANT_FACE =
  'anime key visual, 2D anime art style, flat cel shaded colors, bold black outlines, full body front view of';
const FRAMING_FACE =
  'facing the viewer, symmetrical imposing pose, whole creature visible from head to feet, ' +
  'isolated on a plain flat pure white background, no ground, no scenery, no text';

const seedFor = (slug) => seedOf('monster:' + slug) % 100000;

/** Ceux que le modèle a dessinés regardant vers la DROITE — retournés à l'écriture.
 *  Rempli après relecture de la planche, jamais à l'aveugle. */
const FLIP = new Set([]);

/**
 * ⚠️ LE MODÈLE PAR DÉFAUT DU SERVICE PUBLIC NE SAIT PAS FAIRE DE CRÉATURES (mesuré le
 * 2026-09-21) : `image.pollinations.ai` ne sert plus que `sana`, qui rend un monstre en pied
 * flou et délavé, ignore le fond demandé, et transforme un dragon « en portrait » en homme
 * à cornes. D'où l'API à CLÉ (`gen.pollinations.ai`) et **Z-Image Turbo**, retenu sur une
 * planche à trois (FLUX schnell : gribouillis parasites ; FLUX.2 klein : plus terne). Il
 * respecte le profil, l'orientation ET le fond blanc uni, ce qui rend le détourage fiable.
 *
 * ⚠️ LA CLÉ vit dans `.pollinations-token` (gitignoré, comme `.supabase-token`) : jamais
 * dans le dépôt, jamais dans le code. Chaque image consomme 0,004 pollen sur la dotation
 * quotidienne du compte — le solde est vérifié AVANT chaque image, on s'arrête net plutôt
 * que de facturer du solde payant.
 */
const MODEL = 'zimage';
const TOKEN_FILE = resolve(ROOT, '.pollinations-token');
const GEN = 768;
const SIZE = 320;
const REKEY = process.argv.includes('--rekey'); // re-détoure les bruts, sans régénérer
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RAW_DIR = resolve(ROOT, '.monster-raw');

const token = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : '';
if (!token && !REKEY) {
  console.error(`✖ clé absente : dépose-la dans ${TOKEN_FILE}`);
  process.exit(1);
}
const auth = { Authorization: `Bearer ${token}` };

/** Solde gratuit du jour. On ne touche JAMAIS au solde payant. */
async function freeBalance() {
  const res = await fetch('https://gen.pollinations.ai/account/balance', { headers: auth });
  const j = await res.json();
  return j.accountBalance?.tier ?? 0;
}

async function fetchImage(prompt, seed) {
  const url =
    `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}` +
    `?model=${MODEL}&width=${GEN}&height=${GEN}&seed=${seed}&nologo=true`;
  for (let essai = 0; essai < 6; essai++) {
    try {
      const res = await fetch(url, { headers: auth, signal: AbortSignal.timeout(180000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 5000) return buf;
      } else console.log(`  … ${res.status}, nouvel essai`);
    } catch (e) {
      console.log(`  … ${e.message}, nouvel essai`);
    }
    await sleep(5000 + essai * 5000);
  }
  return null;
}

/**
 * Retire le fond blanc PAR REMPLISSAGE DEPUIS LES BORDS, jamais par couleur seule : un
 * seuil « tout ce qui est blanc devient transparent » trouerait les crocs, les yeux et le
 * ventre clair du wyrm. Seul le blanc CONNECTÉ au bord de l'image est du fond. La frange
 * (pixels presque blancs au contact du fond) devient semi-transparente, sinon un liseré
 * blanc entoure le monstre sur la scène sombre du combat.
 */
async function keyOut(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const whiteness = (p) => {
    const r = data[p],
      g = data[p + 1],
      b = data[p + 2];
    const min = Math.min(r, g, b),
      max = Math.max(r, g, b);
    return max - min > 28 ? 0 : min / 255; // saturé → pas du fond
  };
  const HARD = 0.9; // assez blanc pour être du fond
  const SOFT = 0.78; // frange
  const bg = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (bg[i]) continue;
    if (whiteness(i * 4) < HARD) continue;
    bg[i] = 1;
    const x = i % w,
      y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  // ⚠️ LE FOND ENFERMÉ (entre un bras et le torse, dans une boucle de queue) n'est pas
  // relié au bord : vu sur la planche, il restait en TACHES BLANCHES. On retire donc aussi
  // les zones enfermées de blanc PUR et GRANDES — les petites (yeux, crocs, reflets) et le
  // blanc nuancé (armure claire, fantôme) restent.
  const PURE = 0.95;
  const MIN_HOLE = 500; // px sur une image de 768² : bien au-dessus d'un œil ou d'un croc
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (bg[start] || seen[start] || whiteness(start * 4) < PURE) continue;
    const comp = [];
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const i = q.pop();
      comp.push(i);
      const x = i % w,
        y = (i / w) | 0;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ]) {
        if (j < 0 || seen[j] || bg[j] || whiteness(j * 4) < PURE) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    if (comp.length >= MIN_HOLE) for (const i of comp) bg[i] = 1;
  }
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) {
      data[i * 4 + 3] = 0;
      continue;
    }
    // frange : pixel au contact du fond et presque blanc
    const x = i % w,
      y = (i / w) | 0;
    const touches =
      (x > 0 && bg[i - 1]) ||
      (x < w - 1 && bg[i + 1]) ||
      (y > 0 && bg[i - w]) ||
      (y < h - 1 && bg[i + w]);
    const wh = whiteness(i * 4);
    if (touches && wh > SOFT) data[i * 4 + 3] = Math.round(255 * (1 - (wh - SOFT) / (HARD - SOFT)));
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function write(slug, brut) {
  let img = sharp(await keyOut(brut)).trim();
  if (FLIP.has(slug)) img = img.flop();
  const out = await sharp(await img.png().toBuffer())
    .resize(SIZE, SIZE, {
      fit: 'contain',
      position: 'south',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 80, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(resolve(OUT, `${slug}.webp`), out);
  return out.length;
}

/**
 * ⚠️ ON GÉNÈRE DEPUIS `SUBJECTS`, PAS DEPUIS LA TABLE : la dotation gratuite (~60 images
 * par jour) ne couvre pas un lot entier en une fois. La table (`monsterArt.ts`) ne recense
 * donc que les images qui EXISTENT — son test reste strict —, et on l'étend au fur et à
 * mesure que les fichiers arrivent. Ordre des sujets = ordre de génération : les paliers
 * que les joueurs croisent en premier passent d'abord.
 */
const slugs = Object.keys(SUBJECTS);
const tableSlugs = Object.values(MONSTER_ART).map((p) =>
  p.replace('/monsters/', '').replace('.webp', ''),
);
const sansSujet = tableSlugs.filter((s) => !SUBJECTS[s]);
if (sansSujet.length) {
  console.error(`✖ ennemis sans description : ${sansSujet.join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
mkdirSync(RAW_DIR, { recursive: true });
let total = 0;
for (const slug of slugs) {
  if (ONLY.length && !ONLY.includes(slug)) continue;
  const raw = resolve(RAW_DIR, `${slug}.jpg`);
  if (REKEY) {
    if (!existsSync(raw)) continue;
    total += await write(slug, readFileSync(raw));
    console.log(`↺ ${slug}`);
    continue;
  }
  if (!FORCE && existsSync(resolve(OUT, `${slug}.webp`))) {
    console.log(`· ${slug} — déjà là`);
    continue;
  }
  const solde = await freeBalance();
  if (solde < 0.01) {
    console.error(`✖ dotation du jour épuisée (${solde}) — arrêt, rien de payant consommé`);
    break;
  }
  const prompt = FRONT.has(slug)
    ? `${STYLE_AVANT_FACE} ${SUBJECTS[slug]}, ${FRAMING_FACE}, ${STYLE_APRES}`
    : `${STYLE_AVANT} ${SUBJECTS[slug]}, ${FRAMING}, ${STYLE_APRES}`;
  const brut = await fetchImage(prompt, seedFor(slug));
  if (!brut) {
    console.error(`✖ ${slug} — échec`);
    continue;
  }
  writeFileSync(raw, brut); // brut conservé hors dépôt : re-détourer sans regénérer
  const n = await write(slug, brut);
  total += n;
  console.log(`✔ ${slug} — ${(n / 1024).toFixed(1)} Ko (solde ${solde.toFixed(3)})`);
}
console.log(`\nTotal écrit : ${(total / 1024).toFixed(0)} Ko`);
