import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  planHeroParts,
  outfitTier,
  OUTFITS,
  PAULDRON,
  HOOD,
  BASE_FILE,
  RANGER_FROM_RANK,
} from '@/lib/heroModel';
import { RANK_ORDER, type Equipped } from '@/lib/items';

const item = (rarity: string) => ({ rarity }) as unknown as Equipped['armor'];
const eq = (o: Record<string, unknown>) => o as unknown as Equipped;

describe('outfitTier', () => {
  it('bascule sur la tenue supérieure à partir d’Épique', () => {
    expect(outfitTier(RANGER_FROM_RANK - 1)).toBe('peasant');
    expect(outfitTier(RANGER_FROM_RANK)).toBe('ranger');
    expect(outfitTier(RANK_ORDER.length - 1)).toBe('ranger');
  });
});

describe('planHeroParts', () => {
  it('un héros nu ne porte aucune pièce', () => {
    const p = planHeroParts(eq({}));
    expect(p.parts).toEqual([]);
    expect(p.tier).toBeNull();
    expect(p.missing).toEqual([]);
  });

  it('une armure habille les 4 zones du corps, au palier de sa rareté', () => {
    const bas = planHeroParts(eq({ armor: item(RANK_ORDER[0]!) }));
    expect(bas.tier).toBe('peasant');
    expect(bas.parts).toEqual(OUTFITS.peasant);

    const haut = planHeroParts(eq({ armor: item(RANK_ORDER[RANGER_FROM_RANK]!) }));
    expect(haut.tier).toBe('ranger');
    expect(haut.parts).toEqual(OUTFITS.ranger);
  });

  it('accessoire → épaulière, relique → capuche, cumulables avec la tenue', () => {
    const p = planHeroParts(
      eq({ armor: item('commun'), accessory: item('rare'), relic: item('epique') }),
    );
    expect(p.parts).toContain(PAULDRON);
    expect(p.parts).toContain(HOOD);
    expect(p.parts.length).toBe(OUTFITS.peasant.length + 2);
  });

  it('SIGNALE l’arme comme non représentable au lieu de faire semblant', () => {
    expect(planHeroParts(eq({ weapon: item('legendaire') })).missing).toEqual(['weapon']);
    expect(planHeroParts(eq({ armor: item('rare') })).missing).toEqual([]);
  });

  it('ne produit jamais de doublon de pièce', () => {
    const p = planHeroParts(
      eq({ armor: item('primordial'), accessory: item('rare'), relic: item('rare') }),
    );
    expect(new Set(p.parts).size).toBe(p.parts.length);
  });
});

// Garde-fou : la lib nomme des FICHIERS. Si le bundle est régénéré avec d'autres pièces,
// ce test tombe tout de suite au lieu de laisser un 404 silencieux à l'écran.
describe('cohérence avec le bundle servi', () => {
  const dir = path.join(process.cwd(), 'public', 'hero');
  const exists = fs.existsSync(dir);

  it.skipIf(!exists)('chaque pièce nommée existe bien dans public/hero/', () => {
    const files = new Set(fs.readdirSync(dir));
    const needed = [
      BASE_FILE,
      ...OUTFITS.peasant.map((p) => `${p}.gltf`),
      ...OUTFITS.ranger.map((p) => `${p}.gltf`),
      `${PAULDRON}.gltf`,
      `${HOOD}.gltf`,
    ];
    for (const f of needed) expect(files.has(f), `manquant : ${f}`).toBe(true);
  });
});
