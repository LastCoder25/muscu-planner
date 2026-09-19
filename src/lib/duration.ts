/**
 * Formatage d'une DURÉE, pour l'affichage. Pur, sans dépendance.
 *
 * ⚠️ **SOURCE UNIQUE, et elle manquait.** La même fonction vivait en TROIS exemplaires —
 * `ExpeditionMapPage.fmtMs`, `GuildPanel.fmtMs` et `CaravanReportView.fmtDuration` —
 * rigoureusement identiques, donc trois endroits à corriger pour un seul défaut. C'est le
 * schéma que ce projet documente partout : deux copies d'une règle finissent par diverger
 * (les libellés de POI, le test de ferraille, le dessin des balistes).
 *
 * ⚠️ **LES JOURS ÉTAIENT ABSENTS, et c'est ce qui rendait un chrono illisible.** Le
 * compte à rebours d'une faille porte jusqu'à **7 jours** : il s'affichait
 * « ⏳ 168 h 00 » à son apparition, et descendait « 156 h », « 132 h », « 108 h »…
 * Personne ne lit 168 heures comme « une semaine » d'un coup d'œil (signalé par
 * l'utilisateur). Même chose au Centre de formation, où la strate la plus haute vaut
 * **64 h** à bas niveau.
 *
 * ⚠️ **AUCUN TRAJET N'EST TOUCHÉ, et c'est MESURÉ** : l'aller le plus long du jeu vaut
 * 7,5 h (niveau 100, bout de la carte) et le convoi le plus lent 22 h 18 d'aller-retour
 * — tout reste sous les 24 h, donc sous le seuil des jours. Un test le verrouille : le
 * jour où un voyage dépasserait 24 h, il faudra décider s'il se lit en jours.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * « 45 min » · « 6 h 30 » · « 1 j 14 h » · « 7 j ».
 *
 * ⚠️ Au-delà de 24 h on laisse tomber les MINUTES : à cette échelle elles sont du bruit,
 * et « 6 j 23 h 59 » se lit moins bien que « 6 j 23 h ». On tronque (jamais d'arrondi au
 * jour supérieur) pour que le chiffre affiché soit toujours un « il reste AU MOINS ».
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, ms);
  if (total >= DAY) {
    const d = Math.floor(total / DAY);
    const h = Math.floor((total % DAY) / HOUR);
    return h > 0 ? `${d} j ${h} h` : `${d} j`;
  }
  const m = Math.round(total / MIN);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** La même, pour une durée déjà exprimée en minutes. */
export function formatDurationMin(min: number): string {
  return formatDuration(min * MIN);
}
