import { describe, it, expect } from 'vitest';
import { heroLook, lookEquipped, parseHeroLook, sameLook } from '@/lib/heroLook';
import { SLOTS, weaponKind, wornSet, type Equipped, type Item } from '@/lib/items';

const piece = (over: Partial<Item>): Item =>
  ({
    id: 'x',
    name: 'Hache runique',
    rarity: 'epique',
    level: 30,
    effect: { type: 'damage_pct', value: 12 },
    ...over,
  }) as Item;

const equipped: Equipped = {
  weapon: piece({ slot: 'weapon', name: 'Hache · Carapace de l’Épineux', setId: 'voie:epineux' }),
  armor: piece({ slot: 'armor', name: 'Cuirasse', rarity: 'rare', setId: 'voie:epineux' }),
  familiar: piece({ slot: 'familiar', name: 'Loup', species: 'loup' }),
};

describe('🎭 apparence d’un héros (scène du boss entre amis)', () => {
  it('ne garde que ce qui se dessine : aucune valeur d’effet ni niveau', () => {
    const look = heroLook(equipped, 'puissant', 'epineux');
    expect(look.profile).toBe('puissant');
    expect(look.voie).toBe('epineux');
    expect(look.familiar).toBe('loup');
    expect(look.gear.weapon).toEqual({
      name: 'Hache · Carapace de l’Épineux',
      rarity: 'epique',
      setId: 'voie:epineux',
    });
    expect(JSON.stringify(look)).not.toMatch(/damage_pct|"level"|effect/);
  });

  it('l’avatar dessiné depuis le look a la même arme et le même set que le vrai héros', () => {
    const drawn = lookEquipped(heroLook(equipped, 'puissant', 'epineux'));
    expect(weaponKind(drawn.weapon)).toBe('hache');
    expect(weaponKind(equipped.weapon)).toBe('hache');
    expect(wornSet(equipped, 'epineux')?.set.id).toBe('voie:epineux');
    expect(wornSet(drawn, 'epineux')?.set.id).toBe('voie:epineux');
    expect(drawn.familiar?.species).toBe('loup');
  });

  it('aller-retour base : relu identique, donc aucune réécriture inutile', () => {
    const look = heroLook(equipped, 'agile', null);
    const back = parseHeroLook(JSON.parse(JSON.stringify(look)));
    expect(back).toEqual(look);
    expect(sameLook(back, look)).toBe(true);
    expect(sameLook(back, heroLook({}, 'agile', null))).toBe(false);
  });

  it('relecture défensive : un look écrit par un autre client ne fait jamais planter', () => {
    expect(parseHeroLook(null)).toBeNull();
    expect(parseHeroLook('x')).toBeNull();
    const bad = parseHeroLook({
      profile: 'dieu',
      voie: 3,
      gear: { weapon: { name: 'Lame', rarity: 'SSS+' }, armor: { name: 7 }, relic: 'x' },
      familiar: 42,
    });
    expect(bad).toEqual({ profile: 'polyvalent', voie: null, gear: {} });
  });

  // ⚠️ 7 emplacements depuis la refonte : le look doit tenir dans la limite du serveur
  // (`fboss_set_look`, 2 000 octets, migr. 0072), même au pire — 7 noms de 60 caractères
  // accentués (2 octets chacun en UTF-8), chacun avec un set.
  it('tient sous 2 000 octets avec les 7 emplacements au pire', () => {
    const long = 'é'.repeat(150); // au-delà de la troncature : sans elle, 2 100 octets
    const eq: Equipped = {};
    for (const slot of SLOTS)
      eq[slot] = {
        id: slot,
        slot,
        name: long,
        emoji: '',
        rarity: 'primordial',
        level: 1,
        baseLevel: 1,
        effect: { type: 'damage_pct', value: 1 },
        setId: 'voie:frenetique',
      } as Item;
    const look = heroLook(eq, 'polyvalent', 'frenetique');
    expect(Object.keys(look.gear)).toHaveLength(SLOTS.length);
    expect(new TextEncoder().encode(JSON.stringify(look)).length).toBeLessThan(2000);
  });
});
