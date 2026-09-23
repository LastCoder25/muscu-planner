// smoke-ui.mjs — la SEULE porte qui regarde l'écran.
//
// ⚠️ Pourquoi ce script existe : typecheck, lint, tests et build valident du CODE et sont
// AVEUGLES au rendu. Trois défauts déjà livrés le prouvent — un `fill: none` SVG non
// cliquable en son centre (impossible de bâtir une tourelle), des ornements du rempart
// décrochés parce qu'ils étaient en coordonnées dures, un panneau rendu deux fois. Aucun
// n'aurait pu être vu sans ouvrir un navigateur.
//
// Il sert le build de `dist/spa`, l'ouvre dans Chromium et vérifie : le boot, l'absence
// d'erreur, et le garde-fou mobile-first du projet (aucun débordement horizontal).
//
// ⚠️ ET IL PASSE LA CONNEXION, quand un compte de test est configuré (`SMOKE_EMAIL` /
// `SMOKE_PASSWORD` dans `.env`, qui est gitignoré — JAMAIS d'identifiants dans le dépôt).
// C'était le point aveugle documenté : sans compte, il s'arrêtait à l'écran de connexion
// et ne voyait donc AUCUN des écrans où les trois défauts ci-dessus sont nés. Sans ces
// variables il garde exactement son ancien comportement : aucune régression sur un poste
// ou une CI qui ne les a pas.
//
// ⚠️ IL NE VA JAMAIS SUR `/leaderboard` : cette page PUBLIE les niveaux du compte courant
// dans un classement que tous les joueurs voient. Un compte de test n'a rien à y faire.
//
// Pré-requis, UNE fois (npx est bloqué par AppLocker, on passe par node) :
//   node node_modules/playwright-core/cli.js install chromium
// Le compte de test se (re)pose avec `node scripts/seed-smoke-account.mjs`.
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
// Le parcours connecté ne tourne QUE sur les deux téléphones : c'est là que le débordement
// mord, et tripler la durée pour un cockpit qui a plus de place n'apprendrait rien.
const TOUR_WIDTHS = [344, 390];
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/** Les écrans parcourus une fois connecté. `onglets` = onglets internes à cliquer ensuite. */
const ECRANS = [
  { route: '/', nom: 'accueil' },
  { route: '/program', nom: 'programme' },
  { route: '/history', nom: 'historique' },
  { route: '/stats', nom: 'stats' },
  { route: '/trophies', nom: 'trophees' },
  { route: '/agenda', nom: 'agenda' },
  { route: '/challenges', nom: 'defis' },
  { route: '/muscu', nom: 'muscu' },
  { route: '/cardio', nom: 'cardio' },
  { route: '/tennis', nom: 'tennis' },
  { route: '/body', nom: 'corps' },
  { route: '/friends', nom: 'amis' },
  { route: '/profile', nom: 'profil' },
  // ⚠️ L'Aventure est l'écran le plus dense du projet, et ses onglets rendent des choses
  // très différentes (fiche, grille d'équipement, carte des mondes, enceinte en SVG).
  // Les visiter séparément est tout l'intérêt d'un smoke connecté.
  { route: '/aventure', nom: 'aventure', onglets: ['Héros', 'Équipement', 'Explorer', 'Base'] },
];

function lireEnv() {
  const out = {};
  try {
    for (const l of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const i = l.indexOf('=');
      if (i > 0 && !l.trim().startsWith('#')) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
  } catch {
    /* pas de .env : on reste en mode déconnecté */
  }
  return out;
}

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

const env = lireEnv();
const EMAIL = process.env.SMOKE_EMAIL ?? env.SMOKE_EMAIL;
const PASS = process.env.SMOKE_PASSWORD ?? env.SMOKE_PASSWORD;

const fail = [];

/** Ouvre une page qui collecte ses erreurs. ⚠️ On IGNORE les erreurs RÉSEAU : un smoke ne
 *  doit pas rougir parce qu'une requête a mis trop de temps ou que Supabase a hoqueté — il
 *  regarde le RENDU. Tout le reste (exception JS, erreur Vue, ressource manquante) compte. */
async function ouvrir(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors = [];
  const garder = (t) => !/net::ERR|Failed to fetch|ERR_INTERNET|Load failed/i.test(t);
  page.on('console', (m) => {
    const t = m.text().slice(0, 200);
    if (m.type() === 'error' && garder(t)) errors.push(t);
  });
  page.on('pageerror', (e) => {
    const t = String(e).slice(0, 200);
    if (garder(t)) errors.push(t);
  });
  return { page, errors };
}

/** Le garde-fou mobile-first, au même endroit pour tous les écrans. */
async function verifier(page, width, nom, errors, avant) {
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  if (scrollW > width) fail.push(`${width}px ${nom} : débordement horizontal (${scrollW}px)`);
  const neuves = errors.slice(avant);
  if (neuves.length) fail.push(`${width}px ${nom} : ${neuves.length} erreur(s) — ${neuves[0]}`);
  return scrollW;
}

await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch();
try {
  // ── 1. Le boot, sans compte : ce que ce script a toujours vérifié ──────────────────────
  for (const width of WIDTHS) {
    const { page, errors } = await ouvrir(browser, width);
    const resp = await page.goto(`http://localhost:${PORT}/`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(1200);
    const text = (await page.textContent('body')) ?? '';
    await page.screenshot({ path: path.join(OUT, `boot-${width}.png`) });
    if (resp?.status() !== 200) fail.push(`${width}px : HTTP ${resp?.status()}`);
    if (text.trim().length < 20)
      fail.push(`${width}px : page quasi vide (${text.trim().length} car.)`);
    const w = await verifier(page, width, 'boot', errors, 0);
    await page.close();
    console.log(`  ✓ boot ${width}px — ${w}px de large, ${errors.length} erreur(s)`);
  }

  // ── 2. Le parcours connecté, si un compte de test est configuré ────────────────────────
  if (!EMAIL || !PASS) {
    console.log(
      '\n· Pas de SMOKE_EMAIL / SMOKE_PASSWORD dans .env → parcours connecté ignoré.\n' +
        '  Pose le compte de test avec `node scripts/seed-smoke-account.mjs`.',
    );
  } else {
    for (const width of TOUR_WIDTHS) {
      const { page, errors } = await ouvrir(browser, width);
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(800);

      // ⚠️ On passe par le FORMULAIRE plutôt que d'injecter une session : c'est l'écran que
      // tout le monde voit en premier, et le seul moyen de savoir qu'il marche encore.
      // Sélecteurs par TYPE de champ, jamais par classe : une refonte visuelle ne doit pas
      // faire rougir le smoke pour rien.
      await page.fill('input[type="email"]', EMAIL);
      await page.fill('input[type="password"]', PASS);
      await page.locator('button[type="submit"]').first().click();
      try {
        await page.waitForFunction(() => !location.hash.includes('/login'), { timeout: 25000 });
      } catch {
        await page.screenshot({ path: path.join(OUT, `login-echec-${width}.png`) });
        fail.push(`${width}px : la connexion n’aboutit pas (voir login-echec-${width}.png)`);
        await page.close();
        continue;
      }
      await page.waitForTimeout(1800);

      // ⚠️ L'app est-elle PEUPLÉE après la connexion ? Le compte de test a deux bilans et
      // un programme ; si l'accueil annonce le contraire, c'est que les données de fond
      // n'ont pas été chargées. Ce n'est pas théorique : ce contrôle a révélé que les sept
      // `fetch` de `useProgress` partaient AVANT le login (donc en anonyme, donc vides) et
      // que leur cache figeait ce vide jusqu'au rechargement — tout utilisateur arrivant
      // par l'écran de connexion voyait une app vide, sans XP ni séance.
      const corps = (await page.textContent('body')) ?? '';
      if (corps.includes('Aucune séance encore')) {
        fail.push(
          `${width}px : après connexion, l’accueil dit « Aucune séance encore » alors que ` +
            `le compte de test en a deux (données de fond non chargées)`,
        );
      }

      for (const e of ECRANS) {
        const avant = errors.length;
        // Mode hash (le routeur du projet) : on navigue par le fragment.
        await page.goto(`http://localhost:${PORT}/#${e.route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(OUT, `${e.nom}-${width}.png`), fullPage: true });
        const w = await verifier(page, width, e.nom, errors, avant);

        for (const onglet of e.onglets ?? []) {
          const av = errors.length;
          // ⚠️ Le projet mélange les onglets Quasar (`.q-tab`) et des boutons maison
          // (`.seg-b` sur l'Aventure) : un sélecteur qui ne connaît que l'un des deux ne
          // trouve rien — et c'est exactement ce qui s'est passé au premier jet, EN
          // SILENCE. Un onglet introuvable ÉCHOUE désormais : un parcours qui saute la
          // moitié des écrans sans le dire donne le vert sans la couverture.
          const cible = page.locator('.seg-b, .q-tab, [role="tab"]').filter({ hasText: onglet });
          if (!(await cible.count())) {
            fail.push(`${width}px ${e.nom} : onglet « ${onglet} » introuvable`);
            continue;
          }
          await cible.first().click();
          await page.waitForTimeout(1000);
          await page.screenshot({
            path: path.join(OUT, `${e.nom}-${onglet}-${width}.png`),
            fullPage: true,
          });
          await verifier(page, width, `${e.nom}/${onglet}`, errors, av);
        }
        console.log(`  ✓ ${e.nom} ${width}px — ${w}px`);
      }
      await page.close();
    }
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
