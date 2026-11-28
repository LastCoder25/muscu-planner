// ⏫ TOUT AMÉLIORER la base (demandé par l'utilisateur : « les moins chers d'abord, jusqu'à ce
// que le joueur n'ait plus d'or »). PUR : dit ce qui montera et pour combien, n'écrit rien.
import {
  buildingType,
  buildingUpgradeCost,
  canUpgradeBuilding,
  type Building,
} from '@/lib/buildings';
import { defenseType, defenseUpgradeCost, type DefenseStructure } from '@/lib/raid';

/** Ce qu'UNE structure gagne dans le lot. */
interface BaseUpgradeLine {
  key: string;
  label: string;
  emoji: string;
  from: number;
  to: number;
  gold: number;
}

export interface BaseUpgradePlan {
  buildings: Building[];
  defenses: DefenseStructure[];
  /** Les structures qui montent, dans l'ordre de leur premier cran payé. */
  lines: BaseUpgradeLine[];
  levels: number;
  spent: number;
  /** Coût du moins cher des crans qui restent ; `null` = tout est au niveau du joueur. */
  nextCost: number | null;
}

/**
 * Cran par cran, toujours le moins cher de l'enceinte et de la cour (même courbe de prix :
 * la base monte donc à niveau égal). Dès que ce cran-là n'est plus payable, aucun autre ne
 * l'est. Rien n'est construit ; à prix égal, l'enceinte puis la cour, dans leur ordre.
 */
export function planBaseUpgrades(input: {
  gold: number;
  playerLevel: number;
  buildings: Building[];
  defenses: DefenseStructure[];
}): BaseUpgradePlan {
  const { playerLevel } = input;
  const buildings = input.buildings.map((b) => ({ ...b }));
  const defenses = input.defenses.map((d) => ({ ...d }));
  const lines = new Map<string, BaseUpgradeLine>();
  const targets = [
    ...defenses.map((s) => ({
      key: `def:${s.typeId}`,
      info: defenseType(s.typeId),
      s,
      open: () => s.level < playerLevel,
      cost: () => defenseUpgradeCost(s.level),
    })),
    ...buildings.map((s) => ({
      key: `yard:${s.typeId}`,
      info: buildingType(s.typeId),
      s,
      open: () => canUpgradeBuilding(s, playerLevel),
      cost: () => buildingUpgradeCost(s.level),
    })),
  ];
  let spent = 0;
  let levels = 0;
  let nextCost: number | null = null;
  for (;;) {
    let best: (typeof targets)[number] | undefined;
    for (const t of targets) {
      if (t.info && t.open() && (!best || t.cost() < best.cost())) best = t;
    }
    if (!best?.info) break;
    const cost = best.cost();
    if (spent + cost > input.gold) {
      nextCost = cost;
      break;
    }
    const line = lines.get(best.key) ?? {
      key: best.key,
      label: best.info.label,
      emoji: best.info.emoji,
      from: best.s.level,
      to: best.s.level,
      gold: 0,
    };
    best.s.level += 1;
    line.to = best.s.level;
    line.gold += cost;
    lines.set(best.key, line);
    spent += cost;
    levels += 1;
  }
  return { buildings, defenses, lines: [...lines.values()], levels, spent, nextCost };
}
