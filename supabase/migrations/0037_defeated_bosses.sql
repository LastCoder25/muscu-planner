-- 0037 — Boss de palier : mémorise les boss vaincus (déblocage séquentiel + badge).
-- Un boss est débloqué quand le précédent a été vaincu au moins une fois
-- (en plus du palier de niveau). Additif, RLS déjà en place sur characters.
alter table public.characters
  add column if not exists defeated_bosses text[] not null default '{}';
