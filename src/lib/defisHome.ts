/**
 * 🔥 CE QUE LA GRANDE TUILE DE L'ACCUEIL ANNONCE — « le centre névralgique de l'app »
 * (demandé par l'utilisateur).
 *
 * ⚠️ **EN LIB, PAS DANS UN `computed` D'ÉCRAN.** L'accueil connecté n'est vu par AUCUNE
 * porte (le smoke s'arrête à l'écran de connexion), donc une règle écrite là-bas ne serait
 * couverte par rien — et « combien de défis appellent aujourd'hui ? » est exactement le
 * genre de compte qui dérive en silence.
 *
 * ⚠️ **ON NE COMPTE QUE CE QUI APPELLE.** Un défi terminé ou abandonné n'a plus rien à
 * demander : l'afficher gonflerait un nombre qui doit vouloir dire « il y a à faire ».
 */

import { challengeStats, type Challenge } from './challenges';
import { activeCombo, comboProgressPct, legAllDone, type ComboChallenge } from './combo';

export interface DefisSummary {
  /** Défis solo EN COURS (statut actif), quel que soit leur état du jour. */
  active: number;
  /** …dont l'objectif du JOUR reste à faire. C'est le seul chiffre qui appelle.
   *
   *  ⚠️ **CHANGEMENT DE RÈGLE ASSUMÉ (v0.961)** : le badge du header comptait « pas encore
   *  TOUCHÉ aujourd'hui » (`!isDoneToday`, qui vaut `todayDone > 0`), donc un défi entamé
   *  à moitié en sortait. Le libellé dit « à faire » : tant que l'objectif du jour n'est
   *  pas ATTEINT, il reste à faire. Un test épingle la différence. */
  dueToday: number;
  /** Le Défi 360 en cours, s'il y en a un. */
  combo: {
    name: string;
    /** Avancement global, arrondi à l'entier pour une tuile étroite. */
    pct: number;
    /** Exercices qui n'ont pas atteint leur palier MAXIMAL — ce qu'il reste à travailler.
     *  ⚠️ Le maximal, pas l'objectif : la zone bonus jusqu'à 120 % compte et paie
     *  (v0.647), donc un exo « à 100 % » a encore de quoi faire. */
    left: number;
  } | null;
}

/** ⚠️ `today` est INJECTÉ (`logicalToday()`, qui bascule à 4 h) : le module reste pur, et
 *  l'accueil ne doit pas inventer sa propre notion de journée. */
export function defisSummary(
  challenges: readonly Challenge[],
  combos: readonly ComboChallenge[],
  today: string,
): DefisSummary {
  const actifs = challenges.filter((c) => c.status === 'active');
  // ⚠️ PAS de garde `todayTarget > 0` : il serait DORMANT. `todayDone` ne peut pas être
  // négatif, donc « fait < objectif » implique déjà un objectif non nul — un jour de repos
  // (objectif 0) et une date hors période n'appellent donc jamais, par construction. Une
  // mutation l'a montré en survivant ; le projet retire ces gardes plutôt que de les garder
  // invérifiables (v0.751, v0.922), et la propriété vit dans un TEST.
  const due = actifs.filter((c) => {
    const s = challengeStats(c, today);
    return s.todayDone < s.todayTarget;
  });
  // ⚠️ `activeCombo` et non `find(status === 'active')` : c'est la SOURCE UNIQUE de « le
  // 360 en cours » (v0.905), et elle recalcule le statut plutôt que de lire le champ
  // stocké — un 360 dont la période est passée n'appelle plus rien.
  const c = activeCombo(combos, today);
  return {
    active: actifs.length,
    dueToday: due.length,
    combo: c
      ? {
          name: c.name,
          pct: Math.round(comboProgressPct(c)),
          left: c.legs.filter((l) => !legAllDone(l)).length,
        }
      : null,
  };
}
