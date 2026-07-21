// Niveau d'athlète (progression des séances). Charge tous les bilans (mis en
// cache dans le store) et expose le niveau calculé, réactif.
import { computed, onMounted } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { athleteXpPoints, athleteLevel } from '@/lib/athlete';

export function useAthlete() {
  const logs = useLogsStore();
  onMounted(() => {
    logs.fetchAll().catch(() => undefined);
  });
  const level = computed(() => athleteLevel(athleteXpPoints(logs.all.map((r) => r.payload))));
  const hasSessions = computed(() => logs.all.length > 0);
  return { level, hasSessions };
}
