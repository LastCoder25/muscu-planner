-- 0053 — Poussière d'encre (rang des talents). Symétrique de la poussière d'âme
-- (colonne `fragments`, rang des familiers) : recyclage de talents + drops boss/donjon
-- l'alimentent, l'infusion de rang des talents la dépense (plafonnée par le Scriptorium).
alter table public.characters
  add column if not exists ink_dust integer not null default 0;
