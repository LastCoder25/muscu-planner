// 🎯 La tenue d'un lieu fixe FACE À L'ARMÉE QUI ARRIVE (demandé : « le % doit prendre en
// compte la défense ET l'attaquant »). Avant, l'écran moyennait contre un ennemi générique au
// niveau du héros : une reprise Argent ≈ 1 champion contre 5 miliciens affichait 74 %, la
// bataille la gagnait à coup sûr.
import { describe, expect, it } from 'vitest';
import { controlAttackHold, retakeBattle } from '@/lib/fieldArmy';
import { attackerLevel, controlDefenseHold } from '@/lib/controlPoints';
import { campWinPct } from '@/lib/camp';
import { militiaUnits } from '@/lib/militia';
import { EXPE, type Poi } from '@/lib/expedition';

const H = 3_600_000;
const L = 35;
const MIL = ['mil:1', 'mil:2', 'mil:3', 'mil:4', 'mil:5'];
const KIT = { advGear: [] };

const poi = (attackAt: number, retakeCut = 0): Poi => ({
  id: 'ctl_scriptorium',
  type: 'control',
  level: 22,
  x: EXPE.town.x + 30,
  y: EXPE.town.y,
  distNorm: 0.3,
  spawnedAt: 0,
  expiresAt: 9e15,
  control: {
    kind: 'scriptorium',
    owner: 'player',
    faction: 'mortsvivants',
    size: 2,
    garrison: MIL,
    retakes: 1,
    attackAt,
    retakeCut,
  },
});

/** Des attaques dont l'assaillant tombe à des niveaux différents. */
const attacks = Array.from({ length: 40 }, (_, i) => poi(1000 * H + i * 7919));

describe('🎯 la tenue face à l’armée en approche', () => {
  it('rejoue EXACTEMENT la bataille de la reprise (`retakeBattle`)', () => {
    for (const p of attacks.slice(0, 5)) {
      const allies = militiaUnits(MIL, L);
      const { foe, force } = retakeBattle({ seed: 42 }, p, allies, L, 1);
      expect(controlAttackHold({ seed: 42 }, p, MIL, [], KIT, L, 1)).toBe(
        campWinPct(foe, force, allies, 24),
      );
    }
  });

  it('le % SUIT l’armée réelle, là où le plancher générique restait figé', () => {
    // ⚠️ Pas « plus faible = mieux repoussé » : face à une garnison trop sûre, l'ennemi
    // grossit sa troupe (`retakeBoost`) — un assaillant faible vient plus nombreux. Ce qui
    // doit changer, c'est que chaque attaque est jugée sur SA troupe.
    const floors = new Set(attacks.map((p) => controlDefenseHold(p, MIL, [], KIT, L, 1)));
    const holds = new Set(
      attacks.map((p) => controlAttackHold({ seed: 42 }, p, MIL, [], KIT, L, 1)),
    );
    expect(floors.size).toBe(1);
    expect(holds.size).toBeGreaterThan(1);
  });

  it('une armée amputée par les sorties est mieux repoussée', () => {
    let better = false;
    for (const p of attacks.slice(0, 8)) {
      const full = controlAttackHold({ seed: 42 }, p, MIL, [], KIT, L, 1);
      const cut = controlAttackHold(
        { seed: 42 },
        poi(p.control!.attackAt!, 0.8),
        MIL,
        [],
        KIT,
        L,
        1,
      );
      expect(cut).toBeGreaterThanOrEqual(full);
      if (cut > full) better = true;
    }
    expect(better, 'l’amputation ne change jamais rien').toBe(true);
  });

  it('un assaillant d’un rang sous le joueur n’est plus annoncé comme le pire cas', () => {
    // Le cas signalé : le plancher générique (ennemi au niveau du héros) ne bougeait pas,
    // quel que soit l'assaillant réel.
    const weak = attacks.find((p) => attackerLevel({ seed: 42 }, p, L) < L - 5);
    expect(weak, 'aucune attaque sous le rang du joueur').toBeDefined();
    const floor = controlDefenseHold(weak!, MIL, [], KIT, L, 1);
    expect(controlAttackHold({ seed: 42 }, weak!, MIL, [], KIT, L, 1)).toBeGreaterThan(floor);
  });

  it('les assaillants se battent à LEUR niveau, tiré pour cette attaque', () => {
    for (const p of attacks)
      expect(retakeBattle({ seed: 42 }, p, [], L, 1).foe.level).toBe(
        attackerLevel({ seed: 42 }, p, L),
      );
    expect(new Set(attacks.map((p) => attackerLevel({ seed: 42 }, p, L))).size).toBeGreaterThan(1);
  });

  it('sans défenseur, rien n’est repoussé', () => {
    expect(controlAttackHold({ seed: 42 }, attacks[0]!, [], [], KIT, L, 1)).toBe(0);
  });
});
