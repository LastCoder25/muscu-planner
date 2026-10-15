// 🏷️ Les pastilles du pronostic : la mise en mots, jamais un calcul de combat.
import { describe, expect, it } from 'vitest';
import { attackView, defenseView, interceptView, lossChips, wornChip } from '@/lib/forecastChips';
import type { BattleForecast, DefenseForecast, LossForecast } from '@/lib/defenseForecast';
import { wearLabel } from '@/lib/enemyWear';

const none: LossForecast = { militia: 0, hurt: 0, light: 0, pHurt: 0, pLight: 0, heroHurt: 0 };
const base = (over: Partial<BattleForecast> = {}): BattleForecast => ({
  samples: 24,
  win: 0.6,
  lostSamples: 10,
  dealtIfLost: 0.5,
  wearIfLost: 0.4,
  partAll: 0.8,
  partIfLost: 0.5,
  ifWon: { ...none, militia: 0.5, pLight: 0.2 },
  ifLost: { ...none, militia: 2, pHurt: 0.9, heroHurt: 1 },
  expected: none,
  engaged: { militia: 2, champions: 1, hero: true },
  ...over,
});
const def = (over: Partial<DefenseForecast> = {}): DefenseForecast => ({
  ...base(),
  hold: 0.72,
  vsArmy: true,
  ...over,
});
const texts = (cs: { text: string }[]) => cs.map((c) => c.text).join(' | ');

describe('🏷️ lossChips', () => {
  it('aucune perte → une pastille verte « aucune perte »', () => {
    const c = lossChips(none, 'x');
    expect(c).toHaveLength(1);
    expect(c[0]!.tone).toBe('ok');
  });
  it('dit les miliciens (virgule, pluriel), les blessés graves/légers et le héros', () => {
    const t = texts(
      lossChips({ ...none, militia: 1.4, pHurt: 0.35, pLight: 0.2, heroHurt: 0.5 }, 'x'),
    );
    expect(t).toContain('~1,4 milicien perdu');
    expect(t).toContain('champion blessé 35 %');
    expect(t).toContain('blessé léger 20 %');
    expect(t).toContain('héros blessé 50 %');
    expect(texts(lossChips({ ...none, militia: 3 }, 'x'))).toContain('~3 miliciens perdus');
  });
  it('ignore le bruit de simulation', () => {
    expect(texts(lossChips({ ...none, militia: 0.01, pHurt: 0.01 }, 'x'))).toContain(
      'aucune perte',
    );
  });
});

describe('🏷️ defenseView', () => {
  it('« Tient 72 % » en tête, puis les deux issues', () => {
    const v = defenseView(def(), true);
    expect(v.head[0]!.text).toBe('🛡️ Tient 72 %');
    expect(v.rows.map((r) => r.key)).toEqual(['won', 'lost']);
    expect(texts(v.rows[1]!.chips)).toContain(wearLabel({ share: 0.4, from: 0 }));
  });
  it('tenue à 100 % : pas de ligne « si elle tombe »', () => {
    const v = defenseView(def({ hold: 1, win: 1, lostSamples: 0 }), true);
    expect(v.rows.map((r) => r.key)).toEqual(['won']);
  });
  it('personne ne défend : la tête seule', () => {
    const v = defenseView(def({ hold: 0, win: 0, lostSamples: 0, samples: 0 }), true);
    expect(v.head[0]!.text).toBe('🛡️ Tient 0 %');
    expect(v.rows).toEqual([]);
  });
});

describe('🏷️ attackView / interceptView', () => {
  it('l’assaut dit l’usure de sa troupe en cas d’échec (lieu à usure seulement)', () => {
    expect(texts(attackView(base(), true).rows[1]!.chips)).toContain('affaiblie de 40 %');
    expect(texts(attackView(base(), false).rows[1]!.chips)).not.toContain('affaiblie');
  });
  it('l’interception dit la part abattue et l’amputation en cas d’échec', () => {
    const v = interceptView(base());
    expect(v.head[0]!.text).toContain('~80 %');
    expect(texts(v.rows[1]!.chips)).toContain('amputée ~50 %');
  });
});

describe('🩸 wornChip', () => {
  it('un lieu ennemi usé → la phrase de `wearLabel`', () => {
    const wear = { share: 0.4, from: 0 };
    expect(wornChip({ owner: 'enemy', wear })!.text).toBe(`🩸 Troupe ${wearLabel(wear)}`);
  });
  it('rien pour un lieu à nous ou intact', () => {
    expect(wornChip({ owner: 'player', wear: { share: 0.4, from: 0 } })).toBeNull();
    expect(wornChip({ owner: 'enemy' })).toBeNull();
    expect(wornChip(undefined)).toBeNull();
  });
});
