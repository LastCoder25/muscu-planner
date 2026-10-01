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

import { baseLeadMs, raidIntervalMs, raidsEnabled, type BaseState } from './raid';
import { reportIdOf, voyageReports, type ActiveExpedition } from './expedition';

type PushKind =
  | 'siege'
  | 'siege_done'
  | 'hero_home'
  | 'party_home'
  | 'plunder'
  | 'control_warn'
  | 'control_attack';

/** 🏰 Le rappel avant l'attaque d'un point tenu (2026-09-29, demandé par l'utilisateur) :
 *  10 min — de quoi ouvrir l'app et envoyer un renfort proche, pas de quoi planifier. */
export const CONTROL_WARN_MS = 10 * 60_000;

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

/** 🔔 Un voyage vu par les notifications : quand il rentre, quel rapport il dépose, et
 *  s'il en dépose un. ⚠️ `reports` est REQUIS : un groupe-compagnon d'une attaque combinée,
 *  un retour de blessés vers la base ou un demi-tour ne déposent AUCUN rapport — les
 *  annoncer « rentrés, ton rapport t'attend » menait vers une boîte où rien n'attendait. */
export interface PushVoyage {
  returnAt: number;
  reportId: string;
  reports: boolean;
}

/** Ce qu'un voyage en cours donne aux notifications (la règle vit ici, pas à l'appel). */
export function pushVoyage(
  v: Pick<ActiveExpedition, 'poi' | 'sentAt' | 'returnAt' | 'wingOf' | 'recalled'>,
): PushVoyage {
  return { returnAt: v.returnAt, reportId: reportIdOf(v), reports: voyageReports(v) };
}

/** Où mène « rentré » : la carte, qui ouvre CE rapport dès qu'il est déposé (et non « le
 *  plus récent », qui pouvait être celui d'un autre voyage). */
function reportUrl(id: string): string {
  return `/expedition-map?report=${encodeURIComponent(id)}`;
}

export interface PushContext {
  base: BaseState | null;
  /** Expédition du héros en cours. */
  expedition: PushVoyage | null;
  /** ⚔️ Groupes partis SANS le héros vers un camp (un groupe avec héros notifie par
   *  `expedition`). ⚠️ REQUIS : un groupe oublié rentrerait sans prévenir. */
  parties: (PushVoyage & { id: string })[];
  /** Niveau de la Tour de guet : il achète le PRÉAVIS, donc l'heure du message. */
  watchtowerLevel: number;
  /** 🗼 Bonus de détection des Tours de guet tenues sur la carte (`controlDetectBoost`). */
  towerBoost: number;
  /** Jours d'entraînement sur 7 — un siège n'arrive qu'à un joueur actif. */
  activeDays7: number;
  /** ⚠️ EXPLICITE, jamais deviné depuis l'enceinte. `defenseReadiness` compare les
   *  structures au niveau du JOUEUR : le déduire du plus haut niveau bâti ferait passer
   *  une enceinte de niveau 5 sur un compte niveau 28 pour « prête », et on programmerait
   *  des sièges qui n'auront jamais lieu. */
  playerLevel: number;
  /** 🏴‍☠️ La prochaine caravane pillée (`nextPlunderSpawn`), ou null. ⚠️ REQUIS. */
  plunder: { id: string; at: number } | null;
  /** 🏰 Les points de contrôle TENUS et l'heure de leur prochaine attaque ennemie
   *  (`heldControls`). ⚠️ REQUIS : les oublier, c'est apprendre la perte d'une mine en
   *  rouvrant l'app. */
  controls: { id: string; attackAt: number; label: string }[];
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
    // ⚠️ Le préavis est une PART de l’intervalle : sans lui, on programmerait la
    // détection à une heure qui ne correspond à aucun rythme.
    const lead = baseLeadMs(ctx.watchtowerLevel, raidIntervalMs(ctx.activeDays7), ctx.towerBoost);
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

  if (ctx.expedition?.reports) {
    add({
      kind: 'hero_home',
      dedupe: `hero:${ctx.expedition.returnAt}`,
      sendAt: ctx.expedition.returnAt,
      title: '🧭 Ton héros est rentré',
      body: 'Sa cargaison t’attend — elle ne se périme pas, mais il peut repartir.',
      url: reportUrl(ctx.expedition.reportId),
    });
  }

  for (const g of ctx.parties) {
    if (!g.reports) continue;
    add({
      kind: 'party_home',
      // ⚠️ Clé liée à l'ID du groupe, jamais à l'heure : replanifier ne duplique pas.
      dedupe: `party:${g.id}`,
      sendAt: g.returnAt,
      // ⚠️ AVARE comme le convoi : ni faction, ni effectif, ni issue — le rapport de la
      // boîte le dit, la notification donne seulement envie de l'ouvrir.
      title: '⚔️ Ton groupe est rentré',
      body: 'Son rapport t’attend dans la boîte 📬.',
      url: reportUrl(g.reportId),
    });
  }

  // 🏰 LES POINTS DE CONTRÔLE : un rappel `CONTROL_WARN_MS` avant l'attaque (demandé le
  // 2026-09-29 ; il assouplit le « jamais avant » de la v0.1239 comme l'avertissement
  // « bataille imminente » de la fiche), puis l'attaque au moment où elle a lieu. ⚠️ Le
  // message ne dit PAS l'issue : elle se joue à l'ouverture de l'app (le serveur ne rejoue
  // pas les combats) — il invite à venir voir. La clé porte l'heure de l'attaque : une
  // nouvelle attaque est un nouveau message, un siège repoussé efface l'ancien.
  for (const c of ctx.controls) {
    // Même clé d'heure que l'attaque : une attaque repoussée efface aussi son rappel.
    add({
      kind: 'control_warn',
      dedupe: `control_warn:${c.id}:${c.attackAt}`,
      sendAt: c.attackAt - CONTROL_WARN_MS,
      title: `⚠️ Attaque imminente : ${c.label}`,
      body: 'Des ennemis arrivent dans 10 min — envoie un renfort si tu peux.',
      url: '/expedition-map',
    });
    add({
      kind: 'control_attack',
      dedupe: `control_attack:${c.id}:${c.attackAt}`,
      sendAt: c.attackAt,
      title: `🏰 Attaque en cours : ${c.label}`,
      body: 'Ta garnison se bat pour la tenir — viens voir le rapport.',
      url: '/expedition-map',
    });
  }

  if (ctx.plunder) {
    add({
      kind: 'plunder',
      // Liée à l'id du lieu : replanifier ne la double pas, et elle s'efface si la carte
      // change d'avis (un lieu pris laisse la place à un autre tirage).
      dedupe: `plunder:${ctx.plunder.id}`,
      sendAt: ctx.plunder.at,
      title: '🏴‍☠️ Une caravane pillée',
      body: 'Des pillards l’ont prise — son or est à qui ira le chercher, pendant quelques heures.',
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
