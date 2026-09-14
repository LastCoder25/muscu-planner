-- 0066 — LE PSEUDO DU PERSONNAGE NE SE MODIFIE PLUS (demandé par l'utilisateur).
-- Le crayon de renommage est retiré de l'écran, mais l'écran ne garantit rien : un onglet
-- resté sur une ancienne version, ou un appel direct à l'API, pourrait encore le changer.
-- La règle vit donc ici, là où aucun chemin client ne la contourne.
-- ⚠️ Seuls les appels d'un UTILISATEUR sont refusés (`auth.uid()` renseigné) : l'admin, via
-- la Management API ou le service role, garde la main pour corriger un pseudo à la demande.
create or replace function public.characters_pseudo_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and new.pseudo is distinct from old.pseudo then
    raise exception 'Le pseudo ne peut plus être modifié.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists characters_pseudo_immutable on public.characters;
create trigger characters_pseudo_immutable
  before update on public.characters
  for each row execute function public.characters_pseudo_immutable();
