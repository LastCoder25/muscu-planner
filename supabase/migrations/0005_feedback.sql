-- 0005_feedback.sql — backlog : tickets de retour remontés depuis l'app.
-- Donnée d'app (hors contrat JSON). Traitement global via service_role (script).

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'other' check (kind in ('bug', 'idea', 'other')),
  message text not null,
  page text,
  app_version text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_status_idx on public.feedback(status, created_at desc);

create trigger trg_feedback_updated before update on public.feedback
  for each row execute function public.set_updated_at();

alter table public.feedback enable row level security;

-- Chacun gère ses propres tickets ; le traitement global passe par service_role.
create policy "feedback_own" on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
