import { describe, expect, it } from 'vitest';
import { heroHurtSplit, heroReturnsHurt, voyageAboard } from '@/lib/party';
import { heroHomePostId } from '@/lib/islandConquest';
import type { ActiveExpedition } from '@/lib/expedition';

// 🤕 Signalé (2026-10-16) : le héros parti de l'Arsenal, blessé à une faille, rentrait vers
// l'Arsenal (« comme s'il n'était pas blessé ») alors que ses deux places y étaient déjà
// libérées. Blessé, il rentre à la base depuis le lieu du combat, comme ses champions.
const NOW = 5_000_000;
const MIN = 60_000;
const unit = { name: 'Last', level: 42, combatant: {} } as never;

const exp = (o: { hurt?: boolean; reported?: boolean; homeId?: string; crew?: string[] } = {}) =>
  ({
    poi: { id: 'rift_1', type: 'rift', x: 300, y: 300 },
    seed: 1,
    sentAt: NOW - 55 * MIN,
    midAt: NOW,
    returnAt: NOW + 55 * MIN,
    goldCost: 0,
    reported: o.reported ?? true,
    ...(o.homeId === undefined ? { homeId: 'ctl_arsenal' } : o.homeId ? { homeId: o.homeId } : {}),
    origin: { x: 155, y: 145 },
    homeHero: unit,
    ...(o.crew ? { crew: o.crew } : {}),
    returnLegs: { won: 20, lost: 55 },
    outcome: {
      win: false,
      party: { hero: true, heroHurt: o.hurt ?? true, escort: ['c1', 'c2'], hurt: ['c2'] },
    },
  }) as unknown as ActiveExpedition;

describe('le héros blessé rentre à la base depuis le lieu du combat', () => {
  it('son voyage perd son poste et finit à la base, legMin après le rapport', () => {
    const s = heroHurtSplit(exp(), 30, NOW, 'party_x')!;
    expect(s.expedition.homeId).toBeUndefined();
    expect(s.expedition.origin).toBeUndefined();
    expect(s.expedition.homeHero).toBeUndefined();
    expect(s.expedition.returnLegs).toBeUndefined();
    expect(s.expedition.returnAt).toBe(NOW + 30 * MIN);
    // Il ne revient plus sur aucun poste : la place n'est pas gardée à tort.
    expect(heroHomePostId(s.expedition)).toBeNull();
  });
  it('ses champions continuent vers le poste, en groupe ordinaire', () => {
    const s = heroHurtSplit(exp(), 30, NOW, 'party_x')!;
    expect(s.party?.id).toBe('party_x');
    expect(s.party?.crew).toEqual(['c1', 'c2']);
    expect(s.party?.homeId).toBe('ctl_arsenal');
    expect(s.party?.returnAt).toBe(NOW + 55 * MIN);
    expect(s.party?.homeHero).toBeUndefined();
    expect(s.party?.reported).toBe(true);
    // Les champions ne sont plus à bord du voyage du héros (leur retour est celui du groupe).
    const roster = [
      { id: 'c1', busyUntil: NOW + 55 * MIN },
      { id: 'c2', busyUntil: NOW + 55 * MIN },
    ];
    expect(voyageAboard(s.expedition, roster, NOW + MIN)).toEqual([]);
    expect(voyageAboard(s.party!, roster, NOW + MIN)).toEqual(['c1', 'c2']);
  });
  it('un groupe d’attaque combinée garde son équipage', () => {
    expect(heroHurtSplit(exp({ crew: ['c1'] }), 30, NOW, 'x')!.party?.crew).toEqual(['c1']);
    expect(heroHurtSplit(exp({ crew: [] }), 30, NOW, 'x')!.party).toBeNull();
  });
  it('rien à séparer : pas blessé, rapport pas tombé, ou parti de la base', () => {
    expect(heroHurtSplit(exp({ hurt: false }), 30, NOW, 'x')).toBeNull();
    expect(heroHurtSplit(exp({ reported: false }), 30, NOW, 'x')).toBeNull();
    expect(heroHurtSplit(exp({ homeId: '' }), 30, NOW, 'x')).toBeNull();
  });
  it('la tuile ne dit « blessé » qu’après le rapport', () => {
    expect(heroReturnsHurt(exp(), NOW - 1)).toBe(false);
    expect(heroReturnsHurt(exp(), NOW)).toBe(true);
    expect(heroReturnsHurt(exp({ hurt: false }), NOW)).toBe(false);
  });
});
