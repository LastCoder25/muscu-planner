-- 0047 — Codex des sets : mémoriser les pièces de set DÉJÀ OBTENUES.
--
-- Le codex comptait les pièces présentes dans l'inventaire/équipement, or le joueur
-- casse/vend son stuff → le compteur redescendait. On persiste les slots obtenus par
-- set (map setId → [slots]) pour un vrai journal de collection (c9dd608d).

alter table characters
  add column if not exists set_pieces_seen jsonb not null default '{}'::jsonb;

comment on column characters.set_pieces_seen is
  'Codex sets : { [setId]: string[] slots déjà obtenus } — journal indépendant de l''inventaire.';
