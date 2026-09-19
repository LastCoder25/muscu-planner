-- 0080_mana.sql — 💠 PIERRES DE MANA : la monnaie du gacha de champions.
--
-- Additive, comme toute migration de ce projet. Elle arrive AVANT le gacha, et c'est
-- l'ordre voulu (failles → pierres de mana → gacha) : le mana s'ACCUMULE en attendant son
-- puits. ⚠️ À ne pas confondre avec une devise MORTE, dont le puits a été RETIRÉ — ici il
-- arrive. Source actuelle : les mines de mana résiduel que laisse une faille qui a débordé.
alter table public.characters
  add column if not exists mana integer not null default 0;
