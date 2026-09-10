// 🔔 ABONNEMENT AUX NOTIFICATIONS PUSH + synchronisation des messages programmés.
//
// ⚠️ Le CLIENT PLANIFIE, le SERVEUR POSTE (règle v0.661). Ce fichier écrit dans
// `scheduled_pushes` ce que `planPushes` a décidé ; le poussoir ne fait que l'envoyer.

import { ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { planPushes, type PushContext } from '@/lib/push';

/** ⚠️ PUBLIQUE PAR NATURE — le navigateur la reçoit et le service de push aussi. Elle
 *  est ici plutôt que dans une variable d'environnement pour une raison précise : une
 *  variable oubliée sur Vercel casserait le push EN SILENCE, sans erreur ni test rouge.
 *  Sa moitié PRIVÉE vit dans les secrets Supabase et n'existe nulle part dans ce dépôt. */
const VAPID_PUBLIC =
  'BDu_9GgZb7aUdqiiaiyaEQ1NqtCIwUHa_2uRvSRIQ49D5I9j6F4W0fASGp7-i3AvwIxw5t4YJIKEWacPViWeu6Y';

/** ⚠️ On alloue un `ArrayBuffer` EXPLICITE : `Uint8Array.from` rend un
 *  `Uint8Array<ArrayBufferLike>`, que `applicationServerKey` refuse (il veut un
 *  `BufferSource` adossé à un vrai `ArrayBuffer`, pas un `SharedArrayBuffer`). */
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const view = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

/** Le navigateur sait-il faire ? ⚠️ Sur iOS, UNIQUEMENT si l'app a été ajoutée à
 *  l'écran d'accueil — Safari refuse le push depuis un simple onglet. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Pourquoi ça n'a pas marché. ⚠️ On rend une RAISON et non un booléen : un bouton qui
 *  échoue en silence est le pire cas — c'est exactement ce qui s'est produit à la
 *  livraison, l'utilisateur cliquait et il ne se passait littéralement rien. */
export type PushFail = 'unsupported' | 'denied' | 'blocked' | 'no_sw' | 'subscribe' | 'db' | 'ok';

/** Le service worker, enregistré au besoin, avec une LIMITE DE TEMPS.
 *  ⚠️ `navigator.serviceWorker.ready` ne se résout JAMAIS s'il n'y a aucun enregistrement
 *  actif — et `boot/pwa.ts` avale les échecs d'enregistrement (`.catch(() => undefined)`)
 *  et ne l'enregistre qu'en PRODUCTION. Sans cette limite, le bouton restait bloqué en
 *  « occupé » pour toujours, sans un mot. */
async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const existante = await navigator.serviceWorker.getRegistration();
    if (!existante) await navigator.serviceWorker.register('/pwa-sw.js');
  } catch {
    return null;
  }
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 8000)),
  ]);
}

const busy = ref(false);
const enabled = ref(false);

export function usePush() {
  async function refresh() {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    enabled.value = !!(await reg?.pushManager.getSubscription());
  }

  /** Demande la permission, s'abonne, enregistre l'appareil. Rend la RAISON de
   *  l'échec le cas échéant — jamais un simple `false` muet. */
  async function enable(userId: string): Promise<PushFail> {
    if (!pushSupported()) return 'unsupported';
    if (busy.value) return 'ok';
    busy.value = true;
    try {
      // ⚠️ Une permission REFUSÉE une fois ne re-demande plus rien : le navigateur
      // renvoie 'denied' sans afficher la moindre invite. Il faut le dire, sinon le
      // clic paraît sans effet.
      if (Notification.permission === 'denied') return 'blocked';
      if ((await Notification.requestPermission()) !== 'granted') return 'denied';
      const reg = await readyRegistration();
      if (!reg) return 'no_sw';
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true, // exigé par les navigateurs : pas de push silencieux
            applicationServerKey: b64ToBytes(VAPID_PUBLIC),
          });
        } catch (e) {
          console.error('push subscribe', e);
          return 'subscribe';
        }
      }
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
      if (!j.endpoint || !j.keys) return 'subscribe';
      // ⚠️ Upsert sur `endpoint` : le navigateur peut re-souscrire au MÊME sans
      // prévenir, et deux lignes identiques enverraient deux fois chaque message.
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
          { onConflict: 'endpoint' },
        );
      if (error) {
        console.error('push upsert', error);
        return 'db';
      }
      enabled.value = true;
      return 'ok';
    } catch (e) {
      // Filet : sans lui, la moindre exception laissait le bouton sans réaction.
      console.error('push enable', e);
      return 'subscribe';
    } finally {
      busy.value = false;
    }
  }
  async function disable(): Promise<void> {
    if (!pushSupported() || busy.value) return;
    busy.value = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        // On retire la ligne AVANT de désabonner : si l'ordre était inverse et que la
        // suppression échouait, le serveur continuerait d'écrire vers un endpoint mort.
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      enabled.value = false;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Aligne les messages programmés sur l'état du jeu.
   *
   * ⚠️ Deux moitiés, et la seconde compte autant : on ÉCRIT ce qui doit exister, et on
   * EFFACE ce qui n'a plus lieu d'être. Sans l'effacement, un convoi récupéré en avance
   * ou un siège repoussé (l'échéance l'est pendant l'inactivité) déclencherait une
   * alerte pour un événement qui n'existe plus.
   */
  async function sync(userId: string, ctx: PushContext, now = Date.now()): Promise<void> {
    if (!enabled.value) return;
    const plans = planPushes(ctx, now);
    const vivantes = plans.map((p) => p.dedupe);

    if (plans.length) {
      await supabase.from('scheduled_pushes').upsert(
        plans.map((p) => ({
          user_id: userId,
          kind: p.kind,
          dedupe: p.dedupe,
          send_at: new Date(p.sendAt).toISOString(),
          title: p.title,
          body: p.body,
          url: p.url,
          sent_at: null,
        })),
        { onConflict: 'user_id,dedupe' },
      );
    }
    // Les lignes PAS ENCORE ENVOYÉES qui ne correspondent plus à rien.
    // ⚠️ On ne touche jamais aux lignes déjà envoyées : elles sont l'historique.
    let q = supabase.from('scheduled_pushes').delete().eq('user_id', userId).is('sent_at', null);
    if (vivantes.length) q = q.not('dedupe', 'in', `(${vivantes.map((d) => `"${d}"`).join(',')})`);
    await q;
  }

  return { enabled, busy, refresh, enable, disable, sync };
}
