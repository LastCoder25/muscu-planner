-- 🎒 Consommables d'expédition (src/lib/supplies.ts) : le stock du joueur, un compte par
-- consommable ({ "rations": 3, "potion": 1, … }). Gagnés en butin de voyage, emportés au
-- départ d'un groupe, le sceau de brèche posé sur une faille. Additive : l'ancien client
-- l'ignore ; RLS inchangée (la ligne `characters` est own-only).
alter table public.characters add column if not exists supplies jsonb not null default '{}'::jsonb;
