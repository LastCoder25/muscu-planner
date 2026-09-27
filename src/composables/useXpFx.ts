// useXpFx — overlay d'XP GAGNÉE après une activité sportive : montre le cercle du
// niveau de l'ACTIVITÉ + celui du niveau GLOBAL, chacun animant sa progression
// « d'avant → après » (avec level-up), l'un après l'autre. Singleton (App.vue monte
// XpGainOverlay). Ticket 24816d81.
import { ref } from 'vue';

/** La piste d'un anneau : elle décide de sa COULEUR. Une couleur par piste, pour que
 *  les deux anneaux (activité + Global) ne se lisent pas comme le même. */
export type XpKind = 'muscu' | 'cardio' | 'tennis' | 'prepa' | 'sport' | 'global';

/** Teinte d'un anneau. Global garde l'accent du thème (c'est le niveau qui pilote
 *  l'Aventure) ; les pistes prennent des couleurs FIXES, choisies hors du jaune de
 *  l'accent pour ne jamais se confondre avec lui, quel que soit le thème. */
export const XP_KIND_COLOR: Record<XpKind, string> = {
  muscu: '#ff6a45',
  cardio: '#4fc3f7',
  tennis: '#b6e04a',
  prepa: '#ffb23f',
  sport: '#b98cff',
  global: 'var(--accent)',
};

export interface XpRing {
  emoji: string;
  label: string;
  fromLevel: number;
  fromPct: number; // 0..100 (avancement dans le niveau AVANT)
  toLevel: number;
  toPct: number; // 0..100 APRÈS
  /** XP gagnée, affichée en gros (« +142 XP ») ; absente → pas de chiffre. */
  gain?: number;
  /** Couleur de l'arc (CSS). */
  color?: string;
}

/** Ce qu'un appelant connaît d'un niveau : `computeLevel` le rend tel quel. */
interface LevelLike {
  level: number;
  progressPct: number;
  xp?: number;
}

/** Construit un anneau depuis deux relevés de niveau (avant / après). Le gain vaut la
 *  différence d'XP des deux relevés, sauf si l'appelant le donne (le niveau d'une tuile
 *  de sport suit des MINUTES, pas de l'XP : son `xp` n'est pas un gain d'XP). */
export function xpRing(
  kind: XpKind,
  emoji: string,
  label: string,
  before: LevelLike,
  after: LevelLike,
  gain?: number,
): XpRing {
  const g = gain ?? (before.xp != null && after.xp != null ? after.xp - before.xp : undefined);
  return {
    emoji,
    label,
    fromLevel: before.level,
    fromPct: before.progressPct,
    toLevel: after.level,
    toPct: after.progressPct,
    color: XP_KIND_COLOR[kind],
    ...(g != null && g > 0 ? { gain: Math.round(g) } : {}),
  };
}

/** Les tronçons que l'arc parcourt, dans l'ordre : sans montée de niveau, un seul
 *  (avant → après) ; avec, il va jusqu'au bout, repart de zéro, et ainsi de suite.
 *  ⚠️ Sans ce découpage, un passage de niveau faisait RECULER l'arc (40 % → 20 %).
 *  Au-delà de deux niveaux gagnés d'un coup, les tours intermédiaires sont fondus en un
 *  seul : l'animation doit rester courte. */
export function xpSegments(r: XpRing): { from: number; to: number }[] {
  const ups = Math.max(0, r.toLevel - r.fromLevel);
  if (ups === 0) return [{ from: r.fromPct, to: Math.max(r.fromPct, r.toPct) }];
  const segs = [{ from: r.fromPct, to: 100 }];
  if (ups >= 2) segs.push({ from: 0, to: 100 });
  segs.push({ from: 0, to: r.toPct });
  return segs;
}

interface XpFxEvent {
  id: number;
  rings: XpRing[];
}

const current = ref<XpFxEvent | null>(null);
let seq = 0;

export function useXpFx() {
  // N'affiche que s'il y a un vrai gain (évite l'overlay pour 0 XP).
  function show(rings: XpRing[]): void {
    const meaningful = rings.some(
      (r) => r.toLevel > r.fromLevel || Math.abs(r.toPct - r.fromPct) >= 1 || (r.gain ?? 0) > 0,
    );
    if (!meaningful) return;
    current.value = { id: ++seq, rings };
  }
  function dismiss(): void {
    current.value = null;
  }
  return { current, show, dismiss };
}
