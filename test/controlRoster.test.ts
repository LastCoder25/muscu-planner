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
  controlFilterOf,
  garrisonDots,
} from '@/lib/controlPoints';
import { createMap, type ExpeditionMap } from '@/lib/expedition';
import { MILITIA_PREFIX } from '@/lib/militia';

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

  it('plus rien « à récolter » : la ligne n’appelle plus pour une réserve (versé directement)', () => {
    let m = captureControl(base(), MINE, ['a', 'b', 'c'], 0, 7);
    m = setAttack(m, MINE, 9e15);
    const r = row(controlRoster(m, [], 20 * H, L), MINE);
    expect('ready' in r).toBe(false);
    expect(r.progress!.pct).toBeNull();
  });
});

describe('🔎 les filtres de la liste', () => {
  it('tenue = à nous avec du monde (attaque imminente comprise), vide = à nous sans personne', () => {
    expect(controlFilterOf('held')).toBe('held');
    expect(controlFilterOf('imminent')).toBe('held');
    expect(controlFilterOf('empty')).toBe('empty');
    expect(controlFilterOf('enemy')).toBe('notHeld');
    expect(controlFilterOf('assault')).toBe('notHeld');
  });
});

describe('⚫ garrisonDots — la garnison en points sous le fort', () => {
  it('ennemi : rien (on ne connaît pas sa garnison)', () => {
    expect(garrisonDots(row(controlRoster(base(), [], 0, L), MINE))).toBe('');
  });

  it('tenu : champions, miliciens, renforts en route, puis places libres', () => {
    const mil = `${MILITIA_PREFIX}1`;
    let m = captureControl(base(), MINE, ['a', mil], 0, 7);
    m = setAttack(m, MINE, 9e15);
    m = reinforceControl(m, MINE, ['b'], 4 * H, H);
    const r = row(controlRoster(m, [], 2 * H, L), MINE);
    const dots = garrisonDots(r);
    expect(dots.length).toBe(Math.max(r.seats, 3));
    expect(dots.startsWith('cmr')).toBe(true);
    expect(dots.slice(3)).toBe('f'.repeat(Math.max(0, r.seats - 3)));
  });

  it('un TRANSFERT depuis une autre place forte compte comme en route', () => {
    let m = captureControl(base(), MINE, ['a'], 0, 7);
    m = setAttack(m, MINE, 9e15);
    m = reinforceControl(m, MINE, ['b', 'c'], 4 * H, H, TOWER);
    const dots = garrisonDots(row(controlRoster(m, [], 2 * H, L), MINE));
    expect(dots.startsWith('crr')).toBe(true);
  });

  it('des champions PARTIS EN SORTIE gardent leur place (cas réel : 2 miliciens + 3 dehors = complet)', () => {
    const mil = (n: number) => `${MILITIA_PREFIX}${n}`;
    let m = captureControl(base(), MINE, [mil(1), mil(2)], 0, 7);
    m = setAttack(m, MINE, 9e15);
    m = {
      ...m,
      pois: m.pois.map((p) =>
        p.id === MINE ? { ...p, control: { ...p.control!, away: ['x', 'y', 'z'] } } : p,
      ),
    };
    const r = row(controlRoster(m, [], 2 * H, L), MINE);
    expect(garrisonDots(r)).toBe('mmrrr' + 'f'.repeat(Math.max(0, r.seats - 5)));
  });

  it('ennemi ATTAQUÉ : nos champions en marche prennent leurs places, au plus celles du point', () => {
    const march = (ids: string[]) =>
      garrisonDots(
        row(controlRoster(base(), [{ poiId: MINE, midAt: 5 * H, ids }], 2 * H, L), MINE),
      );
    const seats = seatsOf('mine');
    expect(march(['a', 'b'])).toBe('rr' + 'f'.repeat(Math.max(0, seats - 2)));
    const many = Array.from({ length: seats + 3 }, (_, i) => `x${i}`);
    expect(march(many)).toBe('r'.repeat(seats));
    // L'équipe déjà arrivée (assaut passé), on ne sait plus rien de la garnison ennemie.
    expect(
      garrisonDots(
        row(controlRoster(base(), [{ poiId: MINE, midAt: H, ids: ['a'] }], 2 * H, L), MINE),
      ),
    ).toBe('');
  });
});
