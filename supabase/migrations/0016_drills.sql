-- 0016_drills.sql — drills de tennis sur le court (Phase 2).
-- Domaine distinct de la muscu : on raisonne par coup/figure/partenaire.
-- `drills` = catalogue global (owner null) lu par tous ; `drill_sessions` = les
-- séances de court générées/sauvegardées par l'utilisateur (RLS own).

create table public.drills (
  id text primary key,
  owner uuid references auth.users(id) on delete cascade, -- null = catalogue global
  sport text not null default 'tennis',
  name text not null,
  category text not null check (category in
    ('echauffement','fond_de_court','service_retour','volee','deplacement','jeu','retour_au_calme')),
  shot text check (shot in ('coup_droit','revers','service','volee','smash','mixte')),
  pattern text,
  partner_required boolean not null default false,
  players text not null default 'solo' check (players in ('solo','duo','groupe')),
  equipment text[] not null default '{}',
  intensity text check (intensity in ('faible','moderee','elevee')),
  focus text[] not null default '{}',
  level int not null default 1,
  default_format jsonb not null default '{}',
  description text,
  instructions text[] not null default '{}',
  tips text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index drills_owner_idx on public.drills(owner);
create index drills_cat_idx on public.drills(category);

create table public.drill_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  theme text,
  with_partner boolean not null default false,
  level text,
  source text not null default 'engine',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index drill_sessions_user_idx on public.drill_sessions(user_id, created_at desc);

alter table public.drills enable row level security;
alter table public.drill_sessions enable row level security;

-- drills : lecture globale (owner null) ou perso ; écriture perso uniquement.
create policy "drills_read" on public.drills
  for select using (owner is null or owner = auth.uid());
create policy "drills_insert_own" on public.drills
  for insert with check (owner = auth.uid());
create policy "drills_update_own" on public.drills
  for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "drills_delete_own" on public.drills
  for delete using (owner = auth.uid());

create policy "drill_sessions_own" on public.drill_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ————————————————————————— Catalogue —————————————————————————
insert into public.drills
  (id, name, category, shot, pattern, partner_required, players, equipment, intensity, focus, level, default_format, description, tips) values
  -- Échauffement
  ('drill_mini_tennis', 'Mini-tennis', 'echauffement', 'mixte', null, true, 'duo', '{raquette,balles,filet}', 'faible', '{regularite,technique}', 1, '{"mode":"time","value":300,"sets":1}', 'Échanges doux dans les carrés de service pour trouver ses sensations.', 'Balle centrée, jambes fléchies, relâche le bras.'),
  ('drill_echange_lent', 'Échanges lents fond de court', 'echauffement', 'mixte', null, true, 'duo', '{raquette,balles,filet}', 'faible', '{regularite}', 1, '{"mode":"time","value":300,"sets":1}', 'Coopératif : garder la balle en jeu, rythme lent, monter progressivement.', 'Vise le centre du court, cherche 10+ frappes de suite.'),
  ('drill_shadow', 'Gammes à vide (shadow)', 'echauffement', 'mixte', null, false, 'solo', '{raquette}', 'faible', '{technique}', 1, '{"mode":"reps","value":15,"sets":3}', 'Reproduis les gestes (coup droit, revers, service) sans balle, en te déplaçant.', 'Termine chaque geste, travaille l''équilibre et le replacement.'),
  ('drill_mur_warmup', 'Échauffement au mur', 'echauffement', 'mixte', null, false, 'solo', '{raquette,balles,mur}', 'faible', '{regularite}', 1, '{"mode":"time","value":300,"sets":1}', 'Échanges contre un mur pour s''échauffer sans partenaire.', 'Recule d''un pas pour laisser rebondir, garde un rythme régulier.'),
  -- Fond de court
  ('drill_diag_fh', 'Diagonales coup droit', 'fond_de_court', 'coup_droit', 'diagonale', true, 'duo', '{raquette,balles,filet}', 'moderee', '{regularite,technique}', 1, '{"mode":"balls","value":30,"sets":2}', 'Échanges croisés en coup droit, chacun dans sa diagonale.', 'Prépare tôt, frappe devant, vise 1 m au-dessus du filet.'),
  ('drill_diag_bh', 'Diagonales revers', 'fond_de_court', 'revers', 'diagonale', true, 'duo', '{raquette,balles,filet}', 'moderee', '{regularite,technique}', 1, '{"mode":"balls","value":30,"sets":2}', 'Échanges croisés en revers, chacun dans sa diagonale.', 'Tourne les épaules tôt, accompagne vers la cible.'),
  ('drill_ll_fh', 'Coup droit longue ligne', 'fond_de_court', 'coup_droit', 'longue_ligne', true, 'duo', '{raquette,balles,filet}', 'moderee', '{technique,tactique}', 2, '{"mode":"balls","value":20,"sets":2}', 'Un joue longue ligne en coup droit, l''autre renvoie en diagonale.', 'La longue ligne est plus risquée : vise plus haut et plus court.'),
  ('drill_ll_bh', 'Revers longue ligne', 'fond_de_court', 'revers', 'longue_ligne', true, 'duo', '{raquette,balles,filet}', 'moderee', '{technique,tactique}', 2, '{"mode":"balls","value":20,"sets":2}', 'Un joue longue ligne en revers, l''autre renvoie en diagonale.', 'Change bien la ligne des épaules pour tenir la longue ligne.'),
  ('drill_fig8', 'Figure en 8', 'fond_de_court', 'mixte', 'croise', true, 'duo', '{raquette,balles,filet}', 'elevee', '{regularite,physique}', 2, '{"mode":"time","value":300,"sets":1}', 'Un joue toujours croisé, l''autre toujours longue ligne : la balle dessine un 8.', 'Excellent pour le déplacement et la régularité. Inversez les rôles.'),
  ('drill_decroise', 'Décroisés coup droit', 'fond_de_court', 'coup_droit', 'decroise', true, 'duo', '{raquette,balles,filet}', 'moderee', '{tactique}', 2, '{"mode":"balls","value":20,"sets":2}', 'Frappe le coup droit décroisé (changement de direction) depuis le centre.', 'Le décroisé se joue balle un peu plus haute pour ne pas manquer.'),
  ('drill_panier_fh', 'Panier coup droit', 'fond_de_court', 'coup_droit', null, false, 'solo', '{raquette,balles,panier}', 'moderee', '{technique}', 1, '{"mode":"balls","value":40,"sets":2}', 'Depuis un panier, enchaîne les coups droits sur cible.', 'Sans partenaire : auto-alimentation ou ball machine. Qualité avant quantité.'),
  ('drill_panier_bh', 'Panier revers', 'fond_de_court', 'revers', null, false, 'solo', '{raquette,balles,panier}', 'moderee', '{technique}', 1, '{"mode":"balls","value":40,"sets":2}', 'Depuis un panier, enchaîne les revers sur cible.', 'Fixe le point d''impact, replace-toi entre chaque balle.'),
  ('drill_mur_rally', 'Échanges au mur', 'fond_de_court', 'mixte', null, false, 'solo', '{raquette,balles,mur}', 'moderee', '{regularite}', 1, '{"mode":"time","value":360,"sets":1}', 'Enchaîne coups droits et revers contre un mur.', 'Le mur ne pardonne pas : rythme et régularité assurés.'),
  -- Service / retour
  ('drill_service_flat', 'Service à plat (cibles)', 'service_retour', 'service', null, false, 'solo', '{raquette,balles,cible,panier}', 'moderee', '{technique}', 1, '{"mode":"balls","value":20,"sets":2}', 'Séries de services à plat en visant des cibles dans le carré.', 'Lancer de balle régulier, extension complète, relâche le poignet.'),
  ('drill_service_kick', 'Service lifté / slicé', 'service_retour', 'service', null, false, 'solo', '{raquette,balles,panier}', 'moderee', '{technique}', 2, '{"mode":"balls","value":15,"sets":2}', 'Travaille les effets au service (lift, slice).', 'Brosse la balle ; la vitesse viendra avec la technique.'),
  ('drill_service_zones', 'Service par zones', 'service_retour', 'service', null, false, 'solo', '{raquette,balles,cible,panier}', 'moderee', '{tactique}', 2, '{"mode":"balls","value":24,"sets":2}', 'Alterne les zones : T, extérieur, sur le corps.', 'Même rituel quelle que soit la zone pour ne pas te trahir.'),
  ('drill_retour', 'Retour de service', 'service_retour', 'mixte', null, true, 'duo', '{raquette,balles,filet}', 'moderee', '{technique,tactique}', 2, '{"mode":"balls","value":20,"sets":2}', 'Le partenaire sert, tu travailles le retour (bloc puis agressif).', 'Split-step au moment de la frappe adverse, prise courte.'),
  ('drill_service_plus_one', 'Service + 1er coup', 'service_retour', 'service', null, true, 'duo', '{raquette,balles,filet}', 'elevee', '{tactique}', 2, '{"mode":"reps","value":10,"sets":2}', 'Sers puis enchaîne un coup droit décisif (schéma service+1).', 'Anticipe le retour probable et place-toi pour le coup droit.'),
  -- Volée
  ('drill_volee_fh_bh', 'Volées coup droit / revers', 'volee', 'volee', null, true, 'duo', '{raquette,balles,filet}', 'moderee', '{technique}', 1, '{"mode":"balls","value":30,"sets":2}', 'Au filet, alterne volées coup droit et revers en coopératif.', 'Bloque la balle devant toi, pas d''armé, jambes fléchies.'),
  ('drill_panier_volee', 'Panier volées (réflexes)', 'volee', 'volee', null, false, 'solo', '{raquette,balles,panier}', 'elevee', '{technique,physique}', 1, '{"mode":"balls","value":40,"sets":2}', 'Volées rapprochées au panier pour les réflexes au filet.', 'Raquette haute et devant, regarde la balle jusqu''au tamis.'),
  ('drill_montee_volee', 'Montée-volée', 'volee', 'volee', 'montee_volee', true, 'duo', '{raquette,balles,filet}', 'elevee', '{tactique,physique}', 2, '{"mode":"reps","value":12,"sets":2}', 'Approche + volée : frappe, monte, conclus au filet.', 'Split-step à chaque frappe adverse avant de poursuivre la montée.'),
  ('drill_passing', 'Passing / volée', 'volee', 'mixte', null, true, 'duo', '{raquette,balles,filet}', 'elevee', '{tactique}', 3, '{"mode":"reps","value":12,"sets":2}', 'Un monte au filet, l''autre tente le passing.', 'Passeur : vise les pieds ou joue le lob. Volleyeur : couvre la ligne.'),
  ('drill_smash', 'Lob + smash', 'volee', 'smash', null, true, 'duo', '{raquette,balles,filet}', 'moderee', '{technique}', 2, '{"mode":"reps","value":10,"sets":2}', 'Le partenaire lobe, tu conclus au smash.', 'Place-toi sous la balle, main libre pointée, frappe en extension.'),
  -- Déplacement / physique sur le court
  ('drill_suicides', 'Sprints lignes (suicides)', 'deplacement', null, null, false, 'solo', '{plots}', 'elevee', '{physique}', 1, '{"mode":"reps","value":4,"sets":2}', 'Sprints aller-retour sur les lignes du court, touche chaque ligne.', 'Appuis courts, change de direction bas sur les jambes.'),
  ('drill_split_step_court', 'Split-step + déplacement latéral', 'deplacement', null, null, false, 'solo', '{}', 'moderee', '{physique}', 1, '{"mode":"time","value":240,"sets":1}', 'Enchaîne split-step et déplacements latéraux le long de la ligne de fond.', 'Le split-step doit être un petit sursaut d''armement, pas un saut haut.'),
  ('drill_cone_react', 'Réaction aux cônes', 'deplacement', null, null, false, 'solo', '{plots}', 'moderee', '{physique}', 1, '{"mode":"reps","value":8,"sets":2}', 'Pars toucher un cône annoncé/au hasard puis reviens au centre.', 'Explosivité du premier appui, replacement immédiat.'),
  ('drill_spider', 'Course de l''araignée', 'deplacement', null, null, false, 'solo', '{balles}', 'elevee', '{physique}', 2, '{"mode":"reps","value":3,"sets":2}', 'Va chercher les balles aux 5 points du court et ramène-les une à une.', 'Chronomètre-toi pour te situer et progresser.'),
  -- Jeu / tactique
  ('drill_points_diag', 'Points en diagonale', 'jeu', 'mixte', 'diagonale', true, 'duo', '{raquette,balles,filet}', 'elevee', '{tactique}', 2, '{"mode":"time","value":480,"sets":1}', 'Points joués uniquement dans les diagonales (court réduit).', 'Construis le point, ne cherche pas le coup gagnant trop tôt.'),
  ('drill_points_service', 'Points avec service', 'jeu', 'mixte', null, true, 'duo', '{raquette,balles,filet}', 'elevee', '{tactique}', 2, '{"mode":"time","value":600,"sets":1}', 'Points classiques démarrés au service, comme en match.', 'Applique un plan : où tu sers, quel premier coup.'),
  ('drill_tie_break', 'Tie-break', 'jeu', 'mixte', null, true, 'duo', '{raquette,balles,filet}', 'elevee', '{tactique}', 1, '{"mode":"time","value":600,"sets":1}', 'Joue un jeu décisif complet pour finir sur de l''intensité.', 'Gère chaque point, reste positif entre les points.'),
  -- Retour au calme
  ('drill_cool_rally', 'Échanges cool', 'retour_au_calme', 'mixte', null, false, 'solo', '{raquette,balles}', 'faible', '{regularite}', 1, '{"mode":"time","value":300,"sets":1}', 'Échanges tranquilles ou au mur pour redescendre en intensité.', 'Respire, relâche, sensations avant de ranger la raquette.'),
  ('drill_stretch', 'Étirements', 'retour_au_calme', null, null, false, 'solo', '{}', 'faible', '{}', 1, '{"mode":"time","value":300,"sets":1}', 'Étirements des principaux groupes (épaules, dos, jambes).', 'Tiens chaque étirement 20–30 s sans à-coups.')
on conflict (id) do nothing;
