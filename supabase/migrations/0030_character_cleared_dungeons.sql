-- 0030 — Donjons réussis (progression séquentielle).
-- Un donjon n'est déblocable qu'après avoir nettoyé le précédent. On mémorise
-- les ids des donjons déjà nettoyés sur le personnage. Additif, RLS inchangée.
alter table characters
  add column if not exists cleared_dungeons text[] not null default '{}';
