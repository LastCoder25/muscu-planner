// Boot notifyTap — toucher une notification Quasar la ferme, partout dans l'app.
// Les plugins sont installés avant les boots : `$q.notify` existe déjà, on l'enveloppe.
// `useQuasar()` rend le même objet `$q`, donc tous les écrans en profitent.
import { defineBoot } from '#q-app';
import { Notify } from 'quasar';
import { withTapToDismiss } from '@/lib/notifyTap';

export default defineBoot(({ app }) => {
  const $q = app.config.globalProperties.$q;
  const wrapped = withTapToDismiss($q.notify as never);
  $q.notify = wrapped;
  Notify.create = wrapped;
});
