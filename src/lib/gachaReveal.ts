/**
 * 🎰 LA MISE EN SCÈNE D'UN TIRAGE — l'invocation (v1.002, maquette validée le 2026-09-21).
 *
 * ⚠️ **RÈGLE FONDATRICE, la même que `siegeStage` et `arenaStage` : CE MODULE NE DÉCIDE
 * RIEN.** Le champion est déjà tiré (`pullChampion`, côté store, avec son pity persisté) ;
 * on ne fait que **placer dans le temps** un résultat tranché. Une mise en scène qui tirerait
 * elle-même ferait diverger ce qu'on voit de ce qu'on possède, et le pity ne voudrait plus
 * rien dire.
 *
 * ## La séquence (remplace la roulette de portraits, retirée à la demande)
 *
 * 1. **Le cercle se charge TOUT SEUL** (`INVOKE.chargeMs`, un peu plus long pour un ×10) :
 *    choisir ×1 ou ×10 lance la séquence, il n'y a plus un geste à faire (v0.1101, demandé).
 *    ⚠️ Et c'est là que vit le **présage de la scène** (`omenOf`) : le sanctuaire réagit
 *    quand la meilleure lettre du tirage est un A ou un S.
 * 2. **Un orbe est lancé** : il ralentit comme sous la gravité, s'arrête, puis retombe
 *    lourdement. ⚠️ **Il ne se déforme jamais** (demandé), et **aucune traînée à la descente**.
 * 3. **Sa couleur est le PRÉSAGE** : la lettre elle-même (bleu B, violet A, or S).
 * 4. **La surprise vers le haut** : à l'apogée, l'orbe se fissure et monte d'une lettre.
 * 5. **L'impact** : colonne de lumière, silhouette teintée, la LETTRE s'abat (pas d'étoiles :
 *    elles sont déjà prises dans l'app), puis le portrait et le nom.
 *
 * Au ×10 : dix orbes partent **toutes bleues**, les A puis les S s'allument une à une à
 * l'apogée, elles retombent en **cartes face cachée** ; les B se retournent seuls, et
 * toucher un A ou un S l'ouvre au centre du cercle comme un ×1.
 *
 * ## ⚠️ Le présage ne ment JAMAIS — c'est la propriété centrale, et elle est testée
 *
 * Il peut SOUS-annoncer (partir bleu et monter) mais jamais sur-annoncer : un chemin de
 * présage finit TOUJOURS sur la vraie lettre, ne descend jamais, et **un B ne connaît
 * aucune surprise** — une fausse montée sur le fond du tirage serait une promesse trahie.
 *
 * ## `prefers-reduced-motion`
 *
 * Le plan « réduit » n'est pas un cas particulier de l'écran : un présage sans surprise et
 * `reduced: true`, que l'écran lit pour afficher l'état FINAL directement.
 */

import type { Champion, PullGrade } from '@/data/champions';

/** Rang d'une lettre dans la mise en scène : B 0, A 1, S 2. */
export const GRADE_RANK: Record<PullGrade, number> = { B: 0, A: 1, S: 2 };
/** L'inverse : la lettre d'un rang de présage. */
export const RANK_GRADE: readonly PullGrade[] = ['B', 'A', 'S'];

/**
 * 🎚️ LE RYTHME — repris de la maquette validée. ⚠️ Tout est en millisecondes et vit ICI :
 * le composant lit ces valeurs, il n'en écrit aucune.
 */
export const INVOKE = {
  /**
   * Charge du cercle avant le lancer — ×1 et ×10.
   *
   * ⚠️ **C'ÉTAIT UN MAINTIEN DU DOIGT (1000 / 2500 ms), ce n'en est plus un** : depuis que
   * le choix du tirage lance tout (v0.1101), ces millisecondes ne sont plus un GESTE mais
   * l'ouverture de l'animation. Un geste se paie volontiers, une attente non — elles sont
   * donc nettement plus courtes. Le ×10 garde une longueur d'avance : son grand cercle a
   * plus de couches à allumer.
   */
  chargeMs: 620,
  chargeMsLot: 900,
  /** Montée de l'orbe (décélération), arrêt à l'apogée, prise d'élan, chute (accélération). */
  riseMs: 820,
  apexMs: 260,
  /** Ce que chaque rang de lettre ajoute à l'arrêt : plus c'est rare, plus on attend. */
  apexMsParRang: 180,
  windupMs: 170,
  fallMs: 560,
  /** Une fissure (surprise vers le haut) : craquelure, flash, repos. */
  crackMs: 1150,
  /** Silhouette avant que la lettre s'abatte, et ce que chaque rang ajoute. */
  silhouetteMs: 450,
  silhouetteMsParRang: 250,
  /** Nom écrit lettre par lettre (par caractère). */
  typeMsParLettre: 34,
  /** ×10 : décalage de lancer entre deux orbes, arrêt commun, fissure d'une orbe,
   *  apparition des cartes, retournement d'un B. */
  lotLaunchStagger: 45,
  lotApexMs: 450,
  lotCrackMs: 560,
  lotLandMs: 520,
  lotFlipStagger: 85,
} as const;

/**
 * 🎲 LA SURPRISE VERS LE HAUT — sa fréquence. ⚠️ Rare sur un A (sinon elle ne surprend
 * plus), fréquente sur un S (c'est LE moment du genre), JAMAIS sur un B. Au ×10 elle est
 * systématique : les dix orbes partent bleues, c'est l'allumage qui fait le suspense ;
 * `lotDoubleS` règle seulement si un S passe par le violet.
 */
export const SURPRISE = { A: 0.3, S: 0.55, doubleS: 0.4, lotDoubleS: 0.6 } as const;

/**
 * 🎰 UNE CASE — un champion (S/A) ou une pièce (B).
 * ⚠️ Le B n'est pas un champion (refonte 2026-09-21) : c'est une pièce d'équipement de
 * lignée. La case le dit par son emoji, son nom et son illustration.
 */
export interface RevealCell {
  grade: PullGrade;
  emoji: string;
  name: string;
  /** L'identité du champion, `null` pour un B. */
  championId: string | null;
  /** Le modèle de la pièce d'un B (son illustration), absent pour un champion. */
  gearModel?: string | null;
}

export const cellOfChampion = (c: Champion): RevealCell => ({
  grade: c.grade,
  emoji: c.emoji,
  name: c.name,
  championId: c.id,
});

/**
 * 🎰 CE QU'UN TIRAGE A DONNÉ — la matière de la mise en scène (champion ou pièce).
 * ⚠️ ELLE NE DÉCIDE RIEN : tout est déjà tiré par le store (avec le pity qui s'enchaîne).
 */
export interface LotItem {
  grade: PullGrade;
  /** `null` = une pièce (toujours pour un B, parfois pour un S ou un A). */
  champion: Champion | null;
  /** La pièce tirée (son nom et son visage), `null` pour un champion. */
  gear: { name: string; emoji: string; model?: string | null } | null;
  duplicate: boolean;
  copies: number;
  manaBack: number;
}

/** La case que porte un résultat. */
export function cellOf(it: LotItem): RevealCell {
  if (it.champion) return cellOfChampion(it.champion);
  return {
    grade: it.grade,
    emoji: it.gear?.emoji ?? '🎁',
    name: it.gear?.name ?? 'Pièce d’équipement',
    championId: null,
    gearModel: it.gear?.model ?? null,
  };
}

/** Une orbe et ce qu'elle cache. */
export interface RevealItem {
  cell: RevealCell;
  /**
   * Le PRÉSAGE : les rangs de lettre que l'orbe affiche successivement. ⚠️ Toujours
   * croissant, et le dernier est TOUJOURS la vraie lettre (testé) — il sous-annonce, il ne
   * ment jamais.
   */
  path: number[];
}

export interface RevealPlan {
  /** Les orbes, dans l'ORDRE DU TIRAGE : une pour un ×1, dix pour un ×10. */
  items: RevealItem[];
  /** `prefers-reduced-motion` : l'écran montre l'état FINAL, sans rien animer. */
  reduced: boolean;
}

/** La vraie lettre d'une orbe (le bout de son présage). */
export const finalRank = (it: RevealItem): number => it.path[it.path.length - 1]!;

/** Le présage d'un tirage à l'unité : sa vraie couleur, ou une surprise vers le haut. */
function singlePath(rank: number, rng: () => number): number[] {
  if (rank === 0) return [0];
  if (rank === 1) return rng() < SURPRISE.A ? [0, 1] : [1];
  if (rng() >= SURPRISE.S) return [2];
  return rng() < SURPRISE.doubleS ? [0, 1, 2] : [rng() < 0.5 ? 0 : 1, 2];
}

/**
 * 🎰 Le plan d'un tirage à l'unité.
 * ⚠️ `rng` ne sert QU'AU présage : le résultat est déjà connu. Même graine → même mise en
 * scène, ce qui la rend testable, sans aucune conséquence sur le jeu.
 */
export function buildReveal(
  target: RevealCell,
  rng: () => number,
  opts?: { reduced?: boolean },
): RevealPlan {
  const rank = GRADE_RANK[target.grade];
  const reduced = !!opts?.reduced;
  return { items: [{ cell: target, path: reduced ? [rank] : singlePath(rank, rng) }], reduced };
}

/**
 * 🎰 Le plan d'un ×10. Les dix orbes partent BLEUES : un A s'allume en violet, un S monte à
 * l'or (parfois en passant par le violet). ⚠️ L'ordre du tirage est conservé — c'est ce qui
 * a réellement eu lieu, et le store l'a persisté ainsi.
 */
export function buildLotReveal(
  lot: readonly LotItem[],
  rng: () => number,
  opts?: { reduced?: boolean },
): RevealPlan {
  const reduced = !!opts?.reduced;
  const items = lot.map((it) => {
    const rank = GRADE_RANK[it.grade];
    let path: number[];
    if (reduced || rank === 0) path = [rank];
    else if (rank === 1) path = [0, 1];
    else path = rng() < SURPRISE.lotDoubleS ? [0, 1, 2] : [0, 2];
    return { cell: cellOf(it), path };
  });
  return { items, reduced };
}

/**
 * L'ordre dans lequel les orbes d'un ×10 s'allument : les A d'abord, les S en dernier, puis
 * l'ordre du tirage. ⚠️ Le meilleur ferme la marche — c'est lui que l'on attend.
 */
export function igniteOrder(plan: RevealPlan): number[] {
  return plan.items
    .map((it, i) => ({ i, r: finalRank(it), up: it.path.length > 1 }))
    .filter((x) => x.up)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.i);
}

/** Le rang le plus haut du plan — il donne la couleur de l'impact et son intensité. */
export function bestRank(plan: RevealPlan): number {
  return Math.max(0, ...plan.items.map(finalRank));
}

/**
 * 🔮 LE PRÉSAGE DE LA SCÈNE — ce que le sanctuaire laisse deviner pendant que le cercle se
 * charge (v0.1101, demandé : « un effet subtil mais visible avec la rareté max du tirage,
 * pour les A et S uniquement »).
 *
 * ⚠️ **RIEN POUR UN B, ET C'EST CE QUI FAIT LE SIGNAL.** Le fond de tirage est la ligne de
 * base : un présage permanent ne présagerait plus rien. Il ne vaut quelque chose que parce
 * qu'il n'apparaît PAS la plupart du temps — donc sa seule présence dit déjà « il y a au
 * moins un A », avant même qu'on lise sa couleur.
 *
 * ⚠️ **IL ANNONCE LA MEILLEURE LETTRE, DONC IL DEVANCE LA SURPRISE DE L'ORBE** — assumé, et
 * c'est déjà la doctrine de cet écran : l'apogée et la silhouette durent d'autant plus
 * longtemps que la lettre est haute (« ça ne spoile pas, ça fait monter la tension »,
 * v0.960). Il dit qu'il se passe quelque chose ; la lettre, elle, dit quoi.
 *
 * ⚠️ **IL NE SE DIT PAS EN MOTS, seulement en lumière** : écrire « un S approche » ne serait
 * plus un présage mais une annonce, et il n'y aurait plus rien à attendre.
 *
 * ⚠️ `prefers-reduced-motion` → **aucun présage** : l'écran saute à l'état final, il n'y a
 * pas d'animation à teinter. C'est la lib qui le décide, pas un cas particulier de l'écran.
 */
export const OMEN_STRENGTH: Record<'A' | 'S', number> = { A: 0.5, S: 1 };

export interface Omen {
  /** La meilleure lettre du tirage : elle donne la couleur. */
  grade: 'A' | 'S';
  rank: number;
  /** 0..1 — l'intensité de l'ambiance : un S en met deux fois plus qu'un A. */
  strength: number;
}

export function omenOf(plan: RevealPlan): Omen | null {
  if (plan.reduced) return null;
  const rank = bestRank(plan);
  const grade = RANK_GRADE[rank];
  if (grade !== 'A' && grade !== 'S') return null;
  return { grade, rank, strength: OMEN_STRENGTH[grade] };
}

/**
 * 🎨 LES COULEURS DU CERCLE (v0.1110-0.1111, demandé : « le cercle de la couleur des rangs
 * B ; les cercles violets, c'est pour les cercles avec les motifs, et les boules à
 * l'intérieur pour l'or ; et pas visible tant que l'animation ne se charge pas »).
 * Le cercle est toujours B ; les médaillons à motifs passent en A dès qu'un A est dans le
 * tirage, les boules intérieures en S dès qu'un S y est — mais seulement quand leur partie
 * s'ALLUME pendant la charge (c'est le composant qui le peint). ⚠️ Deux signaux
 * INDÉPENDANTS : un ×10 avec un A et un S allume les deux. Tant que le plan n'est pas
 * arrivé, tout reste B. ⚠️ Lu sur la vraie lettre (`finalRank`), jamais sur le présage.
 */
export interface SigilTints {
  /** Les médaillons à motifs (le petit cercle n'en a pas : ses losanges les remplacent). */
  medals: PullGrade;
  /** Les boules intérieures. */
  beads: PullGrade;
}
export function sigilTints(plan: RevealPlan | null): SigilTints {
  const ranks = plan?.items.map(finalRank) ?? [];
  return {
    medals: ranks.includes(GRADE_RANK.A) ? 'A' : 'B',
    beads: ranks.includes(GRADE_RANK.S) ? 'S' : 'B',
  };
}

/**
 * ✨ LA POUSSIÈRE SCINTILLANTE derrière les boules colorées (v0.1114, demandé : « des sortes
 * de traînées pas définies, comme de la poussière scintillante derrière ; avoir du violet
 * est une bonne nouvelle, avoir de l'or une excellente nouvelle ; le joueur veut voir ses
 * couleurs, et plus c'est rare plus ce doit être spectaculaire »). Chaque boule allumée
 * sème des grains qui restent sur place pendant qu'elle file — la traînée naît de sa
 * course. ⚠️ L'or doit l'emporter sur TOUS les axes (testé) : plus de grains, qui vivent
 * plus longtemps, plus gros, plus souvent en étoile, qui scintillent plus vite.
 */
export interface DustStyle {
  /** Grains semés par seconde et par boule. */
  rate: number;
  /** Durée de vie d'un grain (s), entre ces deux bornes. */
  life: [number, number];
  /** Taille d'un grain (px CSS), entre ces deux bornes. */
  size: [number, number];
  /** Part des grains dessinés en étoile scintillante. */
  stars: number;
  /** Fréquence du scintillement (Hz). */
  twinkle: number;
  /** Part des grains qui deviennent de grandes étoiles éclatantes. */
  flares: number;
}
export const DUST: Record<'A' | 'S', DustStyle> = {
  A: { rate: 22, life: [0.9, 1.6], size: [4.5, 8.5], stars: 0.3, twinkle: 7, flares: 0 },
  S: { rate: 46, life: [1, 1.9], size: [5, 10], stars: 0.4, twinkle: 11, flares: 0.06 },
};

/**
 * 🔯 LA CHARGE EN TROIS PARTIES (v0.1111, demandé : « séparer les parties à charger : que
 * la première tourne avant que celle plus à l'intérieur commence à tourner dans l'autre
 * sens, et enfin la dernière partie dans le sens de la première »). De l'extérieur vers le
 * centre, chaque partie se charge sur un tiers de la charge ; elle ne tourne qu'une fois la
 * précédente chargée, et les sens alternent (+, −, +).
 */
export const SIGIL_ZONES = 3;
/** Avancement de la charge DANS une partie (0 = extérieure), de 0 à 1. */
export function zoneCharge(charge: number, zone: number): number {
  return Math.min(1, Math.max(0, charge * SIGIL_ZONES - zone));
}
/** Une partie tourne une fois atteinte : la première toujours, les suivantes quand la
 *  charge a rempli les précédentes. `peak` = la charge la plus haute depuis le début de
 *  la charge en cours — la charge retombe à 0 à la révélation, le cercle ne s'arrête pas. */
export function zoneSpins(peak: number, zone: number): boolean {
  return zone === 0 || peak * SIGIL_ZONES >= zone;
}
/** Le sens de rotation d'une partie : alterné, la dernière dans le sens de la première. */
export const zoneDirection = (zone: number): 1 | -1 => (zone % 2 === 0 ? 1 : -1);

/** Durée de l'arrêt à l'apogée pour ce rang. */
export const apexMs = (rank: number) => INVOKE.apexMs + rank * INVOKE.apexMsParRang;
/** Durée de la silhouette pour ce rang. */
export const silhouetteMs = (rank: number) =>
  INVOKE.silhouetteMs + rank * INVOKE.silhouetteMsParRang;

/**
 * ⏱️ Durée de la séquence d'un ×1, du lancer de l'orbe au nom écrit — hors charge, hors
 * lecture du résultat. ⚠️ Bornée par un test : une révélation qui traîne se subit au
 * dixième tirage, même avec « Passer ».
 */
export function singleSequenceMs(plan: RevealPlan): number {
  const it = plan.items[0];
  if (!it || plan.reduced) return 0;
  const rank = finalRank(it);
  return (
    INVOKE.riseMs +
    apexMs(rank) +
    (it.path.length - 1) * INVOKE.crackMs +
    INVOKE.windupMs +
    INVOKE.fallMs +
    silhouetteMs(rank) +
    it.cell.name.length * INVOKE.typeMsParLettre
  );
}

/**
 * ⏱️ Durée d'un ×10 jusqu'aux cartes retournées (hors révélations au toucher, qui vont au
 * rythme du joueur).
 */
export function lotSequenceMs(plan: RevealPlan): number {
  if (plan.reduced) return 0;
  const cracks = plan.items.reduce((s, it) => s + (it.path.length - 1), 0);
  const bees = plan.items.filter((it) => finalRank(it) === 0).length;
  return (
    INVOKE.riseMs +
    (plan.items.length - 1) * INVOKE.lotLaunchStagger +
    INVOKE.lotApexMs +
    cracks * INVOKE.lotCrackMs +
    INVOKE.windupMs +
    INVOKE.fallMs +
    INVOKE.lotLandMs +
    bees * INVOKE.lotFlipStagger
  );
}

/** Le résultat du lot qui porte la révélation : la meilleure lettre. ⚠️ À lettre égale on
 *  garde le PREMIER tiré — un départage au hasard ferait varier la mise en scène d'un
 *  rechargement à l'autre pour un même lot. */
export function bestOfLot(lot: readonly LotItem[]): LotItem | null {
  let best: LotItem | null = null;
  for (const it of lot) {
    if (!best || GRADE_RANK[it.grade] > GRADE_RANK[best.grade]) best = it;
  }
  return best;
}

/** L'ordre de la grille : de la meilleure lettre à la plus basse, puis l'ordre du tirage.
 *  ⚠️ On COPIE : le lot vient du store, et le trier en place réordonnerait ce qui a été
 *  persisté — l'ordre du tirage est ce qui a réellement eu lieu. */
export function lotOrder(lot: readonly LotItem[]): LotItem[] {
  return lot
    .map((it, i) => ({ it, i }))
    .sort((a, b) => GRADE_RANK[b.it.grade] - GRADE_RANK[a.it.grade] || a.i - b.i)
    .map((x) => x.it);
}
