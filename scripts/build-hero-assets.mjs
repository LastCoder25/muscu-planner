// build-hero-assets.mjs — fabrique le bundle SLIM du héros 3D à partir des packs bruts.
//
// POURQUOI : les packs Quaternius extraits dans `public/models/` pèsent ~419 Mo (sources
// FBX + textures 4K en PNG, dupliquées dans plusieurs dossiers). C'est INCOMMITTABLE et
// impossible à servir. Ce script en dérive `public/hero/` — seulement les pièces qu'on
// utilise, textures redimensionnées en WebP — qui, LUI, est versionné.
//
//   node scripts/build-hero-assets.mjs
//
// `public/models/` est gitignoré : si tu clones le repo, tu n'as PAS besoin de le
// relancer (le bundle dérivé est déjà là). Il ne sert qu'à régénérer après un changement
// de pack ou de réglage de compression.
//
// Licence des assets : Quaternius, CC0 (usage personnel, éducatif et commercial, sans
// attribution requise). Voir public/hero/LICENSE.txt.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const RAW = path.join(ROOT, 'public', 'models');
const OUT = path.join(ROOT, 'public', 'hero');

const BASE_DIR = path.join(RAW, 'Universal Base Characters[Standard]', 'Base Characters', 'Godot - UE');
const PARTS_DIR = path.join(
  RAW,
  'Modular Character Outfits - Fantasy[Standard]',
  'Exports',
  'glTF (Godot-Unreal)',
  'Modular Parts',
);

/** Ce qu'on embarque. Masculin seulement pour l'instant : les textures sont PARTAGÉES
 *  entre genres, seule la géométrie diffère (~1,5 Mo de plus) — ajouter le féminin est
 *  une ligne, mais on ne paie pas ce qu'on n'affiche pas encore. */
const BASE = 'Superhero_Male_FullBody.gltf';
const PARTS = [
  'Male_Peasant_Arms',
  'Male_Peasant_Body',
  'Male_Peasant_Feet',
  'Male_Peasant_Legs',
  'Male_Ranger_Acc_Pauldron',
  'Male_Ranger_Arms',
  'Male_Ranger_Body',
  'Male_Ranger_Feet_Boots',
  'Male_Ranger_Head_Hood',
  'Male_Ranger_Legs',
];

/** Résolutions par TYPE de carte. La couleur porte la lisibilité, le relief et l'ORM
 *  n'ont besoin que de la moitié — on divise le poids sans que ça se voie à l'écran. */
function sizeFor(name) {
  const n = name.toLowerCase();
  if (n.includes('basecolor')) return { px: 1024, quality: 82 };
  if (n.includes('normal')) return { px: 512, quality: 90 }; // lossy agressif = artefacts de relief
  return { px: 512, quality: 80 }; // ORM / roughness / reste
}

const texJobs = new Map(); // nom d'origine → { src, out }

function webpName(png) {
  return png.replace(/\.[^.]+$/, '') + '.webp';
}

/** Copie un glTF en réécrivant ses URI (buffer + images) vers le bundle plat. */
function convertGltf(srcFile, outName) {
  const dir = path.dirname(srcFile);
  const g = JSON.parse(fs.readFileSync(srcFile, 'utf8'));

  for (const b of g.buffers ?? []) {
    if (!b.uri || b.uri.startsWith('data:')) continue;
    const src = path.join(dir, decodeURIComponent(b.uri));
    const base = path.basename(src);
    fs.copyFileSync(src, path.join(OUT, base));
    b.uri = base;
  }
  for (const im of g.images ?? []) {
    if (!im.uri || im.uri.startsWith('data:')) continue;
    const src = path.join(dir, decodeURIComponent(im.uri));
    const base = path.basename(src);
    const out = webpName(base);
    if (!texJobs.has(base) && fs.existsSync(src)) texJobs.set(base, { src, out });
    im.uri = out;
    im.mimeType = 'image/webp';
  }
  fs.writeFileSync(path.join(OUT, outName), JSON.stringify(g));
  return outName;
}

function mo(bytes) {
  return (bytes / 1048576).toFixed(2) + ' Mo';
}
function dirSize(d) {
  return fs
    .readdirSync(d)
    .reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0);
}

async function main() {
  if (!fs.existsSync(BASE_DIR) || !fs.existsSync(PARTS_DIR)) {
    console.error(
      'Packs bruts introuvables sous public/models/.\n' +
        "Télécharge « Universal Base Characters » et « Modular Character Outfits - Fantasy »\n" +
        'sur https://quaternius.com (format glTF) et extrais-les dans public/models/.',
    );
    process.exit(1);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  convertGltf(path.join(BASE_DIR, BASE), 'base.gltf');
  const manifest = { base: 'base.gltf', parts: {} };
  for (const p of PARTS) {
    const src = path.join(PARTS_DIR, `${p}.gltf`);
    if (!fs.existsSync(src)) {
      console.warn('  ! pièce absente, ignorée :', p);
      continue;
    }
    manifest.parts[p] = convertGltf(src, `${p}.gltf`);
  }

  let before = 0;
  for (const [name, job] of texJobs) {
    const { px, quality } = sizeFor(name);
    before += fs.statSync(job.src).size;
    await sharp(job.src)
      .resize(px, px, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toFile(path.join(OUT, job.out));
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(OUT, 'LICENSE.txt'),
    [
      'Modèles 3D : Quaternius — https://quaternius.com',
      'Packs « Universal Base Characters » et « Modular Character Outfits - Fantasy ».',
      'Licence CC0 : libre en usage personnel, éducatif et commercial, sans attribution.',
      '',
      'Fichiers dérivés des sources par scripts/build-hero-assets.mjs',
      '(textures redimensionnées et converties en WebP, glTF réécrits).',
    ].join('\n'),
  );

  const after = dirSize(OUT);
  console.log(`\nBundle écrit dans public/hero/`);
  console.log(`  ${Object.keys(manifest.parts).length} pièces + 1 corps de base`);
  console.log(`  textures : ${texJobs.size} — ${mo(before)} → WebP`);
  console.log(`  TOTAL bundle : ${mo(after)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
