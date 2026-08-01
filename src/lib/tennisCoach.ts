// tennisCoach.ts — pont IA pour le tennis.
// export : un prompt à coller dans une IA (ChatGPT…) décrivant le contrat
// `drill_session` + le vocabulaire ; import : un parseur TOLÉRANT qui accepte le
// JSON strict ou « lâche » et rattache les noms au catalogue (score, comme
// importSession.findLib). Aucune dépendance Vue/Supabase.
import type { DrillSession, PlannedDrill, DrillCategory, DrillShot, DrillFormat } from './types';
import { SCHEMA_VERSION } from './types';
import type { DrillDef } from './drills';

const CATEGORIES: DrillCategory[] = [
  'echauffement',
  'fond_de_court',
  'service_retour',
  'volee',
  'deplacement',
  'jeu',
  'retour_au_calme',
];
const SHOTS: DrillShot[] = ['coup_droit', 'revers', 'service', 'volee', 'smash', 'mixte'];

export interface CourtPromptOptions {
  theme?: string;
  duration_min?: number;
  withPartner?: boolean;
  level?: string;
}

/** Prompt à coller dans une IA pour obtenir une séance de tennis (JSON drill_session). */
export function buildCourtPrompt(opts: CourtPromptOptions = {}, catalog: DrillDef[] = []): string {
  const known = catalog
    .slice(0, 40)
    .map((d) => `- ${d.name} (${d.category}${d.shot ? `, ${d.shot}` : ''})`)
    .join('\n');
  return [
    `Tu es entraîneur de tennis. Compose une séance sur le court.`,
    `Paramètres : thème = ${opts.theme ?? 'complet'} ; durée ≈ ${opts.duration_min ?? 60} min ; ${opts.withPartner === false ? 'SANS partenaire (drills solo : panier, mur, service, physique)' : 'avec partenaire'} ; niveau = ${opts.level ?? 'intermédiaire'}.`,
    `Structure logique : échauffement → travail du thème → complément → déplacement/physique → jeu (si partenaire) → retour au calme.`,
    ``,
    `Réponds UNIQUEMENT avec un objet JSON, sans texte autour, de la forme :`,
    `{`,
    `  "type": "drill_session",`,
    `  "name": "…",`,
    `  "theme": "${opts.theme ?? 'complet'}",`,
    `  "with_partner": ${opts.withPartner === false ? 'false' : 'true'},`,
    `  "drills": [`,
    `    { "name": "…", "category": "<${CATEGORIES.join('|')}>", "shot": "<${SHOTS.join('|')}|null>",`,
    `      "pattern": "diagonale|longue_ligne|croise|decroise|montee_volee|null",`,
    `      "partner_required": true|false,`,
    `      "format": { "mode": "reps|time|balls", "value": <nombre>, "sets": <nombre> },`,
    `      "notes": "conseil court" }`,
    `  ]`,
    `}`,
    `Pour "time", value est en SECONDES. Tu peux t'inspirer de ces drills existants :`,
    known || '(catalogue indisponible)',
  ].join('\n');
}

/** Prompt pour une séance de PRÉPA PHYSIQUE tennis (JSON "session" muscu, poids du corps). */
export function buildPrepaPrompt(opts: { duration_min?: number; level?: string } = {}): string {
  return [
    `Tu es préparateur physique. Compose une séance de PRÉPA PHYSIQUE pour le tennis`,
    `(pliométrie, agilité/déplacements, gainage rotatif, explosivité), durée ≈ ${opts.duration_min ?? 30} min, niveau ${opts.level ?? 'intermédiaire'}.`,
    `Tout au poids du corps. Réponds UNIQUEMENT avec un objet JSON de type "session" :`,
    `{ "type":"session","name":"Prépa physique tennis","exercises":[`,
    `  {"name":"…","muscle_primary":"…","progression":"fixed","rest_seconds":<n>,`,
    `   "target":{"sets":<n>,"reps_min":<n>,"reps_max":<n>,"unit":"reps|time","load":"bodyweight"}} ] }`,
    `Pour les exos au temps (gainage…), unit="time" et reps_min/max en SECONDES.`,
  ].join('\n');
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Rattache un nom au catalogue par score : exact > commence par > contient.
function findDrill(name: string, catalog: DrillDef[]): DrillDef | undefined {
  const n = normalize(name);
  if (n.length < 3) return undefined;
  let best: DrillDef | undefined;
  let bestScore = 0;
  for (const d of catalog) {
    const ln = normalize(d.name);
    let score = 0;
    if (ln === n) score = 100;
    else if (ln.startsWith(n) || n.startsWith(ln)) score = 70 - Math.abs(ln.length - n.length);
    else if (ln.length >= 4 && (ln.includes(n) || n.includes(ln)))
      score = 30 - Math.abs(ln.length - n.length) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return bestScore > 0 ? best : undefined;
}

function asCategory(v: unknown, fallback: DrillCategory): DrillCategory {
  return typeof v === 'string' && (CATEGORIES as string[]).includes(v)
    ? (v as DrillCategory)
    : fallback;
}
function asShot(v: unknown): DrillShot | undefined {
  return typeof v === 'string' && (SHOTS as string[]).includes(v) ? (v as DrillShot) : undefined;
}

// Format depuis un objet {mode,value,sets}, des champs séparés, ou une chaîne "30 balles x2".
function parseFormat(raw: Record<string, unknown>, fallback?: DrillFormat): DrillFormat {
  const f = raw.format as Record<string, unknown> | undefined;
  const pick = (o: Record<string, unknown> | undefined): DrillFormat | null => {
    if (!o) return null;
    const mode = o.mode;
    if (mode === 'reps' || mode === 'time' || mode === 'balls') {
      const value = Number(o.value);
      const sets = Number(o.sets);
      if (value > 0) return { mode, value, sets: sets > 0 ? sets : 1 };
    }
    return null;
  };
  const fromObj = pick(f) ?? pick(raw);
  if (fromObj) return fromObj;

  // Chaîne libre : "30 balles", "5 min", "12 reps x3".
  const s =
    typeof raw.target === 'string' ? raw.target : typeof raw.format === 'string' ? raw.format : '';
  if (s) {
    const nums = s.match(/\d+/g)?.map(Number) ?? [];
    const sets = /x\s*\d+|×\s*\d+/i.test(s) ? (nums[nums.length - 1] ?? 1) : 1;
    const value = nums[0] ?? 0;
    if (value > 0) {
      if (/min|sec|\bs\b|temps/i.test(s)) {
        const secs = /min/i.test(s) ? value * 60 : value;
        return { mode: 'time', value: secs, sets };
      }
      if (/balle|ball/i.test(s)) return { mode: 'balls', value, sets };
      return { mode: 'reps', value, sets };
    }
  }
  return fallback ?? { mode: 'reps', value: 10, sets: 2 };
}

function estMin(f: DrillFormat, rest: number): number {
  const work = f.mode === 'time' ? f.value : f.mode === 'balls' ? f.value * 4 : f.value * 5;
  return (f.sets * (work + rest)) / 60;
}

/** Parse un JSON collé (IA) en DrillSession tolérante. Lève une erreur lisible sinon. */
export function parseDrillSession(raw: string, catalog: DrillDef[] = []): DrillSession {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('JSON invalide : impossible de lire le contenu collé.');
  }

  const rawDrills = obj.drills;
  if (!Array.isArray(rawDrills) || rawDrills.length === 0) {
    throw new Error('Aucun drill trouvé dans la réponse (clé « drills » attendue).');
  }

  const drills: PlannedDrill[] = rawDrills
    .map((r): PlannedDrill | null => {
      const d = r as Record<string, unknown>;
      const name = typeof d.name === 'string' ? d.name.trim() : '';
      if (!name) return null;
      const match = findDrill(name, catalog);
      const category = asCategory(d.category, match?.category ?? 'fond_de_court');
      const shot = asShot(d.shot) ?? match?.shot ?? undefined;
      const pattern =
        typeof d.pattern === 'string' && d.pattern !== 'null'
          ? d.pattern
          : (match?.pattern ?? undefined);
      const partner_required =
        typeof d.partner_required === 'boolean'
          ? d.partner_required
          : (match?.partner_required ?? false);
      const format = parseFormat(d, match?.default_format);
      const pd: PlannedDrill = {
        id:
          match?.id ??
          `drill_ai_${normalize(name)
            .replace(/[^a-z0-9]+/g, '_')
            .slice(0, 32)}`,
        name: match?.name ?? name,
        category,
        partner_required,
        format,
        rest_seconds: category === 'echauffement' || category === 'retour_au_calme' ? 0 : 45,
      };
      if (shot) pd.shot = shot;
      if (pattern) pd.pattern = pattern;
      if (typeof d.notes === 'string' && d.notes.trim()) pd.notes = d.notes.trim();
      else if (match?.tips) pd.notes = match.tips;
      return pd;
    })
    .filter((d): d is PlannedDrill => d !== null);

  if (drills.length === 0) throw new Error('Impossible de lire les drills de la réponse.');

  const withPartner =
    typeof obj.with_partner === 'boolean'
      ? obj.with_partner
      : drills.some((d) => d.partner_required);
  const estimated =
    typeof obj.estimated_duration_min === 'number'
      ? obj.estimated_duration_min
      : Math.round(drills.reduce((a, d) => a + estMin(d.format, d.rest_seconds), 0));

  return {
    schema_version: SCHEMA_VERSION,
    type: 'drill_session',
    id: crypto.randomUUID(),
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Séance tennis (IA)',
    sport: 'tennis',
    ...(typeof obj.theme === 'string' ? { theme: obj.theme } : {}),
    with_partner: withPartner,
    estimated_duration_min: estimated,
    source: 'ai',
    created_at: new Date().toISOString(),
    drills,
  };
}
