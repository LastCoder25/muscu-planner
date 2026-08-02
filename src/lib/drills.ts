// drills.ts — générateur déterministe de séance de TENNIS sur le court.
// Entrée : catalogue de drills + options (thème, durée, partenaire, niveau).
// Sortie : une `DrillSession` (échauffement → thème → complément → déplacement →
// jeu → retour au calme). Pur et testable, aucune dépendance Vue/Supabase.
import type {
  DrillSession,
  PlannedDrill,
  DrillCategory,
  DrillShot,
  DrillFormat,
  Level,
} from './types';
import { SCHEMA_VERSION } from './types';

export interface DrillDef {
  id: string;
  sport?: string | null;
  name: string;
  category: DrillCategory;
  shot?: DrillShot | null;
  pattern?: string | null;
  partner_required: boolean;
  players?: string | null;
  equipment?: string[] | null;
  intensity?: string | null;
  focus?: string[] | null;
  level?: number | null;
  default_format: DrillFormat;
  description?: string | null;
  instructions?: string[] | null;
  tips?: string | null;
}

// Matériel toujours supposé disponible sur un court (non filtrant).
const ASSUMED_EQUIPMENT = new Set(['raquette', 'balles', 'filet']);

// Un drill est réalisable si tout son matériel optionnel est possédé. Une machine
// à balles remplace le panier (elle alimente comme un panier).
function drillEquipmentOk(d: DrillDef, owned: Set<string>): boolean {
  const eff = new Set(owned);
  if (eff.has('machine')) eff.add('panier');
  return (d.equipment ?? []).every((e) => ASSUMED_EQUIPMENT.has(e) || eff.has(e));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function levelToInt(level?: Level): number {
  if (level === 'debutant') return 1;
  if (level === 'avance') return 3;
  return 2;
}

// Repos indicatif entre séries selon la catégorie (secondes).
const REST_BY_CATEGORY: Record<DrillCategory, number> = {
  echauffement: 0,
  fond_de_court: 45,
  service_retour: 45,
  volee: 40,
  deplacement: 60,
  jeu: 60,
  retour_au_calme: 0,
};

// Spéc de génération par thème : coup mis en avant + catégories du bloc principal.
interface ThemeSpec {
  shot?: DrillShot;
  mainCats: DrillCategory[];
  complementCats: DrillCategory[];
}
const THEME_SPECS: Record<string, ThemeSpec> = {
  complet: { mainCats: ['fond_de_court'], complementCats: ['volee', 'service_retour'] },
  coup_droit: {
    shot: 'coup_droit',
    mainCats: ['fond_de_court'],
    complementCats: ['volee', 'service_retour'],
  },
  revers: {
    shot: 'revers',
    mainCats: ['fond_de_court'],
    complementCats: ['volee', 'service_retour'],
  },
  service: { shot: 'service', mainCats: ['service_retour'], complementCats: ['fond_de_court'] },
  volee: { mainCats: ['volee'], complementCats: ['fond_de_court'] },
  jeu: { mainCats: ['jeu'], complementCats: ['fond_de_court'] },
  physique: { mainCats: ['deplacement'], complementCats: ['fond_de_court'] },
};

function estDrillMin(d: DrillDef): number {
  const f = d.default_format;
  const workPerSet = f.mode === 'time' ? f.value : f.mode === 'balls' ? f.value * 4 : f.value * 5;
  const rest = REST_BY_CATEGORY[d.category];
  return (f.sets * (workPerSet + rest)) / 60;
}

function toPlanned(d: DrillDef): PlannedDrill {
  const pd: PlannedDrill = {
    id: d.id,
    name: d.name,
    category: d.category,
    partner_required: d.partner_required,
    format: d.default_format,
    rest_seconds: REST_BY_CATEGORY[d.category],
  };
  if (d.shot) pd.shot = d.shot;
  if (d.pattern) pd.pattern = d.pattern;
  if (d.description) pd.description = d.description;
  if (d.tips) pd.notes = d.tips;
  return pd;
}

export interface CourtOptions {
  theme?: string; // clé de THEME_SPECS (défaut 'complet')
  duration_min?: number; // défaut 60
  withPartner?: boolean; // défaut true
  level?: Level;
  equipment?: string[]; // matériel de court possédé (panier, machine, mur, cible, plots)
  name?: string;
}

/**
 * Construit une séance de court structurée et cohérente avec le matériel humain
 * (avec/sans partenaire) et le niveau. Le budget temps pilote le nombre de drills.
 * @returns une `DrillSession` (source 'engine') ou null si le catalogue est vide.
 */
export function buildCourtSession(
  catalog: DrillDef[],
  opts: CourtOptions = {},
): DrillSession | null {
  if (catalog.length === 0) return null;

  const withPartner = opts.withPartner ?? true;
  const maxLevel = levelToInt(opts.level);
  const duration = clamp(opts.duration_min ?? 60, 20, 120);
  const spec = THEME_SPECS[opts.theme ?? 'complet'] ?? THEME_SPECS.complet!;
  const owned = new Set(opts.equipment ?? []);

  // Éligibilité : sport tennis, partenaire dispo, matériel possédé, niveau (avec
  // repli si le niveau ne laisse rien dans une catégorie).
  const base = catalog.filter(
    (d) =>
      (d.sport ?? 'tennis') === 'tennis' &&
      (withPartner || !d.partner_required) &&
      drillEquipmentOk(d, owned),
  );
  if (base.length === 0) return null;

  const used = new Set<string>();

  // Pioche le meilleur drill non utilisé dans des catégories données. Avec
  // partenaire, on privilégie les drills qui NÉCESSITENT un partenaire (autant en
  // profiter), puis le coup du thème, puis le niveau adapté.
  function pick(cats: DrillCategory[], shot?: DrillShot): DrillDef | null {
    const pool = base.filter((d) => cats.includes(d.category) && !used.has(d.id));
    if (pool.length === 0) return null;
    const byLevel = pool.filter((d) => (d.level ?? 1) <= maxLevel);
    const usable = byLevel.length ? byLevel : pool;
    const scored = [...usable].sort((a, b) => {
      if (withPartner) {
        const pa = a.partner_required ? 0 : 1;
        const pb = b.partner_required ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      const sa = shot && a.shot === shot ? 0 : 1;
      const sb = shot && b.shot === shot ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (a.level ?? 1) - (b.level ?? 1);
    });
    return scored[0] ?? null;
  }

  const chosen: PlannedDrill[] = [];
  let spent = 0;
  const add = (d: DrillDef | null): boolean => {
    if (!d) return false;
    used.add(d.id);
    chosen.push(toPlanned(d));
    spent += estDrillMin(d);
    return true;
  };

  // 1) Échauffement (toujours).
  add(pick(['echauffement']));

  // 2) Bloc principal du thème (1 à 2 drills selon le budget).
  add(pick(spec.mainCats, spec.shot));
  if (duration >= 45) add(pick(spec.mainCats, spec.shot));

  // 3) Complément (autre registre).
  if (spent < duration - 12) add(pick(spec.complementCats));

  // 4) Déplacement / physique (si pas déjà le thème et budget ok).
  if (!spec.mainCats.includes('deplacement') && spent < duration - 12) {
    add(pick(['deplacement']));
  }

  // 5) Jeu (points) — seulement avec partenaire, si budget.
  if (withPartner && !spec.mainCats.includes('jeu') && spent < duration - 12) {
    add(pick(['jeu']));
  }

  // 6) Remplissage : ajoute des drills du thème/complément tant qu'il reste du
  //    temps, pour coller à la durée demandée.
  let guard = 0;
  while (spent < duration - 10 && guard < 12) {
    guard++;
    const extra =
      pick(spec.mainCats, spec.shot) ?? pick(spec.complementCats) ?? pick(['fond_de_court']);
    if (!add(extra)) break;
  }

  // 7) Retour au calme (toujours, en dernier).
  add(pick(['retour_au_calme']));

  if (chosen.length === 0) return null;

  return {
    schema_version: SCHEMA_VERSION,
    type: 'drill_session',
    id: crypto.randomUUID(),
    name: opts.name ?? 'Séance tennis',
    sport: 'tennis',
    theme: opts.theme ?? 'complet',
    with_partner: withPartner,
    ...(opts.level ? { level: opts.level } : {}),
    estimated_duration_min: Math.round(spent),
    source: 'engine',
    created_at: new Date().toISOString(),
    drills: chosen,
  };
}
