-- 0087 — BOSS ENTRE AMIS : le délai de 48 h du LANCEUR revient, par-dessus les jetons (v0.1067).
--
-- Demandé par l'utilisateur : « une personne doit quand même attendre 48 h avant d'en relancer
-- un ». On lance donc UN boss à la fois, puis on attend 48 h après sa fin (mort ou 7 jours)
-- avant d'en lancer un autre — la règle d'avant les jetons (0076/0078). Rejoindre reste libre :
-- et GRATUIT (demandé aussi : « rejoindre un boss commun ne coûte rien ») ; seule la règle
-- « un seul boss en cours par exercice » s'y applique.
--
-- ⚠️ Reprise des DERNIÈRES définitions (0086) : fboss_declare gagne le délai, fboss_respond
-- perd le débit de jetons.

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
  -- ⚠️ Le LANCEUR attend 48 h après la fin (mort ou 7 jours) du dernier boss qu'il a lancé ;
  -- un boss qu'il a lancé et qui est encore en cours le bloque aussi. Rejoindre n'est pas
  -- concerné (jetons + un boss par exercice).
  if exists (
    select 1 from public.friend_bosses b
    where b.owner_id = v_uid and public.fboss_ended(b) + interval '48 hours' > now()
  ) then raise exception 'cooldown'; end if;
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

-- ── Rejoindre : gratuit, un seul boss en cours par exercice ─────────────────────
create or replace function public.fboss_respond(p_boss uuid, p_accept boolean) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.characters where user_id = v_uid for update;
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
