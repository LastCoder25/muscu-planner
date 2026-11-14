-- 0117 — AMIS : l'admin voit tous les inscrits (même sans perso de jeu) et un ami sans
-- pseudo s'affiche sous son prénom.
--
-- Décision de l'utilisateur : « mon compte peut voir tous les utilisateurs et les ajouter
-- en ami, même sans perso ; pseudo par défaut = prénom ». Cela déroge à 0058 (« aucun
-- annuaire lisible ») pour UN SEUL compte : `is_admin()` (0014). Pour tous les autres, la
-- découverte reste le pseudo exact.
--  • Minimisation : on ne renvoie NI e-mail NI date de naissance — seulement le prénom
--    saisi dans le profil, le pseudo éventuel et la date d'inscription.
--  • Un client ne peut écrire que SA demande (policy friendships_insert_requester,
--    inchangée) : l'admin ne force aucune amitié, la personne doit accepter.

-- ── 1) Pseudos de mes relations : pseudo de jeu, sinon prénom du profil ─────────────
create or replace function public.friend_pseudos()
  returns table (user_id uuid, pseudo text)
  language sql stable security definer set search_path = public as $$
  select o.id,
         coalesce(
           nullif(btrim(c.pseudo), ''),
           nullif(btrim(p.payload -> 'identity' ->> 'name'), ''),
           'Joueur'
         )
  from (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as id
    from public.friendships f
    where auth.uid() in (f.requester_id, f.addressee_id)
  ) o
  left join public.characters c on c.user_id = o.id
  left join public.profiles p on p.user_id = o.id;
$$;

-- ── 2) Annuaire complet, ADMIN seulement ────────────────────────────────────────────
-- Vide pour tout autre compte (pas d'erreur : rien à apprendre sur le rôle de l'appelant).
create or replace function public.admin_list_users()
  returns table (user_id uuid, name text, pseudo text, has_character boolean, created_at timestamptz)
  language sql stable security definer set search_path = public as $$
  select u.id,
         coalesce(nullif(btrim(p.payload -> 'identity' ->> 'name'), ''), 'Joueur'),
         nullif(btrim(c.pseudo), ''),
         c.user_id is not null,
         u.created_at
  from auth.users u
  left join public.characters c on c.user_id = u.id
  left join public.profiles p on p.user_id = u.id
  where public.is_admin()
    and u.id <> auth.uid()
  order by u.created_at desc;
$$;

revoke all on function public.friend_pseudos() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.friend_pseudos() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
