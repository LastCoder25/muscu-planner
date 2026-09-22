import { describe, it, expect } from 'vitest';
import { formatDuration, formatDurationMin } from '@/lib/duration';
import { EXPE, travelOneWayMin } from '@/lib/expedition';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('⏳ formatage des durées', () => {
  it('sous une heure : des minutes', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45 * MIN)).toBe('45 min');
    expect(formatDuration(59 * MIN)).toBe('59 min');
    // Une durée négative (horloge du client en avance) ne rend jamais un temps négatif.
    expect(formatDuration(-5 * MIN)).toBe('0 min');
  });

  it("entre une heure et un jour : le format d'AVANT, au caractère près", () => {
    // ⚠️ NON-RÉGRESSION : c'est exactement ce que les trois copies rendaient. Les trajets
    // vivent tous dans cette bande, donc aucun ne doit changer d'aspect.
    expect(formatDuration(60 * MIN)).toBe('1 h 00');
    expect(formatDuration(6 * HOUR + 30 * MIN)).toBe('6 h 30');
    expect(formatDuration(22 * HOUR + 18 * MIN)).toBe('22 h 18');
    expect(formatDurationMin(150)).toBe('2 h 30');
  });

  it('au-delà de 24 h : des JOURS — le défaut signalé', () => {
    // Le chrono d'une faille s'affichait « 168 h 00 » à son apparition.
    expect(formatDuration(EXPE.lifespanMs.rift)).toBe('7 j');
    expect(formatDuration(6 * DAY + 12 * HOUR)).toBe('6 j 12 h');
    expect(formatDuration(2 * DAY)).toBe('2 j');
    expect(formatDuration(DAY + HOUR)).toBe('1 j 1 h');
  });

  it('on TRONQUE : le temps affiché est toujours un « il reste au moins »', () => {
    // 1 j 23 h 59 ne doit pas s'annoncer « 2 j » : on n'offre pas une heure qui n'existe pas.
    expect(formatDuration(2 * DAY - MIN)).toBe('1 j 23 h');
    // …et la frontière des 24 h bascule au bon endroit.
    expect(formatDuration(DAY - MIN)).toBe('23 h 59');
    expect(formatDuration(DAY)).toBe('1 j');
  });

  it("le chrono d'une faille se lit en jours sur toute sa vie", () => {
    // Toute la maturation, heure par heure : jamais un « N h » à trois chiffres.
    for (let h = 24; h <= EXPE.lifespanMs.rift / HOUR; h++) {
      const s = formatDuration(h * HOUR);
      expect(s, `${h} h → « ${s} »`).toMatch(/ j( \d+ h)?$/);
    }
  });

  it('⚠️ SUR LA PLAGE DU JEU (niveau 0→100), AUCUN TRAJET NE CHANGE D’ASPECT', () => {
    // Mesuré sur les VRAIES fonctions, jamais sur un nombre écrit à la main : l’aller le
    // plus long vaut 7,5 h (niveau 100, bout de la carte) et une équipe va au pas
    // du héros depuis la v0.1033 (15 h d’aller-retour au pire).
    // Tout reste donc sous les 24 h, donc sous le seuil des jours : ajouter les jours ne pouvait PAS abîmer l’affichage d’un voyage.
    const allerMax = travelOneWayMin(100, 1);
    expect(allerMax * MIN).toBeLessThan(DAY);
    expect(formatDurationMin(2 * allerMax)).not.toMatch(/ j/);
  });

  it('…et un voyage qui dépasserait 24 h se lirait quand même bien', () => {
    // ⚠️ L’invariant ci-dessus vaut pour la plage de CONCEPTION (« du 0 au 100 », v0.731),
    // pas pour l’éternité : rien ne borne le niveau au-delà de 100,
    // donc un trajet finira par dépasser 24 h. Ce n’est pas un défaut — « 1 j 1 h » se
    // lit mieux que « 25 h 00 » — mais c’est écrit ici pour que personne ne prenne
    // l’invariant précédent pour une garantie structurelle.
    const rt = 25 * 60; // un aller-retour de 25 h
    expect(rt * MIN).toBeGreaterThan(DAY);
    // ⚠️ Pas de regex ici : sur ce poste, un échappement avalé par le shell rend le
    // motif complaisant sans que rien ne rougisse — ça vient de se produire en écrivant
    // ce test même.
    expect(formatDurationMin(rt).startsWith('1 j')).toBe(true);
  });
});
