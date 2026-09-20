-- 0081_gacha.sql — 🎰 L'ÉTAT DU TIRAGE DE CHAMPIONS.
--
-- Additive, comme toute migration de ce projet. Une seule colonne JSONB, parce qu'il n'y a
-- qu'UNE chose à retenir entre deux tirages : le PITY.
--
-- ⚠️ LE PITY DOIT PERSISTER, ce n'est pas du confort. C'est la garantie anti-malchance
-- (soft pity au 75e tirage, garanti au 90e), et ici il n'y a **aucun argent réel** pour
-- compenser une série noire : un compteur qui repart à zéro à chaque rechargement
-- rendrait la garantie inatteignable et le gacha injouable pour un joueur malchanceux.
--
-- ⚠️ La COLLECTION, elle, n'est pas ici : un champion EST un `Adventurer` (v0.942), donc
-- il vit dans `characters.adventurers` — c'est ce qui lui donne gratuitement les convois,
-- les camps, la défense, l'équipement et les compagnons.
--
-- Forme : { "sinceTop": 0, "sinceFloor": 0, "pulls": 0 }
--   sinceTop   — tirages depuis la dernière rareté maximale
--   sinceFloor — tirages depuis le dernier épique ou mieux
--   pulls      — total tiré (affichage seul)
alter table public.characters
  add column if not exists gacha jsonb;
