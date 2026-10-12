import { describe, expect, it } from 'vitest';
import { ISLANDS } from '../src/lib/archipelago';
import { islandRules, NEST, RISE } from '../src/lib/islandConquest';
import { SORTIE_EVENTS } from '../src/lib/sortieClock';

const isl = (id: number) => ISLANDS.find((i) => i.id === id)!;
const text = (id: number) => islandRules(isl(id)).map((r) => r.text).join(' ');

describe('islandRules', () => {
  it('chaque île a ses règles communes et au moins une règle propre', () => {
    for (const i of ISLANDS) {
      const r = islandRules(i);
      expect(r.length).toBeGreaterThanOrEqual(4);
      expect(r[0]!.text).toContain('lieux fixes');
      expect(r.at(-1)!.text).toContain('pacifiée');
    }
  });
  it('île 3 : les cimetières pris sont attaqués, la citadelle arrête tout', () => {
    const t = text(3);
    expect(t).toContain(`${Math.round(RISE.riseMs / 86400000)} jours`);
    expect(t).toContain('Citadelle des morts');
  });
  it('les rythmes viennent des constantes du jeu', () => {
    expect(text(2)).toContain(`${NEST.departuresMin} à ${NEST.departuresMax} sorties`);
    expect(text(4)).toContain(`${SORTIE_EVENTS.warlord.min} à ${SORTIE_EVENTS.warlord.max} sorties`);
    expect(text(5)).toContain(`${SORTIE_EVENTS.invasion.min} à ${SORTIE_EVENTS.invasion.max} sorties`);
  });
  it('une règle propre ne fuit pas sur une autre île', () => {
    expect(text(1)).not.toContain('nid');
    expect(text(2)).not.toContain('pillent');
    expect(text(3)).not.toContain('sanctuaire');
    expect(text(1)).toContain('pillent');
    expect(text(5)).toContain('brèche');
  });
});
