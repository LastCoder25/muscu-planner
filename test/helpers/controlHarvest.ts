import { collectControl } from '@/lib/controlPoints';
import type { ExpeditionMap } from '@/lib/expedition';

/** Récolte un lieu tenu toutes les 6 h sur `hours` heures (comme la récolte automatique du jeu :
 *  la réserve est plafonnée, une seule récolte en fin de période en perdrait) — totaux cumulés. */
export function harvestOver(
  m0: ExpeditionMap,
  id: string,
  from: number,
  hours: number,
  level: number,
) {
  // ⚠️ La production s’arrête à l’attaque prévue : on la repousse, on mesure le débit.
  let m: ExpeditionMap = {
    ...m0,
    pois: m0.pois.map((p) =>
      p.id === id && p.control ? { ...p, control: { ...p.control, attackAt: from + 1e12 } } : p,
    ),
  };
  const tot = { gold: 0, mana: 0, keys: 0, summon: 0, runes: 0, gearSeals: 0, champSeals: 0 };
  for (let h = 6; h <= hours; h += 6) {
    const c = collectControl(m, id, from + h * 3600_000, level);
    m = c.map;
    tot.gold += c.gold;
    tot.mana += c.mana;
    tot.keys += c.keys;
    tot.summon += c.summon;
    tot.runes += c.runes;
    tot.gearSeals += c.gearSeals;
    tot.champSeals += c.champSeals;
  }
  return tot;
}
