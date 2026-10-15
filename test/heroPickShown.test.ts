import { describe, expect, it } from 'vitest';
import { heroPickShown, type PartyHeroBlock } from '@/lib/party';

/** 🧝 Le choix d'une équipe ne propose pas un héros indisponible (2026-10-15, demandé). */
describe('heroPickShown', () => {
  it('masqué en expédition et à l’infirmerie', () => {
    expect(heroPickShown('expedition')).toBe(false);
    expect(heroPickShown('infirmary')).toBe(false);
  });
  it('affiché libre, ou refusé par une règle du lieu (qui se dit)', () => {
    const shown: (PartyHeroBlock | null)[] = [null, 'outpost', 'vein'];
    for (const b of shown) expect(heroPickShown(b)).toBe(true);
  });
});
