// notifyTap.ts — TOUCHER UNE NOTIFICATION LA FERME (v0.860 ; demandé par l'utilisateur).
//
// Quasar ne ferme une notification qu'à son délai ou par un bouton d'action : on la
// subissait par-dessus l'écran. `withTapToDismiss` enveloppe la fonction `notify` : chaque
// notification reçoit un `onClick` (Quasar étale `attrs` sur son élément) qui appelle la
// fonction de fermeture qu'elle a elle-même rendue. Pur : la fonction enveloppée est
// injectée, donc testable sans Quasar.

type NotifyOpts = Record<string, unknown> & { attrs?: Record<string, unknown> };
type NotifyFn = (opts: NotifyOpts | string) => (props?: unknown) => void;

export function withTapToDismiss<F extends NotifyFn>(notify: F): F {
  const wrapped = ((opts: NotifyOpts | string) => {
    const o: NotifyOpts = typeof opts === 'string' ? { message: opts } : { ...opts };
    // La fermeture n'existe qu'une fois la notification créée : le clic la lit plus tard.
    const handle: { close?: (props?: unknown) => void } = {};
    const prev = o.attrs?.onClick as ((e: unknown) => void) | undefined;
    o.attrs = {
      ...o.attrs,
      // ⚠️ On garde un onClick éventuel de l'appelant : on ajoute, on ne remplace pas.
      onClick: (e: unknown) => {
        prev?.(e);
        handle.close?.();
      },
    };
    handle.close = notify(o);
    return handle.close;
  }) as F;
  // `setDefaults` / `registerType` vivent sur la fonction : ils doivent survivre.
  return Object.assign(wrapped, notify);
}
