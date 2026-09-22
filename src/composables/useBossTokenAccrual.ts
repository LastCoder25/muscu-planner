// 🎫 Crédite les jetons de boss entre amis au fil de l'XP de sport (v0.1066).
//
// La règle vit dans la lib (`advanceBossTokens`, pure/testée) et l'écriture dans le store du
// personnage : ce composable ne fait que les brancher sur l'XP totale. Monté sur les écrans où
// l'XP est déjà chargée (accueil, Aventure, boss entre amis) — aucune requête de plus.
//
// ⚠️ On attend `progress.ready` : avant, l'XP vaut 0, et l'observer ferait croire au jour
// suivant qu'une journée entière de sport vient d'être gagnée.
import { watch } from 'vue';
import { useProgress } from '@/composables/useProgress';
import { useCharacterStore } from '@/stores/character';
import { useAuthStore } from '@/stores/auth';
import { useGameFx } from '@/composables/useGameFx';
import { logicalToday } from '@/lib/challenges';

export function useBossTokenAccrual() {
  const progress = useProgress();
  const char = useCharacterStore();
  const auth = useAuthStore();
  const fx = useGameFx();
  let running = false;

  watch(
    [() => progress.ready.value, () => progress.global.value.xp, () => !!char.row],
    async ([ready, xp, hasRow]) => {
      const uid = auth.user?.id;
      if (!ready || !hasRow || !uid || running) return;
      running = true;
      try {
        const gained = await char.accrueBossTokens(uid, xp, logicalToday());
        if (gained > 0)
          fx.celebrate({
            kind: 'generic',
            emoji: '🎫',
            title: `+${gained} jeton${gained > 1 ? 's' : ''} de boss`,
            subtitle: 'Gagné par ton sport du jour — lance ou rejoins un boss entre amis.',
            quiet: true,
          });
      } catch {
        /* réseau : on retentera à la prochaine variation d'XP */
      } finally {
        running = false;
      }
    },
    { immediate: true },
  );
}
