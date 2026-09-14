import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  FRIEND_BOSS,
  bossFamily,
  bossUnitLabel,
  isBossExercise,
  bossStartAt,
  bossEndedAt,
  bossPhase,
  bossHpTotal,
  canDeclareBoss,
  nextDeclareAt,
  acceptedUnits,
  metMinShare,
  bossRepsXp,
  bossCompletionXp,
  earlyKillFraction,
  type FriendBoss,
} from '@/lib/friendBoss';

const H = 3600_000;
const D = 24 * H;
const T0 = Date.UTC(2026, 8, 14, 10);

function boss(over: Partial<FriendBoss> = {}): FriendBoss {
  return {
    id: 'b1',
    ownerId: 'u1',
    family: 'push',
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

  it('une part de PV par participant, lanceur compris', () => {
    expect(bossHpTotal('push', 1)).toBe(FRIEND_BOSS.shareUnits.push);
    expect(bossHpTotal('pull', 4)).toBe(4 * FRIEND_BOSS.shareUnits.pull);
    expect(bossHpTotal('legs', 0)).toBe(FRIEND_BOSS.shareUnits.legs);
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

  it('le lanceur relance 7 jours après la MORT du boss', () => {
    const dead = boss({ startAt: T0, defeatedAt: T0 + 3 * D });
    expect(nextDeclareAt([dead])).toBe(T0 + 10 * D);
    expect(canDeclareBoss({ owned: [dead], joined: [] }, T0 + 10 * D - 1)).toBe(false);
    expect(canDeclareBoss({ owned: [dead], joined: [] }, T0 + 10 * D)).toBe(true);
  });

  it('…ou 7 jours après la fin des 7 jours s’il a survécu', () => {
    const exp = boss({ startAt: T0 });
    expect(nextDeclareAt([exp])).toBe(T0 + 14 * D);
  });

  it('avoir seulement AIDÉ ne donne aucun délai', () => {
    const aide = boss({ startAt: T0, defeatedAt: T0 + 2 * D });
    expect(canDeclareBoss({ owned: [], joined: [aide] }, T0 + 2 * D)).toBe(true);
  });
});

describe('🐉 BOSS ENTRE AMIS — saisies et récompense', () => {
  const share = FRIEND_BOSS.shareUnits.push;

  it('une saisie est plafonnée : par saisie, sur 24 h, et aux PV restants', () => {
    const perHit = Math.floor(share * FRIEND_BOSS.hitMaxShare);
    const perDay = Math.floor(share * FRIEND_BOSS.dayMaxShare);
    expect(acceptedUnits('push', 40, 0, 9999)).toBe(40);
    expect(acceptedUnits('push', 9999, 0, 9999)).toBe(perHit);
    expect(acceptedUnits('push', 100, perDay - 10, 9999)).toBe(10);
    expect(acceptedUnits('push', 100, perDay + 50, 9999)).toBe(0);
    expect(acceptedUnits('push', 100, 0, 7)).toBe(7);
    expect(acceptedUnits('push', -5, 0, 9999)).toBe(0);
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

describe('🐉 BOSS ENTRE AMIS — la lib et le serveur disent la même chose', () => {
  // ⚠️ Le serveur APPLIQUE les règles, la lib les AFFICHE : deux copies de constantes qui
  // divergeraient feraient annoncer une part, un plafond ou une fenêtre que le serveur
  // refuse. Ce test lit la migration elle-même.
  const sql = fs.readFileSync('supabase/migrations/0067_friend_boss.sql', 'utf8');

  it('mêmes parts de PV par famille', () => {
    for (const [family, units] of Object.entries(FRIEND_BOSS.shareUnits))
      expect(sql).toContain(`when '${family}' then ${units}`);
  });

  it('mêmes fenêtres de temps', () => {
    expect(FRIEND_BOSS.inviteWindowMs).toBe(24 * H);
    expect(sql).toContain("interval '24 hours'");
    expect(FRIEND_BOSS.durationMs).toBe(7 * D);
    expect(FRIEND_BOSS.cooldownMs).toBe(7 * D);
    expect(sql).toContain("public.fboss_start(b) + interval '7 days'");
    expect(sql).toContain("public.fboss_ended(b) + interval '7 days' > now()");
  });

  it('mêmes plafonds, même part minimale, même nombre d’invités', () => {
    expect(sql).toContain(`floor(v_share * ${FRIEND_BOSS.hitMaxShare})`);
    expect(sql).toContain(`floor(v_share * ${FRIEND_BOSS.dayMaxShare})`);
    expect(sql).toContain(`public.fboss_share(b.family) * ${FRIEND_BOSS.minShare}`);
    expect(sql).toContain(`cardinality(v_invitees) > ${FRIEND_BOSS.maxInvites}`);
  });
});
