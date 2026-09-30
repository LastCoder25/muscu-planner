-- 0097 — Les abducteurs travaillent les FESSIERS, pas les quadriceps.
--
-- L'app n'a pas de groupe « fessiers » à part : fessiers et ischios forment un seul
-- groupe (« Ischio / fessiers » sur la silhouette, la priorité « fessiers » vise les
-- ischio-jambiers, le pont fessier et la glute machine y sont rangés). La machine à
-- abducteurs (moyen fessier) y rejoint donc ses voisins, et passe du groupe Squat à la
-- Charnière du Défi 360. Vérifié avant : aucun défi, séance ni bilan ne l'utilisait.
--
-- Au passage, deux libellés de muscles secondaires rejoignent le vocabulaire commun
-- (`normMuscle` les rattachait déjà ; c'est la source qui s'aligne) : `avant_bras` →
-- `avant-bras`, `deltoïde antérieur` → `épaules`. Rejouable sans effet.

update public.exercises
set muscle_primary = 'ischio-jambiers',
    muscle_secondary = '{fessiers}'
where id = 'ex_abductors';

update public.exercises
set muscle_secondary = array_replace(muscle_secondary, 'avant_bras', 'avant-bras')
where 'avant_bras' = any(muscle_secondary);

update public.exercises
set muscle_secondary = array_replace(muscle_secondary, 'deltoïde antérieur', 'épaules')
where 'deltoïde antérieur' = any(muscle_secondary);
