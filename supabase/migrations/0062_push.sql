-- 0062 — NOTIFICATIONS PUSH.
--
-- ⚠️ RÈGLE D'ARCHITECTURE (posée en v0.661, non négociable) : le CLIENT PLANIFIE, le
-- SERVEUR POSTE. On ne rejoue JAMAIS la simulation côté serveur — deux moteurs
-- finiraient par diverger, et le message annoncerait un siège que le rapport dément.
-- Ces deux tables ne portent donc que du TEXTE DÉJÀ COMPOSÉ et une heure d'envoi ; le
-- serveur n'a aucune connaissance du jeu.
--
-- Deux tables, et rien d'autre :
--
--  • `push_subscriptions` = les appareils abonnés. Un abonnement Web Push est un triplet
--    (endpoint, clé p256dh, secret auth) que le navigateur fabrique ; il est propre à un
--    appareil ET à un navigateur, donc un joueur peut en avoir plusieurs.
--
--  • `scheduled_pushes` = les messages à venir. `dedupe` porte l'idempotence : l'app
--    replanifie à CHAQUE ouverture, donc sans clé stable le joueur recevrait une alerte
--    par ouverture (cf. `planPushes`, testé).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  -- Un même endpoint ne doit exister qu'une fois : le navigateur peut re-souscrire au
  -- même sans nous prévenir, et on enverrait alors deux fois chaque message.
  unique (endpoint)
);

create table if not exists public.scheduled_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  send_at timestamptz not null,
  title text not null,
  body text not null,
  url text not null default '/',
  dedupe text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- ⚠️ L'IDEMPOTENCE VIT ICI, pas dans le client. Le client fait un upsert sur cette
  -- contrainte : replanifier le même événement met la ligne à jour au lieu d'en créer
  -- une seconde. Sans elle, chaque ouverture de l'app dupliquerait chaque alerte.
  unique (user_id, dedupe)
);

-- Le poussoir ne lit que les lignes DUES et non envoyées : cet index est son seul accès.
create index if not exists scheduled_pushes_due
  on public.scheduled_pushes (send_at)
  where sent_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.scheduled_pushes enable row level security;

-- RLS own-only, comme partout ailleurs. ⚠️ Le poussoir tourne en SERVICE ROLE et passe
-- donc à côté de ces policies — c'est voulu et c'est la seule façon pour lui de lire les
-- abonnements d'autrui ; aucun CLIENT ne le peut.
create policy push_subs_own on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy scheduled_own on public.scheduled_pushes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ⚠️ Un client ne peut donc écrire que POUR LUI-MÊME (`with check`). Le pire qu'il
-- puisse faire est de se notifier lui-même : le texte du message vient du client parce
-- que c'est lui qui connaît le jeu, et il n'atteint que son propre appareil.
