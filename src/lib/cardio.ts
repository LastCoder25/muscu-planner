// cardio.ts — générateur de séances de course basé sur la VMA (Vitesse Maximale
// Aérobie, km/h). Dérive les allures par zone et compose des séances structurées
// (échauffement → corps → retour au calme). Pur et testable.
import type {
  CardioPhase,
  CardioPlan,
  CardioPlanSession,
  CardioPlanWeek,
  Level,
  RaceType,
} from './types';
import { SCHEMA_VERSION } from './types';

export type RunSessionType =
  | 'endurance'
  | 'footing_recup'
  | 'fractionne_court'
  | 'fractionne_long'
  | 'tempo'
  | 'sortie_longue'
  | 'cotes' // répétitions en côte (spécifique trail / puissance)
  | 'seuil_vallonne' // tempo sur parcours vallonné (trail)
  | 'sortie_trail'; // sortie longue nature avec dénivelé (D+)

/** VMA estimée par le test demi-Cooper (distance max en 6 min) : VMA = d(m) / 100. */
export function vmaFromDemiCooper(distanceM: number): number {
  return Math.round((distanceM / 100) * 10) / 10;
}

/** Allure « m:ss/km » à un pourcentage de VMA. */
export function paceFromVma(vma: number, pct: number): string {
  const speed = vma * pct; // km/h
  if (speed <= 0) return '—';
  const secPerKm = Math.round(3600 / speed);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function repsFor(level: Level | undefined, base: number): number {
  if (level === 'debutant') return Math.max(3, base - 2);
  if (level === 'avance') return base + 2;
  return base;
}

export interface HillDef {
  length_m: number;
  grade_pct?: number;
}

export interface RunSessionOptions {
  level?: Level;
  duration_min?: number; // pour endurance / tempo / sortie longue
  hill?: HillDef; // côte disponible (séance 'cotes')
  elevationTargetM?: number; // D+ visé (sortie_trail) — informatif
}

const NAMES: Record<RunSessionType, string> = {
  endurance: 'Endurance fondamentale',
  footing_recup: 'Footing récupération',
  fractionne_court: 'Fractionné court (VMA)',
  fractionne_long: 'Fractionné long',
  tempo: 'Tempo / seuil',
  sortie_longue: 'Sortie longue',
  cotes: 'Côtes (puissance)',
  seuil_vallonne: 'Seuil vallonné',
  sortie_trail: 'Sortie trail (D+)',
};

/**
 * Compose une séance de course structurée aux allures issues de la VMA.
 * @returns { name, phases } — les phases alimentent le constructeur / le log.
 */
export function buildRunSession(
  type: RunSessionType,
  vma: number,
  opts: RunSessionOptions = {},
): { name: string; phases: CardioPhase[] } {
  const p = (pct: number) => paceFromVma(vma, pct);
  const phases: CardioPhase[] = [];

  const warmup = (min: number): CardioPhase => ({
    kind: 'echauffement',
    intensity: 'facile',
    duration_sec: min * 60,
    pace: p(0.65),
  });
  const cooldown = (min: number): CardioPhase => ({
    kind: 'retour_calme',
    intensity: 'facile',
    duration_sec: min * 60,
    pace: p(0.55),
  });

  switch (type) {
    case 'endurance': {
      const total = opts.duration_min ?? 45;
      phases.push(warmup(10));
      phases.push({
        kind: 'endurance',
        intensity: 'modere',
        duration_sec: Math.max(10, total - 15) * 60,
        pace: p(0.7),
      });
      phases.push(cooldown(5));
      break;
    }
    case 'footing_recup': {
      const total = opts.duration_min ?? 35;
      phases.push({
        kind: 'endurance',
        intensity: 'facile',
        duration_sec: total * 60,
        pace: p(0.6),
      });
      break;
    }
    case 'fractionne_court': {
      phases.push(warmup(15));
      phases.push({
        kind: 'intervalle',
        intensity: 'max',
        reps: repsFor(opts.level, 10),
        work_m: 400,
        rest_sec: 60,
        pace: p(1.0), // ~100 % VMA
      });
      phases.push(cooldown(10));
      break;
    }
    case 'fractionne_long': {
      phases.push(warmup(15));
      phases.push({
        kind: 'intervalle',
        intensity: 'soutenu',
        reps: repsFor(opts.level, 5),
        work_m: 1000,
        rest_sec: 120,
        pace: p(0.95),
      });
      phases.push(cooldown(10));
      break;
    }
    case 'tempo': {
      const block = opts.duration_min ?? 20;
      phases.push(warmup(15));
      phases.push({
        kind: 'tempo',
        intensity: 'soutenu',
        duration_sec: block * 60,
        pace: p(0.85), // allure seuil
      });
      phases.push(cooldown(10));
      break;
    }
    case 'sortie_longue': {
      const total = opts.duration_min ?? 75;
      phases.push(warmup(5));
      phases.push({
        kind: 'endurance',
        intensity: 'modere',
        duration_sec: Math.max(20, total - 10) * 60,
        pace: p(0.68),
      });
      phases.push(cooldown(5));
      break;
    }
    case 'cotes': {
      phases.push(warmup(15));
      const reps = repsFor(opts.level, 8);
      const hill = opts.hill;
      if (hill?.length_m) {
        phases.push({
          kind: 'intervalle',
          intensity: 'max',
          reps,
          work_m: Math.round(hill.length_m),
          rest_sec: Math.max(45, Math.round(hill.length_m / 2)), // retour en récup
          pace: p(1.0),
          note: `en côte${hill.grade_pct ? ` ~${hill.grade_pct} %` : ''} — récup en descente`,
        });
      } else {
        phases.push({
          kind: 'intervalle',
          intensity: 'max',
          reps,
          work_sec: 40,
          rest_sec: 90,
          pace: p(1.05),
          note: 'en côte — récup en descente',
        });
      }
      phases.push(cooldown(10));
      break;
    }
    case 'seuil_vallonne': {
      const block = opts.duration_min ?? 20;
      phases.push(warmup(15));
      phases.push({
        kind: 'tempo',
        intensity: 'soutenu',
        duration_sec: block * 60,
        pace: p(0.85),
        note: 'sur parcours vallonné',
      });
      phases.push(cooldown(10));
      break;
    }
    case 'sortie_trail': {
      const total = opts.duration_min ?? 90;
      phases.push(warmup(5));
      phases.push({
        kind: 'endurance',
        intensity: 'modere',
        duration_sec: Math.max(20, total - 10) * 60,
        pace: p(0.6), // plus lent : terrain + D+
        note: opts.elevationTargetM
          ? `terrain vallonné (~${opts.elevationTargetM} m D+)`
          : 'terrain vallonné (D+)',
      });
      phases.push(cooldown(5));
      break;
    }
  }

  return { name: NAMES[type], phases };
}

// ————————————————— Plan d'entraînement vers une course —————————————————

function isoAddDays(iso: string, d: number): string {
  const dt = new Date(`${iso}T00:00:00`);
  dt.setDate(dt.getDate() + d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function isoDiffDays(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

const RACE_LABELS: Record<RaceType, string> = {
  '5k': '5 km',
  '10k': '10 km',
  semi: 'Semi-marathon',
  marathon: 'Marathon',
  trail: 'Trail',
};
// Durée max de la sortie longue (min) selon l'objectif.
const LONG_MAX_MIN: Record<RaceType, number> = {
  '5k': 55,
  '10k': 70,
  semi: 100,
  marathon: 130,
  trail: 150,
};
const DAY_OFFSETS: Record<number, number[]> = {
  2: [1, 5],
  3: [0, 2, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
};

// Séances de « qualité » qui tournent semaine après semaine (variété) + type de
// sortie longue, selon l'objectif. Le trail privilégie côtes / vallonné / D+.
function qualityRotation(raceType: RaceType): RunSessionType[] {
  if (raceType === 'trail') return ['cotes', 'fractionne_long', 'seuil_vallonne'];
  if (raceType === 'marathon' || raceType === 'semi')
    return ['fractionne_long', 'tempo', 'fractionne_court'];
  return ['fractionne_court', 'fractionne_long', 'tempo']; // 5k / 10k
}
function longType(raceType: RaceType): RunSessionType {
  return raceType === 'trail' ? 'sortie_trail' : 'sortie_longue';
}
// Trame de la semaine w : endurance(s) + qualité(s) tournantes + sortie longue.
function weekSlots(spw: number, w: number, raceType: RaceType): RunSessionType[] {
  const rot = qualityRotation(raceType);
  const q1 = rot[w % rot.length]!;
  const q2 = rot[(w + 1) % rot.length]!;
  const lng = longType(raceType);
  if (spw <= 2) return [q1, lng];
  if (spw === 3) return ['endurance', q1, lng];
  if (spw === 4) return ['endurance', q1, q2, lng];
  return ['endurance', q1, 'endurance', q2, lng];
}

export interface RunPlanOptions {
  raceType: RaceType;
  raceDate: string; // YYYY-MM-DD
  startDate: string; // YYYY-MM-DD
  sessionsPerWeek: number; // 2..5
  vma: number;
  level?: Level;
  distanceKm?: number;
  elevationM?: number;
  hills?: HillDef[]; // côtes disponibles (séances de côtes du plan trail)
  newId: () => string; // fournisseur d'id (crypto.randomUUID côté app)
}

/**
 * Construit un plan périodisé (Base → Développement → Affûtage) vers une course.
 * La sortie longue monte en charge puis redescend à l'affûtage ; le jour J est
 * une séance `is_race`. Pur : les id et la date de création sont injectés.
 */
export function buildRunPlan(opts: RunPlanOptions): CardioPlan {
  const spw = Math.min(5, Math.max(2, Math.round(opts.sessionsPerWeek)));
  const offsets = DAY_OFFSETS[spw]!;
  const longMax = LONG_MAX_MIN[opts.raceType];
  const hills = opts.hills ?? [];

  const days = Math.max(7, isoDiffDays(opts.startDate, opts.raceDate));
  const raceWeek = Math.floor(days / 7);
  const totalWeeks = Math.min(24, raceWeek + 1);
  const taperWeeks = totalWeeks >= 8 ? 2 : 1;
  const buildEnd = totalWeeks - 1 - taperWeeks; // dernier index « charge »

  const isLong = (t: RunSessionType) => t === 'sortie_longue' || t === 'sortie_trail';
  const isBlockType = (t: RunSessionType) => t === 'tempo' || t === 'seuil_vallonne';

  const weeks: CardioPlanWeek[] = [];
  for (let w = 0; w < totalWeeks; w++) {
    const isTaper = w > buildEnd;
    const isBuild = !isTaper && w > Math.floor(buildEnd / 2);
    const label = isTaper ? 'Affûtage' : isBuild ? 'Développement' : 'Base';

    // Sortie longue : ~50 % du max en début, 100 % en fin de charge, réduite à l'affûtage.
    let longDur: number;
    if (isTaper) longDur = Math.round(longMax * 0.55);
    else longDur = Math.round(longMax * (0.5 + 0.5 * (buildEnd > 0 ? w / buildEnd : 1)));

    const slots = weekSlots(spw, w, opts.raceType);
    const sessions: CardioPlanSession[] = [];
    for (let i = 0; i < slots.length; i++) {
      const type = slots[i]!;
      const date = isoAddDays(opts.startDate, w * 7 + (offsets[i] ?? 0));
      if (isoDiffDays(date, opts.raceDate) < 0) continue; // après la course → ignoré

      let durOpt: number | undefined;
      if (isLong(type)) durOpt = longDur;
      else if (isBlockType(type)) durOpt = isTaper ? 15 : 20;
      else if (type === 'endurance') durOpt = 45;

      // Côte tournante (variété) + D+ visé sur la sortie trail.
      const hill = type === 'cotes' && hills.length ? hills[w % hills.length] : undefined;
      const built = buildRunSession(type, opts.vma, {
        ...(opts.level ? { level: opts.level } : {}),
        ...(durOpt ? { duration_min: durOpt } : {}),
        ...(hill ? { hill } : {}),
        ...(type === 'sortie_trail' ? { elevationTargetM: Math.round(longDur * 7) } : {}),
      });
      sessions.push({
        id: opts.newId(),
        date,
        session_type: type,
        name: built.name,
        phases: built.phases,
        duration_min: durOpt ?? undefined,
      });
    }
    weeks.push({ index: w, label, sessions });
  }

  // Jour J : séance de course dans la dernière semaine.
  const last = weeks[weeks.length - 1];
  if (last) {
    last.sessions = last.sessions.filter((s) => s.date !== opts.raceDate);
    last.sessions.push({
      id: opts.newId(),
      date: opts.raceDate,
      session_type: 'course',
      name: `🏁 Course : ${RACE_LABELS[opts.raceType]}`,
      phases: [],
      is_race: true,
    });
    last.sessions.sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  return {
    schema_version: SCHEMA_VERSION,
    type: 'cardio_plan',
    id: opts.newId(),
    name: `Plan ${RACE_LABELS[opts.raceType]}`,
    goal: {
      race_type: opts.raceType,
      ...(opts.distanceKm ? { distance_km: opts.distanceKm } : {}),
      ...(opts.elevationM ? { elevation_m: opts.elevationM } : {}),
      race_date: opts.raceDate,
    },
    start_date: opts.startDate,
    sessions_per_week: spw,
    ...(opts.level ? { level: opts.level } : {}),
    vma: opts.vma,
    weeks,
  };
}
