import { describe, it, expect } from 'vitest';
import { DUNGEONS } from '@/data/dungeons';
import { characterRank, rankStartLevel } from '@/lib/characterRank';
import { ENDLESS_NAME } from '@/data/endless';
import {
  travelFactor,
  TRAVEL_REF_H,
  TRAVEL_CAP_H,
  isClaimable,
  type ExpeditionMessage,
  haulPills,
  buildMessage,
  goldCost,
  messageLoot,
  spawnWindow,
  riftLevelFor,
  riftAboveSpan,
  riftSlotOf,
  createMap,
  advanceWorld,
  resolveOutcome,
  CAMP_TYPES,
  HARVEST_TYPES,
  POI_LABEL,
  isQuotaPoi,
  isRiftPoi,
  HARVEST,
  EXPE,
  poiCombatant,
  ambushCombatant,
  rollTravelEncounters,
  startExpedition,
  TRAVEL,
  landRadius,
  type ExpeditionMap,
  type Poi,
  type PoiType,
} from '@/lib/expedition';
import { playerCombatant, mulberry32 } from '@/lib/combat';
import { resolveCamp } from '@/lib/camp';
import { campSpecOf } from '@/lib/expedition';
import { poiOffers } from '@/lib/caravan';

const HOUR = 3_600_000;
const hero = playerCombatant('Héros', { puissance: 600, endurance: 500, agilite: 400 }, 26);

function poi(type: PoiType, level = 26, distNorm = 0.5): Poi {
  return {
    id: 'p',
    type,
    level,
    x: 100,
    y: 40,
    distNorm,
    spawnedAt: 0,
    expiresAt: 1e15,
  } as Poi;
}

describe('fenêtre de niveaux', () => {
  it('part du niveau du joueur et monte à +10 (plus de POI « en dessous »)', () => {
    for (const L of [1, 5, 26, 60]) {
      const w = spawnWindow(L);
      expect(w.min).toBe(Math.max(1, L));
      expect(w.max).toBe(Math.max(1, L) + 10);
    }
  });
});

describe('POI de récolte', () => {
  const types: PoiType[] = ['well', 'shrine', 'archive', 'mana_mine'];

  it('ne perdent jamais : il n’y a pas de combat au bout du voyage', () => {
    for (const t of types) {
      for (let s = 1; s < 60; s++) expect(resolveOutcome(hero, poi(t), s, 26).win, t).toBe(true);
    }
  });

  it('leur SEUL butin vient d’une rencontre de trajet, jamais de la récolte elle-même', () => {
    let avecObjet = 0;
    for (const t of types) {
      for (let s = 1; s < 120; s++) {
        const o = resolveOutcome(hero, poi(t), s, 26);
        if ((o.items?.length ?? 0) > 0) {
          avecObjet++;
          // Un objet ne peut apparaître QUE si le rapport mentionne l'embuscade qui l'a produit.
          expect(o.text, `${t}/${s}`).toMatch(/Embuscade repoussée/);
        }
      }
    }
    expect(avecObjet, 'aucune embuscade n’a jamais rapporté d’objet').toBeGreaterThan(0);
  });

  it('paient chacun SA ressource vivante, et rien d’autre', () => {
    const well = resolveOutcome(hero, poi('well'), 7, 26);
    expect(well.energy).toBeGreaterThan(0);
    expect(well.summonStones).toBe(0);

    const shrine = resolveOutcome(hero, poi('shrine'), 7, 26);
    expect(shrine.summonStones).toBeGreaterThanOrEqual(2);
    expect(shrine.energy).toBe(0);

    // ⚠️ RÉÉCRIT : ce test affirmait que l'archive paie en fragments 🧩 et encre 🖋️ —
    // il verrouillait donc précisément le défaut. Ces deux devises sont MORTES (plus
    // aucune fonction ne les dépense depuis le retrait des infusions de grade), ce que
    // le test voisin sur les « devises mortes » ne vérifiait pas : il ne connaissait
    // que la poussière et les parchemins. Les archives rendent des CLÉS.
    const arch = resolveOutcome(hero, poi('archive'), 7, 26);
    expect(arch.key).toBeGreaterThan(0);
    expect(arch.energy).toBe(0);

    // 💠 La mine de mana résiduel : elle paie en MANA, et en rien d'autre.
    const mana = resolveOutcome(hero, poi('mana_mine'), 7, 26);
    expect(mana.mana).toBeGreaterThan(0);
    expect(mana.energy).toBe(0);
    expect(mana.summonStones).toBe(0);
    expect('scrap' in mana).toBe(false);
  });

  it('⚓ plus d’ÉPAVE : jamais générée, retirée des vieilles cartes, rien n’y part (v0.999)', () => {
    // Sans la ferraille, elle n'était plus qu'une mine en moins bien — on ne la choisissait
    // jamais. Le type reste LEGACY (rapports, convois d'avant, cible en cours).
    expect(HARVEST_TYPES.has('wreck')).toBe(false);
    let m = createMap(11, 0, 30);
    for (let h = 0; h < 24 * 30; h += 6) m = advanceWorld(m, h * 3600_000, 30);
    expect(m.pois.some((p) => p.type === 'wreck')).toBe(false);
    // Une carte sauvegardée avant en porte encore une : elle est retirée…
    const vieille = { ...m, pois: [...m.pois, { ...m.pois[0]!, id: 'w', type: 'wreck' as const }] };
    const t = 24 * 30 * 3600_000;
    expect(advanceWorld(vieille, t, 30).pois.some((p) => p.id === 'w')).toBe(false);
    // …sauf si le héros y est, physiquement : on ne la fait pas disparaître sous ses pieds.
    expect(advanceWorld(vieille, t, 30, 'w').pois.some((p) => p.id === 'w')).toBe(true);
    // Et rien ne peut plus y être envoyé : ni le héros, ni un convoi, ni un groupe.
    const w = { ...m.pois[0]!, type: 'wreck' as const };
    expect(
      poiOffers(w, { heroAway: false, comptoirLevel: 9, advsAvailable: 3, slotsFree: 2 }),
    ).toEqual({
      hero: false,
      caravan: false,
      party: false,
    });
  });

  it('⚠️ le MANA ne sort QUE de la mine résiduelle — pas d’une autre récolte', () => {
    // Le pendant du test des devises mortes, dans l'autre sens : une devise qui suinterait
    // d'un peu partout cesserait de dire « cette faille a débordé ».
    for (const t of types) {
      if (t === 'mana_mine') continue;
      expect(resolveOutcome(hero, poi(t), 5, 26).mana, t).toBe(0);
    }
  });

  it('⚠️ resolveOutcome REFUSE une faille — sinon elle était traitée comme une mine d’or', () => {
    // Le garde manquait, et le défaut était SILENCIEUX : une faille tombait dans la branche
    // finale (`mineOutcome`) et rendait de l'or et de l'énergie sans le moindre combat.
    // Même patron que les camps, qui se résolvent par `resolveCamp`.
    expect(() => resolveOutcome(hero, poi('rift'), 7, 26)).toThrow(/incursion/i);
  });

  it('💠 le MESSAGE porte le mana — sinon la boîte ne peut pas l’afficher', () => {
    // ⚠️ Deux moitiés du même défaut (v0.680) : `haulPills` sait le PEINDRE (test suivant),
    // mais si `buildMessage` ne le recopie pas depuis l'issue, il n'y a rien à peindre. La
    // mutation qui retire cette ligne a survécu jusqu'à ce test.
    const p = poi('mana_mine');
    const o = resolveOutcome(hero, p, 7, 26);
    expect(o.mana).toBeGreaterThan(0);
    const msg = buildMessage({
      poi: p,
      sentAt: 0,
      midAt: 1,
      returnAt: 2,
      goldCost: 0,
      seed: 7,
      outcome: o,
    });
    expect(msg.mana).toBe(o.mana);
    expect(haulPills(msg).some((x) => x.emoji === '💠')).toBe(true);
  });

  it('⚠️ entrer dans une faille coûte de l’OR — « gratuite » portait sur le mana et l’énergie', () => {
    // La décision était : ni mana, ni énergie (ne jamais être à sec le jour où il faut
    // défendre). L'or, lui, est le péage UNIVERSEL de la carte et l'un des DEUX seuls puits
    // d'or du jeu : en exempter les failles créerait une activité gratuite qui PAIE.
    expect(goldCost('rift', 30)).toBeGreaterThan(0);
    expect(goldCost('rift', 30)).toBe(goldCost('camp', 30));
    // …et une faille plus profonde coûte plus cher, comme tout POI.
    expect(goldCost('rift', 60)).toBeGreaterThan(goldCost('rift', 30));
  });

  it('💠 le mana figure dans les pastilles de butin (sinon la boîte l’affiche vide)', () => {
    // C'est le défaut exact de la v0.680 : la boîte listait ses devises à la main, et une
    // épave affichait un butin VIDE. `haulPills` est la source unique des deux écrans.
    expect(haulPills({ mana: 12 })).toEqual([{ emoji: '💠', n: 12 }]);
    expect(haulPills({ mana: 0 })).toEqual([]);
  });

  it('⚠️ le TYPE lui-même ne connaît plus aucune devise morte', () => {
    // Bien plus fort que d'affirmer « elles valent 0 » : ces champs N'EXISTENT PLUS sur
    // `ExpeditionOutcome`. Un test qui vérifiait des zéros a laissé passer la fuite de
    // l'arène pendant tout ce temps, faute d'énumérer le bon type — ici, produire une
    // devise morte ne compile même pas. On garde une vérification à l'exécution pour les
    // objets construits dynamiquement (anciens rapports relus depuis la base).
    for (const t of types) {
      const o = resolveOutcome(hero, poi(t), 3, 26) as unknown as Record<string, unknown>;
      for (const morte of [
        'dust',
        'enchantScrolls',
        'fragments',
        'inkDust',
        'stones',
        'parchemins',
      ])
        expect(o[morte], `${t} : ${morte}`).toBeUndefined();
    }
  });

  it("l'énergie reste un complément borné, jamais un substitut au sport", () => {
    // Même au niveau 100 et au bout du monde, une source reste sous le plafond.
    const o = resolveOutcome(hero, poi('well', 100, 1), 11, 100);
    expect(o.energy).toBeLessThanOrEqual(HARVEST.wellEnergyMax);
  });

  it('les pierres suivent le coût d’un boss (une visite ≈ une tentative)', () => {
    for (const L of [10, 26, 50]) {
      const o = resolveOutcome(hero, poi('shrine', L), 5, L);
      const coutBoss = 1 + Math.floor(L / 5);
      expect(o.summonStones).toBeGreaterThanOrEqual(Math.floor(coutBoss * 0.8));
      expect(o.summonStones).toBeLessThan(coutBoss * 3);
    }
  });

  it('un héros faible récolte quand même : il rentre écorné, jamais bredouille', () => {
    // La récolte elle-même n'a pas de combat. Depuis les rencontres de trajet, le butin
    // n'est plus indépendant du héros — mais le voyage ne peut pas ÉCHOUER pour autant.
    const faible = playerCombatant('Faible', { puissance: 1, endurance: 1, agilite: 1 }, 1);
    for (let s = 1; s < 60; s++) {
      const o = resolveOutcome(faible, poi('shrine'), s, 26);
      expect(o.win).toBe(true);
      expect(o.summonStones).toBeGreaterThan(0);
    }
  });
});

/** POI minimal pour les scénarios de carte périmée. */
function mkPoi(type: PoiType, x: number, y: number): Poi {
  return {
    id: `p_${type}_${x}_${y}`,
    type,
    level: 26,
    x,
    y,
    distNorm: 0.5,
    spawnedAt: 0,
    expiresAt: 99 * HOUR,
  };
}

describe('rythme de la carte', () => {
  it('la carte reste PEUPLÉE en permanence — 16 POI, plancher = plafond', () => {
    // ⚠️ RENVERSEMENT ASSUMÉ d'une décision antérieure. On cherchait auparavant une carte
    // qui « respire » (elle se vidait un peu, ce qui créait un arbitrage de rareté). Ce
    // n'est plus le sujet depuis que le NIVEAU d'un POI découle de sa DISTANCE : c'est la
    // DENSITÉ qui rend le dégradé lisible — il faut du monde à toutes les distances pour
    // qu'on voie la pente, et l'arbitrage est devenu « près et facile » contre « loin et
    // payant », pas « en prendre un avant qu'il disparaisse ».
    expect(EXPE.poiFloor).toBe(EXPE.poiCap);
    let map = createMap(1234, 0, 26);
    for (let t = 0; t <= 7 * 24 * HOUR; t += 2 * HOUR) {
      map = advanceWorld(map, t, 26);
      // ⚠️ ON COMPTE LE QUOTA, pas `pois.length` : les failles et leurs mines résiduelles
      // ont leur PROPRE quota et s'AJOUTENT aux 16 — les compter ici reviendrait à laisser
      // une faille voler la place d'une mine d'or ou d'un camp, dont l'économie est mesurée.
      expect(map.pois.filter(isQuotaPoi).length).toBe(EXPE.poiCap);
    }
  });

  it('🕳️ les FAILLES ont leur propre quota, et elles s’ajoutent aux 16', () => {
    let map = createMap(4321, 0, 26);
    for (let t = 0; t <= 10 * 24 * HOUR; t += 2 * HOUR) {
      map = advanceWorld(map, t, 26);
      const rifts = map.pois.filter(isRiftPoi).length;
      expect(rifts, `t=${t}`).toBeGreaterThanOrEqual(EXPE.riftFloor);
      expect(rifts, `t=${t}`).toBeLessThanOrEqual(EXPE.riftCap);
      // Le quota général n'est jamais entamé par elles.
      expect(map.pois.filter(isQuotaPoi).length).toBe(EXPE.poiCap);
    }
  });

  it('🕳️→💠 une faille arrivée à maturité S’EFFONDRE en mine de mana résiduel', () => {
    // ⚠️ Et le débordement doit passer AVANT le filtrage des POI périmés : la durée de vie
    // d'une faille EST sa maturation, donc filtrer d'abord la ferait simplement « expirer »
    // et la mine n'existerait jamais.
    let map = createMap(777, 0, 26);
    const rift = map.pois.find((p) => p.type === 'rift')!;
    const at = rift.spawnedAt + EXPE.lifespanMs.rift;
    map = advanceWorld(map, at, 26);
    expect(map.pois.some((p) => p.id === rift.id)).toBe(false);
    const mine = map.pois.find((p) => p.id === `${rift.id}_mine`);
    expect(mine, 'la mine résiduelle').toBeTruthy();
    expect(mine!.type).toBe('mana_mine');
    expect(mine!.level).toBe(rift.level);
    expect(mine!.x).toBe(rift.x);
    expect(mine!.spawnedAt).toBe(at);
    expect(mine!.expiresAt).toBe(at + EXPE.lifespanMs.mana_mine);
  });

  it('⚠️ après une longue absence, la mine est DATÉE de son débordement — donc déjà périmée', () => {
    // On ne punit pas l'absence, on ne la récompense pas non plus : revenir trois semaines
    // plus tard ne doit pas faire trouver une mine intacte pour chaque faille oubliée.
    let map = createMap(888, 0, 26);
    map = advanceWorld(map, 21 * 24 * HOUR, 26);
    expect(map.pois.some((p) => p.type === 'mana_mine')).toBe(false);
    // …et la carte est quand même repeuplée (failles comprises).
    expect(map.pois.filter(isQuotaPoi).length).toBe(EXPE.poiCap);
    expect(map.pois.filter(isRiftPoi).length).toBeGreaterThanOrEqual(EXPE.riftFloor);
  });

  it('⚠️ le flux aléatoire des failles est SÉPARÉ : elles ne décalent pas les autres POI', () => {
    // Partagé avec `spawnCount`, chaque faille décalerait le tirage de tous les spawns
    // suivants — la carte de chaque joueur changerait de composition sans raison.
    const map = createMap(999, 0, 26);
    const ids = map.pois.filter(isQuotaPoi).map((p) => p.id);
    expect(ids.every((id) => id.startsWith('poi_'))).toBe(true);
    expect(map.pois.filter(isRiftPoi).every((p) => p.id.startsWith('rift_'))).toBe(true);
    // Les compteurs sont distincts.
    expect(map.spawnCount).toBe(EXPE.poiFloor);
    expect(map.riftCount).toBe(EXPE.riftFloor);
  });

  it('⚠️ LE NIVEAU SE LIT SUR LA CARTE : près = faible, loin = fort', () => {
    // La règle qui donne son sens au choix d'un POI. Avant, le niveau était tiré
    // indépendamment : un repaire +10 pouvait se poser à deux pas de la ville, et la
    // carte ne disait rien de ce qu'elle proposait.
    //
    // ⚠️ ON MESURE LE QUOTA GÉNÉRAL, PAS LES FAILLES — et c’est un coût assumé de la
    // v0.929. Le niveau d’une faille est tiré par RANG (`riftLevelFor`), donc décorrélé de
    // son éloignement : mesuré, 6 failles sur 22 POI font tomber la corrélation de 0,95 à
    // **0,31**. La carte parle donc deux langages, et c’est le prix de la variété de rangs
    // que la décision « entre Bronze et ton rang » demande (une fenêtre [niveau, +10]
    // indexée sur la distance ne couvre qu’un rang et demi). ⚠️ CE QUI LE REND TENABLE :
    // une faille a son propre glyphe ET sa fiche annonce son rang et ses étoiles (v0.928)
    // — sa difficulté se LIT, elle ne se devine pas sur la distance. Si les failles
    // devaient un jour rejoindre le dégradé, c’est ce test qu’il faudrait élargir.
    let map = createMap(4242, 0, 26);
    for (let t = 0; t <= 3 * 24 * HOUR; t += 2 * HOUR) map = advanceWorld(map, t, 26);
    const pts = map.pois.filter(isQuotaPoi).map((p) => ({ d: p.distNorm, l: p.level }));
    expect(pts.length).toBeGreaterThan(10);
    // Corrélation de Pearson distance ↔ niveau : forte et positive.
    const md = pts.reduce((a, x) => a + x.d, 0) / pts.length;
    const ml = pts.reduce((a, x) => a + x.l, 0) / pts.length;
    const cov = pts.reduce((a, x) => a + (x.d - md) * (x.l - ml), 0);
    const sd = Math.sqrt(pts.reduce((a, x) => a + (x.d - md) ** 2, 0));
    const sl = Math.sqrt(pts.reduce((a, x) => a + (x.l - ml) ** 2, 0));
    const r = cov / (sd * sl || 1);
    expect(r, `corrélation distance/niveau = ${r.toFixed(2)}`).toBeGreaterThan(0.9);
    // Concrètement : le tiers le plus proche est strictement plus faible que le plus loin.
    const tri = [...pts].sort((a, b) => a.d - b.d);
    const n = Math.floor(tri.length / 3);
    const proche = tri.slice(0, n).reduce((a, x) => a + x.l, 0) / n;
    const loin = tri.slice(-n).reduce((a, x) => a + x.l, 0) / n;
    expect(loin, `proches ${proche.toFixed(1)} vs lointains ${loin.toFixed(1)}`).toBeGreaterThan(
      proche + 3,
    );
  });

  it('⚠️ l’ESPACEMENT suit la DENSITÉ : les POI ne s’empilent jamais', () => {
    // Couplage facile à casser en silence : monter `poiCap` sans toucher `minDistPoi`
    // sature la couronne, le placement échoue ses 6 essais et pose les POI les uns sur
    // les autres. À 20 POI avec l'ancien écart de 20, l'occupation atteignait 53 %.
    const aire = Math.PI * (EXPE.distMax ** 2 - EXPE.distMin ** 2);
    // ⚠️ FAILLES COMPRISES : c'est la couronne ENTIÈRE qui sature, et c'est ce qui borne
    // le TOTAL à **22 POI placés** — mesuré : 0 chevauchement à 22, 5 à 23, 105 à 26. Passer
    // à 6 failles s'est donc payé en retirant 4 POI ordinaires (`poiCap` 20 → 16), pas en
    // élargissant la couronne. ⚠️ `minDistPoi` N'EST PAS LE LEVIER : mesuré à 14/12/11/10/9,
    // les chevauchements font 105/159/138/46/1629 — erratique, parce qu’à 26 POI la boucle de
    // placement n’atteint jamais sa cible et ne garde que le meilleur de 24 essais.
    const occupe = (EXPE.poiCap + EXPE.riftCap) * Math.PI * (EXPE.minDistPoi / 2) ** 2;
    expect(occupe / aire, 'occupation de la couronne au plafond').toBeLessThan(0.35);

    // …et vérification sur le terrain : aucune paire ne se chevauche visuellement.
    let pires = 0;
    for (let s = 1; s <= 20; s++) {
      let map = createMap(s * 331, 0, 26);
      for (let t = 0; t <= 5 * 24 * HOUR; t += 3 * HOUR) {
        map = advanceWorld(map, t, 26);
        for (let i = 0; i < map.pois.length; i++) {
          for (let j = i + 1; j < map.pois.length; j++) {
            const a = map.pois[i]!;
            const b = map.pois[j]!;
            if (Math.hypot(a.x - b.x, a.y - b.y) < 10) pires++;
          }
        }
      }
    }
    expect(pires, 'paires de POI qui se chevauchent').toBe(0);
  });

  it('la carte offre TOUJOURS du proche, du moyen et du lointain', () => {
    // Un tirage de distance uniforme ne GARANTIT aucune répartition : avec ~6 POI à
    // l'écran, 10 % des cartes n'offraient aucune option proche et 22 % seulement deux
    // bandes sur trois — d'où l'impression que « tout est très loin ». Les spawns
    // parcourent donc les trois tiers à tour de rôle (cf. `placePoi`), ce qui ne change
    // PAS la moyenne (donc ni les temps de trajet ni l'économie) mais garantit le mélange.
    const T = EXPE.town;
    const third = (EXPE.distMax - EXPE.distMin) / 3;
    let snaps = 0;
    let sansProche = 0;
    let troisBandes = 0;
    for (let s = 1; s <= 30; s++) {
      let map = createMap(s * 7919, 0, 26);
      for (let t = 0; t <= 7 * 24 * HOUR; t += 3 * HOUR) {
        map = advanceWorld(map, t, 26);
        if (!map.pois.length) continue;
        snaps++;
        const bands = new Set(
          map.pois.map((p) =>
            Math.min(
              2,
              Math.max(0, Math.floor((Math.hypot(p.x - T.x, p.y - T.y) - EXPE.distMin) / third)),
            ),
          ),
        );
        if (!bands.has(0)) sansProche++;
        if (bands.size === 3) troisBandes++;
      }
    }
    expect(troisBandes / snaps, 'cartes offrant les trois bandes').toBeGreaterThan(0.9);
    expect(sansProche / snaps, 'cartes sans aucune option proche').toBeLessThan(0.05);
  });

  it('⚓ aucun POI ne finit à la MER : ils tiennent dans la terre ferme garantie', () => {
    // `distMax` valait 88 = le rayon NOMINAL du littoral. Or la côte est irrégulière et
    // pince par endroits : un POI tombé dans un renfoncement se retrouvait dessiné en
    // pleine mer. Le maxi est donc désormais borné par `landRadius()` — le rayon sous
    // lequel il y a de la terre quelle que soit la graine du terrain.
    const GLYPH = 6; // demi-largeur du pictogramme + sa pastille de niveau
    expect(EXPE.distMax + GLYPH).toBeLessThan(landRadius());
    for (let s = 1; s <= 25; s++) {
      let map = createMap(s * 613, 0, 26);
      for (let t = 0; t <= 5 * 24 * HOUR; t += 3 * HOUR) {
        map = advanceWorld(map, t, 26);
        for (const p of map.pois) {
          const d = Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
          expect(d + GLYPH, `POI ${p.type} à ${d.toFixed(0)} du centre`).toBeLessThan(landRadius());
        }
      }
    }
  });

  it('une carte SAUVEGARDÉE avant le recadrage se soigne au chargement', () => {
    // Sans ça, un joueur garde jusqu'à 48 h des POI dessinés en pleine mer : ils sont
    // valides (non expirés), donc `advanceWorld` les conservait. On les périme au
    // chargement, comme on droppe un bâtiment dont le type a disparu du registre.
    const stale: ExpeditionMap = {
      seed: 1234,
      spawnCount: 200,
      nextSpawnAt: 10 * HOUR,
      pois: [
        // Placés à l'ancienne fenêtre (jusqu'à 88) → au large aujourd'hui.
        { ...mkPoi('mine', 20, 103), expiresAt: 99 * HOUR },
        { ...mkPoi('lair', 145, 48), expiresAt: 99 * HOUR },
        { ...mkPoi('mine', 131, 29), expiresAt: 99 * HOUR },
      ],
    };
    const fresh = advanceWorld(stale, HOUR, 26);
    for (const p of fresh.pois) {
      const d = Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y);
      expect(d, 'aucun rescapé au large').toBeLessThanOrEqual(EXPE.distMax + 1);
    }
    // …et le plancher les remplace aussitôt : la carte ne se vide pas.
    expect(fresh.pois.length).toBeGreaterThanOrEqual(EXPE.poiFloor);
  });

  it('mais la cible d’une expédition EN COURS est préservée', () => {
    // Le héros y est physiquement : on ne la fait pas disparaître sous ses pieds.
    const target = { ...mkPoi('lair', 145, 48), id: 'cible', expiresAt: 99 * HOUR };
    const stale: ExpeditionMap = {
      seed: 7,
      spawnCount: 3,
      nextSpawnAt: 10 * HOUR,
      pois: [target],
    };
    const fresh = advanceWorld(stale, HOUR, 26, 'cible');
    expect(fresh.pois.some((p) => p.id === 'cible')).toBe(true);
  });

  it('la ville n’est plus entourée d’un trou : des POI existent tout près', () => {
    // `distMin` valait 30 tant que l'anneau de bâtiments occupait cette couronne ; son
    // départ pour l'écran « Ma base » y a laissé un vide et la ville semblait isolée.
    expect(EXPE.distMin).toBeLessThan(25);
    let map = createMap(4242, 0, 26);
    for (let t = 0; t <= 3 * 24 * HOUR; t += 3 * HOUR) map = advanceWorld(map, t, 26);
    const nearest = Math.min(
      ...map.pois.map((p) => Math.hypot(p.x - EXPE.town.x, p.y - EXPE.town.y)),
    );
    expect(nearest).toBeLessThan(45);
  });
});

describe('difficulté des POI de combat', () => {
  it('un adversaire de +10 niveaux reste défini (la fenêtre ne casse rien)', () => {
    const foe = poiCombatant(36, 'lair');
    expect(foe.pv).toBeGreaterThan(0);
    expect(foe.damage).toBeGreaterThan(0);
  });
  it('HARVEST_TYPES contient bien les récoltes et pas les combats', () => {
    // `wreck` (épave) rejoint la famille en v0.661 : c'est une récolte pure — aucun
    // combat, aucun échec — et l'UNIQUE source de ferraille (réparation de l'enceinte).
    // 💠 `mana_mine` rejoint la famille en v0.924 : ce qu'une faille laisse en s'effondrant
    // se RÉCOLTE (et se récolte donc au convoi, sans énergie — c'est ce qui ouvre le mana au
    // joueur qui ne combat pas).
    expect([...HARVEST_TYPES].sort()).toEqual(['archive', 'mana_mine', 'mine', 'shrine', 'well']);
    expect(HARVEST_TYPES.has('lair')).toBe(false);
    expect(HARVEST_TYPES.has('arena')).toBe(false);
    // ⚠️ UNE FAILLE N'EST PAS UNE RÉCOLTE : on s'y BAT, et on peut en ressortir sans avoir
    // refermé la brèche. La ranger ici la rendrait « sans combat, sans échec » (v0.658).
    expect(HARVEST_TYPES.has('rift')).toBe(false);
  });

  it('⚠️ le mot « FAILLE » ne désigne plus QUE la faille de la carte', () => {
    // Il était pris QUATRE fois pour du décor : le puits (« Source de faille »), la Dynamo
    // (« Dynamo de faille »), le donjon « Faille du Chaos » et — le plus gênant — la
    // « Faille sans fin », un MODE de jeu entier. Tous renommés ; « faille » est désormais
    // réservé à la brèche de la carte. Un joueur ne doit pas voir deux choses différentes
    // porter le même nom — c'est exactement le défaut que ce projet rencontre à répétition
    // sous une autre forme (une règle en deux exemplaires), ici côté vocabulaire.
    const dit = (s: string) => s.toLowerCase().includes('faille');

    // Les POI de la carte : un seul a le droit.
    const poi = (Object.keys(POI_LABEL) as PoiType[]).filter((k) => dit(POI_LABEL[k]));
    expect(poi).toEqual(['rift']);

    // ⚠️ LES DONJONS ET LE MODE END-GAME AUSSI — c'est la moitié qui manquait au garde
    // précédent : il ne regardait que `POI_LABEL`, donc « Faille du Chaos » et la
    // « Faille sans fin » passaient au vert pendant que l'homonyme vivait.
    expect(DUNGEONS.filter((d) => dit(d.name)).map((d) => d.name)).toEqual([]);
    expect(dit(ENDLESS_NAME)).toBe(false);

    // ⚠️ L'ID du donjon, lui, RESTE `faille_chaos` : il est persisté dans
    // `characters.cleared_dungeons`, donc le renommer effacerait la progression de
    // chaque joueur qui l'a nettoyé. On renomme ce qui s'AFFICHE, jamais ce qui se stocke.
    expect(DUNGEONS.some((d) => d.id === 'faille_chaos')).toBe(true);
  });
});

describe('rencontres de trajet', () => {
  it('un rôdeur est calibré sur le HÉROS : franchissable quel que soit l’équipement', () => {
    // Le calibrage absolu (`poiCombatant`, PV ~L³) rendait l'embuscade arithmétiquement
    // imbattable sans stuff — un héros peu équipé rentrait écorné à TOUS les coups.
    const faible = playerCombatant('Faible', { puissance: 5, endurance: 5, agilite: 5 }, 3);
    const fort = playerCombatant('Fort', { puissance: 900, endurance: 700, agilite: 500 }, 40);
    for (const [nom, h] of [
      ['faible', faible],
      ['fort', fort],
    ] as const) {
      const foe = ambushCombatant(h, 26);
      // Le rôdeur meurt en ~2-3 tours de dégâts du héros, et mord une fraction de ses PV.
      expect(foe.pv, nom).toBeLessThan(h.damage * (h.strikes ?? 1) * 4);
      expect(foe.damage, nom).toBeLessThan(h.pv * 0.2);
      expect(foe.pv, nom).toBeGreaterThan(0);
    }
  });

  it('les deux jambes de trajet peuvent porter une rencontre', () => {
    const legs = new Set<string>();
    for (let s = 1; s < 200; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('well'), s, 26);
      for (const e of r.encounters) legs.add(e.leg);
    }
    expect([...legs].sort()).toEqual(['back', 'out']);
  });

  it('une embuscade repoussée enrichit, une embuscade subie écorne', () => {
    let vu = { win: false, lose: false };
    for (let s = 1; s < 300; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('well'), s, 26);
      const amb = r.encounters.filter((e) => e.kind === 'ambush');
      if (!amb.length || r.encounters.some((e) => e.kind !== 'ambush')) continue;
      if (amb.every((e) => e.won)) {
        expect(r.resMult).toBeGreaterThan(1);
        vu.win = true;
      } else if (amb.every((e) => !e.won)) {
        expect(r.resMult).toBeLessThan(1);
        vu.lose = true;
      }
    }
    expect(vu.win, 'aucune embuscade gagnée observée').toBe(true);
  });

  it('le multiplicateur reste dans des bornes saines (jamais de jackpot ni de ruine)', () => {
    for (let s = 1; s < 400; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('shrine'), s, 26);
      expect(r.resMult).toBeGreaterThan(0.2);
      expect(r.resMult).toBeLessThan(3);
      expect(r.goldMult).toBeGreaterThan(0.2);
      expect(r.returnMult).toBeGreaterThan(0.2);
      expect(r.returnMult).toBeLessThanOrEqual(1); // le retour n'est jamais RALENTI
    }
  });
});

describe('rencontres qui jouent sur le TEMPS', () => {
  it('un passage ou un contretemps RACCOURCIT le retour, jamais l’aller', () => {
    let vuCourt = false;
    for (let s = 1; s < 400; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('well'), s, 26);
      const temps = r.encounters.filter((e) => e.kind === 'shortcut' || e.kind === 'setback');
      if (!temps.length) {
        expect(r.returnMult).toBe(1);
      } else {
        expect(r.returnMult).toBeLessThan(1);
        vuCourt = true;
      }
    }
    expect(vuCourt, 'aucun raccourci observé').toBe(true);
  });

  it('le décalage arrive jusqu’au calendrier de l’expédition', () => {
    // De bout en bout : l'aller (midAt) ne bouge JAMAIS, seul le retour se resserre.
    let vuDecale = false;
    for (let s = 1; s < 300; s++) {
      const p = poi('well');
      const exp = startExpedition(hero, p, 0, s, 1, 26);
      const aller = exp.midAt - exp.sentAt;
      const retour = exp.returnAt - exp.midAt;
      expect(aller).toBeGreaterThan(0);
      expect(retour).toBeLessThanOrEqual(aller + 1);
      if (retour < aller * 0.95) vuDecale = true;
      // Le retour reste cohérent avec le multiplicateur annoncé par l'issue.
      expect(Math.abs(retour - aller * exp.outcome.returnMult)).toBeLessThanOrEqual(2);
    }
    expect(vuDecale, 'aucune expédition écourtée sur 300 tirages').toBe(true);
  });

  it('un contretemps coûte la moitié de la cargaison — le temps se paie', () => {
    for (let s = 1; s < 400; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('shrine'), s, 26);
      if (r.encounters.length === 1 && r.encounters[0]!.kind === 'setback') {
        expect(r.resMult).toBeCloseTo(TRAVEL.setbackHaulMult, 5);
        expect(r.returnMult).toBeCloseTo(TRAVEL.setbackReturnMult, 5);
        return;
      }
    }
  });

  it('le marchand ÉCHANGE : moins d’or, plus de ressources', () => {
    for (let s = 1; s < 400; s++) {
      const r = rollTravelEncounters(mulberry32(s), hero, poi('archive'), s, 26);
      if (r.encounters.length === 1 && r.encounters[0]!.kind === 'merchant') {
        expect(r.goldMult).toBeLessThan(1);
        expect(r.resMult).toBeGreaterThan(1);
        expect(r.returnMult).toBe(1); // il ne fait pas gagner de temps
        return;
      }
    }
  });
});

describe('route dangereuse (télégraphiée)', () => {
  it('double les embuscades ET renforce le gain quand on les repousse', () => {
    const calme = poi('well');
    const risque = { ...poi('well'), perilous: true } as Poi;
    let nCalme = 0;
    let nRisque = 0;
    let gainCalme = 0;
    let gainRisque = 0;
    for (let s = 1; s < 600; s++) {
      const a = rollTravelEncounters(mulberry32(s), hero, calme, s, 26);
      const b = rollTravelEncounters(mulberry32(s), hero, risque, s, 26);
      nCalme += a.encounters.filter((e) => e.kind === 'ambush').length;
      nRisque += b.encounters.filter((e) => e.kind === 'ambush').length;
      gainCalme += a.resMult;
      gainRisque += b.resMult;
    }
    expect(nRisque).toBeGreaterThan(nCalme * 1.5);
    expect(gainRisque).toBeGreaterThan(gainCalme); // le risque PAIE en moyenne
  });

  it('est posée au spawn, donc annonçable avant l’envoi', () => {
    let map = createMap(4242, 0, 26);
    let vu = 0;
    for (let t = 0; t <= 30 * 24 * HOUR; t += 3 * HOUR) {
      map = advanceWorld(map, t, 26);
      vu += map.pois.filter((p) => p.perilous).length;
    }
    expect(vu, 'aucun POI dangereux généré en 30 jours').toBeGreaterThan(0);
  });
});

describe('butin affiché — source unique des deux écrans', () => {
  it('⚠️ une ÉPAVE ne doit plus afficher un butin VIDE', () => {
    // Le défaut réel : la modale de collecte et la boîte 📬 listaient leurs devises à la
    // main (or / énergie / clé) et n'ont pas suivi l'ajout des POI de RÉCOLTE (v0.658).
    // Une épave ne montrait donc RIEN. ⚠️ Elle paie en OR depuis la v0.998, et la
    // ferraille n'a plus de pastille : une devise retirée ne s'affiche plus.
    expect(haulPills({ gold: 87 })).toEqual([{ emoji: '🪙', n: 87 }]);
    expect(haulPills({ scrap: 87 } as never)).toEqual([]);
    expect(haulPills({ summonStones: 6 })).toEqual([{ emoji: '🔮', n: 6 }]);
    // ⚠️ RÉÉCRIT : ce test exigeait que les pastilles AFFICHENT fragments et encre — il
    // verrouillait donc la promesse faite au joueur d'une monnaie qu'il ne peut pas
    // dépenser. `haulPills` ne connaît plus ces devises.
    expect(haulPills({ summonStones: 6, key: 2 })).toEqual([
      { emoji: '🔮', n: 6 },
      { emoji: '🗝️', n: 2 },
    ]);
  });
  it('n’affiche que ce qui a VRAIMENT été gagné, dans un ordre stable', () => {
    expect(haulPills({ gold: 0, energy: 12, key: 1 })).toEqual([
      { emoji: '⚡', n: 12 },
      { emoji: '🗝️', n: 1 },
    ]);
    expect(haulPills({})).toEqual([]);
  });

  it('⚠️ un objet porté seulement par `items` (coffre du boss entre amis) s’affiche', () => {
    // Le défaut réel : le coffre posait son trophée dans `items` et la boîte ne lisait que
    // `item` — le trophée n'apparaissait pas dans les récompenses.
    const trophy = { name: 'Trophée « Pompes »' } as never;
    expect(messageLoot({ items: [trophy] })).toEqual({ item: trophy, more: 0 });
    const a = { name: 'A' } as never;
    const b = { name: 'B' } as never;
    expect(messageLoot({ item: a, items: [a, b], itemCount: 2 })).toEqual({ item: a, more: 1 });
    expect(messageLoot({ items: [a, b] })).toEqual({ item: a, more: 1 });
    expect(messageLoot({ item: a })).toEqual({ item: a, more: 0 });
    expect(messageLoot({})).toBeNull();
    expect(messageLoot({ items: [] })).toBeNull();
  });
});

describe('butin à RÉCUPÉRER (et pas deux fois)', () => {
  const msg = (over: Partial<ExpeditionMessage> = {}): ExpeditionMessage =>
    ({
      id: 'm1',
      poiType: 'wreck',
      level: 26,
      win: true,
      text: '',
      gold: 0,
      dust: 0,
      energy: 0,
      enchantScrolls: 0,
      scrap: 90,
      key: 0,
      resolvedAt: 1000,
      claimAt: 5000,
      claimed: false,
      read: false,
      ...over,
    }) as ExpeditionMessage;

  it('⚠️ un rapport d’AVANT la récupération manuelle est déjà crédité — jamais réclamable', () => {
    // La propriété qui protège le joueur ET l'économie : `claimed` absent signifie
    // « déjà encaissé automatiquement ». Le traiter comme « à récupérer » offrirait une
    // seconde fois le butin de chaque expédition déjà faite.
    const legacy = msg();
    delete (legacy as { claimed?: boolean }).claimed;
    expect(isClaimable(legacy, 9e9)).toBe(false);
  });

  it('rien à prendre tant que le héros est sur la route du retour', () => {
    expect(isClaimable(msg(), 4999)).toBe(false); // rapport lu, héros pas rentré
    expect(isClaimable(msg(), 5000)).toBe(true);
  });

  it('une fois encaissé, il ne l’est plus jamais', () => {
    expect(isClaimable(msg({ claimed: true }), 9e9)).toBe(false);
  });

  it('un vieux rapport sans claimAt retombe sur l’heure de résolution', () => {
    const m = msg({ claimAt: undefined });
    expect(isClaimable(m, 999)).toBe(false);
    expect(isClaimable(m, 1000)).toBe(true);
  });
});

describe('aller loin doit VRAIMENT payer', () => {
  it('⚠️ le rendement par HEURE croît avec la durée du trajet (super-linéaire)', () => {
    // La règle : tant que la récompense montait proportionnellement au trajet, la
    // distance n'était qu'une taxe de temps — deux POI proches rapportaient autant qu'un
    // lointain dans le même délai, et rien ne justifiait jamais d'aller loin.
    const perHour = (h: number) => travelFactor(h) / h;
    const near = perHour(2);
    const mid = perHour(4);
    const far = perHour(8);
    expect(mid, `2 h → ${near.toFixed(2)}/h, 4 h → ${mid.toFixed(2)}/h`).toBeGreaterThan(near);
    expect(far, `4 h → ${mid.toFixed(2)}/h, 8 h → ${far.toFixed(2)}/h`).toBeGreaterThan(mid);
    expect(far / near, `loin/proche = ${(far / near).toFixed(2)}×`).toBeGreaterThan(1.3);
  });

  it('⚠️ SANS INFLATER l’économie : au voyage de référence, la valeur est l’ancienne', () => {
    // Le facteur est CALÉ sur `TRAVEL_REF_H` : en deçà on gagne un peu moins, au-delà
    // nettement plus. C'est un arbitrage qu'on crée, pas un cadeau — sinon toute
    // l'économie (ferraille comprise, qu'on vient de calibrer) dériverait d'un coup.
    expect(travelFactor(TRAVEL_REF_H)).toBeCloseTo(0.5 + TRAVEL_REF_H, 6);
    expect(travelFactor(1.5)).toBeLessThan(0.5 + 1.5);
    expect(travelFactor(6)).toBeGreaterThan(0.5 + 6);
  });

  it('reste borné : un trajet interminable ne multiplie pas tout', () => {
    expect(travelFactor(50)).toBe(travelFactor(TRAVEL_CAP_H));
  });
});

describe('🕳️ le RANG d’une faille', () => {
  /** Les EMPLACEMENTS réellement tirés à ce niveau (`riftSlotOf` : le rang, ou `top + 1`
   *  pour « au-dessus du joueur »). */
  function slotsTires(L: number, n = 4000) {
    const rng = mulberry32(L * 7919 || 1);
    const compte = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const lv = riftLevelFor(rng, L, []);
      const s = riftSlotOf(lv, L);
      compte.set(s, (compte.get(s) ?? 0) + 1);
      // Un rang ORDINAIRE : le niveau tiré appartient VRAIMENT à la tranche de ce rang.
      if (lv <= L) expect(lv, `niv ${L} → ${lv}`).toBeGreaterThanOrEqual(rankStartLevel(s));
    }
    return compte;
  }

  it('⚠️ UN CRAN « AU-DESSUS », borné par un écart PROPORTIONNEL au niveau (v0.980)', () => {
    // ⚠️ RENVERSE la décision de la v0.929 (« jamais au-dessus du rang du joueur »), prise
    // parce que le héros, seul et équipé, refermait tout. Depuis qu'il ne vaut plus que
    // deux champions dans un groupe, une faille au-dessus de soi est un vrai pari. L'écart
    // est PROPORTIONNEL (`EXPE.riftAboveShare`) : un rang fixe (+10 niveaux) était mesuré
    // infranchissable au niveau 12 et trivial au niveau 70.
    for (const L of [1, 5, 11, 12, 30, 45, 60, 91, 100, 130]) {
      const rng = mulberry32(L * 104729 || 1);
      let au = 0;
      for (let i = 0; i < 4000; i++) {
        const lv = riftLevelFor(rng, L, []);
        expect(lv, `niveau ${L} → faille ${lv}`).toBeLessThanOrEqual(L + riftAboveSpan(L));
        expect(lv).toBeGreaterThanOrEqual(1);
        if (lv > L) au++;
      }
      // …et ce cran EXISTE vraiment : sinon la feature serait morte en silence.
      expect(au, `niveau ${L} : aucune faille au-dessus`).toBeGreaterThan(0);
    }
  });

  it('⚠️ l’écart suit le NIVEAU, pas un rang : +25 % du niveau, au moins 1', () => {
    expect(riftAboveSpan(1)).toBe(1);
    expect(riftAboveSpan(12)).toBe(Math.round(12 * EXPE.riftAboveShare));
    expect(riftAboveSpan(70)).toBe(Math.round(70 * EXPE.riftAboveShare));
    // ⚠️ Plus serré en début de partie qu'un rang (10 niveaux) : c'est là qu'un rang
    // entier était infranchissable.
    expect(riftAboveSpan(12)).toBeLessThan(10);
  });

  it('⚠️ BRONZE reste atteignable, et les emplacements sont tirés UNIFORMÉMENT', () => {
    // Le but est de voir du Bronze à côté de son propre rang — et désormais une faille
    // au-dessus —, pas une cloche qui ramènerait tout au milieu.
    for (const L of [12, 30, 60, 100]) {
      const n = characterRank(L).rankIndex + 2; // rangs 0..top + « au-dessus »
      const compte = slotsTires(L);
      for (let s = 0; s < n; s++) {
        expect(compte.get(s) ?? 0, `niveau ${L}, emplacement ${s} jamais tiré`).toBeGreaterThan(0);
      }
      const attendu = 4000 / n;
      for (let s = 0; s < n; s++) {
        const part = (compte.get(s) ?? 0) / attendu;
        expect(
          part,
          `niveau ${L}, emplacement ${s} à ${(part * 100).toFixed(0)} % de sa part`,
        ).toBeGreaterThan(0.6);
        expect(part).toBeLessThan(1.4);
      }
    }
  });

  it('⚠️ une faille AU-DESSUS n’est JAMAIS élaguée par le dégradé de distance', () => {
    // Le niveau d'une faille est tiré par RANG, jamais par la distance : posée près de la
    // ville au-dessus du joueur, elle est « trop forte pour son éloignement » — sans
    // l'exemption de `levelFitsDistance`, le tick suivant l'effacerait (sa mine aussi).
    for (const L of [12, 30, 60]) {
      const base = createMap(9137, 0, L);
      const lv = L + riftAboveSpan(L);
      const proche = (type: PoiType, id: string): Poi => ({
        id,
        type,
        level: lv,
        x: 100,
        y: 88,
        distNorm: 0.05,
        spawnedAt: 0,
        expiresAt: 9e15,
      });
      const map: ExpeditionMap = {
        ...base,
        pois: [...base.pois, proche('rift', 'rift_proche'), proche('mana_mine', 'mine_proche')],
      };
      const apres = advanceWorld(map, HOUR, L);
      expect(
        apres.pois.some((p) => p.id === 'rift_proche'),
        `niveau ${L}`,
      ).toBe(true);
      expect(
        apres.pois.some((p) => p.id === 'mine_proche'),
        `niveau ${L}`,
      ).toBe(true);
    }
    // …et sur le terrain : sur 14 jours, le quota de failles ne descend jamais sous son
    // plancher — donc aucune n’est écartée en dehors de sa maturation.
    for (const L of [12, 30, 60]) {
      let map = createMap(9137, 0, L);
      for (let t = 0; t <= 14 * 24 * HOUR; t += 2 * HOUR) {
        map = advanceWorld(map, t, L);
        expect(map.pois.filter(isRiftPoi).length, `niveau ${L}, t=${t}`).toBeGreaterThanOrEqual(
          EXPE.riftFloor,
        );
      }
    }
  });

  it('⚠️ …mais un POI ORDINAIRE trop fort pour sa distance l’est toujours', () => {
    // L'exemption ne vaut que pour la faille et sa mine : sinon le dégradé « près = faible,
    // loin = fort » (v0.683) cesserait de tenir pour tout le reste de la carte.
    const base = createMap(9137, 0, 30);
    const map: ExpeditionMap = {
      ...base,
      pois: [
        ...base.pois,
        {
          id: 'puits_proche',
          type: 'well',
          level: 60,
          x: 100,
          y: 88,
          distNorm: 0.05,
          spawnedAt: 0,
          expiresAt: 9e15,
        },
      ],
    };
    expect(advanceWorld(map, HOUR, 30).pois.some((p) => p.id === 'puits_proche')).toBe(false);
  });

  it('⚠️ LE PLANCHER RESTE À 2 : une carte neuve se REMPLIT, elle ne pulse pas', () => {
    // À `riftFloor` = `riftCap`, une carte neuve spawnerait ses six failles au MÊME instant —
    // donc six armées au même instant sept jours plus tard, puis sept jours de silence. Un
    // PULSE, pas un rythme. À 2, l’horloge (8–16 h) remplit jusqu’à 6 en ~2,5 jours et les âges
    // se désynchronisent d’eux-mêmes, sans jamais antidater une faille.
    expect(EXPE.riftFloor).toBeLessThan(EXPE.riftCap);
    let map = createMap(42, 0, 30);
    expect(map.pois.filter(isRiftPoi).length).toBe(EXPE.riftFloor);
    const ages = new Set<number>();
    for (let h = 0; h <= 96; h++) {
      map = advanceWorld(map, h * HOUR, 30);
      for (const p of map.pois.filter(isRiftPoi)) ages.add(p.spawnedAt);
    }
    // Pleine au bout de 4 jours…
    expect(map.pois.filter(isRiftPoi).length).toBe(EXPE.riftCap);
    // …et elles n’ont PAS toutes le même âge : c’est ce qui étale les débordements. La
    // borne est DÉRIVÉE, et c’est le MAXIMUM atteignable : les `riftFloor` premières
    // naissent ensemble (à la création de la carte), les suivantes une par une au fil de
    // l’horloge. Six failles nées ensemble n’en feraient qu’UN seul instant, deux spawns
    // simultanés en feraient un de moins : les deux font rougir.
    expect(ages.size, `${ages.size} instants d’apparition distincts`).toBe(
      EXPE.riftCap - EXPE.riftFloor + 1,
    );
  });

  it('⚠️ DEUX BRÈCHES OUVERTES = DEUX EMPLACEMENTS DIFFÉRENTS — sinon la variété ne se voit pas', () => {
    // ⚠️ SIGNALÉ (v0.965) : « les failles apparaissent bien de rang aléatoire ? je n’ai que
    // des Or noir comme mon rang ». Le TIRAGE était bon (39 % Bronze / 26 % Argent / 22 % Or
    // / 13 % Or noir pour un joueur Or noir, mesuré) — mais il est SANS MÉMOIRE, et un
    // joueur qui REFERME ses failles n’en garde que deux ou trois : une fois sur quatre,
    // elles portaient alors le même rang.
    // ⚠️ Ce test simule un joueur qui JOUE (il referme la plus mûre deux fois par jour),
    // parce que c’est exactement le cas où le défaut se manifeste — une carte qu’on laisse
    // se remplir atteint le plafond et masque le problème.
    const HEURES = 20 * 24;
    let rangsTotal = 0;
    let brechesTotal = 0;
    let mesures = 0;
    let memeRang = 0;
    for (const graine of [11, 22, 33, 44, 55, 66]) {
      let map = createMap(graine, 0, 35);
      for (let h = 1; h <= HEURES; h++) {
        map = advanceWorld(map, h * HOUR, 35);
        if (h % 12 === 0) {
          const r = map.pois.filter(isRiftPoi).sort((x, y) => x.spawnedAt - y.spawnedAt);
          if (r[0]) map = { ...map, pois: map.pois.filter((q) => q.id !== r[0]!.id) };
        }
        if (h > 5 * 24 && h % 6 === 0) {
          const r = map.pois.filter(isRiftPoi);
          // ⚠️ Des EMPLACEMENTS (v0.980) : une faille « au-dessus » peut porter le rang du
          // joueur en début de partie, mais elle se distingue (la fiche dit « +N niv. »).
          const rangs = new Set(r.map((q) => riftSlotOf(q.level, 35)));
          rangsTotal += rangs.size;
          brechesTotal += r.length;
          mesures++;
          // Deux brèches ouvertes du MÊME rang : c’est précisément ce qu’on supprime.
          if (r.length >= 2 && rangs.size < 2) memeRang++;
        }
      }
    }
    // ⚠️ AUCUN doublon de rang tant qu’il reste des rangs libres : le garde est absolu,
    // pas statistique. Sans lui on en mesure environ un quart des relevés.
    expect(memeRang, `${memeRang}/${mesures} relevés à deux brèches du même rang`).toBe(0);
    // …et les rangs distincts suivent le nombre de brèches, au lieu de se répéter.
    expect(rangsTotal / mesures).toBeCloseTo(brechesTotal / mesures, 1);
  });
});

describe('la carte ne paie JAMAIS en monnaie morte', () => {
  // ⚠️ Le défaut réel, signalé par l'utilisateur : les ARCHIVES 📖 versaient des
  // fragments 🧩 et de la poussière d'encre 🖋️, et la MINE des fragments — or plus
  // aucune fonction ne dépense ces devises depuis le retrait des infusions de grade.
  // Un POI entier payait donc en monnaie de singe, ce que la v0.658 prétendait avoir
  // corrigé (elle avait retiré la poussière ✨ et les parchemins 📜, puis introduit
  // l'archive avec le même défaut). Les archives rendent désormais des CLÉS 🗝️.
  const hero = {
    name: 'h',
    pv: 5000,
    maxPv: 5000,
    damage: 400,
    crit: 0.1,
    dodge: 0.05,
    initiative: 10,
    strikes: 1,
  } as never;

  it('AUCUN type de POI ne verse fragments 🧩 ni encre 🖋️', () => {
    // ⚠️ 'arena' EST DANS LA LISTE, et il n'y était pas : c'est très exactement par là que
    // la fuite passait (l'arène versait fragments + encre, seule production non nulle qui
    // restait). Un filet troué est pire qu'aucun filet — il rassure.
    const types: PoiType[] = ['mine', 'well', 'shrine', 'archive', 'camp', 'lair', 'arena'];
    for (const type of types) {
      for (let s = 1; s <= 30; s++) {
        const poi = {
          id: 'p',
          type,
          level: 26,
          x: 100,
          y: 60,
          distNorm: 0.5,
          spawnedAt: 0,
          expiresAt: 9e15,
        } as never;
        // ⚠️ Un camp ne passe plus par `resolveOutcome` : il se résout en groupe
        // (`resolveCamp`), héros compris — c'est son butin qu'on regarde.
        const o = (CAMP_TYPES.has(type)
          ? resolveCamp({
              poi,
              spec: campSpecOf(poi)!,
              escort: [],
              road: { familiars: [], talents: [], advGear: [] },
              hero: { name: 'h', level: 26, combatant: hero },
              seed: s,
              playerLevel: 26,
            })
          : resolveOutcome(hero, poi, s * 97 + 3, 26)) as unknown as Record<string, unknown>;
        // Les champs n’existent plus sur le type : on vérifie qu’aucun ne réapparaît.
        expect(o.fragments, `${type} verse des fragments`).toBeUndefined();
        expect(o.inkDust, `${type} verse de l’encre`).toBeUndefined();
      }
    }
  });

  it('les ARCHIVES rendent des CLÉS, et davantage quand on va loin', () => {
    const at = (distNorm: number) => {
      let total = 0;
      for (let s = 1; s <= 40; s++) {
        const poi = {
          id: 'p',
          type: 'archive' as PoiType,
          level: 26,
          x: 100,
          y: 60,
          distNorm,
          spawnedAt: 0,
          expiresAt: 9e15,
        } as never;
        total += resolveOutcome(hero, poi, s * 61 + 7, 26).key;
      }
      return total / 40;
    };
    const proche = at(0.1);
    const loin = at(1);
    expect(proche, `archive proche : ${proche.toFixed(2)} clé(s)`).toBeGreaterThanOrEqual(1);
    expect(loin, `proche ${proche.toFixed(2)} vs loin ${loin.toFixed(2)}`).toBeGreaterThan(proche);
  });
});
