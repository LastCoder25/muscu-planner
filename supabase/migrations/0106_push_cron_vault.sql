-- 0106 — Le secret du cron de notifications sort de `cron.job` (audit du 2026-10-15).
-- Il était écrit EN CLAIR dans la commande de la tâche pg_cron, donc lisible par tout accès
-- SQL (dashboard, PAT, journaux). Il vit désormais dans Supabase Vault (secret nommé
-- `push_cron_secret`, posé hors dépôt avec le même secret `CRON_SECRET` côté edge function)
-- et la commande le lit à l'exécution.
-- Au passage, la fonction n'est plus appelée QUE s'il y a un message dû : sans ça elle
-- tournait 1 440 fois par jour pour rien. Un message périmé (> 6 h) est dû lui aussi, donc la
-- fonction passe toujours pour le clore.

select cron.unschedule('push-dispatch')
  where exists (select 1 from cron.job where jobname = 'push-dispatch');

select cron.schedule(
  'push-dispatch',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://wzbxbntqlheelgqswzew.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.scheduled_pushes where sent_at is null and send_at <= now()
  );
  $cron$
);
