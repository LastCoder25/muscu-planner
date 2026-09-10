import { describe, it, expect } from 'vitest';
import {
  CARAVAN,
  canSendCaravan,
  caravanHurtMs,
  caravanLegMin,
  caravanSlots,
  caravanWages,
  escortCombatant,
  heroEquivalentFactor,
  isCaravanClaimable,
  missionXp,
  refAdventurer,
  resolveCaravan,
  roadFoe,
  startCaravan,
  type Caravan,
} from '@/lib/caravan';
import { type Adventurer } from '@/lib/adventurers';
import { simulateCombat } from '@/lib/combat';
import {
  harvestYield,
  travelFactor,
  travelOneWayMin,
  type Poi,
  type PoiType,
} from '@/lib/expedition';

const poi = (over: Partial<Poi> = {}): Poi => ({
  id: 'p',
  type: 'wreck',
  level: 20,
  x: 50,
  y: 50,
  distNorm: 0.5,
  spawnedAt: 0,
  expiresAt: 9e15,
  ...over,
});
const team = (n: number, level = 20, path?: string[]): Adventurer[] =>
  Array.from({ length: n }, (_, i) => ({
    ...refAdventurer(level),
    id: `a${i}`,
    ...(path ? { path } : {}),
  }));
function winPct(escort: Adventurer[], p: Poi, n = 150) {
  const g = escortCombatant(escort);
  const f = roadFoe(p);
  let w = 0;
  for (let s = 0; s < n; s++)
    if (simulateCombat(g, { ...f }, { seed: s * 211 + 7, goldOnWin: 0 }).win) w++;
  return w / n;
}
const avgScrap = (p: Poi, esc: Adventurer[], n = 200) =>
  Array.from({ length: n }, (_, i) => resolveCaravan(p, esc, i * 7919 + 3).scrap).reduce(
    (a, b) => a + b,
    0,
  ) / n;

describe('⚠️ le DANGER DE LA ROUTE est ABSOLU', () => {
  it('les bandits ne dépendent PAS de l’escorte qu’on envoie', () => {
    // C'est LA décision de la feature. `ambushCombatant` (héros) est calibré RELATIVEMENT
    // au combattant qu'on lui passe ; le réutiliser ferait s'adapter les bandits à
    // l'escorte, et « combien d'aventuriers j'envoie » ne voudrait plus rien dire.
    const p = poi();
    const a = roadFoe(p);
    const b = roadFoe(p);
    expect(a).toEqual(b); // il ne dépend que du POI
    expect(a.pv).toBeGreaterThan(0);
  });
  it('envoyer PLUS d’aventuriers change réellement l’issue', () => {
    const p = poi();
    const un = winPct(team(1), p);
    const trois = winPct(team(3), p);
    const quatre = winPct(team(4), p);
    expect(trois).toBeGreaterThan(un + 0.3);
    expect(quatre).toBeGreaterThanOrEqual(trois);
    expect(trois).toBeGreaterThan(0.4);
    expect(trois).toBeLessThan(1); // ça reste un risque, pas une formalité
  });
  it('une route PÉRILLEUSE est réellement plus dure — le drapeau n’est pas décoratif', () => {
    const esc = team(3);
    expect(winPct(esc, poi({ perilous: true }))).toBeLessThan(winPct(esc, poi()));
  });
  it('un POI plus profond envoie des bandits plus forts', () => {
    expect(roadFoe(poi({ level: 40 })).pv).toBeGreaterThan(roadFoe(poi({ level: 10 })).pv);
  });
});

describe('⚠️ la cargaison se paie sur la durée qu’un HÉROS aurait mise', () => {
  it('la caravane est plus LENTE que le héros', () => {
    const p = poi();
    expect(caravanLegMin(p, team(3))).toBeGreaterThan(travelOneWayMin(p.level, p.distNorm));
  });
  it('…mais le facteur de paie est celui du héros, pas le sien', () => {
    // `travelFactor` est SUPER-LINÉAIRE : payer sur le temps réel ferait de la lenteur
    // une prime (×1,75 pour un ralentissement de ×1,5) et la caravane écraserait
    // l'expédition du héros.
    const p = poi();
    const heroH = (2 * travelOneWayMin(p.level, p.distNorm)) / 60;
    expect(heroEquivalentFactor(p)).toBeCloseTo(travelFactor(heroH), 6);
    const vanH = (2 * caravanLegMin(p, team(3))) / 60;
    expect(heroEquivalentFactor(p)).toBeLessThan(travelFactor(vanH));
  });
});

describe('⚠️ ce qu’une caravane rapporte — et ce qu’elle ne rapportera JAMAIS', () => {
  it('aucun ÉQUIPEMENT : ce n’est pas une source de butin', () => {
    // « Le sport est le plafond » : la carte ne doit pas devenir un raccourci vers du
    // stuff hors de sa ligue. Une caravane paie en LOGISTIQUE, point.
    const o = resolveCaravan(poi(), team(3), 42);
    expect(Object.keys(o)).not.toContain('item');
    expect(Object.keys(o)).not.toContain('items');
  });
  it('elle rend une PART mesurée d’une visite du héros — elle complète, elle ne remplace pas', () => {
    // ⚠️ Borne SERRÉE autour de `yieldShare` : un « simplement moins que le héros » laissait
    // passer la suppression de la part (les multiplicateurs de rencontre suffisaient à
    // rester sous la barre). Or c’est ce garde-fou qui tient la règle « la ferraille doit
    // être plus dure à obtenir que l’or » : à part pleine, un convoi rendait 608 🔩/jour
    // au niveau 26 contre 19 pour la Fonderie.
    const p = poi();
    const heros = harvestYield(p.type, p.level, heroEquivalentFactor(p)).scrap;
    const part = avgScrap(p, team(3)) / heros;
    expect(part).toBeGreaterThan(CARAVAN.yieldShare * 0.75);
    expect(part).toBeLessThan(CARAVAN.yieldShare * 1.25);
  });
  it('le plafond d’ÉNERGIE tient APRÈS les multiplicateurs', () => {
    // « complément, jamais substitut au sport » est un invariant, pas une base qu'un
    // bon voyage pourrait dépasser.
    // ⚠️ Il faut FORCER un multiplicateur > 1, sinon le test passe même sans plafond :
    // une escorte 🐫 (cargaison) et des embuscades gagnées poussent `k` au-dessus de 1.
    const p = poi({ type: 'well', level: 90, distNorm: 1 });
    const cap = harvestYield('well', 90, heroEquivalentFactor(p)).energy * CARAVAN.yieldShare;
    const cargo = team(4, 90, ['caravanier', 'convoyeur', 'maitre_convoi', 'intendant']);
    let vu = false;
    for (let s = 0; s < 200; s++) {
      const o = resolveCaravan(p, cargo, s * 977 + 1);
      expect(o.energy).toBeLessThanOrEqual(Math.round(cap) + 1);
      if (o.energy >= Math.round(cap) - 1) vu = true;
    }
    expect(vu, 'aucun voyage n’a approché le plafond : le test ne prouve rien').toBe(true);
  });
  it('elle ne va que sur les POI de RÉCOLTE', () => {
    for (const t of ['camp', 'lair', 'arena'] as PoiType[]) {
      expect(canSendCaravan(poi({ type: t }), team(3))).toBe(false);
    }
    for (const t of ['well', 'shrine', 'archive', 'wreck', 'mine'] as PoiType[]) {
      expect(canSendCaravan(poi({ type: t }), team(3))).toBe(true);
    }
  });
  it('escorte vide ou pléthorique : refusée', () => {
    expect(canSendCaravan(poi(), [])).toBe(false);
    expect(canSendCaravan(poi(), team(CARAVAN.escortMax + 1))).toBe(false);
  });
});

describe('les rôles hors combat servent à quelque chose', () => {
  it('un 🧭 raccourcit le trajet', () => {
    const p = poi();
    const sans = caravanLegMin(p, team(2, 20, ['guerrier']));
    const avec = caravanLegMin(p, team(2, 20, ['eclaireur', 'passeur']));
    expect(avec).toBeLessThan(sans);
  });
  it('un 🐫 grossit la cargaison', () => {
    const p = poi();
    const sans = avgScrap(p, team(2, 20, ['guerrier']));
    const avec = avgScrap(p, team(2, 20, ['caravanier', 'convoyeur']));
    expect(avec).toBeGreaterThan(sans);
  });
  it('un 🩺 raccourcit les convalescences, et l’Infirmerie aussi', () => {
    const soigneur = team(2, 20, ['mage', 'clerc']);
    expect(caravanHurtMs(soigneur)).toBeLessThan(caravanHurtMs(team(2, 20, ['guerrier'])));
    expect(caravanHurtMs(soigneur, 10)).toBeLessThan(caravanHurtMs(soigneur, 0));
  });
});

describe('salaires, XP et garde-fous', () => {
  it('les salaires croissent avec l’escorte et la profondeur — c’est un puits d’or', () => {
    expect(caravanWages(team(3), poi())).toBeGreaterThan(caravanWages(team(1), poi()));
    expect(caravanWages(team(3), poi({ level: 40 }))).toBeGreaterThan(
      caravanWages(team(3), poi({ level: 10 })),
    );
  });
  it('⚠️ l’XP a un RENDEMENT DÉCROISSANT sous le niveau de l’aventurier', () => {
    // Sinon on farme la route la plus courte à l'infini et le choix de destination meurt.
    // ⚠️ À MÊME POI : c’est l’écart de niveau qui doit faire chuter le gain. Comparer
    // deux POI de niveaux différents ne testait que le socle `base`, pas la décroissance —
    // la mutation qui retire le ratio passait donc au vert.
    const facile = poi({ level: 5 });
    expect(missionXp(refAdventurer(30), facile)).toBeLessThan(missionXp(refAdventurer(5), facile));
    // …et une route à son niveau reste pleine.
    expect(missionXp(refAdventurer(5), facile)).toBe(missionXp(refAdventurer(3), facile));
  });
  it('⚠️ le NOMBRE de convois est plafonné — c’est lui qui multiplie l’inflation', () => {
    expect(caravanSlots(0)).toBe(1);
    expect(caravanSlots(1)).toBe(1);
    expect(caravanSlots(999)).toBe(CARAVAN.slotsMax);
    for (let l = 0; l < 60; l++) expect(caravanSlots(l)).toBeLessThanOrEqual(CARAVAN.slotsMax);
  });
});

describe('le convoi lui-même', () => {
  it('est DÉTERMINISTE : même graine, même voyage', () => {
    const a = resolveCaravan(poi(), team(3), 1234);
    const b = resolveCaravan(poi(), team(3), 1234);
    expect(a).toEqual(b);
  });
  it('l’aller et le retour sont symétriques, le rapport lisible à mi-chemin', () => {
    const c = startCaravan('c1', poi(), team(3), 1000, 7);
    expect(c.midAt).toBeGreaterThan(c.sentAt);
    expect(c.returnAt - c.midAt).toBe(c.midAt - c.sentAt);
    expect(c.escort).toHaveLength(3);
  });
  it('⚠️ `claimed === undefined` = DÉJÀ crédité, jamais « à récupérer »', () => {
    // Même règle que les rapports d'expédition : traiter l'absence de champ comme
    // « non réclamé » offrirait une seconde fois le butin de chaque convoi passé.
    const base = startCaravan('c1', poi(), team(3), 0, 7);
    const later = base.returnAt + 1;
    expect(isCaravanClaimable(base, later)).toBe(true);
    expect(isCaravanClaimable({ ...base, claimed: true }, later)).toBe(false);
    const legacy = { ...base } as Caravan;
    delete legacy.claimed;
    expect(isCaravanClaimable(legacy, later)).toBe(false);
  });
  it('rien ne se récupère avant le RETOUR en ville', () => {
    const c = startCaravan('c1', poi(), team(3), 0, 7);
    expect(isCaravanClaimable(c, c.midAt)).toBe(false);
    expect(isCaravanClaimable(c, c.returnAt)).toBe(true);
  });
});
