// 🧩 CALIBRATION DES SETS DE VOIE — refonte équipement, étape 7 (spec § 6.2).
//
// La calibration elle-même a été MESURÉE EN VRAI COMBAT (boss de palier, niveaux 30/60/90,
// 3 builds de référence, dichotomie du multiplicateur de boss à 50 % de victoire) : un set
// complet dans sa voie vaut +5,8 à +12,3 % contre les meilleurs drops (bruit des pièces
// compris), et « 4 pièces + 2 meilleurs drops » vaut « 6 pièces » à −1,6 / +3,2 points. Avant
// (le format 4 pièces recopié sur 6) : +17 à +80 %, la Soif éternelle du Vampire valant à elle
// seule +46 %.
//
// Ce test en est le GARDE-FOU, pas la mesure : il lit la PUISSANCE (rapide, et fidèle au combat
// à quelques points près depuis que le vol de vie y compte pour sa valeur réelle) et borne
// juste au-dessus de ce qu'elle rend aujourd'hui. Remettre des paliers ou une signature de
// l'ancien calibre le fait tomber.
import { expect, it } from 'vitest';
import { mulberry32, combatPowerRaw } from '@/lib/combat';
import {
  rollSetPiece,
  bestGearLoadout,
  playerWithGear,
  SET_SLOTS,
  VOIE_SETS,
  type Item,
  type ItemSlot,
} from '@/lib/items';
import { gearedBuild } from './helpers/gearedFighter';

// Mesuré à l'écriture (graine 1) — set complet contre meilleurs drops, en puissance :
// niveau 30 : +11,1 à +14,3 % ; niveau 60 : +15,3 à +22,5 %. Ce que la VOIE ajoute (affinité
// des paliers 2 et 4, palier 6, signature) : +4,7 à +8,2 %.
const BORNES: Record<number, number> = { 30: 0.18, 60: 0.27 };

it('un set complet porté dans sa voie reste un BONUS, pas une obligation', () => {
  for (const L of [30, 60]) {
    const b = gearedBuild(L, 1);
    const nonSet = b.inv.filter((d) => !SET_SLOTS.includes(d.slot as ItemSlot));
    for (const set of VOIE_SETS) {
      const voie = set.id.replace('voie:', '');
      const rng = mulberry32(977 + L);
      const pieces: Item[] = [];
      for (const slot of SET_SLOTS)
        for (let i = 0; i < 40; i++)
          pieces.push({
            ...rollSetPiece(rng, {
              setId: set.id,
              level: L,
              luck: 0.6,
              preferSlot: slot,
              playerLevel: L,
            }),
            id: `s${slot}${i}`,
          } as Item);
      const pw = (eq: Record<string, Item | undefined>, v: string | null) =>
        combatPowerRaw(playerWithGear('g', b.stats, eq, b.fx, L, v));
      const drops = bestGearLoadout('g', b.stats, b.eq, b.inv, L, b.fx, voie, undefined, false);
      const six = bestGearLoadout(
        'g',
        b.stats,
        {},
        [...pieces, ...nonSet],
        L,
        b.fx,
        voie,
        undefined,
        false,
      );
      expect(SET_SLOTS.filter((s) => six[s]?.setId === set.id).length, voie).toBe(6);
      const gain = pw(six, voie) / pw(drops, voie) - 1;
      expect(gain, `${voie} niveau ${L}`).toBeGreaterThan(0);
      expect(gain, `${voie} niveau ${L}`).toBeLessThan(BORNES[L]!);
      // Ce que la voie ajoute au même set : jamais l'essentiel de sa valeur.
      expect(pw(six, voie) / pw(six, null) - 1, `${voie} niveau ${L}`).toBeLessThan(0.1);
    }
  }
});
