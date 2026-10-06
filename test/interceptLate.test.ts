// ⚔️⏱️ PARTIR TROP TARD SUR UNE ARMÉE (2026-10-06, demandé : « on affiche tous les champions et
// héros ; s'ils ne peuvent pas arriver à temps, une fenêtre de confirmation ») : un boost ⚡ en
// route recalcule la rencontre ; arrivés après l'armée, ils rentrent sans combattre.
import { describe, expect, it } from 'vitest';
import { reMeet } from '@/lib/party';
import { boostVoyage, voyageBoostPlan, attackBoostPlan } from '@/lib/speedBoost';
import {
  EXPE,
  lateOutcome,
  supersedeLate,
  warbandAt,
  type ExpeditionOutcome,
  type Poi,
} from '@/lib/expedition';

const T0 = 1_700_000_000_000;
const H = 3600_000;
const band = (over: Partial<Poi> = {}): Poi => ({
  id: 'r1_war',
  type: 'warband',
  level: 30,
  faction: 'betes',
  from: { x: EXPE.town.x + 60, y: EXPE.town.y - 20 },
  x: EXPE.town.x + 60,
  y: EXPE.town.y - 20,
  distNorm: 0.9,
  spawnedAt: T0,
  expiresAt: T0 + 10 * H,
  ...over,
});
const win = {
  win: true,
  gold: 5,
  energy: 0,
  summonStones: 0,
  mana: 9,
  item: null,
  key: 0,
  reconBonus: 0,
  returnMult: 1,
  text: 'gagné',
  party: {
    hero: false,
    faction: 'betes',
    escort: ['a'],
    win: true,
    foes: 3,
    slain: 3,
    kills: { a: 3 },
    heroKills: 0,
    xp: { a: 40 },
    hurt: [],
    journal: [],
  },
} as unknown as ExpeditionOutcome;

describe('⚡ un boost sur une interception', () => {
  it('est accepté, et la rencontre se fait là où l’armée sera à la nouvelle heure', () => {
    const now = T0 + H;
    const v = { poi: warbandAt(band(), T0 + 10 * H), midAt: T0 + 11 * H, returnAt: T0 + 14 * H };
    const plan = voyageBoostPlan(v, 60 * 3, now);
    expect(typeof plan).not.toBe('string');
    const nv = reMeet(boostVoyage(v, plan as never));
    expect(nv.midAt).toBe(T0 + 8 * H);
    const at = warbandAt(band(), T0 + 8 * H);
    expect(nv.poi.x).toBeCloseTo(at.x, 6);
    expect(nv.poi.y).toBeCloseTo(at.y, 6);
  });
  it('ne touche à rien hors armée en marche', () => {
    const v = { poi: band({ type: 'camp', from: undefined }), midAt: T0 + 2 * H };
    expect(reMeet(v)).toBe(v);
  });
  it('une attaque combinée qui attend encore ses groupes ne se presse toujours pas', () => {
    const a = { poi: band(), arriveAt: T0 + 5 * H, midAt: T0 + 5 * H, wings: [] };
    expect(attackBoostPlan(a as never, 10, T0)).toBe('intercept');
  });
});

describe('⏱️ arrivés après l’armée', () => {
  const voyage = (midAt: number) => ({ poi: band(), midAt, outcome: win });
  it('rentrent sans combattre : ni victoire, ni butin, ni XP', () => {
    const [v] = supersedeLate([voyage(T0 + 10 * H)], T0 + 10 * H);
    expect(v!.outcome.win).toBe(false);
    expect(v!.outcome.mana).toBe(0);
    expect(v!.outcome.party?.late).toBe(true);
    expect(v!.outcome.party?.xp).toEqual({});
    expect(v!.outcome.text).toContain('l’armée avait déjà frappé');
  });
  it('à temps (même d’une minute), rien ne change', () => {
    const list = [voyage(T0 + 10 * H - 60_000)];
    expect(supersedeLate(list, T0 + 10 * H)).toBe(list);
  });
  it('le texte par défaut reste celui d’un lieu déjà terrassé', () => {
    expect(lateOutcome(win).text).toContain('une autre équipe');
  });
});
