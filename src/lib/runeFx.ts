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

/** Ce qu'a donné la pose : une compétence neuve, un niveau de plus, ou plus de place. */
export type RuneFxKind = 'new' | 'stack' | 'full';

export interface RuneFx {
  tier: RuneTier;
  color: string;
  intensity: number;
  emoji: string;
  title: string;
  subtitle: string;
}

/** La scène d'une rune posée. `level` = le niveau de la compétence APRÈS la pose. */
export function runeApplyFx(
  kind: RuneFxKind,
  drawn: SkillId,
  advName: string,
  level: number,
): RuneFx {
  const k = SKILLS[drawn];
  const lvl = kind === 'stack' ? level : 1;
  const effect = k.what.replace('{v}', String(skillValue(drawn, lvl)).replace('.', ','));
  const title =
    kind === 'stack'
      ? `${k.name} · Nv ${lvl}`
      : kind === 'new'
        ? `${advName} apprend ${k.name}`
        : `${k.name} tirée`;
  const subtitle =
    kind === 'full' ? `${effect} · plus de place : à toi de choisir` : `${advName} · ${effect}`;
  return {
    tier: k.tier,
    color: RUNE_COLOR[k.tier],
    intensity: RUNE_FX_INTENSITY[k.tier],
    emoji: k.emoji,
    title,
    subtitle,
  };
}
