-- 0084 — Purge quotidienne des journaux techniques (v0.1034).
--
-- ⚠️ POURQUOI : `push-dispatch` tourne chaque minute (0062) et pg_cron garde une ligne par
-- exécution dans `cron.job_run_details`, sans jamais purger. Mesuré le 2026-09-22 : 16 469
-- lignes depuis le 10 septembre (~1 440 par jour, ~5,9 Mo) — la seule table qui grossissait
-- sans limite (~175 Mo par an à ce rythme). Les notifications déjà envoyées
-- (`scheduled_pushes.sent_at`) s'accumulaient de même.
--
-- ⚠️ Les notifications envoyées ne peuvent pas revenir : le client ne replanifie jamais une
-- échéance passée (`planPushes` ne garde que `sendAt > now`), donc les effacer est sûr.

delete from cron.job_run_details where end_time < now() - interval '3 days';
delete from public.scheduled_pushes
  where sent_at is not null and send_at < now() - interval '2 days';

select cron.schedule(
  'purge-journaux',
  '17 3 * * *',
  $$
    delete from cron.job_run_details where end_time < now() - interval '3 days';
    delete from public.scheduled_pushes
      where sent_at is not null and send_at < now() - interval '2 days';
  $$
);
