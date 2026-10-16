// restNotify.ts — la notification « Repos terminé » (pur, testé).
//
// LIMITE RÉELLE (à ne pas oublier) : c'est une notification LOCALE, déclenchée par un
// `setTimeout` de la page. Elle part tant que la page vit — onglet en arrière-plan,
// autre appli au premier plan sur un PWA installé. Si le navigateur SUSPEND ou tue la
// page (écran verrouillé longtemps sur iOS, économiseur de batterie Android), le timer
// ne part pas et la notification non plus : les « Notification Triggers » (envoi
// programmé par le système) ne sont plus disponibles dans les navigateurs, et un push
// serveur pour 90 s de repos serait disproportionné. Au retour dans l'app, le timer se
// recale sur l'heure de fin réelle (il ne dérive plus quand la page était figée).

export const REST_NOTIFY_KEY = 'muscu:live:restnotify';

export interface RestNotice {
  title: string;
  body: string;
  tag: string;
}

/** Le texte de la notification : « Repos terminé — Squat, série 3 ». */
export function restNotice(exerciseName: string, setLabel: string): RestNotice {
  return {
    title: 'Repos terminé',
    body: `${exerciseName}, ${setLabel}`,
    // Même tag → une notification de repos en remplace une autre au lieu de s'empiler.
    tag: 'muscu-rest',
  };
}

export type NotifPermission = 'granted' | 'denied' | 'default' | 'unsupported';

/** Doit-on DEMANDER la permission maintenant ? Seulement si le joueur n'a pas coupé
 *  l'alerte, que le navigateur sait faire, et qu'il n'a ni accordé ni refusé. */
export function shouldAskPermission(perm: NotifPermission, pref: string | null): boolean {
  return perm === 'default' && pref !== '0';
}

/** Faut-il programmer l'alerte pour ce repos ? Permission accordée ET réglage pas coupé. */
export function shouldSchedule(perm: NotifPermission, pref: string | null): boolean {
  return perm === 'granted' && pref !== '0';
}

/** Secondes restantes d'après l'heure de FIN (et non un compteur décrémenté : un
 *  `setInterval` d'onglet en arrière-plan est ralenti, le compteur prenait du retard). */
export function secondsLeft(endAt: number, now: number): number {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}
