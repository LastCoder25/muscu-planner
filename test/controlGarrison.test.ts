// 🏰 Chaque lieu fixe s'améliore avec sa garnison, jusqu'à 5 (2026-09-28, demandé : « chaque
// lieu fixe qui produit ou a un autre effet doit être amélioré selon le nombre en garnison,
// sauf les producteurs d'XP — mais il faut qu'ils soient rentables »).
import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  campXpFor,
  runeHoursFor,
  seatsOf,
  trainingXpPerHour,
} from '@/lib/controlPoints';
import { catchUpMult, refChampionAdv } from '@/lib/caravan';
import { trialXpBase } from '@/lib/skirmish';
import type { Adventurer } from '@/lib/adventurers';

const champ = (level: number) => ({ ...refChampionAdv(level, 0), id: 'a', level, xp: 0 }) as Adventurer;

describe('🏰 la production grandit avec la garnison, jusqu’à 5', () => {
  it('chaque présent de plus rapporte, toujours moins que le précédent', () => {
    const s = CONTROL.garrisonShare;
    expect(s).toHaveLength(6);
    for (let n = 1; n < s.length; n++) expect(s[n]!).toBeGreaterThan(s[n - 1]!);
    for (let n = 2; n < s.length; n++) expect(s[n]! - s[n - 1]!).toBeLessThanOrEqual(s[n - 1]! - s[n - 2]! + 1e-9);
    // 1 → 3 inchangé : un joueur qui en postait 3 ne perd rien.
    expect(s.slice(0, 4)).toEqual([0, 0.5, 0.8, 1]);
  });
  it('📜 le Scriptorium copie plus vite à 5 qu’à 3', () => {
    expect(runeHoursFor(5)!).toBeLessThan(runeHoursFor(4)!);
    expect(runeHoursFor(4)!).toBeLessThan(runeHoursFor(3)!);
    expect(runeHoursFor(3)).toBe(CONTROL.runeHoursPerItem);
  });
  it('les lieux qui forment chaque champion gardent 3 places', () => {
    expect(seatsOf('training')).toBe(3);
    expect(seatsOf('forge')).toBe(3);
  });
});

describe('🎯 le camp est rentable pour ceux qu’il accueille', () => {
  it('un champion en retard reçoit la même prime de rattrapage qu’en mission', () => {
    // Joueur (Panthéon) 30, champion 20 : ×2.
    expect(campXpFor(champ(20), 100, 30)).toBe(Math.round(100 * catchUpMult(20, 30)));
    expect(campXpFor(champ(20), 100, 30)).toBe(200);
  });
  it('un champion à jour n’y gagne rien de plus', () => {
    expect(campXpFor(champ(30), 100, 30)).toBe(100);
  });
  it('en retard, le camp vaut au moins une mission moyenne, 24 h sur 24', () => {
    // Mesuré : mission à mi-distance (≈ 3,4 h d'aller-retour) au niveau 30 pour un champion
    // 20 : 48 XP/h en enchaînant sans temps mort, soit ~2 missions (~330 XP) par jour pour un
    // joueur qui passe matin et soir. Le camp, lui, tourne sans pause.
    const perDay = campXpFor(champ(20), trainingXpPerHour({ level: 30 }) * 24, 30);
    expect(perDay).toBeGreaterThan(2 * trialXpBase(30) * catchUpMult(20, 30));
  });
});
