-- 0031 — Bonus d'énergie de connexion quotidienne (streak + grâce).
-- La connexion donne un peu d'énergie pour jouer (le sport reste la source du
-- niveau/stats). Additif, RLS inchangée.
alter table characters
  add column if not exists login_streak int not null default 0,
  add column if not exists login_grace_used boolean not null default false,
  add column if not exists last_login_date date,
  add column if not exists login_energy int not null default 0;
