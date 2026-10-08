// 🏛️🏚️🐺 RUINES ANCIENNES, RUINES D'UN HÉROS TOMBÉ, TANIÈRE (2026-09-27, décisions de
// l'utilisateur) : les sceaux ne viennent plus que des ruines anciennes (gardées), les failles
// ne rendent que du mana, les camps l'XP et la ressource de leur faction ; les ruines d'un
// héros tombé rendent des consommables sans combat ; la tanière, une bête seule au rang
// au-dessus du joueur, qu'on abat en surnombre, beaucoup d'XP.
import { describe, expect, it } from 'vitest';
import { resolveHarvestParty } from '@/lib/harvestParty';
import { resolveCamp } from '@/lib/camp';
import { campBodyCount, campWinPct } from '@/lib/camp';
import { poiDifficultyLevel } from '@/lib/expedition';
import {
  CARAVAN,
  DEN_XP_MULT,
  partyAllies,
  missionXp,
  missionXpFor,
  refAdvGear,
  refChampionAdv,
  type PartyHero,
} from '@/lib/caravan';
import {
  RUINS_SEALS,
  ruinsChampionSeals,
  advanceWorld,
  campSpecOf,
  createMap,
  denLevelFor,
  fallenSupplyCount,
  harvestGuardOf,
  ruinsSealKind,
  ruinsSeals,
  type Poi,
} from '@/lib/expedition';
import { partyCapFor, partySendBlocker } from '@/lib/party';
import { CAMP_SAMPLE_MULT, partyWinChance } from '@/lib/partyForecast';
import { characterRank } from '@/lib/characterRank';
import { levelForDifficulty } from '@/lib/poiDifficulty';
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

describe('🏛️ les ruines anciennes : la seule source de sceaux', () => {
  it('une ruine sur deux garde des sceaux de champion, l’autre des sceaux d’objet', () => {
    let champ = 0;
    for (let i = 0; i < 400; i++) if (ruinsSealKind({ id: `r${i}` }) === 'champion') champ++;
    expect(champ).toBeGreaterThan(160);
    expect(champ).toBeLessThan(240);
  });
  it('champion : au rang du LIEU · objet : selon le rang du JOUEUR', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `r${i}`);
    const c = ids.find((id) => ruinsSealKind({ id }) === 'champion')!;
    const g = ids.find((id) => ruinsSealKind({ id }) === 'gear')!;
    expect(ruinsSeals({ id: c, level: 25 }, 60)).toEqual({
      kind: 'champion',
      rank: characterRank(25).rankIndex,
      n: ruinsChampionSeals(25),
    });
    const s = ruinsSeals({ id: g, level: 25 }, 35);
    expect(s.kind).toBe('gear');
    expect(s.n).toBe(RUINS_SEALS.gearPerRank * (1 + characterRank(35).rankIndex));
  });
  it('gardées, et plus fort qu’une mine', () => {
    for (let i = 0; i < 40; i++) {
      const g = harvestGuardOf(poi('ruins', { id: `r${i}`, level: 30 }));
      expect(g).not.toBeNull();
      expect(g!.size).toBeGreaterThanOrEqual(2);
    }
  });
  it('une victoire rend les sceaux, une défaite rien', () => {
    let won = 0;
    let lost = 0;
    for (let s = 1; s <= 40; s++) {
      const p = poi('ruins', { id: `r${s}` });
      const out = resolveHarvestParty({
        poi: p,
        escort: team(s % 2 ? 4 : 1),
        road,
        hero: null,
        seed: s,
        playerLevel: 26,
        pantheonLevel: 26,
      });
      // 🔙 Un demi-tour n'atteint pas les ruines : il compte comme une défaite.
      const guardsDown = !out.party!.turnedBack && out.party!.slain === out.party!.foes;
      if (guardsDown) {
        won++;
        expect(out.seals).toEqual(ruinsSeals(p, 26));
      } else {
        lost++;
        expect(out.seals).toBeUndefined();
      }
    }
    expect(won).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  });
  it('avec le héros aussi', () => {
    const p = poi('ruins', { id: 'rh' });
    const out = resolveHarvestParty({
      poi: p,
      escort: team(3),
      road,
      hero,
      seed: 3,
      playerLevel: 26,
      pantheonLevel: 26,
    });
    if (out.party!.slain === out.party!.foes) expect(out.seals).toEqual(ruinsSeals(p, 26));
  });
});

describe('🔱 le débit de sceaux reste celui d’avant — mesuré sur de vraies cartes', () => {
  // Avant : chaque camp ou repaire pris rendait 1 + rang sceaux d'objet ; chaque faille
  // refermée 1,5 sceau de champion en moyenne. On compte les lieux apparus sur la même carte.
  for (const L of [12, 30, 60]) {
    it(`niveau ${L}`, () => {
      const seen = new Map<string, Poi>();
      const days = 14;
      for (let g = 1; g <= 6; g++) {
        let m = createMap(g * 7919, 0, L, L);
        for (let t = 0; t <= days * 24; t++) {
          m = advanceWorld(m, t * 3600_000, L, L);
          for (const p of m.pois) if (!seen.has(p.id)) seen.set(p.id, p);
        }
      }
      const perDay = (n: number) => n / 6 / days;
      const all = [...seen.values()];
      const r = 1 + characterRank(L).rankIndex;
      const avantObjet =
        perDay(all.filter((p) => p.type === 'camp' || p.type === 'lair').length) * r;
      const avantChamp = perDay(all.filter((p) => p.type === 'rift').length) * 1.5;
      const ruins = all.filter((p) => p.type === 'ruins');
      const objet = perDay(
        ruins
          .filter((p) => ruinsSealKind(p) === 'gear')
          .reduce((s, p) => s + ruinsSeals(p, L).n, 0),
      );
      const champ = perDay(
        ruins
          .filter((p) => ruinsSealKind(p) === 'champion')
          .reduce((s, p) => s + ruinsSeals(p, L).n, 0),
      );
      expect(objet / avantObjet).toBeGreaterThan(0.75);
      expect(objet / avantObjet).toBeLessThan(1.3);
      // 🔱 v1.89.0 : les sceaux de champion suivent le rang de la ruine (3 × (1 + rang)) —
      // demandé, le vivier grossit avec le niveau. Mesuré : ×2,7 / ×2,6 / ×3,1 le débit des
      // failles d'avant aux niveaux 12 / 30 / 60.
      expect(champ / avantChamp).toBeGreaterThan(2);
      expect(champ / avantChamp).toBeLessThan(4);
    });
  }
});

describe('🕳️⚔️ ni les failles ni les camps ne rendent de sceaux', () => {
  it('un camp ou un repaire pris : pas de sceau', () => {
    for (const type of ['camp', 'lair'] as const)
      for (let s = 1; s <= 20; s++) {
        const p = poi(type, { id: `c${s}` });
        const out = resolveCamp({
          poi: p,
          spec: campSpecOf(p)!,
          escort: team(6),
          road,
          hero: null,
          seed: s,
          playerLevel: 26,
          pantheonLevel: 26,
        });
        expect(out.seals).toBeUndefined();
      }
  });
});

describe('🏚️ les ruines d’un héros tombé', () => {
  it('personne ne les garde, on en revient toujours avec des consommables', () => {
    const p = poi('fallen', { id: 'f1', level: 45 });
    expect(harvestGuardOf(p)).toBeNull();
    const out = resolveHarvestParty({
      poi: p,
      escort: team(1),
      road,
      hero: null,
      seed: 5,
      playerLevel: 45,
      pantheonLevel: 45,
    });
    const n = Object.values(out.supplies ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    // Au moins la fouille (un consommable de route peut s'y ajouter).
    expect(n).toBeGreaterThanOrEqual(fallenSupplyCount(45));
    expect(out.seals).toBeUndefined();
  });
  it('plus on va profond, plus on en trouve', () => {
    expect(fallenSupplyCount(1)).toBe(2);
    expect(fallenSupplyCount(60)).toBe(4);
  });
});

describe('🐺 la tanière', () => {
  it('une bête SEULE : un seul corps à abattre', () => {
    const p = poi('den');
    const spec = campSpecOf(p)!;
    expect(spec).toMatchObject({ faction: 'betes', lone: true });
    expect(campBodyCount(spec)).toBe(1);
    const out = resolveCamp({
      poi: p,
      spec,
      escort: team(2),
      road,
      hero: null,
      seed: 1,
      playerLevel: 26,
      pantheonLevel: 26,
    });
    expect(out.party!.foes).toBe(1);
  });
  it('aucun plafond : ni le Panthéon ni la taille du groupe ne la bornent', () => {
    // 2026-10-01, décision de l'utilisateur : « un monstre qui donne de l'XP et qui peut être
    // attaqué en surnombre ».
    const p = poi('den');
    expect(partyCapFor(10, p)).toBe(Number.POSITIVE_INFINITY);
    expect(partySendBlocker(p, 5, false, 10, 0.5, 0)).toBeNull();
    expect(partySendBlocker(p, 40, true, 10, 0.5, 0)).toBeNull();
    // Ailleurs, le Panthéon borne toujours.
    expect(partySendBlocker(poi('camp'), 11, false, 10, 0.5, 0)).toBe('tooMany');
  });
  it('la bête garde sa force, quel que soit le nombre envoyé', () => {
    const p = poi('den', { id: 'den_x', level: 45 });
    const base = campSpecOf(p)!;
    expect(base.size).toBe(2);
    // Le surnombre paie : six champions la battent bien plus sûrement qu'un duo.
    const kit = (n: number) => ({ advGear: refAdvGear(45, n) });
    const duo = partyWinChance(p, team(2, 45), kit(2), null, 0, 40)!;
    const six = partyWinChance(p, team(6, 45), kit(6), null, 0, 40)!;
    expect(six).toBeGreaterThan(0.97);
    expect(six).toBeGreaterThan(duo);
    // Le % AFFICHÉ affronte la MÊME bête que le combat : celle de base.
    const allies = partyAllies(team(6, 45), kit(6), null);
    expect(campWinPct(p, base, allies, 40 * CAMP_SAMPLE_MULT)).toBe(six);
  }, 60000);
  it('elle apparaît au rang AU-DESSUS du joueur, et son rang affiché le dit', () => {
    for (const L of [15, 30, 55, 80]) {
      const r = characterRank(L).rankIndex;
      for (const id of ['den_a', 'den_b', 'den_c', 'den_d']) {
        const lv = denLevelFor(id, L);
        expect(lv).toBeGreaterThan(L);
        expect(characterRank(lv).rankIndex).toBe(r + 1);
      }
    }
    // Sur une vraie carte : la difficulté affichée d'une tanière dépasse le rang du joueur.
    const L = 35;
    let seen = 0;
    for (let s = 1; s <= 40 && seen < 3; s++) {
      let map = createMap(s, 0, L, 0);
      for (let t = 1; t <= 14; t++) map = advanceWorld(map, t * 86_400_000, L, 0);
      for (const d of map.pois.filter((p) => p.type === 'den')) {
        seen++;
        expect(characterRank(poiDifficultyLevel(d)).rankIndex).toBe(characterRank(L).rankIndex + 1);
      }
    }
    expect(seen).toBeGreaterThan(0);
  }, 60000);
  it('un combat difficile, gagné en surnombre — et plus d’XP qu’un camp', () => {
    const L = 35;
    const id = 'den_q';
    const den = poi('den', { id, level: levelForDifficulty(denLevelFor(id, L), 2) });
    const win = (n: number, lv: number) =>
      partyWinChance(den, team(n, lv), { advGear: refAdvGear(lv, n) }, null, 0, 40, false)!;
    expect(win(3, L)).toBeLessThan(0.2);
    expect(win(10, L)).toBeGreaterThan(0.95);
    const camp = poi('camp', { id: 'camp_q', level: L });
    const denXp = missionXpFor(team(8, L), den, true, {}, L, false, null).a0!;
    const campXp = missionXpFor(team(3, L), camp, true, {}, L, false, null).a0!;
    expect(denXp).toBeGreaterThan(2 * campXp);
  }, 60000);
  it('beaucoup d’XP — sur une victoire seulement', () => {
    // Champion au niveau de la tanière : ni prime de danger ni rendement décroissant. Une
    // victoire vaut alors DEN_XP_MULT fois le socle, une défaite sa part (sans le multiplicateur).
    const den = poi('den', { id: 'x' });
    const a = { ...team(1)[0]!, level: poiDifficultyLevel(den) };
    const ratio = missionXp(a, den, true) / missionXp(a, den, false);
    expect(ratio).toBeCloseTo(DEN_XP_MULT / CARAVAN.xpLossShare, 0);
    expect(DEN_XP_MULT, 'la tanière doit valoir le détour').toBeGreaterThanOrEqual(2);
  });
});
