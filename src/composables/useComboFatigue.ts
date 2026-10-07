// useComboFatigue — la fatigue des groupes musculaires d'un Défi 360, pour les écrans.
// Toute la règle vit dans `lib/muscleFatigue.ts` ; ici on ne fait que relier les séries du
// défi à la bibliothèque (muscles secondaires) et faire avancer l'horloge.
import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { useLibraryStore } from '@/stores/library';
import { comboSlot } from '@/data/combo';
import type { ComboLeg } from '@/lib/combo';
import {
  comboFatigueHits,
  exoFatigue,
  muscleLoad,
  muscleProfile,
  type FatigueHit,
  type MuscleProfile,
} from '@/lib/muscleFatigue';

/** Une demi-minute suffit : la charge décroît sur une demi-vie de plusieurs minutes. */
const TICK_MS = 30_000;

export function useComboFatigue(
  legs: Ref<readonly ComboLeg[]>,
  /** Séries faites en dehors du défi (séance en cours, pas encore enregistrée). */
  extraHits?: Ref<readonly FatigueHit[]>,
) {
  const library = useLibraryStore();
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    void library.fetchSecondaries().catch(() => undefined);
    timer = setInterval(() => (now.value = Date.now()), TICK_MS);
  });
  onUnmounted(() => clearInterval(timer));

  /** Muscles d'un exo : principal porté par la série/l'exo, sinon la bibliothèque. */
  function profileOf(exerciseId: string, primaryHint: string | null): MuscleProfile | null {
    const primary = primaryHint || library.primaries.get(exerciseId) || null;
    if (!primary) return null;
    return muscleProfile(primary, library.secondaries.get(exerciseId));
  }
  /** Muscles d'un exo du défi (repli sur le muscle de son emplacement). */
  function legProfile(leg: ComboLeg): MuscleProfile {
    return (
      profileOf(leg.exercise_id, leg.muscle_primary ?? null) ??
      muscleProfile(comboSlot(leg.slot)?.muscles[0], [])
    );
  }

  // ⚠️ `Date.now()` en plus de l'horloge : une série saisie à l'instant porterait sinon une
  // heure POSTÉRIEURE au dernier battement, et `muscleLoad` l'ignorerait comme future. Le
  // calcul se refait de toute façon dès que les séries changent (dépendance sur `legs`).
  const load = computed(() =>
    muscleLoad(
      [...comboFatigueHits(legs.value, profileOf), ...(extraHits?.value ?? [])],
      Math.max(now.value, Date.now()),
    ),
  );

  return {
    load,
    legProfile,
    fatigueOf: (leg: ComboLeg) => exoFatigue(load.value, legProfile(leg)),
  };
}
