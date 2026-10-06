-- 🔔 « Le boss est tombé — ton coffre t'attend » menait à /friends, alors que le coffre
-- s'ouvre sur la page du boss (/boss-amis, « boss passés »). Même fonction, autre URL.
create or replace function public.fboss_push_down() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if old.defeated_at is not null or new.defeated_at is null then return new; end if;
  insert into public.scheduled_pushes (user_id, kind, send_at, title, body, url, dedupe)
    select m.user_id, 'fboss_down', now(), '🏆 Le boss est tombé',
           'Ton groupe l’a abattu. Ton coffre t’attend.', '/boss-amis', 'fboss-down:' || new.id
    from public.friend_boss_members m
    where m.boss_id = new.id and m.status = 'accepted'
    on conflict (user_id, dedupe) do nothing;
  return new;
end;
$$;
