-- 0058 — AMIS : demandes d'ami + lecture croisée des challenges et Défis 360.
--
-- Choix de conception (arbitrés avec l'utilisateur) :
--  • Découverte par PSEUDO EXACT uniquement — aucune table annuaire lisible, donc
--    aucune énumération des inscrits. Le pseudo Aventure (déjà unique) sert de
--    handle : `find_friend_by_pseudo` renvoie au plus UNE ligne.
--  • Un ami voit l'avancement ET le détail des séries → on autorise la lecture de
--    la LIGNE entière (le détail reps×poids y vit déjà), en SELECT seulement.
--  • L'autorisation est en BASE (RLS), jamais côté client : un non-ami ne peut rien
--    lire même en tapant l'API directement, et un ami ne peut rien écrire.

-- ── 1) Relations ────────────────────────────────────────────────────────────
create table if not exists public.friendships (
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- Une seule relation par PAIRE, quel que soit le sens : empêche A→B et B→A de
-- coexister (sinon deux demandes croisées créeraient deux lignes contradictoires).
create unique index if not exists friendships_pair_uniq on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);

alter table public.friendships enable row level security;

-- Lecture : uniquement les relations dont on est partie prenante.
drop policy if exists friendships_select_party on public.friendships;
create policy friendships_select_party on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Création : seulement EN TANT QUE DEMANDEUR, et toujours en 'pending' (on ne peut
-- pas s'auto-déclarer ami de quelqu'un).
drop policy if exists friendships_insert_requester on public.friendships;
create policy friendships_insert_requester on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

-- Réponse : seul le DESTINATAIRE accepte ou refuse.
drop policy if exists friendships_update_addressee on public.friendships;
create policy friendships_update_addressee on public.friendships for update to authenticated
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id and status in ('accepted', 'declined'));

-- Suppression : les deux (annuler sa demande / retirer un ami).
drop policy if exists friendships_delete_party on public.friendships;
create policy friendships_delete_party on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- ── 2) Test d'amitié, utilisé par les policies de lecture ───────────────────
-- SECURITY DEFINER : évite de ré-évaluer la RLS de `friendships` pour CHAQUE ligne
-- de challenge lue. `search_path` figé = pas de détournement par un schéma tiers.
create or replace function public.are_friends(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- ── 3) Lecture croisée entre amis (SELECT uniquement) ───────────────────────
-- Les policies permissives se CUMULENT en OR : la lecture devient « à moi OU à un
-- ami », tandis que les écritures restent régies par les policies « own » existantes.
drop policy if exists challenges_read_friends on public.challenges;
create policy challenges_read_friends on public.challenges for select to authenticated
  using (public.are_friends(auth.uid(), user_id));

drop policy if exists combo_read_friends on public.combo_challenges;
create policy combo_read_friends on public.combo_challenges for select to authenticated
  using (public.are_friends(auth.uid(), user_id));

-- ── 4) Découverte : pseudo EXACT, au plus une ligne ─────────────────────────
create or replace function public.find_friend_by_pseudo(p text)
  returns table (user_id uuid, pseudo text)
  language sql stable security definer set search_path = public as $$
  select c.user_id, c.pseudo
  from public.characters c
  where lower(c.pseudo) = lower(btrim(p))
    and c.user_id <> auth.uid()
  limit 1;
$$;

-- Pseudos des personnes avec qui on a une relation (pour afficher les demandes et
-- la liste d'amis sans exposer `characters`).
create or replace function public.friend_pseudos()
  returns table (user_id uuid, pseudo text)
  language sql stable security definer set search_path = public as $$
  select c.user_id, c.pseudo
  from public.characters c
  where c.user_id in (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where auth.uid() in (f.requester_id, f.addressee_id)
  );
$$;

revoke all on function public.find_friend_by_pseudo(text) from public, anon;
revoke all on function public.friend_pseudos() from public, anon;
grant execute on function public.find_friend_by_pseudo(text) to authenticated;
grant execute on function public.friend_pseudos() to authenticated;
