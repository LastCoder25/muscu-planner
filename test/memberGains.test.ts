// 🎯🛣️⛑️ Les apports affichés sur la tuile d'un champion, à l'envoi d'une équipe : chacun doit
// égaler l'écart de la pastille qu'il annonce (signalé : la tuile disait +2 % quand la pastille
// « 🎯 Gardes » bougeait de 6 points — elle comptait gardes × route, affiché nulle part).
import { describe, expect, it } from 'vitest';
import {
  firstAidGain,
  partyRoadOdds,
  partyWinChance,
  roadGain,
  winGain,
} from '@/lib/partyForecast';
import {
  firstAidChance,
  refAdvGear,
  refChampionAdv,
  type EscortKit,
  type PartyHero,
} from '@/lib/caravan';
import { signedInt } from '@/lib/compactNumber';
import { advBadges, type Adventurer } from '@/lib/adventurers';
import { EXPE, HARVEST_TYPES, type Poi } from '@/lib/expedition';

const L = 30;
const ROAD: EscortKit = { talents: [], advGear: refAdvGear(L, 3) };
/** Un champion de référence avec SON équipement de référence (`refAdvGear`), comme `camp.test`. */
const champ = (k: number): Adventurer => ({
  ...refChampionAdv(L, k),
  id: `c${k}`,
  gear: {
    weapon: `refGear${k}weapon`,
    armor: `refGear${k}armor`,
    accessory: `refGear${k}accessory`,
    relic: `refGear${k}relic`,
  },
});
const poi = (type: string, level: number): Poi =>
  ({
    id: `p${level}${type}`,
    type,
    level,
    x: EXPE.town.x + 40,
    y: EXPE.town.y,
    distNorm: 0.4,
    spawnedAt: 0,
    expiresAt: 9e15,
    perilous: true,
  }) as Poi;
const pct = (x: number | null) => Math.round((x ?? 0) * 100);

/** Les lieux de récolte gardés de plusieurs niveaux, où gardes ET route se jouent. */
const harvests = [...HARVEST_TYPES].flatMap((t) => [22, 28, 34].map((l) => poi(t, l)));

describe('🎯 sur une récolte sans le héros, la tuile lit les GARDES seuls', () => {
  it('égale l’écart de la pastille « 🎯 Gardes » — et diffère d’un apport gardes × route', () => {
    const [a, b] = [champ(0), champ(1)];
    let differs = 0;
    for (const p of harvests) {
      const g = winGain(
        p,
        { escort: [a, b], hero: null },
        { escort: [b], hero: null },
        ROAD,
        0,
        undefined,
        false,
      );
      const guardsWith = partyWinChance(p, [a, b], ROAD, null, 0, undefined, false);
      if (guardsWith === null) continue;
      const guardsWithout = partyWinChance(p, [b], ROAD, null, 0, undefined, false);
      expect(g, p.id).toBe(pct(guardsWith) - pct(guardsWithout));
      if (g !== winGain(p, { escort: [a, b], hero: null }, { escort: [b], hero: null }, ROAD, 0))
        differs++;
    }
    // Sinon le test ne distinguerait pas le correctif de l'ancien calcul.
    expect(differs, 'aucun lieu où la route change l’apport').toBeGreaterThan(0);
  });
});

describe('🛣️ l’apport à la route', () => {
  it('égale l’écart de la pastille « 🛣️ … % sûre »', () => {
    const [a, b] = [champ(0), champ(1)];
    let moved = 0;
    for (const p of harvests) {
      const r = roadGain(p, [a, b], [b], ROAD);
      const w = partyRoadOdds(p, [a, b], ROAD, null, 40)!.clear;
      const wo = partyRoadOdds(p, [b], ROAD, null, 40)!.clear;
      expect(r, p.id).toBe(pct(w) - pct(wo));
      if (r) moved++;
    }
    expect(moved, 'la route ne bouge jamais : le test ne prouve rien').toBeGreaterThan(0);
  });

  it('une escorte vide vaut 0 % ; hors récolte, pas d’apport', () => {
    const a = champ(0);
    const p = harvests[0]!;
    expect(roadGain(p, [a], [], ROAD)).toBe(pct(partyRoadOdds(p, [a], ROAD, null, 40)!.clear));
    expect(roadGain(poi('camp', 28), [a], [], ROAD)).toBe(null);
  });

  it('avec le héros, la route ne se joue pas : pas d’apport (la règle de la pastille)', () => {
    const [a, b] = [champ(0), champ(1)];
    const hero = { name: 'Toi', level: L } as unknown as PartyHero;
    expect(roadGain(harvests[0]!, [a, b], [b], ROAD, hero)).toBe(null);
  });
});

describe('± un écart signé', () => {
  it('le vrai signe moins, rien devant zéro', () => {
    expect([signedInt(6), signedInt(-2), signedInt(0)]).toEqual(['+6', '−2', '0']);
  });
});

describe('⛑️ l’apport aux premiers secours', () => {
  const healer: Adventurer = { ...champ(0), skills: [{ id: 'care', level: 3 }] };
  const plain: Adventurer = { ...champ(1), skills: [{ id: 'pv', level: 3 }] };

  it('un soigneur l’augmente de sa chance, arrondie comme l’écran', () => {
    const g = firstAidGain([plain, healer], [plain]);
    expect(g).toBeGreaterThan(0);
    expect(g).toBe(pct(firstAidChance([plain, healer])) - pct(firstAidChance([plain])));
  });

  it('un second soigneur apporte moins que le premier (cumul `roleCut`)', () => {
    const h2: Adventurer = { ...healer, id: 'h2' };
    expect(firstAidGain([healer, h2], [healer])).toBeLessThan(firstAidGain([healer], []));
  });

  it('sans compétence de soin, rien', () => {
    expect(firstAidGain([healer, plain], [healer])).toBe(0);
  });
});

describe('🔮 les pastilles de compétences', () => {
  it('portent la valeur de la compétence et la teinte de sa rune', () => {
    const b = advBadges({ ...champ(0), skills: [{ id: 'care', level: 1 }] });
    const care = b.find((x) => x.emoji === '⛑️')!;
    expect(care.effect).toBe('15 % de chances qu’un blessé de la troupe l’évite');
    expect(care.color).toBe('#7bc86c');
  });
});
