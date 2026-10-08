/**
 * 🧭 LE FILTRE DES VOYAGES, PARTAGÉ (2026-10-08) : la rangée sous la carte, la rangée par-dessus
 * et les flèches ‹ › de la fiche d'un voyage lisent le MÊME filtre. Avant, chaque rangée gardait
 * sa copie (relue au montage) : on pouvait filtrer l'une et voir l'autre ignorer le choix.
 * Persisté par compte (`tripFiltersKey`) ; stockage indisponible : « tout », sans rien bloquer.
 */
import { effectScope, ref, watch, type Ref } from 'vue';
import { getActivePinia, type Pinia } from 'pinia';
import {
  parseTripFilters,
  serializeTripFilters,
  tripFiltersKey,
  type TripSelection,
} from '@/lib/tripFilter';
import type { LegSelection, TripLeg } from '@/lib/tripLegTiles';
import { useAuthStore } from '@/stores/auth';

type FilterState = {
  uid: string | null;
  selection: Ref<TripSelection>;
  legSel: Ref<LegSelection>;
};
/** ⚠️ Un état PAR APPLICATION (instance Pinia), pas par module : une seconde app (un test qui
 *  remonte l'écran) doit relire le stockage, pas hériter du filtre de la précédente. */
const states = new WeakMap<Pinia, FilterState>();
let orphan: FilterState | null = null;

export function useTripFilters(): { selection: Ref<TripSelection>; legSel: Ref<LegSelection> } {
  const auth = useAuthStore();
  const uid = auth.user?.id ?? null;
  const pinia = getActivePinia();
  const known = pinia ? states.get(pinia) : orphan;
  if (known && known.uid === uid) return known;
  let saved = parseTripFilters(null);
  try {
    saved = parseTripFilters(localStorage.getItem(tripFiltersKey(uid)));
  } catch {
    /* stockage indisponible : « tout » */
  }
  const selection = ref<TripSelection>(saved.sel);
  const legSel = ref<LegSelection>(new Set<TripLeg>(saved.legs));
  // ⚠️ Hors de tout composant (portée détachée) : sinon fermer le premier panneau monté
  // arrêterait la sauvegarde pour toute la session.
  effectScope(true).run(() =>
    watch([selection, legSel], ([sel, legs]) => {
      try {
        localStorage.setItem(tripFiltersKey(uid), serializeTripFilters(sel, legs));
      } catch {
        /* stockage indisponible : le filtre vaut pour cette ouverture seulement */
      }
    }),
  );
  const fresh: FilterState = { uid, selection, legSel };
  if (pinia) states.set(pinia, fresh);
  else orphan = fresh;
  return fresh;
}
