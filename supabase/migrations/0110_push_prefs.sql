-- 0110 — 🔔 CHOISIR SES NOTIFICATIONS, TYPE PAR TYPE (2026-10-21, demandé par l'utilisateur).
--
-- `push_prefs.muted` = les sortes (`scheduled_pushes.kind`) que le joueur a coupées.
-- Un garde AVANT écriture sur `scheduled_pushes` écarte toute ligne d'une sorte coupée :
-- il couvre les deux sources d'un coup — ce que l'app programme (`planPushes`) ET ce que
-- les déclencheurs du boss entre amis posent pour un ami qui n'a pas l'app ouverte.
-- ⚠️ Le poussoir (edge function) n'est PAS touché : il n'envoie que ce qui existe.

create table if not exists public.push_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  muted text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.push_prefs enable row level security;

create policy push_prefs_own on public.push_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ⚠️ SECURITY DEFINER : un déclencheur du boss entre amis écrit la ligne d'un AUTRE joueur ;
-- sous RLS, il ne verrait pas ses préférences et laisserait passer une sorte coupée.
create or replace function public.scheduled_push_muted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ⚠️ Jamais sur une ligne marquée ENVOYÉE : le poussoir pose `sent_at` après l'envoi ;
  -- bloquer cette écriture laisserait la ligne « à envoyer », renvoyée chaque minute.
  if new.sent_at is null and exists (
    select 1 from public.push_prefs p
     where p.user_id = new.user_id and new.kind = any (p.muted)
  ) then
    return null; -- ligne écartée : jamais programmée, donc jamais envoyée
  end if;
  return new;
end;
$$;

revoke all on function public.scheduled_push_muted() from public, anon, authenticated;

drop trigger if exists scheduled_push_muted on public.scheduled_pushes;
create trigger scheduled_push_muted
  before insert or update on public.scheduled_pushes
  for each row execute function public.scheduled_push_muted();
