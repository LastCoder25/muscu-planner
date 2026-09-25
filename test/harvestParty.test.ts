import { describe, expect, it } from 'vitest';
import { resolveHarvestParty } from '@/lib/harvestParty';
import {
  caravanHaulMult,
  missionXpFor,
  partyAllies,
  refAdvGear,
  refChampionAdv,
  resolveCaravan,
  type PartyHero,
} from '@/lib/caravan';
import { campWinPct, fightCampForce } from '@/lib/camp';
import {
  HARVEST_GUARD_RAMP,
  HARVEST_GUARD_SIZES,
  HARVEST,
  HARVEST_TYPES,
  goldCost,
  harvestGold,
  harvestGuardOf,
  poiRewardLevel,
  resolveOutcome,
  type Poi,
} from '@/lib/expedition';
import { refFighter } from '@/lib/proceduralContent';
import type { Adventurer } from '@/lib/adventurers';

const poi = (type: Poi['type'], over: Partial<Poi> = {}): Poi => ({
  id: 'p_' + type,
  type,
  level: 26,
  x: 60,
  y: 60,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const team = (n: number, L = 26): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refChampionAdv(L, i),
    id: `a${i}`,
    gear: {
      weapon: `refGear${i}weapon`,
      armor: `refGear${i}armor`,
      accessory: `refGear${i}accessory`,
      relic: `refGear${i}relic`,
    },
  }));
const road = { advGear: refAdvGear(26, 3) };
const hero: PartyHero = { name: 'H', level: 26, combatant: refFighter(26) };

describe('🪙 héros ou non, l’or d’une récolte est le même (v0.1161)', () => {
  // Avant, une mine payait sa formule pleine au héros et 30 % de son coût à une équipe :
  // ~90 fois moins pour le même lieu. Une seule règle désormais (`harvestGold`) ; seuls les
  // aléas du voyage diffèrent (rencontres du héros ; embuscades, rôles et bâts d'une équipe).
  const moyenne = (p: Poi, avecHeros: boolean, L = 26) => {
    let s = 0;
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const o = resolveHarvestParty({
        poi: p,
        escort: avecHeros ? team(1, L) : team(3, L),
        road: { advGear: [] },
        hero: avecHeros ? { ...hero, level: L, combatant: refFighter(L) } : null,
        seed,
        playerLevel: L,
        pantheonLevel: L,
      });
      if (!o.win && o.gold === 0) continue; // repoussés par les gardes : rien des deux côtés
      s += o.gold;
      n++;
    }
    return s / n;
  };

  it('une MINE rapporte autant à une équipe qu’au héros (aux aléas du voyage près)', () => {
    for (const L of [12, 26, 60]) {
      const p = poi('mine', { level: L });
      const ratio = moyenne(p, false, L) / moyenne(p, true, L);
      expect(ratio, `niveau ${L} : équipe/héros ${ratio.toFixed(2)}`).toBeGreaterThan(0.9);
      expect(ratio, `niveau ${L} : équipe/héros ${ratio.toFixed(2)}`).toBeLessThan(1.15);
    }
  });

  it('les deux chemins partent de la MÊME base : `harvestGold`', () => {
    // Le héros : or de base × ses rencontres de trajet ; une équipe : × son voyage (`k`).
    // Sur une route calme, l'équipe touche exactement la base — son rôle 🐫 de cargaison
    // (présent dans l'équipe de référence) ne touche PAS l'or, comme avec le héros.
    const p = poi('mine');
    let calmes = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const c = resolveCaravan(p, team(3), seed, { advGear: [] }, 26, 26);
      if (!c.events.every((e) => e.kind === 'calme')) continue;
      calmes++;
      expect(caravanHaulMult(team(3), [], 0)).toBeGreaterThan(1);
      expect(c.gold).toBe(harvestGold(p, 26));
    }
    expect(calmes).toBeGreaterThan(0);
  });

  it('le plancher de début de partie vaut pour une équipe comme pour le héros', () => {
    // Au niveau 5, une mine de difficulté 1 paie comme une difficulté 5 — au héros ET à une
    // équipe. Oublier de passer le niveau du joueur au convoi referait diverger les deux.
    const p = poi('mine', { level: 1 });
    expect(poiRewardLevel(p)).toBeLessThan(5);
    expect(harvestGold(p, 5)).toBeGreaterThan(harvestGold(p, undefined));
    let vus = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const input = {
        poi: p,
        escort: team(3, 5),
        road: { advGear: [] },
        hero: null,
        seed,
        playerLevel: 5,
        pantheonLevel: 5,
      };
      const o = resolveHarvestParty(input);
      const c = resolveCaravan(p, input.escort, seed, input.road, 5, 5);
      if (!o.win && o.gold === 0) continue;
      vus++;
      expect(o.gold).toBe(c.gold);
    }
    expect(vus).toBeGreaterThan(0);
  });

  it('hors mine, la même part symbolique du coût pour tout le monde', () => {
    for (const t of ['well', 'shrine', 'archive'] as const) {
      const p = poi(t);
      expect(harvestGold(p, 26)).toBe(
        Math.round(goldCost(t, poiRewardLevel(p)) * HARVEST.goldShare),
      );
    }
  });
});

describe('🧺 une équipe sur un lieu de récolte', () => {
  it('SANS le héros, gardes abattus : c’est le convoi — même cargaison, même route, XP + gardes', () => {
    let vus = 0;
    for (const t of ['well', 'mine', 'shrine', 'archive'] as const)
      for (const seed of [1, 7, 42]) {
        const p = poi(t);
        const input = {
          poi: p,
          escort: team(3),
          road,
          hero: null,
          seed,
          playerLevel: 26,
          pantheonLevel: 26,
        };
        const g = fightCampForce({ ...input, spec: harvestGuardOf(p)! });
        if (!g.skirmish.win) continue;
        vus++;
        const c = resolveCaravan(p, team(3), seed, road, 26, 26);
        const o = resolveHarvestParty(input);
        expect(o.gold, t).toBe(c.gold);
        expect(o.energy, t).toBe(c.energy);
        expect(o.summonStones, t).toBe(c.summonStones);
        expect(o.key, t).toBe(c.keys);
        for (const [id, v] of Object.entries(c.xp))
          expect(o.party!.xp[id]).toBe(v + Math.round(g.shares[id] ?? 0));
        expect(o.party!.hurt).toEqual(c.hurt);
        expect(o.party!.hero).toBe(false);
      }
    expect(vus).toBeGreaterThan(6); // un trio de son niveau prend presque toujours les gardes
  });

  it('⚠️ 💠 une mine de mana rapporte ENFIN du mana en équipe — le convoi n’en rendait pas', () => {
    const o = resolveHarvestParty({
      poi: poi('mana_mine'),
      escort: team(3),
      road,
      hero: null,
      seed: 3,
      playerLevel: 26,
      pantheonLevel: 26,
    });
    expect(o.mana).toBeGreaterThan(0);
  });

  it('la victoire = aucune embuscade PERDUE', () => {
    // Un champion seul sur une route dangereuse perd ses embuscades (0 % mesuré).
    let perdu = false;
    for (let s = 1; s < 40 && !perdu; s++) {
      const o = resolveHarvestParty({
        poi: poi('well', { perilous: true }),
        escort: team(1),
        road,
        hero: null,
        seed: s,
        playerLevel: 26,
        pantheonLevel: 26,
      });
      if (!o.party!.win) perdu = true;
    }
    expect(perdu).toBe(true);
  });

  it('AVEC le héros : son expédition, et le champion qui l’accompagne apprend', () => {
    const p = poi('mine');
    const o = resolveHarvestParty({
      poi: p,
      escort: team(1),
      road,
      hero,
      seed: 9,
      playerLevel: 26,
      pantheonLevel: 26,
    });
    const solo = resolveOutcome(hero.combatant, p, 9, 26);
    expect(o.gold).toBe(solo.gold);
    expect(o.energy).toBe(solo.energy);
    expect(o.party!.hero).toBe(true);
    expect(o.party!.xp.a0).toBeGreaterThan(0);
    expect(o.party!.hurt).toEqual([]);
  });
});

describe('🛡️ les gardes d’un lieu de récolte (2026-09-22)', () => {
  it('tous les lieux de récolte sont gardés — et eux seuls', () => {
    for (const t of HARVEST_TYPES) expect(harvestGuardOf(poi(t)), t).not.toBeNull();
    for (const t of ['camp', 'lair', 'rift', 'arena'] as const)
      expect(harvestGuardOf(poi(t)), t).toBeNull();
  });

  it('la force est celle d’un petit camp (1-2 champions), dérivée de l’id, déterministe', () => {
    const sizes = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const p = poi('shrine', { id: 'g' + i });
      const g = harvestGuardOf(p)!;
      expect(harvestGuardOf({ ...p, x: 1, distNorm: 0.9 })).toEqual(g);
      expect(HARVEST_GUARD_SIZES).toContain(g.size);
      sizes.add(g.size);
    }
    expect([...sizes].sort()).toEqual([...HARVEST_GUARD_SIZES].sort());
  });

  it('🌱 rampe de début de partie : plus petits jusqu’au niveau 7, pleins ensuite', () => {
    const at = (level: number) => harvestGuardOf(poi('mine', { id: 'g1', level }))!.size;
    const full = at(30);
    expect(at(1)).toBeCloseTo(full * HARVEST_GUARD_RAMP.start);
    for (let l = 2; l <= 7; l++) expect(at(l)).toBeGreaterThan(at(l - 1));
    expect(at(7)).toBe(full);
    expect(at(8)).toBe(full);
  });

  it('défaite : RIEN n’est récolté, XP de défaite, les tombés à l’infirmerie', () => {
    let vu = false;
    for (let s = 1; s < 80 && !vu; s++) {
      const p = poi('mine', { id: 'dur' + s });
      if (harvestGuardOf(p)!.size < 2) continue;
      const o = resolveHarvestParty({
        poi: p,
        escort: team(1),
        road,
        hero: null,
        seed: s,
        playerLevel: 26,
        pantheonLevel: 26,
      });
      if (o.party!.win) continue;
      vu = true;
      expect(o.win).toBe(false);
      expect(o.gold + o.energy + o.summonStones + o.mana + o.key).toBe(0);
      expect(o.party!.hurt).toEqual(['a0']);
      expect(o.party!.xp.a0).toBeGreaterThan(0);
      expect(o.party!.xp.a0).toBeLessThan(missionXpFor(team(1), p, true, {}, 26).a0!);
    }
    expect(vu).toBe(true);
  });

  it('⚠️ le héros SEUL affronte aussi les gardes — une défaite ne récolte rien', () => {
    const faible: PartyHero = { name: 'H', level: 3, combatant: refFighter(3) };
    let vu = false;
    for (let s = 1; s < 80 && !vu; s++) {
      const p = poi('shrine', { id: 'h' + s, level: 26 });
      const o = resolveHarvestParty({
        poi: p,
        escort: [],
        road,
        hero: faible,
        seed: s,
        playerLevel: 26,
        pantheonLevel: 26,
      });
      if (o.party!.win) continue;
      vu = true;
      expect(o.gold + o.summonStones + o.energy).toBe(0);
    }
    expect(vu).toBe(true);
  });

  it('🎯 le % affiché est celui du combat réel (même choc, graines disjointes)', () => {
    const p = poi('mine', { id: 'pct' });
    const spec = harvestGuardOf(p)!;
    const allies = partyAllies(team(1), road, null);
    const pct = campWinPct(p, spec, allies, 200);
    let w = 0;
    const N = 200;
    for (let s = 1; s <= N; s++)
      if (
        resolveHarvestParty({
          poi: p,
          escort: team(1),
          road,
          hero: null,
          seed: s,
          playerLevel: 26,
          pantheonLevel: 26,
        }).party!.win
      )
        w++;
    // La victoire de la récolte exige AUSSI de tenir la route : elle ne dépasse pas le %.
    expect(w / N).toBeLessThanOrEqual(pct + 0.08);
    expect(Math.abs(w / N - pct)).toBeLessThan(0.35);
  });

  it('plus l’équipe est grande, mieux elle prend les gardes', () => {
    const p = poi('archive', { id: 'grad' });
    const spec = { ...harvestGuardOf(p)!, size: 2 };
    const pc = (n: number) => campWinPct(p, spec, partyAllies(team(n), road, null), 60);
    expect(pc(1)).toBeLessThan(0.2);
    expect(pc(3)).toBeGreaterThan(0.9);
  });
});
