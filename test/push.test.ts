import { describe, it, expect } from 'vitest';
import { planPushes, livePushKeys, pushVoyage, type PushContext } from '@/lib/push';
import { buildMessage, controlAttackReportId } from '@/lib/expedition';
import { __stampFrom } from '@/composables/useAppUpdate';
import {
  FACTION_EMOJI,
  FACTION_LABEL,
  scoutLeadMs,
  raidIntervalMs,
  type BaseState,
  type DefenseId,
  type DefenseStructure,
} from '@/lib/raid';

/** Un voyage qui déposera un rapport. */
const voy = (returnAt: number, reportId = 'msg_r') => ({ returnAt, reportId, reports: true });
const H = 3_600_000;
const NOW = 1_000_000_000_000;

// ⚠️ PAS de cast `as` : le champ s’appelle `typeId`, et c’est le compilateur qui doit
// le dire. Un `as` l’aurait tu — c’est déjà arrivé trois fois dans ce projet.
const def = (typeId: DefenseId, level: number): DefenseStructure => ({ typeId, level });
/** Une enceinte PRÊTE pour un joueur de ce niveau (mur + tourelles à niveau). */
const base = (playerLevel: number, over: Partial<BaseState> = {}): BaseState => ({
  defenses: [def('wall', playerLevel), def('turret', playerLevel), def('watchtower', playerLevel)],
  raid: null,
  nextRaidAt: NOW + 30 * H,
  field: null,
  freeze: null,
  lastReport: null,
  seed: 1,
  ...over,
});

const ctx = (over: Partial<PushContext> = {}): PushContext => ({
  base: base(28),
  expedition: null,
  parties: [],
  watchtowerLevel: 28,
  fortSightMs: () => 0,
  activeDays7: 4,
  playerLevel: 28,
  plunder: null,
  controls: [],
  ...over,
});

describe('notifications push — ce qu’on programme', () => {
  it('🏰 « attaque en cours » mène au rapport de CETTE reprise', () => {
    const p = planPushes(
      ctx({ controls: [{ id: 'ctl_mine', attackAt: NOW + 3 * H, label: 'Mine' }] }),
      NOW,
    ).find((x) => x.kind === 'control_attack')!;
    expect(p.url).toBe(
      '/expedition-map?report=' +
        encodeURIComponent(controlAttackReportId('ctl_mine', NOW + 3 * H)),
    );
    expect(controlAttackReportId('ctl_mine', 5)).toBe('ctl_ctl_mine_5');
  });

  it('annonce le siège À LA DÉTECTION, pas à l’impact', () => {
    // C'est tout ce que la Tour de guet achète : du temps de réaction. Une alerte
    // envoyée à l'arrivée de l'armée ne servirait à rien.
    const c = ctx();
    const p = planPushes(c, NOW).find((x) => x.kind === 'siege')!;
    expect(p).toBeTruthy();
    // ⚠️ Le préavis est une PART de l'intervalle : il se lit donc avec le rythme.
    expect(p.sendAt).toBe(c.base!.nextRaidAt - scoutLeadMs(28, raidIntervalMs(c.activeDays7)));
    expect(p.sendAt).toBeLessThan(c.base!.nextRaidAt);
  });

  it('⚠️ une Tour PLUS HAUTE prévient PLUS TÔT', () => {
    const t = (lvl: number) =>
      planPushes(ctx({ watchtowerLevel: lvl }), NOW).find((x) => x.kind === 'siege')!.sendAt;
    expect(t(20)).toBeLessThan(t(0));
  });

  it('⚠️ LE MESSAGE NE COURT-CIRCUITE PAS L’ESPIONNAGE', () => {
    // La Tour vend de la CLARTÉ sur la composition d'une armée (v0.724). Un message qui
    // nommerait la faction, l'effectif ou le niveau offrirait gratuitement ce qu'elle
    // fait payer — et retirerait au joueur la raison d'ouvrir l'app.
    // ⚠️ Étendu au GROUPE rentré d'un camp (étape 3) : même doctrine, même vérification.
    const plans = planPushes(ctx({ parties: [{ id: 'party_x', ...voy(NOW + 2 * H) }] }), NOW);
    for (const kind of ['siege', 'party_home'] as const) {
      const p = plans.find((x) => x.kind === kind)!;
      expect(p, kind).toBeTruthy();
      const texte = `${p.title} ${p.body}`.toLowerCase();
      for (const f of Object.values(FACTION_LABEL)) {
        expect(texte, `${kind} nomme « ${f} »`).not.toContain(f.toLowerCase());
      }
      for (const e of Object.values(FACTION_EMOJI)) {
        expect(texte, `${kind} montre « ${e} »`).not.toContain(e);
      }
      for (const mot of ['champion', 'effectif', 'groupes', 'niveau', 'chef', 'abattu']) {
        expect(texte, `${kind} révèle « ${mot} »`).not.toContain(mot);
      }
    }
  });

  it('⚔️ un GROUPE rentré notifie, avare : ni faction ni effectif', () => {
    const plans = planPushes(ctx({ parties: [{ id: 'party_x', ...voy(NOW + 2 * H) }] }), NOW);
    const p = plans.find((x) => x.kind === 'party_home');
    expect(p?.dedupe).toBe('party:party_x');
    expect(p?.sendAt).toBe(NOW + 2 * H);
    expect(p?.url).toBe('/expedition-map?report=msg_r');
    for (const f of Object.values(FACTION_LABEL)) expect(`${p?.title} ${p?.body}`).not.toContain(f);
    // Aucun chiffre : ni effectif, ni niveau, ni abattus.
    expect(`${p?.title} ${p?.body}`).not.toMatch(/\d/);
    // ⚠️ Jamais dans le PASSÉ, et clé STABLE quand on replanifie.
    expect(
      planPushes(ctx({ parties: [{ id: 'old', ...voy(NOW - H) }] }), NOW).some(
        (x) => x.kind === 'party_home',
      ),
    ).toBe(false);
    const again = planPushes(
      ctx({ parties: [{ id: 'party_x', ...voy(NOW + 2 * H) }] }),
      NOW + 60_000,
    );
    expect(again.find((x) => x.kind === 'party_home')?.dedupe).toBe('party:party_x');
    // Deux groupes = deux clés distinctes.
    const two = planPushes(
      ctx({
        parties: [
          { id: 'g1', ...voy(NOW + H) },
          { id: 'g2', ...voy(NOW + H) },
        ],
      }),
      NOW,
    ).filter((x) => x.kind === 'party_home');
    expect(new Set(two.map((x) => x.dedupe)).size).toBe(2);
  });

  it('⚠️ un voyage SANS rapport ne s’annonce pas « rentré »', () => {
    // Groupe-compagnon d'une attaque combinée, blessés qui rentrent à pied, demi-tour :
    // aucun rapport n'est déposé. Les annoncer menait vers une boîte vide (signalé).
    const sans = { returnAt: NOW + H, reportId: 'msg_x', reports: false };
    const kinds = planPushes(ctx({ expedition: sans, parties: [{ id: 'w', ...sans }] }), NOW).map(
      (p) => p.kind,
    );
    expect(kinds).not.toContain('hero_home');
    expect(kinds).not.toContain('party_home');
  });

  it('🔔 la notification mène au rapport de CE voyage', () => {
    const v = { poi: { id: 'poi_7' }, sentAt: 42, returnAt: NOW + H } as unknown as Parameters<
      typeof pushVoyage
    >[0];
    const pv = pushVoyage(v);
    // L'id est celui que `buildMessage` donnera au rapport : la carte le retrouve.
    expect(pv.reportId).toBe(buildMessage({ ...v, outcome: { win: true, text: '' } } as never).id);
    expect(pv.reports).toBe(true);
    expect(pushVoyage({ ...v, wingOf: 'main' }).reports).toBe(false);
    expect(pushVoyage({ ...v, recalled: true }).reports).toBe(false);
    const hero = planPushes(ctx({ expedition: pv }), NOW).find((p) => p.kind === 'hero_home')!;
    expect(hero.url).toBe(`/expedition-map?report=${pv.reportId}`);
    // Deux groupes = deux rapports distincts, deux destinations distinctes.
    const two = planPushes(
      ctx({
        parties: [
          { id: 'a', ...voy(NOW + H, 'msg_a') },
          { id: 'b', ...voy(NOW + H, 'msg_b') },
        ],
      }),
      NOW,
    ).filter((p) => p.kind === 'party_home');
    expect(new Set(two.map((p) => p.url)).size).toBe(2);
  });

  it('⚠️ AUCUN siège annoncé si les sièges ne sont pas ACTIVÉS', () => {
    // Sans enceinte prête, aucune armée ne vient (règle 3). Annoncer un assaut qui
    // n'aura pas lieu serait un mensonge, et une inquiétude gratuite.
    const enceinteAMoitie = base(28, {
      defenses: [def('wall', 28), def('turret', 4), def('watchtower', 28)],
    });
    const kinds = planPushes(ctx({ base: enceinteAMoitie }), NOW).map((p) => p.kind);
    expect(kinds).not.toContain('siege');
    expect(kinds).not.toContain('siege_done');
    // …et pas davantage pour un joueur qui ne s'est pas entraîné de la semaine.
    expect(planPushes(ctx({ activeDays7: 0 }), NOW).map((p) => p.kind)).not.toContain('siege');
  });

  it('⚠️ le niveau du joueur est LU, pas deviné depuis l’enceinte', () => {
    // Une enceinte de niveau 5 est « à niveau » pour un joueur 5, mais dérisoire pour un
    // joueur 28 — et dans ce cas aucun siège ne se déclenche.
    const petite = base(5, { defenses: [def('wall', 5), def('turret', 5)] });
    expect(planPushes(ctx({ base: petite, playerLevel: 5 }), NOW).map((p) => p.kind)).toContain(
      'siege',
    );
    expect(
      planPushes(ctx({ base: petite, playerLevel: 28 }), NOW).map((p) => p.kind),
    ).not.toContain('siege');
  });

  it('⚠️ RIEN n’est programmé dans le PASSÉ', () => {
    // Une ligne déjà due partirait à la seconde où le serveur la voit — donc une alerte
    // pour un événement révolu, et une par ouverture de l'app puisqu'on replanifie.
    const c = ctx({
      base: base(28, { nextRaidAt: NOW - 5 * H }),
      expedition: voy(NOW - H),
      parties: [{ id: 'g1', ...voy(NOW - H) }],
    });
    expect(planPushes(c, NOW)).toEqual([]);
  });

  it('⚠️ la clé d’idempotence est STABLE : replanifier ne duplique jamais', () => {
    // L'app replanifie à chaque ouverture. Si la clé bougeait, chaque ouverture
    // ajouterait un doublon et le joueur recevrait N fois la même alerte.
    const c = ctx({
      expedition: voy(NOW + 3 * H),
      parties: [{ id: 'g1', ...voy(NOW + 2 * H) }],
    });
    const a = livePushKeys(planPushes(c, NOW));
    const b = livePushKeys(planPushes(c, NOW + 60_000));
    expect([...a].sort()).toEqual([...b].sort());
    expect(a.size).toBe(4); // siège + assaut + héros + groupe, tous distincts
  });

  it('⚠️ un siège REPOUSSÉ change de clé — l’ancienne ligne doit mourir', () => {
    // L'échéance est repoussée pendant l'inactivité (règle 1 : on ne punit jamais
    // l'absence). Sans clé liée à l'heure, on notifierait une attaque annulée.
    const t1 = livePushKeys(planPushes(ctx(), NOW));
    const t2 = livePushKeys(planPushes(ctx({ base: base(28, { nextRaidAt: NOW + 50 * H }) }), NOW));
    expect([...t1].some((k) => k.startsWith('siege:'))).toBe(true);
    expect([...t2].some((k) => t1.has(k) && k.startsWith('siege:'))).toBe(false);
  });

  it('chaque message emmène quelque part', () => {
    const c = ctx({
      expedition: voy(NOW + 3 * H),
      parties: [{ id: 'g1', ...voy(NOW + 2 * H) }],
    });
    for (const p of planPushes(c, NOW)) {
      expect(p.url, p.kind).toMatch(/^\//);
      expect(p.title.length, p.kind).toBeGreaterThan(0);
      expect(p.body.length, p.kind).toBeGreaterThan(0);
    }
  });
});

describe('⚠️ détection d’une nouvelle version déployée', () => {
  // Ce projet déploie plusieurs fois par jour et un onglet resté ouvert fait tourner
  // l'ANCIEN code indéfiniment. Sans signal, un correctif livré est signalé comme
  // « toujours cassé » — c'est arrivé trois fois de suite.
  it('reconnaît l’empreinte du build dans le HTML servi', () => {
    expect(__stampFrom('<script src="/assets/index-BbgJ_Q-I.js"></script>')).toBe(
      'assets/index-BbgJ_Q-I.js',
    );
    expect(__stampFrom('<script type="module" src="/assets/index.a1b2c3.js">')).toBe(
      'assets/index.a1b2c3.js',
    );
  });

  it('⚠️ deux builds DIFFÉRENTS donnent des empreintes différentes', () => {
    // C'est toute la comparaison : si le haché ne bougeait pas, on ne verrait jamais
    // le nouveau déploiement.
    const a = __stampFrom('<script src="/assets/index-AAAA.js">');
    const b = __stampFrom('<script src="/assets/index-BBBB.js">');
    expect(a).not.toBe(b);
  });

  it('ne se trompe pas de chunk : seul celui d’ENTRÉE compte', () => {
    // Les chunks paresseux changent aussi, mais tous ne sont pas chargés partout.
    expect(__stampFrom('<script src="/assets/ExpeditionMapPage-XYZ.js">')).toBeNull();
  });
});
