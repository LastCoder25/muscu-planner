// 🧾 La ligne `characters` telle que le store la tient, et sa relecture défensive.
// Sorti du store `character` (découpage, 2026-10-15) : c'est du pur, donc testable sans
// Pinia ni Supabase. Le store garde ce qui ÉCRIT ; ici on ne fait que relire.
import { type BossTokenState } from '@/lib/friendBoss';
import { type EnergyLogEntry } from '@/lib/character';
import {
  levelToEnchant,
  enchantMult,
  round1,
  normRank,
  renameLegacyItem,
  migrateGearItem,
  fillSetPieceAffixes,
  MAX_LOADOUTS,
  type Item,
  type ItemEffect,
  type Equipped,
  type Loadout,
  type PendingReward,
} from '@/lib/items';
import { normalizeTalents, type TalentInstance } from '@/lib/talents';
import { normalizeLabyStats, type LabyStats } from '@/data/labyrinths';
import { normalizeRunStats, type RunStats } from '@/lib/runStats';
import {
  type ActiveExpedition,
  type ExpeditionMap,
  type ExpeditionMessage,
} from '@/lib/expedition';
import { healBuildings, type Building } from '@/lib/buildings';
import {
  defenseType,
  SCRAP_TO_GOLD,
  retireKennel,
  type BaseState,
  type DefenseStructure,
} from '@/lib/raid';
import { syncChampionName, advAwaken, advChampion, type Adventurer } from '@/lib/adventurers';
import { autoRise, normalizeChampSkills, type ChampSkill } from '@/lib/skillRunes';
import { migrateLegacyRunes, normalizeRuneBank, type RuneBank } from '@/lib/runeBank';
import { normalizeAdvGearState, type AdvGearState } from '@/lib/advGear';
import { normalizeParties, type ActiveParty } from '@/lib/party';
import { normalizeAttacks, type CombinedAttack } from '@/lib/combinedAttack';
import { normalizeSupplies, type SupplyStock } from '@/lib/supplies';
import { type GachaState } from '@/lib/gacha';
import { normalizeSeals, type Seals } from '@/lib/ascension';
import { PRICE_REFUND_VERSION } from '@/lib/priceRefund';

export interface CharacterRow {
  user_id: string;
  pseudo: string;
  gold: number;
  energy_spent: number;
  equipped: Equipped;
  inventory: Item[];
  talents: TalentInstance[];
  cleared_dungeons: string[];
  defeated_bosses: string[];
  login_streak: number;
  login_grace_used: boolean;
  last_login_date: string | null;
  login_energy: number;
  reward_level: number;
  endless_best: number;
  pending_reward: PendingReward | null;
  keys: number; // clés d'expédition (donjons à étages)
  summon_stones: number; // pierres d'invocation 🔮 : tenter les boss (migr. 0050)
  expedition: ActiveExpedition | null; // mode idle « Expédition » en cours
  expedition_map: ExpeditionMap | null; // carte du monde (POI)
  messages: ExpeditionMessage[]; // boîte à messages 📬 (rapports d'expédition)
  buildings: Building[]; // filons de production passive (village)
  set_pieces_seen: Record<string, string[]>; // codex : slots de set déjà obtenus par setId
  loadouts: Loadout[]; // sets d'équipement rangés (max 3, migr. 0051)
  voie: string | null; // spécialisation/archétype choisi (migr. 0055 ; null = aucune)
  energy_log: EnergyLogEntry[]; // journal d’énergie hors-sport horodaté (migr. 0057)
  base: BaseState | null; // défense de la base : enceinte, siège, champ de bataille (migr. 0060)
  /** 💠 Pierres de mana (migr. 0080) — la monnaie du gacha de champions. Elle ARRIVE avant
   *  son puits (failles → pierres de mana → gacha) : elle s'accumule, et ce n'est pas une
   *  devise morte, dont le puits aurait été retiré. */
  mana: number;
  /** 🎰 L'état du TIRAGE (migr. 0081) : le pity, rien d'autre. ⚠️ La COLLECTION n'est
   *  pas ici — un champion EST un `Adventurer`, donc il vit dans `adventurers` (v0.942),
   *  ce qui lui donne gratuitement convois, camps, défense, équipement et compagnons. */
  gacha: GachaState;
  /** 🎟️ Tickets d'invocation (migr. 0082) — gagnés UNIQUEMENT par le sport (360 bouclé,
   *  boss entre amis abattu, niveau global gagné) ; un ticket = un tirage. ⚠️ Colonne À PART
   *  et non dans `gacha` : chaque tirage réécrit `gacha`, un oubli y effacerait les tickets. */
  gacha_tickets: number;
  seals: Seals; // 🔱 sceaux d'ascension (migr. 0083)
  /** 🗓️ Lundi de la dernière semaine de quêtes récupérée (migr. 0093), ou null. */
  quest_week: string | null;
  /** 💰 Version du remboursement de la baisse des prix déjà versée (migr. 0099). */
  price_refund: number;
  /** 🪬 Runes multicolores (migr. 0094, remodelée à la bascule du 2026-09-30) : runes à
   *  ouvrir, compétences au stock, compteur d'ouvertures, version de la bascule. */
  runes: RuneBank;
  /** 🎒 Consommables d'expédition (migr. 0090) — gagnés en butin, emportés au départ. */
  supplies: SupplyStock;
  scrap: number; // 🔩 LEGACY (migr. 0060) : devise retirée (v0.998), convertie en or au chargement // journal d'énergie hors-sport horodaté (migr. 0057)
  adventurers: Adventurer[] | null; // vivier de la Guilde (migr. 0061)
  adv_gear: AdvGearState | null; // équipement des aventuriers : stock + forge (migr. 0068)
  laby_stats: LabyStats; // Labyrinthe : runs lancés / nettoyés par palier (migr. 0073)
  boss_stats: RunStats; // Boss de palier : tentatives / victoires par boss (migr. 0085)
  dungeon_stats: RunStats; // Donjons : tentatives / nettoyages par donjon (migr. 0089)
  /** 🎫 Jetons de boss entre amis (migr. 0086) : gagnés par le sport (`accrueBossTokens`),
   *  dépensés par le SERVEUR au lancement et à l'adhésion. */
  boss_tokens: number;
  boss_token_state: BossTokenState | null;
  parties: ActiveParty[] | null; // ⚔️ groupes de camp partis SANS le héros (migr. 0077)
  attacks: CombinedAttack[] | null; // ⚔️🧭 attaques combinées en préparation (migr. 0095)
  /** ⚙️ Version de l'équipement (migr. 0088) : sous `GEAR_VERSION`, la ligne reçoit une fois
   *  les cadeaux de la refonte à 7 emplacements (`gearRefonteGifts`). */
  gear_version: number;
}

const advRuneSkillsRaw = (a: Adventurer): ChampSkill[] =>
  normalizeChampSkills((a as { skills?: unknown }).skills);

/** Relit une ligne brute de la base. Garde-fou : une colonne jsonb malformée (ex. talents={}
 *  au lieu de []) ne doit JAMAIS faire planter la page. Les régularisations faites en mémoire
 *  (or remboursé, runes de la bascule) voyagent dans la ligne rendue ; `runeRefund` dit
 *  combien de runes la bascule vient de rendre (null = pas de bascule à ce chargement).
 *  ⚠️ MUTE `r` (le store passe la ligne fraîchement lue) et la rend. */
export function normalizeCharacterRow(r: CharacterRow): {
  row: CharacterRow;
  runeRefund: number | null;
} {
  let refunded: number | null = null;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const obj = <T>(v: unknown): T =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : ({} as T);
  r.talents = normalizeTalents(r.talents); // legacy string[] → instances (rétro-compat)
  // Aventuriers/convois : un jsonb malformé ne doit jamais faire planter la page.
  // ⚠️ Plus de compagnon ni de talent sur un champion (v0.996) : les champs des
  // sauvegardes d'avant sont retirés ici, la prochaine écriture les efface en base.
  r.adventurers = arr<Adventurer>(r.adventurers).map((a) => {
    const rest: Record<string, unknown> = { ...a };
    delete rest.familiarId;
    delete rest.talentId;
    // 🔮 Les compétences de runes : relues défensivement (id inconnu, doublon, niveau hors
    // bornes). Absentes = aucun champ, pas un tableau vide qu'on écrirait pour rien.
    if (rest.skills !== undefined) rest.skills = normalizeChampSkills(rest.skills);
    // 🏷️ Les champions tirés avant le renommage du roster reprennent leur nom actuel.
    return syncChampionName(rest as unknown as Adventurer);
  });
  // ⚠️ Les convois ENCAISSÉS sont taillés au chargement : la liste ne se purgeait
  // jamais (35 convois mesurés sur un compte réel, dont 30 dépensés). Un non-encaissé
  // n'est JAMAIS jeté — il porte une cargaison.
  // Équipement des aventuriers (`adv_gear`, migr. 0068) : jsonb malformé/absent → stock
  // vide, entrées sans id/slot/effet écartées, forge incomplète remise à null. Même
  // politique que `adventurers`/`caravans` ci-dessus (jamais null après normalisation,
  // malgré le type nullable qui reflète ce que la DB peut renvoyer).
  r.adv_gear = normalizeAdvGearState(r.adv_gear);
  r.laby_stats = normalizeLabyStats(r.laby_stats);
  r.boss_stats = normalizeRunStats(r.boss_stats);
  r.dungeon_stats = normalizeRunStats(r.dungeon_stats);
  if (typeof r.boss_tokens !== 'number') r.boss_tokens = 0; // 🎫 migr. 0086
  if (!r.boss_token_state || typeof r.boss_token_state !== 'object') r.boss_token_state = null;
  // ⚔️ Groupes de camp (migr. 0077) : absent/malformé → [] ; une entrée incomplète est
  // écartée (`buildMessage` la lirait à chaque tick).
  r.parties = normalizeParties(r.parties);
  r.attacks = normalizeAttacks(r.attacks);
  // Rangs (2026‑08‑18) : objets sauvegardés aux ANCIENNES raretés → nouveaux rangs.
  // ⚙️ Refonte à 7 emplacements (étape 8) : chaque objet est converti APRÈS les anciennes
  // migrations (idempotent, cf. `migrateGearItem`) — ses valeurs sont recalculées au
  // nouveau barème, un enchant baké d'avant compris.
  const fixItem = (it: Item): Item => migrateGearItem(fixLegacyItem(it));
  const fixLegacyItem = (it: Item): Item => {
    const rarity = normRank(it.rarity);
    // Nom d'avant la v0.874 (« Cuirasse mythique ») : il contredirait le rang affiché.
    it = renameLegacyItem({ ...it, rarity });
    // Pièces de set d'AVANT le correctif multi-affixe : on complète leurs affixes
    // manquants (déterministe par id) — sinon un set patiemment constitué reste à
    // 1 stat/pièce et ne vaudra jamais du stuff mixte à 3 stats.
    it = fillSetPieceAffixes(it);
    // MIGRATION enchant → valeur (ticket 7acb1e7c) : l'axe enchant des OBJETS est retiré.
    // Tout enchant existant (ou dérivé de l'ancien « niveau ») est BAKÉ dans effect.value
    // (magnitude préservée), puis enchant remis à 0. Idempotent (enchant 0 → ×1, no-op).
    const ench = it.enchant ?? levelToEnchant(it.level);
    if (!ench) return { ...it, rarity, enchant: 0 };
    const m = enchantMult(ench);
    const bake = (e: ItemEffect) => ({ ...e, value: Math.max(1, round1(e.value * m)) });
    const effect = bake(it.effect);
    const effect2 = it.effect2 ? bake(it.effect2) : undefined;
    const effect3 = it.effect3 ? bake(it.effect3) : undefined;
    return {
      ...it,
      rarity,
      enchant: 0,
      effect,
      ...(effect2 ? { effect2 } : {}),
      ...(effect3 ? { effect3 } : {}),
    };
  };
  r.inventory = arr<Item>(r.inventory).map(fixItem);
  r.cleared_dungeons = arr<string>(r.cleared_dungeons);
  r.defeated_bosses = arr<string>(r.defeated_bosses);
  r.equipped = obj<Equipped>(r.equipped);
  for (const k of Object.keys(r.equipped) as (keyof Equipped)[]) {
    const it = r.equipped[k];
    if (it) r.equipped[k] = fixItem(it);
  }
  // Loadouts (migr. 0051) : max 3 sets rangés ; on normalise le rang des objets rangés.
  r.loadouts = arr<Loadout>(r.loadouts)
    .slice(0, MAX_LOADOUTS)
    .map((l) => {
      const items = obj<Equipped>(l?.items);
      for (const k of Object.keys(items) as (keyof Equipped)[])
        if (items[k]) items[k] = fixItem(items[k]);
      // ⚠️ Les DOUBLONS du set (v0.839) étaient perdus ici : on ne rendait que `items`, et
      // la prochaine sauvegarde réécrivait les loadouts sans eux.
      return { items, spares: arr<Item>(l?.spares).map(fixItem) };
    });
  r.messages = arr<ExpeditionMessage>(r.messages);
  r.energy_log = arr<EnergyLogEntry>(r.energy_log);
  // Bâtiments (migr. 0046). On DROPPE les types disparus du registre (ex. l'ancien
  // 'fragment_vein' ; 'energy_font'/'warehouse' retirés v0.599) → pas d'emplacement
  // fantôme. ⚠️ On ne RE-PACK les slots QUE si nécessaire (`repackBuildingSlots`) : un
  // repack INCONDITIONNEL ramenait chaque bâtiment à l'index suivant le plus bas dès le
  // premier `persist()` — silencieusement contraire à « on construit là où on touche »
  // (v0.867), qui laisse le joueur choisir un emplacement vide au-delà du prochain index
  // libre. Le filet reste : un slot hors bornes ou en doublon (type retiré du registre,
  // ligne corrompue) est toujours recompacté.
  // 🛕 FUSION DU PANTHÉON (v0.949) — Guilde + Centre de formation + Équipementier.
  // ⚠️ ELLE PASSE **AVANT** LE FILTRE, et c'est tout l'enjeu : après, les trois types
  // ont disparu du registre, donc la ligne au-dessus les aurait déjà effacés — avec
  // 7,42 M d'or investis (mesuré en base). Même ordre que la fouille et `advanceBase`
  // (v0.772). ⚠️ Le remboursement vit ICI, collé à la fusion, pour que l'or et les
  // bâtiments voyagent ENSEMBLE dans la même ligne en mémoire ; `load()` les persiste
  // aussitôt, sans quoi une écriture qui ne porterait que l'or rembourserait deux fois.
  const soin = healBuildings(arr<Building>(r.buildings));
  if (soin.goldRefund > 0) r.gold = (r.gold ?? 0) + soin.goldRefund;
  r.buildings = soin.buildings;
  r.set_pieces_seen = obj<Record<string, string[]>>(r.set_pieces_seen); // migr. 0047
  // 🎰 Le PITY doit survivre à un rechargement : remis à zéro, la garantie anti-
  // malchance (garanti au 90e tirage) serait inatteignable, et ici il n'y a aucun
  // argent réel pour compenser une série noire.
  const g = obj<Partial<GachaState>>(r.gacha);
  r.gacha = {
    sinceTop: Math.max(0, Math.floor(Number(g.sinceTop) || 0)),
    sinceFloor: Math.max(0, Math.floor(Number(g.sinceFloor) || 0)),
    sinceApex: Math.max(0, Math.floor(Number(g.sinceApex) || 0)),
    pulls: Math.max(0, Math.floor(Number(g.pulls) || 0)),
    ...(g.v ? { v: Math.floor(Number(g.v)) } : {}),
    // 🎟️ ⚠️ LA MARQUE DES TICKETS DE BIENVENUE DOIT SURVIVRE À LA RELECTURE : sans cette
    // ligne, `normalizeRow` la jetait à chaque lecture et le rattrapage se rejouait à
    // CHAQUE chargement — des tickets à l'infini.
    ...(g.welcomed ? { welcomed: true } : {}),
  };
  if (typeof r.summon_stones !== 'number') r.summon_stones = 0; // colonne récente (migr. 0050)
  if (typeof r.gacha_tickets !== 'number') r.gacha_tickets = 0; // 🎟️ migr. 0082
  if (typeof r.gear_version !== 'number') r.gear_version = 0; // ⚙️ migr. 0088
  if (typeof r.quest_week !== 'string') r.quest_week = null; // 🗓️ migr. 0093
  // 💰 migr. 0099 — absent = déjà versé : on ne rembourse jamais sur une lecture incomplète.
  if (typeof r.price_refund !== 'number') r.price_refund = PRICE_REFUND_VERSION;
  // 🪬 LA BASCULE DES RUNES MULTICOLORES (2026-09-30), une fois : les compétences des
  // champions sont RETIRÉES et remboursées en runes (`REFUND_PER_LEVEL`), comme le stock
  // coloré et la rune en attente. ⚠️ ICI, sur la ligne brute, pour que les runes et le vivier
  // sans compétences voyagent dans la MÊME ligne en mémoire ; `loadMine` les persiste
  // aussitôt, ensemble (`settleRuneBascule`).
  const mig = migrateLegacyRunes(
    r.runes,
    r.adventurers.map((a) => {
      const c = advChampion(a);
      return {
        skills: advRuneSkillsRaw(a),
        grade: c ? c.grade : null,
        ascended: a.ascended ?? 0,
        awaken: c ? advAwaken(a) : 0,
      };
    }),
  );
  if (mig) {
    r.runes = mig.bank;
    r.adventurers = r.adventurers.map((a) => {
      const rest: Record<string, unknown> = { ...a };
      delete rest.skills;
      return rest as unknown as Adventurer;
    });
    refunded = mig.refunded;
  } else {
    r.runes = normalizeRuneBank(r.runes);
    // 🌈 RATTRAPAGE (v1.253.0) : depuis que le niveau 5 s'élève de lui-même chez un champion
    // (`autoRise`), les Nv 5 déjà posés passent au Nv 1 de la couleur au-dessus. ⚠️ APRÈS la
    // bascule des runes (elle rembourse les compétences d'avant à LEUR niveau). En mémoire ;
    // la prochaine écriture des champions l'inscrit en base (idempotent d'ici là).
    r.adventurers = r.adventurers.map((a) => {
      if (!a.skills?.length) return a;
      const up = autoRise(a.skills);
      return up.rose.length ? { ...a, skills: up.skills } : a;
    });
  }
  r.seals = normalizeSeals(r.seals); // 🔱 migr. 0083
  r.supplies = normalizeSupplies(r.supplies); // 🎒 migr. 0090
  if (r.voie === undefined) r.voie = null; // migr. 0055 (spécialisation)
  // 🔩 → 🪙 LA FERRAILLE EST RETIRÉE (v0.998). La réserve d'un compte est convertie en
  // or, une fois, au taux de l'épave (`SCRAP_TO_GOLD`). ⚠️ Même politique que le
  // Panthéon : la conversion vit ICI, pour que l'or et la ferraille à zéro voyagent dans
  // la MÊME ligne en mémoire ; `fetchMine` les persiste aussitôt, sans quoi une écriture
  // qui ne porterait que l'or convertirait deux fois.
  const scrapLeft = typeof r.scrap === 'number' ? Math.max(0, r.scrap) : 0;
  if (scrapLeft > 0) r.gold = (r.gold ?? 0) + scrapLeft * SCRAP_TO_GOLD;
  r.scrap = 0;
  if (!r.base || typeof r.base !== 'object' || Array.isArray(r.base)) r.base = null;
  // 🐾 LE CHENIL EST RETIRÉ (v0.996) — son investissement est RENDU. ⚠️ AVANT le filtre
  // des types inconnus ci-dessous, sinon il disparaîtrait sans rien rendre (même ordre
  // que la fusion du Panthéon). `fetchMine` persiste aussitôt (`settleLegacy`).
  if (r.base) {
    const k = retireKennel({ ...r.base, defenses: arr<DefenseStructure>(r.base.defenses) });
    if (k.gold) {
      r.gold = (r.gold ?? 0) + k.gold;
      r.base = k.base;
    }
  }
  // Une structure dont le type a disparu du registre est DROPPÉE (même politique que
  // les bâtiments) → pas d'enceinte fantôme après un renommage de type.
  if (r.base)
    r.base.defenses = arr<DefenseStructure>(r.base.defenses).filter((d) => defenseType(d.typeId));
  if (!r.expedition || typeof r.expedition !== 'object') r.expedition = null;
  if (!r.expedition_map || typeof r.expedition_map !== 'object') r.expedition_map = null;
  return { row: r, runeRefund: refunded };
}
