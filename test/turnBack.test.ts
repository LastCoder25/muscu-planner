// 🔙 DEMI-TOUR SUR UNE EMBUSCADE PERDUE À L'ALLER (2026-09-29, décision de l'utilisateur :
// « en cas d'embuscade perdue à l'aller, le groupe fait demi-tour avec les blessés »).
// Au retour, une embuscade perdue ne coûte toujours qu'une part de la cargaison.
import { describe, expect, it } from 'vitest';
import { refChampionAdv, resolveCaravan, type CaravanOutcome } from '@/lib/caravan';
import {
  travelPosition,
  voyageTarget,
  EXPE,
  type ExpeditionOutcome,
  type Poi,
} from '@/lib/expedition';
import { resolveHarvestParty } from '@/lib/harvestParty';
import { partyReport, startParty } from '@/lib/party';
import { partyRoadOdds } from '@/lib/partyForecast';
import { refFighter } from '@/lib/proceduralContent';
import type { Adventurer } from '@/lib/adventurers';

const poi = (over: Partial<Poi> = {}): Poi => ({
  id: 'p',
  type: 'well',
  level: 20,
  x: 50,
  y: 50,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  perilous: true,
  ...over,
});
const team = (n: number, L = 20): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({ ...refChampionAdv(L, i), id: `a${i}` }));
const NUS = { advGear: [] };
/** Les jambes de l'aller : la première moitié (une route dangereuse en compte 4). */
const outLegs = (p: Poi) => (p.perilous ? 2 : 1);

/** Parcourt des graines et range chaque issue selon où la première défaite est tombée. */
function sample(p: Poi, esc: Adventurer[], n = 400) {
  const out: { o: CaravanOutcome; lostAt: number | null }[] = [];
  for (let s = 1; s <= n; s++) {
    const o = resolveCaravan(p, esc, s * 7919, NUS, 20, undefined);
    const bandits = o.events.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === 'bandits');
    const first = bandits.find(({ e }) => e.won === false);
    out.push({ o, lostAt: first ? first.i : null });
  }
  return out;
}

describe('🔙 le convoi fait demi-tour sur une embuscade perdue à l’ALLER', () => {
  const p = poi();
  // ⛑️ Une escorte SANS premiers secours : le sujet est le demi-tour, pas les blessés évités.
  const runs = sample(
    p,
    team(1).map((a) => ({ ...a, skills: (a.skills ?? []).filter((s) => s.id !== 'care') })),
  );
  it('toute défaite à l’aller fait faire demi-tour : rien de récolté, blessés gardés', () => {
    const aller = runs.filter((r) => r.lostAt !== null && r.lostAt < outLegs(p));
    expect(aller.length, 'aucune défaite à l’aller : le test ne prouve rien').toBeGreaterThan(20);
    for (const { o, lostAt } of aller) {
      expect(o.turnBack).toBeCloseTo((lostAt! + 1) / (outLegs(p) + 1), 9);
      expect(o.gold + o.energy + o.summonStones + o.keys + (o.mana ?? 0)).toBe(0);
      expect(o.hurt.length).toBeGreaterThan(0);
      // La route s'arrête : l'événement de demi-tour est le dernier.
      expect(o.events.at(-1)!.kind).toBe('demitour');
      expect(o.events.filter((e) => e.kind !== 'demitour')).toHaveLength(lostAt! + 1);
    }
  });
  it('une défaite au RETOUR ne fait pas demi-tour : le lieu est atteint, la cargaison rentre', () => {
    const retour = runs.filter((r) => r.lostAt !== null && r.lostAt >= outLegs(p));
    expect(retour.length, 'aucune défaite au retour : le test ne prouve rien').toBeGreaterThan(0);
    for (const { o } of retour) {
      expect(o.turnBack).toBeUndefined();
      expect(o.energy).toBeGreaterThan(0);
    }
  });
  it('sans défaite, pas de demi-tour', () => {
    for (const { o, lostAt } of runs) if (lostAt === null) expect(o.turnBack).toBeUndefined();
  });
});

describe('🔙 le voyage s’arrête en chemin', () => {
  const p = poi({ x: 60, y: 20 });
  const turned = { turnBack: 0.5 } as ExpeditionOutcome;
  const trip = startParty({ poi: p, hero: null, seed: 1, champions: 1 }, 0, 60, turned);
  it('aller et retour durent la part du chemin faite', () => {
    expect(trip.midAt).toBe(30 * 60_000);
    expect(trip.returnAt).toBe(60 * 60_000);
    expect(trip.turnBack).toBe(0.5);
  });
  it('on marche vers le point de demi-tour, pas vers le lieu', () => {
    const at = travelPosition(trip, trip.midAt - 1);
    const target = voyageTarget(trip);
    expect(at.x).toBeCloseTo(target.x, 1);
    expect(at.y).toBeCloseTo(target.y, 1);
    expect(target.x).toBeCloseTo(EXPE.town.x + (p.x - EXPE.town.x) * 0.5, 9);
    expect(Math.hypot(at.x - p.x, at.y - p.y)).toBeGreaterThan(5);
  });
  it('un trajet complet garde son lieu pour cible', () => {
    const full = startParty(
      { poi: p, hero: null, seed: 1, champions: 1 },
      0,
      60,
      {} as ExpeditionOutcome,
    );
    expect(full.turnBack).toBeUndefined();
    expect(full.midAt).toBe(60 * 60_000);
    expect(voyageTarget(full)).toBe(p);
  });
});

describe('🔙 une récolte d’équipe qui fait demi-tour', () => {
  it('n’atteint ni les gardes ni le lieu : échec, blessés, aucun butin', () => {
    let seen = 0;
    for (let s = 1; s <= 200 && seen < 5; s++) {
      const p = poi({ type: 'ruins', id: `r${s}` });
      const out = resolveHarvestParty({
        poi: p,
        escort: team(1),
        road: NUS,
        hero: null,
        seed: s,
        playerLevel: 20,
        pantheonLevel: 20,
      });
      if (out.turnBack === undefined) continue;
      seen++;
      expect(out.win).toBe(false);
      expect(out.party!.turnedBack).toBe(true);
      expect(out.party!.hurt.length).toBeGreaterThan(0);
      expect(out.seals).toBeUndefined();
      expect(out.gold + out.energy + out.summonStones + out.mana + out.key).toBe(0);
      expect(partyReport(out.party!, team(1)).verdict).toBe('demi-tour en chemin');
    }
    expect(seen, 'aucun demi-tour : le test ne prouve rien').toBeGreaterThan(0);
  });
});

describe('🛣️ la route à part des gardes (`partyRoadOdds`)', () => {
  const p = poi();
  it('se joue pour une équipe sans le héros sur une récolte, sinon null', () => {
    expect(partyRoadOdds(p, team(1), NUS, null)).not.toBeNull();
    expect(partyRoadOdds(p, [], NUS, null)).toBeNull();
    const hero = { name: 'H', level: 20, combatant: refFighter(20) };
    expect(partyRoadOdds(p, team(1), NUS, hero)).toBeNull();
    expect(partyRoadOdds(poi({ type: 'camp' }), team(1), NUS, null)).toBeNull();
  });
  it('un demi-tour est une embuscade perdue, et plus de champions en font moins', () => {
    const seul = partyRoadOdds(p, team(1), NUS, null, 120)!;
    const trio = partyRoadOdds(p, team(3), NUS, null, 120)!;
    expect(seul.clear + seul.turnBack).toBeLessThanOrEqual(1);
    expect(seul.turnBack).toBeGreaterThan(0.2);
    expect(trio.turnBack).toBeLessThan(seul.turnBack);
    expect(trio.clear).toBeGreaterThan(seul.clear);
  });
});

// 🔙⚔️ UNE ATTAQUE COMBINÉE NE FAIT PAS DEMI-TOUR (signalé : « un demi-tour en rouge du filon
// alors qu'ils le récoltaient depuis un moment »). Ses groupes partent de lieux différents et
// ne se réunissent qu'AU LIEU, à une heure figée au départ : l'écran les montrait arrivés et
// récoltant pendant que le rapport disait « rentrés sans atteindre le lieu ».
describe('🔙⚔️ une attaque combinée ne fait jamais demi-tour sur la route', () => {
  const p = poi();
  const esc = team(1).map((a) => ({
    ...a,
    skills: (a.skills ?? []).filter((s) => s.id !== 'care'),
  }));
  it('la même route, sans demi-tour : l’embuscade de l’aller ne coûte qu’une part du butin', () => {
    let seen = 0;
    for (let s = 1; s <= 400; s++) {
      const seed = s * 7919;
      const seule = resolveCaravan(p, esc, seed, NUS, 20, undefined);
      if (seule.turnBack === undefined) continue;
      seen++;
      const combinee = resolveCaravan(p, esc, seed, NUS, 20, undefined, { noTurnBack: true });
      expect(combinee.turnBack).toBeUndefined();
      expect(combinee.events.some((e) => e.kind === 'demitour')).toBe(false);
      // Le lieu est atteint : la cargaison rentre (réduite par la défaite).
      expect(combinee.energy).toBeGreaterThan(0);
    }
    expect(seen, 'aucun demi-tour à l’aller : le test ne prouve rien').toBeGreaterThan(20);
  });
  it('la récolte en attaque combinée ne rend jamais un demi-tour', () => {
    let seen = 0;
    for (let s = 1; s <= 300; s++) {
      const input = {
        poi: p,
        escort: esc,
        road: NUS,
        hero: null,
        seed: s,
        playerLevel: 20,
        pantheonLevel: 20,
      };
      if (resolveHarvestParty(input).turnBack === undefined) continue;
      seen++;
      const c = resolveHarvestParty({ ...input, combined: true });
      expect(c.turnBack).toBeUndefined();
      expect(c.party?.turnedBack).toBeFalsy();
    }
    expect(seen, 'aucun demi-tour : le test ne prouve rien').toBeGreaterThan(10);
  });
});
