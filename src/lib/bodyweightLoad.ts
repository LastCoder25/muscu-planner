// 🏋️ LA CHARGE D'UN EXO AU POIDS DU CORPS (2026-10-10, demandé : « ma série de tractions
// me rapporte 1 XP alors que c'est très dur »). Un exo sans matériel n'avait AUCUN tonnage :
// une traction soulève pourtant à peu près tout le corps, une pompe environ les deux tiers.
// On compte donc une part du POIDS DU JOUEUR comme charge, pour le tonnage de l'XP.
//
// ⚠️ Seuls les POLYARTICULAIRES au poids du corps sont listés : c'est là que la charge est
// réelle et que l'XP était injuste. Les exos d'isolation ou de gainage (mollets, relevés de
// jambes, superman…) n'y figurent pas : leur « charge » se lit mal et les y mettre
// paierait des séries faciles. Un exo absent vaut 0 (rien ne change pour lui).
// Parts : ordres de grandeur courants (traction ~100 %, dips ~90 %, pompes ~65 %).
// Les variantes assistées à l'élastique portent leur part déjà réduite (comme ASSIST_MULT).

export const BODYWEIGHT_SHARE: Readonly<Record<string, number>> = {
  ex_pullup: 1,
  ex_pullup_assisted: 0.6,
  ex_dips: 0.9,
  ex_dips_assisted: 0.55,
  ex_pushup: 0.65,
  ex_pushup_knees: 0.5,
  ex_diamond_pushup: 0.65,
  ex_pike_pushup: 0.7,
  ex_bw_squat: 0.7,
  ex_bw_lunge: 0.6,
};

/** La charge (kg) qu'apporte le poids du corps sur une rep de cet exo. 0 si l'exo n'est pas
 *  listé ou si le poids du joueur est inconnu. `assisted` (case cochée sur la série) la
 *  réduit comme l'XP d'une rep assistée. */
export function bodyweightLoad(
  exerciseId: string,
  bodyKg: number | null | undefined,
  assistMult = 1,
): number {
  const share = BODYWEIGHT_SHARE[exerciseId] ?? 0;
  if (!share || !bodyKg || bodyKg <= 0) return 0;
  return share * bodyKg * assistMult;
}
