import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { MONSTER_ART, monsterArt } from '@/data/monsterArt';
import { MONSTERS } from '@/data/monsters';
import { BOSSES } from '@/data/bosses';
import { LABY_ROSTERS, LABY_GUARDIANS } from '@/data/labyrinthFoes';
import { factionRoster, type RaidFaction } from '@/lib/raid';
import { riftFoeIdentity } from '@/lib/rift';

// On lit la DONNÉE exportée, jamais le texte du fichier (cf. championPortraits.test).
const NAMES = Object.keys(MONSTER_ART);
const chemin = (url: string) => resolve(__dirname, '../public' + url);
const DUNGEON_NAMES = new Set([...MONSTERS.map((m) => m.name), ...BOSSES.map((b) => b.name)]);
const LABY_NAMES = [...LABY_ROSTERS.flat(), ...LABY_GUARDIANS].map((f) => f.name);
// Les gardiens de faille (v0.1108) : une espèce du roster de sa faction, en version élite.
// Leurs noms viennent de `riftFoeIdentity` — la fonction du COMBAT —, jamais recopiés :
// si la règle de nommage change, ce test le voit.
const FACTIONS: RaidFaction[] = ['bandits', 'betes', 'mortsvivants'];
const RIFT_GUARDIANS = FACTIONS.flatMap((f) =>
  factionRoster(f).map((_, i) => riftFoeIdentity(f, i, true).name),
);
const ENEMY_NAMES = new Set([...DUNGEON_NAMES, ...LABY_NAMES, ...RIFT_GUARDIANS]);

describe('🐉 LES ILLUSTRATIONS D’ENNEMIS (v0.1006)', () => {
  it('⚠️ CHAQUE FICHIER NOMMÉ EXISTE SUR LE DISQUE', () => {
    const manquants = NAMES.filter((n) => !existsSync(chemin(MONSTER_ART[n]!)));
    expect(manquants, `illustrations déclarées sans fichier : ${manquants.join(', ')}`).toEqual([]);
  });

  it('⚠️ CHAQUE NOM DÉCLARÉ EST UN VRAI MONSTRE OU BOSS', () => {
    // La table est indexée par NOM : une coquille serait une image chargée pour personne,
    // et un ennemi qui garderait son emoji sans qu'on comprenne pourquoi.
    const inconnus = NAMES.filter((n) => !ENEMY_NAMES.has(n));
    expect(inconnus, `noms qui ne désignent aucun ennemi : ${inconnus.join(', ')}`).toEqual([]);
  });

  it('tous les ennemis sont illustrés — donjons, boss, Labyrinthe, gardiens de faille', () => {
    const sans = [...ENEMY_NAMES].filter((n) => !NAMES.includes(n));
    expect(sans, `ennemis sans illustration : ${sans.join(', ')}`).toEqual([]);
  });

  it('⚠️ DEUX NOMS NE PARTAGENT JAMAIS LA MÊME IMAGE', () => {
    const fichiers = NAMES.map((n) => MONSTER_ART[n]!);
    expect(new Set(fichiers).size).toBe(fichiers.length);
  });

  it('⚠️ LE POIDS RESTE TENABLE — le bestiaire en affiche des dizaines', () => {
    const lourds = NAMES.filter((n) => statSync(chemin(MONSTER_ART[n]!)).size > 60_000);
    expect(lourds, `illustrations trop lourdes : ${lourds.join(', ')}`).toEqual([]);
  });

  it('un nom inconnu ou vide rend null, jamais un chemin deviné', () => {
    expect(monsterArt('Gobelin inventé')).toBeNull();
    expect(monsterArt('')).toBeNull();
    expect(monsterArt(null)).toBeNull();
    expect(monsterArt('constructor')).toBeNull();
    expect(monsterArt('Dragon')).toBe(MONSTER_ART.Dragon);
  });
});
