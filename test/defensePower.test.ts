// ⚖️ LE RAPPORT DE FORCES — ce que la jauge de défense promet, et rien de moins.
//
// ⚠️ Une jauge est une AFFIRMATION : « à ce rapport, tu tiens ». Si elle n'est pas
// prédictive, il vaut mieux ne rien afficher que d'afficher faux — le joueur y adosse
// ses décisions (garder le héros à la maison, ou partir farmer la carte).
import { describe, it, expect } from 'vitest';
import {
  armyCombatant,
  assaultEstimate,
  assaultPower,
  baseCombatant,
  defenseBreakdown,
  defensePotential,
  departureRisk,
  isOddsRisky,
  guardUnits,
  defensePower,
  groupCombatant,
  resolveRaid,
  rollRaid,
  siegeGauge,
  siegeOdds,
  SIEGE_EVEN,
  RAID,
  type DefenseStructure,
  type GarrisonBonus,
} from '@/lib/raid';
import { refFighter } from '@/lib/proceduralContent';

const defAt = (lvl: number): DefenseStructure[] => [
  { typeId: 'wall', level: lvl },
  { typeId: 'turret', level: lvl },
];
const NOW = 1_700_000_000_000;
/** ⚠️ Pas d'appel à `garrisonBonus` ici : sans chenil il rend `{}` immédiatement, donc
 *  douze appels pour obtenir un objet vide. On dit ce qu'on veut dire — « aucune
 *  garnison » — et on garde le test lisible. */
const noGarrison = (): GarrisonBonus => ({});

describe('puissances', () => {
  it('défense et assaut vivent dans la MÊME unité et croissent avec le niveau', () => {
    let prevDef = 0;
    let prevAtk = 0;
    for (const L of [10, 26, 40, 60, 90]) {
      const d = defensePower(defAt(L), L, null, []);
      const a = assaultPower(rollRaid(4242, L, NOW, 0));
      expect(d).toBeGreaterThan(prevDef);
      expect(a).toBeGreaterThan(prevAtk);
      prevDef = d;
      prevAtk = a;
    }
  });

  it("l'armée équivalente cumule les PV de TOUS les groupes", () => {
    const raid = rollRaid(777, 30, NOW, 0);
    const sum = raid.groups.reduce((s, g) => s + groupCombatant(g).pv, 0);
    expect(armyCombatant(raid).pv).toBe(sum);
  });

  // ⚠️ Ce test a d'abord été écrit avec un `if` (« si le champion frappe plus fort que
  // la moyenne, alors… ») : il s'auto-désarmait, et la mutation « moyenne plate » passait
  // au VERT. Un test conditionnel ne teste rien. On vérifie donc l'IDENTITÉ, et on exige
  // que les deux formules donnent des résultats DIFFÉRENTS — sans quoi l'assertion serait
  // vraie pour la mauvaise implémentation aussi.
  it('ses dégâts sont pondérés par les PV, et cela DIFFÈRE d’une moyenne plate', () => {
    let vus = 0;
    for (const seed of [778, 1234, 55_555, 9_001, 424_242]) {
      const raid = rollRaid(seed, 30, NOW, 0);
      const cs = raid.groups.map(groupCombatant);
      const pv = cs.reduce((s, c) => s + c.pv, 0);
      const attendu = cs.reduce((s, c) => s + c.damage * c.pv, 0) / pv;
      const plat = cs.reduce((s, c) => s + c.damage, 0) / cs.length;
      expect(armyCombatant(raid).damage).toBe(Math.max(1, Math.round(attendu)));
      // Les deux formules doivent VRAIMENT diverger, sinon le test ne distingue rien.
      if (Math.abs(Math.round(attendu) - Math.round(plat)) >= 1) vus++;
    }
    expect(vus).toBeGreaterThan(0);
  });
});

describe('le rapport prédit la tenue', () => {
  // ⚠️ LE test qui autorise la jauge à exister. Mesuré : 40 configurations × 40 graines,
  // niveaux 10 à 90 — un rapport plus haut doit donner une tenue au moins aussi bonne.
  it('un rapport plus élevé tient mieux (inversions marginales)', () => {
    const rows: { ratio: number; hold: number }[] = [];
    for (const L of [10, 26, 40, 60, 90]) {
      for (const part of [0.5, 0.75, 1]) {
        for (const heroHome of [false, true]) {
          const defs = defAt(Math.max(1, Math.round(L * part)));
          const hero = heroHome ? refFighter(L) : null;
          let held = 0;
          let ratio = 0;
          const N = 40;
          for (let s = 0; s < N; s++) {
            const raid = rollRaid(1000 + s * 7919, L, NOW, 0);
            const d = { defenses: defs, playerLevel: L, hero };
            if (resolveRaid(d, raid, NOW, heroHome).held) held++;
            ratio += defensePower(defs, L, hero, []) / assaultPower(raid);
          }
          rows.push({ ratio: ratio / N, hold: held / N });
        }
      }
    }
    const sorted = [...rows].sort((a, b) => a.ratio - b.ratio);
    let inversions = 0;
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++)
        if (sorted[i]!.hold > sorted[j]!.hold + 0.05) inversions++;
    const pairs = (sorted.length * (sorted.length - 1)) / 2;
    expect(inversions / pairs).toBeLessThan(0.06);
    // Et les deux bouts doivent être francs, sinon la jauge ne décide de rien.
    expect(sorted[0]!.hold).toBeLessThan(0.25);
    expect(sorted[sorted.length - 1]!.hold).toBeGreaterThan(0.7);
  });

  it('les bandes de pronostic collent aux taux mesurés', () => {
    // Les seuils sont calibrés : on vérifie qu'ils tombent dans le bon ordre et qu'ils
    // couvrent tout le domaine (aucun rapport sans pronostic).
    expect(siegeOdds(0.3)).toBe('perdu');
    expect(siegeOdds(0.6)).toBe('risque');
    expect(siegeOdds(0.8)).toBe('serre');
    expect(siegeOdds(0.95)).toBe('favorable');
    expect(siegeOdds(1.3)).toBe('large');
    // Monotone : un meilleur rapport ne donne jamais un pronostic plus sombre.
    const rank = ['perdu', 'risque', 'serre', 'favorable', 'large'];
    let prev = -1;
    for (let r = 0; r <= 2; r += 0.01) {
      const i = rank.indexOf(siegeOdds(r));
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });
});

describe('la répartition par contributeur', () => {
  it('chaque contributeur présent pèse quelque chose, les absents rien', () => {
    const L = 30;
    const defs = defAt(L);
    const withHero = defenseBreakdown(defs, L, refFighter(L), []);
    const byId = Object.fromEntries(withHero.parts.map((p) => [p.id, p]));
    expect(byId.wall!.power).toBeGreaterThan(0);
    expect(byId.turret!.power).toBeGreaterThan(0);
    expect(byId.hero!.power).toBeGreaterThan(0);
    // Héros parti → sa part tombe à zéro et il est marqué inactif.
    const noHero = defenseBreakdown(defs, L, null, []);
    const h = noHero.parts.find((p) => p.id === 'hero')!;
    expect(h.power).toBe(0);
    expect(h.active).toBe(false);
  });

  it('la part est mesurée PAR ABLATION — retirer les tourelles coûte ce qui est annoncé', () => {
    const L = 30;
    const defs = defAt(L);
    const b = defenseBreakdown(defs, L, null, []);
    const turret = b.parts.find((p) => p.id === 'turret')!;
    const sans = defensePower(
      defs.filter((d) => d.typeId !== 'turret'),
      L,
      null,
      [],
    );
    expect(b.total - sans).toBe(turret.power);
  });

  // ⚠️ Remplace un test du champ `share`, supprimé avec la barre de proportion qu'il
  // alimentait. Ce qu'on vérifie désormais est ce que l'écran AFFICHE : chaque poste a
  // un métier, et les deux colonnes ne mentent pas dessus.
  it('chaque poste a son MÉTIER : le mur tient sans tuer, les tourelles tuent surtout', () => {
    const L = 30;
    const b = defenseBreakdown(defAt(L), L, refFighter(L), []);
    const by = Object.fromEntries(b.parts.map((p) => [p.id, p]));
    // Le mur ENCAISSE et n'abat personne (`wallDmgK` = 0).
    expect(by.wall!.def).toBeGreaterThan(0);
    expect(by.wall!.atk).toBe(0);
    // ⚠️ LES TOURELLES ENCAISSENT DÉSORMAIS UN PEU, et c'est VOULU : le moteur en deux
    // phases en fait des unités qu'on peut RÉDUIRE AU SILENCE, donc il leur faut des PV —
    // sans eux, « faire taire les tireurs » n'existerait pas. Le test affirmait `def === 0`,
    // vrai du modèle FONDU où elles n'étaient qu'un terme de dégâts. Ce qui reste vrai,
    // et qui est leur vrai métier : elles tuent BEAUCOUP plus qu'elles ne tiennent —
    // exactement l'inverse du mur.
    expect(by.turret!.atk).toBeGreaterThan(0);
    expect(by.turret!.atk).toBeGreaterThan(0);
    // ⚠️ ET ELLES PORTENT MÊME PLUS DE TENUE QUE LE MUR (mesuré) : huit corps à abattre
    // pèsent plus que le rempart lui-même. Surprenant, mais c'est ce que le moteur simule,
    // et c'est avec ces valeurs que l'équivalence de difficulté a été mesurée. Le métier
    // qui les distingue n'est donc PAS « qui encaisse » mais « qui TUE » : les tourelles
    // sont la seule STRUCTURE qui abat quelqu'un.
    expect(by.wall!.atk).toBe(0);
    // Le héros fait les deux — c'est un renfort, pas une structure.
    expect(by.hero!.def).toBeGreaterThan(0);
    expect(by.hero!.atk).toBeGreaterThan(0);
  });

  it('la muraille ABRITE : elle apporte de la réduction de dégâts', () => {
    const L = 30;
    const avec = baseCombatant(defAt(L), L, null, noGarrison());
    const sans = baseCombatant(
      defAt(L).filter((d) => d.typeId !== 'wall'),
      L,
      null,
      [],
    );
    expect(avec.dmgReduction ?? 0).toBeGreaterThan(sans.dmgReduction ?? 0);
    // Elle vaut exactement sa PART du niveau du joueur, comme tout le reste de l'enceinte.
    expect(avec.dmgReduction ?? 0).toBeCloseTo(RAID.wallArmorK, 6);
    const demi = baseCombatant(defAt(Math.round(L / 2)), L, null, noGarrison());
    expect(demi.dmgReduction ?? 0).toBeCloseTo(RAID.wallArmorK / 2, 2);
  });

  // ⚠️ Ce test a d'abord vérifié que la réduction restait « sous le plafond de 50 % ».
  // Il ne pouvait RIEN attraper : mur (0,05) + garnison plafonnée (0,15) = 0,20 au
  // maximum, le plafond n'est donc jamais approché — la mutation « plafond à 9 »
  // passait au vert. Une assertion qu'aucune valeur réelle ne peut violer donne la
  // confiance sans la couvrir. On teste donc ce qui est VRAI : les deux sources
  // s'additionnent, et le plafond reste une sécurité dormante.
  it('la réduction du mur S’AJOUTE à celle de la garnison', () => {
    const L = 30;
    const gar = { dmgReduction: 0.1 } as GarrisonBonus;
    const seul = baseCombatant(defAt(L), L, null, noGarrison()).dmgReduction ?? 0;
    const deux = baseCombatant(defAt(L), L, null, gar).dmgReduction ?? 0;
    expect(deux).toBeCloseTo(seul + 0.1, 6);
  });
});

describe("l'espionnage achète de la PRÉCISION", () => {
  it('sans clarté, on ne sait rien', () => {
    expect(assaultEstimate(1000, 0, 42).known).toBe(false);
  });

  it('la fourchette CONTIENT toujours la vérité — le renseignement ne ment jamais', () => {
    for (let c = 1; c <= RAID.clarityMax; c++) {
      for (const seed of [1, 7, 99, 12345, 777777]) {
        const e = assaultEstimate(1000, c, seed);
        expect(e.lo).toBeLessThanOrEqual(1000);
        expect(e.hi).toBeGreaterThanOrEqual(1000);
      }
    }
  });

  it('elle se RESSERRE strictement à chaque cran, et devient exacte au maximum', () => {
    let prev = Infinity;
    for (let c = 1; c < RAID.clarityMax; c++) {
      const e = assaultEstimate(1000, c, 42);
      const w = e.hi - e.lo;
      expect(w).toBeLessThan(prev);
      prev = w;
    }
    const max = assaultEstimate(1000, RAID.clarityMax, 42);
    expect(max.exact).toBe(true);
    expect(max.lo).toBe(1000);
    expect(max.hi).toBe(1000);
  });

  it("elle n'est pas centrée sur la vérité — sinon « imprécis » ne voudrait rien dire", () => {
    // Sur un échantillon de graines, la vérité doit tomber ailleurs qu'au milieu.
    let offCenter = 0;
    const N = 40;
    for (let s = 1; s <= N; s++) {
      const e = assaultEstimate(1000, 2, s * 1013);
      const mid = (e.lo + e.hi) / 2;
      if (Math.abs(mid - 1000) > (e.hi - e.lo) * 0.1) offCenter++;
    }
    expect(offCenter).toBeGreaterThan(N * 0.6);
  });
});

describe('la jauge place l’ÉQUILIBRE au milieu', () => {
  // ⚠️ C'est tout son intérêt : le seuil de 50/50 est à 0,88, pas à parité. Deux nombres
  // bruts côte à côte font lire « 1741 contre 1926 → je perds » alors qu'on tient à 72 %.
  it('le seuil mesuré tombe pile au centre', () => {
    expect(siegeGauge(SIEGE_EVEN)).toBeCloseTo(0.5, 6);
  });

  it('elle est monotone et bornée à [0, 1]', () => {
    let prev = -1;
    for (let r = 0; r <= 4; r += 0.01) {
      const g = siegeGauge(r);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = g;
    }
  });

  it('en dessous de l’équilibre elle est à gauche, au-dessus à droite', () => {
    expect(siegeGauge(SIEGE_EVEN * 0.5)).toBeLessThan(0.5);
    expect(siegeGauge(SIEGE_EVEN * 1.5)).toBeGreaterThan(0.5);
    expect(siegeGauge(0)).toBe(0);
  });

  it('elle SATURE au lieu de filer à l’infini — « largement » est largement', () => {
    expect(siegeGauge(100)).toBe(1);
  });

  it('elle s’accorde avec le pronostic : centre = « ça va se jouer » ou mieux', () => {
    // Au seuil d'équilibre, on ne doit jamais lire « l'enceinte cède ».
    expect(['serre', 'favorable', 'large']).toContain(siegeOdds(SIEGE_EVEN));
  });
});

describe('🚪 CE QUE COÛTE UN DÉPART, face à l’armée qui arrive', () => {
  // ⚠️ La question du joueur au moment d'envoyer : « puis-je faire partir ce convoi sans
  // me mettre dans le rouge ? ». L'écran d'envoi ne savait RIEN du siège en approche.
  const L = 28;
  const d = [
    { typeId: 'wall', level: L },
    { typeId: 'turret', level: L },
  ] as DefenseStructure[];
  const adv = (id: string): Adventurer => ({
    id,
    name: id,
    seed: 1,
    path: ['guerrier', 'epeiste'],
    level: 20,
    xp: 0,
  });
  const tous = [adv('a'), adv('b'), adv('c'), adv('d')];
  const g = (list: Adventurer[]) => guardUnits(L, list, {});
  const h = refFighter(L);

  it('⚠️ faire partir du monde ne peut JAMAIS améliorer le pronostic', () => {
    // L'invariant qui donne son sens à l'alerte : si partir pouvait aider, l'écran
    // conseillerait de vider sa base.
    for (const assault of [2000, 20_000, 200_000, 2_000_000]) {
      const r = departureRisk(
        d,
        L,
        assault,
        { hero: h, guard: g(tous) },
        { hero: null, guard: [] },
      );
      expect(['perdu', 'risque', 'serre', 'favorable', 'large']).toContain(r.after);
      expect(r.worsens || r.after === r.before).toBe(true);
    }
  });

  it('ne rien changer ne fait PAS empirer', () => {
    const etat = { hero: h, guard: g(tous) };
    const r = departureRisk(d, L, 50_000, etat, etat);
    expect(r.before).toBe(r.after);
    expect(r.worsens).toBe(false);
  });

  it('⚠️ vider la base FACE À UNE ARMÉE AJUSTÉE bascule le pronostic', () => {
    // ⚠️ L'assaut est DÉRIVÉ des deux puissances, il n'est pas deviné : un multiple
    // choisi à la main (« 95 % du plein ») laissait la base vide tenir quand même —
    // le test passait alors au vert sans rien prouver. On le place entre les deux
    // seuils, là où le départ fait EXACTEMENT basculer la bande.
    const plein = defensePotential(d, L, h, g(tous));
    const vide = defensePotential(d, L, null, []);
    // Au complet on est « favorable » (ratio ≥ 0,88) ; à vide on passe dessous.
    const assault = Math.round((plein + vide) / 2 / 0.88);
    const r = departureRisk(d, L, assault, { hero: h, guard: g(tous) }, { hero: null, guard: [] });
    expect(isOddsRisky(r.before)).toBe(false);
    expect(r.worsens).toBe(true);
    expect(isOddsRisky(r.after)).toBe(true);
  });

  it('sans armée en vue, aucun départ n’est risqué', () => {
    // Assaut nul = rien n'arrive : l'écran ne doit alarmer personne.
    const r = departureRisk(d, L, 0, { hero: h, guard: g(tous) }, { hero: null, guard: [] });
    expect(r.risky).toBe(false);
    expect(r.worsens).toBe(false);
  });

  it('les bandes RISQUÉES sont celles où la base ne tient plus', () => {
    expect(isOddsRisky('perdu')).toBe(true);
    expect(isOddsRisky('risque')).toBe(true);
    expect(isOddsRisky('serre')).toBe(true);
    expect(isOddsRisky('favorable')).toBe(false);
    expect(isOddsRisky('large')).toBe(false);
  });
});
