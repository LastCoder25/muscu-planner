// coach.ts — pont avec l'IA externe.
// export : on sérialise un coach_request que l'utilisateur colle dans ChatGPT.
// import : on valide le JSON renvoyé et on le réduit à une session propre.
import type { CoachRequest, Profile, Session, SessionLog } from './types';
import { SCHEMA_VERSION } from './types';

const SUPPORTED = ['1.0'];

export function buildCoachRequest(
  profile: Profile,
  history: SessionLog[],
  lastSession?: Session,
  instruction?: string,
): CoachRequest {
  return {
    schema_version: SCHEMA_VERSION,
    type: 'coach_request',
    profile,
    history,
    last_session: lastSession,
    instruction: instruction ?? defaultInstruction(profile),
  };
}

function defaultInstruction(p: Profile): string {
  return [
    `Génère la prochaine séance pour un objectif ${p.objective}.`,
    `Respecte la progression et tiens compte des notes de difficulté (1 = facile, 4 = échec).`,
    p.constraints?.injuries?.length ? `Contraintes : ${p.constraints.injuries.join(', ')}.` : '',
    `Réponds UNIQUEMENT avec un objet JSON de type "session" conforme au schéma, sans aucun texte autour.`,
  ].filter(Boolean).join(' ');
}

/** Valide un JSON collé (IA ou fichier) et le normalise en Session. Lève une erreur lisible sinon. */
export function validateImportedSession(raw: string): Session {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('JSON invalide : impossible de lire le contenu collé.');
  }

  if (obj.type !== 'session') {
    throw new Error(`Type inattendu (« ${String(obj.type ?? '?')} ») — attendu : une séance.`);
  }
  if (!SUPPORTED.includes(String(obj.schema_version))) {
    throw new Error(`Version de schéma non gérée : ${String(obj.schema_version)}.`);
  }
  const exercises = obj.exercises;
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new Error('La séance ne contient aucun exercice.');
  }

  // whitelist stricte : toute clé inconnue est ignorée
  return {
    schema_version: String(obj.schema_version),
    type: 'session',
    id: typeof obj.id === 'string' ? obj.id : crypto.randomUUID(),
    name: String(obj.name ?? 'Séance importée'),
    split: obj.split as string | undefined,
    objective: obj.objective as Session['objective'],
    level: obj.level as Session['level'],
    estimated_duration_min: obj.estimated_duration_min as number | undefined,
    source: 'ai',
    created_at: typeof obj.created_at === 'string' ? obj.created_at : new Date().toISOString(),
    exercises: exercises.map((e: Record<string, unknown>) => {
      const target = (e.target ?? {}) as Record<string, unknown>;
      return {
        id: String(e.id),
        name: String(e.name),
        muscle_primary: e.muscle_primary as string | undefined,
        muscle_secondary: (e.muscle_secondary as string[]) ?? [],
        equipment: e.equipment as string | undefined,
        progression: (e.progression as Session['exercises'][number]['progression']) ?? 'double',
        rest_seconds: Number(e.rest_seconds ?? 90),
        target: {
          sets: Number(target.sets ?? 3),
          reps_min: Number(target.reps_min ?? 8),
          reps_max: Number(target.reps_max ?? 12),
          load_kg: target.load_kg as number | undefined,
          load: target.load as 'bodyweight' | undefined,
          added_kg: target.added_kg as number | undefined,
          rir_target: target.rir_target as number | undefined,
        },
        alternatives: (e.alternatives as string[]) ?? [],
        notes: (e.notes as string) ?? '',
      };
    }),
  };
}
