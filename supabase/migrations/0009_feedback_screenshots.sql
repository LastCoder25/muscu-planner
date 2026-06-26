-- 0009_feedback_screenshots.sql — captures jointes aux tickets.
-- Bucket Storage public `feedback` + colonne tableau d'URLs sur feedback.

insert into storage.buckets (id, name, public)
values ('feedback', 'feedback', true)
on conflict (id) do nothing;

-- Upload réservé aux utilisateurs connectés (lecture via URL publique du bucket).
create policy "feedback_upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'feedback');

-- Le propriétaire peut remplacer/supprimer ses fichiers.
create policy "feedback_modify_own" on storage.objects
  for update to authenticated using (bucket_id = 'feedback' and owner = auth.uid());
create policy "feedback_delete_own" on storage.objects
  for delete to authenticated using (bucket_id = 'feedback' and owner = auth.uid());

alter table public.feedback add column if not exists screenshots text[];
