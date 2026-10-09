/**
 * 🏰 QUI ÉTAIT LÀ QUAND L'ARMÉE A FRAPPÉ.
 *
 * ⚠️ LE DÉFAUT (constaté le 2026-09-27 sur un compte réel) : un siège se tranche à SON heure
 * (`resolvedAt = raid.arrivesAt`), mais on ne le calcule qu'au tick suivant — souvent des
 * heures plus tard, à l'ouverture de l'app. Le store regardait alors qui était présent
 * MAINTENANT. Le joueur avait eu le temps de renvoyer héros et champions (rentrés AVANT
 * l'assaut) : le siège a été perdu « sans personne », alors que le pronostic, lui, les
 * comptait tous.
 *
 * La présence se lit donc À L'HEURE DE L'ATTAQUE, sur les voyages eux-mêmes :
 * - un voyage PARTI APRÈS l'attaque n'existait pas encore : ses membres étaient là ;
 * - un voyage en cours à l'attaque (`sentAt ≤ at < returnAt`) les tenait dehors ;
 * - l'infirmerie se lit aussi à l'heure de l'attaque.
 *
 * ⚠️ LIMITE CONNUE : un voyage terminé ET encaissé entre l'attaque et le tick ne laisse plus
 * de trace ici ; son membre est alors compté présent. C'est pourquoi l'écran tranche aussi
 * un siège échu AVANT tout nouveau départ.
 */
import { advAvailable, type Adventurer } from '@/lib/adventurers';
import type { ActiveExpedition } from '@/lib/expedition';
import { attackOutings, type CombinedAttack } from '@/lib/combinedAttack';

/** Un voyage, réduit à ce qui dit QUI était dehors et QUAND. */
export interface Outing {
  sentAt: number;
  returnAt: number;
  /** Les champions du voyage. */
  escort: readonly string[];
  /** Le héros en fait-il partie ? */
  hero: boolean;
}

/** Le voyage tenait-il dehors à l'instant `at` ? (parti avant, pas encore rentré) */
function outAt(o: Outing, at: number): boolean {
  return o.sentAt <= at && at < o.returnAt;
}

/** Le héros était-il à la maison à l'heure de l'attaque ? */
export function heroHomeAt(outings: readonly Outing[], at: number): boolean {
  return !outings.some((o) => o.hero && outAt(o, at));
}

/** Les champions disponibles à l'heure de l'attaque.
 *  ⚠️ `busyUntil` décrit le voyage ACTUEL : s'il est parti après l'attaque, il ne dit rien
 *  de l'heure de l'attaque — on l'ignore. L'infirmerie (`hurtUntil`) reste lue à `at`. */
export function advsHomeAt(
  advs: readonly Adventurer[],
  outings: readonly Outing[],
  at: number,
): Adventurer[] {
  const outThen = new Set<string>();
  const leftAfter = new Set<string>();
  for (const o of outings)
    for (const id of o.escort) {
      if (outAt(o, at)) outThen.add(id);
      else if (o.sentAt > at) leftAfter.add(id);
    }
  return advs.filter((a) => {
    if (outThen.has(a.id)) return false;
    const asThen = leftAfter.has(a.id) ? { ...a, busyUntil: undefined } : a;
    return advAvailable(asThen, at);
  });
}

/** Tous les voyages connus du personnage, sous une seule forme.
 *  ⚠️ Un groupe AVEC le héros EST son expédition (`expedition`) ; les `parties` partent sans lui. */
export function outingsOf(s: {
  expedition: ActiveExpedition | null | undefined;
  parties: readonly ActiveExpedition[];
  /** ⚔️🧭 Les attaques combinées en préparation : un groupe qui attend est À LA MAISON
   *  jusqu'à son départ (il défend), puis dehors. ⚠️ REQUIS : oublié, un groupe parti
   *  serait compté présent au siège. */
  attacks: readonly CombinedAttack[];
}): Outing[] {
  const out: Outing[] = attackOutings(s.attacks);
  if (s.expedition)
    out.push({
      sentAt: s.expedition.sentAt,
      returnAt: s.expedition.returnAt,
      escort: s.expedition.outcome.party?.escort ?? [],
      hero: true,
    });
  for (const p of s.parties)
    out.push({
      sentAt: p.sentAt,
      returnAt: p.returnAt,
      escort: p.outcome.party?.escort ?? [],
      hero: false,
    });
  return out;
}
