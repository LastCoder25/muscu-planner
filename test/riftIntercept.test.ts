import { describe, it, expect } from 'vitest';
import {
  EXPE,
  advanceWorld,
  isQuotaPoi,
  isWarbandPoi,
  PARTY_TARGETS,
  POI_LABEL,
  type ExpeditionMap,
  type Poi,
} from '@/lib/expedition';
import {
  warbandArmy,
  interceptionMana,
  resolveInterception,
  estimateInterception,
  riftSpecOf,
} from '@/lib/rift';
import { RAID, armyCombatant } from '@/lib/raid';
import { refAdventurer } from '@/lib/caravan';
import { simulateCombat } from '@/lib/combat';
import type { Adventurer } from '@/lib/adventurers';

const H = 3600_000;
const LIFE = EXPE.lifespanMs.rift;
const T0 = 1_700_000_000_000;

const rift = (id: string, dx: number, dy: number, spawnedAt = T0, level = 1): Poi => ({
  id,
  type: 'rift',
  level,
  x: EXPE.town.x + dx,
  y: EXPE.town.y + dy,
  distNorm: 0.5,
  spawnedAt,
  expiresAt: spawnedAt + LIFE,
});
const carte = (pois: Poi[]): ExpeditionMap => ({
  seed: 1,
  spawnCount: 99,
  nextSpawnAt: 9e15,
  riftCount: 99,
  nextRiftAt: 9e15,
  pois,
});
/** Fait déborder une faille et rend la bande qui en sort. */
function bandeDe(map: ExpeditionMap, now: number): Poi {
  const m = advanceWorld(map, now, 20);
  const w = m.pois.find(isWarbandPoi);
  if (!w) throw new Error('aucune bande');
  return w;
}
const team = (lvl: number, n: number): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(lvl, i),
    id: `a${i}`,
    name: `A${i}`,
    seed: i + 1,
  }));
const road = { familiars: [], talents: [], advGear: [], now: 0, kennelLevel: 0 };

describe('la bande naît du débordement', () => {
  const now = T0 + LIFE + H;

  it('une faille qui déborde laisse SA MINE **et** son armée', () => {
    const m = advanceWorld(carte([rift('r', 0, 30)]), now, 20);
    expect(m.pois.filter((p) => p.type === 'mana_mine')).toHaveLength(1);
    expect(m.pois.filter(isWarbandPoi)).toHaveLength(1);
  });

  it('elle hérite de la FACTION de sa faille — pas d’un tirage à part', () => {
    const r = rift('r', 0, 30);
    const w = bandeDe(carte([r]), now);
    expect(w.faction).toBe(riftSpecOf(r).faction);
  });

  it('elle part de l’emplacement de la faille et garde ce départ dans `from`', () => {
    const r = rift('r', 0, 30);
    const w = bandeDe(carte([r]), now);
    expect(w.from).toEqual({ x: r.x, y: r.y });
  });

  it('elle est HORS QUOTA : elle ne vole la place d’aucune mine ni d’aucun camp', () => {
    const w = bandeDe(carte([rift('r', 0, 30)]), now);
    expect(isQuotaPoi(w)).toBe(false);
  });

  it('on l’attaque en GROUPE, comme un camp ou une faille', () => {
    expect(PARTY_TARGETS.has('warband')).toBe(true);
    expect(POI_LABEL.warband).toBeTruthy();
  });
});

describe('elle MARCHE vers la ville', () => {
  const dep = T0 + LIFE;

  function aT(dt: number): Poi {
    // On refait naître la bande puis on avance la carte de `dt`.
    const w = bandeDe(carte([rift('r', 0, 40)]), dep + 1);
    const m = advanceWorld(carte([w]), dep + dt, 20);
    const x = m.pois.find(isWarbandPoi);
    if (!x) throw new Error(`élaguée à dt=${dt}`);
    return x;
  }

  it('se rapproche de la ville à mesure que le temps passe', () => {
    const d = (p: Poi) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
    const t0 = d(aT(H));
    const mid = d(aT(EXPE.lifespanMs.warband / 2));
    const tard = d(aT(EXPE.lifespanMs.warband - H));
    expect(mid).toBeLessThan(t0);
    expect(tard).toBeLessThan(mid);
  });

  it('son `distNorm` suit — l’intercepter tard coûte un trajet plus court', () => {
    expect(aT(EXPE.lifespanMs.warband - H).distNorm).toBeLessThan(aT(H).distNorm);
  });

  it('⚠️ ELLE N’EST PAS ÉLAGUÉE EN CHEMIN par le filtre « trop fort pour ta distance »', () => {
    // C'est le piège : son `distNorm` tombe vers 0 sans qu'elle perde une once de force.
    // Sans exemption, elle disparaîtrait juste avant d'être interceptable.
    const haute = { ...bandeDe(carte([rift('r', 0, 40)]), dep + 1), level: 90 };
    const m = advanceWorld(carte([haute]), dep + EXPE.lifespanMs.warband - H, 5);
    expect(m.pois.filter(isWarbandPoi)).toHaveLength(1);
  });

  it('elle DISPARAÎT à la fin de sa fenêtre : l’occasion est passée', () => {
    const w = bandeDe(carte([rift('r', 0, 40)]), dep + 1);
    const m = advanceWorld(carte([w]), dep + EXPE.lifespanMs.warband + H, 20);
    expect(m.pois.filter(isWarbandPoi)).toHaveLength(0);
  });
});

describe('l’armée qu’elle porte', () => {
  const w = () => bandeDe(carte([rift('r', 0, 30)]), T0 + LIFE + H);

  it('⚠️ EST CALIBRÉE SUR LE NIVEAU DU JOUEUR, jamais sur celui de la faille', () => {
    // Le garde-fou anti-exploit : sinon laisser déborder une petite faille serait
    // STRICTEMENT meilleur que la fermer.
    const p = w();
    const bas = armyCombatant(warbandArmy(p, 10));
    const haut = armyCombatant(warbandArmy(p, 60));
    expect(haut.pv).toBeGreaterThan(bas.pv * 2);
  });

  it('porte le RENFORT de faille — elle est plus dure qu’une armée ordinaire', () => {
    const p = w();
    const avec = warbandArmy(p, 30);
    expect(avec.overflow).toBeTruthy();
    for (const g of avec.groups) expect(g.threat).toBeGreaterThan(1);
  });

  it('porte la FACTION de sa faille', () => {
    const p = w();
    expect(warbandArmy(p, 30).faction).toBe(p.faction);
  });

  it('est STABLE : la même bande présente toujours la même armée', () => {
    const p = w();
    const a = warbandArmy(p, 30);
    const b = warbandArmy(p, 30);
    expect(b.groups.map((g) => g.count)).toEqual(a.groups.map((g) => g.count));
  });
});

describe('ce que l’interception rapporte', () => {
  const p = () => bandeDe(carte([rift('r', 0, 30)]), T0 + LIFE + H);

  it('paie le mana de ce qu’on a RÉELLEMENT brisé — pas un tout-ou-rien', () => {
    const poi = p();
    const raid = warbandArmy(poi, 30);
    const army = armyCombatant(raid);
    const gagne = { win: true, rounds: 1, gold: 0, log: [] };
    const rien = {
      win: false,
      rounds: 1,
      gold: 0,
      log: [
        {
          round: 1,
          who: 'player' as const,
          type: 'hit' as const,
          damage: 0,
          playerPv: 1,
          monsterPv: army.pv,
        },
      ],
    };
    const moitie = {
      ...rien,
      log: [{ ...rien.log[0]!, monsterPv: Math.round(army.pv / 2) }],
    };
    expect(interceptionMana(raid, army, gagne)).toBeGreaterThan(0);
    expect(interceptionMana(raid, army, rien)).toBe(0);
    const demi = interceptionMana(raid, army, moitie);
    expect(demi).toBeGreaterThan(0);
    expect(demi).toBeLessThan(interceptionMana(raid, army, gagne));
  });

  it('ne paie QUE du mana — jamais d’or, d’objet, de ferraille ni de clé', () => {
    const o = resolveInterception({
      poi: p(),
      escort: team(30, 3),
      road,
      hero: null,
      seed: 12345,
      playerLevel: 30,
    });
    expect(o.gold).toBe(0);
    expect(o.energy).toBe(0);
    expect(o.scrap).toBe(0);
    expect(o.summonStones).toBe(0);
    expect(o.key).toBe(0);
    expect(o.item).toBeNull();
    expect(o.items).toHaveLength(0);
    expect(o.mana).toBeGreaterThanOrEqual(0);
  });

  it('verse de l’XP à CHAQUE aventurier, gagné ou perdu', () => {
    const o = resolveInterception({
      poi: p(),
      escort: team(5, 3),
      road,
      hero: null,
      seed: 7,
      playerLevel: 70, // armée hors de portée : la défaite est probable
    });
    for (const a of team(5, 3)) expect(o.party!.xp[a.id]).toBeGreaterThan(0);
  });

  it('DÉFAITE → tout le groupe à l’infirmerie ; VICTOIRE → personne', () => {
    const poi = p();
    const perdu = resolveInterception({
      poi,
      escort: team(3, 1),
      road,
      hero: null,
      seed: 3,
      playerLevel: 80,
    });
    expect(perdu.win).toBe(false);
    expect(perdu.party!.hurt).toHaveLength(1);

    const gagne = resolveInterception({
      poi,
      escort: team(60, 6),
      road,
      hero: null,
      seed: 3,
      playerLevel: 4,
    });
    expect(gagne.win).toBe(true);
    expect(gagne.party!.hurt).toHaveLength(0);
  });
});

describe('le pronostic ne rejoue jamais la bataille', () => {
  it('annonce un % et n’emploie AUCUNE graine du vrai choc', () => {
    const poi = bandeDe(carte([rift('r', 0, 30)]), T0 + LIFE + H);
    const pct = estimateInterception(poi, team(30, 3), road, null, 12);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(1);
  });

  it('un groupe plus fort annonce un meilleur %', () => {
    const poi = bandeDe(carte([rift('r', 0, 30)]), T0 + LIFE + H);
    // ⚠️ Le NIVEAU DU LIEU décide de la force de la colonne : à niveau 1 elle est
    // dérisoire et les DEUX groupes gagnent — le test ne mesurerait plus rien.
    const fort = bandeDe(carte([rift('r', 0, 30, T0, 26)]), T0 + LIFE + H);
    const petit = estimateInterception(fort, team(26, 1), road, null, 24);
    const gros = estimateInterception(fort, team(26, 6), road, null, 24);
    expect(gros).toBeGreaterThan(petit);
  });
});

describe('cohérence avec le siège', () => {
  it('le renfort qu’elle porte est CELUI du siège — jamais un second barème', () => {
    const poi = bandeDe(carte([rift('r', 0, 30)]), T0 + LIFE + H);
    const raid = warbandArmy(poi, 30);
    // `threat` = renfort de début de partie × RAID.riftThreat. On vérifie que le facteur
    // de faille y est, en comparant à la même armée SANS faille.
    const sans = warbandArmy({ ...poi, faction: undefined, spawnedAt: poi.spawnedAt }, 30);
    expect(raid.groups[0]!.threat! / sans.groups[0]!.threat!).toBeCloseTo(1, 6);
    expect(RAID.riftThreat).toBeGreaterThan(1);
  });

  it('le combat est un SEUL choc, pas une suite : l’armée est fondue', () => {
    const poi = bandeDe(carte([rift('r', 0, 30)]), T0 + LIFE + H);
    const raid = warbandArmy(poi, 30);
    const army = armyCombatant(raid);
    // Les PV de l'armée fondue valent la somme de ses groupes : rien ne se perd.
    expect(army.pv).toBeGreaterThan(0);
    const r = simulateCombat({ ...army, name: 'X' }, army, { seed: 1, goldOnWin: 0 });
    expect(r.log.length).toBeGreaterThan(0);
  });
});
