// caravan.ts — les caravanes : de la logistique LENTE, sans héros et sans énergie.
// Pur/testable, aucune dépendance Vue/Supabase.
//
// ⚠️ POURQUOI CETTE BOUCLE EXISTE. Tout le jeu se paie en ÉNERGIE, donc en sport : un
// joueur qui s'entraîne peu en manque par définition. Mais il a du TEMPS. Une caravane
// consomme donc du temps réel et ZÉRO énergie — c'est le seul axe où il est à égalité.
// Corollaire non négociable : **une caravane ne rapporte JAMAIS d'équipement**. Elle paie
// en LOGISTIQUE (⚡ énergie plafonnée, 🔮 pierres, 🔩 ferraille, 🗝️ clés, un filet d'or),
// c'est-à-dire des devises qui débloquent les AUTRES systèmes au lieu de les remplacer.
// « Le sport est le plafond » reste intact : ce n'est pas le butin qui monte, c'est
// l'accès au jeu qui s'élargit.
//
// ⚠️ ELLE NE VA QUE SUR LES POI DE RÉCOLTE. Division du travail : le héros explore et se
// bat, les caravanes exploitent. Ça résout du même coup la vraie limite de la carte — le
// héros ne peut être qu'à un endroit, et la moitié des POI expirent sans qu'on y touche.
// Comme le héros, la caravane CONSOMME le lieu à son départ.
import {
  mergeEffects,
  effectAsAggregate,
  playerWithGear,
  emptyEffects,
  type AggregatedEffects,
} from './items';
import { simulateCombat, type Combatant } from './combat';
import {
  HARVEST_TYPES,
  harvestYield,
  goldCost,
  travelFactor,
  travelOneWayMin,
  type Poi,
} from './expedition';
import { advRoles, advSignatures, advStats, PROMO_LEVELS, type Adventurer } from './adventurers';

export const CARAVAN = {
  /** Une caravane va PLUS LENTEMENT qu'un héros — c'est ce qui incarne « du temps au lieu
   *  de l'énergie », et ce qui la distingue de l'expédition (rapide, chère en énergie). */
  slow: 1.5,
  /** Escorte maximale par convoi. */
  escortMax: 4,
  /** Taille de l'escorte de RÉFÉRENCE qui sert de mètre-étalon à la route. */
  refEscort: 3,
  /** PV d'un groupe de bandits ≈ N tours d'offense de l'escorte de référence.
   *  Mesuré à 5 : 3 aventuriers (la référence) tiennent 67-95 % selon le niveau, 4 tiennent
   *  93-100 %, 2 seulement 3-41 %. C'est ce gradient qui fait de « combien j'en envoie »
   *  une décision — à 2,2 tours, 3 aventuriers gagnaient 100 % PARTOUT et le choix était mort. */
  foePvTurns: 5,
  /** Ils mordent ~N % des PV EFFECTIFS de la référence (PV ÷ (1 − réduction)) par coup.
   *  ⚠️ EFFECTIFS, et non bruts : la réduction de dégâts croît avec le niveau, donc une
   *  morsure calée sur les PV bruts rendait le début de partie BEAUCOUP plus dur que la
   *  fin (mesuré : 12 % de tenue au niveau 5 contre 98 % au niveau 70, à escorte égale). */
  foeDmgPctPv: 0.32,
  /** Route dangereuse (`Poi.perilous`, tirée au spawn donc annonçable AVANT le départ). */
  perilousMult: 1.35,
  /** Ce qu'apporte une SIGNATURE de classe (strates ≥ 3), en %. */
  signaturePct: 12,
  /** Un rôle 🧭 raccourcit le trajet, un rôle 🐫 grossit la cargaison — par aventurier. */
  speedPerRole: 0.08,
  speedMax: 0.3,
  haulPerRole: 0.12,
  haulMax: 0.4,
  /** Un 🩺 raccourcit les convalescences de l'équipe. */
  carePerRole: 0.25,
  /** Repos d'un aventurier blessé. */
  hurtMs: 6 * 3600_000,
  /** Paie par aventurier : socle × strate × niveau du POI^0,7. C'est un PUITS D'OR, mais
   *  calibré pour valoir ~60 % de l'or rapporté — à 26, les salaires valaient 2,6× l'or
   *  brut et le convoi était absurdement déficitaire. La caravane paie en RESSOURCES ;
   *  l'or n'est qu'un filet, et les salaires ne doivent pas l'engloutir. */
  wageBase: 6,
  /** ⚠️ PART DU RENDEMENT D'UNE VISITE DU HÉROS. Des marchands exploitent moins bien
   *  qu'un aventurier — mais ce n'est pas du réalisme, c'est un garde-fou mesuré : à part
   *  pleine, UNE caravane rendait 608 🔩/jour au niveau 26 contre 19 pour la Fonderie
   *  (×32), soit plusieurs crans d'enceinte par jour. La règle « la ferraille doit être
   *  plus dure à obtenir que l'or » (v0.682) serait morte. Avec 0,5 et un nombre de
   *  convois plafonné, les caravanes COMPLÈTENT l'épave du héros au lieu de la remplacer.
   *  ⚠️ Ne pas monter sans re-mesurer `scrapEconomy`. */
  yieldShare: 0.5,
  /** Plafond dur de convois simultanés. */
  slotsMax: 4,
  /** Ce qu'une embuscade RÉELLEMENT traversée ajoute à l'XP, par combat (gagné OU perdu).
   *  ⚠️ Remplace un +30 % forfaitaire versé dès que la route était étiquetée « périlleuse » :
   *  mesuré, l'XP était identique (49) qu'il y ait eu 1, 2 ou 3 embuscades — on payait
   *  l'étiquette, pas l'épreuve. Une route périlleuse tirant deux fois plus de rencontres,
   *  elle reste naturellement plus formatrice, mais parce qu'il s'y passe quelque chose. */
  xpPerFight: 0.2,
  xpFightMax: 0.6,
  /** Part de la valeur d'un convoi qu'une embuscade perdue emporte. */
  lossKeep: 0.55,
} as const;

export type CaravanEventKind = 'bandits' | 'cache' | 'detour' | 'calme';

export interface CaravanEvent {
  kind: CaravanEventKind;
  /** `bandits` uniquement : l'escorte a-t-elle tenu ? */
  won?: boolean;
  text: string;
}

export interface CaravanOutcome {
  gold: number;
  energy: number;
  summonStones: number;
  scrap: number;
  keys: number;
  /** Salaires versés à l'escorte — déduits à part, c'est une DÉPENSE assumée. */
  wages: number;
  /** XP gagnée, PAR AVENTURIER (id → XP).
   *  ⚠️ C'était une MOYENNE : mesuré, un vétéran de niveau 30 passait de 1 à 11 XP sur une
   *  route triviale rien qu'en emmenant trois recrues — le rendement décroissant, qui
   *  existe précisément pour empêcher de farmer le trajet le plus court, se contournait
   *  en ajoutant des passagers. */
  xp: Record<string, number>;
  /** Ids des aventuriers blessés (→ infirmerie). */
  hurt: string[];
  events: CaravanEvent[];
  text: string;
}

export interface Caravan {
  id: string;
  /** Copie du POI, comme `ActiveExpedition` : il est retiré de la carte au DÉPART. */
  poi: Poi;
  escort: string[];
  sentAt: number;
  /** Arrivée à l'objectif — le rapport est lisible dès cet instant. */
  midAt: number;
  /** Retour en ville : c'est là seulement que la cargaison se récupère. */
  returnAt: number;
  outcome: CaravanOutcome;
  /** ⚠️ `undefined` = butin DÉJÀ crédité (convois écrits avant l'encaissement manuel),
   *  jamais « à récupérer » — même règle que les rapports d'expédition. */
  claimed?: boolean;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** PV EFFECTIFS : ce qu’il faut vraiment infliger pour tomber, réduction comprise. */
function effectivePv(c: Combatant): number {
  return c.pv / Math.max(0.35, 1 - (c.dmgReduction ?? 0));
}
/** Offense par tour d'un combattant — l'unité dans laquelle on exprime les PV adverses. */
function offensePerRound(c: Combatant): number {
  return Math.max(1, c.damage * (c.strikes ?? 1) * (1 + c.crit));
}
const countRole = (advs: Adventurer[], role: string): number =>
  advs.reduce((n, a) => n + advRoles(a).filter((r) => r === role).length, 0);

/** Effets apportés par les SIGNATURES de classe de l'escorte (strates hautes). */
export function escortEffects(advs: Adventurer[]): AggregatedEffects {
  const list = advs.flatMap((a) =>
    advSignatures(a).map((t) => effectAsAggregate(t, CARAVAN.signaturePct)),
  );
  return list.length ? mergeEffects(...list) : emptyEffects();
}

/** L'escorte comme UN combattant : les stats des membres s'ADDITIONNENT.
 *  ⚠️ Aucun bonus de « diversité » à inventer — `simulateCombat` calcule offense × survie,
 *  donc quatre Guerriers tapent fort et meurent quand un Guerrier + un Homme d'armes +
 *  un Archer tiennent. L'incitation à l'équipe équilibrée est déjà dans le moteur. */
export function escortCombatant(advs: Adventurer[], name = 'Escorte'): Combatant {
  const stats = advs.reduce(
    (a, x) => {
      const s = advStats(x);
      return {
        puissance: a.puissance + s.puissance,
        endurance: a.endurance + s.endurance,
        agilite: a.agilite + s.agilite,
      };
    },
    { puissance: 0, endurance: 0, agilite: 0 },
  );
  const level = advs.reduce((m, a) => Math.max(m, a.level), 1);
  return playerWithGear(name, stats, {}, escortEffects(advs), level);
}

/** Combien de strates un aventurier de ce niveau a pu franchir. */
function strataFor(level: number): number {
  return Math.max(1, PROMO_LEVELS.filter((l) => l <= level).length);
}
/** Aventurier de RÉFÉRENCE : une lignée guerrière promue autant que son niveau l'autorise.
 *  Il ne sert qu'à donner l'échelle de la route — jamais au jeu. */
export function refAdventurer(level: number): Adventurer {
  const lineage = ['guerrier', 'epeiste', 'duelliste', 'maitre_epeiste'];
  return {
    id: 'ref',
    name: 'Référence',
    seed: 1,
    path: lineage.slice(0, Math.min(lineage.length, strataFor(level))),
    level: Math.max(1, level),
    xp: 0,
  };
}

/** LES BANDITS DE LA ROUTE.
 *
 *  ⚠️ DANGER **ABSOLU**, fixé par le niveau du POI et le drapeau `perilous` — et surtout
 *  PAS par l'escorte qu'on envoie. On ne réutilise donc pas `ambushCombatant`, qui est
 *  calibré RELATIVEMENT au combattant qu'on lui passe (c'est voulu pour le héros : « une
 *  rencontre de route est un ralentisseur, pas un mur »). Appliqué à une caravane, ce
 *  modèle ferait s'ADAPTER les bandits à l'escorte : une escorte faible affronterait des
 *  bandits faibles, et « combien d'aventuriers j'envoie » ne voudrait plus rien dire —
 *  la feature perdrait sa seule décision. Même virage que le Labyrinthe en v0.563.23.
 *
 *  L'échelle est exprimée en unités d'ESCORTE DE RÉFÉRENCE (`CARAVAN.refEscort`
 *  aventuriers au niveau du POI) : absolue, mais lisible et calibrable. */
export function roadFoe(poi: Poi): Combatant {
  const ref = escortCombatant(
    Array.from({ length: CARAVAN.refEscort }, () => refAdventurer(poi.level)),
    'Référence',
  );
  const m = poi.perilous ? CARAVAN.perilousMult : 1;
  return {
    name: poi.perilous ? 'Pillards de la passe' : 'Bandits de grand chemin',
    pv: Math.max(1, Math.round(offensePerRound(ref) * CARAVAN.foePvTurns * m)),
    damage: Math.max(1, Math.round(effectivePv(ref) * CARAVAN.foeDmgPctPv * m)),
    crit: 0.08,
    dodge: 0.05,
    initiative: 12,
  };
}

/** Trajet ALLER d'une caravane, en minutes : celui d'un héros, ralenti, puis raccourci
 *  par les rôles 🧭 de l'escorte. */
export function caravanLegMin(poi: Poi, escort: Adventurer[]): number {
  const hero = travelOneWayMin(poi.level, poi.distNorm);
  const speed = Math.min(CARAVAN.speedMax, countRole(escort, 'speed') * CARAVAN.speedPerRole);
  return Math.max(1, Math.round(hero * CARAVAN.slow * (1 - speed)));
}

/** ⚠️ LA CARGAISON SE PAIE SUR LA DURÉE QU'UN HÉROS AURAIT MISE, pas sur celle de la
 *  caravane. `travelFactor` est SUPER-LINÉAIRE (exposant 1,4) : payer une caravane sur son
 *  temps réel ferait de sa lenteur une PRIME (ralentir de ×1,5 paierait ×1,75 de plus) et
 *  elle écraserait l'expédition du héros. Le marché doit rester lisible : la caravane
 *  coûte plus de TEMPS (abondant) et zéro ÉNERGIE (rare) ; elle ne rapporte pas plus. */
export function heroEquivalentFactor(poi: Poi): number {
  return travelFactor((2 * travelOneWayMin(poi.level, poi.distNorm)) / 60);
}

/** Salaires d'une mission — un PUITS D'OR, et la contrepartie de la prestation. */
export function caravanWages(escort: Adventurer[], poi: Poi): number {
  return escort.reduce(
    (sum, a) =>
      sum + Math.round(CARAVAN.wageBase * strataFor(a.level) * Math.max(1, poi.level) ** 0.7),
    0,
  );
}

/** XP gagnée par chaque membre. ⚠️ RENDEMENT DÉCROISSANT quand la route est très en
 *  dessous du niveau de l'aventurier : sans ça on farme le trajet le plus court à
 *  l'infini et le choix de destination meurt. */
export function missionXp(adv: Adventurer, poi: Poi, fights = 0): number {
  const ratio = Math.max(0.15, Math.min(2, poi.level / Math.max(1, adv.level)));
  const base = 6 + poi.level * 1.6;
  const learned = 1 + Math.min(CARAVAN.xpFightMax, Math.max(0, fights) * CARAVAN.xpPerFight);
  return Math.max(1, Math.round(base * Math.min(1, ratio) ** 1.5 * learned));
}

/** Convois simultanés qu'autorise le Comptoir. ⚠️ SECOND garde-fou de l'inflation :
 *  le rendement par convoi est bridé (`yieldShare`), mais c'est le NOMBRE qui multiplie.
 *  Un débutant en a un seul ; le plafond reste bas, et le niveau du Comptoir est lui-même
 *  plafonné par celui du joueur — donc par le sport. */
export function caravanSlots(comptoirLevel: number): number {
  return Math.max(1, Math.min(CARAVAN.slotsMax, 1 + Math.floor(Math.max(0, comptoirLevel) / 6)));
}

/** Une caravane peut-elle partir vers ce POI ? Récolte uniquement, escorte non vide. */
export function canSendCaravan(poi: Poi, escort: Adventurer[]): boolean {
  return HARVEST_TYPES.has(poi.type) && escort.length > 0 && escort.length <= CARAVAN.escortMax;
}

/** Résout le voyage : les rencontres, la cargaison, la paie, les blessés.
 *  Seedé au DÉPART comme tout le reste — déterministe et hors-ligne. */
export function resolveCaravan(poi: Poi, escort: Adventurer[], seed: number): CaravanOutcome {
  const rng = mulberry32(seed >>> 0 || 1);
  const events: CaravanEvent[] = [];
  const hurt: string[] = [];
  let mult = 1;
  let keysBonus = 0;

  const foe = roadFoe(poi);
  const guards = escortCombatant(escort);
  // Une rencontre par jambe de trajet — deux fois plus sur une route dangereuse.
  const legs = poi.perilous ? 4 : 2;
  for (let i = 0; i < legs; i++) {
    const roll = rng();
    if (roll < (poi.perilous ? 0.42 : 0.24)) {
      const r = simulateCombat(guards, { ...foe }, { seed: (seed + i * 7919) >>> 0, goldOnWin: 0 });
      events.push({
        kind: 'bandits',
        won: r.win,
        text: r.win ? 'Une embuscade repoussée.' : 'Des bandits emportent une part du convoi.',
      });
      if (r.win) mult *= 1.12;
      else {
        mult *= CARAVAN.lossKeep;
        const victim = escort[Math.floor(rng() * escort.length)];
        if (victim && !hurt.includes(victim.id)) hurt.push(victim.id);
      }
    } else if (roll < 0.34) {
      events.push({ kind: 'cache', text: 'Une cache oubliée le long de la route.' });
      mult *= 1.1;
      keysBonus += rng() < 0.25 ? 1 : 0;
    } else if (roll < 0.42) {
      events.push({ kind: 'detour', text: 'Un pont coupé : le convoi allonge.' });
      mult *= 0.92;
    } else {
      events.push({ kind: 'calme', text: 'Route tranquille.' });
    }
  }

  const tfH = heroEquivalentFactor(poi);
  const haul = 1 + Math.min(CARAVAN.haulMax, countRole(escort, 'haul') * CARAVAN.haulPerRole);
  const k = mult * haul;
  const raw = harvestYield(poi.type, poi.level, tfH);
  const y = {
    energy: raw.energy * CARAVAN.yieldShare,
    summonStones: raw.summonStones * CARAVAN.yieldShare,
    scrap: raw.scrap * CARAVAN.yieldShare,
    keys: raw.keys,
  };
  const wages = caravanWages(escort, poi);
  const fights = events.filter((e) => e.kind === 'bandits').length;
  const xp: Record<string, number> = {};
  for (const a of escort) xp[a.id] = missionXp(a, poi, fights);

  return {
    // ⚠️ Le plafond d'énergie s'applique APRÈS les multiplicateurs : « complément, jamais
    // substitut au sport » est un invariant, pas une base qu'un bon voyage dépasserait.
    gold: Math.round(goldCost(poi.type, poi.level) * 0.3 * k),
    energy: Math.min(y.energy, Math.round(y.energy * k)),
    summonStones: Math.round(y.summonStones * k),
    scrap: Math.round(y.scrap * k),
    keys: Math.round(y.keys * Math.min(1.2, k)) + keysBonus,
    wages,
    xp,
    hurt,
    events,
    text: events.map((e) => e.text).join(' '),
  };
}

/** Durée de convalescence d'un blessé, raccourcie par les 🩺 de l'escorte ET par
 *  l'Infirmerie (le même bâtiment qui soigne le héros et les familiers). */
export function caravanHurtMs(escort: Adventurer[], infirmaryLevel = 0): number {
  const care = Math.min(0.6, countRole(escort, 'heal') * CARAVAN.carePerRole);
  const inf = Math.max(0.25, 1 - Math.max(0, infirmaryLevel) * 0.05);
  return Math.round(CARAVAN.hurtMs * (1 - care) * inf);
}

/** Prépare un convoi : le POI est consommé par l'appelant, comme pour le héros. */
export function startCaravan(
  id: string,
  poi: Poi,
  escort: Adventurer[],
  now: number,
  seed: number,
): Caravan {
  const leg = caravanLegMin(poi, escort) * 60_000;
  return {
    id,
    poi,
    escort: escort.map((a) => a.id),
    sentAt: now,
    midAt: now + leg,
    returnAt: now + 2 * leg,
    outcome: resolveCaravan(poi, escort, seed),
    claimed: false,
  };
}

/** La cargaison est-elle récupérable ? Le convoi doit être RENTRÉ, et pas déjà encaissé.
 *  ⚠️ `claimed === undefined` = déjà crédité, jamais « à récupérer ». */
export function isCaravanClaimable(c: Caravan, now: number): boolean {
  return c.claimed === false && now >= c.returnAt;
}
