import { describe, expect, it } from 'vitest';
import {
  restoreUnvanquished,
  staysUnderAttack,
  supersedeLate,
  voyageTargetShown,
  type ExpeditionMap,
  type ExpeditionOutcome,
  type Poi,
} from '@/lib/expedition';
import { partyReport } from '@/lib/party';

const poi = (id: string, type = 'camp') =>
  ({ id, type, x: 10, y: 10, level: 5, expiresAt: 1e9 }) as unknown as Poi;
const map = (pois: Poi[]) => ({ pois }) as unknown as ExpeditionMap;
const outcome = (win: boolean): ExpeditionOutcome => ({
  win,
  gold: 500,
  energy: 0,
  summonStones: 3,
  mana: 0,
  item: null,
  key: 1,
  reconBonus: 0,
  returnMult: 1,
  text: 'combat',
  party: {
    hero: false,
    faction: 'bandits',
    escort: ['a'],
    win,
    foes: 4,
    slain: 4,
    kills: { a: 4 },
    heroKills: 0,
    xp: { a: 120 },
    hurt: win ? [] : ['a'],
    journal: ['x'],
    controlId: 'c1',
  },
});
const trip = (p: Poi, win: boolean, midAt: number, extra: { reported?: boolean } = {}) => ({
  poi: p,
  midAt,
  returnAt: midAt + 1000,
  ...extra,
  outcome: outcome(win),
});

describe('staysUnderAttack — un lieu GARDÉ reste attaquable pendant l’assaut', () => {
  it('camps, repaires, tanières, failles, bandes, récoltes gardées', () => {
    for (const t of ['camp', 'lair', 'den', 'rift', 'warband', 'mine', 'plunder'])
      expect(staysUnderAttack(poi('x', t)), t).toBe(true);
  });
  it('pas un lieu sans gardes (on y récolterait deux fois), ni l’arène, ni un point fixe', () => {
    for (const t of ['fallen', 'vein', 'mana_mine', 'arena', 'control'])
      expect(staysUnderAttack(poi('x', t)), t).toBe(false);
  });
});

describe('supersedeLate — la première qui le prend l’emporte', () => {
  const p = poi('a');
  it('arrivée APRÈS une victoire : rien à combattre, rien à prendre, rien d’appris', () => {
    const [, b] = supersedeLate([trip(p, true, 100), trip(p, true, 200)], 250);
    expect(b!.outcome.win).toBe(false);
    expect(b!.outcome.gold).toBe(0);
    expect(b!.outcome.summonStones).toBe(0);
    expect(b!.outcome.key).toBe(0);
    expect(b!.outcome.party!.late).toBe(true);
    expect(b!.outcome.party!.xp).toEqual({});
    expect(b!.outcome.party!.hurt).toEqual([]);
    // Plus de prise de point : `settleControlAssaults` ne la lit pas.
    expect(b!.outcome.party!.controlId).toBeUndefined();
    expect(partyReport(b!.outcome.party!, []).verdict).toBe('arrivés trop tard');
  });
  it('la première victoire, elle, n’est pas touchée', () => {
    const [a] = supersedeLate([trip(p, true, 100), trip(p, true, 200)], 250);
    expect(a!.outcome.win).toBe(true);
  });
  it('les attaques précédentes ont échoué : la suivante se bat vraiment', () => {
    const list = [trip(p, false, 100), trip(p, true, 200)];
    expect(supersedeLate(list, 250)).toBe(list);
  });
  it('pas avant son arrivée, pas deux arrivées simultanées (attaque combinée), pas un autre lieu', () => {
    const early = [trip(p, true, 100), trip(p, true, 200)];
    expect(supersedeLate(early, 150)).toBe(early);
    const same = [trip(p, true, 100), trip(p, true, 100)];
    expect(supersedeLate(same, 150)).toBe(same);
    const other = [trip(p, true, 100), trip(poi('b'), true, 200)];
    expect(supersedeLate(other, 250)).toBe(other);
  });
  it('un rapport déjà déposé ne se réécrit pas', () => {
    const list = [trip(p, true, 100), trip(p, true, 200, { reported: true })];
    expect(supersedeLate(list, 250)).toBe(list);
  });
});

describe('restoreUnvanquished — le lieu gardé ne quitte la carte qu’à sa chute', () => {
  const p = poi('a');
  it('pendant l’assaut il reste, et n’est pas dessiné deux fois', () => {
    const m0 = map([p]);
    expect(restoreUnvanquished(m0, [trip(p, true, 1000)], 500)).toBe(m0);
    expect(voyageTargetShown(trip(p, true, 1000), 500)).toBe(false);
  });
  it('au rapport d’une victoire, il tombe (et se dessine grisé jusqu’au retour)', () => {
    const m = restoreUnvanquished(map([p, poi('b')]), [trip(p, true, 1000)], 1000);
    expect(m!.pois.map((q) => q.id)).toEqual(['b']);
    expect(voyageTargetShown(trip(p, true, 1000), 1500)).toBe(true);
  });
  it('une attaque lancée AVANT la mise à jour (lieu retiré au départ) le rend après sa défaite', () => {
    const m = restoreUnvanquished(map([]), [trip(p, false, 1000)], 1500);
    expect(m!.pois.map((q) => q.id)).toEqual(['a']);
  });
  it('au rapport d’une défaite, il reste — jamais en double', () => {
    const m0 = map([p]);
    expect(restoreUnvanquished(m0, [trip(p, false, 1000)], 1500)).toBe(m0);
  });
});
