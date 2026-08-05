// talents.ts — talents du joueur (Phase 3). Un talent tous les 5 niveaux, choix
// 1 parmi 3. Bonus PERMANENTS (cumulables). Pur/testable.
import { mulberry32 } from './combat';
import { emptyEffects, type AggregatedEffects } from './items';

export interface Talent {
  code: string;
  name: string;
  desc: string;
  icon: string;
  effect: Partial<AggregatedEffects>;
}

export const TALENTS: Talent[] = [
  {
    code: 't_dmg',
    name: 'Force brute',
    desc: '+10 % dégâts',
    icon: '🗡️',
    effect: { damagePct: 0.1 },
  },
  { code: 't_pv', name: 'Robustesse', desc: '+10 % PV', icon: '❤️', effect: { maxPvPct: 0.1 } },
  {
    code: 't_crit',
    name: 'Précision',
    desc: '+5 % critique',
    icon: '🎯',
    effect: { critAdd: 0.05 },
  },
  {
    code: 't_dodge',
    name: 'Vivacité',
    desc: '+4 % esquive',
    icon: '💨',
    effect: { dodgeAdd: 0.04 },
  },
  { code: 't_gold', name: 'Cupidité', desc: '+15 % or', icon: '🪙', effect: { goldPct: 0.15 } },
  {
    code: 't_leech',
    name: 'Sangsue',
    desc: '+5 % vol de vie',
    icon: '🩸',
    effect: { lifesteal: 0.05 },
  },
];

const BY_CODE = new Map(TALENTS.map((t) => [t.code, t]));

/** Nombre de talents gagnés à ce niveau (1 tous les 5 niveaux). */
export function talentsEarned(level: number): number {
  return Math.floor(level / 5);
}

/** Cumule les effets des talents choisis (codes). */
export function talentEffects(codes: string[]): AggregatedEffects {
  const a = emptyEffects();
  for (const code of codes) {
    const t = BY_CODE.get(code);
    if (!t) continue;
    const e = t.effect;
    a.damagePct += e.damagePct ?? 0;
    a.critAdd += e.critAdd ?? 0;
    a.dodgeAdd += e.dodgeAdd ?? 0;
    a.lifesteal += e.lifesteal ?? 0;
    a.dmgReduction += e.dmgReduction ?? 0;
    a.maxPvPct += e.maxPvPct ?? 0;
    a.goldPct += e.goldPct ?? 0;
    a.firstStrike = a.firstStrike || !!e.firstStrike;
  }
  return a;
}

/** 3 talents proposés pour le Nᵉ choix (déterministe → stable jusqu'au choix). */
export function talentChoices(slotIndex: number): Talent[] {
  const rng = mulberry32(slotIndex + 1);
  const pool = [...TALENTS];
  // Mélange (Fisher-Yates seedé) puis on prend 3.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, 3);
}

export function talentByCode(code: string): Talent | undefined {
  return BY_CODE.get(code);
}
