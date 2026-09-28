// 🏰 Points de contrôle : voir qui l'occupe, en ramener une partie, envoyer des renforts.
import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  controlFreeSeats,
  controlIdOf,
  controlSeats,
  controlStock,
  ensureControls,
  reinforceBlocker,
  reinforceControl,
  releaseFromControl,
  settleReinforcements,
  dueRetakes,
  seatsOf,
  turnBackReinforcements,
  turnBackLabel,
  loseControl,
  returnsEnRoute,
  settleReturns,
} from '@/lib/controlPoints';
import { createMap, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const ID = controlIdOf('mine');
const L = 30;
const ctl = (m: ExpeditionMap) => m.pois.find((p) => p.id === ID)!;
/** Tenu par `g` depuis 0, attaque repoussée très loin (on teste la production). */
const held = (g: string[]) => {
  const m = captureControl(ensureControls(createMap(3, 0, L, 1), 0, L), ID, g, 0, 7);
  return {
    ...m,
    pois: m.pois.map((p) =>
      p.id === ID ? { ...p, control: { ...p.control!, attackAt: 9e15 } } : p,
    ),
  };
};

describe('🏰 renforts', () => {
  it('les places libres comptent la garnison ET les renforts en route', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 2 * H);
    expect(controlSeats(ctl(m).control)).toBe(2);
    expect(controlFreeSeats(ctl(m).control)).toBe(seatsOf('mine') - 2);
    expect(reinforceBlocker(ctl(m).control, seatsOf('mine') - 2)).toBeNull();
    expect(reinforceBlocker(ctl(m).control, seatsOf('mine') - 1)).toBe('full');
    expect(reinforceBlocker(ctl(m).control, 0)).toBe('empty');
  });
  it('un point ennemi ne reçoit aucun renfort', () => {
    const enemy = ensureControls(createMap(3, 0, L, 1), 0, L);
    expect(controlFreeSeats(ctl(enemy).control)).toBe(0);
    expect(reinforceBlocker(ctl(enemy).control, 1)).toBe('notHeld');
  });
  it('un renfort ne rejoint la garnison qu’à son arrivée', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 2 * H);
    expect(settleReinforcements(m, H, L)).toBe(m); // rien n'arrive : même carte
    const s = ctl(settleReinforcements(m, 2 * H, L)).control!;
    expect(s.garrison).toEqual(['a', 'b']);
    expect(s.reinforcing).toEqual([]);
  });
  it('en route, il ne combat pas : pas d’arrivée après une attaque due', () => {
    const m0 = reinforceControl(held(['a']), ID, ['b'], 5 * H);
    const m = {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === ID ? { ...p, control: { ...p.control!, attackAt: 3 * H } } : p,
      ),
    };
    expect(ctl(settleReinforcements(m, 10 * H, L)).control!.garrison).toEqual(['a']);
  });
  it('la production garde le passé au débit d’avant, puis suit le nouvel effectif', () => {
    const solo = held(['a']);
    const m = settleReinforcements(reinforceControl(solo, ID, ['b'], 4 * H), 4 * H, L);
    const before = controlStock(ctl(solo), 4 * H, L);
    // À l'arrivée : exactement ce que le solo avait produit.
    expect(controlStock(ctl(m), 4 * H, L)).toBe(before);
    // Ensuite, deux produisent plus vite qu'un.
    const gainDuo = controlStock(ctl(m), 8 * H, L) - before;
    const gainSolo = controlStock(ctl(solo), 8 * H, L) - before;
    expect(gainDuo).toBeGreaterThan(gainSolo);
  });
});

describe('🏰 ramener des champions', () => {
  it('ramène les choisis, garde les autres et l’or produit', () => {
    const m = held(['a', 'b', 'c']);
    const stock = controlStock(ctl(m), 6 * H, L);
    const r = releaseFromControl(m, ID, ['b'], 6 * H, L);
    expect(ctl(r).control!.garrison).toEqual(['a', 'c']);
    expect(controlStock(ctl(r), 6 * H, L)).toBe(stock);
    expect(controlFreeSeats(ctl(r).control)).toBe(seatsOf('mine') - 2); // la place se libère
  });
  it('peut ramener un renfort encore en route', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 5 * H);
    const r = releaseFromControl(m, ID, ['b'], H, L);
    expect(ctl(r).control!.reinforcing).toEqual([]);
    expect(ctl(r).control!.garrison).toEqual(['a']);
  });
  it('vidé, le point RESTE à nous jusqu’à la prochaine attaque (décision de l’utilisateur)', () => {
    const m = held(['a', 'b']);
    const stock = controlStock(ctl(m), 6 * H, L);
    const r = releaseFromControl(m, ID, ['a', 'b'], 6 * H, L);
    const c = ctl(r).control!;
    expect(c.owner).toBe('player');
    expect(c.garrison).toEqual([]);
    expect(c.attackAt).toBe(ctl(m).control!.attackAt); // l'attaque prévue reste prévue
    // Sans garnison, il ne produit plus — mais l'or déjà sorti reste à récolter.
    expect(controlStock(ctl(r), 30 * H, L)).toBe(stock);
    // On peut encore y envoyer tout un renfort.
    expect(controlFreeSeats(c)).toBe(seatsOf('mine'));
    // Et l'attaque le trouvera : c'est elle, sans défenseurs, qui le reprendra.
    const due = {
      ...r,
      pois: r.pois.map((p) =>
        p.id === ID ? { ...p, control: { ...p.control!, attackAt: 7 * H } } : p,
      ),
    };
    expect(dueRetakes(due, 7 * H).map((p) => p.id)).toEqual([ID]);
  });
});

describe('🛡️ renforts dessinés sur la carte', () => {
  it('un envoi en route est UN convoi aller simple, qui disparaît à l’arrivée', async () => {
    const { reinforcementsEnRoute } = await import('@/lib/controlPoints');
    const m = reinforceControl(held(['a']), ID, ['b', 'c'], 5 * H, 2 * H);
    const r = reinforcementsEnRoute(m, 3 * H);
    expect(r).toHaveLength(1);
    expect(r[0]!.members).toEqual(['b', 'c']);
    expect(r[0]!.sentAt).toBe(2 * H);
    expect(r[0]!.midAt).toBe(5 * H);
    expect(r[0]!.returnAt).toBe(5 * H);
    expect(r[0]!.poi.id).toBe(ID);
    expect(reinforcementsEnRoute(m, 5 * H)).toHaveLength(0);
  });
  it('deux envois distincts font deux convois', async () => {
    const { reinforcementsEnRoute } = await import('@/lib/controlPoints');
    const m1 = reinforceControl(held(['a']), ID, ['b'], 5 * H, 2 * H);
    const m = reinforceControl(m1, ID, ['c'], 6 * H, 3 * H);
    expect(reinforcementsEnRoute(m, 4 * H)).toHaveLength(2);
  });
  it('un renfort sans départ connu (ancien) n’est pas dessiné', async () => {
    const { reinforcementsEnRoute } = await import('@/lib/controlPoints');
    const m = reinforceControl(held(['a']), ID, ['b'], 5 * H);
    expect(reinforcementsEnRoute(m, 3 * H)).toHaveLength(0);
  });
});

describe('🔙 le point tombe pendant qu’un renfort est en route', () => {
  /** Tenu par `a`, renfort `b` parti à 1 h pour arriver à 5 h, attaque à 3 h. */
  const setup = () => {
    const m0 = reinforceControl(held(['a']), ID, ['b', 'mil:x'], 5 * H, 1 * H);
    return {
      ...m0,
      pois: m0.pois.map((p) =>
        p.id === ID ? { ...p, control: { ...p.control!, attackAt: 3 * H } } : p,
      ),
    };
  };
  it('le renfort fait demi-tour : il rentre en refaisant le chemin déjà parcouru', () => {
    expect(turnBackReinforcements(ctl(setup()).control!, 3 * H)).toEqual([
      { id: 'b', from: 3 * H, at: 5 * H },
      { id: 'mil:x', from: 3 * H, at: 5 * H },
    ]);
  });
  it('un renfort déjà arrivé à l’heure de l’attaque ne fait pas demi-tour (il a combattu)', () => {
    const c = ctl(setup()).control!;
    expect(turnBackReinforcements(c, 5 * H)).toEqual([]);
  });
  it('sans heure de départ connue, il est rentré tout de suite', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 5 * H);
    expect(turnBackReinforcements(ctl(m).control!, 3 * H)).toEqual([
      { id: 'b', from: 3 * H, at: 3 * H },
    ]);
  });
  it('parti APRÈS l’heure de l’attaque, il rentre aussitôt, jamais avant son départ', () => {
    const m = reinforceControl(held(['a']), ID, ['b'], 9 * H, 4 * H);
    expect(turnBackReinforcements(ctl(m).control!, 3 * H)).toEqual([
      { id: 'b', from: 4 * H, at: 4 * H },
    ]);
  });
  it('le point perdu garde leur trajet retour : on les voit rentrer sur la carte', () => {
    const lost = loseControl(setup(), ID, L, 3 * H);
    const c = ctl(lost).control!;
    expect(c.owner).toBe('enemy');
    expect(c.reinforcing).toBeUndefined();
    expect(c.returning).toEqual([
      { id: 'b', from: 3 * H, at: 5 * H },
      { id: 'mil:x', from: 3 * H, at: 5 * H },
    ]);
    expect(returnsEnRoute(lost, 4 * H).flatMap((t) => t.members)).toEqual(['b', 'mil:x']);
  });
  it('le milicien rejoint la base à son retour, pas avant', () => {
    const lost = loseControl(setup(), ID, L, 3 * H);
    expect(settleReturns(lost, 4 * H).militiaHome).toBe(0);
    expect(settleReturns(lost, 5 * H).militiaHome).toBe(1);
  });
});

describe('🔙 le rapport de chute', () => {
  it('ne dit rien sans renfort en route, et accorde le nombre', () => {
    expect(turnBackLabel(0)).toBe('');
    expect(turnBackLabel(1)).toBe(' 🔙 1 renfort en route fait demi-tour.');
    expect(turnBackLabel(3)).toBe(' 🔙 3 renforts en route font demi-tour.');
  });
});
