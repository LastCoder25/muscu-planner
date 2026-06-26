// objectives.ts — objectifs guidés (libellé + guidance + repère reps/repos).
// Repères cohérents avec OBJECTIVE_CFG de src/lib/programBuilder.ts.
import type { Objective } from '@/lib/types';

export interface ObjectiveOption {
  value: Objective;
  label: string;
  desc: string;
  reps: string;
}

export const OBJECTIVES: ObjectiveOption[] = [
  {
    value: 'force',
    label: 'Force',
    desc: 'Soulever lourd. Peu de répétitions, longs repos.',
    reps: '4–6 reps · repos ~3 min',
  },
  {
    value: 'hypertrophie',
    label: 'Hypertrophie (prise de muscle)',
    desc: 'Construire du volume musculaire. Le meilleur compromis pour la plupart.',
    reps: '8–12 reps · repos ~90 s',
  },
  {
    value: 'endurance',
    label: 'Endurance',
    desc: 'Tenir l’effort dans la durée. Séries longues, repos courts.',
    reps: '15–20 reps · repos ~45 s',
  },
  {
    value: 'remise_en_forme',
    label: 'Remise en forme',
    desc: 'Reprendre en douceur, bouger régulièrement. Charges modérées.',
    reps: '10–15 reps · repos ~75 s',
  },
  {
    value: 'perte_de_gras',
    label: 'Perte de gras',
    desc: 'Garder du muscle en dépensant. Rythme soutenu, repos courts.',
    reps: '12–15 reps · repos ~60 s',
  },
];
