-- 0118 — BOSS ENTRE AMIS : UN BOSS PEUT AVOIR PLUSIEURS EXERCICES (2 à 5) AU CHOIX À CHAQUE FRAPPE
-- (v1.320.0 ; décision de l'utilisateur : « à chaque frappe le participant choisit librement
-- l'exercice de la liste » ; une rép de tirage vaut 2 réps de poussée, une rép de jambes 0,75,
-- une seconde de gainage 0,2 — les parts de famille DÉJÀ en place, ramenées à la poussée).
--
-- ⚠️ MIGRATION ADDITIVE ET RÉTRO-COMPATIBLE. Rien n'est supprimé ni renommé.
--  · `fboss_declare` (6 arguments) n'est PAS touchée : un boss d'UN exercice se crée et se joue
--    exactement comme avant. Le multi passe par une NOUVELLE fonction, `fboss_declare_multi`.
--  · `fboss_hit(p_boss, p_units)` garde sa signature. Sur un boss multi, elle frappe l'exo de la
--    colonne `exercise_id` (le premier de la liste) avec son vrai poids : c'est ce que fait un
--    ancien client, qui ne connaît pas la liste. Les nouveaux clients appellent `fboss_hit_exo`.
--  · Aucune donnée existante n'est modifiée : `exercises` est NULL sur tous les boss déjà là,
--    ce qui veut dire « boss d'un seul exo » (colonnes `exercise_*` + `family`).
--
-- ⚠️ MONNAIE D'UN BOSS MULTI : l'ÉQUIVALENT POUSSÉE, tenu en ENTIERS (jamais d'arrondi par frappe :
-- 0,75 et 0,2 ne sont pas des entiers, et un arrondi se farme — découper en frappes de 1 rep de
-- jambes rapporterait +33 %). On compte en « points » = 1/20 de rep de poussée :
--     poids d'une unité (rep, ou seconde de gainage) = 1200 ÷ part de sa famille
--     poussée 20 · jambes 15 · tirage 40 · gainage 4 · conditionnement 20
--     part d'un joueur = 1200 × cran (points) = 60 × cran reps de poussée
--     un point fait 50 dégâts (1000 par rep de poussée, comme aujourd'hui)
-- Les PV (`hp_total`) restent donc ceux d'un boss de poussée du même cran, et `family` d'un boss
-- multi vaut 'push' : un ANCIEN client voit un boss de poussée cohérent (PV, part, coffre).
-- Les colonnes `units` / `surplus` d'un boss multi portent l'ÉQUIVALENT POUSSÉE ARRONDI (c'est ce
-- que lit un ancien client) ; le compte EXACT vit dans les colonnes `points` (membres, frappes) et
-- `surplus_points`. Les nouveaux clients lisent les points ; le serveur ne raisonne qu'en points.
--
-- ⚠️ LA FAMILLE D'UN EXO VIENT DU CLIENT (limite connue depuis la 0067) : le serveur vérifie que
-- l'exo existe et que la famille est valide, pas qu'elle est la bonne. Le dégât d'un tricheur est
-- borné à son propre groupe, comme avant. La frappe, elle, n'envoie QUE l'id : famille et poids
-- sont relus dans la liste figée du boss, et un id hors liste est refusé (`bad_exercise`).

alter table public.friend_bosses
  add column if not exists exercises jsonb;

alter table public.friend_boss_members
  add column if not exists points integer;

alter table public.friend_boss_hits
  add column if not exists exercise_id text,
  add column if not exists qty integer,
  add column if not exists points integer,
  add column if not exists surplus_points integer;

-- ── Helpers ─────────────────────────────────────────────────────────────────────
-- Doit rester égal à `FRIEND_BOSS.mixedScale` (src/lib/friendBoss.ts) : points par rep de poussée.
create or replace function public.fboss_mixed_scale() returns integer
  language sql immutable as $$
  select 20;
$$;

-- Points d'UNE unité (rep, ou seconde) d'une famille : 1200 ÷ sa part. Exact (entier) pour les
-- cinq familles — un test le vérifie.
create or replace function public.fboss_mixed_weight(p_family text) returns integer
  language sql immutable as $$
  select (public.fboss_mixed_scale() * public.fboss_share('push')) / public.fboss_share(p_family);
$$;

-- Un boss a-t-il plusieurs exercices ? (NULL ou un seul = boss d'un exo, comportement d'avant.)
create or replace function public.fboss_is_multi(b public.friend_bosses) returns boolean
  language sql immutable as $$
  select b.exercises is not null
         and jsonb_typeof(b.exercises) = 'array'
         and jsonb_array_length(b.exercises) >= 2;
$$;

-- Multiplicateur « unités du membre / de la frappe → part » : 20 pour un multi (points), 1 sinon.
create or replace function public.fboss_unit_scale(b public.friend_bosses) returns integer
  language sql immutable as $$
  select case when public.fboss_is_multi(b) then public.fboss_mixed_scale() else 1 end;
$$;

-- Les ids d'exercice qu'un boss OCCUPE : toute sa liste (multi), ou son unique exo.
create or replace function public.fboss_boss_ids(b public.friend_bosses) returns text[]
  language sql immutable as $$
  select case
    when public.fboss_is_multi(b)
      then array(select e->>'id' from jsonb_array_elements(b.exercises) e)
    else array[b.exercise_id]
  end;
$$;

-- ── UN SEUL BOSS EN COURS PAR EXERCICE, étendu à la liste ────────────────────────
-- Un boss multi occupe TOUS ses exercices : tant qu'il est en cours, aucun autre boss du même
-- joueur ne peut en partager un seul (sinon une même série pourrait frapper deux boss, la raison
-- d'être de la règle depuis la 0086).
create or replace function public.fboss_ids_busy(p_uid uuid, p_ids text[])
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.friend_boss_members m
    join public.friend_bosses b on b.id = m.boss_id
    where m.user_id = p_uid and m.status = 'accepted'
      and now() < public.fboss_ended(b)
      and public.fboss_boss_ids(b) && p_ids
  );
$$;

-- Même signature qu'avant (le 6-arguments `fboss_declare` d'un ancien client l'appelle) : elle
-- couvre désormais aussi les boss multi.
create or replace function public.fboss_same_exercise(p_uid uuid, p_exercise_id text)
  returns boolean language sql stable security definer set search_path = public as $$
  select public.fboss_ids_busy(p_uid, array[p_exercise_id]);
$$;

-- ── Déclarer un boss MULTI : 2 à 5 exercices distincts ───────────────────────────
-- Reprise de `fboss_declare` (0087) : altar, cran, jetons, délai de 48 h, invités. Seuls changent
-- l'exercice (une liste validée) et le chevauchement des exercices occupés.
create or replace function public.fboss_declare_multi(
  p_exercises jsonb,
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
  v_n integer;
  v_i integer;
  v_e jsonb;
  v_exid text;
  v_fam text;
  v_ids text[] := '{}';
  v_names text[] := '{}';
  v_norm jsonb := '[]'::jsonb;
  v_first jsonb;
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
  -- ⚠️ Un cran inconnu est REFUSÉ, jamais replié en silence sur « Sérieux ».
  if p_tier is not null and p_tier not in
     ('echauffement', 'serieux', 'costaud', 'brutal', 'inhumain') then
    raise exception 'bad_tier';
  end if;

  -- La liste : un tableau de 2 à 5 exercices DISTINCTS, chacun connu et de famille valide.
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'bad_exercises';
  end if;
  v_n := jsonb_array_length(p_exercises);
  if v_n < 2 or v_n > 5 then raise exception 'bad_exercises'; end if;
  for v_i in 0 .. v_n - 1 loop
    v_e := p_exercises -> v_i;
    v_exid := v_e ->> 'id';
    v_fam := v_e ->> 'family';
    if v_exid is null or public.fboss_share(v_fam) is null then raise exception 'bad_exercise'; end if;
    if not exists (select 1 from public.exercises where id = v_exid) then
      raise exception 'bad_exercise';
    end if;
    if v_exid = any (v_ids) then raise exception 'bad_exercises'; end if;
    v_ids := v_ids || v_exid;
    v_names := v_names || left(coalesce(v_e ->> 'name', v_exid), 80);
    v_norm := v_norm || jsonb_build_array(jsonb_build_object(
      'id', v_exid,
      'name', left(coalesce(v_e ->> 'name', v_exid), 80),
      'family', v_fam,
      'rep_weight', least(2, greatest(0.3, coalesce((v_e ->> 'rep_weight')::numeric, 1)))));
  end loop;
  v_first := v_norm -> 0;

  if public.fboss_ids_busy(v_uid, v_ids) then raise exception 'same_exercise'; end if;
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

  -- ⚠️ `family` = 'push' (la monnaie du boss) ; `exercise_id` / `exercise_name` / `rep_weight` =
  -- le premier exo (nom : tous, joints) — ce qu'un ancien client lit. PV : une part de POUSSÉE
  -- par participant, comme un boss de pompes du même cran.
  insert into public.friend_bosses (owner_id, exercise_id, exercise_name, family, rep_weight,
                                    start_at, hp_total, tier, exercises)
    values (v_uid, v_first ->> 'id', left(array_to_string(v_names, ' + '), 80), 'push',
            (v_first ->> 'rep_weight')::numeric,
            case when cardinality(v_invitees) = 0 then now() end,
            public.fboss_share_tier('push', p_tier) * public.fboss_damage_per_unit(),
            coalesce(p_tier, 'serieux'), v_norm)
    returning id into v_id;

  insert into public.friend_boss_members (boss_id, user_id, pseudo, status, responded_at)
    values (v_id, v_uid, v_pseudo, 'accepted', now());

  insert into public.friend_boss_members (boss_id, user_id, pseudo, status)
    select v_id, c.user_id, c.pseudo, 'invited'
    from public.characters c where c.user_id = any (v_invitees);

  return v_id;
end;
$$;

-- ── Rejoindre : le chevauchement des exercices remplace « le même exo » ───────────
-- Reprise de `fboss_respond` (0087). PV ajoutés : une part de POUSSÉE (`family` = 'push' pour un
-- boss multi), donc rien à changer de ce côté.
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
    -- Un boss multi occupe tous ses exercices : un seul chevauchement suffit à refuser.
    if public.fboss_ids_busy(v_uid, public.fboss_boss_ids(b)) then
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

-- ── Frapper : l'ancienne signature (boss d'un exo, ou 1er exo d'un multi) ────────
-- Reprise de `fboss_hit` (0092), texte inchangé sauf l'aiguillage : sur un boss MULTI, la frappe
-- est confiée à `fboss_hit_exo`, qui compte en points avec l'exo de la colonne `exercise_id`.
create or replace function public.fboss_hit(p_boss uuid, p_units integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_share integer;
  v_acc integer;
  v_left integer;
  v_reserved integer := 0;
  v_dmg integer;
  v_dpu integer := public.fboss_damage_per_unit();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then raise exception 'not_found'; end if;
  if not exists (
    select 1 from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted'
  ) then raise exception 'not_member'; end if;
  -- 🎯 Boss à plusieurs exercices : un ancien client frappe le premier (colonne exercise_id).
  if public.fboss_is_multi(b) then
    return public.fboss_hit_exo(p_boss, p_units, null);
  end if;
  if b.defeated_at is not null or now() < public.fboss_start(b)
     or now() >= public.fboss_start(b) + interval '7 days' then
    return json_build_object('ok', false, 'reason', 'not_active');
  end if;

  v_share := public.fboss_share_tier(b.family, b.tier);
  -- ⚠️ Le seul plafond : UNE saisie ≤ 2,5 parts (garde-fou contre la faute de frappe).
  -- Plus de plafond aux PV restants : ce qui ne peut pas entamer le boss devient du surplus.
  v_acc := least(greatest(0, coalesce(p_units, 0)), floor(v_share * 2.5)::integer);
  if v_acc <= 0 then
    return json_build_object('ok', false, 'reason', 'capped');
  end if;

  v_left := greatest(0, ceil((b.hp_total - b.damage)::numeric / v_dpu)::integer);
  -- 🤝 Les parts réservées : la demi-part qui manque à chaque AUTRE membre accepté
  -- (`ceil(part × 0,5)`, le plus petit entier qui passe `fboss_claim`), jusqu'au dernier jour.
  if now() < public.fboss_start(b) + interval '6 days' then
    select coalesce(sum(greatest(0, ceil(v_share * 0.5)::integer - m.units)), 0)
      into v_reserved
      from public.friend_boss_members m
      where m.boss_id = p_boss and m.status = 'accepted' and m.user_id <> v_uid;
  end if;
  v_dmg := least(v_acc, greatest(0, v_left - v_reserved));

  insert into public.friend_boss_hits (boss_id, user_id, units, surplus)
    values (p_boss, v_uid, v_acc, v_acc - v_dmg);
  update public.friend_boss_members set units = units + v_acc
    where boss_id = p_boss and user_id = v_uid;
  update public.friend_bosses
    set damage = damage + v_dmg * v_dpu,
        defeated_at = case when damage + v_dmg * v_dpu >= hp_total then now() else defeated_at end
    where id = p_boss;

  return json_build_object('ok', true, 'accepted', v_acc, 'damage', v_dmg,
                           'surplus', v_acc - v_dmg,
                           'defeated', b.damage + v_dmg * v_dpu >= b.hp_total);
end;
$$;

-- ── Frapper avec l'EXERCICE CHOISI (boss multi) ──────────────────────────────────
-- Tout se compte en POINTS entiers (1/20 de rep de poussée) : aucun arrondi par frappe.
--   · plafond d'UNE saisie : 2,5 parts, en points, puis ramené en quantité de l'exo choisi
--     (pompes 150, tractions 75, jambes 200, gainage 750 s au cran Sérieux — les plafonds d'avant) ;
--   · réserve : la demi-part qui manque à chaque AUTRE membre accepté, jusqu'au dernier jour ;
--   · surplus : ce qui ne peut pas entamer le boss. Il compte dans les points du membre.
-- Sur un boss d'UN exo, elle rend la main à `fboss_hit` (un id d'exo qui n'est pas le sien est
-- refusé). Rend `accepted` = quantité retenue de l'exo ; `points`, `damage_points` et
-- `surplus_points` sont en points (÷ 20 = équivalent poussée).
create or replace function public.fboss_hit_exo(p_boss uuid, p_units integer, p_exercise_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_ex jsonb;
  v_w integer;
  v_share integer;
  v_qty integer;
  v_pts integer;
  v_left integer;
  v_reserved integer := 0;
  v_dmg integer;
  v_sur integer;
  v_units integer;
  v_dpp integer := public.fboss_damage_per_unit() / public.fboss_mixed_scale();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then raise exception 'not_found'; end if;
  if not exists (
    select 1 from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted'
  ) then raise exception 'not_member'; end if;
  if not public.fboss_is_multi(b) then
    if p_exercise_id is not null and p_exercise_id <> b.exercise_id then
      raise exception 'bad_exercise';
    end if;
    return public.fboss_hit(p_boss, p_units);
  end if;
  if b.defeated_at is not null or now() < public.fboss_start(b)
     or now() >= public.fboss_start(b) + interval '7 days' then
    return json_build_object('ok', false, 'reason', 'not_active');
  end if;

  -- ⚠️ Famille et poids sont relus dans la liste FIGÉE du boss, jamais envoyés par la frappe.
  select e into v_ex
    from jsonb_array_elements(b.exercises) e
    where e ->> 'id' = coalesce(p_exercise_id, b.exercise_id);
  if v_ex is null then raise exception 'bad_exercise'; end if;
  v_w := public.fboss_mixed_weight(v_ex ->> 'family');

  v_share := public.fboss_share_tier(b.family, b.tier) * public.fboss_mixed_scale();
  -- ⚠️ Le seul plafond : UNE saisie ≤ 2,5 parts, en points, ramenée à la quantité de l'exo.
  v_qty := least(greatest(0, coalesce(p_units, 0)),
                 floor(floor(v_share * 2.5)::numeric / v_w)::integer);
  if v_qty <= 0 then
    return json_build_object('ok', false, 'reason', 'capped');
  end if;
  v_pts := v_qty * v_w;

  v_left := greatest(0, ceil((b.hp_total - b.damage)::numeric / v_dpp)::integer);
  if now() < public.fboss_start(b) + interval '6 days' then
    select coalesce(sum(greatest(0, ceil(v_share * 0.5)::integer - coalesce(m.points, 0))), 0)
      into v_reserved
      from public.friend_boss_members m
      where m.boss_id = p_boss and m.status = 'accepted' and m.user_id <> v_uid;
  end if;
  v_dmg := least(v_pts, greatest(0, v_left - v_reserved));
  v_sur := v_pts - v_dmg;
  -- Ce que lit un ancien client : l'équivalent poussée ARRONDI (au moins 1 : `units > 0`).
  v_units := greatest(1, round(v_pts / public.fboss_mixed_scale()::numeric)::integer);

  insert into public.friend_boss_hits (boss_id, user_id, units, surplus, exercise_id, qty,
                                       points, surplus_points)
    values (p_boss, v_uid, v_units,
            least(v_units, round(v_sur / public.fboss_mixed_scale()::numeric)::integer),
            v_ex ->> 'id', v_qty, v_pts, v_sur);
  -- `units` est DÉRIVÉ du total de points (pas d'une somme d'arrondis).
  update public.friend_boss_members
    set points = coalesce(points, 0) + v_pts,
        units = round((coalesce(points, 0) + v_pts) / public.fboss_mixed_scale()::numeric)::integer
    where boss_id = p_boss and user_id = v_uid;
  update public.friend_bosses
    set damage = damage + v_dmg * v_dpp,
        defeated_at = case when damage + v_dmg * v_dpp >= hp_total then now() else defeated_at end
    where id = p_boss;

  return json_build_object('ok', true, 'accepted', v_qty, 'points', v_pts,
                           'damage_points', v_dmg, 'surplus_points', v_sur,
                           'defeated', b.damage + v_dmg * v_dpp >= b.hp_total);
end;
$$;

-- ── Coffre : la part se compte dans la monnaie du boss (points pour un multi) ──────
-- Reprises de `fboss_claim` et `fboss_claim_bonus` (0103) : `v_units` est le total de POINTS du
-- membre pour un boss multi, et la part est multipliée par `fboss_unit_scale(b)` (20 / 1).
create or replace function public.fboss_claim(p_boss uuid) returns json
  language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  b public.friend_bosses;
  v_units integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into b from public.friend_bosses where id = p_boss for update;
  if b.id is null then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  select case when public.fboss_is_multi(b) then coalesce(points, 0) else units end
    into v_units from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted' and not claimed;
  if v_units is null or v_units <= 0 then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  -- Sa part entière : le coffre s'ouvre tout de suite. Sinon, à la fin du combat.
  if v_units < public.fboss_share_tier(b.family, b.tier) * public.fboss_unit_scale(b)
     and now() < public.fboss_ended(b) then
    return json_build_object('ok', false, 'reason', 'not_ended');
  end if;
  update public.friend_boss_members set claimed = true
    where boss_id = p_boss and user_id = v_uid;
  return json_build_object('ok', true, 'units', v_units);
end;
$$;

create or replace function public.fboss_claim_bonus(p_boss uuid) returns json
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
  select case when public.fboss_is_multi(b) then coalesce(points, 0) else units end
    into v_units from public.friend_boss_members
    where boss_id = p_boss and user_id = v_uid and status = 'accepted' and not bonus_claimed;
  if v_units is null then
    return json_build_object('ok', false, 'reason', 'nothing');
  end if;
  if v_units < public.fboss_share_tier(b.family, b.tier) * public.fboss_unit_scale(b) * 0.5 then
    return json_build_object('ok', false, 'reason', 'min_share');
  end if;
  update public.friend_boss_members set bonus_claimed = true
    where boss_id = p_boss and user_id = v_uid;
  return json_build_object('ok', true, 'units', v_units);
end;
$$;

-- ── Notifications : « un ami a frappé » lit les dégâts en points pour un multi ────
-- Reprise de `fboss_push_hit` (0108). Une frappe de boss multi porte ses `points` : ses dégâts
-- valent (points − surplus_points) × 50. Une frappe d'avant (points NULL) garde la formule d'avant.
create or replace function public.fboss_push_hit() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  b public.friend_bosses;
  v_pseudo text;
  v_dpu integer := public.fboss_damage_per_unit();
  v_dealt bigint;
  v_after bigint;
  v_left integer;
begin
  select * into b from public.friend_bosses where id = new.boss_id;
  if b.id is null or b.hp_total <= 0 then return new; end if;
  -- ⚠️ `fboss_hit` INSÈRE la frappe AVANT de mettre à jour les PV du boss : on ajoute la
  -- frappe — ses dégâts seulement, jamais son surplus — pour dire le vrai restant.
  v_dealt := case
    when new.points is not null
      then (new.points - coalesce(new.surplus_points, 0))::bigint
           * (v_dpu / public.fboss_mixed_scale())
    else (new.units - new.surplus)::bigint * v_dpu
  end;
  -- ⚠️ Une frappe tout en SURPLUS n'entame rien : pas de message « il reste X % ».
  if v_dealt <= 0 then return new; end if;
  v_after := b.damage::bigint + v_dealt;
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

-- ── Notification d'invitation : un multi annonce sa part en équivalents poussée ───
-- Reprise de `fboss_push_invite` (0108). Sans ça, « ta part = 60 reps » : faux pour un multi.
create or replace function public.fboss_push_invite() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_owner text;
  v_name text;
  v_exo text;
  v_family text;
  v_tier text;
  v_multi boolean;
  v_label text;
begin
  if new.status <> 'invited' then return new; end if;
  select c.pseudo, b.name, b.exercise_name, b.family, b.tier, public.fboss_is_multi(b)
    into v_owner, v_name, v_exo, v_family, v_tier, v_multi
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
              || case when v_multi then ' équivalents pompes'
                      when v_family = 'core' then ' s' else ' reps' end
              || ' sur 7 jours. Tu as 24 h pour répondre.',
            '/boss-amis', 'fboss-invite:' || new.boss_id)
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

-- ── Droits : comme 0103 / 0114 ───────────────────────────────────────────────────
revoke all on function public.fboss_declare_multi(jsonb, uuid[], text) from public, anon;
revoke all on function public.fboss_hit_exo(uuid, integer, text) from public, anon;
grant execute on function public.fboss_declare_multi(jsonb, uuid[], text) to authenticated;
grant execute on function public.fboss_hit_exo(uuid, integer, text) to authenticated;
-- Aide interne : jamais appelée par un client (les fonctions ci-dessus sont SECURITY DEFINER).
revoke all on function public.fboss_ids_busy(uuid, text[]) from public, anon, authenticated;
