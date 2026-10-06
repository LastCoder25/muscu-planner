import { describe, expect, it } from 'vitest';
import { crewHeadsToInfirmary } from '@/lib/adventurers';
import { refAdventurer } from '@/lib/caravan';

// 🏥 Demandé : « sur la carte, les trajets où les champions retournent à la base parce qu'ils
// vont finir à l'infirmerie (délogés d'un lieu fixe, attaque ratée) : une petite icône
// d'infirmerie sur leur marqueur ».
const NOW = 1_800_000_000_000;
const H = 3_600_000;
const walker = { ...refAdventurer(20, 0), busyUntil: NOW + 2 * H, hurtUntil: NOW + 3 * H };
const fine = { ...refAdventurer(20, 1), busyUntil: NOW + 2 * H };
const inBed = { ...refAdventurer(20, 2), busyUntil: NOW - H, hurtUntil: NOW + H };
const roster = [walker, fine, inBed];

describe('🏥 un trajet qui rentre à l’infirmerie', () => {
  it('au moins un membre rentre blessé → oui', () => {
    expect(crewHeadsToInfirmary([fine.id, walker.id], roster, NOW)).toBe(true);
  });
  it('personne de blessé en route → non', () => {
    expect(crewHeadsToInfirmary([fine.id], roster, NOW)).toBe(false);
    // Déjà alité (rentré) : ce n'est plus un trajet vers l'infirmerie.
    expect(crewHeadsToInfirmary([inBed.id], roster, NOW)).toBe(false);
  });
  it('les miliciens et les inconnus ne comptent pas', () => {
    expect(crewHeadsToInfirmary(['mil_x', 'nobody'], roster, NOW)).toBe(false);
    expect(crewHeadsToInfirmary([], roster, NOW)).toBe(false);
  });
});
