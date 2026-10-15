-- 🐉 LES BOSS ENTRE AMIS ONT UN NOM (2026-10-15, demandé par l'utilisateur : « des noms au
-- boss plutôt que l'appeler le boss des pompes, c'est pas très sexy »).
--
-- ⚠️ LE NOM VIT EN BASE : les notifications sont écrites ici (déclencheurs), et tout le groupe
-- doit lire le MÊME nom. Il est tiré une fois, à la création (« prénom + épithète »), puis
-- figé. Les épithètes sont ÉPICÈNES : la créature (dragon, kraken…) est tirée ailleurs, par
-- l'app, et le nom doit aller avec n'importe laquelle.
-- L'exercice reste dit à côté (sous-titre à l'écran, entre parenthèses dans les messages) :
-- c'est lui qui dit QUOI faire.

alter table public.friend_bosses add column if not exists name text;

create or replace function public.fboss_pick_name() returns text
  language sql volatile set search_path = public as $$
  select (array['Gorgath', 'Vorkan', 'Skarnax', 'Mordruk', 'Zhalkor', 'Brakkus', 'Ulgrom',
                'Nyxara', 'Kragmar', 'Vexol', 'Draugor', 'Thrakkon', 'Malgaroth', 'Xerath',
                'Ozrek', 'Grimbald'])[1 + floor(random() * 16)::int]
      || ' '
      || (array['l’Insatiable', 'l’Implacable', 'l’Indomptable', 'Brise-Os',
                'Mange-Montagnes', 'aux Mille Crocs', 'Cœur-de-Cendre', 'du Gouffre Noir',
                'Fléau des Salles', 'Ronge-Muscles', 'l’Éternel', 'Croc-de-Fer',
                'Œil-de-Braise', 'Sans-Pitié', 'Mange-Sueur', 'Brise-Serments'])[1 + floor(random() * 16)::int];
$$;

revoke all on function public.fboss_pick_name() from public, anon, authenticated;

create or replace function public.fboss_name_on_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  new.name := coalesce(nullif(new.name, ''), public.fboss_pick_name());
  return new;
end;
$$;

drop trigger if exists fboss_name_on_insert on public.friend_bosses;
create trigger fboss_name_on_insert before insert on public.friend_bosses
  for each row execute function public.fboss_name_on_insert();

-- Les boss déjà lancés reçoivent le leur.
update public.friend_bosses set name = public.fboss_pick_name() where name is null;

-- ── Les notifications disent son NOM ─────────────────────────────────────────────────────
-- (dernières définitions reprises telles quelles, seul le texte change)

create or replace function public.fboss_push_hit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  b public.friend_bosses;
  v_pseudo text;
  v_dpu integer := public.fboss_damage_per_unit();
  v_after bigint;
  v_left integer;
begin
  select * into b from public.friend_bosses where id = new.boss_id;
  if b.id is null or b.hp_total <= 0 then return new; end if;
  -- ⚠️ Une frappe tout en SURPLUS n'entame rien : pas de message « il reste X % ».
  if new.units - new.surplus <= 0 then return new; end if;
  -- ⚠️ `fboss_hit` INSÈRE la frappe AVANT de mettre à jour les PV du boss : on ajoute la
  -- frappe — ses reps de DÉGÂTS seulement — pour dire le vrai restant.
  v_after := b.damage::bigint + (new.units - new.surplus)::bigint * v_dpu;
  -- ⚠️ LE COUP FATAL NE S'ANNONCE PAS ICI : `fboss_push_down` s'en charge.
  if v_after >= b.hp_total then return new; end if;
  v_left := greatest(0, round(100.0 * (b.hp_total - v_after) / b.hp_total))::integer;
  select pseudo into v_pseudo from public.characters where user_id = new.user_id;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    select m.user_id, 'fboss_hit', now(),
           '⚔️ ' || coalesce(v_pseudo, 'Un ami') || ' a frappé ' || coalesce(b.name, 'le boss'),
           'Il lui reste ' || v_left || ' % de vie (' || coalesce(b.exercise_name, 'reps') || ').',
           '/boss-amis',
           -- ⚠️ AU PLUS UNE PAR AMI ET PAR HEURE (les frappes arrivent en rafales).
           'fboss-hit:' || new.boss_id || ':' || new.user_id || ':'
             || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24')
    from public.friend_boss_members m
    where m.boss_id = new.boss_id and m.status = 'accepted' and m.user_id <> new.user_id
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

create or replace function public.fboss_push_invite() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_owner text;
  v_name text;
  v_exo text;
  v_family text;
  v_tier text;
  v_label text;
begin
  if new.status <> 'invited' then return new; end if;
  select c.pseudo, b.name, b.exercise_name, b.family, b.tier
    into v_owner, v_name, v_exo, v_family, v_tier
    from public.friend_bosses b join public.characters c on c.user_id = b.owner_id
    where b.id = new.boss_id;
  v_label := case v_tier
    when 'echauffement' then '🌱 Échauffement'
    when 'costaud' then '🔥 Costaud'
    when 'brutal' then '⚡ Brutal'
    when 'inhumain' then '💀 Inhumain'
    else '💪 Sérieux'
  end;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    values (new.user_id, 'fboss_invite', now(),
            '⚔️ ' || coalesce(v_owner, 'Un ami') || ' demande de l’aide contre '
              || coalesce(v_name, 'un boss'),
            v_label || ' en ' || coalesce(v_exo, 'reps') || ' : ta part = '
              || public.fboss_share_tier(v_family, v_tier)
              || case when v_family = 'core' then ' s' else ' reps' end
              || ' sur 7 jours. Tu as 24 h pour répondre.',
            '/boss-amis', 'fboss-invite:' || new.boss_id)
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

create or replace function public.fboss_push_joined() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_name text;
  v_pseudo text;
begin
  -- Seulement le passage À « accepted » (un refus ne s'annonce pas).
  if new.status <> 'accepted' or old.status = 'accepted' then return new; end if;
  select owner_id, name into v_owner, v_name from public.friend_bosses where id = new.boss_id;
  if v_owner is null or v_owner = new.user_id then return new; end if;
  select pseudo into v_pseudo from public.characters where user_id = new.user_id;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    values (v_owner, 'fboss_joined', now(),
            '🤝 ' || coalesce(v_pseudo, 'Un ami') || ' a rejoint ton combat',
            'Contre ' || coalesce(v_name, 'ton boss') || ' — sa part de vie vient s’ajouter.',
            '/boss-amis',
            'fboss-joined:' || new.boss_id || ':' || new.user_id)
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

create or replace function public.fboss_push_down() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.defeated_at is not null or new.defeated_at is null then return new; end if;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    select m.user_id, 'fboss_down', now(), '🏆 ' || coalesce(new.name, 'Le boss') || ' est tombé',
           'Ton groupe l’a abattu. Ton coffre t’attend.', '/boss-amis', 'fboss-down:' || new.id
    from public.friend_boss_members m
    where m.boss_id = new.id and m.status = 'accepted'
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

create or replace function public.fboss_schedule_end(p_boss uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  b public.friend_bosses%rowtype;
  v_end timestamptz;
  v_at timestamptz;
  v_left text;
begin
  delete from public.scheduled_pushes
    where dedupe = 'fboss-end:' || p_boss and sent_at is null;
  select * into b from public.friend_bosses where id = p_boss;
  if not found or b.defeated_at is not null then return; end if;
  v_end := least(coalesce(b.start_at, b.created_at + interval '24 hours'),
                 b.created_at + interval '24 hours') + interval '7 days';
  -- Combat fini : plus rien à annoncer.
  if v_end <= now() then return; end if;
  -- Déjà dans les dernières heures : tout de suite, avec le temps qui reste vraiment. Une
  -- seule fois : une alerte déjà envoyée n'est jamais effacée ni renvoyée.
  v_at := greatest(v_end - interval '6 hours', now());
  v_left := case
    when v_at > now() then '6 h'
    when v_end - now() >= interval '1 hour'
      then floor(extract(epoch from v_end - now()) / 3600)::int || ' h'
    else 'moins d’1 h'
  end;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    select m.user_id, 'fboss_end', v_at, '⏳ Dernières heures contre ' || coalesce(b.name, 'le boss'),
           'Il s’échappe dans ' || v_left || ' (' || b.exercise_name || '). Viens frapper avant la fin.',
           '/boss-amis', 'fboss-end:' || p_boss
    from public.friend_boss_members m
    where m.boss_id = p_boss and m.status = 'accepted'
    on conflict (user_id, dedupe) do nothing;
end;
$$;
