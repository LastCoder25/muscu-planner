import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { grantReportXp } from '@/lib/party';
import { refChampionAdv } from '@/lib/caravan';
import type { ExpeditionMessage } from '@/lib/expedition';

/**
 * 🎯🏰 L'XP DU CAMP D'ENTRAÎNEMENT NE SE PERD PLUS QUAND LA GARNISON DÉFEND (2026-09-27).
 * À chaque reprise, le store récolte d'abord le point (l'XP du camp va à la garnison), puis
 * verse l'XP du rapport de défense. Ce second versement partait de l'ÉTAT (`advList`), pas du
 * vivier récolté : l'XP du camp était écrasée.
 */
describe('🎯 reprise d’un camp d’entraînement', () => {
  it('l’XP du rapport s’ajoute à celle déjà versée, elle ne la remplace pas', () => {
    const before = { ...refChampionAdv(20, 0), id: 'a0' };
    const harvested = { ...before, xp: before.xp + 300 };
    const msg = {
      id: 'm1',
      party: { xp: { a0: 50 } },
    } as unknown as ExpeditionMessage;
    const g = grantReportXp([msg], [msg], [harvested], 100);
    const after = g.adventurers[0]!;
    const total = (a: typeof before) => a.level * 1e9 + a.xp;
    // Partir du vivier récolté garde les 300 du camp : on dépasse ce que 50 seuls donneraient.
    const only50 = grantReportXp([msg], [msg], [before], 100).adventurers[0]!;
    expect(total(after)).toBeGreaterThan(total(only50));
  });

  it('câblage : la boucle des reprises verse le rapport sur le vivier RÉCOLTÉ', () => {
    // ⚠️ Test de câblage, assumé : la boucle vit dans le store, qu'aucune porte ne monte.
    const src = readFileSync('src/stores/character.ts', 'utf8');
    expect(src).toContain('const x = reportXp(cur, box, msgs, advs);');
    // Et l'équipement se recalcule depuis l'état de départ jusqu'au vivier final.
    expect(src).toContain('const gearNext = trainWornGear(advList.value, rosterXp, gearStock);');
  });
});
