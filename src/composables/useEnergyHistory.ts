import { computed } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useCardioStore } from '@/stores/cardio';
import { useChallengesStore } from '@/stores/challenges';
import { useComboStore } from '@/stores/combo';
import { useCharacterStore } from '@/stores/character';
import { sessionXp, otherSportXp, cardioSessionXp } from '@/lib/athlete';
import { challengeDayXp } from '@/lib/challenges';
import { comboXpByDay } from '@/lib/combo';
import { ACTIVITY_LABELS, isCardioOutingChallenge } from '@/data/cardio';

// Énergie de FOND (sport) : muscu + cardio + autre sport + défis muscu/cardio. Le
// tennis/prépa/crossfit… comptent leur XP mais PAS l'énergie (mêmes règles que l'Agenda).
const SPECIFIQUE_DISC = new Set(['crossfit', 'hyrox', 'mobilite', 'prepa_physique']);

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export interface EnergyItem {
  emoji: string;
  label: string;
  energy: number; // ⚡ gagnés par cette source ce jour-là
}
export interface EnergyDay {
  date: string; // YYYY-MM-DD
  label: string; // « Aujourd'hui » / « Hier » / « lun. 1 sept. »
  earned: number; // total ⚡ du jour (toutes sources datables)
  items: EnergyItem[]; // détail par source (énergie décroissante)
}

/** Énergie GAGNÉE par jour + le DÉTAIL par source (sport ET hors-sport : bonus de
 *  connexion, montées de niveau, Dynamo de faille, expéditions), sur les `nDays`
 *  derniers jours (aujourd'hui inclus), du plus récent au plus ancien. Le hors-sport
 *  vient du journal `energy_log` (migr. 0057, horodaté à chaque gain) ; les expéditions
 *  (mines) restent dérivées des messages (déjà horodatés). Lit les stores déjà chargés. */
export function useEnergyHistory(nDays = 3) {
  const logs = useLogsStore();
  const cardio = useCardioStore();
  const challenges = useChallengesStore();
  const combo = useComboStore();
  const char = useCharacterStore();

  return computed<EnergyDay[]>(() => {
    const dayItems = new Map<string, EnergyItem[]>();
    const push = (day: string, emoji: string, label: string, e: number) => {
      const energy = Math.round(e);
      if (energy <= 0) return;
      const arr = dayItems.get(day) ?? dayItems.set(day, []).get(day)!;
      arr.push({ emoji, label, energy });
    };

    // ── SPORT ──
    // Séances muscu / autre sport (les disciplines « spécifiques » ne donnent pas d'énergie).
    for (const r of logs.all) {
      const disc = r.payload.discipline ?? 'musculation';
      if (SPECIFIQUE_DISC.has(disc)) continue;
      const day = isoDay(new Date(Date.parse(r.performed_at)));
      if (disc === 'autre_sport') {
        push(
          day,
          '🤸',
          r.payload.name || 'Autre sport',
          otherSportXp(r.payload.duration_min ?? 0, r.payload.name),
        );
      } else {
        push(day, '🏋️', r.payload.name || 'Séance', sessionXp(r.payload));
      }
    }
    // Sorties cardio MANUELLES (les miroirs de défi comptent via le défi, pas ici).
    for (const r of cardio.logs) {
      if (r.payload.challenge_id) continue;
      const day = isoDay(new Date(Date.parse(r.performed_at)));
      push(day, '🏃', ACTIVITY_LABELS[r.payload.activity] ?? 'Cardio', cardioSessionXp(r.payload));
    }
    // Défis (hors vraies sorties cardio, déjà couvertes ci-dessus), jour par jour.
    for (const c of challenges.list) {
      if (isCardioOutingChallenge(c)) continue;
      for (const p of c.progress) {
        if (p.done > 0) push(p.date, '🏆', c.exercise_name, challengeDayXp(c, p));
      }
    }
    // Défi 360 : ventilation par jour via la lib (effort au prorata des séries + PRIME
    // de bouclage isolée sur le dernier jour). La somme colle à comboXpPoints — l'ancien
    // calcul local oubliait × XP_MULT, la durée impliquée ET la prime (≈ 10× trop bas).
    for (const c of combo.list) {
      for (const d of comboXpByDay(c)) {
        push(d.date, '🎯', 'Défi 360', d.effort);
        push(d.date, '🏅', 'Défi 360 — prime de bouclage', d.bonus);
      }
    }

    // ── HORS-SPORT ──
    const row = char.row;
    // Journal d'énergie (bonus de connexion, montées de niveau, Dynamo de faille…).
    for (const e of row?.energy_log ?? []) push(e.date, e.emoji, e.label, e.amount);
    // Expéditions (mines) : messages horodatés portant de l'énergie.
    for (const m of row?.messages ?? []) {
      if (m.energy > 0) push(isoDay(new Date(m.resolvedAt)), '⛏️', 'Expédition (mine)', m.energy);
    }

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const out: EnergyDay[] = [];
    for (let i = 0; i < nDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const date = isoDay(d);
      const items = (dayItems.get(date) ?? []).sort((a, b) => b.energy - a.energy);
      const label =
        i === 0
          ? "Aujourd'hui"
          : i === 1
            ? 'Hier'
            : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
      out.push({
        date,
        label,
        items,
        earned: items.reduce((a, it) => a + it.energy, 0),
      });
    }
    return out;
  });
}
