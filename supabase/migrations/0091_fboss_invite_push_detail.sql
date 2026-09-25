-- 🐉 L'INVITATION À UN BOSS ENTRE AMIS DIT CE QU'ON ACCEPTE (2026-09-25).
--
-- La notification de la 0067 disait seulement « un boss à abattre en Pompes, 24 h pour le
-- rejoindre » : ni la difficulté, ni ce que CHACUN devra faire — or c'est précisément ce qui
-- décide si on le rejoint (30 pompes ou 300). Elle porte désormais le cran et la part par
-- personne, et mène directement à l'écran du boss (`/boss-amis`) au lieu de la page Amis.
--
-- ⚠️ La part est lue par `fboss_share_tier`, la MÊME fonction que les PV et les plafonds :
-- le message ne peut pas annoncer un autre volume que celui que le serveur applique.
-- ⚠️ Libellés et emojis des crans = `BOSS_TIERS` (src/lib/friendBoss.ts). Un cran inconnu
-- retombe sur « Sérieux », comme `fboss_tier_mult`.

create or replace function public.fboss_push_invite() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_owner text;
  v_exo text;
  v_family text;
  v_tier text;
  v_label text;
begin
  if new.status <> 'invited' then return new; end if;
  select c.pseudo, b.exercise_name, b.family, b.tier
    into v_owner, v_exo, v_family, v_tier
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
            '⚔️ ' || coalesce(v_owner, 'Un ami') || ' demande de l’aide',
            'Boss ' || v_label || ' en ' || coalesce(v_exo, 'reps') || ' : ta part = '
              || public.fboss_share_tier(v_family, v_tier)
              || case when v_family = 'core' then ' s' else ' reps' end
              || ' sur 7 jours. Tu as 24 h pour répondre.',
            '/boss-amis', 'fboss-invite:' || new.boss_id)
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;
