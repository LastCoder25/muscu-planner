// 📦 RGPD — les tables exportées par « Télécharger mes données » et la colonne qui désigne
// l'utilisateur dans chacune. ⚠️ À tenir à jour à chaque nouvelle table par utilisateur : un
// test vérifie que toute table créée dans les migrations avec une référence à auth.users est
// listée ici (sinon une donnée collectée échapperait au droit d'accès).

export interface ExportTable {
  table: string;
  /** Colonne(s) qui portent l'id de l'utilisateur ; plusieurs = OU. */
  cols: string[];
}

export const EXPORT_TABLES: readonly ExportTable[] = [
  { table: 'profiles', cols: ['user_id'] },
  { table: 'exercises', cols: ['owner'] },
  { table: 'sessions', cols: ['user_id'] },
  { table: 'session_logs', cols: ['user_id'] },
  { table: 'feedback', cols: ['user_id'] },
  { table: 'body_entries', cols: ['user_id'] },
  { table: 'challenges', cols: ['user_id'] },
  { table: 'achievements', cols: ['user_id'] },
  { table: 'drills', cols: ['owner'] },
  { table: 'drill_sessions', cols: ['user_id'] },
  { table: 'drill_logs', cols: ['user_id'] },
  { table: 'cardio_logs', cols: ['user_id'] },
  { table: 'characters', cols: ['user_id'] },
  { table: 'boss_contributions', cols: ['user_id'] },
  { table: 'combo_challenges', cols: ['user_id'] },
  { table: 'leaderboard', cols: ['user_id'] },
  { table: 'friendships', cols: ['requester_id', 'addressee_id'] },
  { table: 'shared_challenges', cols: ['created_by', 'invited_user'] },
  { table: 'push_subscriptions', cols: ['user_id'] },
  { table: 'scheduled_pushes', cols: ['user_id'] },
  { table: 'push_prefs', cols: ['user_id'] },
  { table: 'friend_bosses', cols: ['owner_id'] },
  { table: 'friend_boss_members', cols: ['user_id'] },
  { table: 'friend_boss_hits', cols: ['user_id'] },
  { table: 'weekly_quest_boards', cols: ['user_id'] },
];

export function exportFileName(now: Date): string {
  return `muscu-mes-donnees-${now.toISOString().slice(0, 10)}.json`;
}
