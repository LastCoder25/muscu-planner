// smoke-ui.mjs — la SEULE porte qui regarde l'écran.
//
// ⚠️ Pourquoi ce script existe : typecheck, lint, tests et build valident du CODE et sont
// AVEUGLES au rendu. Trois défauts déjà livrés le prouvent — un `fill: none` SVG non
// cliquable en son centre (impossible de bâtir une tourelle), des ornements du rempart
// décrochés parce qu'ils étaient en coordonnées dures, un panneau rendu deux fois. Aucun
// n'aurait pu être vu sans ouvrir un navigateur.
//
// Il sert le build de `dist/spa`, l'ouvre dans Chromium et vérifie ce qui ne demande AUCUN
// compte : le boot, l'absence d'erreur, et le garde-fou mobile-first du projet.
//
// ⚠️ PORTÉE HONNÊTE : sans identifiants Supabase, il ne dépasse pas l'écran de connexion.
// Il attrape donc le boot cassé, le chunk manquant, l'erreur au démarrage et le débordement
// horizontal — PAS la géométrie de la base ni les écrans de jeu. Pour aller plus loin il
// faudrait un compte de test dédié (jamais d'identifiants en dur dans le dépôt).
//
// Pré-requis, UNE fois (npx est bloqué par AppLocker, on passe par node) :
//   node node_modules/playwright-core/cli.js install chromium
// Usage : npm run build && npm run smoke
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPA = path.join(ROOT, 'dist', 'spa');
const OUT = path.join(ROOT, 'dist', 'smoke');
const PORT = 4599;
// Le projet est mobile-first et documente ses seuils : Z Fold plié, téléphone, et le
// basculement « cockpit » à 600. On vérifie qu'aucun ne déborde horizontalement.
const WIDTHS = [344, 390, 600];
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(SPA, 'index.html'))) {
  console.error('✗ dist/spa absent — lance `npm run build` d’abord.');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  let p = path.join(SPA, decodeURIComponent(req.url.split('?')[0]));
  // Repli SPA : toute route inconnue rend index.html, comme Vercel en mode history.
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(SPA, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

const fail = [];
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

    const resp = await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const text = (await page.textContent('body')) ?? '';
    await page.screenshot({ path: path.join(OUT, `boot-${width}.png`) });
    await page.close();

    if (resp?.status() !== 200) fail.push(`${width}px : HTTP ${resp?.status()}`);
    if (errors.length) fail.push(`${width}px : ${errors.length} erreur(s) — ${errors[0]}`);
    // ⚠️ Le débordement horizontal est un garde-fou EXPLICITE du projet (§ Responsive).
    if (scrollW > width) fail.push(`${width}px : débordement horizontal (scrollWidth ${scrollW})`);
    if (text.trim().length < 20) fail.push(`${width}px : page quasi vide (${text.trim().length} car.)`);
    console.log(`  ${fail.length ? '·' : '✓'} ${width}px — ${scrollW}px de large, ${errors.length} erreur(s)`);
  }
} finally {
  await browser.close();
  server.close();
}

if (fail.length) {
  console.error('\n✗ SMOKE UI ÉCHOUE :');
  for (const f of fail) console.error('  -', f);
  console.error(`\nCaptures : ${path.relative(ROOT, OUT)}`);
  process.exit(1);
}
console.log(`\n✓ Smoke UI OK — captures dans ${path.relative(ROOT, OUT)}`);
