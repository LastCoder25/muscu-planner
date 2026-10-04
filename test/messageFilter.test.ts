import { describe, expect, it } from 'vitest';
import type { ExpeditionMessage, PartyResult } from '../src/lib/expedition';
import {
  categoryCounts,
  effectiveCategory,
  filterMessages,
  messageCategory,
} from '../src/lib/messageFilter';

const msg = (o: Partial<ExpeditionMessage> & { id: string }): ExpeditionMessage => ({
  level: 10,
  win: true,
  text: '',
  gold: 0,
  energy: 0,
  key: 0,
  resolvedAt: 0,
  read: true,
  ...o,
});
const party = (p: Partial<PartyResult>) => p as PartyResult;

describe('📬 catégorie d’un message', () => {
  it('range chaque origine à sa place', () => {
    expect(messageCategory(msg({ id: 'a', poiType: 'mine' }))).toBe('place');
    expect(messageCategory(msg({ id: 'ctlgold_ctl_mine_1' }))).toBe('place');
    expect(messageCategory(msg({ id: 'ctlloot_ctl_garden_1' }))).toBe('place');
    expect(messageCategory(msg({ id: 'ctl_ctl_mine_1' }))).toBe('attack');
    expect(messageCategory(msg({ id: 'pill_1' }))).toBe('attack');
    expect(
      messageCategory(msg({ id: 'b', poiType: 'control', party: party({ defense: true }) })),
    ).toBe('attack');
    expect(messageCategory(msg({ id: 'ovf_r1', overflow: {} as never }))).toBe('rift');
    expect(messageCategory(msg({ id: 'c', poiType: 'rift' }))).toBe('rift');
    expect(messageCategory(msg({ id: 'd', poiType: 'mana_mine' }))).toBe('rift');
    expect(
      messageCategory(
        msg({ id: 'e', poiType: 'control', party: party({ controlId: 'isl_obj_2' }) }),
      ),
    ).toBe('objective');
    expect(
      messageCategory(
        msg({ id: 'f', poiType: 'control', party: party({ controlId: 'ctl_citadel_0' }) }),
      ),
    ).toBe('objective');
    // Prendre un lieu fixe de production n'est PAS un objectif : c'est un lieu.
    expect(
      messageCategory(
        msg({ id: 'g', poiType: 'control', party: party({ controlId: 'ctl_mine' }) }),
      ),
    ).toBe('place');
    expect(messageCategory(msg({ id: 'isl_land_2', chest: true }))).toBe('gift');
    expect(messageCategory(msg({ id: 'ascend_1' }))).toBe('other');
  });

  it('un coffre reste un cadeau même s’il porte un lieu', () => {
    expect(messageCategory(msg({ id: 'h', chest: true, poiType: 'mine' }))).toBe('gift');
  });

  it('le choc contre une armée en campagne est une attaque, une bande de faille une faille', () => {
    expect(
      messageCategory(
        msg({ id: 'i', poiType: 'warband', party: party({ fieldHit: {} as never }) }),
      ),
    ).toBe('attack');
    expect(messageCategory(msg({ id: 'j', poiType: 'warband' }))).toBe('rift');
  });
});

describe('📬 filtres', () => {
  const box = [
    msg({ id: 'a', poiType: 'mine' }),
    msg({ id: 'pill_1' }),
    msg({ id: 'k', poiType: 'camp' }),
  ];

  it('ne propose que les catégories présentes, dans l’ordre, avec leur compte', () => {
    expect(categoryCounts(box).map((c) => [c.id, c.n])).toEqual([
      ['place', 2],
      ['attack', 1],
    ]);
  });

  it('filtre, et un filtre sans message retombe sur tout', () => {
    expect(filterMessages(box, 'place').map((m) => m.id)).toEqual(['a', 'k']);
    expect(filterMessages(box, null)).toHaveLength(3);
    expect(effectiveCategory(box, 'rift')).toBeNull();
    expect(filterMessages(box, 'rift')).toHaveLength(3);
  });
});
