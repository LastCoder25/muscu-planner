import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHAMPION_PORTRAITS,
  championPortrait,
  championPortraitLarge,
} from '@/data/championPortraits';
import { CHAMPIONS, CHAMPION_BY_ID } from '@/data/champions';

// ⚠️ ON LIT LA DONNÉE EXPORTÉE, pas le TEXTE du fichier source. Une regex sur la source
// (`/^\s{2}(\w+):/`) se désarme au premier reformatage — clé citée, indentation autre,
// ligne coupée par Prettier — et les tests passeraient alors **au vert en ne vérifiant
// plus rien**, précisément le mode de panne que ce garde-fou existe pour éviter.
// Importer n'est pas recopier.
const IDS = Object.keys(CHAMPION_PORTRAITS);
const chemin = (url: string) => resolve(__dirname, '../public' + url);
const onDisk = (url: string) => existsSync(chemin(url));

describe('🖼️ LES PORTRAITS DE CHAMPIONS (v0.971)', () => {
  it('⚠️ CHAQUE FICHIER NOMMÉ EXISTE SUR LE DISQUE', () => {
    // LA garantie de la table explicite : sans elle, un portrait manquant se verrait en
    // production au lieu d'ici — et l'avatar, dont le corps est éteint, se viderait.
    const manquants = IDS.filter((id) => !onDisk(CHAMPION_PORTRAITS[id]!));
    expect(manquants, `portraits déclarés sans fichier : ${manquants.join(', ')}`).toEqual([]);
  });

  it('⚠️ CHAQUE PORTRAIT DÉCLARÉ EST UN VRAI CHAMPION', () => {
    // Un id mal orthographié serait un fichier chargé pour personne — et un champion qui
    // garderait son repli sans qu'on comprenne pourquoi.
    const inconnus = IDS.filter((id) => !CHAMPION_BY_ID.has(id));
    expect(inconnus, `ids qui ne désignent aucun champion : ${inconnus.join(', ')}`).toEqual([]);
  });

  it('les 32 champions sont illustrés', () => {
    // Le repli existe pour qu'un roster à moitié illustré ne casse rien ; ça ne veut pas
    // dire qu'on s'en contente. Ajouter un champion sans son portrait fait rougir ici.
    const sans = CHAMPIONS.filter((c) => !IDS.includes(c.id)).map((c) => c.id);
    expect(sans, `champions sans portrait : ${sans.join(', ')}`).toEqual([]);
  });

  it('⚠️ DEUX CHAMPIONS NE PARTAGENT JAMAIS LA MÊME IMAGE', () => {
    // C'est la collection qui EST le jeu : deux champions au même visage, et tirer le
    // second ne vaut plus rien. Un copier-coller dans la table passerait sinon inaperçu,
    // puisque le fichier existe bel et bien.
    const fichiers = IDS.map((id) => CHAMPION_PORTRAITS[id]!);
    expect(new Set(fichiers).size).toBe(fichiers.length);
  });

  it('⚠️ LE POIDS RESTE TENABLE — le Codex affiche les 32 d’un coup', () => {
    // Le service worker ne cache RIEN : chaque octet est retéléchargé à chaque visite, et
    // le Codex demande les 32 ensemble. Bornes larges (on mesure ~6 Ko pièce) mais réelles :
    // elles attrapent la vraie régression, quelqu’un qui déposerait des PNG de 500 Ko.
    const poids = IDS.map((id) => statSync(chemin(CHAMPION_PORTRAITS[id]!)).size);
    const lourds = IDS.filter((id, i) => poids[i]! > 40_000);
    expect(lourds, `portraits trop lourds : ${lourds.join(', ')}`).toEqual([]);
    expect(poids.reduce((a, b) => a + b, 0)).toBeLessThan(700_000);
  });

  it('⚠️ UN ID INCONNU REND `null`, jamais une chaîne vide ni un chemin deviné', () => {
    // C'est ce qui fait que le repli s'affiche au lieu d'une image cassée.
    expect(championPortrait('nexistepas')).toBeNull();
    expect(championPortrait('')).toBeNull();
    expect(championPortrait(null)).toBeNull();
    expect(championPortrait(undefined)).toBeNull();
    // ⚠️ Et une clé du prototype ne fabrique pas une valeur : sur un objet littéral,
    // `x['constructor']` rendrait une FONCTION.
    expect(championPortrait('constructor')).toBeNull();
    expect(championPortrait('toString')).toBeNull();
  });

  it('un champion illustré rend le chemin de sa table, et ce fichier existe', () => {
    // ⚠️ On ne ré-écrit PAS l'extension attendue : ce test l'épinglait (`.svg`), donc il
    // rougissait au changement de format sans rien protéger de plus. Ce qui compte est
    // que la fonction rende bien l'entrée de la table — et qu'elle désigne un vrai fichier.
    for (const c of CHAMPIONS) {
      const url = championPortrait(c.id);
      expect(url, c.id).toBe(CHAMPION_PORTRAITS[c.id]);
      expect(onDisk(url!), c.id).toBe(true);
    }
  });
});

describe('🖼️ LES GRANDS PORTRAITS (v0.987, roulette verticale du ×1)', () => {
  it('⚠️ CHAQUE CHAMPION ILLUSTRÉ A SA VERSION GRANDE SUR LE DISQUE', () => {
    const manquants = IDS.filter((id) => !onDisk(championPortraitLarge(id)!));
    expect(manquants, `grands portraits manquants : ${manquants.join(', ')}`).toEqual([]);
  });
  it('la grande est un AUTRE fichier que la petite, et suit le même repli', () => {
    for (const id of IDS) expect(championPortraitLarge(id)).not.toBe(championPortrait(id));
    expect(championPortraitLarge('nexistepas')).toBeNull();
    expect(championPortraitLarge(null)).toBeNull();
  });
  it('⚠️ LE POIDS RESTE TENABLE — la roulette en montre des dizaines', () => {
    const poids = IDS.map((id) => statSync(chemin(championPortraitLarge(id)!)).size);
    expect(Math.max(...poids)).toBeLessThan(60_000);
    expect(poids.reduce((a, b) => a + b, 0)).toBeLessThan(900_000);
  });
});
