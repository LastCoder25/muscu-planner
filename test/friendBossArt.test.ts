import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRIEND_BOSS_ART, friendBossArt } from '@/data/friendBossArt';
import { BOSS_EMOJIS, bossEmoji } from '@/lib/friendBoss';

const KEYS = Object.keys(FRIEND_BOSS_ART);
const chemin = (url: string) => resolve(__dirname, '../public' + url);

describe('🐉 LES ILLUSTRATIONS DES BOSS ENTRE AMIS (v0.1109)', () => {
  it('⚠️ CHAQUE FICHIER NOMMÉ EXISTE SUR LE DISQUE', () => {
    const manquants = KEYS.filter((k) => !existsSync(chemin(FRIEND_BOSS_ART[k]!)));
    expect(manquants, `illustrations déclarées sans fichier : ${manquants.join(' ')}`).toEqual([]);
  });

  it('⚠️ CHAQUE CLÉ EST UNE SILHOUETTE QUE LE TIRAGE PEUT RENDRE', () => {
    // Une clé hors de `BOSS_EMOJIS` serait une image que personne ne verrait jamais.
    const inconnues = KEYS.filter((k) => !(BOSS_EMOJIS as readonly string[]).includes(k));
    expect(inconnues).toEqual([]);
  });

  it('chaque silhouette que le tirage peut rendre est illustrée', () => {
    const sans = BOSS_EMOJIS.filter((e) => !KEYS.includes(e));
    expect(sans, `silhouettes sans illustration : ${sans.join(' ')}`).toEqual([]);
  });

  it('deux silhouettes ne partagent jamais la même image, et le poids reste tenable', () => {
    const fichiers = KEYS.map((k) => FRIEND_BOSS_ART[k]!);
    expect(new Set(fichiers).size).toBe(fichiers.length);
    const lourds = fichiers.filter((f) => statSync(chemin(f)).size > 60_000);
    expect(lourds).toEqual([]);
  });

  it('suit la silhouette tirée de l’id — jamais un second tirage', () => {
    for (let i = 0; i < 40; i++) {
      const id = `boss-${i}`;
      const attendu = FRIEND_BOSS_ART[bossEmoji(id)] ?? null;
      expect(friendBossArt(id)).toBe(attendu);
    }
    expect(friendBossArt('')).toBeNull();
    expect(friendBossArt(null)).toBeNull();
  });
});
