-- ⚙️ Refonte de l'équipement à 7 emplacements (étape 8) : version de l'équipement d'un
-- personnage. Sous la version courante (GEAR_VERSION, src/lib/items.ts), la ligne reçoit UNE
-- fois les cadeaux de la refonte (pièces de set manquantes, pièces de départ). Additive :
-- l'ancien client l'ignore. Défaut 0 = « pas encore converti » ; un personnage NEUF est créé
-- directement à la version courante (setPseudo).
alter table public.characters add column if not exists gear_version integer not null default 0;
