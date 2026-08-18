-- Parchemins de maîtrise 📜 : ressource produite par la Bibliothèque, dépensée pour
-- monter le NIVEAU des talents (ticket f93c219b — refonte talents/familiers en
-- infusion de tier + ressource de niveau).
alter table public.characters
  add column if not exists parchemins integer not null default 0;
