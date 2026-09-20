// 🐉 MES frappes de BOSS ENTRE AMIS, groupées par (boss, jour).
//
// ⚠️ UNE SEULE DÉFINITION, et ce n'est pas du confort : deux écrans lisent cette source —
// l'**Agenda** (v0.912) et l'**entrée des calculs de volume** (`useBalanceInput`, v0.971,
// qui alimente l'équilibre du corps et le radar). Les deux écrivaient le même appel à cinq
// arguments, avec leur propre « qui suis-je » et leur propre clé de jour. C'est exactement
// le point de jonction où l'Agenda et le graphe peuvent se mettre à dire deux choses
// différentes : le jour où `bossAgendaEntries` gagne un filtre (les boss abandonnés, la
// bascule à 4 h…), il ne serait ajouté qu'à l'un des deux appels.
//
// Même raison d'être que `useFriendBossEntry` (« une seule définition, sinon les deux
// cartes finiraient par annoncer des choses différentes »).
import { computed } from 'vue';
import { useFriendBossStore } from '@/stores/friendBoss';
import { useAuthStore } from '@/stores/auth';
import { bossAgendaEntries, type BossAgendaEntry } from '@/lib/friendBoss';
import { localDayIso } from '@/lib/volume';

/** La clé de jour des frappes : celle de TOUT le projet (`localDayIso`), jamais une
 *  seconde — une clé écrite à côté avec `toISOString` décale d'un jour en France. */
export const bossDayKey = (ms: number): string => localDayIso(new Date(ms));

export function useMyBossDays() {
  const friendBoss = useFriendBossStore();
  const auth = useAuthStore();

  const entries = computed<BossAgendaEntry[]>(() =>
    bossAgendaEntries(
      friendBoss.bosses,
      friendBoss.members,
      friendBoss.hits,
      auth.user?.id ?? '',
      bossDayKey,
    ),
  );

  /** ⚠️ À appeler par tout écran qui LIT ces entrées : sans ça les boss comptent ZÉRO
   *  sur un écran qui ne les a pas déjà chargés, en silence. */
  const ensureLoaded = () => friendBoss.fetchMine();

  return { entries, ensureLoaded };
}
