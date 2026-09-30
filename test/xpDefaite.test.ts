import { describe, it, expect } from 'vitest';
import { EXPE, type Poi } from '@/lib/expedition';
import { missionXp, missionXpFor, refChampionAdv, XP_TEAM_REF } from '@/lib/caravan';
import { advXpToNext, type Adventurer } from '@/lib/adventurers';
import { dealtShare } from '@/lib/skirmish';
import {
  RAID,
  emptyBase,
  overflowCutFor,
  overflowThreatMult,
  rollRaid,
  weakenOverflow,
  type BaseState,
  type RiftOverflow,
} from '@/lib/raid';
import {
  estimateInterception,
  incursionDealt,
  resolveInterception,
  withRiftCut,
  type RiftRun,
} from '@/lib/rift';
import { canWeaken, partySendBlocker } from '@/lib/party';

/**
 * ⚔️ L'XP D'UNE DÉFAITE ET LES ARMÉES QU'ON PEUT AFFAIBLIR (v0.1375, demandé par
 * l'utilisateur, mesuré). Avant : le socle d'un échec se calculait sur le NIVEAU DE LA CIBLE,
 * sans plafond — un champion de niveau 10 envoyé seul contre une bande de niveau 50 perdait
 * à 100 %, n'abattait rien, et gagnait 968 XP (près de 4 niveaux).
 */

const T0 = 1_700_000_000_000;
const road = { advGear: [], supplies: [] };
const champ = (L: number, id = 'c0'): Adventurer => ({ ...refChampionAdv(L), id });
const bande = (level: number, over: Partial<Poi> = {}): Poi => ({
  id: `bande_${level}`,
  type: 'warband',
  level,
  travelLevel: level,
  x: EXPE.town.x,
  y: EXPE.town.y - 30,
  distNorm: 0.5,
  spawnedAt: T0,
  expiresAt: T0 + EXPE.lifespanMs.warband,
  from: { x: EXPE.town.x, y: EXPE.town.y - 40 },
  ...over,
});
const lieu = (level: number): Poi => ({ ...bande(level), id: `camp_${level}`, type: 'camp' });
const intercept = (poi: Poi, escort: Adventurer[], seed: number, P = 30) =>
  resolveInterception({ poi, escort, road, hero: null, seed, playerLevel: P, pantheonLevel: P });

describe('⚔️ missionXpFor — une défaite paie ce qu’elle a entamé', () => {
  const p = lieu(40);
  const esc = [champ(10)];

  it('rien entamé : zéro socle (pas même le plancher d’1 XP)', () => {
    expect(missionXpFor(esc, p, false, {}, 30, false, 0).c0).toBe(0);
  });

  it('tout entamé : le socle d’échec plein — exactement celui d’avant', () => {
    expect(missionXpFor(esc, p, false, {}, 30, false, 1).c0).toBe(
      missionXpFor(esc, p, false, {}, 30, false, null).c0,
    );
  });

  it('proportionnel : la moitié entamée paie la moitié du socle (à l’arrondi près)', () => {
    const plein = missionXpFor(esc, p, false, {}, 30, false, 1).c0!;
    const demi = missionXpFor(esc, p, false, {}, 30, false, 0.5).c0!;
    expect(Math.abs(demi - plein / 2)).toBeLessThanOrEqual(1);
  });

  it('les abattus restent payés même quand le socle vaut zéro', () => {
    expect(missionXpFor(esc, p, false, { c0: 12 }, 30, false, 0).c0).toBe(12);
  });

  it('une victoire ignore la part entamée', () => {
    expect(missionXpFor(esc, p, true, {}, 30, false, 0).c0).toBe(
      missionXpFor(esc, p, true, {}, 30, false, null).c0,
    );
  });

  it('un CONVOI (`null`) garde le socle d’échec plein et son plancher', () => {
    expect(missionXpFor(esc, p, false, {}, 30, false, null).c0!).toBeGreaterThanOrEqual(1);
    expect(missionXpFor(esc, p, false, {}, 30, false, null).c0!).toBeGreaterThan(
      missionXpFor(esc, p, false, {}, 30, false, 0.1).c0!,
    );
  });

  it('une part hors bornes est ramenée dans [0, 1]', () => {
    expect(missionXpFor(esc, p, false, {}, 30, false, -3).c0).toBe(0);
    expect(missionXpFor(esc, p, false, {}, 30, false, 7).c0).toBe(
      missionXpFor(esc, p, false, {}, 30, false, 1).c0,
    );
  });
});

describe('⚔️ dealtShare — la part de l’ennemi entamée, lue sur le journal', () => {
  it('victoire = 1, journal vide = 0, moitié = 0,5', () => {
    expect(dealtShare([], 100, true)).toBe(1);
    expect(dealtShare([], 100, false)).toBe(0);
    expect(dealtShare([{ monsterPv: 50 }], 100, false)).toBe(0.5);
  });
  it('bornée, et un adversaire sans PV ne divise pas par zéro', () => {
    expect(dealtShare([{ monsterPv: -20 }], 100, false)).toBe(1);
    expect(dealtShare([{ monsterPv: 150 }], 100, false)).toBe(0);
    expect(dealtShare([{ monsterPv: 0 }], 0, false)).toBe(0);
  });
});

describe('⚔️ L’ABUS EST FERMÉ — mesuré sur les vraies résolutions', () => {
  it('un champion seul qui perd contre bien plus fort n’apprend presque rien', () => {
    // Avant : 968 XP pour un champion de niveau 10 contre une bande de niveau 50.
    let xp = 0;
    for (let s = 1; s <= 12; s++)
      xp += intercept(bande(50), [champ(10)], s * 7919, 60).party!.xp.c0!;
    expect(xp / 12).toBeLessThan(advXpToNext(10) / 20);
  });

  it('perdre contre plus fort ne paie jamais plus que perdre à sa hauteur', () => {
    const moy = (lvl: number) => {
      let xp = 0;
      for (let s = 1; s <= 12; s++)
        xp += intercept(bande(lvl), [champ(20)], s * 7919).party!.xp.c0!;
      return xp / 12;
    };
    expect(moy(60)).toBeLessThan(moy(20));
  });

  it('une défaite qui entame la colonne inscrit son choc ; une victoire n’en inscrit aucun', () => {
    let vu = false;
    for (let s = 1; s <= 30; s++) {
      const o = intercept(
        bande(30),
        Array.from({ length: XP_TEAM_REF }, (_, i) => champ(30, `c${i}`)),
        s * 7919,
      );
      if (o.win) expect(o.party!.riftHit).toBeUndefined();
      else if (o.party!.riftHit) {
        vu = true;
        expect(o.party!.riftHit.part).toBeGreaterThan(0);
        expect(o.party!.riftHit.part).toBeLessThan(1);
        expect(o.party!.riftHit.spawnedAt).toBe(T0);
      }
    }
    expect(vu).toBe(true);
  });
});

describe('🕳️ weakenOverflow — la bande de faille garde ses pertes', () => {
  const ovf: RiftOverflow = { faction: 'betes', level: 30, at: T0 };
  const base = (over: Partial<BaseState> = {}): BaseState => ({
    ...emptyBase(1, T0),
    overflow: ovf,
    ...over,
  });
  const hit = (part: number, hitId = 'h1', spawnedAt = T0) => ({ part, hitId, spawnedAt });

  it('le renfort va de ×riftThreat (intacte) à ×1 (abattue), linéaire', () => {
    expect(overflowThreatMult(null)).toBe(1);
    expect(overflowThreatMult({ cut: 0 })).toBe(RAID.riftThreat);
    expect(overflowThreatMult({ cut: 1 })).toBe(1);
    expect(overflowThreatMult({ cut: 0.5 })).toBeCloseTo(1 + (RAID.riftThreat - 1) / 2, 9);
  });

  it('les parts se COMPOSENT (relatives à ce qu’il restait), et un choc ne compte qu’une fois', () => {
    const b1 = weakenOverflow(base(), hit(0.5, 'a'), T0);
    const b2 = weakenOverflow(b1, hit(0.5, 'b'), T0);
    expect(b2.overflow!.cut).toBeCloseTo(0.75, 9);
    expect(weakenOverflow(b2, hit(0.5, 'b'), T0)).toBe(b2);
  });

  it('n’ampute que le débordement de CETTE bande', () => {
    const b = base();
    expect(weakenOverflow(b, hit(0.5, 'x', T0 + 1), T0)).toBe(b);
  });

  it('une armée déjà tirée n’est amputée que si la Tour l’a vue APRÈS la bataille', () => {
    const raid = rollRaid(7, 30, T0 + 10 * 3600_000, 3 * 3600_000, ovf);
    const tot = (b: BaseState) => b.raid!.groups.reduce((s, g) => s + (g.threat ?? 1), 0);
    const tard = base({ overflow: null, raid });
    const avant = weakenOverflow(tard, hit(0.5), raid.detectedAt + 1);
    expect(avant).toBe(tard);
    const apres = weakenOverflow(tard, hit(0.5), raid.detectedAt);
    expect(apres.raid!.overflow!.cut).toBeCloseTo(0.5, 9);
    expect(tot(apres) / tot(tard)).toBeCloseTo(
      overflowThreatMult({ cut: 0.5 }) / RAID.riftThreat,
      6,
    );
  });

  it('le tirage du siège suit la part abattue', () => {
    const plein = rollRaid(7, 30, T0, 0, ovf);
    const moitie = rollRaid(7, 30, T0, 0, { ...ovf, cut: 0.5 });
    const k = (r: typeof plein) => r.groups[0]!.threat ?? 1;
    expect(k(moitie) / k(plein)).toBeCloseTo(overflowThreatMult({ cut: 0.5 }) / RAID.riftThreat, 6);
  });

  it('la colonne affrontée ensuite est amputée : l’interception devient plus facile', () => {
    const esc = [champ(30, 'a'), champ(30, 'b')];
    const intacte = estimateInterception(bande(34), esc, road, null, 40);
    const b = weakenOverflow(base(), hit(0.7), T0);
    expect(overflowCutFor(b, T0)).toBeCloseTo(0.7, 9);
    const entamee = estimateInterception(withRiftCut(bande(34), b), esc, road, null, 40);
    expect(entamee).toBeGreaterThan(intacte);
  });

  it('withRiftCut ne touche ni une armée de campagne, ni un autre lieu', () => {
    const b = weakenOverflow(base(), hit(0.7), T0);
    const armee = bande(30, {
      army: { kind: 'siege', targetId: 'r', at: T0, faction: 'betes', size: 8 },
    });
    expect(withRiftCut(armee, b)).toBe(armee);
    const camp = lieu(30);
    expect(withRiftCut(camp, b)).toBe(camp);
  });
});

describe('🕳️ incursionDealt — la part d’une faille entamée', () => {
  const bodies = [100, 100, 200].map((pv, i) => ({
    id: `b${i}`,
    name: 'x',
    emoji: 'x',
    level: 1,
    combatant: { name: 'x', pv, damage: 1, crit: 0, dodge: 0, initiative: 1 },
  }));
  const run = (over: Partial<RiftRun>): RiftRun => ({
    cleared: false,
    killed: 0,
    population: 2,
    bossDown: false,
    finalPv: 0,
    journal: [],
    maxPv: 1,
    pvTrail: [],
    foeTrail: [],
    ...over,
  });
  it('refermée = 1 ; rien atteint = 0', () => {
    expect(incursionDealt(run({ cleared: true }), bodies)).toBe(1);
    expect(incursionDealt(run({}), bodies)).toBe(0);
  });
  it('pondérée par les PV, gardien encore debout compté zéro', () => {
    const r = run({
      foeTrail: [
        { maxPv: 50, pv: 0 },
        { maxPv: 50, pv: 25 },
      ],
    });
    expect(incursionDealt(r, bodies)).toBeCloseTo((100 + 50) / 400, 9);
  });
});

describe('💀 partySendBlocker — perdu d’avance, sauf contre une armée qu’on peut affaiblir', () => {
  it('à 0 % : refusé partout où un échec ne change rien', () => {
    expect(partySendBlocker(lieu(30), 1, false, 10, 0)).toBe('hopeless');
    expect(partySendBlocker({ ...lieu(30), type: 'rift' }, 1, false, 10, 0)).toBe('hopeless');
  });
  it('à 0 % contre une armée en marche (faille OU campagne) : autorisé', () => {
    expect(canWeaken(bande(30))).toBe(true);
    expect(partySendBlocker(bande(30), 1, false, 10, 0)).toBeNull();
    const armee = bande(30, {
      army: { kind: 'retake', targetId: 'p', at: T0, faction: 'bandits', size: 3 },
    });
    expect(partySendBlocker(armee, 1, false, 10, 0)).toBeNull();
  });
  it('`null` (rien à combattre) ne vaut pas zéro, et le moindre espoir suffit', () => {
    expect(partySendBlocker(lieu(30), 1, false, 10, null)).toBeNull();
    expect(partySendBlocker(lieu(30), 1, false, 10, 0.01)).toBeNull();
  });
});

// Garde-fou : la règle de l'issue d'avant n'a pas bougé (le socle se calcule toujours pareil).
it('missionXp inchangée', () => {
  expect(missionXp(champ(10), lieu(40), false)).toBeGreaterThan(0);
});
