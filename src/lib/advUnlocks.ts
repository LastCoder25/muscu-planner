// advUnlocks.ts — CALENDRIER DES DÉBLOCAGES de l'Aventure par niveau (pur/testé).
// But : rendre VISIBLE ce que monter d'un niveau apporte (le contenu existe déjà
// — boss, sets, effets d'objet exotiques, étages d'expédition, talents — mais rien
// ne l'annonçait). Alimente l'écran de level-up (« ce que tu débloques ») et la
// timeline « À venir » de l'onglet Perso. Dérivé des données statiques (BOSSES,
// ITEM_SETS) + des paliers codés en dur ailleurs (talents 5/5, EFFECT_MIN_LEVEL,
// floorsForLevel). Aucune dépendance Vue/Supabase.
import { BOSSES } from '@/data/bosses';

export type AdvUnlockKind = 'boss' | 'talent' | 'expedition' | 'effect' | 'endless';

export interface AdvUnlock {
  level: number;
  kind: AdvUnlockKind;
  emoji: string;
  title: string;
  detail: string;
}

function buildSchedule(): AdvUnlock[] {
  const out: AdvUnlock[] = [];

  // Boss de palier — src/data/bosses.ts. Les boss droppent des pièces de set (de voie).
  for (const b of BOSSES) {
    out.push({
      level: b.unlockLevel,
      kind: 'boss',
      emoji: b.emoji,
      title: `Boss : ${b.name}`,
      detail: 'Nouveau boss de palier — bats-le pour des pièces de set (de voie).',
    });
  }

  // Talent tous les 5 niveaux (cf. talents.ts talentsEarned = floor(level/5)).
  for (let lvl = 5; lvl <= 25; lvl += 5) {
    out.push({
      level: lvl,
      kind: 'talent',
      emoji: '🌟',
      title: 'Nouveau talent',
      detail: 'Un talent permanent à choisir (1 parmi 3).',
    });
  }

  // Effets d'objet « exotiques » (cf. items.ts EFFECT_MIN_LEVEL) : de nouveaux
  // types d'effets peuvent désormais tomber sur le butin.
  out.push({
    level: 5,
    kind: 'effect',
    emoji: '🎯',
    title: 'Effet d’objet : Critiques',
    detail: 'Tes objets peuvent désormais rouler un bonus de critique.',
  });
  out.push({
    level: 8,
    kind: 'effect',
    emoji: '🩸',
    title: 'Effet d’objet : Vol de vie',
    detail: 'Tes objets peuvent désormais rouler du vol de vie.',
  });
  out.push({
    level: 9,
    kind: 'effect',
    emoji: '🌵',
    title: 'Effet d’objet : Épines',
    detail: 'Tes armures peuvent désormais renvoyer une part des dégâts reçus.',
  });
  out.push({
    level: 10,
    kind: 'effect',
    emoji: '🛡️',
    title: 'Effet d’objet : Réduction de dégâts',
    detail: 'Tes objets peuvent désormais rouler de la réduction de dégâts.',
  });

  // Étages d'expédition (cf. ExpeditionPage floorsForLevel = min(5, 2+level/5)).
  out.push({
    level: 5,
    kind: 'expedition',
    emoji: '🗝️',
    title: 'Expéditions : 3 étages',
    detail: 'Tes expéditions gagnent un étage (3 au total).',
  });
  out.push({
    level: 10,
    kind: 'expedition',
    emoji: '🗝️',
    title: 'Expéditions : 4 étages',
    detail: 'Tes expéditions gagnent un étage (4 au total).',
  });
  out.push({
    level: 15,
    kind: 'expedition',
    emoji: '🗝️',
    title: 'Expéditions : 5 étages',
    detail: 'Tes expéditions atteignent leur profondeur max (5 étages).',
  });

  // End-game : la Faille sans fin s'ouvre en battant l'Archidémon (palier 25).
  out.push({
    level: 25,
    kind: 'endless',
    emoji: '🌀',
    title: 'Faille sans fin',
    detail: 'Bats l’Archidémon pour ouvrir l’end-game infini.',
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
