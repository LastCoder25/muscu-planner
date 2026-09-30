-- 0096 — Le soulevé de terre est une CHARNIÈRE, pas un exo de dos.
--
-- La 0043 l'avait posé en muscle principal « dos » (érecteurs du rachis). Dans l'app, ce
-- classement le rangeait dans le groupe Tirage du Défi 360 (avec tractions et rowing) au
-- lieu de la Charnière (soulevé de terre roumain, hip thrust), et l'Équilibre du corps
-- créditait le dos à la place des ischios. On l'aligne sur le soulevé de terre roumain :
-- ischio-jambiers en principal, dos / fessiers / lombaires en secondaires.
--
-- ⚠️ Le muscle est FIGÉ dans les données qui l'ont copié (exos d'un Défi 360, séances
-- planifiées, bilans). On les corrige aussi, historique compris (demandé par l'utilisateur),
-- sinon les défis et séances passés continueraient de créditer le dos. Un exo du 360 rangé
-- dans le Tirage passe dans la Charnière. Rejouable sans effet.

update public.exercises
set muscle_primary = 'ischio-jambiers',
    muscle_secondary = '{dos,fessiers,lombaires}'
where id = 'ex_deadlift';

-- Parcourt un document JSON et corrige tout objet qui désigne le soulevé de terre.
create or replace function pg_temp.fix_deadlift(j jsonb) returns jsonb
language plpgsql as $$
declare
  k text;
  v jsonb;
  out jsonb;
begin
  if jsonb_typeof(j) = 'array' then
    select coalesce(jsonb_agg(pg_temp.fix_deadlift(e) order by n), '[]'::jsonb)
      into out from jsonb_array_elements(j) with ordinality as t(e, n);
    return out;
  elsif jsonb_typeof(j) = 'object' then
    out := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      out := out || jsonb_build_object(k, pg_temp.fix_deadlift(v));
    end loop;
    if (out ->> 'id' = 'ex_deadlift' or out ->> 'exercise_id' = 'ex_deadlift') then
      if out ->> 'muscle_primary' = 'dos' then
        out := out || '{"muscle_primary": "ischio-jambiers"}'::jsonb;
      end if;
      if out ? 'muscle_secondary' and jsonb_typeof(out -> 'muscle_secondary') = 'array' then
        out := out || '{"muscle_secondary": ["dos", "fessiers", "lombaires"]}'::jsonb;
      end if;
      -- Un exo de Défi 360 : du groupe Tirage vers la Charnière.
      if out ->> 'exercise_id' = 'ex_deadlift' and out ->> 'slot' = 'pull' then
        out := out || '{"slot": "hinge"}'::jsonb;
      end if;
    end if;
    return out;
  end if;
  return j;
end $$;

update public.combo_challenges
set legs = pg_temp.fix_deadlift(legs)
where legs::text like '%ex_deadlift%';

update public.sessions
set payload = pg_temp.fix_deadlift(payload)
where payload::text like '%ex_deadlift%';

update public.session_logs
set payload = pg_temp.fix_deadlift(payload)
where payload::text like '%ex_deadlift%';

update public.challenges
set muscle_primary = 'ischio-jambiers'
where exercise_id = 'ex_deadlift' and muscle_primary = 'dos';
