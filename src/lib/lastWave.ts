/**
 * 🔁 « RELANCER LA DERNIÈRE VAGUE » (v1.278.0 ; demandé par l'utilisateur : le joueur refait, à
 * chaque passage, le même envoi groupé de la veille).
 *
 * Une VAGUE est ce que « 🚀 Tout lancer » du planificateur vient d'envoyer : pour chaque départ,
 * quels champions (et le héros), d'où, avec quels consommables, et sur QUEL TYPE de lieu. On
 * relance les MÊMES équipes sur des lieux du MÊME type, pris parmi ceux qui sont là maintenant.
 *
 * ⚠️ POURQUOI UN CHAMP ET PAS `map.departures` : l'historique des départs n'est qu'une liste
 * d'HORODATAGES (nids, harcèlement) — ni qui, ni où. Il ne peut pas servir de mémoire. La vague
 * vit donc dans le JSONB de la carte (`ExpeditionMap.lastWave`, additif, sans migration), propre
 * à l'île, écrite UNE fois par « Tout lancer ».
 *
 * ⚠️ AUCUNE RÈGLE D'ENVOI ICI : ce module ne fait que ranger ce qui a été envoyé et RÉPARTIR les
 * équipes sur les lieux disponibles. Ce qu'une équipe a le droit de faire (disponibilité,
 * taille, héros, pronostic, stock) est INJECTÉ (`ReplayDeps`) : la page le branche sur les
 * MÊMES fonctions que le planificateur et le store (`partySendBlocker`, `partyHeroBlocker`,
 * `partyWinChance`, `usefulSupplies`). Un envoi que le geste manuel refuserait n'est jamais
 * proposé — et ce qui ne repart pas est LISTÉ avec sa raison, jamais ignoré en silence.
 */
import type { Adventurer } from './adventurers';
import type { EscortKit, PartyHero } from './caravan';
import { poiEmo, poiLabel, type Poi } from './expedition';
import {
  PARTY_HERO_BLOCK_LABEL,
  PARTY_SEND_BLOCK_LABEL,
  partyHeroBlocker,
  partySendBlocker,
  supplyTarget,
  usefulSupplies,
} from './party';
import { FORECAST_SAMPLES, partyWinChance } from './partyForecast';
import type { BaseState } from './raid';
import { withRiftCut } from './rift';
import type { SupplyId } from './supplies';

/** Un groupe de la vague : d'où il part (`null` = la base) et qui en fait partie. */
interface WaveWing {
  originId: string | null;
  advIds: string[];
  hero: boolean;
}

/** Un départ de la vague. Plusieurs groupes = une attaque COMBINÉE. */
export interface WaveTrip {
  /** Le TYPE de lieu visé (`waveKey`) : un autre lieu du même type fait l'affaire. */
  key: string;
  wings: WaveWing[];
  supplies: SupplyId[];
}

export interface LastWave {
  /** Quand la vague a été lancée (ms epoch). */
  at: number;
  trips: WaveTrip[];
}

/** Au plus autant de départs gardés (la carte porte ce JSON à chaque écriture). */
export const WAVE_MAX_TRIPS = 24;

/** Le type d'un lieu, tel que la vague le retient : un point de contrôle se distingue par son genre
 *  (mine fortifiée ≠ jardin), les autres par leur type. */
export const waveKey = (p: Pick<Poi, 'type' | 'control'>): string =>
  p.type === 'control' ? `control:${p.control?.kind ?? ''}` : p.type;

/** « ⛏️ Mine » : le nom d'un type de lieu, lu dans sa clé (pour dire POURQUOI un départ ne
 *  repart pas quand il n'y a plus de lieu sous la main). */
export function waveKeyLabel(key: string): string {
  const stub = (
    key.startsWith('control:')
      ? { type: 'control', control: { kind: key.slice(8) } }
      : { type: key }
  ) as Pick<Poi, 'type' | 'control'>;
  return `${poiEmo(stub)} ${poiLabel(stub)}`;
}

/** Ce que la vague lit d'une proposition lancée (la forme de `PlannerRow`, sans la dépendre). */
export interface WaveRowInput {
  poi: Pick<Poi, 'type' | 'control'>;
  advs: readonly { id: string }[];
  hero: boolean;
  from: { id: string } | null;
  wings:
    | readonly { from: { id: string } | null; advs: readonly { id: string }[]; hero: boolean }[]
    | null;
  supplies: readonly SupplyId[];
}

/** La vague d'un lot de propositions PARTIES. `null` quand il n'y en a aucune (on ne remplace pas
 *  une vague par du vide). */
export function waveFromRows(rows: readonly WaveRowInput[], at: number): LastWave | null {
  const trips = rows.slice(0, WAVE_MAX_TRIPS).map(
    (r): WaveTrip => ({
      key: waveKey(r.poi),
      wings: (r.wings ?? [{ from: r.from, advs: r.advs, hero: r.hero }]).map((w) => ({
        originId: w.from?.id ?? null,
        advIds: w.advs.map((a) => a.id),
        hero: w.hero,
      })),
      supplies: [...r.supplies],
    }),
  );
  return trips.length ? { at, trips } : null;
}

/** La vague en pastilles : combien de départs par type de lieu, dans l'ordre où ils sont partis. */
export function waveCounts(wave: LastWave): { key: string; label: string; n: number }[] {
  const out = new Map<string, { key: string; label: string; n: number }>();
  for (const t of wave.trips) {
    const c = out.get(t.key) ?? { key: t.key, label: waveKeyLabel(t.key), n: 0 };
    c.n++;
    out.set(t.key, c);
  }
  return [...out.values()];
}

/** Tous les champions d'un départ, groupes confondus. */
export const tripAdvIds = (t: WaveTrip): string[] => t.wings.flatMap((w) => w.advIds);
/** Le héros fait-il partie du départ ? */
const tripHasHero = (t: WaveTrip): boolean => t.wings.some((w) => w.hero);

export interface ReplayDeps<P> {
  /** Les lieux disponibles MAINTENANT, dans l'ordre où on les essaie. */
  targets: readonly P[];
  keyOf(p: P): string;
  idOf(p: P): string;
  /** L'équipe est-elle encore libre là où elle était ? Raison du refus, `null` = prête. */
  teamBlocker(trip: WaveTrip): string | null;
  /** Le départ, avec CE consommable-là, est-il permis vers ce lieu ? Raison, `null` = permis. */
  sendBlocker(trip: WaveTrip, target: P): string | null;
  /** Parmi les consommables encore en stock, ceux qui SERVENT sur ce lieu (défaut : aucun). */
  kitFor?(trip: WaveTrip, target: P, available: readonly SupplyId[]): SupplyId[];
}

export interface ReplaySend<P> {
  /** Le départ à lancer : ses consommables sont ceux EFFECTIVEMENT emportés. */
  trip: WaveTrip;
  target: P;
}
export interface ReplaySkip {
  trip: WaveTrip;
  reason: string;
}

/**
 * Répartit la vague sur les lieux disponibles. Un lieu ne sert qu'une fois. Un départ qui ne
 * peut pas repartir est RENDU avec sa raison :
 * - l'équipe n'est plus libre (`teamBlocker`) ;
 * - aucun lieu de ce type n'est disponible ;
 * - tous les lieux de ce type refusent (raison du PREMIER, avec le compte).
 * Le stock de consommables se partage dans l'ordre de la vague : jamais plus de départs avec un
 * objet que d'exemplaires.
 */
export function planReplay<P>(
  wave: LastWave,
  deps: ReplayDeps<P>,
  stock: Readonly<Record<string, number>> = {},
): { sends: ReplaySend<P>[]; skipped: ReplaySkip[] } {
  const sends: ReplaySend<P>[] = [];
  const skipped: ReplaySkip[] = [];
  const usedTargets = new Set<string>();
  const usedAdvs = new Set<string>();
  const left: Record<string, number> = { ...stock };
  for (const trip of wave.trips) {
    // Un champion déjà repris par un départ plus haut de la vague ne part pas deux fois.
    if (tripAdvIds(trip).some((id) => usedAdvs.has(id))) {
      skipped.push({ trip, reason: 'un champion repart déjà dans un autre départ de la vague' });
      continue;
    }
    const team = deps.teamBlocker(trip);
    if (team) {
      skipped.push({ trip, reason: team });
      continue;
    }
    const same = deps.targets.filter(
      (p) => deps.keyOf(p) === trip.key && !usedTargets.has(deps.idOf(p)),
    );
    if (!same.length) {
      skipped.push({ trip, reason: 'aucun lieu de ce type n’est disponible' });
      continue;
    }
    const avail = trip.supplies.filter((s) => (left[s] ?? 0) > 0);
    let firstReason: string | null = null;
    let done = false;
    for (const target of same) {
      const kit = deps.kitFor ? deps.kitFor(trip, target, avail) : [];
      const eff: WaveTrip = { ...trip, supplies: kit };
      const why = deps.sendBlocker(eff, target);
      if (why) {
        firstReason ??= why;
        continue;
      }
      for (const s of kit) left[s] = (left[s] ?? 0) - 1;
      usedTargets.add(deps.idOf(target));
      for (const id of tripAdvIds(trip)) usedAdvs.add(id);
      sends.push({ trip: eff, target });
      done = true;
      break;
    }
    if (!done)
      skipped.push({
        trip,
        reason: `${firstReason}${same.length > 1 ? ` (${same.length} lieux essayés)` : ''}`,
      });
  }
  return { sends, skipped };
}

/** Ce que la carte sait MAINTENANT, et que les règles d'envoi lisent. */
export interface ReplayWorld {
  /** Les lieux qu'on peut proposer (ceux du planificateur : visibles, libres, attaquables). */
  targets: readonly Poi[];
  /** Les champions libres → l'endroit d'où ils partent (`null` = la base, sinon l'id du point
   *  tenu où ils sont en garnison). Un champion absent d'ici n'est pas libre. */
  free: ReadonlyMap<string, string | null>;
  /** Les champions connus, par id. */
  advs: ReadonlyMap<string, Adventurer>;
  heroFree: boolean;
  /** Où est le héros : `null` = la base, sinon l'id du point où il est posté. */
  heroAt: string | null;
  hero: PartyHero;
  road: EscortKit;
  base: BaseState | null;
  /** Le plafond d'engagement du Panthéon. */
  cap: number;
  now: number;
  /** La chance de réussite minimale voulue (0..1) : celle du planificateur. */
  need: number;
}

/**
 * Les règles d'envoi d'une relance, BRANCHÉES sur celles du planificateur (`fits`, `win`, `kit`)
 * et de l'écran d'envoi (`partySendBlocker`, `partyHeroBlocker`, `usefulSupplies`) : la vague n'a
 * aucune idée à elle de ce qu'une équipe peut faire. Le store revérifie tout à l'envoi.
 */
export function replayDeps(w: ReplayWorld): ReplayDeps<Poi> {
  const advsOf = (t: WaveTrip) => tripAdvIds(t).flatMap((id) => w.advs.get(id) ?? []);
  const roadOf = (kit: readonly SupplyId[]): EscortKit => ({ ...w.road, supplies: [...kit] });
  return {
    targets: w.targets,
    keyOf: waveKey,
    idOf: (p) => p.id,
    teamBlocker: (t) => {
      for (const wing of t.wings) {
        for (const id of wing.advIds) {
          const a = w.advs.get(id);
          if (!a) return 'un champion n’est plus là';
          if (!w.free.has(id)) return `${a.name} n’est pas libre`;
          if ((w.free.get(id) ?? null) !== wing.originId)
            return `${a.name} n’est plus au même endroit`;
        }
        if (wing.hero) {
          if (!w.heroFree) return 'ton héros n’est pas libre';
          if (w.heroAt !== wing.originId) return 'ton héros n’est plus au même endroit';
        }
      }
      return null;
    },
    // Comme le planificateur : un consommable n'est emporté que si l'effectif seul ne passe pas
    // le seuil, et seulement s'il SERT sur ce lieu.
    kitFor: (t, p, avail) => {
      const adv = advsOf(t);
      const h = tripHasHero(t);
      const target = withRiftCut(p, w.base);
      const bare = partyWinChance(
        target,
        adv,
        roadOf([]),
        h ? w.hero : null,
        w.now,
        FORECAST_SAMPLES,
      );
      if (bare === null || bare >= w.need) return [];
      return usefulSupplies(avail, supplyTarget(target, h, adv.length));
    },
    sendBlocker: (t, p) => {
      const adv = advsOf(t);
      const h = tripHasHero(t);
      const target = withRiftCut(p, w.base);
      if (h) {
        const hb = partyHeroBlocker({ onExpedition: false, healMs: 0, outpost: true, poi: p });
        if (hb) return `héros : ${PARTY_HERO_BLOCK_LABEL[hb]}`;
      }
      const sb = partySendBlocker(target, adv.length, h, w.cap, 1, w.now);
      if (sb) return PARTY_SEND_BLOCK_LABEL[sb];
      const win = partyWinChance(
        target,
        adv,
        roadOf(t.supplies),
        h ? w.hero : null,
        w.now,
        FORECAST_SAMPLES,
      );
      if (win !== null && win < w.need)
        return `chance de ${Math.round(win * 100)} %, sous ton seuil de ${Math.round(w.need * 100)} %`;
      return null;
    },
  };
}
