// 🧭 Conseil de volume à la création d'un Défi 360 (lib/comboVolumeAdvice) : un repère, jamais un
// verdict. Les seuils se règlent dans la lib ; ce test verrouille leur COHÉRENCE avec les
// préréglages de l'app (`comboWeeklySets`) pour qu'un réglage futur ne fasse pas crier au loup sur
// les propres suggestions du produit.
import { describe, expect, it } from 'vitest';
import {
  SHORT_WINDOW_EASE,
  VOLUME_LIGHT_BELOW,
  comboVolumeAdvice,
  volumeTone,
} from '@/lib/comboVolumeAdvice';
import { comboProrata, comboWeeklySets, type ComboVolume } from '@/lib/combo';
import type { Level } from '@/lib/types';

const LEVELS: Level[] = ['debutant', 'intermediaire', 'avance'];
const g = (sets: number, slot = 'push', essential?: boolean) => ({ slot, sets, essential });
/** N groupes essentiels identiques sur la durée donnée. */
const adv = (level: Level, days: number, sets: number, n = 4) =>
  comboVolumeAdvice({
    level,
    duration: days,
    groups: Array.from({ length: n }, (_, i) => g(sets, 'k' + i)),
  });

describe('volumeTone : les seuils par niveau', () => {
  it('léger sous le seuil du niveau, zone de progression, soutenu, très gros', () => {
    for (const level of LEVELS) {
      const light = VOLUME_LIGHT_BELOW[level];
      expect(volumeTone(light - 1, level, false)).toBe('light');
      expect(volumeTone(light, level, false)).toBe('ok');
    }
    expect(volumeTone(13, 'debutant', false)).toBe('ok');
    expect(volumeTone(14, 'debutant', false)).toBe('high');
    expect(volumeTone(19, 'debutant', false)).toBe('high');
    expect(volumeTone(20, 'debutant', false)).toBe('veryHigh');
    expect(volumeTone(17, 'intermediaire', false)).toBe('ok');
    expect(volumeTone(18, 'intermediaire', false)).toBe('high');
    expect(volumeTone(24, 'intermediaire', false)).toBe('veryHigh');
    expect(volumeTone(21, 'avance', false)).toBe('ok');
    expect(volumeTone(22, 'avance', false)).toBe('high');
    expect(volumeTone(28, 'avance', false)).toBe('veryHigh');
  });
  it('une fenêtre courte abaisse les seuils hauts, jamais le seuil léger', () => {
    expect(volumeTone(17, 'intermediaire', true)).toBe('high'); // 18 − 3 = 15 → 17 est « soutenu »
    expect(volumeTone(14, 'intermediaire', true)).toBe('ok');
    expect(volumeTone(21, 'intermediaire', true)).toBe('veryHigh'); // 24 − 3
    expect(volumeTone(9, 'intermediaire', true)).toBe('light');
    expect(SHORT_WINDOW_EASE).toBe(3);
  });
});

describe('comboVolumeAdvice : le rythme hebdomadaire, pas le total de la fenêtre', () => {
  it('9 séries par groupe en 3 jours = 21 par semaine : très gros pour un intermédiaire', () => {
    const a = adv('intermediaire', 3, 9)!;
    expect(a.perWeek).toBe(21);
    expect(a.shortWindow).toBe(true);
    expect(a.tone).toBe('veryHigh');
    expect(a.text).toContain('3 jours');
  });
  it('les mêmes 9 séries étalées sur 7 jours : zone de progression, sans mention de durée courte', () => {
    const a = adv('intermediaire', 7, 9)!;
    expect(a.perWeek).toBe(9);
    expect(a.tone).toBe('light');
    const b = adv('intermediaire', 7, 12)!;
    expect(b.tone).toBe('ok');
    expect(b.text).not.toContain('jours');
  });
  it('4 jours est une fenêtre courte, 5 jours non', () => {
    expect(adv('intermediaire', 4, 10)!.shortWindow).toBe(true);
    expect(adv('intermediaire', 5, 10)!.shortWindow).toBe(false);
  });
  it('la durée est bornée à 3-7 jours (comme le défi)', () => {
    expect(adv('intermediaire', 1, 3)!.perWeek).toBe(7); // 3 × 7 / 3
    expect(adv('intermediaire', 30, 12)!.perWeek).toBe(12);
  });
  it('le ton est neutre : aucun libellé négatif, rien qui bloque', () => {
    for (const tone of ['light', 'ok', 'high', 'veryHigh'] as const) {
      const sets = { light: 2, ok: 12, high: 18, veryHigh: 26 }[tone];
      const a = adv('intermediaire', 7, sets)!;
      expect(a.tone).toBe(tone);
      expect(`${a.title} ${a.text}`).not.toMatch(/interdit|danger|stop|impossible/i);
    }
    // « léger » est présenté comme une bonne option de reprise, pas comme un défaut.
    expect(adv('intermediaire', 7, 2)!.text).toMatch(/reprise/);
    // « très gros » reconnaît le cas voulu.
    expect(adv('intermediaire', 7, 26)!.text).toMatch(/si c’est voulu|c’est voulu/);
  });
});

describe('comboVolumeAdvice : groupes accessoires et groupes très chargés', () => {
  it('un groupe accessoire est comparé à l’échelle d’un essentiel (×0,7)', () => {
    const a = comboVolumeAdvice({
      level: 'intermediaire',
      duration: 7,
      groups: [g(12, 'push', true), g(8, 'biceps', false)], // 8 / 0,7 ≈ 11,4
    })!;
    expect(a.perWeek).toBe(12); // (12 + 11,43) / 2 = 11,7 → 12
    expect(a.tone).toBe('ok');
  });
  it('nomme les groupes nettement plus chargés que l’ensemble', () => {
    const a = comboVolumeAdvice({
      level: 'intermediaire',
      duration: 7,
      groups: [g(12, 'push'), g(12, 'pull'), g(12, 'squat'), g(30, 'biceps')],
    })!;
    // Moyenne 16,5 : « zone de progression » à elle seule, mais un groupe à 30 est « très gros » :
    // le ton monte d'un cran (« soutenu ») et le groupe est nommé.
    expect(a.perWeek).toBe(17);
    expect(a.tone).toBe('high');
    expect(a.hot).toEqual(['biceps']);
  });
  it('un groupe un peu haut seul ne change pas le ton de l’ensemble mais est nommé', () => {
    const a = comboVolumeAdvice({
      level: 'intermediaire',
      duration: 7,
      groups: [g(12, 'push'), g(12, 'pull'), g(12, 'squat'), g(20, 'biceps')],
    })!;
    expect(a.tone).toBe('ok');
    expect(a.hot).toEqual(['biceps']);
  });
  it('rien à nommer quand tout est homogène', () => {
    expect(adv('intermediaire', 7, 12)!.hot).toEqual([]);
  });
  it('aucun groupe avec des séries : pas de conseil', () => {
    expect(comboVolumeAdvice({ level: 'avance', duration: 7, groups: [] })).toBeNull();
    expect(comboVolumeAdvice({ level: 'avance', duration: 7, groups: [g(0)] })).toBeNull();
  });
});

describe('cohérence avec les préréglages de l’app', () => {
  const VOLS: ComboVolume[] = ['light', 'moderate', 'intense'];
  it('sur 7 jours : « léger » → léger, « modéré » → zone de progression, « intense » → zone de progression', () => {
    for (const level of LEVELS) {
      const tone = (v: ComboVolume) =>
        comboVolumeAdvice({
          level,
          duration: 7,
          groups: [
            g(comboProrata(comboWeeklySets(level, v, true), 7), 'push', true),
            g(comboProrata(comboWeeklySets(level, v, false), 7), 'biceps', false),
          ],
        })!.tone;
      expect(tone('light'), level + ' light').toBe('light');
      expect(tone('moderate'), level + ' moderate').toBe('ok');
      expect(tone('intense'), level + ' intense').toBe('ok');
    }
    expect(VOLS).toHaveLength(3);
  });
  it('sur 3 jours, le préréglage « modéré » reste dans la zone de progression (l’arrondi du prorata ne fait pas crier)', () => {
    for (const level of LEVELS) {
      const a = comboVolumeAdvice({
        level,
        duration: 3,
        groups: [g(comboProrata(comboWeeklySets(level, 'moderate', true), 3), 'push', true)],
      })!;
      expect(a.tone, level).toBe('ok');
    }
  });
});
