-- 0041 — clés d'expédition (donjons à étages explorés).
-- 1 clé = 1 expédition. Droppent sur les donjons linéaires / boss / faille.
alter table public.characters
  add column if not exists keys int not null default 0;
