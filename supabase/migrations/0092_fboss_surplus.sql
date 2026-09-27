-- 🤝 BOSS ENTRE AMIS : LA PART RÉSERVÉE ET LE SURPLUS (v0.1206 ; demandé par l'utilisateur :
-- « pouvoir en faire plus sans empêcher le pote d'avoir sa récompense ni le frustrer, mais que
-- je sois récompensé quand même »).
--
-- Avant : une saisie était plafonnée aux PV restants. Un joueur rapide vidait le boss, et un
-- ami qui n'avait pas encore joué n'avait plus rien à frapper — donc jamais sa demi-part, donc
-- jamais son coffre.
--
-- Désormais une saisie est retenue jusqu'au plafond d'UNE saisie (2,5 parts), et se partage :
--   · DÉGÂTS : ce qui entame le boss, hors des parts RÉSERVÉES — la demi-part qui manque encore
--     à chaque AUTRE membre accepté. Le dernier jour (`fboss_start + 6 days`), les réserves
--     tombent : un ami qui ne joue pas du tout ne peut pas empêcher la mort du boss.
--   · SURPLUS : le reste. Il compte dans les reps du membre (XP, et coffre plus gros côté
--     client) mais n'entame rien. Rien n'est perdu, même au-delà de la mort du boss.
-- ⚠️ La même règle vit en lib (`splitHit`, `bossReservedUnits`, `FRIEND_BOSS.reserveReleaseMs`),
-- et un test vérifie qu'elles disent la même chose.

alter table public.friend_boss_hits
  add column if not exists surplus integer not null default 0 check (surplus >= 0);

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

-- La notification « un ami a frappé » annonçait le reste de vie en ajoutant TOUTES les reps de
-- la frappe : le surplus n'entame rien, il faut le retirer.
create or replace function public.fboss_push_hit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  -- ⚠️ `fboss_hit` INSÈRE la frappe AVANT de mettre à jour les PV du boss : `b.damage` est
  -- donc celui d'AVANT le coup, et l'annoncer tel quel donnerait un reste trop élevé. On
  -- ajoute la frappe — ses reps de DÉGÂTS seulement — pour dire le vrai restant.
  v_after := b.damage::bigint + (new.units - new.surplus)::bigint * v_dpu;

  -- ⚠️ LE COUP FATAL NE S'ANNONCE PAS ICI : `fboss_push_down` dit « le boss est tombé », et
  -- deux notifications au même instant se marcheraient dessus.
  if v_after >= b.hp_total then return new; end if;

  v_left := greatest(0, round(100.0 * (b.hp_total - v_after) / b.hp_total))::integer;
  select pseudo into v_pseudo from public.characters where user_id = new.user_id;

  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    select m.user_id, 'fboss_hit', now(),
           '⚔️ ' || coalesce(v_pseudo, 'Un ami') || ' a frappé le boss',
           coalesce(b.exercise_name, 'Le combat') || ' — il reste ' || v_left || ' % de vie.',
           '/boss-amis',
           -- ⚠️ AU PLUS UNE PAR AMI ET PAR HEURE (les frappes arrivent en rafales).
           'fboss-hit:' || new.boss_id || ':' || new.user_id || ':'
             || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24')
    from public.friend_boss_members m
    -- Jamais l'auteur : il sait qu'il vient de frapper.
    where m.boss_id = new.boss_id and m.status = 'accepted' and m.user_id <> new.user_id
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;
