// 🔔 POUSSOIR DE NOTIFICATIONS — la SEULE dépendance serveur du projet.
//
// ⚠️ IL NE SAIT RIEN DU JEU, ET C'EST VOULU. Il lit des lignes déjà composées par le
// client (`planPushes`) et les poste. On ne rejoue JAMAIS la simulation ici : deux
// moteurs finiraient par diverger, et le message annoncerait un siège que le rapport
// dément. Ce fichier ne contient donc ni combat, ni butin, ni règle d'équilibrage —
// s'il en apparaît un jour, c'est que la règle a été enfreinte.
//
// Appelé par `pg_cron` (via `pg_net`) toutes les minutes.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

/** Au-delà, un message n'a plus de sens : on le clôt sans réveiller personne pour un
 *  événement d'il y a six heures. Doit rester d'accord avec `PUSH.staleAfterMs`. */
const STALE_MS = 6 * 3600_000;
/** On borne le lot : une panne de cron ne doit pas provoquer une avalanche au retour. */
const BATCH = 200;

const env = (k: string): string => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`variable manquante : ${k}`);
  return v;
};

Deno.serve(async (req) => {
  // ⚠️ `verify_jwt` est désactivé (pg_cron n'est pas un utilisateur), donc l'URL serait
  // publique : un secret partagé est le SEUL verrou. Sans lui, n'importe qui pourrait
  // déclencher l'envoi en boucle.
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) {
    return new Response('non', { status: 401 });
  }

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

  // Service role : c'est la seule façon de lire les abonnements d'AUTRUI, et aucun
  // client ne le peut (RLS own-only, migr. 0062).
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  const nowMs = Date.now();
  const { data: dues, error } = await db
    .from('scheduled_pushes')
    .select('id, user_id, title, body, url, send_at')
    .is('sent_at', null)
    .lte('send_at', new Date(nowMs).toISOString())
    .order('send_at', { ascending: true })
    .limit(BATCH);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!dues?.length) return Response.json({ envoyes: 0, perimes: 0 });

  // Les abonnements des seuls destinataires concernés.
  const uids = [...new Set(dues.map((d) => d.user_id))];
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', uids);
  const parUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const l = parUser.get(s.user_id) ?? [];
    l.push(s);
    parUser.set(s.user_id, l);
  }

  let envoyes = 0;
  let perimes = 0;
  const morts: string[] = [];
  const clos: string[] = [];

  for (const d of dues) {
    // Trop vieux : on clôt sans envoyer plutôt que de réveiller pour du révolu.
    if (nowMs - new Date(d.send_at).getTime() > STALE_MS) {
      perimes++;
      clos.push(d.id);
      continue;
    }
    const payload = JSON.stringify({ title: d.title, body: d.body, url: d.url });
    for (const s of parUser.get(d.user_id) ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        envoyes++;
      } catch (e) {
        // 404/410 = l'abonnement est mort (app désinstallée, permission retirée).
        // ⚠️ On le SUPPRIME : le garder ferait échouer chaque envoi suivant, pour
        // toujours, et gonflerait la table sans limite.
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) morts.push(s.id);
      }
    }
    clos.push(d.id);
  }

  if (clos.length) {
    await db.from('scheduled_pushes').update({ sent_at: new Date().toISOString() }).in('id', clos);
  }
  if (morts.length) await db.from('push_subscriptions').delete().in('id', morts);

  return Response.json({ envoyes, perimes, abonnementsMorts: morts.length });
});
