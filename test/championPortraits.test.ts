import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { championPortrait, portraitCount } from '@/data/championPortraits';
import { CHAMPIONS, CHAMPION_BY_ID } from '@/data/champions';

// ⚠️ Les ids viennent du FICHIER SOURCE, pas d'une liste recopiée : un test qui recopierait
// la table passerait au vert le jour où l'on ajoute un portrait mal branché.
const SRC = readFileSync(resolve(__dirname, '../src/data/championPortraits.ts'), 'utf8');
const IDS = [...SRC.matchAll(/^\s{2}(\w+):\s*'\/champions\//gm)].map((m) => m[1]!);
const onDisk = (url: string) => existsSync(resolve(__dirname, '../public' + url));

describe('🖼️ LES PORTRAITS DE CHAMPIONS (v0.969)', () => {
  it('⚠️ CHAQUE FICHIER NOMMÉ EXISTE SUR LE DISQUE', () => {
    // C'est LA garantie de la table explicite : sans elle, un portrait manquant se verrait
    // en production au lieu d'ici. Elle vaut dès le premier portrait ajouté.
    const manquants = IDS.filter((id) => !onDisk(championPortrait(id)!));
    expect(manquants, `portraits déclarés sans fichier : ${manquants.join(', ')}`).toEqual([]);
  });

  it('⚠️ CHAQUE PORTRAIT DÉCLARÉ EST UN VRAI CHAMPION', () => {
    // Un id mal orthographié serait un fichier chargé pour personne — et surtout un
    // champion qui garderait son repli sans qu'on comprenne pourquoi.
    const inconnus = IDS.filter((id) => !CHAMPION_BY_ID.has(id));
    expect(inconnus, `ids qui ne désignent aucun champion : ${inconnus.join(', ')}`).toEqual([]);
  });

  it('⚠️ UN CHAMPION SANS PORTRAIT REND `null`, jamais une chaîne vide ni un chemin deviné', () => {
    // C'est ce qui fait que le repli (l'avatar habillé de sa classe) s'affiche au lieu
    // d'une image cassée. Le roster peut donc être illustré champion par champion.
    const sansPortrait = CHAMPIONS.filter((c) => !IDS.includes(c.id));
    for (const c of sansPortrait) expect(championPortrait(c.id), c.id).toBeNull();
    // …et les entrées absurdes non plus ne fabriquent pas de chemin.
    expect(championPortrait('')).toBeNull();
    expect(championPortrait(null)).toBeNull();
    expect(championPortrait(undefined)).toBeNull();
    expect(championPortrait('nexistepas')).toBeNull();
  });

  it('le compte des portraits suit la table', () => {
    expect(portraitCount()).toBe(IDS.length);
  });
});
