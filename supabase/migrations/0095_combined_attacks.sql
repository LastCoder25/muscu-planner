-- ⚔️🧭 ATTAQUES COMBINÉES (v0.1300) : les attaques dont certains groupes attendent encore
-- leur départ (chacun part à son heure pour arriver ensemble). Une fois le dernier groupe
-- parti, l'attaque devient des voyages ordinaires (`parties` / `expedition`) et quitte
-- cette colonne. Additif.
alter table public.characters add column if not exists attacks jsonb;
