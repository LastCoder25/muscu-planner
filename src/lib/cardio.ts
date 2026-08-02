// cardio.ts — générateur de séances de course basé sur la VMA (Vitesse Maximale
// Aérobie, km/h). Dérive les allures par zone et compose des séances structurées
// (échauffement → corps → retour au calme). Pur et testable.
import type { CardioPhase, Level } from './types';

export type RunSessionType =
  | 'endurance'
  | 'footing_recup'
  | 'fractionne_court'
  | 'fractionne_long'
  | 'tempo'
  | 'sortie_longue';

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

export interface RunSessionOptions {
  level?: Level;
  duration_min?: number; // pour endurance / tempo / sortie longue
}

const NAMES: Record<RunSessionType, string> = {
  endurance: 'Endurance fondamentale',
  footing_recup: 'Footing récupération',
  fractionne_court: 'Fractionné court (VMA)',
  fractionne_long: 'Fractionné long',
  tempo: 'Tempo / seuil',
  sortie_longue: 'Sortie longue',
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
  }

  return { name: NAMES[type], phases };
}
