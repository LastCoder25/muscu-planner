-- 0078 — BOSS ENTRE AMIS : des CRANS DE DIFFICULTÉ (v0.904).
--
-- Demandé par l'utilisateur : « voir pour le boss commun comment le créer en proposant plus
-- ou moins de reps et lier ça à la récompense — une valeur fixe est trop limitante selon les
-- gens », puis « mets des crans style facile / moyen / difficile avec des noms un peu sympa ;
-- la difficulté définit le nombre de reps par personne ».
--
-- Le cran multiplie la PART D'UN PARTICIPANT. Tout ce qui se compte en « parts » le suit donc
-- mécaniquement : les PV du boss, le plafond d'une saisie, et la part minimale qui ouvre le
-- coffre. La RÉCOMPENSE, elle, est tirée côté client (le serveur ne connaît pas le jeu).
--
-- ⚠️ `fboss_tier_mult` doit rester égal à `BOSS_TIERS` (src/lib/friendBoss.ts) — un test lit
-- cette migration et compare les deux côtés. Les migrations précédentes ne sont pas éditées :
-- on remplace les fonctions (`create or replace` conserve les droits).
--
-- ⚠️ RÉTRO-COMPATIBLE SANS MIGRATION DE DONNÉES : la colonne est NULLABLE et `fboss_tier_mult`
-- rend 1 pour NULL (le cran « Sérieux »). Les boss déjà lancés gardent donc exactement leurs
-- PV et leurs plafonds.
--
-- ⚠️ Les quatre fonctions sont reprises de leur DERNIÈRE définition (0076 pour `declare`,
-- 0070 pour `respond`, 0075 pour `hit`, 0067 pour `claim`), pas de la 0067 : elles portent
-- l'Autel des boss, le délai de 48 h, l'échelle de dégâts et le retrait du plafond quotidien.

alter table public.friend_bosses add column if not exists tier text;

-- Multiplicateur de volume d'un cran. NULL / inconnu → 1 (« Sérieux »).
create or replace function public.fboss_tier_mult(p_tier text) returns numeric
  language sql immutable as $$
  select case p_tier
    when 'echauffement' then 0.5
    when 'serieux' then 1
    when 'costaud' then 2
    when 'brutal' then 3
    when 'inhumain' then 5
    else 1
  end;
$$;

-- La part d'UN participant, cran compris : la seule chose que les autres fonctions lisent.
-- ⚠️ Arrondie comme `bossShareUnits` côté client (`Math.round`), sinon un cran à 0,5 sur une
-- part impaire donnerait deux volumes différents selon le côté.
create or replace function public.fboss_share_tier(p_family text, p_tier text)
  returns integer language sql immutable as $$
  select round(public.fboss_share(p_family) * public.fboss_tier_mult(p_tier))::integer;
$$;

-- ── Déclarer : le cran est choisi au lancement ───────────────────────────────────
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
  v_invitees uuid[] := coalesce(p_invitees, '{}');
  v_id uuid;
  v_friend uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select pseudo, buildings into v_pseudo, v_buildings
    from public.characters where user_id = v_uid for update;
  if v_pseudo is null then raise exception 'no_character'; end if;
  if not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(v_buildings) = 'array'
                                            then v_buildings else '[]'::jsonb end) e
    where e->>'typeId' = 'boss_altar' and coalesce((e->>'level')::numeric, 0) > 0
  ) then raise exception 'no_altar'; end if;
  if public.fboss_share(p_family) is null then raise exception 'bad_family'; end if;
  -- ⚠️ Un cran inconnu est REFUSÉ, jamais replié en silence sur « Sérieux » : un client
  -- périmé qui enverrait un id inexistant créerait un boss dont l'écran annoncerait un autre
  -- volume que celui que le serveur applique.
  if p_tier is not null and p_tier not in
     ('echauffement', 'serieux', 'costaud', 'brutal', 'inhumain') then
    raise exception 'bad_tier';
  end if;
  if not exists (select 1 from public.exercises where id = p_exercise_id) then
    raise exception 'bad_exercise';
  end if;
  if public.fboss_busy(v_uid) then raise exception 'busy'; end if;
  if exists (
    select 1 from public.friend_bosses b
    where b.owner_id = v_uid and public.fboss_ended(b) + interval '48 hours' > now()
  ) then raise exception 'cooldown'; end if;

  select coalesce(array_agg(distinct x), '{}') into v_invitees
    from unnest(v_invitees) x where x <> v_uid;
  if cardinality(v_invitees) > 9 then raise exception 'too_many_invites'; end if;
  foreach v_friend in array v_invitees loop
    if not public.are_friends(v_uid, v_friend) then raise exception 'not_friend'; end if;
  end loop;

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

-- ── Rejoindre : chaque membre accepté ajoute SA part, au cran du boss ────────────
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
  if p_accept and public.fboss_busy(v_uid) then raise exception 'busy'; end if;

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

-- ── Frapper : le plafond d'une saisie suit le cran ───────────────────────────────
create or replace function public.fboss_hit(p_boss uuid, p_units integer) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_share integer;
  v_acc integer;
  v_dpu integer := public.fboss_damage_per_unit();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then raise exception 'not_found'; end if;
  if not exists (
    select 1 from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted'
  ) then raise exception 'not_member'; end if;
  if b.defeated_at is not null or now() < public.fboss_start(b)
     or now() >= public.fboss_start(b) + interval '7 days' then
    return json_build_object('ok', false, 'reason', 'not_active');
  end if;

  v_share := public.fboss_share_tier(b.family, b.tier);
  -- ⚠️ Mêmes plafonds que `acceptedUnits` : une saisie ≤ 2,5 parts, et les reps qui restent
  -- avant la mort (arrondi au-dessus, comme `bossUnitsLeft`). Aucun plafond sur 24 h.
  v_acc := least(greatest(0, coalesce(p_units, 0)),
                 floor(v_share * 2.5)::integer,
                 ceil((b.hp_total - b.damage)::numeric / v_dpu)::integer);
  if v_acc <= 0 then
    return json_build_object('ok', false, 'reason', 'capped');
  end if;

  insert into public.friend_boss_hits (boss_id, user_id, units) values (p_boss, v_uid, v_acc);
  update public.friend_boss_members set units = units + v_acc
    where boss_id = p_boss and user_id = v_uid;
  update public.friend_bosses
    set damage = damage + v_acc * v_dpu,
        defeated_at = case when damage + v_acc * v_dpu >= hp_total then now() else defeated_at end
    where id = p_boss;

  return json_build_object('ok', true, 'accepted', v_acc,
                           'defeated', b.damage + v_acc * v_dpu >= b.hp_total);
end;
$$;

-- ── Encaisser : la part minimale suit le cran ───────────────────────────────────
create or replace function public.fboss_claim(p_boss uuid) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_units integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null or b.defeated_at is null then
    return json_build_object('ok', false, 'reason', 'not_defeated');
  end if;
  select units into v_units from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted' and not claimed;
  if v_units is null then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  if v_units < public.fboss_share_tier(b.family, b.tier) * 0.5 then
    return json_build_object('ok', false, 'reason', 'min_share');
  end if;
  update public.friend_boss_members set claimed = true
    where boss_id = p_boss and user_id = v_uid;
  return json_build_object('ok', true, 'units', v_units);
end;
$$;

-- La signature de `fboss_declare` a changé (paramètre `p_tier`) : l'ancienne surcharge à
-- 5 arguments est retirée, sinon un client périmé continuerait de créer des boss sans cran.
drop function if exists public.fboss_declare(text, text, text, numeric, uuid[]);
revoke all on function public.fboss_declare(text, text, text, numeric, uuid[], text)
  from public, anon;
grant execute on function public.fboss_declare(text, text, text, numeric, uuid[], text)
  to authenticated;
