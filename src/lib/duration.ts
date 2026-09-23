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
 * l'utilisateur).
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

/**
 * Un CHRONO : « 42 » sous la minute, « 2:05 » au-delà.
 *
 * ⚠️ AUTRE BESOIN QUE `formatDuration`, qui parle en « 6 h 30 » — ici on lit des secondes
 * pendant l'effort, à la seconde près. Elle vit quand même dans CE module : c'est celui
 * que le projet a créé pour que le formatage d'une durée cesse d'être recopié.
 *
 * ⚠️ L'EXPRESSION EST DÉJÀ ÉCRITE UNE DIZAINE DE FOIS dans les écrans de chrono
 * (`ChallengeDetailPage` ×3, `ComboSessionPage`, `SessionLivePage`, `FreeSessionPage`,
 * `CourtLivePage`…), et elles ont DÉJÀ divergé : `ChallengeNewPage` pade les minutes
 * (« 02:05 »), les autres non. On ne rajoute pas une copie de plus ; les existantes
 * restent à rapatrier ici le jour où l'on touche à ces écrans.
 *
 * ⚠️ Sous la minute on rend le nombre NU, sans « 0: » : c'est ce que font déjà les écrans
 * de gainage, et c'est bien plus lisible en grand sur un téléphone posé devant soi.
 */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
}
