// useCrash — la DERNIÈRE erreur captée (état partagé), lue par `CrashPanel`.
import { ref } from 'vue';
import { describeCrash, isIgnorableError, type CrashInfo } from '@/lib/crashReport';

const current = ref<CrashInfo | null>(null);

/** Retient une erreur pour le panneau (la première l'emporte : c'est elle qui a tout cassé,
 *  les suivantes n'en sont souvent que des conséquences). */
export function reportCrash(err: unknown, where: string): void {
  const c = describeCrash(err, where);
  if (isIgnorableError(c.message)) return;
  if (!current.value) current.value = c;
}

export function useCrash() {
  return {
    current,
    dismiss: () => {
      current.value = null;
    },
  };
}
