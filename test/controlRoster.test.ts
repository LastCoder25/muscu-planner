// 🗂️ La liste de gestion des points fixes : qui est dessus, qui y va, ce qui appelle une action.
import { describe, expect, it } from 'vitest';
import {
  CONTROL,
  captureControl,
  controlIdOf,
  controlRoster,
  ensureControls,
  reinforceControl,
  seatsOf,
} from '@/lib/controlPoints';
import { createMap, type ExpeditionMap } from '@/lib/expedition';

const H = 3600_000;
const L = 30;
const MINE = controlIdOf('mine');
const TOWER = controlIdOf('tower');
const base = () => ensureControls(createMap(3, 0, L, 1), 0, L);
const setAttack = (m: ExpeditionMap, id: string, at: number): ExpeditionMap => ({
  ...m,
  pois: m.pois.map((p) => (p.id === id ? { ...p, control: { ...p.control!, attackAt: at } } : p)),
});
const row = (rows: ReturnType<typeof controlRoster>, id: string) =>
  rows.find((r) => r.poi.id === id)!;

describe('🗂️ controlRoster', () => {
  it('une ligne par point, dans l’ordre des types', () => {
    const rows = controlRoster(base(), [], 0, L);
    expect(rows.map((r) => r.kind)).toEqual([...CONTROL.kinds]);
    expect(rows.every((r) => r.status === 'enemy')).toBe(true);
    // ⚠️ Même quand la carte les stocke dans un autre ordre (points ajoutés au fil des versions).
    const m = base();
    const flipped = controlRoster({ ...m, pois: [...m.pois].reverse() }, [], 0, L);
    expect(flipped.map((r) => r.kind)).toEqual([...CONTROL.kinds]);
  });

  it('une équipe en marche marque le point « assaut », avec ses champions et son arrivée', () => {
    const rows = controlRoster(base(), [{ poiId: MINE, midAt: 5 * H, ids: ['a', 'b'] }], 2 * H, L);
    const r = row(rows, MINE);
    expect(r.status).toBe('assault');
    expect(r.assault).toEqual({ ids: ['a', 'b'], inMs: 3 * H });
    // Arrivée passée : ce n'est plus une marche.
    expect(
      row(controlRoster(base(), [{ poiId: MINE, midAt: H, ids: ['a'] }], 2 * H, L), MINE).assault,
    ).toBeNull();
  });

  it('tenu : garnison, renforts en route (délai) et places', () => {
    let m = captureControl(base(), MINE, ['a'], 0, 7);
    m = setAttack(m, MINE, 9e15);
    m = reinforceControl(m, MINE, ['b'], 4 * H, H);
    const r = row(controlRoster(m, [], 2 * H, L), MINE);
    expect(r.status).toBe('held');
    expect(r.garrison).toEqual(['a']);
    expect(r.reinforcing).toEqual([{ id: 'b', inMs: 2 * H }]);
    expect(r.seats).toBe(seatsOf('mine'));
    // Arrivé mais pas encore réglé par le tick : compté dans la garnison, plus en route.
    const later = row(controlRoster(m, [], 5 * H, L), MINE);
    expect(later.garrison).toEqual(['a', 'b']);
    expect(later.reinforcing).toEqual([]);
  });

  it('tenu sans personne = « empty », attaque proche = « imminent » (prioritaire)', () => {
    let m = setAttack(captureControl(base(), MINE, [], 0, 7), MINE, 9e15);
    expect(row(controlRoster(m, [], H, L), MINE).status).toBe('empty');
    m = setAttack(m, MINE, H + CONTROL.imminentMs / 2);
    expect(row(controlRoster(m, [], H, L), MINE).status).toBe('imminent');
  });

  it('« à récolter » suit collectControl ; la tour ne stocke rien', () => {
    let m = captureControl(base(), MINE, ['a', 'b', 'c'], 0, 7);
    m = setAttack(captureControl(m, TOWER, ['d'], 0, 7), MINE, 9e15);
    m = setAttack(m, TOWER, 9e15);
    expect(row(controlRoster(m, [], 0, L), MINE).ready).toBe(false);
    const rows = controlRoster(m, [], 20 * H, L);
    expect(row(rows, MINE).ready).toBe(true);
    expect(row(rows, TOWER).ready).toBe(false);
    // Un point ennemi n'a jamais rien à récolter.
    expect(row(controlRoster(base(), [], 20 * H, L), MINE).ready).toBe(false);
  });
});
