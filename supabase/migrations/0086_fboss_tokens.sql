-- 0086 — BOSS ENTRE AMIS : les JETONS 🎫 remplacent « un seul boss » et le délai de 48 h
-- (v0.1066).
--
-- Demandé par l'utilisateur : « faire un boss fort avec des amis et un boss faible avec
-- d'autres », puis « le même système que les challenges avec des jetons », « qu'on puisse
-- farmer les jetons… avec le sport ».
--
-- • On LANCE et on REJOINT un boss en dépensant des jetons, au prix de son cran (1, 1, 2, 3, 4).
--   ⚠️ Rejoindre coûte AUTANT que lancer : à 1 jeton, rejoindre des Inhumains donnait jusqu'à
--   +110 % d'or par semaine (mesuré). Au même prix, le rendement par jeton est le même pour tous.
-- • Les jetons se GAGNENT par le sport, côté client (au plus 2 par jour selon l'XP du jour ;
--   le serveur ne connaît pas le jeu), et se stockent dans `characters.boss_tokens` (0..6).
--   Sur l'honneur, comme toutes les saisies sportives.
-- • Plus de « un seul boss en cours » : plusieurs boss à la fois, mais UN SEUL par exercice —
--   sinon une même série frapperait deux boss (`fboss_hit` vise déjà un boss précis).
-- • Plus de délai de 48 h pour le lanceur : les jetons bornent le rythme, et la rotation des
--   lanceurs (A, puis B, puis C) coûte des jetons à chacun.
--
-- ⚠️ `fboss_token_cost` doit rester égal à `BOSS_TIERS[].tokens` (src/lib/friendBoss.ts) — un
-- test lit cette migration. Les deux fonctions sont reprises de leur DERNIÈRE définition (0078).

-- Tout le monde démarre avec 2 jetons : de quoi lancer ou rejoindre un boss tout de suite.
alter table public.characters
  add column if not exists boss_tokens integer not null default 2
    check (boss_tokens between 0 and 6),
  add column if not exists boss_token_state jsonb;

create or replace function public.fboss_token_cost(p_tier text) returns integer
  language sql immutable as $$
  select case p_tier
    when 'echauffement' then 1
    when 'serieux' then 1
    when 'costaud' then 2
    when 'brutal' then 3
    when 'inhumain' then 4
    else 1
  end;
$$;

-- Un boss EN COURS (recrutement ou combat) sur cet exercice, que j'ai lancé ou rejoint.
create or replace function public.fboss_same_exercise(p_uid uuid, p_exercise_id text)
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.friend_boss_members m
    join public.friend_bosses b on b.id = m.boss_id
    where m.user_id = p_uid and m.status = 'accepted'
      and b.exercise_id = p_exercise_id and now() < public.fboss_ended(b)
  );
$$;

-- ── Déclarer : payer le cran, un seul boss par exercice ──────────────────────────
create or replace function public.fboss_declare(
  p_exercise_id text,
  p_exercise_name text,
  p_family text,
  p_rep_weight numeric,
  p_invitees uuid[],
  p_tier text default 'serieux'
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pseudo text;
  v_buildings jsonb;
  v_tokens integer;
  v_cost integer := public.fboss_token_cost(p_tier);
  v_invitees uuid[] := coalesce(p_invitees, '{}');
  v_id uuid;
  v_friend uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select pseudo, buildings, boss_tokens into v_pseudo, v_buildings, v_tokens
    from public.characters where user_id = v_uid for update;
  if v_pseudo is null then raise exception 'no_character'; end if;
  if not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(v_buildings) = 'array'
                                            then v_buildings else '[]'::jsonb end) e
    where e->>'typeId' = 'boss_altar' and coalesce((e->>'level')::numeric, 0) > 0
  ) then raise exception 'no_altar'; end if;
  if public.fboss_share(p_family) is null then raise exception 'bad_family'; end if;
  -- ⚠️ Un cran inconnu est REFUSÉ, jamais replié en silence sur « Sérieux ».
  if p_tier is not null and p_tier not in
     ('echauffement', 'serieux', 'costaud', 'brutal', 'inhumain') then
    raise exception 'bad_tier';
  end if;
  if not exists (select 1 from public.exercises where id = p_exercise_id) then
    raise exception 'bad_exercise';
  end if;
  if public.fboss_same_exercise(v_uid, p_exercise_id) then raise exception 'same_exercise'; end if;
  if coalesce(v_tokens, 0) < v_cost then raise exception 'no_tokens'; end if;

  select coalesce(array_agg(distinct x), '{}') into v_invitees
    from unnest(v_invitees) x where x <> v_uid;
  if cardinality(v_invitees) > 9 then raise exception 'too_many_invites'; end if;
  foreach v_friend in array v_invitees loop
    if not public.are_friends(v_uid, v_friend) then raise exception 'not_friend'; end if;
  end loop;

  update public.characters set boss_tokens = boss_tokens - v_cost where user_id = v_uid;

  insert into public.friend_bosses (owner_id, exercise_id, exercise_name, family, rep_weight,
                                    start_at, hp_total, tier)
    values (v_uid, p_exercise_id, left(p_exercise_name, 80), p_family,
            least(2, greatest(0.3, coalesce(p_rep_weight, 1))),
            case when cardinality(v_invitees) = 0 then now() end,
            public.fboss_share_tier(p_family, p_tier) * public.fboss_damage_per_unit(),
            coalesce(p_tier, 'serieux'))
    returning id into v_id;

  insert into public.friend_boss_members (boss_id, user_id, pseudo, status, responded_at)
    values (v_id, v_uid, v_pseudo, 'accepted', now());

  insert into public.friend_boss_members (boss_id, user_id, pseudo, status)
    select v_id, c.user_id, c.pseudo, 'invited'
    from public.characters c where c.user_id = any (v_invitees);

  return v_id;
end;
$$;

-- ── Rejoindre : payer le cran du boss, un seul boss par exercice ─────────────────
create or replace function public.fboss_respond(p_boss uuid, p_accept boolean) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_tokens integer;
  b public.friend_bosses;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select boss_tokens into v_tokens from public.characters where user_id = v_uid for update;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then raise exception 'not_found'; end if;
  if not exists (
    select 1 from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'invited'
  ) then raise exception 'not_invited'; end if;
  if now() >= public.fboss_start(b) then raise exception 'closed'; end if;
  if p_accept then
    if public.fboss_same_exercise(v_uid, b.exercise_id) then
      raise exception 'same_exercise';
    end if;
    if coalesce(v_tokens, 0) < public.fboss_token_cost(b.tier) then
      raise exception 'no_tokens';
    end if;
    update public.characters set boss_tokens = boss_tokens - public.fboss_token_cost(b.tier)
      where user_id = v_uid;
  end if;

  update public.friend_boss_members
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where boss_id = p_boss and user_id = v_uid;

  if p_accept then
    update public.friend_bosses
      set hp_total = hp_total
                     + public.fboss_share_tier(family, tier) * public.fboss_damage_per_unit()
      where id = p_boss;
  end if;

  if not exists (
    select 1 from public.friend_boss_members where boss_id = p_boss and status = 'invited'
  ) then
    update public.friend_bosses set start_at = now() where id = p_boss;
  end if;
  return json_build_object('ok', true);
end;
$$;
