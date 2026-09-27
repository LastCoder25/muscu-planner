// levelConfig.ts — couche d'adaptation par niveau (cf. contrat v1.0).
// experience.level → level_config → comportement de toute l'app.
// Dérivé du niveau, sans surcharge : `overridable` a été retiré en v0.1202 (aucun code ne
// permettait d'écraser un champ — la promesse n'était pas tenue).
import type { Level, LevelConfig } from './types';
import { SCHEMA_VERSION } from './types';

export function deriveLevelConfig(level: Level): LevelConfig {
  const base = {
    schema_version: SCHEMA_VERSION,
    type: 'level_config' as const,
    derived_from: level,
  };

  switch (level) {
    case 'debutant':
      return {
        ...base,
        default_progression: 'linear',
        effort_signal: 'simple',
        coach_history_depth: 1,
        program_mode: 'guided',
      };
    case 'avance':
      return {
        ...base,
        default_progression: 'double',
        effort_signal: 'rir',
        coach_history_depth: 4,
        program_mode: 'free',
      };
    case 'intermediaire':
    default:
      return {
        ...base,
        default_progression: 'double',
        effort_signal: 'rir_optional',
        coach_history_depth: 2,
        program_mode: 'assisted',
      };
  }
}
