-- 0079 — BOSS ENTRE AMIS : deux notifications de plus (demandées par l'utilisateur).
--   • un ami a FRAPPÉ le boss ;
--   • un ami a REJOINT le boss que j'ai lancé.
--
-- ⚠️ DES DÉCLENCHEURS, jamais le téléphone d'un joueur : un client ne programme des
-- messages que pour LUI-MÊME (0062) et n'écrit jamais la ligne d'un autre. Même patron que
-- `fboss_push_invite` / `fboss_push_down` de la 0067.

-- ── Un ami a frappé ──────────────────────────────────────────────────────────────
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

  -- ⚠️ `fboss_hit` INSÈRE la frappe AVANT de mettre à jour les PV du boss : `b.damage` est
  -- donc celui d'AVANT le coup, et l'annoncer tel quel donnerait un reste trop élevé. On
  -- ajoute la frappe pour dire le vrai restant.
  v_after := b.damage::bigint + new.units::bigint * v_dpu;

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
           -- ⚠️ AU PLUS UNE PAR AMI ET PAR HEURE. Les frappes arrivent en RAFALES : mesuré
           -- sur les vraies parties, des écarts de 0 à 7 minutes pendant une séance, puis
           -- des pauses de plusieurs heures. Notifier chaque coup préviendrait trois ou
           -- quatre fois pour un seul effort. La clé porte l'AUTEUR : savoir QUI a joué est
           -- ce qui a été demandé, donc deux amis actifs dans la même heure font deux
           -- messages, pas un seul fondu.
           'fboss-hit:' || new.boss_id || ':' || new.user_id || ':'
             || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24')
    from public.friend_boss_members m
    -- Jamais l'auteur : il sait qu'il vient de frapper.
    where m.boss_id = new.boss_id and m.status = 'accepted' and m.user_id <> new.user_id
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

-- ── Un ami a rejoint mon boss ────────────────────────────────────────────────────
create or replace function public.fboss_push_joined() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_exo text;
  v_pseudo text;
begin
  -- Seulement le passage À « accepted » : `fboss_respond` écrit aussi « declined » par ce
  -- même UPDATE, et un refus ne s'annonce pas.
  if new.status <> 'accepted' or old.status = 'accepted' then return new; end if;

  select owner_id, exercise_name into v_owner, v_exo
    from public.friend_bosses where id = new.boss_id;
  -- Le lanceur ne s'annonce pas à lui-même. (Il est inséré « accepted » d'emblée par
  -- `fboss_declare`, donc cet UPDATE ne le voit pas — la garde ne coûte rien et tient si
  -- ce chemin change un jour.)
  if v_owner is null or v_owner = new.user_id then return new; end if;

  select pseudo into v_pseudo from public.characters where user_id = new.user_id;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    values (v_owner, 'fboss_joined', now(),
            '🤝 ' || coalesce(v_pseudo, 'Un ami') || ' a rejoint ton boss',
            coalesce(v_exo, 'Le combat') || ' — sa part de vie vient s’ajouter.',
            '/boss-amis',
            -- Une seule fois par ami et par boss : on ne rejoint qu'une fois.
            'fboss-joined:' || new.boss_id || ':' || new.user_id)
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;

drop trigger if exists fboss_hit_push on public.friend_boss_hits;
create trigger fboss_hit_push after insert on public.friend_boss_hits
  for each row execute function public.fboss_push_hit();

drop trigger if exists fboss_joined_push on public.friend_boss_members;
create trigger fboss_joined_push after update of status on public.friend_boss_members
  for each row execute function public.fboss_push_joined();
