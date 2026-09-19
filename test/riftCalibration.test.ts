// Calibration des incursions de faille — mesurée sur les VRAIES fonctions de la lib
// (`simulateIncursion`), jamais sur un gabarit qui rejouerait le parcours à sa façon : une
// estimation qui ne joue pas le même parcours que le jeu finit toujours par mentir (v0.851).
//
// ⚠️ LENT PAR NATURE (des milliers d'incursions) → délai explicite, comme les autres
// calibrations du projet. Les mesures sont partagées entre les cas : une seule passe.
import { describe, expect, it } from 'vitest';
import { fuseUnits } from '@/lib/skirmish';
import { refEscortUnits } from '@/lib/caravan';
import { riftPopulation, simulateIncursion, type RiftLike } from '@/lib/rift';

const T0 = Date.UTC(2026, 8, 19);
const DAY = 24 * 3_600_000;
const LEVELS = [12, 26, 45, 70, 100];
const N = 120;

function clearRate(level: number, units: number, at: number): number {
  const rift: RiftLike = { id: `poi_cal_${level}`, level, spawnedAt: T0 };
  const party = fuseUnits(refEscortUnits(level).slice(0, units), 'Groupe');
  let w = 0;
  for (let s = 1; s <= N; s++) if (simulateIncursion(party, rift, at, s * 7919).cleared) w++;
  return w / N;
}

/** Une seule passe de mesure, partagée : jeune / milieu / mûre, et le groupe amputé. */
const M = LEVELS.map((level) => {
  const full = refEscortUnits(level).length;
  return {
    level,
    young: clearRate(level, full, T0),
    mid: clearRate(level, full, T0 + 5 * DAY),
    mature: clearRate(level, full, T0 + 7 * DAY),
    short: clearRate(level, full - 1, T0 + 7 * DAY),
  };
});

describe('⚡ CALIBRATION des incursions — groupe de RÉFÉRENCE du niveau du lieu', () => {
  it('une faille MÛRE est un vrai risque, jamais perdue d’avance', () => {
    // Mesuré : 0,71 / 0,75 / 0,68 / 0,68 / 0,72 aux niveaux 12/26/45/70/100.
    for (const m of M) {
      expect(m.mature, `niv ${m.level}`).toBeGreaterThan(0.5);
      expect(m.mature, `niv ${m.level}`).toBeLessThan(0.92);
    }
  });

  it('⚠️ et elle est PLATE selon le niveau — c’est le métier de `RIFT_RELIEF`', () => {
    // ⚠️ Sans la table de renfort, mesuré : 0,22 au niveau 12 contre 0,99 au 26. L'écart de
    // force nécessaire n'est que de ±16 %, mais la sensibilité vaut ~5 points de taux par
    // pourcent de force — un petit écart suffit à faire d'un niveau un mur.
    const rates = M.map((m) => m.mature);
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(0.25);
  });

  it('une faille JEUNE est accessible — sinon « l’usine de mana » sonne faux au début', () => {
    // Mesuré : 0,94 à 1,00.
    for (const m of M) expect(m.young, `niv ${m.level}`).toBeGreaterThan(0.85);
  });

  it('⚠️ L’ÂGE crée un vrai écart : attendre paie PLUS, mais coûte plus cher', () => {
    // C'est l'arbitrage central de la feature. Un écart nul voudrait dire qu'attendre est
    // gratuit — et la courbe accélérée, la rampe de profondeur et le renfort ne serviraient
    // qu'à faire du butin. Mesuré : 0,22 à 0,32 de plus quand la faille est jeune.
    for (const m of M) expect(m.young - m.mature, `niv ${m.level}`).toBeGreaterThan(0.15);
  });

  it('⚠️ UNE PENTE, PAS UNE FALAISE — aucun pas d’effectif ne fait tout basculer', () => {
    // LA propriété que la rampe de profondeur a apportée. Sans elle, mesuré, ±10 % de force
    // faisaient passer le nettoyage de 99 % à 0 % : un MUR, le défaut exact que la v0.672 a
    // supprimé sur les sièges. On l'éprouve par l'effectif, le seul axe que le jeu fait
    // varier : entre deux âges voisins, le taux ne doit pas s'effondrer d'un coup.
    const level = 70;
    const full = refEscortUnits(level).length;
    const steps = [0, 2, 3.5, 5, 6, 7].map((d) => clearRate(level, full, T0 + d * DAY));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i - 1]! - steps[i]!, `pas ${i}`).toBeLessThan(0.35);
    }
    // …et la pente descend bien (monotone à la tolérance d'échantillonnage près).
    expect(steps[0]! - steps.at(-1)!).toBeGreaterThan(0.15);
  });

  it('⚠️ un groupe AMPUTÉ ne ferme pas une faille mûre — l’attrition ne pardonne pas', () => {
    // Mesuré : 0,00 à 0,02. ⚠️ BIEN PLUS DUR QU'UN CAMP (un de moins y donne 0,31-0,57),
    // et c'est STRUCTUREL : un camp est UN combat, une faille en est treize, donc l'écart de
    // force se compose. La gradation d'une faille vit dans son ÂGE, pas dans la taille du
    // groupe. Épinglé pour qu'on le voie bouger si l'on touche à l'attrition.
    for (const m of M) expect(m.short, `niv ${m.level}`).toBeLessThan(0.15);
  });

  it('l’effectif reste celui qu’annonce `riftPopulation` (le jeu et la mesure d’accord)', () => {
    const rift: RiftLike = { id: 'poi_pop', level: 30, spawnedAt: T0 };
    const party = fuseUnits(refEscortUnits(30), 'Groupe');
    for (const d of [0, 3.5, 7]) {
      const at = T0 + d * DAY;
      expect(simulateIncursion(party, rift, at, 42).population).toBe(riftPopulation(rift, at));
    }
  });
}, 900_000);
