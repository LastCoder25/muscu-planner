// 🔒 RGPD — la politique de confidentialité, écrite UNE fois et FIDÈLE AU CODE (audit 2026-10-15).
//
// La page `/privacy` ne fait que peindre ce module. Les durées de conservation vivent ici, et
// la purge planifiée (migration SQL) comme ses tests les lisent : une durée annoncée qui ne
// serait pas appliquée serait un mensonge, et une purge non annoncée, une surprise.
//
// ⚠️ Les mentions légales (responsable, contact) viennent de l'environnement (`APP_LEGAL_*`,
// `.env` / Vercel) : jamais en dur, et « à compléter » plutôt qu'une information inventée.

/** Version du texte. L'augmenter redemande le consentement à tous les comptes. */
export const PRIVACY_VERSION = 1;

/** Ce qu'on affiche quand une mention n'est pas renseignée. */
export const TO_COMPLETE = 'à compléter';

export interface LegalInfo {
  controller: string;
  contact: string;
}

export function legalInfo(
  env: Partial<Record<'APP_LEGAL_NAME' | 'APP_LEGAL_CONTACT', string>>,
): LegalInfo {
  const v = (s: string | undefined) => (s && s.trim() ? s.trim() : TO_COMPLETE);
  return { controller: v(env.APP_LEGAL_NAME), contact: v(env.APP_LEGAL_CONTACT) };
}

/** ⏳ Durées de conservation appliquées par le code (jours). */
export const RETENTION = {
  /** Un compte sans connexion depuis ce délai est supprimé, avec toutes ses données. */
  inactiveAccountDays: 3 * 365,
  /** Notifications programmées, une fois envoyées. */
  sentPushDays: 2,
  /** Journaux techniques des tâches planifiées. */
  jobLogDays: 3,
} as const;

export interface DataItem {
  what: string;
  why: string;
  basis: string;
}

/** Les données collectées, pourquoi, et sur quelle base légale. */
export const DATA_ITEMS: readonly DataItem[] = [
  {
    what: 'Adresse e-mail et mot de passe (chiffré par Supabase)',
    why: 'Créer ton compte et te connecter',
    basis: 'Exécution du service',
  },
  {
    what: 'Profil : prénom, sexe, année de naissance, taille, poids, niveau, objectif, disponibilités, matériel, contraintes',
    why: 'Adapter les séances et les objectifs à toi',
    basis: 'Consentement (accepté à l’inscription)',
  },
  {
    what: 'Séances, bilans, défis, sorties cardio, tennis',
    why: 'Suivre tes progrès et calculer ton XP',
    basis: 'Exécution du service',
  },
  {
    what: 'Suivi corporel : poids, sommeil, mensurations',
    why: 'Afficher ton évolution (donnée de santé, facultative)',
    basis: 'Consentement explicite — tu la saisis seulement si tu le veux',
  },
  {
    what: 'Personnage de jeu : pseudo, progression, objets',
    why: 'Faire tourner la partie Aventure',
    basis: 'Exécution du service',
  },
  {
    what: 'Amis, défis partagés, boss entre amis, classement (pseudo et niveaux)',
    why: 'Les fonctions sociales — visibles par tes amis, ou par tous pour le classement',
    basis: 'Consentement (tu choisis tes amis ; le classement publie ton pseudo et tes niveaux)',
  },
  {
    what: 'Abonnement aux notifications (adresse technique du navigateur)',
    why: 'T’envoyer les notifications que tu as activées',
    basis: 'Consentement (désactivable depuis la Base)',
  },
  {
    what: 'Position approximative (seulement si tu l’autorises pour la météo)',
    why: 'Afficher la météo de ton créneau de sortie — non enregistrée sur nos serveurs',
    basis: 'Consentement (autorisation du navigateur)',
  },
];

export interface Processor {
  name: string;
  role: string;
}

/** Les prestataires réellement utilisés (vérifiés dans le code). */
export const PROCESSORS: readonly Processor[] = [
  {
    name: 'Supabase (Irlande, UE)',
    role: 'Base de données, comptes, fichiers, envoi des notifications',
  },
  { name: 'Vercel', role: 'Hébergement de l’application' },
  { name: 'Open-Meteo', role: 'Prévisions météo (reçoit ta position si tu l’autorises)' },
  { name: 'BigDataCloud', role: 'Nom de la ville de ta position (météo)' },
  { name: 'Google Fonts', role: 'Polices d’écriture (reçoit ton adresse IP)' },
  {
    name: 'Ton navigateur (Google, Apple…)',
    role: 'Dictée vocale des commentaires et acheminement des notifications',
  },
];

/** Les durées en clair, telles que la page les affiche. */
export function retentionLines(): string[] {
  return [
    `Ton compte et ses données : tant que tu l’utilises. Sans connexion pendant ${Math.round(RETENTION.inactiveAccountDays / 365)} ans, il est supprimé automatiquement.`,
    `Notifications programmées : effacées ${RETENTION.sentPushDays} jours après leur envoi.`,
    `Journaux techniques : effacés après ${RETENTION.jobLogDays} jours.`,
    'Préférences d’affichage (thème, filtres) : stockées dans ton navigateur seulement.',
  ];
}

/** Le consentement d'un compte, lu dans ses métadonnées. À jour = la version courante. */
export function hasConsented(meta: Record<string, unknown> | null | undefined): boolean {
  const v = meta?.privacy_version;
  return (
    typeof v === 'number' && v >= PRIVACY_VERSION && typeof meta?.privacy_accepted_at === 'string'
  );
}

export function consentMeta(now: Date): { privacy_version: number; privacy_accepted_at: string } {
  return { privacy_version: PRIVACY_VERSION, privacy_accepted_at: now.toISOString() };
}
