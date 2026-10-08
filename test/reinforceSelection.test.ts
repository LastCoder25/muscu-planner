import { describe, expect, it } from 'vitest';
import {
  emptyReinfSelection,
  reinfCanAdd,
  reinfSeats,
  setReinfMilitia,
  toggleReinfChamp,
  toggleReinfTransfer,
  transfersByOrigin,
} from '@/lib/reinforceSelection';

const free = { champ: 2, total: 4 };

describe('renfort groupé : les places', () => {
  it('un champion de la base et un d’un autre lieu prennent chacun une place de champion', () => {
    let s = toggleReinfChamp(emptyReinfSelection(), 'a', free);
    s = toggleReinfTransfer(s, 'mine', 'b', free);
    expect(reinfSeats(s)).toEqual({ champ: 2, total: 2 });
    // Plus de place de champion : un troisième est refusé…
    expect(toggleReinfChamp(s, 'c', free)).toBe(s);
    expect(toggleReinfTransfer(s, 'mine', 'd', free)).toBe(s);
    // …mais un milicien d'un autre lieu passe encore.
    const m = toggleReinfTransfer(s, 'mine', 'mil:3', free);
    expect(reinfSeats(m)).toEqual({ champ: 2, total: 3 });
  });

  it('les miliciens sont bornés par ceux de la base ET par les places restantes', () => {
    const s = toggleReinfChamp(emptyReinfSelection(), 'a', free);
    expect(setReinfMilitia(s, 9, 10, free).militia).toBe(3);
    expect(setReinfMilitia(s, 9, 2, free).militia).toBe(2);
    expect(setReinfMilitia(s, -1, 5, free).militia).toBe(0);
    // Pleine de miliciens : plus de place pour un milicien, mais un champion passe encore (il
    // délogera un milicien à l'arrivée, 2026-10-08).
    const full = setReinfMilitia(s, 3, 5, free);
    expect(reinfCanAdd(full, 'champ', free)).toBe(true);
    expect(reinfCanAdd(full, 'mil', free)).toBe(false);
  });

  it('décocher libère la place', () => {
    let s = toggleReinfChamp(emptyReinfSelection(), 'a', free);
    s = toggleReinfChamp(s, 'b', free);
    s = toggleReinfChamp(s, 'a', free);
    expect(s.champs).toEqual(['b']);
    s = toggleReinfTransfer(s, 'mine', 'x', free);
    s = toggleReinfTransfer(s, 'mine', 'x', free);
    expect(s.transfers).toEqual([]);
  });

  it('les transferts partent par lieu d’origine', () => {
    let s = emptyReinfSelection();
    s = toggleReinfTransfer(s, 'mine', 'mil:1', free);
    s = toggleReinfTransfer(s, 'camp', 'b', free);
    s = toggleReinfTransfer(s, 'mine', 'a', free);
    expect([...transfersByOrigin(s)]).toEqual([
      ['mine', ['mil:1', 'a']],
      ['camp', ['b']],
    ]);
  });
});
