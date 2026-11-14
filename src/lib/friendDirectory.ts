// Annuaire ADMIN des amis (migr. 0117) : fusionne la liste des inscrits renvoyée par
// `admin_list_users` avec mes relations pour dire, pour chacun, ce qu'on peut faire.
// Pur : l'autorisation, elle, vit en base (`is_admin()`).

export interface DirectoryUser {
  user_id: string;
  /** Prénom du profil (« Joueur » si jamais renseigné). */
  name: string;
  /** Pseudo d'aventurier — null tant que la personne n'a pas créé son perso. */
  pseudo: string | null;
  has_character: boolean;
  created_at: string;
}

export type DirectoryState = 'none' | 'friend' | 'sent' | 'received';

export interface DirectoryRow {
  userId: string;
  /** Pseudo de jeu, sinon le prénom : le même repli que `friend_pseudos` côté base. */
  label: string;
  hasCharacter: boolean;
  state: DirectoryState;
  createdAt: string;
}

interface Relation {
  userId: string;
  status: 'pending' | 'accepted' | 'declined';
  incoming: boolean;
}

function stateOf(rel: Relation | undefined): DirectoryState {
  if (!rel) return 'none';
  if (rel.status === 'accepted') return 'friend';
  if (rel.status === 'pending') return rel.incoming ? 'received' : 'sent';
  // Refusée : la ligne existe encore (clé de paire unique), on ne peut donc pas redemander.
  return 'sent';
}

/** Les plus récents d'abord ; ceux qu'on peut encore ajouter avant les autres. */
export function buildDirectory(users: DirectoryUser[], relations: Relation[]): DirectoryRow[] {
  const rel = new Map(relations.map((r) => [r.userId, r]));
  return users
    .map((u) => ({
      userId: u.user_id,
      label: u.pseudo?.trim() || u.name.trim() || 'Joueur',
      hasCharacter: u.has_character,
      state: stateOf(rel.get(u.user_id)),
      createdAt: u.created_at,
    }))
    .sort(
      (a, b) =>
        Number(a.state !== 'none') - Number(b.state !== 'none') ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
}
