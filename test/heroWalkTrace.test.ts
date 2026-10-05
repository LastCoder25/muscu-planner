import { describe, expect, it } from 'vitest';
import { heroWalkVoyage, recallPostedHero, turnBackComingHero } from '@/lib/islandConquest';
import { loseControl, walkPoint } from '@/lib/controlPoints';
import { EXPE, type ExpeditionMap, type Poi } from '@/lib/expedition';

// 🧭 Signalé : « je n'ai pas le tracé du déplacement du héros » (il marchait vers l'Ossuaire).
// La carte dessine désormais sa marche vers un poste ET son retour à pied.
const NOW = 1_000_000;
const unit = { name: 'Last', level: 38, combatant: {} } as never;
const T = EXPE.town;

function post(extra: object): Poi {
  return {
    id: 'ctl_ossuary',
    type: 'control',
    x: T.x + 40,
    y: T.y,
    control: { kind: 'ossuary', owner: 'player', garrison: [], ...extra },
  } as unknown as Poi;
}
const map = (pois: Poi[], more: object = {}) => ({ pois, ...more }) as unknown as ExpeditionMap;

describe('le héros à pied se dessine', () => {
  it('vers un poste : un aller simple base → lieu', () => {
    const v = heroWalkVoyage(
      map([post({ heroComing: { from: NOW - 1000, at: NOW + 3000, unit } })]),
      NOW,
    );
    expect(v).toMatchObject({ sentAt: NOW - 1000, midAt: NOW + 3000, returnAt: NOW + 3000 });
    expect(v?.back).toBe(false);
    expect(v?.poi.id).toBe('ctl_ossuary');
  });

  it('rappelé de son poste : il rentre depuis le lieu', () => {
    const m = recallPostedHero(map([post({ hero: true, heroUnit: unit })]), NOW, 10);
    expect(m.heroReturnFrom).toEqual({ x: T.x + 40, y: T.y, at: NOW });
    const v = heroWalkVoyage(m, NOW + 1000);
    expect(v?.back).toBe(true);
    expect(v).toMatchObject({ sentAt: NOW, midAt: NOW, returnAt: NOW + 600_000 });
    expect({ x: v!.poi.x, y: v!.poi.y }).toEqual({ x: T.x + 40, y: T.y });
  });

  it('demi-tour en chemin : il repart de là où il est sur la ligne', () => {
    // A marché 1/4 du trajet (1000 sur 4000).
    const m = turnBackComingHero(
      map([post({ heroComing: { from: NOW - 1000, at: NOW + 3000, unit } })]),
      NOW,
    );
    expect(m.heroReturnFrom).toEqual({ x: T.x + 10, y: T.y, at: NOW });
    expect(m.heroReturnAt).toBe(NOW + 1000);
  });

  it('lieu perdu pendant sa marche : il rentre depuis là où il était', () => {
    const m = loseControl(
      map([post({ heroComing: { from: NOW - 1000, at: NOW + 3000, unit } })], { seed: 1 }),
      'ctl_ossuary',
      30,
      NOW,
    );
    expect(m.heroReturnFrom).toEqual({ x: T.x + 10, y: T.y, at: NOW });
    expect(heroWalkVoyage(m, NOW + 10)?.back).toBe(true);
  });

  it("walkPoint reste sur la ligne, même hors de l'intervalle", () => {
    const p = { x: T.x + 40, y: T.y + 20 };
    expect(walkPoint(p, { from: 0, at: 100 }, 50)).toEqual({ x: T.x + 20, y: T.y + 10, at: 50 });
    expect(walkPoint(p, { from: 0, at: 100 }, 500)).toMatchObject({ x: p.x, y: p.y });
    expect(walkPoint(p, { from: 0, at: 100 }, -5)).toMatchObject({ x: T.x, y: T.y });
  });

  it('rien à dessiner : arrivé, ou retour sans point de départ (sauvegarde d’avant)', () => {
    expect(heroWalkVoyage(map([post({})], { heroReturnAt: NOW + 5000 }), NOW)).toBeNull();
    expect(
      heroWalkVoyage(map([post({})], { heroReturnAt: NOW - 1, heroReturnFrom: { x: 0, y: 0, at: 0 } }), NOW),
    ).toBeNull();
    expect(heroWalkVoyage(map([post({})]), NOW)).toBeNull();
  });
});
