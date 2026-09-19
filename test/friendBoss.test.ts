import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { comboWeeklySets, COMBO_PLAN_REPS } from '@/lib/combo';
import {
  FRIEND_BOSS,
  bossFamily,
  bossUnitLabel,
  isBossExercise,
  bossStartAt,
  bossEndedAt,
  bossPhase,
  bossHpTotal,
  bossDamage,
  bossUnitsLeft,
  fmtBossPv,
  strikesToReplay,
  strikeShots,
  bossCry,
  BOSS_CRIES,
  BOSS_HEAVY_SHARE,
  BOSS_SHOT_MS,
  bossEmoji,
  canDeclareBoss,
  nextDeclareAt,
  acceptedUnits,
  metMinShare,
  bossRepsXp,
  bossAgendaEntries,
  bossHitsByDay,
  bossCompletionXp,
  earlyKillFraction,
  bossFromRow,
  bossXpTrack,
  friendBossXp,
  bossErrorMessage,
  fmtBossSpan,
  BOSS_FAMILY_LABEL,
  BOSS_TIERS,
  BOSS_TIER_DEFAULT,
  bossTier,
  bossShareUnits,
  friendBossChest,
  type FriendBoss,
  type FriendBossMember,
  type FriendBossHit,
} from '@/lib/friendBoss';

const H = 3600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 8, 14, 10);

function boss(over: Partial<FriendBoss> = {}): FriendBoss {
  return {
    id: 'b1',
    ownerId: 'u1',
    family: 'push',
    exerciseId: 'ex_pushup',
    exerciseName: 'Pompes',
    repWeight: 1,
    createdAt: T0,
    startAt: null,
    defeatedAt: null,
    hpTotal: 300,
    damage: 0,
    ...over,
  };
}

describe('🐉 BOSS ENTRE AMIS — famille d’un exo', () => {
  it('le conditionnement passe avant le muscle, le temps donne le gainage', () => {
    expect(bossFamily({ id: 'ex_burpees', muscle_primary: 'quadriceps' })).toBe('conditioning');
    expect(bossFamily({ id: 'ex_plank', unit: 'time', muscle_primary: 'épaules' })).toBe('core');
    expect(bossFamily({ id: 'ex_crunch', muscle_primary: 'abdominaux' })).toBe('core');
    expect(bossFamily({ id: 'ex_squat_bw', muscle_primary: 'Quadriceps' })).toBe('legs');
    expect(bossFamily({ id: 'ex_pullup', muscle_primary: 'dos' })).toBe('pull');
    expect(bossFamily({ id: 'ex_pushup', muscle_primary: 'pectoraux' })).toBe('push');
    expect(bossUnitLabel('core')).toBe('s');
    expect(bossUnitLabel('pull')).toBe('reps');
  });

  it('poids du corps seulement : la barre de traction passe, pas une sortie ni un élastique', () => {
    expect(isBossExercise({ id: 'ex_pushup', equipment_required: [] })).toBe(true);
    expect(isBossExercise({ id: 'ex_pullup', equipment_required: ['pullup_bar'] })).toBe(true);
    expect(
      isBossExercise({ id: 'ex_pullup_band', equipment_required: ['pullup_bar', 'bands'] }),
    ).toBe(false);
    expect(isBossExercise({ id: 'ex_ch_marche_course', equipment_required: [] })).toBe(false);
    expect(
      isBossExercise({ id: 'ex_tn_x', equipment_required: [], category: 'prepa_physique' }),
    ).toBe(false);
  });
});

describe('🐉 BOSS ENTRE AMIS — démarrage et fin', () => {
  it('sans réponse de tous, il démarre au bout des 24 h', () => {
    const b = boss();
    expect(bossStartAt(b)).toBe(T0 + FRIEND_BOSS.inviteWindowMs);
    expect(bossPhase(b, T0 + 23 * H)).toBe('recruiting');
    expect(bossPhase(b, T0 + 24 * H)).toBe('active');
  });

  it('tout le monde a répondu : il démarre tout de suite', () => {
    const b = boss({ startAt: T0 + 2 * H });
    expect(bossPhase(b, T0 + 3 * H)).toBe('active');
    expect(bossEndedAt(b)).toBe(T0 + 2 * H + 7 * D);
  });

  it('un démarrage posé APRÈS la fenêtre ne la repousse pas', () => {
    const b = boss({ startAt: T0 + 30 * H });
    expect(bossStartAt(b)).toBe(T0 + 24 * H);
  });

  it('il dure 7 jours, puis expire ; mort, il est fini à sa mort', () => {
    const b = boss({ startAt: T0 });
    expect(bossPhase(b, T0 + 7 * D - 1)).toBe('active');
    expect(bossPhase(b, T0 + 7 * D)).toBe('expired');
    const dead = boss({ startAt: T0, defeatedAt: T0 + 3 * D });
    expect(bossPhase(dead, T0 + 3 * D)).toBe('defeated');
    expect(bossEndedAt(dead)).toBe(T0 + 3 * D);
  });

  it('une part de PV par participant, lanceur compris, en dégâts', () => {
    const dpu = FRIEND_BOSS.damagePerUnit;
    expect(bossHpTotal('push', 1)).toBe(FRIEND_BOSS.shareUnits.push * dpu);
    expect(bossHpTotal('pull', 4)).toBe(4 * FRIEND_BOSS.shareUnits.pull * dpu);
    expect(bossHpTotal('legs', 0)).toBe(FRIEND_BOSS.shareUnits.legs * dpu);
  });

  it('scène : on rejoue les frappes des AUTRES depuis ma visite, et la barre part d’avant elles', () => {
    const hit = (id: string, userId: string, units: number, at: number) => ({
      id,
      bossId: 'b1',
      userId,
      units,
      createdAt: at,
    });
    const b = { id: 'b1', hpTotal: 120_000, damage: 50_000 };
    const hits = [
      hit('old', 'ami', 10, T0), // avant ma visite : déjà dans la barre
      hit('moi', 'me', 20, T0 + 2 * H), // la mienne : pas rejouée
      hit('h1', 'ami', 5, T0 + 3 * H),
      hit('h2', 'ami2', 15, T0 + 4 * H),
      { ...hit('x', 'ami', 30, T0 + 5 * H), bossId: 'autre' },
    ];
    const r = strikesToReplay(b, hits, 'me', T0 + H);
    expect(r.strikes.map((s) => s.id)).toEqual(['h1', 'h2']);
    expect(r.strikes.map((s) => s.damage)).toEqual([5_000, 15_000]);
    expect(r.startHp).toBe(70_000 + 20_000);
    // Au plus `max`, les plus récentes, et jamais au-delà des PV totaux.
    expect(strikesToReplay(b, hits, 'me', T0 + H, 1).strikes.map((s) => s.id)).toEqual(['h2']);
    expect(strikesToReplay({ ...b, damage: 0 }, hits, 'me', 0).startHp).toBe(120_000);
    // Première visite (aucune date) : rien à rejouer.
    expect(strikesToReplay(b, hits, 'me', Number.POSITIVE_INFINITY).strikes).toEqual([]);
    // La silhouette du boss est la même pour tout le groupe.
    expect(bossEmoji('b1')).toBe(bossEmoji('b1'));
  });

  it('une frappe = un projectile par rep, chacun porte ses dégâts et leur somme vaut la frappe', () => {
    expect(BOSS_SHOT_MS).toBe(500);
    expect(strikeShots(bossDamage(12))).toEqual(Array(12).fill(1000));
    expect(strikeShots(bossDamage(1))).toEqual([1000]);
    // Dégâts qui ne tombent pas pile : la somme reste exacte, un projectile par rep.
    const odd = strikeShots(2_500);
    expect(odd).toHaveLength(3);
    expect(odd.reduce((a, b) => a + b, 0)).toBe(2_500);
    for (const d of [0, 999, 30_000, 123_456]) {
      const shots = strikeShots(d);
      expect(shots.length).toBeGreaterThanOrEqual(1);
      expect(shots.reduce((a, b) => a + b, 0)).toBe(d);
    }
  });

  it('un cri par frappe : petit, grand selon la part de PV arrachée, dernier souffle au coup fatal', () => {
    const total = 100_000;
    const light = bossCry(1_000, 80_000, total, 0.5);
    expect(BOSS_CRIES.light).toContain(light);
    const heavy = bossCry(total * BOSS_HEAVY_SHARE, 80_000, total, 0.5);
    expect(BOSS_CRIES.heavy).toContain(heavy);
    expect(BOSS_CRIES.light).toContain(bossCry(total * BOSS_HEAVY_SHARE - 1, 80_000, total, 0.5));
    // Le coup qui abat le boss, même petit.
    expect(BOSS_CRIES.death).toContain(bossCry(1_000, 1_000, total, 0.5));
    expect(BOSS_CRIES.death).toContain(bossCry(5_000, 1_000, total, 0.5));
    // Déterministe pour un tirage donné, bornes de tirage comprises.
    expect(bossCry(1_000, 80_000, total, 0.3)).toBe(bossCry(1_000, 80_000, total, 0.3));
    expect(BOSS_CRIES.light).toContain(bossCry(1_000, 80_000, total, 0));
    expect(BOSS_CRIES.light).toContain(bossCry(1_000, 80_000, total, 1));
    // Tous les cris du registre sont atteignables.
    const seen = new Set<string>();
    for (let k = 0; k < BOSS_CRIES.light.length; k++)
      seen.add(bossCry(1_000, 80_000, total, (k + 0.5) / BOSS_CRIES.light.length));
    expect(seen.size).toBe(BOSS_CRIES.light.length);
  });

  it('jamais deux fois le même cri de suite', () => {
    for (const prev of BOSS_CRIES.light)
      for (let r = 0; r < 1; r += 0.05)
        expect(bossCry(1_000, 80_000, 100_000, r, prev)).not.toBe(prev);
  });

  it('1000 dégâts par rep, et le NOMBRE DE REPS pour abattre le boss ne change pas', () => {
    expect(FRIEND_BOSS.damagePerUnit).toBe(1000);
    expect(bossDamage(12)).toBe(12_000);
    for (const f of Object.keys(FRIEND_BOSS.shareUnits) as (keyof typeof FRIEND_BOSS.shareUnits)[])
      for (const n of [1, 2, 5])
        expect(bossUnitsLeft({ hpTotal: bossHpTotal(f, n), damage: 0 })).toBe(
          FRIEND_BOSS.shareUnits[f] * n,
        );
    // Reste partiel : arrondi au-dessus (comme `fboss_hit`), jamais négatif.
    expect(bossUnitsLeft({ hpTotal: 60_000, damage: 59_500 })).toBe(1);
    expect(bossUnitsLeft({ hpTotal: 60_000, damage: 61_000 })).toBe(0);
    expect(fmtBossPv(120_000)).toMatch(/^120\s000$/);
  });
});

describe('🐉 BOSS ENTRE AMIS — qui peut en lancer un', () => {
  it('un boss en cours bloque, qu’on l’ait lancé OU rejoint', () => {
    const enCours = boss({ startAt: T0 });
    expect(canDeclareBoss({ owned: [enCours], joined: [] }, T0 + D)).toBe(false);
    expect(canDeclareBoss({ owned: [], joined: [enCours] }, T0 + D)).toBe(false);
    // Encore en recrutement : il occupe aussi.
    expect(canDeclareBoss({ owned: [], joined: [boss()] }, T0 + H)).toBe(false);
  });

  it('le lanceur relance 48 h après la MORT du boss (v0.893)', () => {
    const dead = boss({ startAt: T0, defeatedAt: T0 + 3 * D });
    expect(nextDeclareAt([dead])).toBe(T0 + 5 * D);
    expect(canDeclareBoss({ owned: [dead], joined: [] }, T0 + 5 * D - 1)).toBe(false);
    expect(canDeclareBoss({ owned: [dead], joined: [] }, T0 + 5 * D)).toBe(true);
  });

  it('…ou 48 h après la fin des 7 jours s’il a survécu', () => {
    const exp = boss({ startAt: T0 });
    expect(nextDeclareAt([exp])).toBe(T0 + 9 * D);
  });

  it('avoir seulement AIDÉ ne donne aucun délai', () => {
    const aide = boss({ startAt: T0, defeatedAt: T0 + 2 * D });
    expect(canDeclareBoss({ owned: [], joined: [aide] }, T0 + 2 * D)).toBe(true);
  });
});

describe('🐉 BOSS ENTRE AMIS — saisies et récompense', () => {
  const share = FRIEND_BOSS.shareUnits.push;

  it('une saisie est plafonnée : par saisie et aux PV restants', () => {
    const perHit = Math.floor(share * FRIEND_BOSS.hitMaxShare);
    // Sous le plafond, tout passe (valeur dérivée : elle suit la part, pas un nombre écrit).
    expect(acceptedUnits('push', perHit - 5, 9999)).toBe(perHit - 5);
    expect(acceptedUnits('push', 9999, 9999)).toBe(perHit);
    expect(acceptedUnits('push', 100, 7)).toBe(7);
    expect(acceptedUnits('push', -5, 9999)).toBe(0);
  });

  it('la part minimale est un seuil inclusif', () => {
    expect(metMinShare('push', share * FRIEND_BOSS.minShare)).toBe(true);
    expect(metMinShare('push', share * FRIEND_BOSS.minShare - 1)).toBe(false);
  });

  it('XP des reps : même barème que les challenges, la seconde de gainage vaut ¼ de rep', () => {
    expect(bossRepsXp('push', 300, 1)).toBe(120);
    expect(bossRepsXp('push', 300, 1.3)).toBe(156);
    expect(bossRepsXp('core', 1200, 1.3)).toBe(120);
  });

  it('⚠️ l’XP des reps est LINÉAIRE : l’agenda peut la découper par jour sans dériver', () => {
    // L'Agenda affiche une ligne par (boss, JOUR) et y met `bossRepsXp` des reps de ce
    // jour-là. Ça ne vaut que si la fonction est linéaire : un palier ou un bonus de volume
    // ferait que la somme des lignes cesse d'égaler l'XP du total — en silence, puisque
    // aucune porte ne regarde cet écran.
    for (const family of ['push', 'core'] as const) {
      const jours = [60, 60, 50];
      const parJour = jours.reduce((a, u) => a + bossRepsXp(family, u, 1.3), 0);
      const total = bossRepsXp(family, 170, 1.3); // = 60 + 60 + 50
      // Égaux à l'arrondi de chaque jour près (≤ ½ point par ligne), jamais plus.
      expect(Math.abs(parJour - total)).toBeLessThanOrEqual(jours.length / 2);
    }
    // Et c'est bien une droite qui passe par zéro : le double de reps vaut le double d'XP.
    expect(bossRepsXp('push', 200, 1)).toBe(2 * bossRepsXp('push', 100, 1));
    expect(bossRepsXp('push', 0, 1)).toBe(0);
  });

  it('la prime exige la mort du boss ET la part minimale, et plafonne à 2 parts', () => {
    const min = share * FRIEND_BOSS.minShare;
    expect(bossCompletionXp('push', share, 1, false)).toBe(0);
    expect(bossCompletionXp('push', min - 1, 1, true)).toBe(0);
    expect(bossCompletionXp('push', share, 1, true)).toBe(
      Math.round(bossRepsXp('push', share, 1) * FRIEND_BOSS.bonusPct),
    );
    expect(bossCompletionXp('push', share * 5, 1, true)).toBe(
      bossCompletionXp('push', share * FRIEND_BOSS.bonusCapShares, 1, true),
    );
  });

  it('tué tôt : la part de semaine restante', () => {
    expect(earlyKillFraction(boss({ startAt: T0 }))).toBe(0);
    expect(earlyKillFraction(boss({ startAt: T0, defeatedAt: T0 + 7 * D }))).toBe(0);
    expect(earlyKillFraction(boss({ startAt: T0, defeatedAt: T0 + 3.5 * D }))).toBeCloseTo(0.5);
  });
});

describe('🐉 BOSS ENTRE AMIS — un volume EN PLUS, pas un second Défi 360 (v0.869)', () => {
  // Décision de l'utilisateur : le 360 est l'entraînement global de la semaine, le boss un
  // bonus relativement facile. On compare à un groupe du 360 INTERMÉDIAIRE modéré, lu dans
  // la lib du 360 elle-même (séries × reps planifiées, gainage à ~45 s la série).
  const sets = comboWeeklySets('intermediaire', 'moderate');
  const group = (f: string) => sets * (f === 'core' ? 45 : COMBO_PLAN_REPS);

  it('une part vaut au plus 70 % d’un groupe du 360 — et pas rien pour autant', () => {
    for (const [f, units] of Object.entries(FRIEND_BOSS.shareUnits)) {
      expect(units / group(f), f).toBeLessThanOrEqual(0.7);
      expect(units / group(f), f).toBeGreaterThanOrEqual(0.2);
    }
  });
  it('la demi-part qui ouvre le coffre tient dans une seule séance', () => {
    // Moins qu’un groupe du 360 DÉBUTANT léger en entier.
    const easy = comboWeeklySets('debutant', 'light');
    for (const [f, units] of Object.entries(FRIEND_BOSS.shareUnits))
      expect(units * FRIEND_BOSS.minShare, f).toBeLessThanOrEqual(
        easy * (f === 'core' ? 45 : COMBO_PLAN_REPS),
      );
  });
});

describe('🐉 BOSS ENTRE AMIS — la lib et le serveur disent la même chose', () => {
  // ⚠️ Le serveur APPLIQUE les règles, la lib les AFFICHE : deux copies de constantes qui
  // divergeraient feraient annoncer une part, un plafond ou une fenêtre que le serveur
  // refuse. Ce test lit la migration elle-même.
  const sql = fs.readFileSync('supabase/migrations/0067_friend_boss.sql', 'utf8');
  // ⚠️ PLUSIEURS de ces fonctions ont été REDÉFINIES depuis la 0067 (0069, 0070, 0071, 0074,
  // 0075, 0076, 0078) : on compare toujours à la DERNIÈRE définition, celle que le serveur
  // exécute — jamais à celle d'origine, qui n'est plus appliquée nulle part.
  // ⚠️ Lues UNE SEULE fois. `lastDef` est appelée une douzaine de fois, et relire les 78
  // migrations à chaque appel faisait ~940 ouvertures de fichier là où 78 suffisent : sur ce
  // poste (analyse antivirus à chaque ouverture) ça a fait dépasser le délai par défaut sous la
  // charge de la suite complète, alors que le test passait seul. Mesuré : 936 → 78 ouvertures,
  // et la durée du fichier 821 ms → 85 ms. Les fichiers ne bougent pas pendant un run.
  let cache: string[] | null = null;
  const migrations = () =>
    (cache ??= fs
      .readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => fs.readFileSync(`supabase/migrations/${f}`, 'utf8')));
  /** Le corps de la DERNIÈRE définition de `fn`, borné à la fonction (et pas au fichier
   *  entier : une migration qui en redéfinit plusieurs mélangerait leurs corps).
   *  ⚠️ On n'accroche que sur un `create … function` : sans ça, le `grant execute on
   *  function` de fin de fichier passait pour la définition et les tests lisaient trois
   *  lignes de droits au lieu du code. */
  const lastDef = (fn: string) => {
    const re = new RegExp(`create (?:or replace )?function public\\.${fn}\\(`, 'g');
    const bodies = migrations().flatMap((s) => {
      const starts = [...s.matchAll(re)].map((m) => m.index!);
      if (!starts.length) return [];
      const i = starts[starts.length - 1]!;
      const j = s.indexOf('\n$$;', i);
      return [s.slice(i, j < 0 ? undefined : j)];
    });
    return bodies[bodies.length - 1]!;
  };

  it('mêmes parts de PV par famille (dernière définition du serveur)', () => {
    const share = lastDef('fboss_share');
    for (const [family, units] of Object.entries(FRIEND_BOSS.shareUnits))
      expect(share).toContain(`when '${family}' then ${units}`);
  });

  // ── Les NOTIFICATIONS (déclencheurs, 0079) ──────────────────────────────────────
  // ⚠️ Vérifiées en plus sur comptes réels, en transaction annulée : un ami qui rejoint
  // prévient le lanceur, une frappe prévient les autres et pas son auteur, trois frappes
  // dans l'heure ne font qu'un message, et un coup fatal n'en fait aucun (« le boss est
  // tombé » s'en charge). Ces tests-ci gardent les RÈGLES dans la migration.
  it('⚠️ l’auteur d’une frappe n’est jamais prévenu de sa propre frappe', () => {
    expect(lastDef('fboss_push_hit')).toContain('m.user_id <> new.user_id');
  });

  it('⚠️ au plus UNE notification par ami et par heure (les frappes arrivent en rafales)', () => {
    // La clé porte l'AUTEUR (savoir QUI a joué est ce qui a été demandé) ET l'heure (sans
    // quoi une séance de 4 frappes préviendrait 4 fois). `on conflict do nothing` fait le
    // reste : les lignes envoyées ne sont pas supprimées, seulement datées (`sent_at`).
    const hit = lastDef('fboss_push_hit');
    expect(hit).toContain("date_trunc('hour', now())");
    expect(hit).toContain('new.user_id');
    expect(hit).toContain('on conflict (user_id, dedupe) do nothing');
  });

  it('⚠️ le reste de vie ajoute la frappe — sinon il annoncerait celui d’AVANT le coup', () => {
    // `fboss_hit` INSÈRE la frappe avant de mettre à jour les PV : un trigger `after
    // insert` lit donc `damage` d'avant. Vérifié en base : 20 reps sur 100 000 PV
    // annoncent « il reste 80 % », pas 100 %.
    expect(lastDef('fboss_push_hit')).toContain('new.units::bigint * v_dpu');
  });

  it('⚠️ un coup FATAL ne s’annonce pas comme une frappe (un seul message à cet instant)', () => {
    expect(lastDef('fboss_push_hit')).toContain(
      'if v_after >= b.hp_total then return new; end if;',
    );
  });

  it('⚠️ « a rejoint » ne part qu’au passage à ACCEPTED, et jamais au lanceur lui-même', () => {
    // Le même UPDATE écrit aussi « declined » : un refus ne s'annonce pas.
    const j = lastDef('fboss_push_joined');
    expect(j).toContain("new.status <> 'accepted' or old.status = 'accepted'");
    expect(j).toContain('v_owner = new.user_id');
  });

  it('mêmes fenêtres de temps', () => {
    expect(FRIEND_BOSS.inviteWindowMs).toBe(24 * H);
    expect(sql).toContain("interval '24 hours'");
    expect(FRIEND_BOSS.durationMs).toBe(7 * D);
    expect(sql).toContain("public.fboss_start(b) + interval '7 days'");
  });

  it('même délai de relance que la DERNIÈRE définition de fboss_declare (48 h)', () => {
    expect(FRIEND_BOSS.cooldownMs).toBe(48 * H);
    expect(lastDef('fboss_declare')).toContain(
      "public.fboss_ended(b) + interval '48 hours' > now()",
    );
  });

  it('⚠️ 150 pompes par saisie, et saisir encore et encore ne bloque jamais (v0.892)', () => {
    expect(Math.floor(FRIEND_BOSS.shareUnits.push * FRIEND_BOSS.hitMaxShare)).toBe(150);
    // Aucun historique n'entre dans la règle : la 20ᵉ saisie du jour passe comme la 1ʳᵉ.
    // ⚠️ L'arité (famille, demandé, restant, cran) est éprouvée ici : un 5ᵉ paramètre serait
    // le retour d'un historique de 24 h, précisément ce que la v0.892 a retiré.
    expect(acceptedUnits).toHaveLength(4);
    expect(acceptedUnits('push', 150, 9999)).toBe(150);
  });
  it('mêmes plafonds que la DERNIÈRE définition de fboss_hit — et aucun plafond sur 24 h', () => {
    const hit = lastDef('fboss_hit');
    expect(hit).toContain(`floor(v_share * ${FRIEND_BOSS.hitMaxShare})`);
    expect(hit).not.toContain("interval '24 hours'");
    expect(hit).not.toContain('v_day');
  });

  it('mêmes dégâts par rep, appliqués aux PV ET aux dégâts de la DERNIÈRE définition', () => {
    expect(lastDef('fboss_damage_per_unit')).toContain(`select ${FRIEND_BOSS.damagePerUnit};`);
    // Les PV posés au lancement et ceux ajoutés par un membre qui rejoint passent tous deux
    // par la part (cran compris) × les dégâts d'une rep.
    expect(lastDef('fboss_declare')).toContain(
      'public.fboss_share_tier(p_family, p_tier) * public.fboss_damage_per_unit()',
    );
    expect(lastDef('fboss_respond')).toContain(
      'public.fboss_share_tier(family, tier) * public.fboss_damage_per_unit()',
    );
    const hit = lastDef('fboss_hit');
    expect(hit).toContain('damage = damage + v_acc * v_dpu');
    expect(hit).toContain('ceil((b.hp_total - b.damage)::numeric / v_dpu)::integer');
    // ⚠️ Délai explicite : ce test relit les MIGRATIONS sur disque (`lastDef`). Seul il tourne
    // en ~2 s, mais sous la charge de la suite complète il a dépassé les 5 s par défaut et
    // rougissait sans qu'aucune assertion ne soit fausse. Même remède que le test « un convoi
    // n'est jamais déficitaire » (v0.867) : on borne l'attente, on ne touche pas au test.
    // ⚠️ Cette ceinture ne couvrait qu'UN test, et c'est son VOISIN (« le cran est appliqué
    // PARTOUT ») qui a rougi le 2026-09-19 : le remède avait été posé sur le symptôme du jour,
    // pas sur la cause. La cause est désormais supprimée en amont (`migrations()` mémoïsée) —
    // n'ajoute pas un délai par test, la lecture ne se paie plus qu'une fois pour tout le bloc.
  }, 30_000);

  it('même part minimale (dernière définition), même nombre d’invités', () => {
    expect(lastDef('fboss_claim')).toContain(
      `public.fboss_share_tier(b.family, b.tier) * ${FRIEND_BOSS.minShare}`,
    );
    expect(sql).toContain(`cardinality(v_invitees) > ${FRIEND_BOSS.maxInvites}`);
  });

  // ── Les CRANS DE DIFFICULTÉ (v0.904) ────────────────────────────────────────────
  it('mêmes multiplicateurs de cran des deux côtés', () => {
    const mult = lastDef('fboss_tier_mult');
    for (const t of BOSS_TIERS) expect(mult).toContain(`when '${t.id}' then ${t.mult}`);
    // Un cran INCONNU vaut 1 des deux côtés : un boss d'avant les crans (tier NULL) garde
    // exactement les PV qu'il avait, sans migration de données.
    expect(mult).toContain('else 1');
    expect(bossTier(null).id).toBe(BOSS_TIER_DEFAULT);
    expect(bossTier('cran-inexistant').mult).toBe(1);
    expect(bossTier(BOSS_TIER_DEFAULT).mult).toBe(1);
  });

  it('⚠️ le cran est appliqué PARTOUT côté serveur, jamais à moitié', () => {
    // Toute fonction qui compte en « parts » doit lire `fboss_share_tier`, jamais la part
    // nue : une seule qui l'oublierait ferait diverger PV, plafonds ou coffre du cran choisi.
    // ⚠️ Seule exception, et elle ne calcule rien : `fboss_share(p_family) is null` sert à
    // VALIDER qu'une famille existe. On la retire avant de chercher les lectures restantes.
    for (const fn of ['fboss_declare', 'fboss_respond', 'fboss_hit', 'fboss_claim']) {
      const body = lastDef(fn);
      expect(body, fn).toContain('fboss_share_tier(');
      const rest = body
        .replace(/fboss_share_tier\(/g, '')
        .replace(/public\.fboss_share\(p_family\) is null/g, '');
      expect(rest, fn).not.toContain('fboss_share(');
    }
  });

  it('même arrondi de part des deux côtés (un cran à 0,5 sur une part impaire)', () => {
    // Sans le même arrondi, l'écran annoncerait un volume et le serveur en appliquerait un
    // autre. `pull` (30) au cran d'échauffement (×0,5) tombe sur 15, `core` (300) sur 150.
    expect(lastDef('fboss_share_tier')).toContain(
      'round(public.fboss_share(p_family) * public.fboss_tier_mult(p_tier))::integer',
    );
    for (const t of BOSS_TIERS)
      for (const [family, units] of Object.entries(FRIEND_BOSS.shareUnits))
        expect(bossShareUnits(family as never, t.id)).toBe(Math.round(units * t.mult));
  });

  it('un cran inconnu est REFUSÉ au lancement, jamais replié en silence', () => {
    // Un client périmé qui enverrait un id inexistant créerait sinon un boss dont l'écran
    // annoncerait un autre volume que celui que le serveur applique.
    const decl = lastDef('fboss_declare');
    expect(decl).toContain("raise exception 'bad_tier'");
    for (const t of BOSS_TIERS) expect(decl).toContain(`'${t.id}'`);
    expect(bossErrorMessage('bad_tier')).not.toBe('Action impossible pour le moment.');
  });

  it('⚠️ le cran traverse TOUTE la lib, pas seulement l’annonce', () => {
    // Chaque fonction qui compte en parts doit le voir : une seule qui l'ignorerait ferait
    // dire à l'écran autre chose que ce que le serveur applique.
    const share = bossShareUnits('push', 'inhumain'); // 60 × 5 = 300
    expect(share).toBe(300);
    // PV du boss : une part par participant, au cran choisi.
    expect(bossHpTotal('push', 2, 'inhumain')).toBe(bossHpTotal('push', 2, 'serieux') * 5);
    // Plafond d'une saisie : 2,5 parts.
    expect(acceptedUnits('push', 9999, 999_999, 'inhumain')).toBe(750);
    expect(acceptedUnits('push', 9999, 999_999, 'echauffement')).toBe(75);
    // Part minimale du coffre : la moitié de la part du CRAN.
    expect(metMinShare('push', 150, 'inhumain')).toBe(true);
    expect(metMinShare('push', 149, 'inhumain')).toBe(false);
    expect(metMinShare('push', 30, 'serieux')).toBe(true);
    // Prime de complétion : la part minimale ET le plafond suivent le cran.
    expect(bossCompletionXp('push', 149, 1, true, 'inhumain')).toBe(0);
    expect(bossCompletionXp('push', 149, 1, true, 'serieux')).toBeGreaterThan(0);
    expect(bossCompletionXp('push', 9999, 1, true, 'inhumain')).toBe(
      bossCompletionXp('push', 600, 1, true, 'inhumain'),
    );
  });

  it('le cran d’un boss est relu de sa ligne (sinon tout retomberait sur « Sérieux »)', () => {
    const row = {
      id: 'b1',
      owner_id: 'u1',
      family: 'push',
      exercise_id: 'e1',
      exercise_name: 'Pompes',
      rep_weight: 1,
      tier: 'costaud',
      created_at: '2026-09-16T00:00:00Z',
      start_at: null,
      defeated_at: null,
      hp_total: 0,
      damage: 0,
    };
    expect(bossFromRow(row).tier).toBe('costaud');
    // Une ligne d'AVANT les crans n'en a pas : elle vaut « Sérieux », donc ×1.
    const { tier: _t, ...legacy } = row;
    expect(bossFromRow(legacy).tier).toBeNull();
    expect(bossShareUnits('push', bossFromRow(legacy).tier)).toBe(FRIEND_BOSS.shareUnits.push);
  });

  it('⚠️ la récompense monte PLUS VITE que l’effort (sinon le cran dur ne sert à rien)', () => {
    expect(FRIEND_BOSS.rewardExp).toBeGreaterThan(1);
    const boss = (tier: string) => ({
      id: 'b1',
      family: 'push' as const,
      exerciseName: 'Pompes',
      createdAt: 0,
      startAt: 0,
      defeatedAt: 7 * D,
      tier,
    });
    const easy = friendBossChest(boss('serieux'), 'u1', 30);
    const hard = friendBossChest(boss('inhumain'), 'u1', 30);
    const volume = bossShareUnits('push', 'inhumain') / bossShareUnits('push', 'serieux');
    // L'or PAR REP monte : c'est ce que « de plus en plus intéressante » veut dire.
    expect(hard.gold / easy.gold).toBeGreaterThan(volume);
    expect(hard.stones / easy.stones).toBeGreaterThan(volume);
    // Et la chance du trophée suit le cran (étoiles et niveau d'objet — pas le rang).
    expect(bossTier('inhumain').luck).toBeGreaterThan(bossTier('serieux').luck);
  });
});

describe('🐉 BOSS ENTRE AMIS — lectures du store (v0.863)', () => {
  it('une ligne de base devient un boss en millisecondes, poids de rep 1 par défaut', () => {
    const b = bossFromRow({
      id: 'b',
      owner_id: 'u',
      family: 'legs',
      exercise_id: 'ex_squat_bw',
      exercise_name: 'Squat',
      rep_weight: '1.3',
      created_at: '2026-09-14T10:00:00Z',
      start_at: null,
      defeated_at: '2026-09-16T10:00:00Z',
      hp_total: 800,
      damage: 800,
    });
    expect(b.createdAt).toBe(T0);
    expect(b.startAt).toBeNull();
    expect(b.defeatedAt).toBe(T0 + 2 * D);
    expect(b.repWeight).toBe(1.3);
    expect(
      bossFromRow({ ...({} as never), created_at: '2026-09-14T10:00:00Z', rep_weight: null })
        .repWeight,
    ).toBe(1);
  });

  it('le conditionnement nourrit le cardio, le reste la muscu', () => {
    expect(bossXpTrack('conditioning')).toBe('cardio');
    for (const f of ['push', 'legs', 'pull', 'core'] as const) expect(bossXpTrack(f)).toBe('muscu');
  });

  it('XP d’un joueur : ses reps partout, la prime seulement boss mort, participations acceptées seules', () => {
    const vivant = boss({ id: 'b1', startAt: T0 });
    const mort = boss({ id: 'b2', family: 'conditioning', startAt: T0, defeatedAt: T0 + D });
    const m = (
      bossId: string,
      userId: string,
      units: number,
      status: FriendBossMember['status'] = 'accepted',
    ): FriendBossMember => ({
      bossId,
      userId,
      pseudo: userId,
      status,
      units,
      claimed: false,
    });
    // ⚠️ 200 ≥ la part minimale (150) : à 100, « prime même boss vivant » passait au vert.
    const members = [
      m('b1', 'u', 200),
      m('b2', 'u', 300),
      m('b2', 'v', 300),
      m('b1', 'w', 50, 'declined'),
    ];
    const xp = friendBossXp([vivant, mort], members, 'u');
    expect(xp.muscu).toBe(bossRepsXp('push', 200, 1));
    expect(xp.cardio).toBe(
      bossRepsXp('conditioning', 300, 1) + bossCompletionXp('conditioning', 300, 1, true),
    );
    expect(friendBossXp([vivant, mort], members, 'w')).toEqual({ muscu: 0, cardio: 0 });
  });

  it('les refus du serveur sont traduits, un code inconnu reste lisible', () => {
    expect(bossErrorMessage('busy')).toMatch(/déjà un boss/);
    expect(bossErrorMessage('ERROR: cooldown')).toMatch(/48 h/);
    expect(bossErrorMessage('xyz')).toMatch(/impossible/);
  });
});

describe('🐉 BOSS ENTRE AMIS — affichage', () => {
  it('une durée se lit en jours sur une semaine, en heures puis en minutes ensuite', () => {
    expect(fmtBossSpan(3 * D + 4 * H)).toBe('3 j 4 h');
    expect(fmtBossSpan(2 * D)).toBe('2 j');
    expect(fmtBossSpan(5 * H + 38 * 60_000)).toBe('5 h 38');
    expect(fmtBossSpan(23 * H)).toBe('23 h');
    expect(fmtBossSpan(42 * 60_000)).toBe('42 min');
    expect(fmtBossSpan(-5)).toBe('0 min');
  });

  it('chaque famille a son nom et son emoji', () => {
    for (const f of Object.keys(FRIEND_BOSS.shareUnits) as (keyof typeof FRIEND_BOSS.shareUnits)[])
      expect(BOSS_FAMILY_LABEL[f].name.length).toBeGreaterThan(0);
  });
});

describe('🐉 BOSS ENTRE AMIS — ce qui remonte dans l’Agenda', () => {
  // Jour local, comme l'Agenda le calcule pour toutes ses autres sources.
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // ⚠️ Dates construites en LOCAL, comme l'Agenda les lit. Un `Date.UTC` + décalage ferait
  // basculer une frappe du soir au lendemain selon le fuseau, et le regroupement par jour
  // — précisément ce qu'on éprouve — dépendrait de la machine.
  const J = (jour: number, h = 12) => new Date(2026, 8, jour, h).getTime();
  const bossOf = (over: Partial<FriendBoss> = {}): FriendBoss => boss({ id: 'b1', ...over });
  const memb = (over: Partial<FriendBossMember> = {}): FriendBossMember => ({
    bossId: 'b1',
    userId: 'me',
    pseudo: 'Last',
    status: 'accepted',
    units: 0,
    claimed: false,
    ...over,
  });
  const hit = (id: string, units: number, at: number, over: Partial<FriendBossHit> = {}) => ({
    id,
    bossId: 'b1',
    userId: 'me',
    units,
    createdAt: at,
    ...over,
  });

  it('une ligne par (boss, JOUR), avec le détail des frappes et l’XP de leurs reps', () => {
    const e = bossAgendaEntries(
      [bossOf()],
      [memb({ units: 50 })],
      [hit('h1', 20, J(15)), hit('h2', 30, J(15, 18)), hit('h3', 25, J(16))],
      'me',
      dayKey,
    );
    expect(e).toHaveLength(2);
    const j15 = e.find((x) => x.day === '2026-09-15')!;
    expect(j15.units).toEqual([20, 30]);
    expect(j15.total).toBe(50);
    // ⚠️ L'XP vient de la MÊME fonction que le total (`bossRepsXp`) : une seconde formule
    // ici finirait par annoncer autre chose que ce que la piste Muscu compte.
    expect(j15.xp).toBe(bossRepsXp('push', 50, 1));
    expect(j15.title).toBe('Pompes');
    expect(j15.unit).toBe('reps');
    expect(e.find((x) => x.day === '2026-09-16')!.total).toBe(25);
  });

  it('⚠️ la somme des lignes vaut l’XP des reps du total (rien ne se perd au découpage)', () => {
    // C'est CE qui autorise l'agenda à découper par jour : `bossRepsXp` est linéaire.
    const jours = [60, 60, 50];
    const e = bossAgendaEntries(
      [bossOf({ repWeight: 1.3 })],
      [memb({ units: 170 })],
      jours.map((u, i) => hit('h' + i, u, J(15 + i))),
      'me',
      dayKey,
    );
    const somme = e.reduce((a, x) => a + x.xp, 0);
    expect(Math.abs(somme - bossRepsXp('push', 170, 1.3))).toBeLessThanOrEqual(jours.length / 2);
  });

  it('⚠️ les frappes des AUTRES ne remontent jamais dans mon agenda', () => {
    const e = bossAgendaEntries(
      [bossOf()],
      [memb({ units: 20 }), memb({ userId: 'toi', pseudo: 'Knat', units: 999 })],
      [hit('h1', 20, J(15)), hit('h2', 999, J(15), { userId: 'toi' })],
      'me',
      dayKey,
    );
    expect(e).toHaveLength(1);
    expect(e[0]!.total).toBe(20);
  });

  it('⚠️ un boss REFUSÉ ou non rejoint ne compte pas — la règle exacte de friendBossXp', () => {
    // Sinon l'agenda afficherait une XP que le total ignore : `friendBossXp` ne compte que
    // les participations acceptées. Les deux doivent dire la même chose.
    for (const status of ['invited', 'declined'] as const) {
      const hits = [hit('h1', 40, J(15))];
      const members = [memb({ status, units: 40 })];
      expect(bossAgendaEntries([bossOf()], members, hits, 'me', dayKey)).toEqual([]);
      expect(friendBossXp([bossOf()], members, 'me').muscu).toBe(0);
    }
  });

  it('un boss de gainage se compte en SECONDES, pas en reps', () => {
    const e = bossAgendaEntries(
      [bossOf({ family: 'core' })],
      [memb({ units: 300 })],
      [hit('h1', 300, J(15))],
      'me',
      dayKey,
    );
    expect(e[0]!.unit).toBe('s');
    expect(e[0]!.xp).toBe(bossRepsXp('core', 300, 1));
  });

  it('une frappe à zéro ne crée pas de ligne vide', () => {
    expect(bossAgendaEntries([bossOf()], [memb()], [hit('h1', 0, J(15))], 'me', dayKey)).toEqual(
      [],
    );
  });
});

describe('🐉 les frappes groupées par jour', () => {
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Dates en LOCAL : un `Date.UTC` + décalage ferait basculer une frappe du soir au
  // lendemain selon le fuseau, et le groupement — ce qu'on éprouve — dépendrait de la machine.
  const J = (jour: number, h = 12) => new Date(2026, 8, jour, h).getTime();
  const hit = (id: string, units: number, at: number, over: Partial<FriendBossHit> = {}) => ({
    id,
    bossId: 'b1',
    userId: 'me',
    units,
    createdAt: at,
    ...over,
  });

  it('un jour par ligne, le total du jour, et le détail du plus récent au plus ancien', () => {
    const d = bossHitsByDay(
      [hit('a', 10, J(15, 9)), hit('c', 5, J(16)), hit('b', 20, J(15, 18))],
      'b1',
      dayKey,
    );
    expect(d.map((x) => x.day)).toEqual(['2026-09-16', '2026-09-15']); // récent d'abord
    expect(d[1]!.total).toBe(30);
    expect(d[1]!.hits.map((h) => h.id)).toEqual(['b', 'a']);
    // La ligne est datée par la frappe la PLUS RÉCENTE du jour.
    expect(d[1]!.at).toBe(J(15, 18));
  });

  it('⚠️ les frappes d’un AUTRE boss ne s’y mélangent pas', () => {
    const d = bossHitsByDay(
      [hit('a', 10, J(15)), hit('x', 99, J(15), { bossId: 'b2' })],
      'b1',
      dayKey,
    );
    expect(d).toHaveLength(1);
    expect(d[0]!.total).toBe(10);
  });

  it('les frappes de TOUT LE MONDE comptent (c’est l’écran du groupe)', () => {
    const d = bossHitsByDay(
      [hit('a', 10, J(15)), hit('b', 7, J(15), { userId: 'toi' })],
      'b1',
      dayKey,
    );
    expect(d[0]!.total).toBe(17);
  });

  it('une frappe à zéro ne crée pas de ligne', () => {
    expect(bossHitsByDay([hit('a', 0, J(15))], 'b1', dayKey)).toEqual([]);
  });
});
