import { describe, expect, it } from 'vitest';
import type { ExpeditionMessage, PartyResult } from '../src/lib/expedition';
import {
  categoryCounts,
  claimableCount,
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
  it('🌾 la production d’un lieu fixe est une récolte, pas un lieu ni une attaque', () => {
    expect(messageCategory(msg({ id: 'ctlgold_ctl_mine_1' }))).toBe('harvest');
    expect(messageCategory(msg({ id: 'ctlloot_ctl_garden_1' }))).toBe('harvest');
    // Le champ `production` suffit, même avec un poiType (rapport d'aujourd'hui).
    expect(messageCategory(msg({ id: 'x', poiType: 'control', production: { militia: 2 } }))).toBe(
      'harvest',
    );
  });

  it('🛡️ ce que fait l’ennemi chez nous', () => {
    expect(messageCategory(msg({ id: 'ctl_ctl_mine_1' }))).toBe('enemy');
    expect(messageCategory(msg({ id: 'pill_1' }))).toBe('enemy');
    expect(
      messageCategory(msg({ id: 'b', poiType: 'control', party: party({ defense: true }) })),
    ).toBe('enemy');
    // Défendre un lieu fixe porte aussi son `controlId` : ça reste une attaque ENNEMIE.
    expect(
      messageCategory(
        msg({
          id: 'b2',
          poiType: 'control',
          party: party({ defense: true, controlId: 'ctl_mine' }),
        }),
      ),
    ).toBe('enemy');
    expect(
      messageCategory(
        msg({ id: 'i', poiType: 'warband', party: party({ fieldHit: {} as never }) }),
      ),
    ).toBe('enemy');
  });

  it('⚔️ ce qu’on attaque pour le prendre : lieux fixes, objectifs, citadelles', () => {
    for (const controlId of ['ctl_mine', 'isl_obj_2', 'ctl_citadel_0', 'isl_fortress'])
      expect(
        messageCategory(msg({ id: 'g', poiType: 'control', party: party({ controlId }) })),
      ).toBe('assault');
  });

  it('🧭 le reste de la carte est une expédition', () => {
    expect(messageCategory(msg({ id: 'a', poiType: 'mine' }))).toBe('trip');
    expect(messageCategory(msg({ id: 'k', poiType: 'camp' }))).toBe('trip');
    expect(messageCategory(msg({ id: 'planned_1' }))).toBe('trip');
  });

  it('🕳️ failles, 🎁 cadeaux, 📜 autres', () => {
    expect(messageCategory(msg({ id: 'ovf_r1', overflow: {} as never }))).toBe('rift');
    expect(messageCategory(msg({ id: 'c', poiType: 'rift' }))).toBe('rift');
    expect(messageCategory(msg({ id: 'd', poiType: 'mana_mine' }))).toBe('rift');
    expect(messageCategory(msg({ id: 'j', poiType: 'warband' }))).toBe('rift');
    expect(messageCategory(msg({ id: 'isl_land_2', chest: true }))).toBe('gift');
    expect(messageCategory(msg({ id: 'h', chest: true, poiType: 'mine' }))).toBe('gift');
    expect(messageCategory(msg({ id: 'ascend_1' }))).toBe('other');
  });
});

describe('📬 filtres', () => {
  const box = [
    msg({ id: 'a', poiType: 'mine', claimed: false, claimAt: 100 }),
    msg({ id: 'pill_1' }),
    msg({ id: 'k', poiType: 'camp', claimed: false, claimAt: 500 }),
    msg({ id: 'ctlgold_ctl_mine_1' }),
  ];

  it('ne propose que les catégories présentes, dans l’ordre, avec leur compte', () => {
    expect(categoryCounts(box).map((c) => [c.id, c.n])).toEqual([
      ['harvest', 1],
      ['enemy', 1],
      ['trip', 2],
    ]);
  });

  it('filtre, et un filtre sans message retombe sur tout', () => {
    expect(filterMessages(box, 'trip', 0).map((m) => m.id)).toEqual(['a', 'k']);
    expect(filterMessages(box, null, 0)).toHaveLength(4);
    expect(effectiveCategory(box, 'rift', 0)).toBeNull();
    expect(filterMessages(box, 'rift', 0)).toHaveLength(4);
  });

  it('🎁 « À prendre » ne garde que les butins encaissables MAINTENANT', () => {
    expect(claimableCount(box, 200)).toBe(1);
    expect(filterMessages(box, 'claim', 200).map((m) => m.id)).toEqual(['a']);
    expect(filterMessages(box, 'claim', 600).map((m) => m.id)).toEqual(['a', 'k']);
    // Rien à prendre : le filtre retombe sur tout.
    expect(claimableCount(box, 50)).toBe(0);
    expect(effectiveCategory(box, 'claim', 50)).toBeNull();
  });
});
