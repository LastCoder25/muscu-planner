/**
 * 🚶↩️ UNE TUILE PAR ÉTAPE (demandé : « dans les tuiles d'expéditions sépare chaque étape
 * dans des tuiles différentes (aller/retour) et rajoute les filtres correspondants », puis
 * v1.107 : « sépare dans plusieurs tuiles les temps d'attente, d'aller, de temps
 * d'exploitation sur le lieu s'il y en a et de retour ; seul le temps correspondant s'affiche
 * dans la tuile »).
 *
 * Un voyage donne une tuile par étape RESTANTE (`tripPhases` dans `expedition.ts`) :
 * ⏳ attente du départ, → aller, 🔍 sur place (fouille, extraction), ↩ retour. L'étape en
 * cours décompte son temps restant ; les suivantes, estompées, montrent leur DURÉE. Chaque
 * tuile ne porte QUE son temps. Un trajet sans étapes connues garde une seule tuile : un
 * renfort (il reste sur le point), une traversée en mer, un départ programmé, un rappel vers
 * la base (déjà un retour).
 *
 * ⚠️ Les tuiles d'un voyage partagent sa `key` de voyage (`tripKey`) : toucher l'une ou
 * l'autre montre la même équipe et allume le même lieu. Leur clé d'AFFICHAGE (`key`) diffère.
 */
import type { TripPhase, TripPhaseId } from './expedition';

export type TripLeg = TripPhaseId;
/** Les étapes, dans l'ordre d'un voyage (filtres, comptes). */
export const TRIP_LEGS: readonly TripLeg[] = ['wait', 'go', 'dwell', 'back'];

/** Ce que la rangée sait d'un voyage (le sous-ensemble de `MapTrip` qui décide des étapes). */
export interface LegSource {
  key: string;
  back: boolean;
  pending?: boolean;
  sea?: unknown;
  toBase?: boolean;
  time: string;
  total?: string | null;
  totalIcon?: string;
  pct: number;
  legs?: { go: string | null; back: string; detail: string; phases?: TripPhase[] } | null;
}

/** Une tuile d'étape : ce qu'elle affiche à la place des champs du voyage. */
export interface LegTile {
  /** Clé d'affichage, unique dans la rangée. */
  key: string;
  /** Le voyage dont elle est une étape (focus, équipe). */
  tripKey: string;
  leg: TripLeg;
  /** Étape encore À VENIR : la tuile s'estompe. */
  future: boolean;
  /** Les encarts s'inversent sur le retour (`tripEnds`). */
  back: boolean;
  time: string;
  total: string | null;
  totalIcon?: string;
  /** Ligne d'étape en sous-titre, ou `null`. */
  line: string | null;
  pct: number;
  /** Fin de l'étape (ms) : l'heure où se range la tuile, quand on la connaît. */
  at?: number;
  /** La tuile vient des étapes du voyage : elle ne porte que son temps. */
  phased?: boolean;
  /** L'icône centrale de la tuile : celle de l'étape EN COURS du voyage (`STEP_ICON`). */
  icon?: string;
}

/** 🎴 L'icône d'une étape (demandé : « aller avec les épées, attente avec le sablier, retour
 *  avec la flèche retour arrière ») : la MÊME au centre des tuiles, dans leur bandeau du bas
 *  et sur les pastilles de filtre (« que ce soit cohérent »). */
export const STEP_ICON: Record<TripLeg, string> = { wait: '⏳', go: '⚔️', dwell: '🔍', back: '↩️' };

/**
 * 📏 LA FORME DE LA JAUGE DIT L'ÉTAPE (concept A, choisi le 2026-10-09) : des POINTILLÉS tant
 * que rien n'a commencé, une LIGNE quand on se déplace, un CERCLE quand on reste sur place
 * (fouille, extraction d'un filon). Le retour est une ligne qui part de la droite (`home`).
 * ⚠️ La couleur de la tuile reste à celui qui voyage (héros, convoi, attaque combinée) : l'étape
 * se lit sans elle.
 */
export type LegGaugeShape = 'dots' | 'line' | 'ring';
export const LEG_GAUGE: Record<TripLeg, { shape: LegGaugeShape; home: boolean }> = {
  wait: { shape: 'dots', home: false },
  go: { shape: 'line', home: false },
  dwell: { shape: 'ring', home: false },
  back: { shape: 'line', home: true },
};

export function tripLegTiles(t: LegSource): LegTile[] {
  const base = {
    tripKey: t.key,
    total: t.total ?? null,
    totalIcon: t.totalIcon,
    time: t.time,
    pct: t.pct,
    line: null,
    future: false,
  };
  const phases = t.legs?.phases;
  if (!t.sea && !t.toBase && phases?.length) {
    // 🎴 L'icône centrale est celle de l'étape EN COURS, sur toutes les tuiles du voyage
    // (demandé : « mets l'icône de l'étape en cours en avant ») : une attaque combinée qui
    // attend reste ⏳ partout. Chaque tuile dit SA propre étape dans son bandeau du bas.
    // ↩️ Sauf la tuile du RETOUR, toujours ↩️ (demandé : « la loupe ne doit y être que
    // pendant le temps de recherche ; sur le trajet du retour, la flèche de retour ») : la
    // loupe ne s'affiche ainsi que sur la tuile de fouille, pendant la fouille.
    const now = STEP_ICON[(phases.find((p) => p.current) ?? phases[0]!).leg];
    return phases.map((ph) => ({
      key: `${t.key}:${ph.leg}`,
      tripKey: t.key,
      leg: ph.leg,
      future: !ph.current,
      back: ph.leg === 'back',
      // ⏱️ Seul le temps de SON étape : ni temps total, ni sous-titre.
      // 🎴 Même icône que la pastille de filtre de l'étape (`STEP_ICON`), par cohérence.
      time: ph.leg === 'back' ? '' : `${STEP_ICON[ph.leg]} ${ph.time}`,
      total: ph.leg === 'back' ? ph.time : null,
      ...(ph.leg === 'back' ? { totalIcon: STEP_ICON.back } : {}),
      line: null,
      pct: ph.pct,
      at: ph.endsAt,
      phased: true,
      icon: ph.leg === 'back' ? STEP_ICON.back : now,
    }));
  }
  // 🏠 Sur le retour (ou un trajet qui rentre à la base) : une seule tuile, le retour.
  if (t.back || t.toBase) return [{ ...base, key: t.key, leg: 'back', back: true }];
  // Aller simple, départ programmé, mer ou trajet sans étapes connues : une seule tuile.
  return [{ ...base, key: t.key, leg: t.pending ? 'wait' : 'go', back: false }];
}

/** 🔎 Le filtre des étapes : quelles étapes on montre. Toutes par défaut. */
export type LegSelection = ReadonlySet<TripLeg>;
export const ALL_LEGS: LegSelection = new Set<TripLeg>(TRIP_LEGS);

/** Toutes les étapes présentes sont-elles affichées (= aucun filtre d'étape) ? */
const allLegsOn = (sel: LegSelection, present: readonly TripLeg[]): boolean =>
  present.every((l) => sel.has(l));

/** 🎯 Toucher une étape (v1.82.5, demandé) : toutes affichées → elle seule ; déjà allumée →
 *  on l'éteint, et sans étape choisie le filtre disparaît (toutes reviennent : c'est un
 *  filtre qui s'AJOUTE aux catégories, jamais une rangée vide). */
export function toggleLeg(
  sel: LegSelection,
  leg: TripLeg,
  present: readonly TripLeg[],
): LegSelection {
  if (present.length > 1 && present.includes(leg) && allLegsOn(sel, present)) return new Set([leg]);
  const next = new Set(sel);
  if (next.has(leg)) next.delete(leg);
  else next.add(leg);
  return present.some((l) => next.has(l)) ? next : new Set(present);
}

/** La pastille d'une étape est ALLUMÉE seulement quand elle filtre : toutes affichées,
 *  aucune ne l'est (sinon toucher une pastille allumée l'isolerait au lieu de l'éteindre). */
export const legPillOn = (sel: LegSelection, leg: TripLeg, present: readonly TripLeg[]): boolean =>
  !allLegsOn(sel, present) && sel.has(leg);

/**
 * ➡️↩️ LA PASTILLE DES ÉTAPES N'A QUE DEUX BOUTONS : l'ALLER (attente, trajet aller, fouille —
 * tout ce qui précède le retour) et le RETOUR (2026-10-09, demandé : « dans la pastille, ce sont
 * les deux icônes aller et retour »). Le ⏳ et le ⚔️ y faisaient doublon avec les catégories
 * de gauche (Programmés, Ennemis). Le filtre reste par étape : un bouton allume ou éteint
 * toutes les étapes de son groupe.
 */
export type LegGroup = 'out' | 'back';
export const LEG_GROUPS: Record<LegGroup, readonly TripLeg[]> = {
  out: ['wait', 'go', 'dwell'],
  back: ['back'],
};
export const LEG_GROUP_PILL: Record<LegGroup, { icon: string; label: string }> = {
  out: { icon: '➡️', label: 'Aller' },
  back: { icon: '↩️', label: 'Retour' },
};
const groupLegs = (g: LegGroup, present: readonly TripLeg[]) =>
  LEG_GROUPS[g].filter((l) => present.includes(l));
/** Les groupes qui ont au moins une étape présente, dans l'ordre aller → retour. */
export const presentLegGroups = (present: readonly TripLeg[]): LegGroup[] =>
  (['out', 'back'] as const).filter((g) => groupLegs(g, present).length > 0);
/** Allumé seulement quand il FILTRE (même règle que `legPillOn`). */
export const legGroupPillOn = (
  sel: LegSelection,
  g: LegGroup,
  present: readonly TripLeg[],
): boolean => !allLegsOn(sel, present) && groupLegs(g, present).some((l) => sel.has(l));
/** 🎯 Toucher un groupe : tout affiché → lui seul ; allumé → on l'éteint ; sans rien de choisi,
 *  tout revient (`toggleLeg`, appliqué au groupe). */
export function toggleLegGroup(
  sel: LegSelection,
  g: LegGroup,
  present: readonly TripLeg[],
): LegSelection {
  const legs = groupLegs(g, present);
  if (!legs.length) return sel;
  if (presentLegGroups(present).length > 1 && allLegsOn(sel, present)) return new Set(legs);
  const next = new Set(sel);
  if (legs.some((l) => next.has(l))) for (const l of legs) next.delete(l);
  else for (const l of legs) next.add(l);
  return present.some((l) => next.has(l)) ? next : new Set(present);
}

/** ⚠️ Une étape choisie qui n'a plus rien (le dernier aller est arrivé) retombe sur toutes,
 *  au lieu d'une rangée vide qui se lirait comme « aucun voyage » (même règle que les
 *  catégories, `shownTripCats`). Une rangée vidée par le joueur (rien de coché) reste vide. */
export function shownLegs(sel: LegSelection, present: readonly TripLeg[]): Set<TripLeg> {
  const on = present.filter((l) => sel.has(l));
  if (on.length === 0 && sel.size > 0) return new Set(present);
  return new Set(on);
}
