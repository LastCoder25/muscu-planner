import { computed } from 'vue';
import { useLogsStore } from '@/stores/logs';
import { useCardioStore } from '@/stores/cardio';
import { useChallengesStore } from '@/stores/challenges';
import { useComboStore } from '@/stores/combo';
import { useCharacterStore } from '@/stores/character';
import { sessionXp, otherSportXp, cardioSessionXp, REP_XP, assistMult } from '@/lib/athlete';
import { challengeDayXp } from '@/lib/challenges';
import { legSets } from '@/lib/combo';
import { dailyLoginEnergy } from '@/lib/loginStreak';
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
 *  connexion, expéditions), sur les `nDays` derniers jours (aujourd'hui inclus), du plus
 *  récent au plus ancien. `getLevel` = niveau global (pour estimer le bonus de connexion).
 *  Lit les stores déjà chargés. NB : certaines sources hors-sport ne sont pas horodatées
 *  (Dynamo de faille, montées de niveau) → non ventilables par jour ; elles restent dans
 *  le solde global mais n'apparaissent pas ici. */
export function useEnergyHistory(getLevel: () => number, nDays = 3) {
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
    // Défi 360 : l'énergie de tous les exos d'un jour regroupée en une ligne.
    for (const c of combo.list) {
      const perDay = new Map<string, number>();
      for (const leg of c.legs) {
        for (const s of legSets(leg)) {
          if (!s.date) continue;
          const reps = s.reps || 0;
          let xp = reps * REP_XP * (leg.rep_weight || 1) * assistMult(s.assisted);
          if (s.weight) xp += (reps * s.weight) / 500;
          perDay.set(s.date, (perDay.get(s.date) ?? 0) + xp);
        }
      }
      for (const [date, xp] of perDay) push(date, '🎯', 'Défi 360', xp);
    }

    // ── HORS-SPORT (datables) ──
    const row = char.row;
    // Bonus de connexion quotidien (dernier claim = last_login_date).
    if (row?.last_login_date) {
      push(
        row.last_login_date,
        '🎁',
        'Bonus de connexion',
        dailyLoginEnergy(row.login_streak, getLevel()),
      );
    }
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
