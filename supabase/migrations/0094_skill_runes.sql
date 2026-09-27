-- 🔮 RUNES DE COMPÉTENCE (v0.1239) : le stock de runes non posées (par couleur), la rune
-- tirée qui attend la décision « remplacer ou garder », et la version de la compensation
-- versée aux champions d'avant les runes. Les compétences POSÉES vivent sur chaque champion
-- (`characters.adventurers[].skills`, jsonb déjà en place) : aucune autre colonne.
alter table public.characters add column if not exists runes jsonb not null default '{}'::jsonb;
