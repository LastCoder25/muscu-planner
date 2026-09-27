-- 🗓️ QUÊTES DE LA SEMAINE (v0.1209) : le lundi (YYYY-MM-DD) de la dernière semaine dont les
-- 2 tickets 🎟️ ont été récupérés. Les quêtes elles-mêmes ne sont PAS stockées : elles se
-- dérivent de l'historique de sport (`src/lib/weeklyQuests.ts`). Cette marque est la seule
-- garantie qu'une semaine ne paie qu'une fois — écrite dans la MÊME requête que les tickets,
-- avec la condition dans le `where` (deux onglets ne créditent pas deux fois).
alter table public.characters add column if not exists quest_week text;
