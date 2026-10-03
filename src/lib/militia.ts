/**
 * 🛡️ LA MILICE — des défenseurs ANONYMES, produits par la Caserne (2026-09-28, conçu avec
 * l'utilisateur : « pas aussi complexe que les champions, juste des individus Milicien »).
 *
 * - **Aucune identité** : ni rang, ni niveau propre, ni équipement, ni XP. Un milicien vaut
 *   une PART fixe d'un champion de référence du niveau du JOUEUR (`MILITIA.unitShare`) : il
 *   reste utile toute la partie sans rien gérer, et le sport reste le plafond.
 * - **Il remplace un champion** (décision de l'utilisateur) : sur un point de contrôle, un
 *   milicien occupe une PLACE comme un champion et fait tourner le lieu (or de la mine,
 *   cueillette, copie, tour de guet). Ce qu'il ne fait PAS : apprendre. Le camp d'entraînement
 *   n'a rien à enseigner à un milicien — il ne forme que les champions et leur équipement.
 * - **Il MEURT au lieu d'aller à l'infirmerie** : c'est ce qui rend la production limitée
 *   intéressante — on DÉPENSE des miliciens. Défaite : tous ceux engagés tombent ; victoire :
 *   ceux tombés pendant le combat (les champions, eux, se relèvent).
 * - **Ils OCCUPENT, ils n'attaquent pas** (décision de l'utilisateur) : on les envoie sur un
 *   point DÉJÀ PRIS par des champions. Ils ne partent ni à l'assaut ni en mission.
 * - **Production GRATUITE et lente** (décision de l'utilisateur) : c'est la montée de niveau
 *   de la Caserne qui coûte de l'or. Elle s'arrête au PLAFOND D'EFFECTIF (tous les miliciens
 *   comptés : à la base, en route, postés).
 *
 * ⚠️ Côté carte, un milicien est une entrée `mil:<n>` dans la garnison d'un point : les places,
 * la production et les renforts le comptent SANS une ligne de plus. Côté vivier, il n'existe
 * pas (`Adventurer`) — tout ce qui lit les champions l'ignore naturellement.
 *
 * ⚠️ PUR : toutes les fonctions rendent un nouvel état, le store écrit.
 */
import { offenseOf, survivalOf, type Combatant } from './combat';
import { refEscortUnits } from './caravan';
import type { SkirmishUnit } from './skirmish';
import type { ExpeditionMap } from './expedition';

export const MILITIA = {
  /** Ce que vaut un milicien, en part d'UN champion de référence du niveau du joueur (offense
   *  ET survie). ⚠️ MESURÉ (`militia.test`) : cf. la tenue d'un point par ses miliciens. */
  unitShare: 0.5,
  /** Cadence : un milicien toutes les `slowH` heures à neuf, jusqu'à `fastH` au mieux —
   *  asymptotique, donc chaque niveau de Caserne l'accélère encore (aucun niveau mort).
   *  v0.1275 (demandé : « un peu long de produire des miliciens qui partent par 5 ») : une
   *  garnison pleine en ~12 h à la Caserne 1, ~9 h au niveau 10, ~6 h au 30 (était 8 h → 2 h). */
  slowH: 2.5,
  fastH: 0.5,
  /** Niveau de Caserne où la cadence a fait la moitié du chemin. */
  halfLevel: 20,
  /** Plafond d'effectif : `capBase` + 1 tous les `capEvery` niveaux de Caserne. `capBase` vaut
   *  une garnison pleine (`perPoint`) : dès la Caserne 1, on peut occuper un point à 5. */
  capBase: 5,
  capEvery: 3,
  /** Garnison au plus sur UN point de contrôle, CHAMPIONS ET MILICIENS COMPRIS (demandé :
   *  « garnison de 5 max champions et miliciens compris »). Les champions gardent en plus
   *  leur propre limite (`seatsOf` : 5, ou 3 au camp et à la forge) à l'intérieur de ces 5. La production du lieu
   *  reste plafonnée à celle d'une garnison pleine (`CONTROL.garrisonShare`), et la tenue
   *  par `CONTROL.maxHold`. */
  perPoint: 5,
  /** 🏰 AU REMPART (2026-09-30, demandé : « les miliciens présents défendent aussi la base ») :
   *  ce que vaut un milicien de la base dans un siège, en part d'un CHAMPION DE RÉFÉRENCE au
   *  niveau du héros (lu par `militiaGuard`, `raid.ts` ; v0.1370, choix de l'utilisateur :
   *  « la moitié »). Il compte aussi pour cette part dans l'effectif de référence de la
   *  garnison (`RAID.guardRefUnits`). */
  siegeShare: 0.5,
} as const;

/** Préfixe des ids de miliciens dans une garnison — jamais celui d'un champion (`adv_…`). */
export const MILITIA_PREFIX = 'mil:';
export const isMilitiaId = (id: string): boolean => id.startsWith(MILITIA_PREFIX);

export const MILITIA_EMO = '🛡️';
export const MILITIA_NAME = 'Milicien';

/** L'effectif de la milice, stocké dans la base (JSONB). `home` = les miliciens à la base ;
 *  `producedAt` = l'instant d'où repart la production ; `seq` = compteur d'ids. */
export interface MilitiaState {
  home: number;
  producedAt: number;
  seq: number;
}

export const emptyMilitia = (now: number): MilitiaState => ({ home: 0, producedAt: now, seq: 0 });

/** Heures pour produire UN milicien, selon le niveau de la Caserne (0 = pas de Caserne). */
export function militiaIntervalH(barracks: number): number {
  const L = Math.max(0, barracks);
  const { slowH, fastH, halfLevel } = MILITIA;
  return fastH + ((slowH - fastH) * halfLevel) / (halfLevel + L);
}

/** Combien de miliciens la Caserne entretient au plus (base + postés + en route).
 *  🏝️ `islandSeats` (REQUIS) : sur une île, les places de TOUS ses lieux fixes s'ajoutent
 *  (`militiaSeatsOf`), pour qu'on puisse laisser l'île qu'on quitte en garnison pleine de
 *  miliciens — les champions partent sur l'île suivante (décision de l'utilisateur,
 *  2026-10-03). 0 hors archipel : la carte ordinaire ne change pas. */
export function militiaCap(barracks: number, islandSeats: number): number {
  if (barracks <= 0) return 0;
  return MILITIA.capBase + Math.floor(barracks / MILITIA.capEvery) + Math.max(0, islandSeats);
}

/**
 * 🏭 La production jusqu'à `now`. ⚠️ Elle s'ARRÊTE au plafond (`away` = les miliciens postés
 * ou en route) : on ne stocke pas de miliciens « en attente » au-delà. À plein, l'horloge
 * repart de `now` — sinon vider un point relancerait une rafale de miliciens produits
 * pendant qu'on était au plafond. Rend le MÊME objet si rien ne change (le store n'écrit pas
 * à vide).
 */
export function produceMilitia(
  s: MilitiaState,
  barracks: number,
  away: number,
  now: number,
  islandSeats: number,
): MilitiaState {
  if (barracks <= 0) return s;
  const room = militiaCap(barracks, islandSeats) - s.home - away;
  const step = militiaIntervalH(barracks) * 3_600_000;
  const made = Math.floor(Math.max(0, now - s.producedAt) / step);
  if (made <= 0) return s;
  const n = Math.max(0, Math.min(room, made));
  // Au plafond, l'horloge AVANCE quand même (des pas entiers, la fraction entamée est
  // gardée) : sinon vider un point relancerait une rafale de miliciens produits pendant
  // qu'on était au plafond. Par pas entiers, l'état ne change qu'une fois par milicien — le
  // store n'écrit pas chaque seconde.
  return { ...s, home: s.home + n, producedAt: s.producedAt + made * step };
}

/** Temps avant le prochain milicien (0 si la Caserne est pleine ou absente). */
export function nextMilitiaMs(
  s: MilitiaState,
  barracks: number,
  away: number,
  now: number,
  islandSeats: number,
): number {
  if (barracks <= 0 || s.home + away >= militiaCap(barracks, islandSeats)) return 0;
  const step = militiaIntervalH(barracks) * 3_600_000;
  return Math.max(0, s.producedAt + step - now);
}

/** Prend `n` miliciens de la base : rend leurs ids et l'état restant, ou `null` s'il en
 *  manque. ⚠️ Des ids NEUFS (`seq`) : deux miliciens n'ont jamais le même. */
export function takeMilitia(
  s: MilitiaState,
  n: number,
): { state: MilitiaState; ids: string[] } | null {
  if (n <= 0 || n > s.home) return null;
  const ids = Array.from({ length: n }, (_, i) => `${MILITIA_PREFIX}${s.seq + i + 1}`);
  return { state: { ...s, home: s.home - n, seq: s.seq + n }, ids };
}

/** Des miliciens rentrent (rappelés d'un point) : ils reviennent à la base. */
export function returnMilitia(s: MilitiaState, n: number): MilitiaState {
  return n > 0 ? { ...s, home: s.home + n } : s;
}

/** Les miliciens d'une liste d'ids. */
export const militiaIn = (ids: readonly string[]): string[] => ids.filter(isMilitiaId);

/** Les miliciens HORS de la base : postés sur un point ou en route vers lui. Ils comptent
 *  dans l'effectif (`militiaCap`). */
export function militiaOnMap(map: ExpeditionMap | null | undefined): number {
  let n = 0;
  for (const p of map?.pois ?? []) {
    const c = p.control;
    if (!c) continue;
    n += militiaIn(c.garrison).length;
    n += militiaIn((c.reinforcing ?? []).map((r) => r.id)).length;
    // 🏠 Ceux qui RENTRENT d'un point : pas encore à la base, mais toujours de l'effectif.
    n += militiaIn((c.returning ?? []).map((r) => r.id)).length;
  }
  return n;
}

/** 🛡️ L'effectif de la milice, pour la ligne des disponibilités (2026-09-28, demandé :
 *  « le nombre de miliciens stationnés / total ») : `posted` = postés sur une place forte ou
 *  en route vers elle (`militiaOnMap`), `total` = tous ceux qui existent, base comprise — la
 *  même somme que la Caserne compare à son plafond. `cap` = ce plafond (`militiaCap`, 2026-09-29,
 *  demandé : « les assignés, le total que j'ai et le nombre que je peux avoir »). */
export function militiaCount(
  s: MilitiaState | null | undefined,
  map: ExpeditionMap | null | undefined,
  barracks: number,
  /** 🏝️ Les places de l'île (`militiaSeatsOf`), REQUIS : le même plafond que la Caserne. */
  islandSeats: number,
): { posted: number; home: number; total: number; cap: number } {
  const posted = militiaOnMap(map);
  const home = s?.home ?? 0;
  return { posted, home, total: posted + home, cap: militiaCap(barracks, islandSeats) };
}

const unitCache = new Map<number, Combatant>();

/**
 * ⚔️ LE COMBATTANT d'un milicien au niveau `level` : le modèle d'un champion de référence,
 * remis à l'échelle pour valoir `MILITIA.unitShare` d'un champion de référence MOYEN en
 * offense ET en survie — les deux grandeurs que la fusion d'un groupe additionne
 * (`fuseUnits`), donc N miliciens valent exactement N × la part. Mis en cache par niveau.
 */
export function militiaCombatant(level: number): Combatant {
  const L = Math.max(1, Math.round(level));
  const hit = unitCache.get(L);
  if (hit) return hit;
  const ref = refEscortUnits(L);
  const off = ref.reduce((s, u) => s + offenseOf(u.combatant), 0) / ref.length;
  const surv = ref.reduce((s, u) => s + survivalOf(u.combatant), 0) / ref.length;
  const model = ref[0]!.combatant;
  const k = MILITIA.unitShare;
  const c: Combatant = {
    ...model,
    name: MILITIA_NAME,
    pv: Math.max(1, Math.round((model.pv * k * surv) / Math.max(1e-9, survivalOf(model)))),
    damage: Math.max(1, Math.round((model.damage * k * off) / Math.max(1e-9, offenseOf(model)))),
  };
  unitCache.set(L, c);
  return c;
}

/** Les miliciens `ids` en unités de groupe (camps, reprises de points). */
export function militiaUnits(ids: readonly string[], level: number): SkirmishUnit[] {
  const c = militiaCombatant(level);
  return militiaIn(ids).map((id) => ({
    id,
    name: MILITIA_NAME,
    emoji: MILITIA_EMO,
    level: Math.max(1, Math.round(level)),
    combatant: c,
  }));
}

/** Le mot du rapport : « 🛡️ 2 miliciens tombés. » (vide s'il n'y en a aucun). */
export function militiaLostLabel(lost: readonly string[] | undefined): string {
  const n = lost?.length ?? 0;
  if (!n) return '';
  return ` ${MILITIA_EMO} ${n} milicien${n > 1 ? 's' : ''} tombé${n > 1 ? 's' : ''}.`;
}

/** Les miliciens d'un point : sa garnison ET ceux en route vers lui. */
export function militiaOfControl(
  c: { garrison: readonly string[]; reinforcing?: readonly { id: string }[] } | undefined | null,
): string[] {
  if (!c) return [];
  return militiaIn([...c.garrison, ...(c.reinforcing ?? []).map((r) => r.id)]);
}

/** 💀 Les miliciens PERDUS au combat : défaite → tous ceux engagés ; victoire → ceux tombés. */
export function militiaLost(
  engaged: readonly string[],
  d: { win: boolean; down: readonly string[] },
): string[] {
  const mine = militiaIn(engaged);
  if (!d.win) return mine;
  const down = new Set(d.down);
  return mine.filter((id) => down.has(id));
}
