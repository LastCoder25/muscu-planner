// exoExclusivity.ts — QUI PEUT PRENDRE UN EXO : la règle « un exo n'est que dans UN défi à la
// fois » (Défi 360 ou challenge) et sa SEULE exception. Pur/testable.
//
// ⚠️ OVERRIDE DE L'EXCLUSIVITÉ POUR LE FRACTIONNÉ (demandé par l'utilisateur : « je devrais
// pouvoir avoir les tractions en challenge même si je les ai dans mon 360 — en fractionné »).
// Pour un exo qui se FRACTIONNE (`fractionableExercise` : tractions, pompes, dips et variantes) :
//  • deux défis CLASSIQUES (Défi 360, challenge en séries ou en reps) sur le même exo : refusés ;
//  • deux défis FRACTIONNÉS (challenge saisi par « +1 ») : refusés — une prise irait dans lequel ? ;
//  • un classique ET un fractionné : AUTORISÉS, dans les deux sens (le 360 peut prendre les
//    tractions qu'un challenge fractionné occupe, et inversement).
// Un exo qui ne se fractionne pas garde l'exclusivité telle quelle. La FAMILLE de variantes
// (`variantFamilyKey`) reste la maille : « dips » occupe aussi « dips assistés ».
import { variantFamilyKey, fractionableExercise } from '@/data/combo';
import { isFractionChallenge, type Challenge } from './challenges';
import type { ComboChallenge } from './combo';

export interface Occupant {
  family: string;
  /** `fraction` = un challenge saisi par « +1 » ; `classic` = tout le reste (360 compris). */
  kind: 'classic' | 'fraction';
  source: 'combo' | 'challenge';
  /** Nom à citer dans la raison (l'exo du challenge ; « Défi 360 » pour le 360). */
  name: string;
}

/** Les places prises par les défis ACTIFS. */
export function occupantsOf(
  challenges: readonly Challenge[],
  combos: readonly ComboChallenge[],
): Occupant[] {
  const out: Occupant[] = [];
  for (const c of challenges)
    if (c.status === 'active')
      out.push({
        family: variantFamilyKey(c.exercise_id),
        kind: isFractionChallenge(c) ? 'fraction' : 'classic',
        source: 'challenge',
        name: c.exercise_name,
      });
  for (const c of combos)
    if (c.status === 'active')
      for (const l of c.legs ?? [])
        out.push({
          family: variantFamilyKey(l.exercise_id),
          kind: 'classic', // le fractionné a été retiré du 360 : ses exos sont toujours classiques
          source: 'combo',
          name: c.name || 'Défi 360',
        });
  return out;
}

export interface Availability {
  fractionable: boolean;
  /** Qui empêche de prendre l'exo en CLASSIQUE (séries, répétitions, Défi 360) ; null = libre. */
  classic: Occupant | null;
  /** Qui empêche de le prendre en FRACTIONNÉ ; null = libre. (Sans objet si !fractionable.) */
  fraction: Occupant | null;
}

export function exoAvailability(exerciseId: string, occupants: readonly Occupant[]): Availability {
  const fam = variantFamilyKey(exerciseId);
  const onFam = occupants.filter((o) => o.family === fam);
  if (!fractionableExercise(exerciseId)) {
    const any = onFam[0] ?? null;
    return { fractionable: false, classic: any, fraction: any };
  }
  return {
    fractionable: true,
    classic: onFam.find((o) => o.kind === 'classic') ?? null,
    fraction: onFam.find((o) => o.kind === 'fraction') ?? null,
  };
}

/** L'exo reste-t-il sélectionnable dans AU MOINS un mode ? */
export function exoSelectable(a: Availability): boolean {
  return a.fractionable ? !(a.classic && a.fraction) : !a.classic;
}
/** Pris en classique mais libre en fractionné : on le propose, fractionné seul. */
export function fractionOnly(a: Availability): boolean {
  return a.fractionable && !!a.classic && !a.fraction;
}

/** « déjà dans ton Défi 360 » / « déjà dans ton challenge « Tractions » » — la RAISON d'un mode
 *  grisé, jamais un grisé muet. */
export function occupantReason(o: Occupant): string {
  return o.source === 'combo'
    ? 'déjà dans ton Défi 360'
    : o.kind === 'fraction'
      ? `déjà dans ton challenge fractionné « ${o.name} »`
      : `déjà dans ton challenge « ${o.name} »`;
}
