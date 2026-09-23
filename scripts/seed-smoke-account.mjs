// seed-smoke-account.mjs — (re)pose le compte de test que `npm run smoke` utilise.
//
// Sans compte, le smoke s'arrête à l'écran de connexion : c'est le point aveugle que ce
// projet documente depuis longtemps, et c'est là que sont nés tous les défauts de rendu
// qu'il a fallu que l'utilisateur signale lui-même. Avec un compte, il parcourt les écrans
// de sport ET de jeu, à 344 et 390 px — dès sa première exécution il a trouvé un
// débordement sur `/program` que rien d'autre ne pouvait voir.
//
// ⚠️ AUCUN IDENTIFIANT DANS LE DÉPÔT. Le script lit `SMOKE_EMAIL` / `SMOKE_PASSWORD` dans
// `.env` (gitignoré) ; s'ils manquent, il en génère et les y AJOUTE. `.env.example`, qui
// est versionné, ne porte que des clés vides.
//
// ⚠️ IL ÉCRIT DANS LA BASE DE PRODUCTION, et c'est assumé : les RLS sont own-only, donc ce
// compte ne voit et ne touche que ses propres lignes. Le smoke ne va d'ailleurs jamais sur
// `/leaderboard`, seule page qui PUBLIE quelque chose de visible par les autres joueurs.
//
// ⚠️ IL PASSE PAR LE JWT DU COMPTE, jamais en service role : si une policy refuse une
// écriture, on veut l'apprendre ici plutôt qu'en production.
//
// Les données (`smoke-seed.json`) ont été GÉNÉRÉES par le code du projet — `formToProfile`,
// `deriveLevelConfig`, `buildProgram` — puis figées. Elles sont donc conformes au contrat
// par construction, ce qu'un JSON écrit à la main n'aurait pas été. Les deux bilans portent
// la MÊME séance à une semaine d'écart, avec un exercice qui monte et un qui stagne : c'est
// le minimum pour que le bilan ait une comparaison, des verdicts et des records à montrer.
//
// Usage : node scripts/seed-smoke-account.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = path.join(ROOT, '.env');

function lireEnv() {
  const out = {};
  for (const l of fs.readFileSync(ENV, 'utf8').split('\n')) {
    const i = l.indexOf('=');
    if (i > 0 && !l.trim().startsWith('#')) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return out;
}

const env = lireEnv();
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_ANON_KEY;
if (!URL_ || !KEY) {
  console.error('✗ SUPABASE_URL / SUPABASE_ANON_KEY manquants dans .env');
  process.exit(1);
}

let EMAIL = env.SMOKE_EMAIL;
let PASS = env.SMOKE_PASSWORD;
if (!EMAIL || !PASS) {
  EMAIL = 'smoke-ui@muscuplanner.test';
  // Mot de passe tiré au hasard : personne ne doit pouvoir le deviner depuis le dépôt.
  PASS = 'Sm' + Math.random().toString(36).slice(2, 12) + '!Ui';
  fs.appendFileSync(
    ENV,
    `\n# Compte de test du smoke UI — ajouté par scripts/seed-smoke-account.mjs.\n` +
      `SMOKE_EMAIL=${EMAIL}\nSMOKE_PASSWORD=${PASS}\n`,
  );
  console.log('· identifiants générés et ajoutés à .env');
}

async function auth(route, body) {
  const r = await fetch(`${URL_}/auth/v1/${route}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

// Connexion, puis création si le compte n'existe pas encore. ⚠️ Dans cet ordre : le projet
// a `mailer_autoconfirm = true`, donc un signup rend une session immédiate — mais relancer
// un signup sur un compte existant échoue, alors qu'une simple connexion suffit.
let s = await auth('token?grant_type=password', { email: EMAIL, password: PASS });
if (s.status !== 200) {
  const c = await auth('signup', { email: EMAIL, password: PASS });
  if (c.status !== 200) {
    console.error('✗ création refusée :', JSON.stringify(c.json).slice(0, 200));
    process.exit(1);
  }
  s = await auth('token?grant_type=password', { email: EMAIL, password: PASS });
}
if (s.status !== 200) {
  console.error('✗ connexion impossible après création');
  process.exit(1);
}
const uid = s.json.user.id;
const H = {
  apikey: KEY,
  Authorization: `Bearer ${s.json.access_token}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
};

async function rest(table, rows, method = 'POST', qs = '') {
  const r = await fetch(`${URL_}/rest/v1/${table}${qs}`, {
    method,
    headers: H,
    body: rows ? JSON.stringify(rows) : undefined,
  });
  const t = await r.text();
  if (!r.ok) {
    console.error(`✗ ${method} ${table} → ${r.status} ${t.slice(0, 300)}`);
    process.exit(1);
  }
  return t ? JSON.parse(t) : [];
}

const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'smoke-seed.json'), 'utf8'));
const p = seed.profile;

await rest('profiles', {
  user_id: uid,
  level: p.experience.level,
  objective: p.objective,
  sessions_per_week: p.availability.sessions_per_week,
  units: p.preferences.units,
  payload: { ...p, user_id: uid },
  level_config: seed.cfg,
});

// On repart d'une table rase : relancer le script ne doit pas empiler des doublons.
await rest('sessions', null, 'DELETE', `?user_id=eq.${uid}`);
const ins = await rest(
  'sessions',
  seed.sessions.map((x) => ({
    user_id: uid,
    name: x.name,
    source: 'engine',
    split: x.split ?? null,
    objective: p.objective,
    level: p.experience.level,
    payload: x,
  })),
);

// ⚠️ L'id de la séance en base n'est PAS celui du payload : un bilan doit pointer sur la
// LIGNE, sinon « la même séance » ne se retrouve jamais et la comparaison reste muette —
// donc l'écran qu'on veut justement voir ne montrerait rien.
const sid = ins[0]?.id;
await rest('session_logs', null, 'DELETE', `?user_id=eq.${uid}`);
// Les dates du fichier sont figées ; on les ramène à « il y a 9 et 2 jours » pour que les
// écrans qui raisonnent en semaines (stats, agenda) aient toujours quelque chose à dire.
const jours = (n) => new Date(Date.now() - n * 86400000).toISOString();
await rest(
  'session_logs',
  seed.logs.map((l, i) => {
    const at = jours(i === 0 ? 9 : 2);
    return {
      user_id: uid,
      session_id: sid,
      performed_at: at,
      duration_min: l.log.duration_min,
      payload: { ...l.log, session_id: sid, performed_at: at },
    };
  }),
);

// Sans personnage, l'Aventure s'ouvre sur la création de pseudo et l'écran le plus dense du
// projet reste invisible. Les monnaies sont là pour que ses panneaux ne soient pas vides.
await rest('characters', {
  user_id: uid,
  pseudo: 'SmokeUI',
  gold: 90000,
  scrap: 400,
  keys: 3,
  summon_stones: 12,
  mana: 660,
});

console.log(`✓ compte de smoke prêt — ${EMAIL}`);
console.log('  Lance maintenant : npm run build && npm run smoke');
