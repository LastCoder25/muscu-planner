-- 0101 — Tractions et dips comptent comme de vrais polyarticulaires (2026-10-10, demandé :
-- « ma série de tractions, très dure, me rapporte presque rien »).
--
-- Le poids d'une rep (`repWeightFromExercise`) se déduit du nombre de muscles travaillés :
-- 1 → 0,6 · 2 → 1,0 · 3 et plus → 1,3. Tractions et dips n'avaient qu'UN muscle secondaire
-- en base, donc valaient autant qu'une pompe par rep. On complète :
--   · tractions : biceps + avant-bras ;
--   · dips      : triceps + épaules (deltoïde antérieur).
-- Poids de rep : 1,3 (variantes à l'élastique : 1,3 × 0,6 = 0,78).
--
-- Le poids de rep est FIGÉ sur un défi à sa création : on met donc aussi à jour les défis
-- EN COURS (Défis 360 et challenges) qui portent ces exos. Les défis terminés gardent la
-- valeur avec laquelle ils ont été joués. Rejouable : les valeurs posées sont absolues.

update public.exercises set muscle_secondary = '{biceps,avant-bras}'
  where id in ('ex_pullup', 'ex_pullup_assisted');
update public.exercises set muscle_secondary = '{triceps,épaules}'
  where id in ('ex_dips', 'ex_dips_assisted');

-- Défis 360 en cours : chaque exo concerné reçoit son nouveau poids de rep.
update public.combo_challenges c
set legs = (
  select jsonb_agg(
    case l->>'exercise_id'
      when 'ex_pullup' then jsonb_set(l, '{rep_weight}', '1.3'::jsonb)
      when 'ex_dips' then jsonb_set(l, '{rep_weight}', '1.3'::jsonb)
      when 'ex_pullup_assisted' then jsonb_set(l, '{rep_weight}', '0.78'::jsonb)
      when 'ex_dips_assisted' then jsonb_set(l, '{rep_weight}', '0.78'::jsonb)
      else l
    end
    order by ord
  )
  from jsonb_array_elements(c.legs) with ordinality as e(l, ord)
)
where c.status = 'active'
  and exists (
    select 1 from jsonb_array_elements(c.legs) l
    where l->>'exercise_id' in ('ex_pullup', 'ex_dips', 'ex_pullup_assisted', 'ex_dips_assisted')
  );

-- Challenges en cours.
update public.challenges set rep_weight = 1.3
  where status = 'active' and exercise_id in ('ex_pullup', 'ex_dips');
update public.challenges set rep_weight = 0.78
  where status = 'active' and exercise_id in ('ex_pullup_assisted', 'ex_dips_assisted');
