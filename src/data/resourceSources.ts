/**
 * D'OÙ VIENT CHAQUE RESSOURCE — la fiche qui s'ouvre quand on touche une puce du plateau.
 *
 * Une devise dont on ne sait pas où la chercher force à fouiller tous les écrans. Chaque
 * entrée dit à quoi elle sert et, surtout, où la gagner.
 *
 * ⚠️ `Record<ResourceId, …>` : ajouter une devise au plateau sans dire d'où elle vient
 * casse la compilation. ⚠️ Cette table DÉCRIT les sources, elle n'en calcule aucune :
 * à tenir à jour quand une source apparaît ou disparaît (les montants restent dans les libs).
 */

export type ResourceId =
  | 'energy'
  | 'mana'
  | 'gold'
  | 'summon'
  | 'keys'
  | 'sealsChamp'
  | 'sealsGear'
  | 'tickets';

export interface ResourceSource {
  emoji: string;
  label: string;
  /** Précision courte (fréquence, condition). */
  detail?: string;
}

export interface ResourceInfo {
  emoji: string;
  name: string;
  /** À quoi elle sert. */
  use: string;
  sources: ResourceSource[];
}

export const RESOURCE_SOURCES: Record<ResourceId, ResourceInfo> = {
  energy: {
    emoji: '⚡',
    name: 'Énergie',
    use: 'Jouer : donjons, boss, Labyrinthe, arène.',
    sources: [
      {
        emoji: '🏃',
        label: 'Ton sport',
        detail: 'toute l’XP de fond (séances, cardio, défis, 360)',
      },
      {
        emoji: '🎁',
        label: 'Récompense du jour',
        detail: 'bonus de connexion, croît avec la série',
      },
      { emoji: '🔌', label: 'Dynamo tellurique', detail: 'bâtiment de la base, à récolter' },
      { emoji: '💧', label: 'Sources et mines de la carte', detail: 'expéditions et équipes' },
      { emoji: '🎯', label: 'Coffre du Défi 360', detail: 'Défi 360 bouclé dans les temps' },
    ],
  },
  mana: {
    emoji: '💠',
    name: 'Pierres de mana',
    use: 'Invoquer un champion au Panthéon.',
    sources: [
      {
        emoji: '🕳️',
        label: 'Failles refermées',
        detail: 'la source principale — fermer vite paie',
      },
      { emoji: '⚔️', label: 'Incursion ratée', detail: 'la part des monstres abattus' },
      { emoji: '🛡️', label: 'Bande de faille interceptée' },
      {
        emoji: '💠',
        label: 'Mines de mana résiduel',
        detail: 'laissées par une faille qui a débordé',
      },
      { emoji: '🎁', label: 'Récompense du jour', detail: 'un tirage offert chaque jour' },
      { emoji: '🎰', label: 'Copie en trop au tirage', detail: 'convertie en mana' },
    ],
  },
  gold: {
    emoji: '🪙',
    name: 'Or',
    use: 'Construire et améliorer les bâtiments, l’enceinte, l’ascension des champions.',
    sources: [
      { emoji: '🏰', label: 'Donjons', detail: 'le butin des monstres' },
      { emoji: '👑', label: 'Boss de palier' },
      { emoji: '🪙', label: 'Vente', detail: 'objets, talents et familiers en trop' },
      { emoji: '🏕️', label: 'Mines et camps de la carte', detail: 'expéditions et équipes' },
      { emoji: '🏟️', label: 'Arène', detail: 'selon les vagues tenues' },
      { emoji: '🛡️', label: 'Sièges repoussés', detail: 'surtout les bandits' },
      { emoji: '🎯', label: 'Coffre du Défi 360' },
      { emoji: '🐉', label: 'Coffre du boss entre amis' },
    ],
  },
  summon: {
    emoji: '🔮',
    name: 'Pierres d’invocation',
    use: 'Tenter un boss de palier.',
    sources: [
      { emoji: '🏰', label: 'Nettoyer un donjon', detail: 'plus il est profond, plus il en donne' },
      { emoji: '🔮', label: 'Sanctuaires de la carte', detail: 'expéditions et équipes' },
      { emoji: '⛩️', label: 'Autel des boss', detail: 'bâtiment de la base, à récolter' },
      { emoji: '💀', label: 'Camps de morts-vivants' },
      { emoji: '🏟️', label: 'Arène' },
      { emoji: '🛡️', label: 'Sièges repoussés' },
      { emoji: '🎯', label: 'Coffre du Défi 360' },
      { emoji: '🐉', label: 'Coffre du boss entre amis' },
    ],
  },
  keys: {
    emoji: '🗝️',
    name: 'Clés',
    use: 'Entrer dans le Labyrinthe, seule source de familiers.',
    sources: [
      { emoji: '🚪', label: 'Porte du Labyrinthe', detail: 'bâtiment de la base, à récolter' },
      { emoji: '📖', label: 'Archives de la carte', detail: '1, ou 2 si le trajet est long' },
      { emoji: '👑', label: 'Boss de palier', detail: 'garantie à la 1re victoire, puis parfois' },
      { emoji: '🏰', label: 'Donjons', detail: 'rarement' },
      { emoji: '🌀', label: 'Portail sans fin', detail: 'parfois' },
      { emoji: '🗃️', label: 'Caches sur la route', detail: 'rencontre de trajet' },
      { emoji: '🛡️', label: 'Sièges repoussés' },
      { emoji: '🎯', label: 'Coffre du Défi 360', detail: 'une par semaine bien remplie' },
    ],
  },
  sealsChamp: {
    emoji: '🔱',
    name: 'Sceaux de champion',
    use: 'Faire monter un champion au rang suivant (ascension). Un sceau ne sert qu’à son rang.',
    sources: [
      {
        emoji: '🕳️',
        label: 'Gardien d’une faille refermée',
        detail: 'au rang de la faille — 2 si refermée tôt',
      },
    ],
  },
  sealsGear: {
    emoji: '⚜️',
    name: 'Sceaux d’objet',
    use: 'Faire monter une pièce d’équipement de champion au rang suivant. Un sceau ne sert qu’à son rang.',
    sources: [
      { emoji: '👹', label: 'Repaires de la carte', detail: 'une victoire, au rang du repaire' },
    ],
  },
  tickets: {
    emoji: '🎟️',
    name: 'Tickets d’invocation',
    use: 'Invoquer un champion (un ticket = un tirage).',
    sources: [
      { emoji: '⭐', label: 'Niveau global gagné', detail: '1 par niveau' },
      { emoji: '🎯', label: 'Défi 360 bouclé dans les temps', detail: '2 à 5 selon l’effort' },
      { emoji: '🐉', label: 'Boss entre amis abattu', detail: '1 à 4 selon le cran' },
      { emoji: '🛕', label: 'Construction du Panthéon', detail: '10, une seule fois' },
    ],
  },
};
