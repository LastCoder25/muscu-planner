// 🧩 CALIBRATION DES SETS DE VOIE — refonte équipement, étape 7 (spec § 6.2).
//
// La calibration elle-même a été MESURÉE EN VRAI COMBAT (boss de palier, niveaux 30/60/90,
// 3 builds de référence, dichotomie du multiplicateur de boss à 50 % de victoire) : un set
// complet dans sa voie vaut +5,8 à +12,3 % contre les meilleurs drops (bruit des pièces
// compris), et « 4 pièces + 2 meilleurs drops » vaut « 6 pièces » à −1,6 / +3,2 points. Avant
// (le format 4 pièces recopié sur 6) : +17 à +80 %, la Soif éternelle du Vampire valant à elle
// seule +46 %.
//
// ⚠️ 2026-09-22 — LES SETS SONT REMONTÉS (demandé : « il faut que les sets soient attrayants
// par rapport aux pièces normales »). La stat principale d'une pièce de set vaut celle d'un drop
// (×1 au lieu de ×0,7) : mesuré sur un joueur réaliste, l'optimiseur garde 5 à 6 pièces du set
// à tous les niveaux, pour +13 à +28 % contre les boss. Le contenu est recalé sur ce joueur.
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

// Mesuré à l'écriture (graine 1, 40 pièces par emplacement) — set complet contre meilleurs
// drops, en puissance : niveau 30 : +19,5 à +21,5 % ; niveau 60 : +31 à +36 %. Ce que la VOIE
// ajoute (affinité des paliers 2 et 4, palier 6, signature) : +4,4 à +6,7 %.
// Plancher : le set doit VALOIR LE COUP ; plafond : il ne doit pas devenir écrasant.
const BORNES: Record<number, [number, number]> = { 30: [0.12, 0.26], 60: [0.2, 0.42] };

it('un set complet porté dans sa voie vaut le coup face aux drops, sans devenir écrasant', () => {
  for (const L of [30, 60]) {
    const b = gearedBuild(L, 1, true, false); // référence SANS set : on mesure le set contre les drops
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
      expect(gain, `${voie} niveau ${L}`).toBeGreaterThan(BORNES[L]![0]);
      expect(gain, `${voie} niveau ${L}`).toBeLessThan(BORNES[L]![1]);
      // Ce que la voie ajoute au même set : jamais l'essentiel de sa valeur.
      expect(pw(six, voie) / pw(six, null) - 1, `${voie} niveau ${L}`).toBeLessThan(0.1);
    }
  }
});
