import { describe, it, expect } from 'vitest';
import { buildingPreview, nextMilestone } from '@/lib/buildingPreview';
import { BUILDING_TYPES } from '@/lib/buildings';
import { caravanSlots, caravanSlowFor } from '@/lib/caravan';
import { guildRoster } from '@/lib/adventurers';

describe('aperçu des prochains niveaux d’un bâtiment', () => {
  it('⚠️ CHAQUE type de bâtiment a un aperçu — un bâtiment muet est une régression', () => {
    for (const t of BUILDING_TYPES) {
      expect(buildingPreview(t.id, 3, 4).length, t.id).toBeGreaterThan(0);
    }
  });

  it('⚠️ les chiffres viennent des FONCTIONS DU JEU, pas d’une formule recopiée', () => {
    // C'est la seule garantie qu'un aperçu ne mente jamais : si l'équilibrage bouge,
    // il suit tout seul. Le projet s'est déjà fait avoir deux fois par une règle dupliquée.
    const l = 9;
    const ligne = buildingPreview('caravanserail', l, 0)[0]!;
    expect(ligne.text).toContain(String(caravanSlots(l)));
    expect(ligne.text).toContain(caravanSlowFor(l).toFixed(2));
    expect(buildingPreview('guild', 8, 0)[0]!.text).toContain(String(guildRoster(8)));
  });

  it('marque les PALIERS, et eux seuls', () => {
    // Un convoi de plus tous les 9 niveaux : 9, 18, 27… et rien entre les deux.
    const rows = buildingPreview('caravanserail', 8, 12);
    const paliers = rows.filter((r) => r.milestone).map((r) => r.level);
    expect(paliers).toEqual([9, 18]);
  });

  it('⚠️ l’aperçu commence AU NIVEAU ACTUEL — on compare à ce qu’on a', () => {
    expect(buildingPreview('outpost', 14, 3)[0]!.level).toBe(14);
  });

  it('⚠️ annonce le prochain PALIER même s’il est hors de l’aperçu', () => {
    // Sans ça, un Comptoir niveau 10 montre six lignes de vitesse et laisse croire que
    // le convoi suivant n'arrivera jamais.
    const m = nextMilestone('caravanserail', 10)!;
    expect(m.level).toBe(18);
    expect(m.text).toContain(String(caravanSlots(18)));
    // …et rien à signaler quand le bâtiment n'a pas de palier.
    expect(nextMilestone('outpost', 10)).toBeNull();
  });

  it('ne répète jamais deux fois la même ligne', () => {
    for (const t of BUILDING_TYPES) {
      const rows = buildingPreview(t.id, 5, 8);
      expect(new Set(rows.map((r) => r.text)).size, t.id).toBe(rows.length);
    }
  });
});
