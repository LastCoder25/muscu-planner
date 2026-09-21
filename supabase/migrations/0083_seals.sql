-- 0083 — 🔱 Sceaux d'ascension (v0.1014) : passer d'un rang au suivant demande des sceaux DE
-- CE RANG. Deux familles dans la même colonne : `champion` (gardiens de faille) et `gear`
-- (boss de palier, étape suivante), chacune par rang : { "champion": { "2": 3 }, "gear": {} }.
-- Additive, défaut vide : aucune ligne existante ne bouge.
alter table public.characters
  add column if not exists seals jsonb not null default '{"champion":{},"gear":{}}'::jsonb;
