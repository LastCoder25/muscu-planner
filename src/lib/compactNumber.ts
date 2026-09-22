// compactNumber.ts — un nombre COURT pour les puces de ressources (pur/testé).
//
// Demandé : « faire apparaître les ressources sur la même ligne, quitte à passer l'or en
// 400k, 4M ». Au plus 4 caractères de chiffres : on garde la précision là où elle se lit
// (sous 10 000, le chiffre exact), puis k / M avec une décimale tant qu'elle apporte
// quelque chose. ⚠️ La valeur EXACTE reste dans l'infobulle de la puce.

/** 1 234 → « 1234 », 12 345 → « 12,3k », 400 000 → « 400k », 4 200 000 → « 4,2M ». */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(Math.round(n));
  if (a < 10_000) return sign + String(a);
  const unit = (v: number, suffix: string) =>
    sign + (v < 100 ? trim(v.toFixed(1)) : String(Math.floor(v))) + suffix;
  // ⚠️ On TRONQUE, jamais d'arrondi au-dessus : « 999,96k » ne doit pas s'afficher « 1000k »
  // ni une réserve paraître plus grosse qu'elle n'est.
  if (a < 1_000_000) return unit(Math.floor(a / 100) / 10, 'k');
  if (a < 1_000_000_000) return unit(Math.floor(a / 100_000) / 10, 'M');
  return unit(Math.floor(a / 100_000_000) / 10, 'G');
}

/** « 12,0 » → « 12 » ; « 12,3 » → « 12,3 » (virgule française). */
function trim(s: string): string {
  return s.replace(/\.0$/, '').replace('.', ',');
}
