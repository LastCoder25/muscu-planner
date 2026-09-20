import { describe, it, expect } from 'vitest';
import { groupBySource, type GroupableEntry } from '@/lib/agendaGroups';

const e = (
  source: string,
  ts: number,
  title: string,
  xp = 10,
  energy = 10,
  icon = 'i-' + source,
): GroupableEntry => ({ source, ts, title, xp, energy, icon });

/** Un jour bien rempli : une séance le matin, sept exos de 360 et trois challenges à midi,
 *  une sortie l'après-midi. C'est le cas qui a motivé la demande — douze lignes avec la
 *  même pastille répétée sept fois. */
const JOURNEE: GroupableEntry[] = [
  e('Séance', 8_00, 'Haut du corps', 120),
  ...['Tractions', 'Abdos', 'Pompes', 'Squat', 'Dips', 'Gainage', 'Fentes'].map((t) =>
    e('Défi 360', 12_00, t, 7),
  ),
  ...['Corde à sauter', 'Burpees', 'Marche'].map((t) => e('Challenge', 12_00, t, 5)),
  e('Cardio', 18_00, 'Course', 60),
];

describe('📅 L’AGENDA REGROUPE PAR SOURCE (v0.967)', () => {
  it('⚠️ RIEN NE SE PERD NI NE SE DUPLIQUE au regroupement', () => {
    const g = groupBySource(JOURNEE);
    const plat = g.flatMap((x) => x.entries);
    expect(plat).toHaveLength(JOURNEE.length);
    // Chaque entrée d'origine s'y retrouve, exactement une fois.
    for (const src of JOURNEE) expect(plat.filter((x) => x === src)).toHaveLength(1);
  });

  it('un groupe par source DISTINCTE — c’est ce qui supprime la pastille répétée', () => {
    const g = groupBySource(JOURNEE);
    expect(g.map((x) => x.source)).toEqual(['Séance', 'Défi 360', 'Challenge', 'Cardio']);
    expect(g.find((x) => x.source === 'Défi 360')!.entries).toHaveLength(7);
  });

  it('⚠️ LES GROUPES SUIVENT L’HEURE, pas l’ordre où les entrées arrivent', () => {
    // L'Agenda est chronologique : une séance du matin reste avant une sortie de
    // l'après-midi, quelle que soit la source.
    // ⚠️ LES ENTRÉES ARRIVENT DANS LE DÉSORDRE, et c'est tout l'objet de ce test. Une
    // `Map` conserve l'ordre d'INSERTION : avec des entrées déjà triées, « trié par
    // heure » et « ordre d'arrivée » rendent la même chose, et le test ne distingue rien
    // — la mutation qui supprimait le tri SURVIVAIT à ma première rédaction.
    // ⚠️ Et la lib ne documente aucun pré-requis d'ordre : elle doit donc trier elle-même,
    // même si son appelant d'aujourd'hui lui passe une liste déjà triée.
    const g = groupBySource([
      e('Séance', 19_00, 'Jambes'),
      e('Cardio', 7_00, 'Footing'),
      e('Défi 360', 12_00, 'Pompes'),
    ]);
    expect(g.map((x) => x.source)).toEqual(['Cardio', 'Défi 360', 'Séance']);
    // …et l'inverse aussi, sinon ce serait un ordre de sources déguisé.
    const h = groupBySource([
      e('Cardio', 19_00, 'Footing'),
      e('Séance', 7_00, 'Jambes'),
      e('Défi 360', 12_00, 'Pompes'),
    ]);
    expect(h.map((x) => x.source)).toEqual(['Séance', 'Défi 360', 'Cardio']);
  });

  it('⚠️ DANS UN GROUPE : heure, PUIS TITRE — sinon l’ordre bouge d’un chargement à l’autre', () => {
    // Les entrées de 360 et de challenge sont toutes posées à midi : sans le second
    // critère, leur ordre serait celui de la construction.
    const g = groupBySource(JOURNEE);
    const t = g.find((x) => x.source === 'Défi 360')!.entries.map((x) => x.title);
    expect(t).toEqual(['Abdos', 'Dips', 'Fentes', 'Gainage', 'Pompes', 'Squat', 'Tractions']);
    // L'heure prime quand même sur le titre.
    const h = groupBySource([e('Séance', 20_00, 'Abdos'), e('Séance', 8_00, 'Zumba')]);
    expect(h[0]!.entries.map((x) => x.title)).toEqual(['Zumba', 'Abdos']);
  });

  it('les totaux sont la somme EXACTE du groupe — c’est ce que le regroupement rend possible', () => {
    const g = groupBySource(JOURNEE);
    const t360 = g.find((x) => x.source === 'Défi 360')!;
    expect(t360.xp).toBe(7 * 7);
    expect(t360.energy).toBe(7 * 10);
    // …et sur l'ensemble : aucune XP inventée ni perdue.
    expect(g.reduce((a, x) => a + x.xp, 0)).toBe(JOURNEE.reduce((a, x) => a + x.xp, 0));
  });

  it('l’icône du groupe est celle de sa source', () => {
    expect(groupBySource(JOURNEE).find((x) => x.source === 'Cardio')!.icon).toBe('i-Cardio');
  });

  it('une journée vide ne rend aucun groupe, une seule entrée en rend un', () => {
    expect(groupBySource([])).toEqual([]);
    expect(groupBySource([e('Séance', 1, 'Seule')])).toHaveLength(1);
  });
});
