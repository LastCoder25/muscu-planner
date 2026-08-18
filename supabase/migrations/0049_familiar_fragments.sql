-- Fragments de familiers 🧩 : XP d'infusion des familiers, obtenue dans les coffres du
-- Labyrinthe et en recyclant des familiers en double. Dépensée pour monter le TIER
-- (rang + qualité) d'un familier au choix (ticket f93c219b — refonte Labyrinthe/familiers).
alter table public.characters
  add column if not exists fragments integer not null default 0;
