import { describe, expect, it } from 'vitest';
import { buildingPreview, nextMilestone } from '@/lib/buildingPreview';
import { militiaCap, type IslandMilitia } from '@/lib/militia';

// Île 2 : niveaux 21 à 40, trois lieux fixes de 5 places.
const ISLE: IslandMilitia = { seats: 15, minLevel: 21, maxLevel: 40 };

describe('aperçu de la Caserne — le plafond de l’île, pas le niveau du bâtiment', () => {
  it('sur une île, la Caserne 38 n’annonce pas « 38 au plus » (signalé)', () => {
    const [now] = buildingPreview('barracks', 38, 0, ISLE);
    expect(now!.text).not.toContain('38 au plus');
    expect(now!.text).toContain(`${militiaCap(38, ISLE)} au plus`);
    expect(now!.text).toContain('15 places');
  });
  it('jamais au-delà des places de l’île', () => {
    const rows = buildingPreview('barracks', 39, 6, ISLE);
    for (const r of rows) expect(r.text).toContain(`${militiaCap(r.level, ISLE)} au plus`);
    expect(rows.at(-1)!.text).toContain('15 au plus');
  });
  it('hors archipel, l’effectif suit le niveau', () => {
    const [now] = buildingPreview('barracks', 12, 0);
    expect(now!.text).toContain(`${militiaCap(12, null)} au plus`);
    expect(now!.text).not.toContain('île');
  });
  it('le palier suivant lit aussi l’île', () => {
    const m = nextMilestone('barracks', 38, 40, ISLE);
    expect(m?.text).toContain(`${militiaCap(m!.level, ISLE)} au plus`);
  });
});
