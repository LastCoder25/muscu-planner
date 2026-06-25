// levelConfig.ts — couche d'adaptation par niveau (cf. contrat v1.0).
// experience.level → level_config → comportement de toute l'app.
// Dérivé mais surchargeable : on peut écraser n'importe quel champ ensuite.
import type { Level, LevelConfig } from './types';
import { SCHEMA_VERSION } from './types';

export function deriveLevelConfig(level: Level): LevelConfig {
  const base = {
    schema_version: SCHEMA_VERSION,
    type: 'level_config' as const,
    derived_from: level,
    overridable: true,
  };

  switch (level) {
    case 'debutant':
      return {
        ...base,
        default_progression: 'linear',
        effort_signal: 'simple',
        coach_history_depth: 1,
        program_mode: 'guided',
        ui_density: 'comfortable',
        auto_deload: false,
      };
    case 'avance':
      return {
        ...base,
        default_progression: 'double',
        effort_signal: 'rir',
        coach_history_depth: 4,
        program_mode: 'free',
        ui_density: 'dense',
        auto_deload: true,
      };
    case 'intermediaire':
    default:
      return {
        ...base,
        default_progression: 'double',
        effort_signal: 'rir_optional',
        coach_history_depth: 2,
        program_mode: 'assisted',
        ui_density: 'standard',
        auto_deload: false,
      };
  }
}
