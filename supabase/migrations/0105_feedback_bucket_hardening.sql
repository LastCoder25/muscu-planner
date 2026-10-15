-- 0105 — Bucket `feedback` durci (audit du 2026-10-15).
-- Il était public, sans limite de taille ni de type, et tout compte connecté pouvait y
-- déposer n'importe quel fichier n'importe où (hébergement de HTML/SVG arbitraires sur le
-- domaine du projet, coût de stockage). Les tickets ne se saisissent plus que depuis le
-- Backlog (admin, v0.1077) : seul un admin envoie, des images de 5 Mo au plus, rangées sous
-- son identifiant. Le bucket reste public : les URLs des captures déjà jointes aux tickets
-- doivent continuer de s'afficher.

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  where id = 'feedback';

drop policy if exists "feedback_upload" on storage.objects;
create policy "feedback_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback'
    and public.is_admin()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
