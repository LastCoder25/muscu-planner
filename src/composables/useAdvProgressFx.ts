// ⭐ L'ANNONCE DE CE QU'UNE MISSION A CHANGÉ POUR LES CHAMPIONS — étoile gagnée, rang gagné,
// ou « ★★★★★ — prêt pour l'ascension ». ⚠️ UNE SEULE mise en scène pour les convois, les
// camps et les failles : la boucle vivait dans la carte d'expédition, et les deux autres
// sources n'annonçaient rien (le niveau d'un champion étant CACHÉ, c'était le seul retour).
import { useGameFx } from './useGameFx';
import { fxRarity } from '@/lib/items';
import { rankStarStr } from '@/lib/characterRank';
import type { AdvProgress } from '@/lib/adventurers';

export function useAdvProgressFx() {
  const gameFx = useGameFx();
  function announce(events: readonly AdvProgress[] | undefined) {
    for (const e of events ?? []) {
      if (e.to <= e.from && !e.ascendReady) continue;
      // ⚠️ UN RANG GAGNÉ N'EST PAS UNE ÉTOILE DE PLUS : c'est un vrai palier de prestige,
      // il ne doit pas se lire comme un cran de routine.
      gameFx.celebrate({
        kind: 'levelup',
        emoji: e.rankUp ? e.rankEmoji : '⭐',
        title: e.rankUp ? `${e.name} passe ${e.rankName} !` : `${e.name} — ${rankStarStr(e.star)}`,
        subtitle: e.ascendReady
          ? '★★★★★ — prêt pour l’ascension (Panthéon)'
          : e.rankUp
            ? `${rankStarStr(e.star)} · nouveau rang`
            : 'une étoile de plus',
        rarity: fxRarity(e.rarity),
      });
    }
  }
  return { announce };
}
