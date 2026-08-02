import { describe, it, expect } from 'vitest';
import { parseDrillSession, buildCourtPrompt } from '@/lib/tennisCoach';
import type { DrillDef } from '@/lib/drills';

const CATALOG: DrillDef[] = [
  {
    id: 'drill_diag_fh',
    name: 'Diagonales coup droit',
    category: 'fond_de_court',
    shot: 'coup_droit',
    pattern: 'diagonale',
    partner_required: true,
    default_format: { mode: 'balls', value: 30, sets: 2 },
    description: 'Croisés en coup droit.',
    tips: 'Prépare tôt.',
  },
  {
    id: 'drill_mur',
    name: 'Échauffement au mur',
    category: 'echauffement',
    partner_required: false,
    default_format: { mode: 'time', value: 300, sets: 1 },
  },
];

describe('parseDrillSession', () => {
  it('rejette un JSON invalide', () => {
    expect(() => parseDrillSession('pas du json', CATALOG)).toThrow();
  });

  it('rejette une réponse sans drills', () => {
    expect(() => parseDrillSession('{"drills":[]}', CATALOG)).toThrow();
  });

  it('JSON strict : rattache au catalogue et préserve le format', () => {
    const raw = JSON.stringify({
      type: 'drill_session',
      name: 'Ma séance',
      with_partner: true,
      drills: [
        {
          name: 'Diagonales coup droit',
          category: 'fond_de_court',
          format: { mode: 'balls', value: 40, sets: 3 },
        },
      ],
    });
    const s = parseDrillSession(raw, CATALOG);
    expect(s.source).toBe('ai');
    expect(s.name).toBe('Ma séance');
    expect(s.drills[0]!.id).toBe('drill_diag_fh');
    expect(s.drills[0]!.format).toEqual({ mode: 'balls', value: 40, sets: 3 });
    expect(s.drills[0]!.description).toBe('Croisés en coup droit.');
  });

  it('JSON lâche : cible en chaîne, nom inconnu → id ad-hoc', () => {
    const raw = JSON.stringify({
      drills: [
        { name: 'Échauffement au mur', target: '5 min' },
        { name: 'Drill inventé maison', target: '20 balles x3' },
      ],
    });
    const s = parseDrillSession(raw, CATALOG);
    expect(s.drills[0]!.id).toBe('drill_mur');
    expect(s.drills[0]!.format).toEqual({ mode: 'time', value: 300, sets: 1 });
    expect(s.drills[1]!.id).toMatch(/^drill_ai_/);
    expect(s.drills[1]!.format).toEqual({ mode: 'balls', value: 20, sets: 3 });
  });

  it('déduit with_partner=false quand aucun drill ne requiert un partenaire', () => {
    const raw = JSON.stringify({ drills: [{ name: 'Échauffement au mur', target: '5 min' }] });
    expect(parseDrillSession(raw, CATALOG).with_partner).toBe(false);
  });
});

describe('buildCourtPrompt', () => {
  it('reflète les paramètres (sans partenaire, matériel)', () => {
    const p = buildCourtPrompt(
      { theme: 'revers', withPartner: false, equipment: ['panier', 'mur'] },
      CATALOG,
    );
    expect(p).toContain('drill_session');
    expect(p).toMatch(/SANS partenaire/);
    expect(p).toContain('panier, mur');
  });
});
