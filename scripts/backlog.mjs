// backlog.mjs — lister/traiter les tickets de retour (table feedback).
// Lecture/màj globale via service_role (récupérée par la Management API + .supabase-token).
// Usage :
//   node scripts/backlog.mjs            liste les tickets "open"
//   node scripts/backlog.mjs --all      inclut in_progress et done
//   node scripts/backlog.mjs --wip <id>  passe un ticket en in_progress
//   node scripts/backlog.mjs --done <id> passe un ticket en done
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env', 'utf8');
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim();
const ref = url.match(/https:\/\/([^.]+)\./)[1];
const token = readFileSync('.supabase-token', 'utf8').trim();

const serviceKey = async () => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw new Error('api-keys: HTTP ' + r.status);
  return (await r.json()).find((k) => k.name === 'service_role').api_key;
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? true) : null;
};

const sb = createClient(url, await serviceKey(), { auth: { persistSession: false } });

async function setStatus(id, status) {
  const { error } = await sb.from('feedback').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
  console.log(`Ticket ${id} → ${status}`);
}

const wip = flag('--wip');
const done = flag('--done');
if (typeof wip === 'string') { await setStatus(wip, 'in_progress'); process.exit(0); }
if (typeof done === 'string') { await setStatus(done, 'done'); process.exit(0); }

const all = args.includes('--all');
let q = sb.from('feedback').select('id, kind, message, page, app_version, status, created_at').order('created_at', { ascending: false });
if (!all) q = q.eq('status', 'open');
const { data, error } = await q;
if (error) { console.error(error.message); process.exit(1); }

if (!data.length) { console.log(all ? 'Aucun ticket.' : 'Aucun ticket ouvert.'); process.exit(0); }
console.log(`${data.length} ticket(s)${all ? '' : ' ouvert(s)'} :\n`);
for (const t of data) {
  const date = t.created_at.slice(0, 16).replace('T', ' ');
  console.log(`[${t.status}] ${t.kind.toUpperCase()} · ${date} · v${t.app_version ?? '?'} · ${t.page ?? '-'}`);
  console.log(`  ${t.message}`);
  console.log(`  id: ${t.id}\n`);
}
