-- 0007_feedback_manage.sql — gestion du backlog par tous les utilisateurs connectés
-- (app perso à 2 = testeurs/admin). Lecture + mise à jour du statut de TOUS les tickets.
-- L'insert/delete « own » (policy feedback_own de 0005) reste inchangé.

create policy "feedback_read_all" on public.feedback
  for select to authenticated using (true);

create policy "feedback_update_all" on public.feedback
  for update to authenticated using (true) with check (true);
