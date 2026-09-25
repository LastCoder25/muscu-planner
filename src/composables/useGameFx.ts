// useGameFx — file d'attente d'ANIMATIONS CENTRALES (overlay plein écran assombri)
// pour les moments clés de l'Aventure : drop d'objet (coloré/explosant selon la
// rareté), familier obtenu, montée de niveau, déverrouillage (chaînes qui explosent),
// bâtiment construit/amélioré… But : rendre le jeu IMMERSIF, guider par l'animation.
//
// Singleton (état au niveau module) : n'importe quel écran appelle `celebrate(...)`,
// l'overlay global (GameFxOverlay, monté dans App.vue) joue les fx une par une.
import { ref } from 'vue';
// ⚠️ Type SEUL (zéro runtime) : l'échelle d'intensité se dérive des raretés du jeu,
// et une seconde déclaration de la même union serait la porte ouverte à la divergence.
import type { FxRarity } from '@/lib/items';

type GameFxKind =
  | 'drop'
  | 'familiar'
  | 'levelup'
  | 'unlock'
  | 'building'
  | 'chest' // coffre de fin de Défi 360 : couvercle qui s'ouvre, butin qui jaillit
  | 'tickets' // tickets d'invocation distribués un par un en éventail (`count`)
  | 'rankup' // ascension d'un champion : le médaillon passe de la couleur d'un rang à l'autre
  | 'generic';

export interface GameFx {
  id: number;
  kind: GameFxKind;
  emoji: string; // gros glyphe central
  title: string;
  subtitle?: string;
  // Rareté → couleur + intensité de l'effet (divin = explosion). Optionnel.
  rarity?: FxRarity;
  /** Nombre d'objets à distribuer (`kind: 'tickets'`) : un ticket dessiné par unité. */
  count?: number;
  /** Rangs (index de `CHARACTER_RANKS`) d'un changement de rang (`kind: 'rankup'`) :
   *  l'overlay en tire les couleurs et les emblèmes, jamais une seconde table. */
  ranks?: { from: number; to: number };
  /** Le champion mis en scène (`kind: 'rankup'`) : son portrait est au centre. */
  championId?: string | null;
  /** 🗡️ Ascension d'une PIÈCE de champion (`kind: 'rankup'`) : son illustration au centre,
   *  à la place du portrait. `subtitle` y devient la ligne sous les rangs. */
  gear?: { model: string | null };
  /** DISCRET : bandeau en haut qui LAISSE PASSER LES TOUCHES, au lieu de l'overlay plein
   *  écran. Pour ce qui se répète (boss refarmé, drop, set renforcé) : enchaîner plusieurs
   *  overlays bloquait « Réattaquer » pendant des secondes. */
  quiet?: boolean;
  /** Reste à l'écran jusqu'au toucher (pas de fermeture automatique) : pour ce qu'on doit
   *  avoir le temps de LIRE, comme le contenu d'un coffre. */
  sticky?: boolean;
}

/** Durée d'affichage d'un bandeau discret. */
const TOAST_MS = 2800;
/** Au-delà, on retire les plus anciens : une rafale ne doit pas couvrir l'écran. */
const TOAST_MAX = 3;

const queue = ref<GameFx[]>([]);
const toasts = ref<GameFx[]>([]);
let seq = 0;

export function useGameFx() {
  function celebrate(fx: Omit<GameFx, 'id'>): void {
    const item = { ...fx, id: ++seq };
    if (!fx.quiet) {
      queue.value.push(item);
      return;
    }
    toasts.value = [...toasts.value, item].slice(-TOAST_MAX);
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== item.id);
    }, TOAST_MS);
  }
  function dismiss(): void {
    queue.value.shift();
  }
  /** Toucher un bandeau le ferme (v0.860, demandé par l'utilisateur). */
  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }
  /** 🎟️ GAIN DE TICKETS D'INVOCATION — la MÊME animation à chaque gain (demandé par
   *  l'utilisateur) : niveau franchi, coffre de Défi 360 ou de boss entre amis encaissé,
   *  Panthéon posé. Une seule définition, sinon chaque source finirait par avoir la sienne. */
  function celebrateTickets(count: number, subtitle: string): void {
    const n = Math.round(count || 0);
    if (n <= 0) return;
    celebrate({
      kind: 'tickets',
      emoji: '🎟️',
      count: n,
      title: `+${n} ticket${n > 1 ? 's' : ''} d’invocation`,
      subtitle,
      rarity: 'legendary', // or : la couleur des tickets
    });
  }
  return { queue, toasts, celebrate, celebrateTickets, dismiss, dismissToast };
}
