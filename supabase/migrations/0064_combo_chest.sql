-- 0064_combo_chest.sql — le COFFRE de fin de Défi 360 est conservé SUR le défi.
--
-- ⚠️ POURQUOI. Le coffre ne vivait que dans la boîte 📬 de l'Aventure, qui ne garde que
-- les 30 derniers messages. Mesuré sur un compte actif au 2026-09-13 : 21 messages, le
-- plus ancien vieux de deux jours — les coffres des 360 précédents avaient déjà disparu,
-- et avec eux toute trace de ce qu'ils contenaient. On ne pouvait pas « revoir » un
-- coffre, seulement le voir passer.
--
-- ⚠️ ET LA BOÎTE ÉTAIT AUSSI LA SEULE PREUVE DU VERSEMENT : le balayage de rattrapage
-- vérifiait l'existence du message. Un message chassé par 30 plus récents, dans la
-- fenêtre de rattrapage, aurait fait verser le coffre une seconde fois. La colonne sert
-- désormais de preuve durable.
--
-- Additive : `null` = aucun coffre (défi en cours, abandonné, ou bouclé avant le coffre).
alter table public.combo_challenges add column if not exists chest jsonb;

-- Rattrapage : les coffres dont le message est ENCORE dans la boîte. Les autres sont
-- perdus — on n'invente pas leur contenu (le niveau du joueur au bouclage n'est connu
-- que par le message).
update public.combo_challenges cc
set chest = jsonb_build_object(
  'gold', coalesce((m->>'gold')::int, 0),
  'energy', coalesce((m->>'energy')::int, 0),
  'scrap', coalesce((m->>'scrap')::int, 0),
  'summonStones', coalesce((m->>'summonStones')::int, 0),
  'keys', coalesce((m->>'key')::int, 0),
  'level', coalesce((m->>'level')::int, 1),
  'at', coalesce((m->>'resolvedAt')::bigint, 0)
)
from public.characters ch, jsonb_array_elements(ch.messages) m
where ch.user_id = cc.user_id
  and m->>'id' = 'chest:' || cc.id::text
  and cc.chest is null;
