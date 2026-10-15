-- ⏳ BOSS ENTRE AMIS : « dernières heures » (2026-10-15, demandé par l'utilisateur : « une
-- notification push quand on arrive dans les dernières heures du boss commun »).
--
-- ⚠️ PROGRAMMÉE PAR LE SERVEUR, pas par le client : un client ne programme que SES messages,
-- et un ami qui n'ouvre pas l'app d'ici là doit quand même être prévenu. Même patron que
-- `fboss_push_invite` / `fboss_push_down` : des déclencheurs en base.
--
-- La fonction est REJOUABLE : elle efface l'alerte pas encore envoyée du boss, puis la
-- reprogramme pour chaque membre ACCEPTÉ, à `fin − 6 h` — sauf boss tombé ou combat fini.
-- Déjà dans les 6 dernières heures : tout de suite, avec le temps qui reste. Appelée à chaque
-- changement qui la concerne : démarrage (`start_at`), mort (`defeated_at`), membre qui
-- rejoint, refuse ou se retire.
--
-- ⚠️ La fin est celle de `bossEndsAt` (lib) : démarrage = `least(start_at, created_at + 24 h)`
-- (24 h sans `start_at`), puis 7 jours. Un test vérifie que les constantes concordent.

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
  -- Déjà dans les dernières heures (rattrapage d'un boss en cours, membre qui rejoint tard) :
  -- on prévient TOUT DE SUITE, avec le temps qui reste vraiment. Une seule fois : une alerte
  -- déjà envoyée n'est jamais effacée ni renvoyée (`on conflict do nothing`).
  v_at := greatest(v_end - interval '6 hours', now());
  v_left := case
    when v_at > now() then '6 h'
    when v_end - now() >= interval '1 hour'
      then floor(extract(epoch from v_end - now()) / 3600)::int || ' h'
    else 'moins d’1 h'
  end;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    select m.user_id, 'fboss_end', v_at, '⏳ Dernières heures pour le boss',
           'Le boss en ' || b.exercise_name || ' s’échappe dans ' || v_left || '. Viens frapper avant la fin.',
           '/boss-amis', 'fboss-end:' || p_boss
    from public.friend_boss_members m
    where m.boss_id = p_boss and m.status = 'accepted'
    -- Déjà envoyée (ligne conservée comme historique) : on ne la renvoie pas.
    on conflict (user_id, dedupe) do nothing;
end;
$$;

revoke all on function public.fboss_schedule_end(uuid) from public, anon, authenticated;

create or replace function public.fboss_end_push_boss() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform public.fboss_schedule_end(new.id);
  return new;
end;
$$;

create or replace function public.fboss_end_push_member() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.fboss_schedule_end(old.boss_id);
    return old;
  end if;
  perform public.fboss_schedule_end(new.boss_id);
  return new;
end;
$$;

drop trigger if exists fboss_end_push_boss on public.friend_bosses;
create trigger fboss_end_push_boss after insert or update of start_at, defeated_at
  on public.friend_bosses for each row execute function public.fboss_end_push_boss();

drop trigger if exists fboss_end_push_member on public.friend_boss_members;
create trigger fboss_end_push_member after insert or update of status or delete
  on public.friend_boss_members for each row execute function public.fboss_end_push_member();

-- Les boss déjà en cours reçoivent leur alerte.
select public.fboss_schedule_end(id) from public.friend_bosses where defeated_at is null;
