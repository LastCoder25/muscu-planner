// 🔮 MISE EN SCÈNE D'UNE RUNE POSÉE SUR UN CHAMPION (demandé par l'utilisateur : « une
// animation pour l'attribution de rune, avec une couleur différente selon la rareté de la
// compétence »). Pur : l'overlay (`GameFxOverlay`) ne fait que peindre ce qui est décidé ici.
//
// ⚠️ LA COULEUR EST CELLE DE LA COMPÉTENCE TIRÉE (`SKILLS[id].tier`), jamais celle qu'on
// devinerait ailleurs ; sa teinte est `RUNE_COLOR`, la même que partout ailleurs.
import { RUNE_COLOR, SKILLS, skillValue, type RuneTier, type SkillId } from './skillRunes';

/** Intensité 0..3 : plus la compétence est rare, plus ça éclate (particules, éclair, rayons). */
export const RUNE_FX_INTENSITY: Record<RuneTier, number> = {
  green: 0,
  blue: 1,
  violet: 2,
  gold: 3,
};

/** Ce qui s'est passé : une rune OUVERTE (la compétence va au stock), ou une compétence
 *  DONNÉE à un champion — neuve, cumulée à celle qu'il portait, ou à la place d'une autre. */
export type RuneFxKind = 'open' | 'new' | 'stack' | 'replace';

export interface RuneFx {
  tier: RuneTier;
  color: string;
  intensity: number;
  emoji: string;
  title: string;
  subtitle: string;
}

/** La scène. `level` = le niveau de la compétence APRÈS l'opération (une compétence du stock
 *  peut avoir été fusionnée : elle entre à SON niveau). `advName` est ignoré à l'ouverture. */
export function runeApplyFx(
  kind: RuneFxKind,
  drawn: SkillId,
  advName: string,
  level: number,
): RuneFx {
  const k = SKILLS[drawn];
  const lvl = Math.max(1, level);
  const effect = k.what.replace('{v}', String(skillValue(drawn, lvl)).replace('.', ','));
  const title =
    kind === 'open'
      ? `${k.name} · Nv ${lvl}`
      : kind === 'stack'
        ? `${advName} : ${k.name} · Nv ${lvl}`
        : `${advName} apprend ${k.name}`;
  const subtitle = kind === 'open' ? `${effect} · rangée au stock` : `${effect}`;
  return {
    tier: k.tier,
    color: RUNE_COLOR[k.tier],
    intensity: RUNE_FX_INTENSITY[k.tier],
    emoji: k.emoji,
    title,
    subtitle,
  };
}
