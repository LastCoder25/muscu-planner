import { describe, it, expect } from 'vitest';
import {
  recallReturns,
  releaseFromControl,
  reinforcementsEnRoute,
  returnsEnRoute,
  sendHomeFromControl,
  settleReinforcements,
} from '@/lib/controlPoints';
import { EXPE, type ExpeditionMap, type Poi } from '@/lib/expedition';

// 🔙 Un retour d'un point fixe vers la base peut rebrousser chemin (signalé : « quand je
// fais revenir une garnison, je n'ai pas de demi-tour »).

const point = (owner: 'player' | 'enemy' = 'player'): Poi =>
  ({
    id: 'ctl_mine',
    type: 'control',
    level: 20,
    x: 40,
    y: 60,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 0,
    control: {
      kind: 'mine',
      owner,
      garrison: ['adv_a', 'mil:1'],
      retakes: 0,
      faction: 'bandits',
      size: 1,
    },
  }) as unknown as Poi;

const mapOf = (p: Poi): ExpeditionMap =>
  ({ seed: 1, spawnCount: 0, nextSpawnAt: 0, pois: [p] }) as ExpeditionMap;

/** Le geste du store : sortir de la garnison, puis noter le trajet du retour (0 → 1000). */
function sentHome(p = point()): ExpeditionMap {
  const out = releaseFromControl(mapOf(p), 'ctl_mine', ['adv_a', 'mil:1'], 0, 20);
  return sendHomeFromControl(out, 'ctl_mine', ['adv_a', 'mil:1'], 0, 1000);
}

describe('recallReturns', () => {
  it('ils retournent sur le point en autant de temps qu’ils ont marché', () => {
    const r = recallReturns(sentHome(), 'ctl_mine', ['adv_a', 'mil:1'], 300);
    if ('block' in r) throw new Error(r.block);
    expect(r.back).toEqual([
      { id: 'adv_a', at: 600 },
      { id: 'mil:1', at: 600 },
    ]);
    // Plus en route vers la base : en renfort vers le point.
    expect(returnsEnRoute(r.map, 300)).toHaveLength(0);
    const reinf = reinforcementsEnRoute(r.map, 300);
    expect(reinf).toHaveLength(1);
    expect(reinf[0]!.members).toEqual(['adv_a', 'mil:1']);
    // Dessiné depuis là où ils ont tourné (30 % du chemin vers la ville).
    expect(reinf[0]!.origin).toEqual({
      x: 40 + (EXPE.town.x - 40) * 0.3,
      y: 60 + (EXPE.town.y - 60) * 0.3,
    });
    // Et à l'arrivée ils reprennent leur poste.
    const back = settleReinforcements(r.map, 600, 20);
    expect(back.pois[0]!.control!.garrison).toEqual(['adv_a', 'mil:1']);
  });

  it('pas de second demi-tour', () => {
    const r = recallReturns(sentHome(), 'ctl_mine', ['adv_a'], 300);
    if ('block' in r) throw new Error(r.block);
    expect(reinforcementsEnRoute(r.map, 300)[0]!.turned).toBe(true);
  });

  it('refuse : déjà rentrés, point perdu, plus de place', () => {
    expect(recallReturns(sentHome(), 'ctl_mine', ['adv_a'], 1000)).toEqual({ block: 'arrived' });
    const lost = sentHome();
    lost.pois[0]!.control!.owner = 'enemy';
    expect(recallReturns(lost, 'ctl_mine', ['adv_a'], 300)).toEqual({ block: 'notHeld' });
    const full = sentHome();
    full.pois[0]!.control!.garrison = ['mil:2', 'mil:3', 'mil:4', 'mil:5', 'mil:6'];
    // 🛡️ Pleine de MILICIENS : un champion fait quand même demi-tour (ils lui cèdent la place).
    expect('block' in recallReturns(full, 'ctl_mine', ['adv_a'], 300)).toBe(false);
    // Au camp (3 places de champion) : la garnison a encore de la place pour un milicien,
    // pas pour un champion.
    const camp = sentHome();
    camp.pois[0]!.control!.kind = 'training';
    camp.pois[0]!.control!.garrison = ['adv_b', 'adv_c', 'adv_d'];
    expect(recallReturns(camp, 'ctl_mine', ['adv_a'], 300)).toEqual({ block: 'full' });
    expect('block' in recallReturns(camp, 'ctl_mine', ['mil:1'], 300)).toBe(false);
  });

  // 🛡️ Signalé (ossuaire) : des miliciens renvoyés par l'arrivée de champions ou du héros
  // doivent pouvoir refaire demi-tour même sans place — à l'arrivée, ils repartent.
  it('des miliciens font demi-tour même si le lieu est plein (champions, héros)', () => {
    const full = sentHome();
    full.pois[0]!.control!.garrison = ['adv_b', 'adv_c', 'adv_d', 'adv_e', 'adv_f'];
    const r = recallReturns(full, 'ctl_mine', ['mil:1'], 300);
    if ('block' in r) throw new Error(r.block);
    // Arrivés sans place : ils rentrent à pied vers la base, jamais perdus.
    const after = settleReinforcements(r.map, 600, 20).pois[0]!.control!;
    expect(after.garrison).not.toContain('mil:1');
    expect(after.returning?.map((x) => x.id)).toContain('mil:1');

    const hero = sentHome();
    hero.pois[0]!.control!.garrison = ['adv_b', 'adv_c', 'adv_d'];
    hero.pois[0]!.control!.hero = true;
    expect('block' in recallReturns(hero, 'ctl_mine', ['mil:1'], 300)).toBe(false);
    // Un champion, lui, a toujours besoin d'une place.
    expect(recallReturns(full, 'ctl_mine', ['adv_a', 'mil:1'], 300)).toEqual({ block: 'full' });
  });

  it('un retour qui est déjà un demi-tour ne rebrousse pas', () => {
    const m = sentHome();
    m.pois[0]!.control!.returning = [{ id: 'adv_a', from: 0, at: 1000, turnBack: 0.5 }];
    expect(recallReturns(m, 'ctl_mine', ['adv_a'], 300)).toEqual({ block: 'turned' });
  });
});
