// 🏋️ LE CHOIX D'EXERCICE DE LA SÉANCE LIBRE (audit 2026-10-15).
//
// Le sélecteur listait la bibliothèque dans l'ordre de la base, avec le code brut du
// matériel (« poids_du_corps », « halteres ») : on cherchait ses exercices habituels parmi
// une centaine à chaque séance. Les favoris du profil et ce qu'on a fait récemment passent
// désormais devant, et le matériel se lit en français.

/** Le matériel tel qu'il est écrit en base, en français lisible. Les variantes d'orthographe
 *  trouvées en base (« elastique » sans accent, « bands ») se lisent pareil. */
const EQUIP_LABEL: Record<string, string> = {
  poids_du_corps: 'poids du corps',
  halteres: 'haltères',
  machine: 'machine',
  barre: 'barre',
  élastique: 'élastique',
  elastique: 'élastique',
  bands: 'élastique',
  kettlebell: 'kettlebell',
  poulie: 'poulie',
  box: 'box',
};
export function equipmentLabel(code: string | null | undefined): string {
  if (!code) return '';
  return EQUIP_LABEL[code] ?? code.replace(/_/g, ' ');
}

/** Sans charge en kg (poids du corps ou élastique) : la charge affichée est un LEST.
 *  ⚠️ Toutes les orthographes de l'élastique présentes en base — la règle d'avant ne
 *  connaissait que « élastique » et traitait les trois exos « elastique »/« bands » comme
 *  des exercices chargés. */
export function isUnloadedEquipment(code: string | null | undefined): boolean {
  return code === 'poids_du_corps' || code === 'élastique' || code === 'elastique' || code === 'bands';
}

/** Les exercices du plus récemment fait au plus ancien, d'après les bilans (du plus récent
 *  au plus ancien, ordre de `logs.fetchAll`). Un exercice échangé compte pour celui fait. */
export function recentExerciseIds(
  logs: readonly { exercises?: readonly { id: string }[] }[],
  limit = 12,
): string[] {
  const out: string[] = [];
  for (const l of logs) {
    for (const e of l.exercises ?? []) {
      if (!out.includes(e.id)) out.push(e.id);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export type PickerTag = 'fav' | 'recent' | null;

/** L'ordre du sélecteur : favoris, puis faits récemment (du plus récent), puis le reste dans
 *  l'ordre reçu. Rend chaque exercice avec son repère pour l'écran. Ne trie pas en place. */
export function pickerOrder<T extends { id: string }>(
  lib: readonly T[],
  favorites: readonly string[],
  recent: readonly string[],
): { ex: T; tag: PickerTag }[] {
  const fav = new Set(favorites);
  const rank = (e: T) => {
    if (fav.has(e.id)) return 0;
    const r = recent.indexOf(e.id);
    return r < 0 ? Infinity : 1 + r;
  };
  return lib
    .map((ex, i) => ({ ex, i, r: rank(ex) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ ex, r }) => ({ ex, tag: r === 0 ? 'fav' : Number.isFinite(r) ? 'recent' : null }));
}
