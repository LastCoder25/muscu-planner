-- 0014_feedback_admin.sql — restreint la gestion du backlog aux admins.
-- Avant : 0007 laissait TOUT utilisateur connecté lire/modifier tous les tickets.
-- Après : seuls les admins (email whitelisté) lisent/modifient l'ensemble ;
-- chaque utilisateur garde ses propres tickets via la policy feedback_own (0005),
-- ce qui laisse le FAB de feedback fonctionner pour tout le monde.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') in ('martinez.alban25@gmail.com');
$$;

drop policy if exists "feedback_read_all" on public.feedback;
drop policy if exists "feedback_update_all" on public.feedback;

create policy "feedback_read_admin" on public.feedback
  for select to authenticated using (public.is_admin());

create policy "feedback_update_admin" on public.feedback
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
