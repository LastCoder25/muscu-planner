import { describe, expect, it } from 'vitest';
import { archipelOn, ISLAND_OUTPOST_LEVEL, ISLANDS } from '@/lib/archipelago';
import { createMap } from '@/lib/expedition';
import { captureControl, collectControl, ensureControls } from '@/lib/controlPoints';
import { ensureIslandConquest } from '@/lib/islandConquest';
import { riftClearMana } from '@/lib/rift';
import { labyKeyPriceAt } from '@/data/labyrinths';
import { harvestOver } from './helpers/controlHarvest';
import { fullGoldPerDay, stonesPerDay } from './helpers/goldModel';

/**
 * 🏝️ ÉTAPE 6 — LA RENTE DES CINQ ÎLES PACIFIÉES (mesurée le 2026-10-02). Chaque île pacifiée
 * produit ses spécialités à plein et son socle (mine, source de mana) à 25 % sans crans
 * (règle 10). Garnisons pleines (5), crans montés (20 jours tenus), au niveau 100 :
 * or +28 % du revenu complet, mana +25 % de deux failles refermées par jour, pierres
 * d'invocation +30 % d'une journée de donjons, ~0,7 run de Labyrinthe par jour.
 * L'or tient dans la fourchette décidée à l'étape 0 (+7 à +41 %) ; ces bornes la gardent.
 */
const NOW = Date.UTC(2026, 9, 2, 12);
const DAY = 86_400_000;

function rentPerDay() {
  const total = { gold: 0, mana: 0, keys: 0, summon: 0, runes: 0, gearSeals: 0, champSeals: 0 };
  for (const isl of ISLANDS) {
    const L = isl.maxLevel;
    let m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(isl.id));
    m = ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
    m = ensureIslandConquest({ ...m, archipel: { ...m.archipel!, pacifiedAt: NOW } }, NOW, L);
    const ids = m.pois
      .filter(
        (p) =>
          p.control?.owner === 'enemy' &&
          !['objective', 'fortress', 'training', 'tower'].includes(p.control.kind),
      )
      .map((p) => p.id);
    for (const id of ids) m = captureControl(m, id, ['a', 'b', 'c', 'd', 'e'], NOW, 7);
    m = ensureIslandConquest(m, NOW, L);
    const T = NOW + 20 * DAY;
    for (const id of ids) {
      // La réserve accumulée depuis la prise est vidée d'abord : on mesure un DÉBIT.
      const far = {
        ...m,
        pois: m.pois.map((p) =>
          p.id === id ? { ...p, control: { ...p.control!, attackAt: T + 1e12 } } : p,
        ),
      };
      const h = harvestOver(collectControl(far, id, T, L).map, id, T, 10 * 24, L);
      for (const k of Object.keys(h) as (keyof typeof h)[]) total[k] += h[k] / 10;
    }
  }
  return total;
}

describe('🏝️ la rente des cinq îles pacifiées (niveau 100)', () => {
  const r = rentPerDay();
  // ⚠️ 2026-10-03 : plus de doublon de lieu fixe d'une île à l'autre (une seule mine, sur
  // l'île 1) — la rente d'or tombe à ~+14 %. Le plancher revient à la borne DÉCIDÉE à l'étape
  // 0 (+7 %) au lieu de la mesure d'avant (+28 %, d'où l'ancien plancher à 15 %).
  it('l’or : dans la fourchette de l’étape 0 (+7 à +41 % du revenu complet)', () => {
    const part = r.gold / fullGoldPerDay(100);
    expect(part).toBeGreaterThan(0.07);
    expect(part).toBeLessThan(0.41);
  });
  it('le mana, les pierres et les clés restent un complément', () => {
    expect(r.mana / (2 * riftClearMana({ level: 100 }))).toBeLessThan(0.35);
    expect(r.summon / stonesPerDay(100)).toBeLessThan(0.45);
    expect(r.keys / labyKeyPriceAt(100)).toBeLessThan(1.5);
  });
});
