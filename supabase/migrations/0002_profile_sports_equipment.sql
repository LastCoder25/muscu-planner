-- 0002_profile_sports_equipment.sql
-- Extension additive du contrat (v1.0, rétro-compatible) : le Profile gagne
-- `available_equipment` (matériel détaillé) et `sports` (pratiques en parallèle).
-- Ces champs vivent dans profiles.payload (JSONB) — aucune nouvelle colonne
-- requise. On documente seulement l'évolution sur la colonne payload.
comment on column public.profiles.payload is
  'Objet Profile complet (contrat v1.0). Depuis 0002 : inclut available_equipment[] et sports[] (optionnels).';
