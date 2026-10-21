/**
 * 🪵 LES PALISSADES — des consommables qui renforcent la DÉFENSE d'un lieu fixe tenu
 * (2026-10-14, conçu avec l'utilisateur : « depuis le lieu fixe, j'active un consommable qui
 * augmente les chances de défense pendant une durée » ; « 10 et 20 %, peut-être 30 % max par
 * lieu fixe »).
 *
 * ⚠️ L'EFFET EST UNE TROUPE ENNEMIE PLUS PETITE, pas « +X points de chance ». Les chances ne
 * sont pas linéaires (2 miliciens tiennent ~25 %, 5 ~73 %) : un même bonus en points vaudrait
 * une fortune ici et rien là. Le jeu parle déjà cette langue (fumigène, fortin, enceinte).
 *
 * ⚠️ PAR-DESSUS LE PLAFOND DE SUSPENSE : sans exception, `retakeBoost` grossirait l'ennemi
 * pour ramener la tenue à 90 %, et une palissade posée sur une garnison solide ne ferait rien.
 * Tant qu'elle est active, la tenue peut monter jusqu'à `WARD.holdCap` (95 %) — jamais 100 :
 * une attaque garde toujours une chance (cf. `wardedBoost`, controlPoints).
 *
 * ⚠️ PLUSIEURS À LA FOIS, SOUS UN PLAFOND PAR LIEU (`WARD.max`, 30 %) : 10 + 20 ou 3 × 10
 * passent, 20 + 20 est refusé — jamais un objet posé pour rien. Chacune a SA durée.
 *
 * ⚠️ JUGÉE À L'HEURE DE L'ATTAQUE : une palissade expirée avant l'assaut ne compte pas.
 * L'heure de l'attaque étant secrète hors de la fenêtre imminente, l'écran annonce la tenue
 * avec les palissades actives MAINTENANT (il ne doit pas trahir l'heure).
 */
import type { ControlState, ExpeditionMap } from './expedition';
import type { SupplyId } from './supplies';

/** Ce que chaque palissade retire à la troupe qui attaque (part de sa force). */
export const WARD_CUT = {
  palissade: 0.1,
  bastion: 0.2,
} as const satisfies Partial<Record<SupplyId, number>>;
export type WardId = keyof typeof WARD_CUT;
export const WARD_IDS = Object.keys(WARD_CUT) as WardId[];
export const isWardId = (id: string): id is WardId => id in WARD_CUT;

export const WARD = {
  /** Durée d'une palissade (celle du sceau de brèche : même langage). */
  durationMs: 24 * 3_600_000,
  /** Plafond du cumul sur un même lieu. */
  max: 0.3,
  /** La tenue maximale tant qu'une palissade est active (au lieu de `CONTROL.maxHold`). */
  holdCap: 0.95,
} as const;

/** Une palissade posée : laquelle, et jusqu'à quand. */
export interface Ward {
  id: WardId;
  until: number;
}

/** Les palissades encore debout à `at`. */
export function activeWards(c: Pick<ControlState, 'wards'> | undefined, at: number): Ward[] {
  return (c?.wards ?? []).filter((w) => w.until > at && isWardId(w.id));
}

/** La part de la troupe retirée à `at` (0..`WARD.max`). */
export function wardCut(c: Pick<ControlState, 'wards'> | undefined, at: number): number {
  const sum = activeWards(c, at).reduce((t, w) => t + WARD_CUT[w.id], 0);
  return Math.min(WARD.max, sum);
}

/** Le multiplicateur de la troupe à `at` (1 sans palissade). */
export function wardMult(c: Pick<ControlState, 'wards'> | undefined, at: number): number {
  return 1 - wardCut(c, at);
}

export type WardBlock = 'notHeld' | 'full';
export const WARD_BLOCK_LABEL: Record<WardBlock, string> = {
  notHeld: 'seulement sur un lieu que tu tiens',
  full: `plafond de ${Math.round(WARD.max * 100)} % atteint`,
};

/** Pourquoi on ne peut pas poser cette palissade ici — `null` si on peut. */
export function wardBlocker(
  c: Pick<ControlState, 'owner' | 'wards'> | undefined,
  id: WardId,
  now: number,
): WardBlock | null {
  if (!c || c.owner !== 'player') return 'notHeld';
  // Somme brute (non plafonnée) : on refuse ce qui dépasserait le plafond, on ne l'écrête pas.
  const sum = activeWards(c, now).reduce((t, w) => t + WARD_CUT[w.id], 0);
  return sum + WARD_CUT[id] > WARD.max + 1e-9 ? 'full' : null;
}

/** Pose une palissade (les expirées sont retirées au passage). Rend un NOUVEL état. */
export function placeWard<C extends Pick<ControlState, 'wards'>>(c: C, id: WardId, now: number): C {
  return { ...c, wards: [...activeWards(c, now), { id, until: now + WARD.durationMs }] };
}

/** 🪵 Les lieux TENUS sous palissade à `now`, ids joints par « | » — une chaîne stable pour
 *  le calque de la carte (même forme que `imminentControlKey`). */
export function wardedControlKey(map: Pick<ExpeditionMap, 'pois'> | null, now: number): string {
  return (map?.pois ?? [])
    .filter((p) => p.control?.owner === 'player' && wardCut(p.control, now) > 0)
    .map((p) => p.id)
    .join('|');
}
