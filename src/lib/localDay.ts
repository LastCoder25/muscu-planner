/**
 * 📅 LA règle « quel jour (local) est-ce ? » — `YYYY-MM-DD` dans le fuseau de l'appareil.
 *
 * ⚠️ UN MODULE SANS AUCUNE DÉPENDANCE, et c'est voulu : elle vivait dans `volume.ts`, qu'on
 * ne peut pas importer depuis `challenges.ts` sans cycle (`volume` → `combo` → `challenges`).
 * Faute de pouvoir l'importer, une douzaine d'écrans en avaient écrit leur propre copie
 * (v0.1010 : toutes identiques, toutes remplacées). Une règle de date recopiée finit
 * toujours par diverger — le projet s'est déjà fait décaler d'un jour en France par un
 * aller-retour local↔UTC.
 *
 * ⚠️ JAMAIS `toISOString().slice(0, 10)` : c'est la date UTC, qui bascule à 1 h ou 2 h du
 * matin en France.
 */
export function localDayIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
