/**
 * 🗡️ LES ILLUSTRATIONS DE L'ÉQUIPEMENT DES CHAMPIONS — une par modèle du roster (72).
 *
 * `node scripts/fetch-advgear-art.mjs [--force]`
 *
 * ⚠️ À NE RELANCER QUE POUR REGÉNÉRER : un clone du dépôt a déjà les fichiers. Sans
 * `--force`, une image déjà présente est SAUTÉE (le service limite son débit ; une reprise
 * après coupure ne doit pas tout refaire).
 *
 * Même méthode que `fetch-champion-portraits.mjs` : images **générées par Pollinations.ai**
 * puis **téléchargées et versionnées** — le dépôt fait foi, jamais le service (qui peut
 * changer de modèle : relancer plus tard ne redonnerait pas les mêmes images).
 *
 * ⚠️ LE ROSTER EST LU DEPUIS `src/data/advGearModels.ts`, jamais recopié ici. Chaque
 * modèle a son SUJET écrit à la main ci-dessous : un sujet manquant arrête le script au
 * lieu de produire une image générique en silence.
 *
 * ⚠️ LA LETTRE SE LIT DANS LA RICHESSE DU SUJET, pas dans une mention : un B est un objet
 * simple et usé, un S un objet de légende qui rayonne. Écrire « legendary rarity » dans le
 * prompt ne donnerait que des paillettes génériques.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ADV_GEAR_MODELS } from '../src/data/advGearModels.ts';
import { seedOf } from '../src/lib/combat.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/advgear');
const FORCE = process.argv.includes('--force');

/**
 * ⚠️ « NATURE MORTE », PAS « ANIME » : mesuré au banc, tout prompt qui ouvre sur « anime »
 * fait dessiner un PERSONNAGE qui tient l'objet (la première épée est sortie en portrait de
 * guerrière). « Still life … lying alone, object only » donne l'objet seul.
 */
const style = (sujet) =>
  `still life illustration of ${sujet} lying alone, object only, rpg game item art, cel shaded, ` +
  'clean bold outlines, dark gradient background, no person, no hands, no face, no text';

/** Modèle → ce qu'on voit (B simple et usé · A soigné et gravé · S de légende). */
const SUBJECTS = {
  // ── GUERRIER ──
  'guerrier-weapon-b': 'plain short iron sword with a leather wrapped grip, slightly nicked blade',
  'guerrier-weapon-a': 'finely crafted bastard sword, engraved steel blade, brass crossguard',
  'guerrier-weapon-s': 'legendary holy longsword glowing with golden light, ornate winged hilt, radiant runes',
  'guerrier-armor-b': 'dented iron breastplate with worn leather straps',
  'guerrier-armor-a': 'polished blued steel cuirass with engraved trim',
  'guerrier-armor-s': 'legendary golden plate armor with a roaring lion emblem, glowing aura',
  'guerrier-accessory-b': 'pair of simple brown leather gauntlets',
  'guerrier-accessory-a': 'pair of steel gauntlets with spiked knuckles',
  'guerrier-accessory-s': 'pair of massive titan gauntlets crackling with red energy, glowing runes',
  'guerrier-relic-b': 'small round iron talisman on a cord',
  'guerrier-relic-a': 'veteran talisman, engraved silver medallion with a red gem',
  'guerrier-relic-s': 'ancient ember heart relic, a glowing crystal heart wrapped in golden filigree, fiery aura',

  // ── ARCHER ──
  'archer-weapon-b': 'simple wooden hunting bow with a plain string',
  'archer-weapon-a': 'elegant yew longbow with carved leaf patterns',
  'archer-weapon-s': 'legendary moonlit elven bow of silver wood, glowing crescent tips, sparkling light',
  'archer-armor-b': 'plain brown leather vest with laces',
  'archer-armor-a': 'green studded leather brigandine with a hood',
  'archer-armor-s': 'legendary cloak of silver leaves, shimmering, glowing green aura',
  'archer-accessory-b': 'simple canvas quiver with a few arrows',
  'archer-accessory-a': 'carved leather quiver with fletched arrows and brass fittings',
  'archer-accessory-s': 'legendary endless quiver overflowing with glowing magical arrows',
  'archer-relic-b': 'single grey lucky feather tied with a string',
  'archer-relic-a': 'royal falcon feather with a golden clasp',
  'archer-relic-s': 'blazing phoenix feather made of fire, glowing embers',

  // ── MAGE ──
  'mage-weapon-b': 'gnarled wooden staff with a simple knot at the top',
  'mage-weapon-a': 'wizard staff topped with a glowing blue crystal',
  'mage-weapon-s': 'legendary scepter of the stars, golden with a floating starry orb, cosmic glow',
  'mage-armor-b': 'plain grey novice robe folded',
  'mage-armor-a': 'purple mage robe embroidered with glowing runes',
  'mage-armor-s': 'legendary ethereal mantle made of flowing starlight, translucent, glowing aura',
  'mage-accessory-b': 'worn old spellbook with dog-eared pages',
  'mage-accessory-a': 'grimoire bound with iron chains and a padlock',
  'mage-accessory-s': 'legendary primordial codex floating open, pages glowing with golden symbols',
  'mage-relic-b': 'small clear glass orb on a wooden stand',
  'mage-relic-a': 'polished amethyst orb glowing violet',
  'mage-relic-s': 'orb of the void, a black sphere swirling with purple galaxies, dark aura',

  // ── HOMME D'ARMES ──
  'homme_armes-weapon-b': 'wooden club reinforced with iron bands',
  'homme_armes-weapon-a': 'steel flanged mace with a leather grip',
  'homme_armes-weapon-s': 'legendary huge wall-breaker warhammer, glowing orange runes, crackling energy',
  'homme_armes-armor-b': 'patched iron plate armor with mismatched pieces',
  'homme_armes-armor-a': 'sturdy guard plate armor with a tabard',
  'homme_armes-armor-s': 'legendary eternal bastion full plate armor, massive, glowing blue aura',
  'homme_armes-accessory-b': 'simple round wooden shield with an iron rim',
  'homme_armes-accessory-a': 'tall heraldic pavise shield with a painted crest',
  'homme_armes-accessory-s': 'legendary titan aegis shield, golden, glowing with a protective light',
  'homme_armes-relic-b': 'small wooden reliquary box',
  'homme_armes-relic-a': 'silver reliquary with engraved patterns',
  'homme_armes-relic-s': 'legendary saint reliquary of gold and crystal, holy glowing light',

  // ── ÉCLAIREUR ──
  'eclaireur-weapon-b': 'plain tracker dagger with a wooden handle',
  'eclaireur-weapon-a': 'pair of crossed twin daggers with curved steel blades',
  'eclaireur-weapon-s': 'legendary shadow fang dagger, black blade trailing dark mist, glowing purple edge',
  'eclaireur-armor-b': 'plain brown travel cloak folded',
  'eclaireur-armor-a': 'dark blue night cloak with a silver clasp',
  'eclaireur-armor-s': 'legendary veil of mist, a translucent cloak dissolving into fog, glowing aura',
  'eclaireur-accessory-b': 'simple brass spyglass',
  'eclaireur-accessory-a': 'engraved brass spyglass with leather wrapping',
  'eclaireur-accessory-s': 'legendary eye of the horizon spyglass, golden, lens glowing with light',
  'eclaireur-relic-b': 'small pocket compass with a brass case',
  'eclaireur-relic-a': 'astronomer compass with star engravings',
  'eclaireur-relic-s': 'legendary compass of lost winds, floating needle, swirling glowing wind',

  // ── CARAVANIER ──
  'caravanier-weapon-b': 'plain wooden walking stick',
  'caravanier-weapon-a': 'iron-shod guide staff with a brass knob',
  'caravanier-weapon-s': 'legendary pathfinder staff of the first road, carved with glowing map lines',
  'caravanier-armor-b': 'plain brown travel coat',
  'caravanier-armor-a': 'lined merchant coat with brass buttons and a fur collar',
  'caravanier-armor-s': 'legendary coat of a thousand roads, patterned with glowing maps, golden trim',
  'caravanier-accessory-b': 'simple canvas pack saddle bag',
  'caravanier-accessory-a': 'reinforced leather pack with metal buckles',
  'caravanier-accessory-s': 'legendary bottomless magic bag glowing from inside, stars spilling out',
  'caravanier-relic-b': 'simple iron lantern with a candle',
  'caravanier-relic-a': 'ornate copper lantern with warm light',
  'caravanier-relic-s': 'legendary lantern of the stars, holding a tiny glowing galaxy',
};

const seedFor = (id) => seedOf(id) % 100000;
const GEN = 640;
const CROP = 560;
/** 192 px : une pièce s'affiche en petit (case de portrait, tuile de stock). */
const SIZE = 192;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchArt(prompt, seed) {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${GEN}&height=${GEN}&seed=${seed}&nologo=true&private=true`;
  for (let essai = 0; essai < 8; essai++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 5000) return buf;
      }
    } catch {
      /* réseau : on retente */
    }
    await sleep(5000 + essai * 5000);
  }
  return null;
}

const sansSujet = ADV_GEAR_MODELS.filter((m) => !SUBJECTS[m.id]).map((m) => m.id);
if (sansSujet.length) {
  console.error(`✖ modèles sans description : ${sansSujet.join(', ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
let total = 0;
let faits = 0;
// `--reverse` : parcourt le roster depuis la fin. Deux processus (un dans chaque sens) se
// rejoignent au milieu — chacun saute ce que l'autre a déjà écrit — et divisent le temps
// par deux sans tirer plus fort sur un même point du service.
const ORDER = process.argv.includes('--reverse') ? [...ADV_GEAR_MODELS].reverse() : ADV_GEAR_MODELS;
for (const m of ORDER) {
  const dest = resolve(OUT, `${m.id}.webp`);
  if (!FORCE && existsSync(dest)) {
    console.log(`· ${m.id} — déjà là`);
    continue;
  }
  const prompt = style(SUBJECTS[m.id]);
  const brut = await fetchArt(prompt, seedFor(m.id));
  if (!brut) {
    console.error(`✖ ${m.id} — échec après 8 tentatives`);
    continue;
  }
  // Le logo du service est incrusté en bas à droite : on coupe la bande basse.
  const img = await sharp(brut)
    .extract({ left: (GEN - CROP) >> 1, top: 0, width: CROP, height: CROP })
    .resize(SIZE, SIZE)
    .webp({ quality: 80 })
    .toBuffer();
  writeFileSync(dest, img);
  total += img.length;
  faits++;
  console.log(`✔ ${m.id} — ${(img.length / 1024).toFixed(1)} Ko`);
}
console.log(`\n${faits} illustration(s) écrite(s), ${(total / 1024).toFixed(0)} Ko.`);
