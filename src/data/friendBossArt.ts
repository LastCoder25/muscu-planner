/**
 * 🐉 LES ILLUSTRATIONS DES BOSS ENTRE AMIS (v0.1109 ; demandé par l'utilisateur).
 *
 * Un boss entre amis n'a pas de nom de créature (il porte le nom de son exercice) : sa
 * silhouette est tirée de son id parmi `BOSS_EMOJIS`, donc la même pour tout le groupe et à
 * chaque visite. L'illustration suit la MÊME clé — l'emoji tiré —, jamais un second tirage
 * qui pourrait désigner une autre créature que celle de la liste.
 *
 * Générées par `scripts/fetch-monster-art.mjs` (slugs `fb_*`), **DE FACE** : la scène pose le
 * boss en haut, le groupe dessous.
 *
 * ⚠️ **LA TABLE NE RECENSE QUE CE QUI EXISTE** (patron de `monsterArt`) : un test vérifie que
 * chaque fichier est sur le disque. Une silhouette absente garde son emoji. À ajouter une fois
 * générés : 🐉 fb_dragon · 👹 fb_oni · 🦖 fb_tyran · 🐙 fb_kraken · 🦂 fb_scorpion ·
 * 🧌 fb_troll · 🐲 fb_long · 👾 fb_xeno.
 */
import { bossEmoji } from '@/lib/friendBoss';

export const FRIEND_BOSS_ART: Readonly<Record<string, string>> = {};

/** L'illustration d'un boss entre amis, ou `null` — l'appelant retombe sur l'emoji. */
export function friendBossArt(bossId: string | null | undefined): string | null {
  if (!bossId) return null;
  const emo = bossEmoji(bossId);
  return Object.hasOwn(FRIEND_BOSS_ART, emo) ? (FRIEND_BOSS_ART[emo] ?? null) : null;
}
