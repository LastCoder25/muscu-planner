import { describe, it, expect } from 'vitest';
import { buildCourtSession, type DrillDef } from '@/lib/drills';

const f = (mode: 'reps' | 'time' | 'balls', value: number, sets = 1) => ({ mode, value, sets });

const CATALOG: DrillDef[] = [
  {
    id: 'warm_solo',
    name: 'Gammes',
    category: 'echauffement',
    partner_required: false,
    equipment: [],
    level: 1,
    default_format: f('reps', 15, 2),
    description: 'À vide.',
  },
  {
    id: 'warm_duo',
    name: 'Mini-tennis',
    category: 'echauffement',
    partner_required: true,
    equipment: ['filet'],
    level: 1,
    default_format: f('time', 300),
  },
  {
    id: 'diag_fh',
    name: 'Diagonales CD',
    category: 'fond_de_court',
    shot: 'coup_droit',
    pattern: 'diagonale',
    partner_required: true,
    equipment: ['filet'],
    level: 1,
    default_format: f('balls', 30, 2),
  },
  {
    id: 'panier_fh',
    name: 'Panier CD',
    category: 'fond_de_court',
    shot: 'coup_droit',
    partner_required: false,
    equipment: ['panier'],
    level: 1,
    default_format: f('balls', 40, 2),
  },
  {
    id: 'mur',
    name: 'Mur',
    category: 'fond_de_court',
    partner_required: false,
    equipment: ['mur'],
    level: 1,
    default_format: f('time', 300),
  },
  {
    id: 'serv_cible',
    name: 'Service cibles',
    category: 'service_retour',
    shot: 'service',
    partner_required: false,
    equipment: ['cible', 'panier'],
    level: 1,
    default_format: f('balls', 20, 2),
  },
  {
    id: 'depl',
    name: 'Déplacements',
    category: 'deplacement',
    partner_required: false,
    equipment: [],
    level: 1,
    default_format: f('time', 240),
  },
  {
    id: 'jeu',
    name: 'Points',
    category: 'jeu',
    partner_required: true,
    equipment: ['filet'],
    level: 1,
    default_format: f('time', 480),
  },
  {
    id: 'cool',
    name: 'Étirements',
    category: 'retour_au_calme',
    partner_required: false,
    equipment: [],
    level: 1,
    default_format: f('time', 300),
  },
];

describe('buildCourtSession', () => {
  it('retourne null si le catalogue est vide', () => {
    expect(buildCourtSession([], {})).toBeNull();
  });

  it('commence par un échauffement et finit par un retour au calme', () => {
    const s = buildCourtSession(CATALOG, {
      withPartner: true,
      equipment: ['panier', 'cible', 'mur'],
    })!;
    expect(s.drills[0]!.category).toBe('echauffement');
    expect(s.drills.at(-1)!.category).toBe('retour_au_calme');
    expect(s.type).toBe('drill_session');
  });

  it('avec partenaire : privilégie un drill de fond nécessitant un partenaire', () => {
    const s = buildCourtSession(CATALOG, { theme: 'coup_droit', withPartner: true })!;
    const fond = s.drills.filter((d) => d.category === 'fond_de_court');
    expect(fond.some((d) => d.partner_required)).toBe(true);
  });

  it('sans partenaire : aucun drill partner_required', () => {
    const s = buildCourtSession(CATALOG, {
      withPartner: false,
      equipment: ['panier', 'cible', 'mur'],
    })!;
    expect(s.drills.every((d) => !d.partner_required)).toBe(true);
  });

  it('sans matériel : exclut tout drill à matériel optionnel', () => {
    const s = buildCourtSession(CATALOG, { withPartner: false, equipment: [] })!;
    const ids = new Set(s.drills.map((d) => d.id));
    expect(ids.has('panier_fh')).toBe(false);
    expect(ids.has('mur')).toBe(false);
    expect(ids.has('serv_cible')).toBe(false);
  });

  it('la machine à balles remplace le panier', () => {
    const s = buildCourtSession(CATALOG, {
      theme: 'coup_droit',
      withPartner: false,
      equipment: ['machine'],
    })!;
    expect(s.drills.some((d) => d.id === 'panier_fh')).toBe(true);
  });

  it('reporte la description du catalogue dans le drill planifié', () => {
    const s = buildCourtSession(CATALOG, { withPartner: false, equipment: [] })!;
    const warm = s.drills.find((d) => d.id === 'warm_solo');
    expect(warm?.description).toBe('À vide.');
  });
});
