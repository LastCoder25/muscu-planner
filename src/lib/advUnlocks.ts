// advUnlocks.ts — CALENDRIER DES DÉBLOCAGES de l'Aventure par niveau (pur/testé).
// But : rendre VISIBLE ce que monter d'un niveau apporte. Alimente l'écran de level-up
// (« ce que tu débloques ») et la timeline « À venir » de l'onglet Perso. Dérivé des
// données/règles ACTUELLES : BOSSES (data), talentsEarned (un seul emplacement, au niv. 5), la rareté
// max droppable (rankCeilingForLevel, monte avec le niveau) et EFFECT_MIN_LEVEL (effets/
// signatures gatés en profondeur). Aucune dépendance Vue/Supabase.
import { BOSSES } from '@/data/bosses';
import { rankCeilingForLevel, RANK_ORDER, RARITY_LABEL } from '@/lib/items';
import { TALENT_SLOT_LEVEL } from '@/lib/talents';

type AdvUnlockKind = 'boss' | 'talent' | 'effect' | 'rarity';

export interface AdvUnlock {
  level: number;
  kind: AdvUnlockKind;
  emoji: string;
  title: string;
  detail: string;
}

function buildSchedule(): AdvUnlock[] {
  const out: AdvUnlock[] = [];

  // Boss de palier — src/data/bosses.ts. Les boss lâchent des pièces de set (de voie).
  for (const b of BOSSES) {
    out.push({
      level: b.unlockLevel,
      kind: 'boss',
      emoji: b.emoji,
      title: `Boss : ${b.name}`,
      detail: 'Nouveau boss de palier — bats-le pour des pièces de set (de voie).',
    });
  }

  // L'emplacement de TALENT, UNIQUE (talents.ts TALENT_SLOT_LEVEL / talentsEarned).
  // Les talents se DROPPENT (donjons/boss) ; on en garde le meilleur équipé.
  out.push({
    level: TALENT_SLOT_LEVEL,
    kind: 'talent',
    emoji: '🧠',
    title: 'Emplacement de talent',
    detail: 'Tu peux équiper un talent (ils se droppent en donjon/boss ; garde le meilleur).',
  });

  // RARETÉ MAX DROPPABLE — le pic de rareté de tes drops monte avec le niveau
  // (items.ts rankCeilingForLevel). Chaque nouveau rang atteignable est un vrai palier.
  let prev = rankCeilingForLevel(1);
  for (let lvl = 2; lvl <= 120; lvl++) {
    const c = rankCeilingForLevel(lvl);
    if (c > prev) {
      const rk = RANK_ORDER[c]!;
      out.push({
        level: lvl,
        kind: 'rarity',
        emoji: '✨',
        title: `Rareté : ${RARITY_LABEL[rk]}`,
        detail:
          c >= 5
            ? `Tes drops peuvent atteindre le rang ${RARITY_LABEL[rk]} (effet légendaire possible).`
            : `Tes drops peuvent désormais atteindre le rang ${RARITY_LABEL[rk]}.`,
      });
      prev = c;
    }
  }

  // Effets & SIGNATURES gatés par la profondeur (items.ts EFFECT_MIN_LEVEL). Crit / vol de
  // vie / réduction ne sont PLUS gatés (dispo dès le début) → on n'annonce que ces paliers.
  out.push({
    level: 9,
    kind: 'effect',
    emoji: '🌵',
    title: 'Effet : Épines',
    detail: 'Tes armures peuvent renvoyer une part des dégâts reçus.',
  });
  out.push({
    level: 12,
    kind: 'effect',
    emoji: '🗡️',
    title: 'Signature : Exécution',
    detail: 'Tes armes/reliques peuvent achever les ennemis à bas PV.',
  });
  out.push({
    level: 15,
    kind: 'effect',
    emoji: '🔥',
    title: 'Signature : Rage',
    detail: 'Tu frappes plus fort quand TU es à bas PV.',
  });
  out.push({
    level: 18,
    kind: 'effect',
    emoji: '🌊',
    title: 'Signature : Déferlante',
    detail: 'Tes coups gagnent en puissance au fil du combat.',
  });

  return out.sort((a, b) => a.level - b.level);
}

/** Tout le calendrier, trié par niveau. */
export const ADV_SCHEDULE: AdvUnlock[] = buildSchedule();

/** Déblocages qui deviennent disponibles EXACTEMENT à ce niveau (écran level-up). */
export function unlocksAtLevel(level: number): AdvUnlock[] {
  return ADV_SCHEDULE.filter((u) => u.level === level);
}

/** Prochains déblocages (niveau strictement supérieur), pour la timeline « À venir ». */
export function upcomingUnlocks(level: number, count = 4): AdvUnlock[] {
  return ADV_SCHEDULE.filter((u) => u.level > level).slice(0, count);
}
