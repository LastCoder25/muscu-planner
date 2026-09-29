/**
 * 🔮🏆 LES ILLUSTRATIONS DES POUVOIRS — une par pouvoir de relique (12) et de trophée (8) —
 * et le portrait du MILICIEN (🛡️, `src/data/militiaArt.ts`).
 *
 * `node scripts/fetch-power-art.mjs [--force] [--only=relic-brasier,trophy-achever] [--rekey] [--horde]`
 *
 * `--horde` : Stable Horde (gratuit, en file d’attente) au lieu de Pollinations, dont la
 * dotation gratuite ne se recharge plus depuis le 21/09.
 *
 * ⚠️ À NE RELANCER QUE POUR REGÉNÉRER : un clone du dépôt a déjà les fichiers. Sans
 * `--force`, une image déjà présente est SAUTÉE. `--rekey` refait le détourage depuis les
 * bruts conservés dans `.power-raw/` (hors dépôt), sans rien régénérer ni payer.
 *
 * ⚠️ LES FICHIERS SONT LUS DANS `src/data/powerArt.ts`, jamais recopiés ici. Chaque pouvoir a
 * son SUJET écrit à la main ci-dessous : un sujet manquant arrête le script au lieu de
 * produire une image générique en silence.
 *
 * - **OBJET SEUL, « nature morte »** : mesuré sur l'équipement des champions, un prompt qui
 *   ouvre sur « anime » fait dessiner un PERSONNAGE qui tient l'objet.
 * - **FOND SOMBRE, PAS DE DÉTOURAGE** : essayé d'abord sur fond blanc, Stable Horde rend des
 *   dégradés gris ou violets que le remplissage depuis les bords ne sait pas retirer (vu sur
 *   la planche). Un fond anthracite se fond dans la tuile sombre (`ItemIcon`), dont le
 *   LISERÉ garde la couleur du rang : le cadre dit le rang, l'image dit le pouvoir.
 * - **CARRÉ, 192 px** : une tuile d'objet fait 44 px à l'écran, 2 à 4× pour les écrans denses.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { RELIC_ART, TROPHY_ART } from '../src/data/powerArt.ts';
import { MILITIA_ART } from '../src/data/militiaArt.ts';
import { seedOf } from '../src/lib/combat.ts';
import { pollinationsClient, fetchHorde, sleep } from './lib/pollinations.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/powers');
const RAW_DIR = resolve(ROOT, '.power-raw');
const FORCE = process.argv.includes('--force');
const REKEY = process.argv.includes('--rekey');
const HORDE = process.argv.includes('--horde');
// `--parallel=N` : 3 par défaut ; 1 quand le service refuse (« 2 per 1 second »).
const HORDE_PARALLEL = Number(
  (process.argv.find((a) => a.startsWith('--parallel=')) ?? '--parallel=3').slice(11),
);
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '')
  .slice(7)
  .split(',')
  .filter(Boolean);
const GEN = 768;
const SIZE = 192;

const style = (sujet) =>
  `still life game item icon of ${sujet}, single object alone, fantasy rpg item art, ` +
  '2D cel shaded, bold clean black outlines, vivid colors, centered, the whole object visible, ' +
  'on a dark charcoal gradient vignette background, soft rim light, no person, no hands, ' +
  'no character, no table, no ground, no scenery, no text, no frame';

/** 🛡️ Le MILICIEN n'est pas un objet : son portrait suit le style des champions (buste,
 *  fond sombre). ⚠️ Sur Juggernaut (Horde), le sujet passe en tête, sinon il est ignoré. */
// ⚠️ LE CADRAGE PASSE EN TÊTE : placé après le sujet (premier jet), Horde dessinait le
// milicien EN PIED, lance à la main — les objets tenus appellent le corps entier. Le sujet
// ne cite donc plus d'arme, et le buste ouvre le prompt, comme les champions (visage serré).
const portraitStyle = (sujet) =>
  `close-up head and shoulders portrait of ${sujet}, face filling the frame, looking at viewer, ` +
  'anime key visual, 2D anime art style, flat cel shaded colors, bold black outlines, ' +
  'not photorealistic, official character portrait for a japanese fantasy rpg, ' +
  'dark gradient background';
const PORTRAITS = new Set(['milicien']);

/** Slug (nom du fichier) → l'objet qu'on voit. La RELIQUE est un artefact qui porte le
 *  pouvoir ; le TROPHÉE est une coupe, une médaille ou un emblème de victoire qui raconte le
 *  geste de sa quête. Écrit à la main : le nom seul ne dit ni la matière ni la couleur. */
const SUBJECTS = {
  // ── RELIQUES ──
  'relic-brasier':
    'an ancient bronze brazier relic burning with fierce red and orange flames, glowing embers',
  'relic-rempart':
    'a small round steel relic shield amulet with a glowing blue barrier aura and a spiked rim',
  'relic-coup_fatal':
    'a crimson crystal arrowhead relic with a golden crosshair engraving, sharp and glowing red',
  'relic-festin':
    'an ornate golden chalice relic overflowing with glowing dark red blood, vampire bat engravings',
  'relic-tempete':
    'a swirling storm orb relic with blue lightning and wind spiraling inside a glass sphere on a silver base',
  'relic-riposte_parfaite':
    'two crossed silver rapier blades forming a relic sigil with a glowing white gem at the center',
  'relic-ronces':
    'a thorny green bramble relic wrapped around a glowing emerald seed, sharp spikes',
  'relic-carapace':
    'a heavy turtle shell relic of dark jade and stone, hexagonal plates, glowing green runes',
  'relic-ouverture':
    'a golden lightning bolt relic crackling with yellow electricity, set on a small brass hilt',
  'relic-moisson':
    'a dark curved reaper sickle relic with a black blade and ghostly purple souls swirling around it',
  'relic-phenix':
    'a blazing phoenix feather relic made of fire, golden and scarlet plumes, rising embers',
  'relic-second_souffle':
    'a small glass vial relic filled with swirling white and pale blue breath of wind, silver stopper',

  // ── TROPHÉES ──
  'trophy-dechainer':
    'a battered bronze trophy cup with a roaring red flame and a cracked angry skull emblem, boiling steam',
  'trophy-achever':
    'a black and silver trophy with a skull and a crossed executioner dagger on a pedestal, purple glow',
  'trophy-annuler':
    'a steel trophy shaped like a tower shield on a stone plinth, a wall of iron bricks emblem, blue glow',
  'trophy-retourner':
    'a crimson goblet trophy with vampire fangs and a heart emblem, drops of blood turning into light',
  'trophy-etaler':
    'a stone trophy shaped like a mountain peak on a granite base, calm and heavy, moss and gold trim',
  'trophy-desarmer':
    'a silver duelist trophy with a broken sword and a white feather crossed over a medal',
  'trophy-renvoyer':
    'a bronze trophy with a spiked round mirror shield reflecting a returning arrow, green thorns',
  'trophy-accelerer':
    'a golden hourglass trophy with winged sides and sand flowing fast, speed lines, amber glow',

  // ── LE MILICIEN (portrait) ──
  milicien:
    'a young village militiaman wearing a dented iron kettle helmet and a padded gambeson ' +
    'with a leather strap across the chest, short stubble, determined and a little nervous, ' +
    'ordinary face, simple commoner, not a hero',
};

const slugOf = (path) => path.replace('/powers/', '').replace('.webp', '');
const slugs = [...Object.values(RELIC_ART), ...Object.values(TROPHY_ART)].map(slugOf);
slugs.push('milicien');
/** Où s'écrit une image : les pouvoirs dans `public/powers`, le milicien à son chemin. */
const destOf = (slug) =>
  slug === 'milicien' ? resolve(ROOT, 'public' + MILITIA_ART) : resolve(OUT, `${slug}.webp`);
const sansSujet = slugs.filter((s) => !SUBJECTS[s]);
if (sansSujet.length) {
  console.error(`✖ pouvoirs sans description : ${sansSujet.join(', ')}`);
  process.exit(1);
}

const client = HORDE ? null : pollinationsClient(resolve(ROOT, '.pollinations-token'));
if (!client && !REKEY && !HORDE) {
  console.error('✖ clé absente : dépose-la dans .pollinations-token (ou passe --horde)');
  process.exit(1);
}
// `--seed=N` décale la graine : tirer plusieurs candidats puis garder le meilleur.
const SEED_SHIFT = Number((process.argv.find((a) => a.startsWith('--seed=')) ?? '--seed=0').slice(7));
const seedFor = (slug) => (seedOf('power:' + slug) + SEED_SHIFT) % 100000;

async function write(slug, brut) {
  const out = await sharp(brut)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();
  writeFileSync(destOf(slug), out);
  return out.length;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(dirname(destOf('milicien')), { recursive: true });
mkdirSync(RAW_DIR, { recursive: true });
let total = 0;
const todo = [];
for (const slug of slugs) {
  if (ONLY.length && !ONLY.includes(slug)) continue;
  const raw = resolve(RAW_DIR, `${slug}.jpg`);
  if (REKEY) {
    if (!existsSync(raw)) continue;
    total += await write(slug, readFileSync(raw));
    console.log(`↺ ${slug}`);
    continue;
  }
  if (!FORCE && existsSync(destOf(slug))) {
    console.log(`· ${slug} — déjà là`);
    continue;
  }
  todo.push(slug);
}

async function generate(slug, note) {
  const prompt = (PORTRAITS.has(slug) ? portraitStyle : style)(SUBJECTS[slug]);
  const brut = HORDE
    ? await fetchHorde(prompt, seedFor(slug))
    : await client.fetchImage(prompt, seedFor(slug), GEN);
  if (!brut) {
    console.error(`✖ ${slug} — échec`);
    return;
  }
  writeFileSync(resolve(RAW_DIR, `${slug}.jpg`), brut); // brut conservé hors dépôt
  const n = await write(slug, brut);
  total += n;
  console.log(`✔ ${slug} — ${(n / 1024).toFixed(1)} Ko${note}`);
}

if (HORDE) {
  // Pas de solde : HORDE_PARALLEL demandes en file ; départs décalés (le service refuse
  // plus de 2 demandes par seconde).
  let next = 0;
  const worker = async (_, i) => {
    await sleep(i * 3000);
    while (next < todo.length) await generate(todo[next++], '');
  };
  await Promise.all(Array.from({ length: HORDE_PARALLEL }, worker));
} else {
  for (const slug of todo) {
    const solde = await client.freeBalance();
    if (solde < 0.01) {
      console.error(`✖ dotation du jour épuisée (${solde}) — arrêt, rien de payant consommé`);
      break;
    }
    await generate(slug, ` (solde ${solde.toFixed(3)})`);
  }
}
console.log(`\nTotal écrit : ${(total / 1024).toFixed(0)} Ko`);
