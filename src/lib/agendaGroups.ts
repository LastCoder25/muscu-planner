/**
 * 📅 REGROUPER LES ENTRÉES D'UNE JOURNÉE PAR SOURCE (v0.967 ; demandé par l'utilisateur :
 * « dans l'agenda regroupe par source les exos faits »).
 *
 * ⚠️ **POURQUOI ÇA MANQUAIT** : un jour de Défi 360 produit **une entrée par EXO** et un
 * jour de challenges **une par défi** — sept exos de 360, trois challenges, une séance et
 * une sortie font douze lignes, avec la pastille « Défi 360 » répétée sept fois et
 * « Challenge » trois. La provenance, qui est la même pour tout un bloc, occupait une
 * place sur chaque ligne au lieu de la titrer une fois.
 *
 * ⚠️ **PAR SOURCE, PAS PAR `kind`**, et c'est plus fin : un `kind: 'muscu'` porte
 * « Séance », « Prépa » et « Autre sport » — trois provenances que le joueur distingue.
 *
 * ⚠️ **EN LIB, PAS DANS UN `computed` D'ÉCRAN** : l'Agenda n'est vu par AUCUNE porte (le
 * smoke s'arrête à l'écran de connexion), donc une règle écrite là-bas ne serait couverte
 * par rien — et « rien ne se perd au regroupement » est exactement le genre de garantie qui
 * casse en silence.
 */

/** Le minimum qu'une entrée doit porter pour être groupée. ⚠️ Une contrainte STRUCTURELLE,
 *  pas le type de l'écran : la lib n'a pas à connaître les champs d'affichage. */
export interface GroupableEntry {
  ts: number;
  source: string;
  icon: string;
  title: string;
  xp: number;
  energy: number;
}

export interface AgendaGroup<T extends GroupableEntry> {
  source: string;
  /** L'icône de la source — celle de sa première entrée, elles la partagent. */
  icon: string;
  entries: T[];
  /** Totaux du groupe : c'est ce que le regroupement REND POSSIBLE, et qu'aucune ligne
   *  isolée ne disait. */
  xp: number;
  energy: number;
}

/**
 * Groupe les entrées d'une journée par provenance.
 *
 * ⚠️ **L'ORDRE DES GROUPES SUIT L'HEURE DE LEUR PREMIÈRE ENTRÉE**, pas un ordre de sources
 * figé : l'Agenda est chronologique, et une séance faite le matin doit rester avant une
 * sortie de l'après-midi.
 *
 * ⚠️ **DANS UN GROUPE : heure, PUIS TITRE.** Les entrées de 360 et de challenge n'ont pas
 * d'heure réelle (elles sont posées à midi), donc sans le second critère leur ordre
 * dépendrait de l'ordre de construction — il changerait d'un chargement à l'autre. Trié par
 * titre, l'exo qu'on cherche est toujours au même endroit (la leçon de la v0.903).
 */
export function groupBySource<T extends GroupableEntry>(entries: readonly T[]): AgendaGroup<T>[] {
  const par = new Map<string, AgendaGroup<T>>();
  for (const e of entries) {
    let g = par.get(e.source);
    if (!g) {
      g = { source: e.source, icon: e.icon, entries: [], xp: 0, energy: 0 };
      par.set(e.source, g);
    }
    g.entries.push(e);
    g.xp += e.xp;
    g.energy += e.energy;
  }
  const groupes = [...par.values()];
  for (const g of groupes) {
    g.entries.sort((a, b) => a.ts - b.ts || a.title.localeCompare(b.title, 'fr'));
  }
  // ⚠️ On compare les PREMIÈRES entrées, déjà triées — pas un `Math.min` refait à part, qui
  // pourrait désigner une autre entrée que celle qu'on affiche en tête.
  return groupes.sort((a, b) => a.entries[0]!.ts - b.entries[0]!.ts);
}
