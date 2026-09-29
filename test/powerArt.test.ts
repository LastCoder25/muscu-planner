import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { RELIC_ART, TROPHY_ART, powerArt } from '@/data/powerArt';
import { RELIC_POWERS, TROPHY_POWERS } from '@/lib/items';
import { MILITIA_ART } from '@/data/militiaArt';

const chemin = (url: string) => resolve(__dirname, '../public' + url);
const TOUS = [...Object.values(RELIC_ART), ...Object.values(TROPHY_ART), MILITIA_ART];

describe('🔮🏆 LES ILLUSTRATIONS DES POUVOIRS', () => {
  it('chaque pouvoir de relique et de trophée a son illustration', () => {
    // Le type rend la table exhaustive ; ceci vérifie qu'elle suit bien les tables de JEU.
    expect(Object.keys(RELIC_ART).sort()).toEqual(RELIC_POWERS.map((p) => p.id).sort());
    expect(Object.keys(TROPHY_ART).sort()).toEqual(TROPHY_POWERS.map((p) => p.id).sort());
  });

  it('⚠️ CHAQUE FICHIER NOMMÉ EXISTE SUR LE DISQUE', () => {
    const manquants = TOUS.filter((p) => !existsSync(chemin(p)));
    expect(manquants, `illustrations déclarées sans fichier : ${manquants.join(', ')}`).toEqual([]);
  });

  it('⚠️ DEUX POUVOIRS NE PARTAGENT JAMAIS LA MÊME IMAGE', () => {
    expect(new Set(TOUS).size).toBe(TOUS.length);
  });

  it('⚠️ LE POIDS RESTE TENABLE — un sac en affiche des dizaines', () => {
    const lourds = TOUS.filter((p) => statSync(chemin(p)).size > 40_000);
    expect(lourds, `illustrations trop lourdes : ${lourds.join(', ')}`).toEqual([]);
  });

  it('⚠️ UNE RELIQUE NE PREND JAMAIS L’IMAGE D’UN TROPHÉE, NI L’INVERSE', () => {
    expect(powerArt('relic', 'brasier')).toBe(RELIC_ART.brasier);
    expect(powerArt('trophy', 'achever')).toBe(TROPHY_ART.achever);
    expect(powerArt('relic', 'achever')).toBeNull();
    expect(powerArt('trophy', 'brasier')).toBeNull();
  });

  it('sans pouvoir, pouvoir inconnu ou autre emplacement : null, jamais un chemin deviné', () => {
    expect(powerArt('relic', undefined)).toBeNull();
    expect(powerArt('relic', 'inventé')).toBeNull();
    expect(powerArt('relic', 'constructor')).toBeNull();
    expect(powerArt('weapon', 'brasier')).toBeNull();
    expect(powerArt(undefined, 'brasier')).toBeNull();
  });
});
