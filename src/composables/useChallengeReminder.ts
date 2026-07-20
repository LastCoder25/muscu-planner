// Rappel quotidien des challenges quand l'app est ouverte (pas de push hors-ligne).
// Pour chaque défi actif avec une heure de rappel : notif si le jour n'est pas
// encore validé et que l'heure est passée (une fois/jour/défi).
import { onMounted, onBeforeUnmount } from 'vue';
import { useChallengesStore } from '@/stores/challenges';
import { challengeStats } from '@/lib/challenges';

const NOTIFIED_PREFIX = 'muscu:challenge:notified:'; // + id → 'YYYY-MM-DD'

export function useChallengeReminder() {
  const store = useChallengesStore();
  let timer: ReturnType<typeof setInterval> | undefined;

  function check() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    for (const c of store.list) {
      if (c.status !== 'active') continue;
      const time = c.config?.reminder_time;
      if (!time) continue;
      const st = challengeStats(c, today);
      if (st.dayIndex < 0 || st.dayIndex >= c.duration_days || st.isDoneToday) continue;
      const [hh, mm] = time.split(':').map(Number);
      if (now.getHours() * 60 + now.getMinutes() < (hh ?? 0) * 60 + (mm ?? 0)) continue;
      const key = NOTIFIED_PREFIX + c.id;
      if (localStorage.getItem(key) === today) continue;
      localStorage.setItem(key, today);
      new Notification('Challenge', { body: `${c.exercise_name} — objectif du jour à faire 💪` });
    }
  }

  onMounted(async () => {
    try { if (store.list.length === 0) await store.fetchMine(); } catch { /* pas connecté / silencieux */ }
    check();
    timer = setInterval(check, 60_000);
  });
  onBeforeUnmount(() => clearInterval(timer));
}
