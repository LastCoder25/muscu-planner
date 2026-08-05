-- 0029_world_boss.sql — RPG Phase 4 : boss communautaire hebdomadaire (partagé).
-- Première feature MULTI-UTILISATEUR : les HP sont décrémentés de façon ATOMIQUE
-- via des fonctions SECURITY DEFINER ; les clients ne peuvent JAMAIS écrire les HP
-- directement (aucune policy insert/update → seules les fonctions y touchent).

create table if not exists public.world_bosses (
  id text primary key, -- clé de semaine, ex. 'boss-2026-08-03'
  name text not null,
  emoji text not null,
  hp_total integer not null,
  hp_remaining integer not null,
  week_start timestamptz not null,
  week_end timestamptz not null,
  status text not null default 'active', -- 'active' | 'defeated'
  created_at timestamptz not null default now()
);

create table if not exists public.boss_contributions (
  boss_id text not null references public.world_bosses (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  pseudo text not null, -- dénormalisé (la RLS de characters est own-only)
  damage integer not null default 0,
  claimed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (boss_id, user_id)
);
create index if not exists boss_contributions_rank_idx
  on public.boss_contributions (boss_id, damage desc);

alter table public.world_bosses enable row level security;
alter table public.boss_contributions enable row level security;

-- Lecture ouverte à tout utilisateur connecté (boss + classement) ; pas d'écriture directe.
create policy world_bosses_select on public.world_bosses for select to authenticated using (true);
create policy boss_contributions_select on public.boss_contributions for select to authenticated using (true);

-- Crée le boss de la semaine s'il n'existe pas (spec déterministe côté client → idempotent).
create or replace function public.ensure_world_boss(
  p_id text, p_name text, p_emoji text, p_hp integer, p_start timestamptz, p_end timestamptz
) returns void
language sql security definer set search_path = public as $$
  insert into public.world_bosses (id, name, emoji, hp_total, hp_remaining, week_start, week_end)
  values (p_id, p_name, p_emoji, p_hp, p_hp, p_start, p_end)
  on conflict (id) do nothing;
$$;

-- Frappe le boss : décrémente les HP (borné à 0) et cumule la contribution du joueur.
create or replace function public.hit_world_boss(p_id text, p_damage integer, p_pseudo text)
returns json
language plpgsql security definer set search_path = public as $$
declare v_remaining integer;
begin
  update public.world_bosses
    set hp_remaining = greatest(0, hp_remaining - greatest(0, p_damage))
    where id = p_id and status = 'active' and now() < week_end
    returning hp_remaining into v_remaining;
  if v_remaining is null then
    return json_build_object('ok', false);
  end if;
  insert into public.boss_contributions (boss_id, user_id, pseudo, damage)
    values (p_id, auth.uid(), p_pseudo, greatest(0, p_damage))
    on conflict (boss_id, user_id) do update
      set damage = public.boss_contributions.damage + greatest(0, p_damage),
          pseudo = excluded.pseudo, updated_at = now();
  if v_remaining <= 0 then
    update public.world_bosses set status = 'defeated' where id = p_id and status = 'active';
  end if;
  return json_build_object('ok', true, 'hp_remaining', v_remaining);
end;
$$;

-- Récompense (une fois) si le boss est vaincu : or + poussière, bonus au top contributeur.
create or replace function public.claim_boss_reward(p_id text)
returns json
language plpgsql security definer set search_path = public as $$
declare v_status text; v_total integer; v_dmg integer; v_top uuid; v_is_top boolean;
        v_gold integer; v_dust integer;
begin
  select status, hp_total into v_status, v_total from public.world_bosses where id = p_id;
  if v_status is distinct from 'defeated' then
    return json_build_object('ok', false, 'reason', 'not_defeated');
  end if;
  select damage into v_dmg from public.boss_contributions
    where boss_id = p_id and user_id = auth.uid() and not claimed;
  if v_dmg is null then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  select user_id into v_top from public.boss_contributions
    where boss_id = p_id order by damage desc limit 1;
  v_is_top := (v_top = auth.uid());
  v_gold := 60 + round(120.0 * v_dmg / nullif(v_total, 0)) + (case when v_is_top then 100 else 0 end);
  v_dust := 15 + (case when v_is_top then 15 else 0 end);
  update public.boss_contributions set claimed = true, updated_at = now()
    where boss_id = p_id and user_id = auth.uid();
  update public.characters set gold = gold + v_gold, dust = dust + v_dust, updated_at = now()
    where user_id = auth.uid();
  return json_build_object('ok', true, 'gold', v_gold, 'dust', v_dust, 'top', v_is_top);
end;
$$;

grant execute on function public.ensure_world_boss(text, text, text, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.hit_world_boss(text, integer, text) to authenticated;
grant execute on function public.claim_boss_reward(text) to authenticated;
