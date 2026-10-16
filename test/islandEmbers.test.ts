import { describe, expect, it } from 'vitest';
import { archipelOn, islandPacified, ISLAND_OUTPOST_LEVEL } from '@/lib/archipelago';
import { advanceWorld, createMap, EXPE, type ExpeditionMap } from '@/lib/expedition';
import { ensureControls } from '@/lib/controlPoints';
import {
  EMBER,
  FORTRESS_ID,
  emberGhosts,
  emberNeed,
  emberStatus,
  emberText,
  ensureIslandConquest,
  heldRazedObjectives,
  islandConquest,
  objectiveSpot,
  razeIslandTarget,
  takeObjective,
} from '@/lib/islandConquest';
import { buildDeployment } from '@/lib/deployPlan';
import { CHAMPIONS } from '@/data/champions';
import type { Adventurer } from '@/lib/adventurers';

/**
 * 🕯️ LES OBJECTIFS ÉTEINTS DE L'ÎLE 3 (décision de l'utilisateur, 2026-10-16) : battus, ils
 * ne se prennent pas, ils s'éteignent ; ils se rallument après un nombre de SORTIES (le même
 * pour tous), jamais avant 24 h ; la citadelle éteinte gèle les cimetières.
 */
const NOW = Date.UTC(2026, 9, 16, 12);
const H = 3600_000;
const LV = 50;
const C0 = 'isl_obj_0';
const C1 = 'isl_obj_1';
const KEY = 'isl_obj_2';

function island3(id = 3, lv = LV): ExpeditionMap {
  const m = createMap(5, NOW, lv, ISLAND_OUTPOST_LEVEL, undefined, archipelOn(id));
  return ensureIslandConquest(ensureControls(m, NOW, lv, ISLAND_OUTPOST_LEVEL), NOW, lv);
}
const tick = (m: ExpeditionMap, t: number) => ensureIslandConquest(m, t, LV);
/** `n` sorties arrivées à `from`, `from + step`… */
const sorties = (m: ExpeditionMap, from: number, n: number, step = H): ExpeditionMap => ({
  ...m,
  departures: [...(m.departures ?? []), ...Array.from({ length: n }, (_, i) => from + i * step)],
});
const onMap = (m: ExpeditionMap, id: string) => m.pois.some((p) => p.id === id);
const lit = (m: ExpeditionMap, id: string) => !m.archipel!.destroyed?.includes(id) && onMap(m, id);

describe('🕯️ un objectif battu s’éteint', () => {
  it('il quitte la carte, compte comme abattu, reçoit une braise dans la fourchette', () => {
    const m = tick(razeIslandTarget(island3(), C0, NOW), NOW);
    expect(onMap(m, C0)).toBe(false);
    expect(islandConquest(m)!.objectivesDown).toBe(1);
    const e = m.archipel!.embers![C0]!;
    expect(e.at).toBe(NOW);
    expect(e.charge).toBe(0);
    expect(e.need).toBeGreaterThanOrEqual(EMBER.cemetery.min);
    expect(e.need).toBeLessThanOrEqual(EMBER.cemetery.max);
    const k = razeIslandTarget(island3(), KEY, NOW).archipel!.embers![KEY]!;
    expect(k.need).toBeGreaterThanOrEqual(EMBER.keystone.min);
    expect(k.need).toBeLessThanOrEqual(EMBER.keystone.max);
  });
  it('les objectifs de l’île 3 s’abattent : prendre n’y laisse personne', () => {
    const m0 = island3();
    expect(m0.pois.find((p) => p.id === C0)!.control!.razes).toBe(true);
    const m = takeObjective(m0, C0, ['a', 'b', 'c'], NOW);
    expect(onMap(m, C0)).toBe(false);
    expect(m.archipel!.embers![C0]).toBeDefined();
  });
  it('les fourchettes de sorties sont bien tirées dans toute leur largeur', () => {
    const got = new Set(Array.from({ length: 400 }, (_, i) => emberNeed(i, C0, NOW, false)));
    expect(Math.min(...got)).toBe(EMBER.cemetery.min);
    expect(Math.max(...got)).toBe(EMBER.cemetery.max);
  });
});

describe('🕯️ il se rallume au fil des sorties', () => {
  const dark = () => tick(razeIslandTarget(island3(), C0, NOW), NOW);
  it('après exactement `need` sorties (au-delà du plancher), pas une de moins', () => {
    const m = dark();
    const need = m.archipel!.embers![C0]!.need;
    const late = NOW + 2 * 24 * H;
    const before = tick(sorties(m, late, need - 1), late + need * H);
    expect(onMap(before, C0)).toBe(false);
    expect(emberStatus(before).find((s) => s.id === C0)!.left).toBe(1);
    const after = tick(sorties(m, late, need), late + need * H);
    expect(lit(after, C0)).toBe(true);
    expect(after.archipel!.embers![C0]).toBeUndefined();
    expect(islandConquest(after)!.objectivesDown).toBe(0);
  });
  it('les sorties d’AVANT l’extinction ne comptent pas', () => {
    let m = sorties(island3(), NOW - 20 * H, 15);
    m = tick(razeIslandTarget(m, C0, NOW), NOW + 30 * 24 * H);
    expect(onMap(m, C0)).toBe(false);
    expect(m.archipel!.embers![C0]!.charge).toBe(0);
  });
  it('le temps seul ne rallume rien : qui ne sort pas garde ses objectifs éteints', () => {
    const m = tick(dark(), NOW + 60 * 24 * H);
    expect(onMap(m, C0)).toBe(false);
  });
  it('jamais avant le plancher : prêt en 1 h, il attend les 24 h', () => {
    const m = dark();
    const need = m.archipel!.embers![C0]!.need;
    const fast = sorties(m, NOW + 60_000, need, 60_000);
    const early = tick(fast, NOW + 2 * H);
    expect(onMap(early, C0)).toBe(false);
    const s = emberStatus(early).find((x) => x.id === C0)!;
    expect(s.left).toBe(0);
    expect(s.dueAt).toBe(NOW + EMBER.floorMs);
    expect(emberText(s, NOW + 2 * H)).toBe('se rallume dans 22 h');
    expect(lit(tick(early, NOW + EMBER.floorMs), C0)).toBe(true);
  });
  it('un rapport de victoire retraité garde la braise et ses sorties comptées', () => {
    let m = dark();
    m = tick(sorties(m, NOW + H, 3), NOW + 4 * H);
    expect(m.archipel!.embers![C0]!.charge).toBe(3);
    const again = razeIslandTarget(m, C0, NOW);
    expect(again.archipel!.embers![C0]!.charge).toBe(3);
  });
  it('rend la MÊME carte quand aucune sortie n’arrive', () => {
    const m = dark();
    expect(tick(m, NOW + H)).toBe(m);
  });
});

describe('🕯️ la citadelle éteinte gèle les cimetières', () => {
  it('ils ne comptent rien tant qu’elle est éteinte, puis reprennent', () => {
    let m = razeIslandTarget(island3(), C0, NOW);
    m = tick(razeIslandTarget(m, KEY, NOW), NOW);
    const kNeed = m.archipel!.embers![KEY]!.need;
    const t0 = NOW + 2 * 24 * H;
    // Une sortie de moins que la citadelle : de quoi rallumer un cimetière (10 au plus).
    expect(kNeed - 1).toBeGreaterThanOrEqual(EMBER.cemetery.max - 1);
    m = tick(sorties(m, t0, kNeed - 1), t0 + 20 * H);
    expect(onMap(m, C0)).toBe(false);
    expect(m.archipel!.embers![C0]!.charge).toBe(0);
    expect(emberStatus(m).find((s) => s.id === C0)!.frozen).toBe(true);
    expect(emberText(emberStatus(m).find((s) => s.id === C0)!, t0)).toContain('gelé');
    // La sortie suivante rallume la citadelle : le cimetière recommence à compter.
    const t1 = t0 + 30 * H;
    m = tick(sorties(m, t1, 1), t1 + H);
    expect(lit(m, KEY)).toBe(true);
    expect(onMap(m, C0)).toBe(false);
    const cNeed = m.archipel!.embers![C0]!.need;
    const t2 = t1 + 40 * H;
    m = tick(sorties(m, t2, cNeed), t2 + cNeed * H);
    expect(lit(m, C0)).toBe(true);
  });
  it('un cimetière prêt reste éteint tant que la citadelle l’est', () => {
    let m = tick(razeIslandTarget(island3(), C1, NOW), NOW);
    const need = m.archipel!.embers![C1]!.need;
    m = sorties(m, NOW + H, need);
    m = razeIslandTarget(m, KEY, NOW + (need + 2) * H);
    m = tick(m, NOW + 5 * 24 * H);
    expect(onMap(m, C1)).toBe(false);
    expect(emberStatus(m)[0]!.id).toBe(KEY);
  });
});

describe('🕯️ la forteresse abattue pacifie pour de bon', () => {
  it('les objectifs encore allumés tombent avec elle, plus rien ne se rallume', () => {
    let m = razeIslandTarget(island3(), C0, NOW);
    m = razeIslandTarget(m, C1, NOW);
    m = razeIslandTarget(m, FORTRESS_ID, NOW + H);
    expect(islandPacified(m)).toBe(true);
    expect(m.archipel!.embers).toBeUndefined();
    expect(islandConquest(m)!.objectivesDown).toBe(3);
    m = tick(sorties(m, NOW + 2 * 24 * H, 40), NOW + 30 * 24 * H);
    expect(m.pois.some((p) => p.control?.kind === 'objective' && p.control.owner === 'enemy')).toBe(
      false,
    );
    expect(emberStatus(m)).toEqual([]);
  });
  it('ailleurs, la règle ne change pas : il faut tous les objectifs', () => {
    let m = razeIslandTarget(island3(1, 20), 'isl_obj_0', NOW);
    m = razeIslandTarget(m, FORTRESS_ID, NOW);
    expect(islandPacified(m)).toBe(false);
    expect(m.archipel!.embers).toBeUndefined();
  });
});

describe('🕯️ les cimetières tenus d’avant', () => {
  /** Un cimetière tenu sous l'ancienne règle (garnison, compté abattu, heure de chute). */
  function legacy(garrison: string[]): ExpeditionMap {
    const m = razeIslandTarget(island3(), C0, NOW - 50 * H);
    const enemy = island3().pois.find((p) => p.id === C0)!;
    const { razes: _r, ...c } = enemy.control!;
    void _r;
    return {
      ...m,
      archipel: { ...m.archipel!, embers: undefined, razedAt: { [C0]: NOW - 50 * H } },
      pois: [...m.pois, { ...enemy, control: { ...c, owner: 'player', garrison } }],
    };
  }
  it('garnison dedans : le store la rappelle, le lieu reste en attendant', () => {
    const m = legacy(['a', 'b']);
    expect(heldRazedObjectives(m).map((p) => p.id)).toEqual([C0]);
    expect(onMap(tick(m, NOW), C0)).toBe(true);
  });
  it('vide : il quitte la carte et reçoit une braise neuve, comptée à partir de maintenant', () => {
    const m = tick(legacy([]), NOW);
    expect(onMap(m, C0)).toBe(false);
    expect(m.archipel!.embers![C0]!.at).toBe(NOW);
    expect(m.archipel!.razedAt).toBeUndefined();
    expect(tick(m, NOW + H)).toBe(m);
  });
  it('la répartition automatique (« Répartir ») n’y propose aucune place', () => {
    const champ = (n: string): Adventurer => ({
      id: n,
      name: n,
      seed: 1,
      path: [],
      level: 30,
      xp: 0,
      championId: CHAMPIONS[0]!.id,
      copies: 1,
      skills: [],
    });
    const out = buildDeployment({
      map: legacy([]),
      atBase: [champ('a'), champ('b')],
      garrisons: new Map<string, Adventurer[]>(),
      hero: null,
      road: { advGear: [] },
      heroLevel: 30,
      travelMult: 1,
      outpostLevel: 1,
    })!;
    expect(out.spots.map((s) => s.id)).not.toContain(C0);
  });
});

// 🕯️ Demandé (2026-10-16) : « éteindre ne les fait pas disparaître, ça les désactive : on ne
// peut pas les cliquer mais on les voit sur la carte en grisé ».
describe('🕯️ un objectif éteint reste visible sur la carte', () => {
  it('à la place exacte de l’objectif, avec ce qu’il lui reste', () => {
    let m = tick(razeIslandTarget(island3(), C0, NOW), NOW);
    const need = m.archipel!.embers![C0]!.need;
    m = tick(sorties(m, NOW + 30 * H, 2), NOW + 40 * H);
    const g = emberGhosts(m, NOW + 40 * H);
    expect(g.map((x) => x.id)).toEqual([C0]);
    const spot = objectiveSpot(3, 0);
    expect([g[0]!.x, g[0]!.y]).toEqual([spot.x, spot.y]);
    expect(g[0]!.emoji).toBe('🪦');
    expect(g[0]!.short).toBe(String(need - 2));
  });
  it('gelé : ❄️ ; prêt sous le plancher : les heures', () => {
    let m = razeIslandTarget(island3(), C0, NOW);
    m = tick(razeIslandTarget(m, KEY, NOW), NOW);
    const g = emberGhosts(m, NOW);
    expect(g.map((x) => x.id)).toEqual([KEY, C0]);
    expect(g.find((x) => x.id === C0)!.short).toBe('❄️');
    const one = tick(razeIslandTarget(island3(), C1, NOW), NOW);
    const need = one.archipel!.embers![C1]!.need;
    const ready = tick(sorties(one, NOW + 60_000, need, 60_000), NOW + 2 * H);
    expect(emberGhosts(ready, NOW + 2 * H)[0]!.short).toBe('22 h');
  });
  it('rallumé, il redevient un lieu à attaquer et n’est plus grisé', () => {
    let m = tick(razeIslandTarget(island3(), C0, NOW), NOW);
    const need = m.archipel!.embers![C0]!.need;
    m = tick(sorties(m, NOW + 30 * H, need), NOW + 30 * H + need * H);
    expect(emberGhosts(m, NOW + 60 * H)).toEqual([]);
    expect(lit(m, C0)).toBe(true);
  });
  it('rien hors de l’île 3 ni sur une île pacifiée', () => {
    expect(emberGhosts(razeIslandTarget(island3(1, 20), 'isl_obj_0', NOW), NOW)).toEqual([]);
    let m = razeIslandTarget(island3(), C0, NOW);
    m = razeIslandTarget(m, FORTRESS_ID, NOW);
    expect(emberGhosts(m, NOW)).toEqual([]);
  });
});

describe('🕯️ la place d’un objectif éteint reste libre', () => {
  it('sur 20 jours, aucun lieu n’apparaît dessus (l’écart des îles est tenu)', () => {
    let m = island3();
    for (const id of [C0, C1, KEY]) m = razeIslandTarget(m, id, NOW);
    m = tick(m, NOW);
    const spots = Object.values(m.archipel!.embers!).map((e) => ({ x: e.x!, y: e.y! }));
    expect(spots).toHaveLength(3);
    let closest = Infinity;
    for (let t = NOW; t < NOW + 20 * 24 * H; t += 2 * H) {
      m = advanceWorld(m, t, LV, ISLAND_OUTPOST_LEVEL);
      for (const p of m.pois)
        if (!p.control && !p.army && p.type !== 'warband' && p.spawnedAt > NOW)
          for (const s of spots) closest = Math.min(closest, Math.hypot(p.x - s.x, p.y - s.y));
    }
    expect(closest).toBeGreaterThanOrEqual(EXPE.islandMinDistPoi * 0.6);
  });
  it('une braise d’avant (sans place) la reçoit au tick suivant', () => {
    const m0 = tick(razeIslandTarget(island3(), C0, NOW), NOW);
    const { x: _x, y: _y, ...old } = m0.archipel!.embers![C0]!;
    void _x;
    void _y;
    const legacy = { ...m0, archipel: { ...m0.archipel!, embers: { [C0]: old } } };
    const m = tick(legacy, NOW + H);
    const s = objectiveSpot(3, 0);
    expect(m.archipel!.embers![C0]).toEqual({ ...old, x: s.x, y: s.y });
    expect(tick(m, NOW + 2 * H)).toBe(m);
  });
});
