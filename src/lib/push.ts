// 🔔 NOTIFICATIONS PUSH — ce qu'on programme, et quand.
//
// ⚠️ RÈGLE D'ARCHITECTURE (posée en v0.661, non négociable) : **le CLIENT planifie, le
// SERVEUR poste**. On ne rejoue JAMAIS la simulation côté serveur — deux moteurs
// finiraient par diverger, et le message annoncerait un siège que le rapport dément.
// Ce module ne fait donc que traduire un état DÉJÀ calculé en messages datés ; il
// n'invente aucune issue, aucun butin, aucun combat.
//
// ⚠️ RÈGLE DE CONCEPTION : une notification doit donner ENVIE D'OUVRIR L'APP, jamais la
// remplacer. C'est ce qui la met d'accord avec l'espionnage (v0.724) : la Tour de guet
// achète de la CLARTÉ sur la composition d'une armée, et un message qui nommerait la
// faction ou l'effectif offrirait gratuitement ce qu'elle fait payer. Les messages sont
// donc volontairement AVARES — ils annoncent qu'il se passe quelque chose, pas quoi.

import { raidsEnabled, scoutLeadMs, type BaseState } from './raid';

type PushKind = 'siege' | 'siege_done' | 'hero_home' | 'convoy_home';

/** Un message programmé. `dedupe` est la clé d'idempotence : replanifier le même
 *  événement ne doit JAMAIS créer un doublon — l'app replanifie à chaque ouverture. */
export interface PushPlan {
  kind: PushKind;
  dedupe: string;
  sendAt: number;
  title: string;
  body: string;
  /** Où atterrir quand on tape la notification. */
  url: string;
}

export interface PushContext {
  base: BaseState | null;
  /** Expédition du héros en cours (on ne lit que l'heure de retour). */
  expedition: { returnAt: number } | null;
  caravans: { id: string; returnAt: number; claimed?: boolean }[];
  /** Niveau de la Tour de guet : il achète le PRÉAVIS, donc l'heure du message. */
  watchtowerLevel: number;
  /** Jours d'entraînement sur 7 — un siège n'arrive qu'à un joueur actif. */
  activeDays7: number;
  /** ⚠️ EXPLICITE, jamais deviné depuis l'enceinte. `defenseReadiness` compare les
   *  structures au niveau du JOUEUR : le déduire du plus haut niveau bâti ferait passer
   *  une enceinte de niveau 5 sur un compte niveau 28 pour « prête », et on programmerait
   *  des sièges qui n'auront jamais lieu. */
  playerLevel: number;
}

function heures(ms: number): string {
  const h = Math.round(ms / 3600_000);
  if (h >= 2) return `${h} h`;
  const m = Math.max(5, Math.round(ms / 60_000));
  return `${m} min`;
}

/**
 * Les messages à programmer pour cet état, à l'instant `now`.
 *
 * ⚠️ Rien n'est jamais programmé DANS LE PASSÉ : une ligne déjà due partirait à la
 * seconde où le serveur la voit, donc une notification pour un événement révolu — et,
 * l'app replanifiant à chaque ouverture, une par ouverture.
 */
export function planPushes(ctx: PushContext, now: number): PushPlan[] {
  const out: PushPlan[] = [];
  const add = (p: PushPlan) => {
    if (p.sendAt > now) out.push(p);
  };

  const b = ctx.base;
  // ⚠️ On ne programme un siège que si les sièges sont ACTIVÉS. Sans enceinte prête,
  // aucune armée ne vient (règle 3 des sièges, `raidsEnabled`) : annoncer un assaut qui
  // n'aura pas lieu serait un mensonge, et une inquiétude gratuite.
  if (b && raidsEnabled(b, ctx.activeDays7, ctx.playerLevel)) {
    const lead = scoutLeadMs(ctx.watchtowerLevel);
    const detecte = b.nextRaidAt - lead;
    // Le raid n'existe pas encore comme objet — il naît à la détection, quand l'app
    // tourne. On ne connaît donc QUE son heure, et c'est très bien : le message reste
    // avare, et l'espionnage garde ce qu'il vend.
    add({
      kind: 'siege',
      dedupe: `siege:${b.nextRaidAt}`,
      sendAt: detecte,
      title: '🗼 Armée repérée',
      body: `Une armée marche sur ta base. Tu as ${heures(lead)} pour te préparer.`,
      url: '/aventure?tab=base',
    });
    add({
      kind: 'siege_done',
      dedupe: `siegedone:${b.nextRaidAt}`,
      sendAt: b.nextRaidAt,
      title: '⚔️ L’assaut a eu lieu',
      body: 'Ta base a tenu, ou pas. Ouvre pour revoir la bataille.',
      url: '/aventure?tab=base',
    });
  }

  if (ctx.expedition) {
    add({
      kind: 'hero_home',
      dedupe: `hero:${ctx.expedition.returnAt}`,
      sendAt: ctx.expedition.returnAt,
      title: '🧭 Ton héros est rentré',
      body: 'Sa cargaison t’attend — elle ne se périme pas, mais il peut repartir.',
      url: '/expedition-map',
    });
  }

  for (const c of ctx.caravans) {
    if (c.claimed) continue;
    add({
      kind: 'convoy_home',
      dedupe: `convoy:${c.id}`,
      sendAt: c.returnAt,
      title: '🐫 Un convoi est rentré',
      body: 'Sa cargaison attend d’être récupérée.',
      url: '/expedition-map',
    });
  }

  return out;
}

/** Les clés des messages qu'on peut RETIRER quand ils n'ont plus lieu d'être.
 *  ⚠️ Nécessaire : si le joueur récupère un convoi avant son heure de notification, ou
 *  si l'échéance d'un siège est repoussée (elle l'est pendant l'inactivité), la ligne
 *  programmée doit disparaître, sinon on notifie un événement qui n'existe plus. */
export function livePushKeys(plans: PushPlan[]): Set<string> {
  return new Set(plans.map((p) => p.dedupe));
}

/** @public — contrat miroir de STALE_MS dans supabase/functions/push-dispatch. */
export const PUSH = {
  /** Au-delà, un message programmé n'a plus de sens : on le laisse expirer plutôt que
   *  de réveiller quelqu'un pour un événement d'il y a deux jours. */
  staleAfterMs: 6 * 3600_000,
  /** Garde-fou : le serveur n'enverra jamais plus que ça d'un coup pour un joueur. */
  maxPerBatch: 4,
} as const;
