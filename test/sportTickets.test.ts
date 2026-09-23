import { describe, it, expect } from 'vitest';
import { mulberry32 } from '@/lib/combat';
import { GACHA, emptyPity, pullMany } from '@/lib/gacha';
import {
  SPORT_TICKETS,
  comboTickets,
  levelUpTickets,
  pullPayment,
  ticketCost,
  buildTickets,
  welcomeTicketsDue,
  WELCOME_TICKETS,
} from '@/lib/sportTickets';
import { useGameFx } from '@/composables/useGameFx';
import {
  CHEST_MAX_MULT,
  CHEST_MIN_MULT,
  CHEST_REF_SETS,
  chestEffortMult,
  comboChestMessageId,
  comboChestPlan,
  comboChestReward,
} from '@/lib/comboChest';
import { BOSS_TIERS, friendBossChest } from '@/lib/friendBoss';
import { haulPills } from '@/lib/expedition';

describe('🎟️ tickets du Défi 360 — une semaine de sport', () => {
  it('2 pour un 360 posé, 3 pour un 360 moyen, 5 pour un intense', () => {
    expect(comboTickets(CHEST_MIN_MULT)).toBe(2);
    expect(comboTickets(1)).toBe(SPORT_TICKETS.comboRef);
    expect(comboTickets(CHEST_MAX_MULT)).toBe(5);
  });

  it('le coffre porte les tickets de SON facteur d’effort (le même que l’or et les pierres)', () => {
    for (const sets of [10, 50, CHEST_REF_SETS, 110, 200]) {
      expect(comboChestReward(sets, 30).tickets).toBe(comboTickets(chestEffortMult(sets)));
    }
    // Plus de séries → jamais moins de tickets.
    expect(comboChestReward(135, 30).tickets).toBeGreaterThan(comboChestReward(29, 30).tickets);
  });

  it('un coffre relu depuis la boîte garde ses tickets', () => {
    const plan = comboChestPlan(
      { id: 'c1' },
      [{ id: comboChestMessageId('c1'), gold: 1, tickets: 4, level: 3, resolvedAt: 1 }],
      80,
      30,
      9,
    );
    expect(plan?.record.tickets).toBe(4);
  });
});

describe('🎟️ tickets du boss entre amis — selon le cran', () => {
  it('l’Échauffement ne paie rien (le cran qu’on enchaînerait pour farmer)', () => {
    expect(BOSS_TIERS[0]!.id).toBe('echauffement');
    expect(BOSS_TIERS[0]!.tickets).toBe(0);
  });

  it('plus le cran est dur, plus il paie — et jamais plus qu’un 360 intense', () => {
    for (let i = 1; i < BOSS_TIERS.length; i++) {
      expect(BOSS_TIERS[i]!.tickets).toBeGreaterThan(BOSS_TIERS[i - 1]!.tickets);
    }
    const max = Math.max(...BOSS_TIERS.map((t) => t.tickets));
    expect(max).toBeLessThan(comboTickets(CHEST_MAX_MULT));
  });

  it('le coffre verse exactement les tickets de son cran', () => {
    for (const t of BOSS_TIERS) {
      const chest = friendBossChest(
        {
          id: 'b1',
          family: 'push',
          exerciseName: 'Pompes',
          createdAt: 0,
          startAt: 0,
          defeatedAt: 1000,
          tier: t.id,
        },
        'me',
        30,
      );
      expect(chest.tickets).toBe(t.tickets);
    }
  });
});

describe('🎟️ tickets de niveau', () => {
  it('un par niveau franchi, jamais négatif', () => {
    expect(levelUpTickets(12, 13)).toBe(1);
    expect(levelUpTickets(12, 15)).toBe(3);
    expect(levelUpTickets(15, 15)).toBe(0);
    expect(levelUpTickets(15, 12)).toBe(0);
  });
});

describe('🎟️ payer un tirage', () => {
  it('les tickets d’abord quand ils couvrent le prix', () => {
    expect(pullPayment(1, { tickets: 1, mana: 9999 })).toEqual({ tickets: 1, mana: 0 });
  });

  it('le lot garde sa remise en tickets : 9 utilisés, jamais 10', () => {
    expect(ticketCost(GACHA.multiCount)).toBe(GACHA.multiPaid);
    expect(pullPayment(GACHA.multiCount, { tickets: GACHA.multiPaid, mana: 0 })).toEqual({
      tickets: GACHA.multiPaid,
      mana: 0,
    });
    // Avec 10 ou 50 tickets en poche, un ×10 n'en prend que 9 (le 10ᵉ reste offert).
    for (const t of [GACHA.multiCount, 50]) {
      expect(pullPayment(GACHA.multiCount, { tickets: t, mana: 0 })).toEqual({
        tickets: GACHA.multiPaid,
        mana: 0,
      });
    }
  });

  it('tickets et mana se combinent : le reste du lot se paie en mana', () => {
    const t = 5;
    const missing = (GACHA.multiPaid - t) * GACHA.pullCost;
    expect(pullPayment(GACHA.multiCount, { tickets: t, mana: missing })).toEqual({
      tickets: t,
      mana: missing,
    });
    expect(pullPayment(GACHA.multiCount, { tickets: t, mana: missing - 1 })).toBeNull();
    // Sans ticket : prix plein du lot en mana (9 tirages).
    expect(pullPayment(GACHA.multiCount, { tickets: 0, mana: 99_999 })).toEqual({
      tickets: 0,
      mana: GACHA.multiPaid * GACHA.pullCost,
    });
    expect(pullPayment(1, { tickets: 0, mana: GACHA.pullCost - 1 })).toBeNull();
    expect(pullPayment(1, { tickets: 0, mana: GACHA.pullCost })).toEqual({
      tickets: 0,
      mana: GACHA.pullCost,
    });
  });

  it('les tickets s’affichent dans le butin d’un coffre', () => {
    expect(haulPills({ gold: 5, tickets: 3 })).toContainEqual({ emoji: '🎟️', n: 3 });
    expect(haulPills({ gold: 5 }).some((p) => p.emoji === '🎟️')).toBe(false);
  });
});

/**
 * 📏 CE QUE LES TICKETS COÛTENT AU RYTHME DU GACHA — mesuré sur le VRAI tirage.
 *
 * Débit de mana mesuré (v0.936, une faille fermée par jour) + le tirage offert du jour, plus
 * les tickets d'un joueur RÉGULIER : un 360 moyen (3), un boss Sérieux (1), ~1,5 niveau par
 * semaine → 5,5 tickets/semaine. La spec du gacha vise **10 à 20 S par an** sur la plage
 * réaliste (niveaux 12 à 60) : le test verrouille que les tickets n'en sortent pas.
 */
describe('📏 rythme du gacha avec les tickets', () => {
  const MANA_PER_DAY: Record<number, number> = { 12: 63, 30: 91, 60: 157 };
  const REGULAR_TICKETS_PER_WEEK = comboTickets(1) + BOSS_TIERS[1]!.tickets + 1.5;

  function topsPerYear(pulls: number): number {
    let total = 0;
    const seeds = 40;
    for (let s = 1; s <= seeds; s++) {
      const { results } = pullMany(mulberry32(s), emptyPity(), pulls);
      total += results.filter((r) => r.grade === 'S').length;
    }
    return total / seeds;
  }

  for (const lvl of [12, 30, 60]) {
    it(`niveau ${lvl} : un joueur régulier reste dans la bande 10-20 S par an`, () => {
      const base = (MANA_PER_DAY[lvl]! / GACHA.pullCost + GACHA.freePullsPerDay) * 365;
      const withTickets = Math.round(base + REGULAR_TICKETS_PER_WEEK * 52);
      const tops = topsPerYear(withTickets);
      expect(tops).toBeGreaterThanOrEqual(10);
      expect(tops).toBeLessThanOrEqual(20);
    });
  }
});

describe('🛕 tickets de bienvenue — le Panthéon (v0.1079)', () => {
  it('10 tickets à la pose du Panthéon, rien pour les autres bâtiments', () => {
    expect(WELCOME_TICKETS).toBe(10);
    expect(buildTickets('pantheon')).toBe(10);
    for (const id of ['outpost', 'energy_font', 'labyrinth_gate', 'boss_altar'] as const)
      expect(buildTickets(id)).toBe(0);
  });
  it('10 tickets = un lot ×10 (9 payés) et il en reste', () => {
    expect(WELCOME_TICKETS).toBeGreaterThanOrEqual(ticketCost(10));
  });
});

describe('🎟️ l’animation de gain de tickets', () => {
  it('se joue pour tout gain positif, avec le nombre gagné', () => {
    const fx = useGameFx();
    const avant = fx.queue.value.length;
    fx.celebrateTickets(3, 'Niveau 4 franchi');
    const last = fx.queue.value[fx.queue.value.length - 1]!;
    expect(fx.queue.value.length).toBe(avant + 1);
    expect(last.kind).toBe('tickets');
    expect(last.count).toBe(3);
    expect(last.title).toContain('+3');
    expect(last.quiet).toBeFalsy(); // un vrai moment, pas un bandeau
  });
  it('ne se joue pas pour un gain nul (coffre sans ticket, bâtiment ordinaire)', () => {
    const fx = useGameFx();
    const avant = fx.queue.value.length;
    fx.celebrateTickets(0, 'x');
    fx.celebrateTickets(-2, 'x');
    expect(fx.queue.value.length).toBe(avant);
  });
});

describe('🎟️ rattrapage des tickets de bienvenue (v0.1081)', () => {
  it('un compte qui a DÉJÀ son Panthéon les reçoit une fois, puis plus jamais', () => {
    expect(welcomeTicketsDue(true, false)).toBe(WELCOME_TICKETS);
    expect(welcomeTicketsDue(true, true)).toBe(0); // la marque est posée
  });
  it('sans Panthéon : rien, et rien n’est dû tant qu’il n’est pas bâti', () => {
    expect(welcomeTicketsDue(false, false)).toBe(0);
    expect(welcomeTicketsDue(false, true)).toBe(0);
  });
  it('les deux chemins versent le MÊME nombre — pose et rattrapage ne peuvent pas diverger', () => {
    expect(welcomeTicketsDue(true, false)).toBe(buildTickets('pantheon'));
  });
});
