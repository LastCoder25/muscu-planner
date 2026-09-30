// 🧭 Le rapport d'un groupe dit d'où chacun est parti et où il allait — pour savoir où
// renvoyer un blessé une fois guéri (demandé par l'utilisateur).
import { describe, expect, it } from 'vitest';
import { messageCard, missionRoute } from '@/lib/missionCard';
import { missionMain } from '@/lib/reportDetail';
import { partyOrigins, withOrigins } from '@/lib/party';
import {
  poiLabel,
  POI_LABEL,
  type ExpeditionMessage,
  type ExpeditionOutcome,
  type PartyResult,
  type Poi,
} from '@/lib/expedition';

const mine = { id: 'ctl_mine', type: 'control', control: { kind: 'mine' } } as Poi;
const tower = { id: 'ctl_tower', type: 'control', control: { kind: 'tower' } } as Poi;
const MINE = poiLabel(mine);
const TOWER = poiLabel(tower);

const party = (over: Partial<PartyResult> = {}): PartyResult =>
  ({
    hero: false,
    faction: 'bandits',
    escort: ['a1', 'a2'],
    win: false,
    foes: 6,
    slain: 2,
    kills: {},
    heroKills: 0,
    xp: { a1: 10, a2: 10 },
    hurt: ['a2'],
    journal: [],
    ...over,
  }) as PartyResult;
const msg = (p: PartyResult): ExpeditionMessage => ({
  id: 'm1',
  poiType: 'camp',
  level: 20,
  win: p.win,
  text: '',
  gold: 0,
  energy: 0,
  key: 0,
  resolvedAt: 0,
  read: true,
  party: p,
});
const teamRows = (m: ExpeditionMessage) =>
  missionMain(messageCard(m, [])).sections.find((s) => s.id === 'team')!.rows;

describe('🧭 partyOrigins / withOrigins', () => {
  it('un champion sorti d’un point fixe porte son id et son nom ; ceux de la base n’y sont pas', () => {
    const from = partyOrigins([
      { ids: ['a1'], origin: mine },
      { ids: ['a2'], origin: null },
    ]);
    expect(from).toEqual({ a1: { id: 'ctl_mine', label: MINE } });
  });

  it('les départs se posent sur le rapport du groupe, et nulle part sans rapport de groupe', () => {
    const o = { party: party() } as ExpeditionOutcome;
    expect(withOrigins(o, { a1: { id: 'x', label: 'X' } }).party?.from).toEqual({
      a1: { id: 'x', label: 'X' },
    });
    const solo = { gold: 1 } as ExpeditionOutcome;
    expect(withOrigins(solo, {})).toBe(solo);
  });
});

describe('🧭 missionRoute', () => {
  it('rapport d’avant (pas de `from`) : on ne dit rien plutôt que d’annoncer la base à tort', () => {
    expect(missionRoute(msg(party()))).toBeNull();
  });

  it('une défense se joue sur place : ni départ ni arrivée', () => {
    expect(missionRoute(msg(party({ from: {}, defense: true })))).toBeNull();
  });

  it('parti de la base vers le lieu', () => {
    expect(missionRoute(msg(party({ from: {} })))).toEqual({
      from: 'Base',
      to: POI_LABEL.camp,
      mixed: false,
    });
  });

  it('une attaque combinée cite chaque départ, le héros part toujours de la base', () => {
    const r = missionRoute(
      msg(
        party({ hero: true, from: partyOrigins([{ ids: ['a1'], origin: mine }]), escort: ['a1'] }),
      ),
    );
    expect(r?.from).toBe(`${MINE} · Base`);
    expect(r?.mixed).toBe(true);
  });
});

describe('🏥 le rapport dit où renvoyer un blessé', () => {
  it('blessé sorti d’un point fixe : « à renvoyer vers » ce point, et la ligne départ → arrivée', () => {
    const rows = teamRows(
      msg(party({ from: partyOrigins([{ ids: ['a1', 'a2'], origin: mine }]) })),
    );
    expect(rows[0].title).toBe(`${MINE} → ${POI_LABEL.camp}`);
    const hurt = rows.find((r) => r.title === 'a2' || r.sub?.includes('infirmerie'))!;
    expect(hurt.sub).toContain(`à renvoyer vers ${MINE}`);
    expect(hurt.tags?.some((t) => t.title.includes(`à renvoyer vers ${MINE}`))).toBe(true);
    // Le valide n'a rien à apprendre sur son départ : il reprend son poste tout seul.
    const ok = rows.find((r) => r.sub !== undefined && !r.sub.includes('infirmerie'));
    expect(ok?.sub ?? '').not.toContain('renvoyer');
  });

  it('blessé légèrement : même consigne', () => {
    const rows = teamRows(
      msg(
        party({
          win: true,
          hurt: [],
          lightHurt: ['a1'],
          from: partyOrigins([{ ids: ['a1'], origin: tower }]),
        }),
      ),
    );
    expect(rows.some((r) => r.sub?.includes(`à renvoyer vers ${TOWER}`))).toBe(true);
  });

  it('blessé parti de la base : il y est déjà', () => {
    const rows = teamRows(msg(party({ from: {} })));
    expect(rows.some((r) => r.sub?.includes('parti de la base'))).toBe(true);
    expect(rows.some((r) => r.sub?.includes('renvoyer'))).toBe(false);
  });

  it('départs mêlés : chacun dit le sien, blessé ou non', () => {
    const rows = teamRows(
      msg(party({ hurt: [], from: partyOrigins([{ ids: ['a1'], origin: mine }]) })),
    );
    expect(rows.some((r) => r.sub?.includes(`depuis ${MINE}`))).toBe(true);
    expect(rows.some((r) => r.sub?.includes('depuis la base'))).toBe(true);
  });

  it('rapport d’avant : aucune ligne de trajet, aucune consigne inventée', () => {
    const rows = teamRows(msg(party()));
    expect(rows.some((r) => r.title.includes('→'))).toBe(false);
    expect(
      rows.some((r) => r.sub?.includes('renvoyer') || r.sub?.includes('parti de la base')),
    ).toBe(false);
  });
});
