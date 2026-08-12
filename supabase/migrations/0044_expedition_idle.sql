-- 0044 — Mode « Expédition » (idle temporisé) : état sur le personnage.
--  expedition      : expédition en cours (jsonb) ou null.
--  expedition_map  : état de la carte du monde (POI, seed, timestamps) ou null.
--  messages        : boîte à messages 📬 (rapports d'expédition), jsonb array.
alter table public.characters
  add column if not exists expedition jsonb,
  add column if not exists expedition_map jsonb,
  add column if not exists messages jsonb not null default '[]'::jsonb;
