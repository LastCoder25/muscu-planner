// 📅 LES JOURS OÙ LE JOUEUR A FAIT DU SPORT — et ce qui compte comme « faire du sport ».
//
// ⚠️ POURQUOI CE MODULE EXISTE. Le rythme des sièges est « lié à l'ACTIVITÉ SPORTIVE »
// (v0.661) : plus on s'entraîne, plus il se passe de choses à la base. Le compte
// d'activité ne regardait pourtant QUE les séances enregistrées — journaux de muscu,
// sorties cardio, séances de tennis. Or une partie des joueurs ne s'entraîne PAS en
// séances : celui qui ne fait qu'un Défi 360, ou que des défis solo, n'a aucune de ces
// lignes. Compté à zéro, il basculait du côté « joueur inactif » — donc, `raidsEnabled`
// exigeant au moins un jour actif, il n'était **JAMAIS attaqué** : un système entier
// absent pour quelqu'un qui s'entraîne pourtant toutes les semaines.
//
// ⚠️ ON COMPTE DES JOURS, PAS DES LIGNES. Une journée de Défi 360 produit une entrée par
// SÉRIE : comptées à la ligne, dix séries vaudraient dix séances et une seule séance de
// muscu en vaudrait une. Le nombre de jours distincts est la seule unité dans laquelle
// toutes les pratiques se comparent. Corollaire bienvenu : une journée où l'on court ET
// où l'on soulève ne compte plus double, ce que l'ancien décompte faisait.
//
// ⚠️ Module à part (comme `buildingPreview.ts`) : il a besoin des types des défis ET du
// Défi 360, que ni `athlete.ts` ni `raid.ts` ne peuvent importer sans créer un cycle.

import { legSets, type ComboChallenge } from './combo';

/** Tout ce qui témoigne d'une pratique sportive.
 *  ⚠️ Chaque champ est REQUIS : ajouter une source de sport sans dire si elle rend le
 *  joueur actif devient une erreur de compilation chez tous les appelants, pas un oubli
 *  silencieux — c'est exactement l'oubli qui a produit le défaut ci-dessus. */
export interface ActivitySources {
  /** `session_logs` : muscu, séance libre ET prépa physique. */
  sessions: { performed_at?: string | null }[];
  /** Sorties cardio. ⚠️ Les entrées MIROIR (créées par un défi cardio) sont gardées :
   *  elles témoignent d'une vraie sortie ce jour-là. Le doublon avec le défi lui-même est
   *  sans effet puisqu'on compte des jours distincts. */
  cardio: { performed_at?: string | null }[];
  /** Séances sur le court. */
  tennis: { performed_at?: string | null }[];
  /** Défis solo : un jour compte s'il y a été fait quelque chose. */
  challenges: { progress: { date: string; done: number }[] }[];
  /** Défi 360 : chaque série porte sa date. */
  combos: ComboChallenge[];
}

/** Le jour d'une date ISO, ou null si elle n'en porte pas. */
const day = (iso: string | null | undefined): string | null =>
  iso && iso.length >= 10 ? iso.slice(0, 10) : null;

/**
 * Les jours DISTINCTS où le joueur a fait du sport, depuis `sinceDay` (inclus).
 *
 * ⚠️ `sinceDay` est passé par l'appelant, jamais lu de l'horloge : ce module doit être
 * pur pour être testable — le projet s'est déjà fait avoir par un aller-retour de fuseau
 * sur les dates (cf. `startDate.ts`), et les comparaisons ici sont des comparaisons de
 * CHAÎNES `YYYY-MM-DD`, donc à l'abri du fuseau par construction.
 */
export function activeDaysSince(src: ActivitySources, sinceDay: string): number {
  const jours = new Set<string>();
  const add = (iso: string | null | undefined) => {
    const d = day(iso);
    if (d && d >= sinceDay) jours.add(d);
  };
  for (const r of src.sessions) add(r.performed_at);
  for (const r of src.cardio) add(r.performed_at);
  for (const r of src.tennis) add(r.performed_at);
  // ⚠️ `done > 0`, pas « la journée existe » : les journées d'un défi sont créées à
  // l'avance (et clôturées automatiquement même vides). Une journée manquée ne doit pas
  // rendre le joueur actif.
  for (const c of src.challenges) for (const p of c.progress) if (p.done > 0) add(p.date);
  // `legSets` plutôt que le champ brut : c'est lui qui sait lire les 360 d'avant la
  // refonte des séries.
  for (const c of src.combos)
    for (const leg of c.legs) for (const s of legSets(leg)) if (s.reps > 0) add(s.date);
  return jours.size;
}
