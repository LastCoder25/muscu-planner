// Rappel de saisie corporelle quand l'app est ouverte (pas de push hors-ligne).
// Vérifie périodiquement : jour planifié + heure passée + pas déjà saisi/notifié
// aujourd'hui → notification navigateur (si permission accordée).
import { onMounted, onBeforeUnmount } from 'vue';
import { useProfileStore } from '@/stores/profile';

const LAST_ENTRY_KEY = 'muscu:body:lastEntry';   // 'YYYY-MM-DD' de la dernière saisie
const NOTIFIED_KEY = 'muscu:body:notified';      // 'YYYY-MM-DD' du dernier rappel envoyé

export function markBodyEntrySaved(date: string) {
  localStorage.setItem(LAST_ENTRY_KEY, date);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Le jour est-il planifié aujourd'hui selon la fréquence/jour choisis ?
function scheduledToday(freq: string, day: number | undefined): boolean {
  const now = new Date();
  if (freq === 'day') return true;
  if (freq === 'week') return now.getDay() === (day ?? 1);
  if (freq === 'month') return now.getDate() === (day ?? 1);
  return false;
}

export function useBodyReminder() {
  const profileStore = useProfileStore();
  let timer: ReturnType<typeof setInterval> | undefined;

  function check() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const pref = profileStore.profile?.preferences;
    if (!pref?.tracking_time) return; // rappels non configurés
    const freq = pref.tracking_frequency ?? 'week';
    if (!scheduledToday(freq, pref.tracking_day)) return;

    const now = new Date();
    const [hh, mm] = pref.tracking_time.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < (hh ?? 0) * 60 + (mm ?? 0)) return;

    const today = todayStr();
    if (localStorage.getItem(LAST_ENTRY_KEY) === today) return;   // déjà saisi
    if (localStorage.getItem(NOTIFIED_KEY) === today) return;      // déjà rappelé
    localStorage.setItem(NOTIFIED_KEY, today);
    new Notification('Suivi corporel', { body: 'C’est l’heure de ta saisie 💪' });
  }

  onMounted(() => {
    check();
    timer = setInterval(check, 60_000);
  });
  onBeforeUnmount(() => clearInterval(timer));
}
