// codex.ts — MÉTA DE COLLECTION de l'Aventure (pur/testé). Donne une carotte long
// terme (« je veux tout débloquer ») : bestiaire des monstres vaincus + journal des
// sets d'équipement. Tout est DÉRIVÉ de l'état existant (donjons nettoyés / boss
// vaincus / équipement) → aucune colonne DB en plus. N'affecte ni combat ni drops.
import { MONSTERS } from '@/data/monsters';
import { DUNGEONS } from '@/data/dungeons';
import { ITEM_SETS, SET_SLOTS, SET_SIZE, type Equipped, type Item, type ItemSet } from './items';
import { CHAMPIONS, type Champion, type ChampionGrade } from '@/data/champions';

/** Ordre des lettres de champion, du plus bas au plus haut (l'entrée, puis la collection). */
const GRADE_ORDER: Record<ChampionGrade, number> = { A: 0, S: 1 };
import { awakenLevel, type Adventurer } from './adventurers';

/** Monstres « vaincus » = tous ceux des donjons NETTOYÉS (clear = tous tués). */
export function discoveredMonsterIds(clearedDungeonIds: string[]): Set<string> {
  const cleared = new Set(clearedDungeonIds);
  const out = new Set<string>();
  for (const d of DUNGEONS) if (cleared.has(d.id)) for (const mid of d.monsterIds) out.add(mid);
  return out;
}

export interface BestiaryEntry {
  id: string;
  name: string;
  emoji: string;
  tier: number;
  discovered: boolean;
}

/** Bestiaire complet (ordonné par tier), chaque monstre marqué découvert ou non. */
export function bestiary(clearedDungeonIds: string[]): BestiaryEntry[] {
  const seen = discoveredMonsterIds(clearedDungeonIds);
  return [...MONSTERS]
    .sort((a, b) => a.tier - b.tier)
    .map((m) => ({
      id: m.id,
      name: m.name,
      emoji: m.emoji,
      tier: m.tier,
      discovered: seen.has(m.id),
    }));
}

export interface SetCollectionEntry {
  set: ItemSet;
  owned: number; // slots distincts possédés (équipé + sac), max 4
  total: number; // 4
  complete: boolean; // 4/4
}

/** Journal des sets (de voie) : pièces possédées par set (slots distincts). Les 8 sets
 *  de voie droppent sur TOUS les boss de palier → pas de boss source spécifique. */
export function setCollection(
  equipped: Equipped,
  inventory: Item[],
  // Journal des pièces DÉJÀ OBTENUES (map setId → slots) : le codex reflète ce qu'on
  // a possédé, même après avoir cassé/vendu la pièce (c9dd608d).
  seen: Record<string, string[]> = {},
): SetCollectionEntry[] {
  const all: Item[] = [
    ...SET_SLOTS.map((s) => equipped[s]).filter((i): i is Item => !!i),
    ...inventory,
  ];
  return ITEM_SETS.map((set) => {
    // Un set compte ses SIX emplacements hors relique (refonte équipement, étape 5) : une
    // ancienne pièce de relique, vue ou possédée, ne compte plus.
    const inSet = (s: string) => (SET_SLOTS as string[]).includes(s);
    const slotsOwned = new Set<string>((seen[set.id] ?? []).filter(inSet));
    for (const it of all) if (it.setId === set.id && inSet(it.slot)) slotsOwned.add(it.slot);
    const owned = Math.min(SET_SIZE, slotsOwned.size);
    return { set, owned, total: SET_SIZE, complete: owned >= SET_SIZE };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏅 LES CHAMPIONS — le troisième volet
// ─────────────────────────────────────────────────────────────────────────────

export interface ChampionEntry {
  champ: Champion;
  /** Possédé ? Un champion jamais tiré reste ❔ « ??? » grisé — le teasing déjà en place. */
  owned: boolean;
  /** Exemplaires possédés (0 si jamais tiré). */
  copies: number;
  /** Cran d'Éveil atteint (0..`AWAKEN.max`). */
  awaken: number;
}

/**
 * 🏅 LA GALERIE DES CHAMPIONS — le roster entier, marqué possédé ou non.
 *
 * ⚠️ **DÉRIVÉE DE CE QU'ON POSSÈDE, comme le reste du Codex** (le bestiaire vient des
 * donjons nettoyés, les sets du sac) : un champion EST un `Adventurer`, donc la galerie se
 * lit dans le vivier — **aucune colonne, aucune migration**.
 *
 * ⚠️ **ELLE ANNONCE CE QUI EXISTE, JAMAIS CE QUI EST PROBABLE** : pas un taux, pas une
 * chance. Les afficher ici court-circuiterait l'écran de tirage, dont c'est le métier.
 *
 * Ordre : par rareté CROISSANTE puis par nom — celui du roster, pour que la galerie se lise
 * comme la pyramide du genre (l'entrée en bas, la collection en haut).
 */
export function championGallery(advs: Adventurer[]): ChampionEntry[] {
  // ⚠️ Une BOUCLE plutôt qu'un `filter`+`map` avec un `!` : ici le garde porte le TYPE,
  // donc le retirer ne compile plus. Avec le `!`, une mutation qui supprimait le filtre
  // survivait — les recrues sans identité se rangeaient sous la clé `undefined`, qui
  // n'entre jamais en collision avec un id réel. Un garde inobservable vaut mieux écrit
  // de façon à ce qu'il ne puisse pas être retiré.
  const mien = new Map<string, Adventurer>();
  for (const a of advs) if (a.championId) mien.set(a.championId, a);
  return [...CHAMPIONS]
    .sort(
      (a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || a.name.localeCompare(b.name, 'fr'),
    )
    .map((champ) => {
      const a = mien.get(champ.id);
      const copies = a ? Math.max(1, Math.floor(a.copies ?? 1)) : 0;
      return { champ, owned: !!a, copies, awaken: a ? awakenLevel(copies) : 0 };
    });
}

export interface ChampionGroup {
  grade: ChampionGrade;
  entries: ChampionEntry[];
  /** Combien de champions de cette lettre on possède. */
  owned: number;
  total: number;
}

/**
 * 🗂️ LA GALERIE RANGÉE PAR LETTRE (S puis A — refonte 2026-09-21). Un compteur PAR lettre
 * dit d'un coup d'œil où la collection a des trous — un total seul (« 9/32 ») ne dit pas
 * s'il manque des A ou des S.
 * ⚠️ DÉRIVÉE de `championGallery`, jamais une seconde lecture du vivier : les deux vues
 * (Codex et Panthéon) doivent compter pareil. Une lettre sans aucun champion au roster
 * n'est pas rendue (un groupe « 0/0 » n'apprend rien). Le S en tête : c'est la collection.
 */
export function championGroups(advs: Adventurer[]): ChampionGroup[] {
  const groups: ChampionGroup[] = [];
  for (const e of championGallery(advs)) {
    let g = groups.find((x) => x.grade === e.champ.grade);
    if (!g) {
      g = { grade: e.champ.grade, entries: [], owned: 0, total: 0 };
      groups.push(g);
    }
    g.entries.push(e);
    g.total++;
    if (e.owned) g.owned++;
  }
  return groups.sort((x, y) => GRADE_ORDER[y.grade] - GRADE_ORDER[x.grade]);
}

export interface CodexSummary {
  monstersFound: number;
  monstersTotal: number;
  setsComplete: number;
  setsTotal: number;
  /** 🏅 La collection de champions — le troisième volet. */
  championsFound: number;
  championsTotal: number;
}

/** Résumé chiffré pour le bouton/entrée du codex. */
export function codexSummary(
  clearedDungeonIds: string[],
  equipped: Equipped,
  inventory: Item[],
  seen: Record<string, string[]> = {},
  advs: Adventurer[] = [],
): CodexSummary {
  const b = bestiary(clearedDungeonIds);
  const sets = setCollection(equipped, inventory, seen);
  const champs = championGallery(advs);
  return {
    monstersFound: b.filter((e) => e.discovered).length,
    monstersTotal: b.length,
    setsComplete: sets.filter((s) => s.complete).length,
    setsTotal: sets.length,
    championsFound: champs.filter((c) => c.owned).length,
    championsTotal: champs.length,
  };
}
