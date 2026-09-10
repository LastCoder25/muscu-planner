import { describe, it, expect } from 'vitest';
import { planPushes, livePushKeys, type PushContext } from '@/lib/push';
import { __stampFrom } from '@/composables/useAppUpdate';
import {
  FACTION_LABEL,
  scoutLeadMs,
  type BaseState,
  type DefenseId,
  type DefenseStructure,
} from '@/lib/raid';

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
  caravans: [],
  watchtowerLevel: 28,
  activeDays7: 4,
  playerLevel: 28,
  ...over,
});

describe('notifications push — ce qu’on programme', () => {
  it('annonce le siège À LA DÉTECTION, pas à l’impact', () => {
    // C'est tout ce que la Tour de guet achète : du temps de réaction. Une alerte
    // envoyée à l'arrivée de l'armée ne servirait à rien.
    const c = ctx();
    const p = planPushes(c, NOW).find((x) => x.kind === 'siege')!;
    expect(p).toBeTruthy();
    expect(p.sendAt).toBe(c.base!.nextRaidAt - scoutLeadMs(28));
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
    const p = planPushes(ctx(), NOW).find((x) => x.kind === 'siege')!;
    const texte = `${p.title} ${p.body}`.toLowerCase();
    for (const f of Object.values(FACTION_LABEL)) {
      expect(texte, `le message nomme « ${f} »`).not.toContain(f.toLowerCase());
    }
    for (const mot of ['champion', 'effectif', 'groupes', 'niveau']) {
      expect(texte, `le message révèle « ${mot} »`).not.toContain(mot);
    }
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
      expedition: { returnAt: NOW - H },
      caravans: [{ id: 'v1', returnAt: NOW - H }],
    });
    expect(planPushes(c, NOW)).toEqual([]);
  });

  it('⚠️ la clé d’idempotence est STABLE : replanifier ne duplique jamais', () => {
    // L'app replanifie à chaque ouverture. Si la clé bougeait, chaque ouverture
    // ajouterait un doublon et le joueur recevrait N fois la même alerte.
    const c = ctx({
      expedition: { returnAt: NOW + 3 * H },
      caravans: [{ id: 'v1', returnAt: NOW + 2 * H }],
    });
    const a = livePushKeys(planPushes(c, NOW));
    const b = livePushKeys(planPushes(c, NOW + 60_000));
    expect([...a].sort()).toEqual([...b].sort());
    expect(a.size).toBe(4); // siège + assaut + héros + convoi, tous distincts
  });

  it('⚠️ un siège REPOUSSÉ change de clé — l’ancienne ligne doit mourir', () => {
    // L'échéance est repoussée pendant l'inactivité (règle 1 : on ne punit jamais
    // l'absence). Sans clé liée à l'heure, on notifierait une attaque annulée.
    const t1 = livePushKeys(planPushes(ctx(), NOW));
    const t2 = livePushKeys(planPushes(ctx({ base: base(28, { nextRaidAt: NOW + 50 * H }) }), NOW));
    expect([...t1].some((k) => k.startsWith('siege:'))).toBe(true);
    expect([...t2].some((k) => t1.has(k) && k.startsWith('siege:'))).toBe(false);
  });

  it('un convoi DÉJÀ récupéré ne notifie plus', () => {
    const c = ctx({
      caravans: [
        { id: 'v1', returnAt: NOW + 2 * H, claimed: true },
        { id: 'v2', returnAt: NOW + 2 * H },
      ],
    });
    const convois = planPushes(c, NOW).filter((p) => p.kind === 'convoy_home');
    expect(convois).toHaveLength(1);
    expect(convois[0]!.dedupe).toBe('convoy:v2');
  });

  it('chaque message emmène quelque part', () => {
    const c = ctx({
      expedition: { returnAt: NOW + 3 * H },
      caravans: [{ id: 'v1', returnAt: NOW + 2 * H }],
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
