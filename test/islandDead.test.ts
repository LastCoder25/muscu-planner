import { describe, expect, it } from 'vitest';
import { archipelOn, islandPacified, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { createMap, poiLabel, type ExpeditionMap, type Poi } from '@/lib/expedition';
import {
  captureControl,
  collectControl,
  controlIdOf,
  controlLootMessage,
  ensureControls,
  ALL_CONTROL_KINDS,
} from '@/lib/controlPoints';
import {
  FORTRESS_ID,
  EMBER,
  ensureIslandConquest,
  islandConquest,
  emberStatus,
  islandTargetLabel,
  razeIslandTarget,
} from '@/lib/islandConquest';
import { characterRank } from '@/lib/characterRank';
import { harvestOver } from './helpers/controlHarvest';

const NOW = Date.UTC(2026, 9, 2, 12);
const H = 3600_000;
const DAY = 24 * H;
const LV = 50;

function islandMap(id = 3, L = LV): ExpeditionMap {
  const m = createMap(5, NOW, L, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, L, ISLAND_OUTPOST_LEVEL), NOW, L);
}
const tick = (m: ExpeditionMap, t: number) => ensureIslandConquest(m, t, LV);
const objectives = (m: ExpeditionMap): Poi[] =>
  m.pois.filter((p) => p.control?.kind === 'objective' && p.control.owner === 'enemy');
const KEY = 'isl_obj_2';

describe('🕯️ l’île 3 : les objectifs battus s’éteignent', () => {
  /** `n` sorties arrivées, une par minute à partir de `from`. */
  const withDepartures = (m: ExpeditionMap, from: number, n: number): ExpeditionMap => ({
    ...m,
    departures: [...(m.departures ?? []), ...Array.from({ length: n }, (_, i) => from + i * 60_000)],
  });
  const ember = (m: ExpeditionMap, id: string) => m.archipel!.embers?.[id];

  it('deux cimetières et la citadelle des morts (troupe 4)', () => {
    const o = objectives(islandMap());
    expect(o.map((p) => p.control!.name)).toEqual([
      'Cimetière',
      'Cimetière',
      'Citadelle des morts',
    ]);
    expect(o.find((p) => p.id === KEY)!.control!.size).toBe(4);
    expect(o.filter((p) => p.id !== KEY).every((p) => p.control!.size === 3)).toBe(true);
    expect(o.every((p) => p.control!.razes === true)).toBe(true);
  });
  it('un cimetière battu s’éteint : il quitte la carte, compte abattu, reçoit une braise', () => {
    let m = razeIslandTarget(islandMap(), 'isl_obj_0', NOW + H);
    m = tick(m, NOW + H);
    expect(objectives(m)).toHaveLength(2);
    expect(m.pois.some((p) => p.id === 'isl_obj_0')).toBe(false);
    expect(m.archipel!.destroyed).toContain('isl_obj_0');
    const e = ember(m, 'isl_obj_0')!;
    expect(e.at).toBe(NOW + H);
    expect(e.charge).toBe(0);
    expect(e.need).toBeGreaterThanOrEqual(EMBER.cemetery.min);
    expect(e.need).toBeLessThanOrEqual(EMBER.cemetery.max);
    expect(tick(m, NOW + H)).toBe(m);
  });
  it('il se rallume après `need` sorties, jamais avant le plancher de 24 h', () => {
    let m = tick(razeIslandTarget(islandMap(), 'isl_obj_0', NOW + H), NOW + H);
    const need = ember(m, 'isl_obj_0')!.need;
    // need - 1 sorties : encore éteint, même longtemps après.
    const short = tick(withDepartures(m, NOW + 2 * H, need - 1), NOW + 10 * DAY);
    expect(objectives(short).map((p) => p.id)).not.toContain('isl_obj_0');
    expect(ember(short, 'isl_obj_0')!.charge).toBe(need - 1);
    // need sorties dans la foulée : prêt, mais retenu par le plancher.
    m = withDepartures(m, NOW + 2 * H, need);
    const early = tick(m, NOW + 5 * H);
    expect(objectives(early).map((p) => p.id)).not.toContain('isl_obj_0');
    expect(emberStatus(early).find((s) => s.id === 'isl_obj_0')!.left).toBe(0);
    expect(early.archipel!.destroyed).toContain('isl_obj_0');
    // le plancher passé : il revient, debout, ennemi, hors de `destroyed`, sans braise.
    const late = tick(m, NOW + H + EMBER.floorMs);
    const back = late.pois.find((p) => p.id === 'isl_obj_0')!;
    expect(back.control!.owner).toBe('enemy');
    expect(late.archipel!.destroyed ?? []).not.toContain('isl_obj_0');
    expect(ember(late, 'isl_obj_0')).toBeUndefined();
    expect(tick(late, NOW + H + EMBER.floorMs)).toBe(late);
  });
  it('les sorties d’avant l’extinction ne comptent pas', () => {
    let m = withDepartures(islandMap(), NOW - 12 * H, 20);
    m = tick(razeIslandTarget(m, 'isl_obj_0', NOW + H), NOW + 5 * DAY);
    expect(ember(m, 'isl_obj_0')!.charge).toBe(0);
    expect(objectives(m).map((p) => p.id)).not.toContain('isl_obj_0');
  });
  it('la citadelle éteinte gèle les cimetières ; rallumée, ils recomptent', () => {
    let m = razeIslandTarget(islandMap(), 'isl_obj_0', NOW + H);
    m = tick(razeIslandTarget(m, KEY, NOW + H), NOW + H);
    expect(emberStatus(m).find((s) => s.id === 'isl_obj_0')!.frozen).toBe(true);
    // 30 sorties : la citadelle (10 à 15) est prête, les cimetières n'ont rien compté.
    m = withDepartures(m, NOW + 2 * H, 30);
    const frozen = tick(m, NOW + 6 * H);
    expect(ember(frozen, 'isl_obj_0')!.charge).toBe(0);
    expect(objectives(frozen).map((p) => p.id)).toEqual(['isl_obj_1']);
    // le plancher passé : la citadelle revient, le cimetière reste éteint (charge 0).
    const later = tick(m, NOW + 3 * DAY);
    expect(objectives(later).map((p) => p.id)).toEqual(['isl_obj_1', KEY]);
    expect(ember(later, 'isl_obj_0')!.charge).toBe(0);
    expect(emberStatus(later).find((s) => s.id === 'isl_obj_0')!.frozen).toBe(false);
  });
  it('la forteresse abattue pacifie : tout compté abattu, braises effacées, rien ne revient', () => {
    let m = razeIslandTarget(islandMap(), 'isl_obj_0', NOW + DAY);
    m = razeIslandTarget(m, FORTRESS_ID, NOW + 2 * DAY);
    expect(islandPacified(m)).toBe(true);
    expect(m.archipel!.embers).toBeUndefined();
    expect(m.archipel!.destroyed).toEqual(
      expect.arrayContaining(['isl_obj_0', 'isl_obj_1', KEY, FORTRESS_ID]),
    );
    m = tick(withDepartures(m, NOW + 3 * DAY, 40), NOW + 30 * DAY);
    expect(objectives(m)).toHaveLength(0);
    expect(emberStatus(m)).toEqual([]);
  });
  it('les autres îles n’ont pas de braises', () => {
    let m = razeIslandTarget(islandMap(1, 20), 'isl_obj_0', NOW + H);
    m = tick(m, NOW + 30 * DAY);
    expect(m.archipel!.destroyed).toContain('isl_obj_0');
    expect(m.archipel!.embers).toBeUndefined();
    expect(m.archipel!.razedAt).toBeUndefined();
    expect(emberStatus(m)).toEqual([]);
  });
  it('la fiche le dit', () => {
    const m = razeIslandTarget(islandMap(), 'isl_obj_0', NOW + H);
    expect(islandTargetLabel(m, 'isl_obj_1')!.detail).toContain('s’ÉTEINT');
    expect(islandTargetLabel(m, 'isl_obj_1')!.detail).toContain('éteints ouvrent la forteresse');
    expect(islandTargetLabel(m, KEY)!.detail).toContain('s’ÉTEINT');
    expect(islandTargetLabel(m, KEY)!.detail).toContain('cimetières ne se rallument plus');
  });
});

// ⚱️ L'ossuaire est passé sur l'île 2 (2026-10-03) : la 1re ascension tombe au niveau 10, les
// sceaux de champion servent dès la 2e île.
describe('⚱️ l’ossuaire, sur l’île 2', () => {
  it('l’île 3 n’a plus d’ossuaire ; l’île 2 le porte', () => {
    const k3 = islandMap().pois.flatMap((p) => (p.control ? [p.control.kind] : []));
    expect(k3).not.toContain('ossuary');
    const fixed3 = k3.filter((x) => (ALL_CONTROL_KINDS as string[]).includes(x));
    expect(fixed3).not.toContain('mine');
    expect(fixed3).not.toContain('mana');
    const k2 = islandMap(2, 40).pois.flatMap((p) => (p.control ? [p.control.kind] : []));
    expect(k2).toContain('ossuary');
  });
  it('tenu à 3, 4,5 × (1 + rang du joueur) sceaux de champion tous les 3 jours', () => {
    const id = controlIdOf('ossuary');
    let m = islandMap(2, LV);
    expect(poiLabel(m.pois.find((p) => p.id === id)!)).toContain('Ossuaire');
    m = captureControl(m, id, ['a', 'b', 'c'], NOW, 7);
    const got = harvestOver(m, id, NOW, 12 * 24, LV);
    // 18 sceaux en 12 jours en Bronze (9 × 288 h / 144 h, au rythme de l’arsenal depuis le
    // 2026-10-08 ; 4 avant), × (1 + rang) au-dessus (l’ossuaire suit le niveau du héros) ; au
    // cran du jour du point, d’où la marge basse.
    const k = 1 + characterRank(LV).rankIndex;
    expect(got.champSeals).toBeGreaterThanOrEqual(13 * k);
    expect(got.champSeals).toBeLessThanOrEqual(27 * k);
    expect(collectControl(m, id, NOW + 72 * H, LV).champSealRank).toBe(characterRank(LV).rankIndex);
    expect(got.gold + got.mana + got.keys + got.runes + got.summon + got.gearSeals).toBe(0);
    const one = captureControl(islandMap(2, LV), id, ['a'], NOW, 7);
    expect(harvestOver(one, id, NOW, 12 * 24, LV).champSeals).toBeLessThan(got.champSeals);
  });
  it('le rapport dit les sceaux de champion', () => {
    const p = islandMap(2, LV).pois.find((q) => q.id === controlIdOf('ossuary'))!;
    expect(controlLootMessage(p, NOW, {}, 0, 0, 0, 0, 2)!.title).toContain('2 sceaux de champion');
  });
});
