/**
 * 🖼️ LES PORTRAITS DE CHAMPIONS — téléchargement depuis DiceBear.
 *
 * `node scripts/fetch-champion-portraits.mjs`
 *
 * ⚠️ À NE RELANCER QUE POUR REGÉNÉRER : un clone du dépôt a déjà les fichiers.
 *
 * STYLE : `pixel-art` de DiceBear — **CC0** (domaine public, aucun crédit dû), comme la
 * base d'exercices du projet. Choisi à l'œil parmi 4 styles CC0 rendus côte à côte : c'est
 * le seul qui dise « jeu », et le pixel art reste **lisible à 30 px** — ce qui compte,
 * puisque le Codex affiche les 32 portraits d'un coup.
 *
 * ⚠️ DÉTERMINISTE : la graine est l'**id du champion**, donc son visage ne change jamais —
 * relancer ce script redonne exactement les mêmes fichiers. Le fond prend la **couleur de
 * sa rareté** (`RANK_COLOR`), la même que partout ailleurs dans le jeu : le portrait dit
 * donc la rareté sans un mot.
 *
 * ⚠️ SVG ET NON WebP : un SVG DiceBear pèse moins qu'un WebP 160 px **et** reste net à
 * toute taille. Le service worker ne cache rien, donc chaque octet est retéléchargé.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/champions');
const STYLE = 'pixel-art';

/**
 * Champion → couleur de sa RARETÉ (`RANK_COLOR`). ⚠️ Embarquée ici, comme le mapping de
 * `fetch-exercise-frames.mjs` : un script de dev n'a pas de résolveur TypeScript, et les
 * champions sont déclarés en tuples positionnels qu'une regex lirait mal. Le vrai
 * garde-fou est ailleurs — `championPortraits.test.ts` exige que les 32 champions soient
 * illustrés ET que chaque fichier existe, donc un champion ajouté ici fait rougir la suite.
 */
const CHAMPIONS = [
  ['orsene', '#cd7f32'],
  ['boulin', '#cd7f32'],
  ['fila', '#cd7f32'],
  ['teck', '#cd7f32'],
  ['sauge', '#c9d2dc'],
  ['gorm', '#c9d2dc'],
  ['sylve', '#c9d2dc'],
  ['vig', '#c9d2dc'],
  ['anselme', '#ffcf3f'],
  ['barthe', '#ffcf3f'],
  ['zephyrine', '#ffcf3f'],
  ['verre', '#ffcf3f'],
  ['lysandre', '#b8912e'],
  ['tessa', '#b8912e'],
  ['roan', '#b8912e'],
  ['miren', '#b8912e'],
  ['ferrand', '#ff9a3f'],
  ['ursk', '#ff9a3f'],
  ['nive', '#ff9a3f'],
  ['kaell', '#ff9a3f'],
  ['ombrelune', '#b07cff'],
  ['tarn', '#b07cff'],
  ['ysolde', '#b07cff'],
  ['corvin', '#b07cff'],
  ['brume', '#6cc8ff'],
  ['molosse', '#6cc8ff'],
  ['fulgur', '#6cc8ff'],
  ['nyx', '#6cc8ff'],
  ['aurore', '#5fe0d0'],
  ['atlas', '#5fe0d0'],
  ['ventcourt', '#5fe0d0'],
  ['oeildumonde', '#5fe0d0'],
].map(([id, color]) => ({ id, color }));

const url = (c) =>
  `https://api.dicebear.com/9.x/${STYLE}/svg?seed=${encodeURIComponent(c.id)}` +
  `&backgroundColor=${c.color.replace('#', '')}&backgroundType=gradientLinear&radius=12`;

const champions = CHAMPIONS;
mkdirSync(OUT, { recursive: true });

let total = 0;
for (const c of champions) {
  const res = await fetch(url(c));
  if (!res.ok) throw new Error(`${c.id} : HTTP ${res.status}`);
  const svg = await res.text();
  writeFileSync(resolve(OUT, `${c.id}.svg`), svg);
  total += Buffer.byteLength(svg);
  process.stdout.write('.');
}
console.log(`\n${champions.length} portraits · ${(total / 1024).toFixed(0)} Ko au total`);
