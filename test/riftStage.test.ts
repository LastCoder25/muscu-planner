import { describe, it, expect } from 'vitest';
import { RIFT_STAGE, buildRiftStage, riftStageInputOf, type RiftStageInput } from '@/lib/riftStage';
import { partyReport } from '@/lib/party';
import {
  RIFT,
  RIFT_RUN,
  riftDepth,
  riftFoeIdentity,
  riftPopulation,
  riftRamp,
  riftSpecOf,
  simulateIncursion,
} from '@/lib/rift';
import { EXPE, type Poi } from '@/lib/expedition';
import { fuseUnits } from '@/lib/skirmish';
import { refEscortUnits } from '@/lib/caravan';

/**
 * 🕳️ LA SALLE DU GARDIEN — la mise en scène d'une incursion.
 *
 * ⚠️ Ce qu'on vérifie avant tout, c'est qu'elle ne DÉCIDE rien : les corps affichés sont
 * ceux que le combat a livrés, les PV viennent du sillage et la taille d'un monstre EST
 * la rampe de force du moteur. Le reste (géométrie, lisibilité) n'a de sens qu'ensuite.
 */

const RIFT_MS = EXPE.lifespanMs.rift;
const at = (days: number) => Math.round((days / 7) * RIFT_MS);

const rift = (over: Partial<Poi> = {}): Poi => ({
  id: 'rift_a',
  type: 'rift',
  level: 26,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: RIFT_MS,
  ...over,
});

const input = (over: Partial<RiftStageInput> = {}): RiftStageInput => ({
  level: 26,
  faction: 'bandits',
  population: 8,
  killed: 8,
  cleared: true,
  maxPv: 1000,
  pvTrail: [900, 820, 740, 660, 580, 500, 420, 340, 260],
  ...over,
});

describe('les corps sur le terrain', () => {
  it('en pose un par monstre, PLUS le gardien — qui est toujours là, même sans être atteint', () => {
    const s = buildRiftStage(input({ population: 8, killed: 3, cleared: false }), 1);
    expect(s.foes).toHaveLength(9);
    expect(s.foes.filter((f) => f.boss)).toHaveLength(1);
    expect(s.foes.at(-1)!.boss).toBe(true);
  });

  it('marque à terre EXACTEMENT les monstres abattus, dans l’ordre du combat', () => {
    const s = buildRiftStage(input({ population: 8, killed: 5, cleared: false }), 1);
    const down = s.foes.filter((f) => !f.boss).map((f) => f.down);
    expect(down).toEqual([true, true, true, true, true, false, false, false]);
  });

  it('ne couche le gardien que si la faille est refermée', () => {
    const won = buildRiftStage(input({ cleared: true }), 1);
    const lost = buildRiftStage(input({ cleared: false }), 1);
    expect(won.foes.at(-1)!.down).toBe(true);
    expect(lost.foes.at(-1)!.down).toBe(false);
  });

  it('nomme les monstres comme le COMBAT les nomme (même source, même ordre)', () => {
    const s = buildRiftStage(input({ population: 5, killed: 5 }), 1);
    for (let k = 0; k < 5; k++) {
      expect(s.foes[k]!.name).toBe(riftFoeIdentity('bandits', k, false).name);
      expect(s.foes[k]!.emoji).toBe(riftFoeIdentity('bandits', k, false).emoji);
    }
    // Le gardien porte l'index de la population, exactement comme dans `simulateIncursion`.
    expect(s.foes.at(-1)!.name).toBe(riftFoeIdentity('bandits', 5, true).name);
  });
});

describe('la taille DIT la force', () => {
  it('vaut la rampe de profondeur du moteur, jamais un barème d’affichage', () => {
    const s = buildRiftStage(input({ population: 10, killed: 10 }), 7);
    for (let k = 0; k < 10; k++) expect(s.foes[k]!.scale).toBeCloseTo(riftRamp(riftDepth(k)), 12);
  });

  it('croît strictement à mesure qu’on s’enfonce', () => {
    const s = buildRiftStage(input({ population: 12, killed: 12 }), 3);
    const monsters = s.foes.filter((f) => !f.boss);
    for (let k = 1; k < monsters.length; k++)
      expect(monsters[k]!.scale).toBeGreaterThan(monsters[k - 1]!.scale);
  });

  it('donne au gardien une taille DÉRIVÉE de son poids, plus grande que tout le reste', () => {
    const s = buildRiftStage(input({ population: 12, killed: 12 }), 3);
    const boss = s.foes.at(-1)!;
    expect(boss.scale).toBeCloseTo(Math.sqrt(RIFT_RUN.bossWeight), 12);
    for (const f of s.foes.filter((x) => !x.boss)) expect(boss.scale).toBeGreaterThan(f.scale);
  });
});

describe('le déroulé', () => {
  it('sur une défaite en chemin : pas de porte, pas de gardien, et le dernier coup est fatal', () => {
    const s = buildRiftStage(input({ population: 9, killed: 4, cleared: false }), 2);
    expect(s.doorOpens).toBe(false);
    expect(s.beats.some((b) => b.kind === 'door')).toBe(false);
    expect(s.beats.some((b) => b.kind === 'boss')).toBe(false);
    // 4 abattus + celui qui a eu le dernier mot.
    expect(s.beats).toHaveLength(5);
    expect(s.beats.at(-1)!.fatal).toBe(true);
    expect(s.beats.at(-1)!.down).toBe(false);
    expect(s.beats.slice(0, 4).every((b) => b.down && !b.fatal)).toBe(true);
  });

  it('sur un nettoyage complet : la porte s’ouvre, puis le gardien — dans cet ordre', () => {
    const s = buildRiftStage(input({ population: 6, killed: 6, cleared: true }), 2);
    expect(s.doorOpens).toBe(true);
    const kinds = s.beats.map((b) => b.kind);
    expect(kinds).toEqual(['foe', 'foe', 'foe', 'foe', 'foe', 'foe', 'door', 'boss']);
    expect(s.beats.at(-1)!.down).toBe(true);
    expect(s.beats.some((b) => b.fatal)).toBe(false);
  });

  it('gardien qui tient : la porte s’est bien ouverte, mais le dernier coup est fatal', () => {
    const s = buildRiftStage(input({ population: 6, killed: 6, cleared: false }), 2);
    expect(s.doorOpens).toBe(true);
    expect(s.cleared).toBe(false);
    expect(s.beats.at(-1)!.kind).toBe('boss');
    expect(s.beats.at(-1)!.fatal).toBe(true);
    expect(s.beats.at(-1)!.down).toBe(false);
  });

  it('la porte ne désigne aucun corps et ne coûte aucun PV', () => {
    const s = buildRiftStage(input({ population: 4, killed: 4 }), 2);
    const door = s.beats.find((b) => b.kind === 'door')!;
    expect(door.foe).toBe(-1);
    expect(door.pvAfter).toBe(door.pvBefore);
  });

  it('encaisse un rapport abîmé : un nombre d’abattus aberrant ne fabrique rien en trop', () => {
    const s = buildRiftStage(input({ population: 4, killed: 40, cleared: true }), 2);
    expect(s.foes.filter((f) => !f.boss)).toHaveLength(4);
    expect(s.beats.filter((b) => b.kind === 'foe')).toHaveLength(4);
    expect(s.doorOpens).toBe(true);
  });

  it('encaisse un compte NÉGATIF : on affronte quand même le premier monstre', () => {
    const s = buildRiftStage(input({ population: 4, killed: -3, cleared: false }), 2);
    expect(s.beats.filter((b) => b.kind === 'foe')).toHaveLength(1);
    expect(s.beats[0]!.fatal).toBe(true);
    expect(s.doorOpens).toBe(false);
  });
});

describe('les PV sont LUS, jamais recalculés', () => {
  it('reprend le sillage tel quel, rencontre après rencontre', () => {
    const trail = [910, 830, 700, 655, 410];
    const s = buildRiftStage(
      input({ population: 4, killed: 4, cleared: true, maxPv: 1000, pvTrail: trail }),
      2,
    );
    const combats = s.beats.filter((b) => b.kind !== 'door');
    expect(combats.map((b) => b.pvAfter)).toEqual(trail);
    expect(combats[0]!.pvBefore).toBe(1000);
    // Chaque rencontre reprend là où la précédente s'est arrêtée.
    for (let k = 1; k < combats.length; k++)
      expect(combats[k]!.pvBefore).toBe(combats[k - 1]!.pvAfter);
  });

  it('sans sillage (rapport d’avant), il n’y a AUCUNE barre à peindre — mais la scène tient', () => {
    const s = buildRiftStage(input({ pvTrail: [], maxPv: 0 }), 2);
    expect(s.hasPv).toBe(false);
    expect(s.foes.length).toBeGreaterThan(0);
    expect(s.beats.length).toBeGreaterThan(0);
  });

  it('avec sillage, le drapeau l’annonce', () => {
    expect(buildRiftStage(input(), 2).hasPv).toBe(true);
  });
});

describe('la géométrie reste lisible', () => {
  it('garde tout le monde sur le terrain', () => {
    for (let pop = 1; pop <= RIFT.maxFoes; pop++) {
      const s = buildRiftStage(input({ population: pop, killed: pop }), pop * 17);
      for (const f of s.foes) {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThanOrEqual(1);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it('ne laisse jamais deux corps se recouvrir, même à effectif plein', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = buildRiftStage(input({ population: RIFT.maxFoes, killed: RIFT.maxFoes }), seed);
      for (let i = 0; i < s.foes.length; i++)
        for (let j = i + 1; j < s.foes.length; j++) {
          const a = s.foes[i]!;
          const b = s.foes[j]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          expect(d).toBeGreaterThan(0.06);
        }
    }
  });

  it('tient les monstres EN DEÇÀ de la porte et le gardien au-delà', () => {
    const s = buildRiftStage(input({ population: RIFT.maxFoes, killed: RIFT.maxFoes }), 5);
    for (const f of s.foes.filter((x) => !x.boss)) expect(f.x).toBeLessThan(s.doorX);
    expect(s.foes.at(-1)!.x).toBeGreaterThan(s.doorX);
    expect(s.doorX).toBe(RIFT_STAGE.doorX);
  });

  it('est déterministe : même graine, même terrain', () => {
    const a = buildRiftStage(input(), 99);
    const b = buildRiftStage(input(), 99);
    expect(a).toEqual(b);
    const c = buildRiftStage(input(), 100);
    expect(c.foes.map((f) => f.y)).not.toEqual(a.foes.map((f) => f.y));
  });
});

describe('ce qui distingue une incursion d’un camp', () => {
  const party = (over: Record<string, unknown> = {}) => ({
    hero: true,
    faction: 'bandits' as const,
    escort: [],
    win: true,
    foes: 5,
    slain: 5,
    kills: {},
    heroKills: 0,
    xp: {},
    hurt: [],
    advGear: [],
    wages: 0,
    journal: [],
    rift: { level: 26, maxPv: 900, pvTrail: [800, 700, 600, 500, 400, 300] },
    ...over,
  });

  it('un CAMP n’a rien à rejouer', () => {
    expect(riftStageInputOf(party({ rift: undefined }))).toBeNull();
  });

  it('une incursion rend exactement ce qu’il faut, lu du rapport', () => {
    const i = riftStageInputOf(party())!;
    expect(i).toEqual({
      level: 26,
      faction: 'bandits',
      population: 5,
      killed: 5,
      cleared: true,
      maxPv: 900,
      pvTrail: [800, 700, 600, 500, 400, 300],
    });
  });

  it('le rapport parle de FAILLE, pas de camp — dans les deux issues', () => {
    expect(partyReport(party(), []).verdict).toBe('faille refermée');
    expect(partyReport(party({ win: false }), []).verdict).toBe('la faille tient');
    expect(partyReport(party(), []).isRift).toBe(true);
  });

  it('…et un camp garde ses mots à lui', () => {
    const camp = party({ rift: undefined });
    expect(partyReport(camp, []).verdict).toBe('camp pris');
    expect(partyReport({ ...camp, win: false }, []).verdict).toBe('repoussé');
    expect(partyReport(camp, []).isRift).toBe(false);
  });
});

describe('bout en bout avec le moteur', () => {
  const party = () => fuseUnits(refEscortUnits(26), 'Groupe');

  it('le sillage d’une vraie incursion a une valeur par rencontre livrée', () => {
    const p = rift();
    const run = simulateIncursion(party(), p, at(6), 4242);
    const combats =
      run.cleared || run.killed === run.population ? run.population + 1 : run.killed + 1;
    expect(run.pvTrail).toHaveLength(combats);
    expect(run.maxPv).toBeGreaterThan(0);
    expect(run.pvTrail.at(-1)).toBe(run.cleared ? run.finalPv : 0);
  });

  it('la scène d’une vraie incursion montre les monstres réellement présents', () => {
    const p = rift();
    const now = at(6);
    const run = simulateIncursion(party(), p, now, 4242);
    const s = buildRiftStage(
      {
        level: p.level,
        faction: riftSpecOf(p).faction,
        population: run.population,
        killed: run.killed,
        cleared: run.cleared,
        maxPv: run.maxPv,
        pvTrail: run.pvTrail,
      },
      7,
    );
    expect(s.foes.filter((f) => !f.boss)).toHaveLength(riftPopulation(p, now));
    expect(s.foes.filter((f) => f.down && !f.boss)).toHaveLength(run.killed);
    expect(s.cleared).toBe(run.cleared);
  });
});
