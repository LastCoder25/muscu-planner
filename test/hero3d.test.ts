import { describe, it, expect } from 'vitest';
import {
  statShares,
  heroBuild,
  buildHeroSpec,
  BUILD_SPREAD,
  GLOW_FROM_RANK,
  PROFILE_TINT,
} from '@/lib/hero3d';
import { RANK_ORDER, RANK_COLOR, type Equipped } from '@/lib/items';

const item = (rarity: string) => ({ rarity }) as unknown as Equipped['weapon'];

describe('statShares', () => {
  it('normalise à 1', () => {
    const s = statShares(30, 50, 20);
    expect(s.p + s.e + s.a).toBeCloseTo(1, 10);
    expect(s.e).toBeGreaterThan(s.p);
  });
  it('un perso tout neuf (0 partout) reste neutre, pas NaN', () => {
    const s = statShares(0, 0, 0);
    expect(s).toEqual({ p: 1 / 3, e: 1 / 3, a: 1 / 3 });
  });
  it('ignore les valeurs négatives', () => {
    const s = statShares(-10, 10, 10);
    expect(Number.isFinite(s.p)).toBe(true);
    expect(s.p).toBe(0);
  });
});

describe('heroBuild', () => {
  it('un build parfaitement équilibré donne une silhouette neutre', () => {
    const b = heroBuild(40, 40, 40);
    expect(b.shoulders).toBeCloseTo(1, 10);
    expect(b.bulk).toBeCloseTo(1, 10);
    expect(b.height).toBeCloseTo(1, 10);
  });

  it('chaque stat écarte SA dimension, pas les autres', () => {
    const fort = heroBuild(90, 30, 30);
    expect(fort.shoulders).toBeGreaterThan(1);
    expect(fort.bulk).toBeLessThan(1);

    const agile = heroBuild(30, 30, 90);
    expect(agile.height).toBeGreaterThan(1);
    expect(agile.shoulders).toBeLessThan(1);

    const endurant = heroBuild(30, 90, 30);
    expect(endurant.bulk).toBeGreaterThan(1);
  });

  it('ne dépend que de la RÉPARTITION, pas du niveau atteint', () => {
    // Deux persos de même forme mais d'ampleur très différente → même silhouette.
    expect(heroBuild(10, 20, 30)).toEqual(heroBuild(1000, 2000, 3000));
  });

  it('reste dans des bornes lisibles, même sur un profil extrême', () => {
    for (const b of [heroBuild(1, 0, 0), heroBuild(0, 1, 0), heroBuild(0, 0, 1)]) {
      for (const v of [b.shoulders, b.bulk, b.height]) {
        expect(v).toBeGreaterThanOrEqual(1 - BUILD_SPREAD);
        expect(v).toBeLessThanOrEqual(1 + BUILD_SPREAD);
      }
    }
  });
});

describe('buildHeroSpec', () => {
  const stats = { puissance: 50, endurance: 40, agilite: 30 };

  it('ne rend QUE les emplacements réellement portés', () => {
    const spec = buildHeroSpec(stats, 'polyvalent', {
      weapon: item('rare'),
      relic: item('commun'),
    } as Equipped);
    expect(spec.pieces.map((p) => p.slot).sort()).toEqual(['relic', 'weapon']);
    expect(spec.familiar).toBeNull();
  });

  it('un héros nu ne porte rien (aucune pièce fantôme)', () => {
    const spec = buildHeroSpec(stats, 'agile', {} as Equipped);
    expect(spec.pieces).toEqual([]);
    expect(spec.familiar).toBeNull();
  });

  it('reprend la couleur de rareté comme source unique', () => {
    const rarity = RANK_ORDER[3]!;
    const spec = buildHeroSpec(stats, 'puissant', { armor: item(rarity) } as Equipped);
    expect(spec.pieces[0]!.color).toBe(RANK_COLOR[rarity]);
    expect(spec.pieces[0]!.rank).toBe(3);
  });

  it('seules les pièces Légendaire+ émettent', () => {
    const bas = RANK_ORDER[GLOW_FROM_RANK - 1]!;
    const haut = RANK_ORDER[GLOW_FROM_RANK]!;
    expect(buildHeroSpec(stats, 'agile', { weapon: item(bas) } as Equipped).pieces[0]!.glow).toBe(
      false,
    );
    expect(buildHeroSpec(stats, 'agile', { weapon: item(haut) } as Equipped).pieces[0]!.glow).toBe(
      true,
    );
  });

  it('le familier est à part : jamais dans les pièces du corps', () => {
    const spec = buildHeroSpec(stats, 'agile', {
      weapon: item('rare'),
      familiar: item('epique'),
    } as Equipped);
    expect(spec.pieces.some((p) => p.slot === 'familiar')).toBe(false);
    expect(spec.familiar?.slot).toBe('familiar');
  });

  it('teinte selon l’orientation, avec un repli sûr', () => {
    expect(buildHeroSpec(stats, 'puissant', {} as Equipped).tint).toBe(PROFILE_TINT.puissant);
    expect(buildHeroSpec(stats, 'inconnu', {} as Equipped).tint).toBe(PROFILE_TINT.polyvalent);
  });
});
